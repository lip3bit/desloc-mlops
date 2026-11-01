"""Fixtures compartilhadas: Databricks simulado via `httpx.MockTransport` (sem rede)."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.inference import ClienteDatabricks
from app.main import create_app
from app.prediction_log import RegistroPrevisoes

HOST = "https://workspace-teste.cloud.databricks.com"
ENDPOINT = "desloc-corrida"
URL_INVOCACOES = f"{HOST}/serving-endpoints/{ENDPOINT}/invocations"
URL_ENDPOINT = f"{HOST}/api/2.0/serving-endpoints/{ENDPOINT}"

PEDIDO_VALIDO = {
    "origem": {"lat": -23.5614, "lon": -46.6559},
    "destino": {"lat": -23.5874, "lon": -46.6576},
    "datahora_solicitacao": "2026-11-03T08:15:00-03:00",
}


def cabecalhos_falsos() -> dict[str, str]:
    return {"Authorization": "Bearer token-de-teste"}


class DatabricksFalso:
    """Simula os endpoints REST usados pela API e registra as chamadas recebidas."""

    def __init__(self) -> None:
        self.respostas_invocacao: list[httpx.Response | Exception] = []
        self.resposta_endpoint: httpx.Response | Exception = httpx.Response(
            200, json={"name": ENDPOINT, "config": {"served_entities": [{"entity_version": "3"}]}}
        )
        self.invocacoes: list[dict] = []
        self.cabecalhos_recebidos: list[httpx.Headers] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.cabecalhos_recebidos.append(request.headers)
        url = str(request.url)
        if request.method == "POST" and url == URL_INVOCACOES:
            self.invocacoes.append(json.loads(request.content))
            item = self.respostas_invocacao.pop(0) if len(self.respostas_invocacao) > 1 else self.respostas_invocacao[0]
            if isinstance(item, Exception):
                raise item
            return item
        if request.method == "GET" and url == URL_ENDPOINT:
            if isinstance(self.resposta_endpoint, Exception):
                raise self.resposta_endpoint
            return self.resposta_endpoint
        return httpx.Response(404, json={"error_code": "NOT_FOUND"})


@pytest.fixture(autouse=True)
def sdk_sem_rede(monkeypatch):
    """Impede a sondagem de metadados do host que o Databricks SDK faz ao criar `Config`."""
    import databricks.sdk.config as config_sdk

    def _sem_rede(*_args, **_kwargs):
        raise RuntimeError("rede desabilitada nos testes")

    monkeypatch.setattr(config_sdk, "get_host_metadata", _sem_rede)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        databricks_host=HOST,
        databricks_token=None,
        databricks_config_profile=None,
        databricks_endpoint=ENDPOINT,
        cors_origins="http://localhost:5173",
        prediction_log_path=str(tmp_path / "logs" / "previsoes.jsonl"),
    )


@pytest.fixture
def databricks() -> DatabricksFalso:
    return DatabricksFalso()


@pytest.fixture
def fabrica_cliente(settings: Settings, databricks: DatabricksFalso):
    """Cria um `TestClient` com Databricks simulado; o provedor de cabeçalhos pode ser trocado."""
    abertos: list[TestClient] = []

    def _criar(provedor: Callable[[], dict[str, str]] = cabecalhos_falsos) -> TestClient:
        cliente = ClienteDatabricks(
            settings,
            provedor_cabecalhos=provedor,
            transport=httpx.MockTransport(databricks),
            tempo_total_s=5.0,
            backoff_inicial_s=0.0,
            backoff_maximo_s=0.0,
            max_tentativas=3,
        )
        app = create_app(settings, cliente=cliente, registro=RegistroPrevisoes(settings.prediction_log_path))
        tc = TestClient(app)
        tc.__enter__()
        abertos.append(tc)
        return tc

    yield _criar
    for tc in abertos:
        tc.__exit__(None, None, None)


@pytest.fixture
def api(fabrica_cliente) -> TestClient:
    return fabrica_cliente()
