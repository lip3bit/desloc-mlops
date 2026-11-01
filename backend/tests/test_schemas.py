import copy

import pytest
from pydantic import ValidationError

from app.features import FUSO_SAO_PAULO
from app.schemas import EstimativaRequest
from tests.conftest import PEDIDO_VALIDO


def _pedido(**alteracoes):
    pedido = copy.deepcopy(PEDIDO_VALIDO)
    pedido.update(alteracoes)
    return pedido


def test_pedido_valido_converte_para_sao_paulo():
    pedido = EstimativaRequest.model_validate(_pedido(datahora_solicitacao="2026-11-03T11:15:00Z"))
    assert pedido.datahora_solicitacao.tzinfo == FUSO_SAO_PAULO
    assert pedido.datahora_solicitacao.hour == 8


def test_datahora_padrao_e_agora_em_sao_paulo():
    dados = _pedido()
    dados.pop("datahora_solicitacao")
    pedido = EstimativaRequest.model_validate(dados)
    assert pedido.datahora_solicitacao.tzinfo == FUSO_SAO_PAULO
    assert pedido.datahora_solicitacao.microsecond == 0


@pytest.mark.parametrize(
    "ponto",
    [{"lat": 91, "lon": 0}, {"lat": -91, "lon": 0}, {"lat": 0, "lon": 181}, {"lat": 0, "lon": -180.5}],
)
def test_coordenadas_fora_da_faixa(ponto):
    with pytest.raises(ValidationError):
        EstimativaRequest.model_validate(_pedido(origem=ponto))


def test_origem_igual_destino():
    with pytest.raises(ValidationError, match="100 m"):
        EstimativaRequest.model_validate(_pedido(destino=PEDIDO_VALIDO["origem"]))


def test_origem_muito_proxima_do_destino():
    # ~55 m de distância
    with pytest.raises(ValidationError, match="100 m"):
        EstimativaRequest.model_validate(_pedido(destino={"lat": -23.5619, "lon": -46.6559}))


# --- via API (formato de erro do contrato: {"detail": "<texto>"}) ---------------------------


def test_api_coordenada_invalida_retorna_422(api, databricks):
    resposta = api.post("/api/v1/estimativa", json=_pedido(origem={"lat": 123, "lon": -46.6}))
    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], str)
    assert "origem.lat" in corpo["detail"]
    assert databricks.invocacoes == []


def test_api_mesmo_ponto_retorna_422(api, databricks):
    resposta = api.post("/api/v1/estimativa", json=_pedido(destino=PEDIDO_VALIDO["origem"]))
    assert resposta.status_code == 422
    assert "100 m" in resposta.json()["detail"]
    assert databricks.invocacoes == []


def test_api_campo_obrigatorio_ausente(api):
    resposta = api.post("/api/v1/estimativa", json={"origem": PEDIDO_VALIDO["origem"]})
    assert resposta.status_code == 422
    assert "destino: campo obrigatório" in resposta.json()["detail"]


def test_api_datahora_invalida(api):
    resposta = api.post("/api/v1/estimativa", json=_pedido(datahora_solicitacao="ontem às 8"))
    assert resposta.status_code == 422
    assert "datahora_solicitacao" in resposta.json()["detail"]
