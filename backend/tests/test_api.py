import json
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.inference import MENSAGEM_INICIANDO, ErroUpstream, InferenciaNaoConfigurada, interpretar_predicoes
from app.prediction_log import RegistroPrevisoes
from tests.conftest import ENDPOINT, PEDIDO_VALIDO


def _ler_log(settings: Settings) -> list[dict]:
    caminho = Path(settings.prediction_log_path)
    if not caminho.exists():
        return []
    return [json.loads(linha) for linha in caminho.read_text(encoding="utf-8").splitlines()]


# --------------------------------------------------------------------------- caminho feliz


@pytest.mark.parametrize(
    "predictions",
    [
        [{"valor_previsto": 23.1234, "duracao_estimada_min": 11.26, "distancia_km": 2.9}],
        {"valor_previsto": [23.1234], "duracao_estimada_min": [11.26], "distancia_km": [2.9]},
    ],
    ids=["lista_de_registros", "dicionario_de_colunas"],
)
def test_estimativa_sucesso(api, databricks, settings, predictions):
    databricks.respostas_invocacao = [httpx.Response(200, json={"predictions": predictions})]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["valor_previsto"] == 23.12
    assert corpo["duracao_estimada_min"] == 11.3
    assert corpo["distancia_km"] == 2.9
    assert corpo["moeda"] == "BRL"
    assert corpo["modelo"] == {"endpoint": ENDPOINT, "versao": "3"}
    assert corpo["datahora_solicitacao"] == "2026-11-03T08:15:00-03:00"

    # payload enviado ao Model Serving
    assert databricks.invocacoes == [
        {
            "dataframe_records": [
                {
                    "latitude_origem": -23.5614,
                    "longitude_origem": -46.6559,
                    "latitude_destino": -23.5874,
                    "longitude_destino": -46.6576,
                    "datahora_solicitacao": "2026-11-03 08:15:00",
                }
            ]
        }
    ]
    assert databricks.cabecalhos_recebidos[0]["authorization"] == "Bearer token-de-teste"

    # registro para monitoramento
    linhas = _ler_log(settings)
    assert len(linhas) == 1
    linha = linhas[0]
    assert linha["endpoint"] == ENDPOINT and linha["versao"] == "3"
    assert linha["response"]["valor_previsto"] == 23.12
    assert linha["request"]["origem"] == PEDIDO_VALIDO["origem"]
    assert linha["latency_ms"] >= 0
    assert linha["features"]["periodo"] == 1
    assert "token" not in json.dumps(linha).lower()


def test_estimativa_converte_fuso_e_calcula_distancia_local(api, databricks):
    databricks.respostas_invocacao = [
        httpx.Response(200, json={"predictions": [{"valor_previsto": 30, "duracao_estimada_min": 15}]})
    ]
    pedido = {**PEDIDO_VALIDO, "datahora_solicitacao": "2026-11-03T20:00:00Z"}

    resposta = api.post("/api/v1/estimativa", json=pedido)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["datahora_solicitacao"] == "2026-11-03T17:00:00-03:00"
    assert corpo["distancia_km"] == pytest.approx(2.9, abs=0.01)  # haversine local
    assert databricks.invocacoes[0]["dataframe_records"][0]["datahora_solicitacao"] == "2026-11-03 17:00:00"


def test_estimativa_sem_datahora_usa_agora(api, databricks):
    databricks.respostas_invocacao = [
        httpx.Response(200, json={"predictions": [{"valor_previsto": 30, "duracao_estimada_min": 15}]})
    ]
    pedido = {k: v for k, v in PEDIDO_VALIDO.items() if k != "datahora_solicitacao"}

    resposta = api.post("/api/v1/estimativa", json=pedido)

    assert resposta.status_code == 200
    assert resposta.json()["datahora_solicitacao"].endswith("-03:00")


def test_versao_indisponivel_nao_quebra(api, databricks):
    databricks.respostas_invocacao = [
        httpx.Response(200, json={"predictions": [{"valor_previsto": 30, "duracao_estimada_min": 15}]})
    ]
    databricks.resposta_endpoint = httpx.Response(403, json={"error_code": "PERMISSION_DENIED"})

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 200
    assert resposta.json()["modelo"] == {"endpoint": ENDPOINT, "versao": None}


def test_retentativa_apos_cold_start(api, databricks):
    databricks.respostas_invocacao = [
        httpx.Response(503, text="scaling from zero"),
        httpx.Response(200, json={"predictions": [{"valor_previsto": 30, "duracao_estimada_min": 15}]}),
    ]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 200
    assert len(databricks.invocacoes) == 2


def test_falha_ao_gravar_log_nao_quebra(fabrica_cliente, databricks, settings, tmp_path, monkeypatch):
    bloqueio = tmp_path / "arquivo"
    bloqueio.write_text("x")
    # pai do log é um arquivo comum → mkdir falha
    monkeypatch.setattr(settings, "prediction_log_path", str(bloqueio / "previsoes.jsonl"))
    api = fabrica_cliente()
    databricks.respostas_invocacao = [
        httpx.Response(200, json={"predictions": [{"valor_previsto": 30, "duracao_estimada_min": 15}]})
    ]
    registro = RegistroPrevisoes(bloqueio / "previsoes.jsonl")
    assert registro.registrar(requisicao={}, resposta={}, endpoint="x", versao=None, latencia_ms=1) is False

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)
    assert resposta.status_code == 200


# --------------------------------------------------------------------------- erros upstream


@pytest.mark.parametrize(
    "falha",
    [
        httpx.Response(503, text="Endpoint is scaling up"),
        httpx.Response(504, text="Gateway timeout"),
        httpx.Response(429, text="Too many requests"),
        httpx.ConnectError("conexão recusada"),
        httpx.ReadTimeout("tempo esgotado"),
    ],
    ids=["503", "504", "429", "connect_error", "read_timeout"],
)
def test_indisponibilidade_retorna_503(api, databricks, settings, falha):
    databricks.respostas_invocacao = [falha]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 503
    assert resposta.json() == {"detail": MENSAGEM_INICIANDO}
    assert len(databricks.invocacoes) == 3  # max_tentativas da fixture
    assert _ler_log(settings) == []


@pytest.mark.parametrize(
    ("status", "trecho"),
    [(400, "rejeitou"), (401, "autenticação"), (404, "não encontrado"), (500, "HTTP 500")],
)
def test_erro_upstream_retorna_502_sem_vazar_credenciais(api, databricks, status, trecho):
    databricks.respostas_invocacao = [httpx.Response(status, json={"message": "detalhe interno"})]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 502
    detalhe = resposta.json()["detail"]
    assert trecho in detalhe
    assert "token-de-teste" not in resposta.text and "Bearer" not in resposta.text
    assert len(databricks.invocacoes) == 1


def test_predicao_apenas_numerica_retorna_502(api, databricks):
    databricks.respostas_invocacao = [httpx.Response(200, json={"predictions": [23.1]})]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 502
    assert "duração" in resposta.json()["detail"]


def test_resposta_nao_json_retorna_502(api, databricks):
    databricks.respostas_invocacao = [httpx.Response(200, text="<html>erro</html>")]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 502


@pytest.mark.parametrize(
    "corpo",
    [
        {},
        {"predictions": []},
        {"predictions": [{"valor_previsto": 10}]},
        {"predictions": [{"valor_previsto": "abc", "duracao_estimada_min": 3}]},
        {"predictions": "texto"},
    ],
)
def test_interpretar_predicoes_invalidas(corpo):
    with pytest.raises(ErroUpstream):
        interpretar_predicoes(corpo)


def test_interpretar_predicoes_distancia_ausente():
    previsao = interpretar_predicoes({"predictions": {"valor_previsto": [1.5], "duracao_estimada_min": [2]}})
    assert (previsao.valor_previsto, previsao.duracao_estimada_min, previsao.distancia_km) == (1.5, 2.0, None)


# --------------------------------------------------------------------------- configuração


def _provedor_quebrado() -> dict[str, str]:
    raise InferenciaNaoConfigurada("sem credenciais")


def test_health_ok(api):
    resposta = api.get("/api/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "endpoint": ENDPOINT, "inferencia_configurada": True}


def test_health_misconfigured(fabrica_cliente):
    api = fabrica_cliente(_provedor_quebrado)
    resposta = api.get("/api/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "misconfigured", "endpoint": ENDPOINT, "inferencia_configurada": False}


def test_estimativa_sem_configuracao_retorna_503(fabrica_cliente, databricks):
    api = fabrica_cliente(_provedor_quebrado)
    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)
    assert resposta.status_code == 503
    assert databricks.invocacoes == []


def test_health_misconfigured_com_sdk_real_sem_credenciais(settings, monkeypatch, tmp_path):
    """Sem token, perfil ou variáveis de ambiente o SDK não consegue autenticar → misconfigured."""
    from fastapi.testclient import TestClient

    from app.inference import ClienteDatabricks
    from app.main import create_app

    for var in ("DATABRICKS_TOKEN", "DATABRICKS_CONFIG_PROFILE", "DATABRICKS_HOST", "DATABRICKS_CLIENT_ID",
                "DATABRICKS_CLIENT_SECRET", "DATABRICKS_AUTH_TYPE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DATABRICKS_CONFIG_FILE", str(tmp_path / "inexistente.cfg"))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PATH", str(tmp_path))  # impede o uso da CLI do Databricks

    app = create_app(settings, cliente=ClienteDatabricks(settings))
    with TestClient(app) as tc:
        assert tc.get("/api/health").json()["status"] == "misconfigured"
        assert tc.post("/api/v1/estimativa", json=PEDIDO_VALIDO).status_code == 503


def test_token_gera_cabecalho_bearer(settings):
    from app.inference import AutenticacaoDatabricks

    cfg = settings.model_copy(update={"databricks_token": "dapi-teste", "databricks_config_profile": "DESLOC"})
    assert AutenticacaoDatabricks(cfg)()["Authorization"] == "Bearer dapi-teste"


def test_cors_restrito(api):
    permitido = api.options(
        "/api/v1/estimativa",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:5173"
    negado = api.options(
        "/api/v1/estimativa",
        headers={"Origin": "http://malicioso.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in negado.headers


def test_docs_disponivel(api):
    assert api.get("/docs").status_code == 200
    esquema = api.get("/openapi.json").json()
    assert "/api/v1/estimativa" in esquema["paths"]


def test_endpoint_ainda_nao_pronto_retorna_503(api, databricks):
    databricks.respostas_invocacao = [
        httpx.Response(
            404,
            json={
                "error_code": "ENDPOINT_NOT_FOUND",
                "message": "The given endpoint is not ready to serve traffic yet, please retry later.",
            },
        )
    ]

    resposta = api.post("/api/v1/estimativa", json=PEDIDO_VALIDO)

    assert resposta.status_code == 503
    assert resposta.json() == {"detail": MENSAGEM_INICIANDO}
