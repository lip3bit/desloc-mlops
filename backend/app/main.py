"""Aplicação FastAPI do simulador DESLOC."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.features import haversine_km, montar_registro_modelo, periodo
from app.inference import ClienteDatabricks, ErroInferencia
from app.prediction_log import RegistroPrevisoes
from app.schemas import Erro, EstimativaRequest, EstimativaResponse, Health, Modelo

logger = logging.getLogger("desloc.api")

DESCRICAO = (
    "Backend do simulador DESLOC. Recebe origem, destino e (opcionalmente) a data/hora da "
    "solicitação, consulta o endpoint de Model Serving do Databricks via REST e devolve o "
    "preço e a duração estimados."
)


def _caminho_campo(loc: tuple | list) -> str:
    partes = [str(p) for p in loc if p != "body"]
    return ".".join(partes) or "corpo"


def _mensagem_erro(erro: dict[str, Any]) -> str:
    """Traduz um erro de validação do pydantic para português."""
    tipo = erro.get("type", "")
    ctx = erro.get("ctx") or {}
    campo = _caminho_campo(erro.get("loc", ()))
    if tipo == "missing":
        return f"{campo}: campo obrigatório"
    if tipo == "greater_than_equal":
        return f"{campo}: deve ser maior ou igual a {ctx.get('ge')}"
    if tipo == "less_than_equal":
        return f"{campo}: deve ser menor ou igual a {ctx.get('le')}"
    if tipo in ("float_parsing", "float_type", "finite_number"):
        return f"{campo}: deve ser um número válido"
    if tipo.startswith("datetime") or tipo.startswith("date_"):
        return f"{campo}: data/hora inválida (use ISO 8601, ex.: 2026-11-03T08:15:00-03:00)"
    if tipo in ("model_type", "model_attributes_type", "dict_type"):
        return f"{campo}: deve ser um objeto"
    if tipo == "json_invalid":
        return "corpo da requisição não é um JSON válido"
    if tipo == "value_error":
        mensagem = str(ctx.get("error") or erro.get("msg", "valor inválido"))
        return mensagem.removeprefix("Value error, ")
    return f"{campo}: valor inválido"


def create_app(
    settings: Settings | None = None,
    cliente: ClienteDatabricks | None = None,
    registro: RegistroPrevisoes | None = None,
) -> FastAPI:
    """Cria a aplicação; dependências podem ser injetadas (útil em testes)."""
    settings = settings or get_settings()
    cliente = cliente or ClienteDatabricks(settings)
    registro = registro or RegistroPrevisoes(settings.prediction_log_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await cliente.fechar()

    app = FastAPI(
        title="DESLOC — API de estimativa de corrida",
        version="1.0.0",
        description=DESCRICAO,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.cliente = cliente
    app.state.registro = registro

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.lista_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    @app.exception_handler(RequestValidationError)
    async def _erro_validacao(_: Request, exc: RequestValidationError) -> JSONResponse:
        mensagens = list(dict.fromkeys(_mensagem_erro(e) for e in exc.errors()))
        return JSONResponse(status_code=422, content={"detail": "; ".join(mensagens) or "Entrada inválida"})

    @app.exception_handler(ErroInferencia)
    async def _erro_inferencia(_: Request, exc: ErroInferencia) -> JSONResponse:
        return JSONResponse(status_code=exc.status_http, content={"detail": exc.mensagem})

    @app.get(
        "/api/health",
        response_model=Health,
        summary="Situação da API e da configuração de inferência",
        tags=["saúde"],
    )
    async def health() -> Health:
        configurado = await cliente.configurado()
        return Health(
            status="ok" if configurado else "misconfigured",
            endpoint=cliente.endpoint,
            inferencia_configurada=configurado,
        )

    @app.post(
        "/api/v1/estimativa",
        response_model=EstimativaResponse,
        summary="Estima preço e duração de uma corrida",
        tags=["estimativa"],
        responses={
            422: {"model": Erro, "description": "Entrada inválida (coordenadas fora da faixa, origem igual ao destino, etc.)"},
            502: {"model": Erro, "description": "Resposta inválida ou erro do serviço de inferência"},
            503: {"model": Erro, "description": "Serviço de inferência indisponível ou iniciando (scale-to-zero)"},
        },
    )
    async def estimativa(pedido: EstimativaRequest) -> EstimativaResponse:
        datahora = pedido.datahora_solicitacao
        registro_modelo = montar_registro_modelo(
            pedido.origem.lat, pedido.origem.lon, pedido.destino.lat, pedido.destino.lon, datahora
        )
        distancia_local = haversine_km(
            pedido.origem.lat, pedido.origem.lon, pedido.destino.lat, pedido.destino.lon
        )

        inicio = time.perf_counter()
        tarefa_versao = asyncio.create_task(cliente.obter_versao())
        try:
            previsao = await cliente.prever(registro_modelo)
        except BaseException:
            tarefa_versao.cancel()
            raise
        latencia_ms = (time.perf_counter() - inicio) * 1000
        versao = await tarefa_versao

        distancia = previsao.distancia_km if previsao.distancia_km is not None else distancia_local
        resposta = EstimativaResponse(
            valor_previsto=round(previsao.valor_previsto, 2),
            duracao_estimada_min=round(previsao.duracao_estimada_min, 1),
            distancia_km=round(distancia, 2),
            moeda="BRL",
            modelo=Modelo(endpoint=cliente.endpoint, versao=versao),
            datahora_solicitacao=datahora,
        )

        await asyncio.to_thread(
            registro.registrar,
            requisicao=pedido.model_dump(mode="json"),
            resposta=resposta.model_dump(mode="json"),
            endpoint=cliente.endpoint,
            versao=versao,
            latencia_ms=latencia_ms,
            features={
                **registro_modelo,
                "distancia_km_local": round(distancia_local, 4),
                "hora": datahora.hour,
                "periodo": periodo(datahora.hour),
                "dia_semana": datahora.weekday(),
            },
        )
        return resposta

    return app


app = create_app()
