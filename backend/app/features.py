"""Funções de apoio às features do modelo de corrida."""

from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo

FUSO_SAO_PAULO = ZoneInfo("America/Sao_Paulo")

# Raio médio da Terra em km (mesmo valor padrão da biblioteca `haversine`).
RAIO_TERRA_KM = 6371.0088

FORMATO_DATAHORA_MODELO = "%Y-%m-%d %H:%M:%S"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância de grande círculo, em km, entre dois pontos (graus decimais)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * RAIO_TERRA_KM * math.asin(min(1.0, math.sqrt(a)))


def periodo(hora: int) -> int:
    """Período do dia conforme a regra do projeto.

    1 = manhã (7h a 11h), 2 = tarde (12h a 17h), 3 = demais horários.
    """
    if 7 <= hora <= 11:
        return 1
    if 12 <= hora <= 17:
        return 2
    return 3


def para_sao_paulo(dt: datetime) -> datetime:
    """Converte para America/Sao_Paulo; datas sem fuso são interpretadas como horário local de SP."""
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=FUSO_SAO_PAULO)
    return dt.astimezone(FUSO_SAO_PAULO)


def agora_sao_paulo() -> datetime:
    """Data/hora atual em America/Sao_Paulo, sem microssegundos."""
    return datetime.now(FUSO_SAO_PAULO).replace(microsecond=0)


def formatar_datahora_modelo(dt: datetime) -> str:
    """Formata a data/hora no padrão esperado pelo modelo: `YYYY-MM-DD HH:MM:SS` (horário de SP)."""
    return para_sao_paulo(dt).strftime(FORMATO_DATAHORA_MODELO)


def montar_registro_modelo(
    lat_origem: float,
    lon_origem: float,
    lat_destino: float,
    lon_destino: float,
    datahora: datetime,
) -> dict:
    """Monta o registro de entrada (`dataframe_records`) do endpoint de Model Serving."""
    return {
        "latitude_origem": lat_origem,
        "longitude_origem": lon_origem,
        "latitude_destino": lat_destino,
        "longitude_destino": lon_destino,
        "datahora_solicitacao": formatar_datahora_modelo(datahora),
    }
