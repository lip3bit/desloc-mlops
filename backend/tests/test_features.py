from datetime import datetime, timezone

import pytest

from app.features import (
    FUSO_SAO_PAULO,
    formatar_datahora_modelo,
    haversine_km,
    montar_registro_modelo,
    para_sao_paulo,
    periodo,
)


def test_haversine_lyon_paris_igual_biblioteca_haversine():
    # Valor de referência da biblioteca `haversine` (raio 6371.0088 km).
    assert haversine_km(45.7597, 4.8422, 48.8567, 2.3508) == pytest.approx(392.2172595594006, abs=1e-6)


def test_haversine_mesmo_ponto_e_zero():
    assert haversine_km(-23.56, -46.65, -23.56, -46.65) == 0.0


def test_haversine_simetrico():
    ida = haversine_km(-23.5614, -46.6559, -23.5874, -46.6576)
    volta = haversine_km(-23.5874, -46.6576, -23.5614, -46.6559)
    assert ida == pytest.approx(volta)
    assert ida == pytest.approx(2.896, abs=0.01)


@pytest.mark.parametrize(
    ("hora", "esperado"),
    [(0, 3), (6, 3), (7, 1), (11, 1), (12, 2), (17, 2), (18, 3), (23, 3)],
)
def test_periodo(hora, esperado):
    assert periodo(hora) == esperado


def test_para_sao_paulo_converte_fuso():
    utc = datetime(2026, 11, 3, 11, 15, tzinfo=timezone.utc)
    sp = para_sao_paulo(utc)
    assert sp.tzinfo == FUSO_SAO_PAULO
    assert (sp.hour, sp.minute) == (8, 15)


def test_para_sao_paulo_data_sem_fuso_e_local():
    sp = para_sao_paulo(datetime(2026, 11, 3, 8, 15))
    assert sp.hour == 8 and sp.utcoffset().total_seconds() == -3 * 3600


def test_registro_modelo_formato():
    dt = datetime(2026, 11, 3, 11, 15, 30, tzinfo=timezone.utc)
    assert formatar_datahora_modelo(dt) == "2026-11-03 08:15:30"
    registro = montar_registro_modelo(-23.56, -46.65, -23.58, -46.65, dt)
    assert registro == {
        "latitude_origem": -23.56,
        "longitude_origem": -46.65,
        "latitude_destino": -23.58,
        "longitude_destino": -46.65,
        "datahora_solicitacao": "2026-11-03 08:15:30",
    }
