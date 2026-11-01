"""Cliente REST do Model Serving do Databricks.

A autenticação usa `databricks.sdk.core.Config`, que resolve token (produção) ou
perfil OAuth do `~/.databrickscfg` (uso local). Nenhum token é registrado em log
nem devolvido ao cliente da API.
"""

from __future__ import annotations

import asyncio
import email.utils
import logging
import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("desloc.inferencia")

MENSAGEM_INICIANDO = "O modelo está iniciando no Databricks, tente novamente em instantes"
MENSAGEM_NAO_CONFIGURADO = "Inferência não configurada: verifique as credenciais do Databricks"

STATUS_RETENTAVEIS = {429, 503, 504}
ERROS_RETENTAVEIS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.RemoteProtocolError,
)


class ErroInferencia(Exception):
    """Erro base da camada de inferência; `mensagem` é segura para o cliente da API."""

    status_http = 502

    def __init__(self, mensagem: str) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem


class InferenciaNaoConfigurada(ErroInferencia):
    """Não foi possível montar as credenciais do Databricks."""

    status_http = 503


class ServicoIndisponivel(ErroInferencia):
    """Endpoint indisponível ou iniciando (scale-to-zero) mesmo após as novas tentativas."""

    status_http = 503


class ErroUpstream(ErroInferencia):
    """Resposta inesperada ou erro não recuperável do Databricks."""

    status_http = 502


@dataclass(frozen=True)
class Previsao:
    """Saída normalizada do modelo."""

    valor_previsto: float
    duracao_estimada_min: float
    distancia_km: float | None


# --------------------------------------------------------------------------- autenticação


class AutenticacaoDatabricks:
    """Gera os cabeçalhos HTTP de autenticação a partir do Databricks SDK."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._config: Any = None
        self._lock = threading.Lock()

    def _obter_config(self) -> Any:
        with self._lock:
            if self._config is None:
                from databricks.sdk.core import Config

                # O SDK consulta `/.well-known/databricks-config` ao iniciar; limita o tempo
                # para não travar a API caso o workspace esteja inacessível.
                kwargs: dict[str, Any] = {
                    "host": self._settings.host_normalizado,
                    "http_timeout_seconds": 10,
                    "retry_timeout_seconds": 20,
                }
                if self._settings.token:
                    # Em produção o token tem precedência; evita conflito com o perfil.
                    kwargs["token"] = self._settings.token
                    kwargs["auth_type"] = "pat"
                elif self._settings.perfil:
                    kwargs["profile"] = self._settings.perfil
                self._config = Config(**kwargs)
            return self._config

    def __call__(self) -> dict[str, str]:
        try:
            cabecalhos = self._obter_config().authenticate()
        except Exception as exc:  # noqa: BLE001 - qualquer falha do SDK significa "não configurado"
            logger.warning("Falha ao montar autenticação do Databricks: %s", type(exc).__name__)
            raise InferenciaNaoConfigurada(MENSAGEM_NAO_CONFIGURADO) from None
        if not cabecalhos:
            raise InferenciaNaoConfigurada(MENSAGEM_NAO_CONFIGURADO)
        return dict(cabecalhos)


# --------------------------------------------------------------------------- parsing


def _para_float(valor: Any, campo: str) -> float:
    if isinstance(valor, list | tuple) and len(valor) == 1:
        valor = valor[0]
    if isinstance(valor, bool):
        raise ErroUpstream(f"Resposta do modelo inválida: campo '{campo}' não é numérico")
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ErroUpstream(f"Resposta do modelo inválida: campo '{campo}' não é numérico") from None
    if not math.isfinite(numero):
        raise ErroUpstream(f"Resposta do modelo inválida: campo '{campo}' não é finito")
    return numero


def interpretar_predicoes(corpo: Any) -> Previsao:
    """Normaliza o campo `predictions` do Model Serving.

    Formatos aceitos:
    - lista de registros: ``[{"valor_previsto": ..., "duracao_estimada_min": ..., "distancia_km": ...}]``
    - dicionário coluna→lista: ``{"valor_previsto": [..], "duracao_estimada_min": [..]}``
    - lista de números: interpretada apenas como `valor_previsto` (sem duração → erro 502).
    """
    if not isinstance(corpo, dict) or "predictions" not in corpo:
        raise ErroUpstream("Resposta do modelo inválida: campo 'predictions' ausente")
    predicoes = corpo["predictions"]

    registro: dict[str, Any]
    if isinstance(predicoes, list):
        if not predicoes:
            raise ErroUpstream("Resposta do modelo inválida: lista de previsões vazia")
        primeiro = predicoes[0]
        if isinstance(primeiro, dict):
            registro = primeiro
        elif isinstance(primeiro, int | float) and not isinstance(primeiro, bool):
            raise ErroUpstream(
                "Resposta do modelo incompleta: apenas o valor previsto foi retornado, "
                "sem a duração estimada"
            )
        else:
            raise ErroUpstream("Resposta do modelo em formato não reconhecido")
    elif isinstance(predicoes, dict):
        registro = {}
        for chave, valor in predicoes.items():
            if isinstance(valor, list):
                if not valor:
                    continue
                registro[chave] = valor[0]
            elif isinstance(valor, dict):
                # formato pandas "dict" (coluna → {índice: valor})
                if valor:
                    registro[chave] = next(iter(valor.values()))
            else:
                registro[chave] = valor
    else:
        raise ErroUpstream("Resposta do modelo em formato não reconhecido")

    if "valor_previsto" not in registro:
        raise ErroUpstream("Resposta do modelo incompleta: campo 'valor_previsto' ausente")
    if "duracao_estimada_min" not in registro:
        raise ErroUpstream("Resposta do modelo incompleta: campo 'duracao_estimada_min' ausente")

    distancia: float | None = None
    if registro.get("distancia_km") is not None:
        try:
            distancia = _para_float(registro["distancia_km"], "distancia_km")
        except ErroUpstream:
            distancia = None

    return Previsao(
        valor_previsto=_para_float(registro["valor_previsto"], "valor_previsto"),
        duracao_estimada_min=_para_float(registro["duracao_estimada_min"], "duracao_estimada_min"),
        distancia_km=distancia,
    )


def extrair_versao(corpo: Any) -> str | None:
    """Extrai a versão servida do retorno de `GET /api/2.0/serving-endpoints/{nome}`."""
    if not isinstance(corpo, dict):
        return None
    config = corpo.get("config") or {}
    for chave_lista, chave_versao in (("served_entities", "entity_version"), ("served_models", "model_version")):
        itens = config.get(chave_lista) or []
        if itens and isinstance(itens[0], dict) and itens[0].get(chave_versao) is not None:
            return str(itens[0][chave_versao])
    return None


def _segundos_retry_after(resposta: httpx.Response) -> float | None:
    valor = resposta.headers.get("retry-after")
    if not valor:
        return None
    try:
        return max(0.0, float(valor))
    except ValueError:
        pass
    try:
        data = email.utils.parsedate_to_datetime(valor)
        return max(0.0, data.timestamp() - time.time())
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- cliente


class ClienteDatabricks:
    """Invoca o endpoint de Model Serving com novas tentativas para cold start."""

    def __init__(
        self,
        settings: Settings,
        provedor_cabecalhos: Callable[[], dict[str, str]] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        tempo_total_s: float = 120.0,
        backoff_inicial_s: float = 2.0,
        backoff_maximo_s: float = 15.0,
        max_tentativas: int = 8,
        ttl_versao_s: float = 300.0,
        ttl_versao_falha_s: float = 60.0,
        ttl_config_falha_s: float = 30.0,
    ) -> None:
        self.settings = settings
        self.endpoint = settings.databricks_endpoint
        self._host = settings.host_normalizado
        self._provedor = provedor_cabecalhos or AutenticacaoDatabricks(settings)
        self._transport = transport
        self._http: httpx.AsyncClient | None = None
        self.tempo_total_s = tempo_total_s
        self.backoff_inicial_s = backoff_inicial_s
        self.backoff_maximo_s = backoff_maximo_s
        self.max_tentativas = max_tentativas
        self._ttl_versao_s = ttl_versao_s
        self._ttl_versao_falha_s = ttl_versao_falha_s
        self._ttl_config_falha_s = ttl_config_falha_s
        self._versao: str | None = None
        self._versao_expira_em = 0.0
        self._versao_lock = asyncio.Lock()
        self._configurado: bool | None = None
        self._configurado_verificado_em = 0.0

    @property
    def url_invocacoes(self) -> str:
        return f"{self._host}/serving-endpoints/{self.endpoint}/invocations"

    @property
    def url_endpoint(self) -> str:
        return f"{self._host}/api/2.0/serving-endpoints/{self.endpoint}"

    def _cliente_http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(transport=self._transport, follow_redirects=False)
        return self._http

    async def fechar(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def _cabecalhos(self) -> dict[str, str]:
        try:
            cabecalhos = await asyncio.to_thread(self._provedor)
        except Exception as exc:  # noqa: BLE001
            self._configurado = False
            self._configurado_verificado_em = time.monotonic()
            if isinstance(exc, InferenciaNaoConfigurada):
                raise
            raise InferenciaNaoConfigurada(MENSAGEM_NAO_CONFIGURADO) from None
        self._configurado = True
        self._configurado_verificado_em = time.monotonic()
        return {**cabecalhos, "Content-Type": "application/json", "Accept": "application/json"}

    async def configurado(self) -> bool:
        """Indica se as credenciais podem ser montadas (resultado em cache)."""
        agora = time.monotonic()
        if self._configurado is True:
            return True
        if self._configurado is False and agora - self._configurado_verificado_em < self._ttl_config_falha_s:
            return False
        try:
            await asyncio.to_thread(self._provedor)
            self._configurado = True
        except Exception:  # noqa: BLE001
            self._configurado = False
        self._configurado_verificado_em = agora
        return self._configurado

    async def obter_versao(self) -> str | None:
        """Versão servida no endpoint, com cache; nunca lança exceção."""
        async with self._versao_lock:
            agora = time.monotonic()
            if agora < self._versao_expira_em:
                return self._versao
            try:
                cabecalhos = await self._cabecalhos()
                resposta = await self._cliente_http().get(
                    self.url_endpoint, headers=cabecalhos, timeout=httpx.Timeout(10.0)
                )
                resposta.raise_for_status()
                self._versao = extrair_versao(resposta.json())
                self._versao_expira_em = agora + self._ttl_versao_s
            except Exception as exc:  # noqa: BLE001 - a versão é informativa
                logger.info("Não foi possível obter a versão do endpoint: %s", type(exc).__name__)
                self._versao = None
                self._versao_expira_em = agora + self._ttl_versao_falha_s
            return self._versao

    async def prever(self, registro: dict[str, Any]) -> Previsao:
        """Envia um registro ao endpoint e devolve a previsão normalizada."""
        cabecalhos = await self._cabecalhos()
        payload = {"dataframe_records": [registro]}
        inicio = time.monotonic()
        prazo = inicio + self.tempo_total_s
        espera = self.backoff_inicial_s
        tentativa = 0
        ultimo_motivo = ""

        while True:
            tentativa += 1
            restante = prazo - time.monotonic()
            if restante <= 0:
                break
            timeout = httpx.Timeout(restante, connect=min(10.0, restante))
            try:
                resposta = await self._cliente_http().post(
                    self.url_invocacoes, json=payload, headers=cabecalhos, timeout=timeout
                )
            except ERROS_RETENTAVEIS as exc:
                ultimo_motivo = type(exc).__name__
                logger.warning("Tentativa %d falhou (%s)", tentativa, ultimo_motivo)
                proxima_espera = espera
            except httpx.HTTPError as exc:
                logger.warning("Erro de comunicação com o Databricks: %s", type(exc).__name__)
                raise ErroUpstream("Falha de comunicação com o serviço de inferência") from None
            else:
                if resposta.status_code in STATUS_RETENTAVEIS:
                    ultimo_motivo = f"HTTP {resposta.status_code}"
                    logger.warning("Tentativa %d recebeu %s", tentativa, ultimo_motivo)
                    retry_after = _segundos_retry_after(resposta)
                    proxima_espera = min(retry_after, self.backoff_maximo_s) if retry_after is not None else espera
                elif resposta.status_code >= 400:
                    raise self._erro_para_status(resposta)
                else:
                    try:
                        corpo = resposta.json()
                    except ValueError:
                        raise ErroUpstream("Resposta do modelo não é um JSON válido") from None
                    return interpretar_predicoes(corpo)

            if tentativa >= self.max_tentativas:
                break
            restante = prazo - time.monotonic()
            if restante <= 0:
                break
            await asyncio.sleep(min(proxima_espera, restante))
            espera = min(espera * 2 if espera > 0 else 0, self.backoff_maximo_s)

        logger.warning(
            "Endpoint %s indisponível após %d tentativas (%s)", self.endpoint, tentativa, ultimo_motivo
        )
        raise ServicoIndisponivel(MENSAGEM_INICIANDO)

    def _erro_para_status(self, resposta: httpx.Response) -> ErroInferencia:
        status = resposta.status_code
        # Registra apenas um trecho do corpo para diagnóstico; nunca os cabeçalhos.
        logger.warning("Databricks respondeu HTTP %d: %s", status, resposta.text[:300])
        if status in (401, 403):
            return ErroUpstream("Falha de autenticação no Databricks")
        if status == 404 and "not ready" in resposta.text.lower():
            # O Databricks responde 404 "not ready to serve traffic yet" enquanto o endpoint
            # é criado ou atualizado; tratamos como indisponibilidade temporária.
            return ServicoIndisponivel(MENSAGEM_INICIANDO)
        if status == 404:
            return ErroUpstream(f"Endpoint de inferência '{self.endpoint}' não encontrado")
        if status == 400:
            return ErroUpstream("O modelo rejeitou a requisição (HTTP 400)")
        return ErroUpstream(f"Erro no serviço de inferência (HTTP {status})")
