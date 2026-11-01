"""Modelos de entrada e saída da API (conforme `specs/001-previsao-corrida/contracts/openapi.yaml`)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.features import agora_sao_paulo, haversine_km, para_sao_paulo

DISTANCIA_MINIMA_KM = 0.1  # origem e destino devem estar a pelo menos 100 m


class Ponto(BaseModel):
    """Coordenada geográfica em graus decimais."""

    lat: float = Field(..., ge=-90, le=90, allow_inf_nan=False, description="Latitude")
    lon: float = Field(..., ge=-180, le=180, allow_inf_nan=False, description="Longitude")


class EstimativaRequest(BaseModel):
    """Pedido de estimativa de corrida."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "origem": {"lat": -23.5614, "lon": -46.6559},
                "destino": {"lat": -23.5874, "lon": -46.6576},
                "datahora_solicitacao": "2026-11-03T08:15:00-03:00",
            }
        }
    )

    origem: Ponto
    destino: Ponto
    datahora_solicitacao: datetime | None = Field(
        default=None,
        description="Padrão = agora, fuso America/Sao_Paulo. Valores com outro fuso são convertidos.",
    )

    @model_validator(mode="after")
    def _validar(self) -> "EstimativaRequest":
        distancia = haversine_km(self.origem.lat, self.origem.lon, self.destino.lat, self.destino.lon)
        if distancia < DISTANCIA_MINIMA_KM:
            raise ValueError("origem e destino devem estar a pelo menos 100 m de distância")
        if self.datahora_solicitacao is None:
            self.datahora_solicitacao = agora_sao_paulo()
        else:
            self.datahora_solicitacao = para_sao_paulo(self.datahora_solicitacao).replace(microsecond=0)
        return self


class Modelo(BaseModel):
    """Identificação do modelo que gerou a estimativa."""

    endpoint: str = Field(..., examples=["desloc-corrida"])
    versao: str | None = Field(default=None, description="Versão servida no endpoint, se conhecida")


class EstimativaResponse(BaseModel):
    """Resultado da estimativa."""

    valor_previsto: float = Field(..., description="Preço estimado em R$")
    duracao_estimada_min: float = Field(..., description="Duração estimada em minutos")
    distancia_km: float = Field(..., description="Distância haversine origem→destino")
    moeda: str = Field(default="BRL", examples=["BRL"])
    modelo: Modelo
    datahora_solicitacao: datetime | None = None


class Health(BaseModel):
    """Situação da API e da configuração de inferência."""

    status: Literal["ok", "misconfigured"]
    endpoint: str
    inferencia_configurada: bool


class Erro(BaseModel):
    """Mensagem de erro."""

    detail: str
