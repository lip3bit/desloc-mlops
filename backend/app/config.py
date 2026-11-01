"""Configuração da API DESLOC, lida de variáveis de ambiente (e opcionalmente do `.env` da raiz)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> raiz do repositório (desloc-mlops/)
_RAIZ_REPO = Path(__file__).resolve().parents[2]
_ARQUIVOS_ENV = (str(_RAIZ_REPO / ".env"), ".env")


class Settings(BaseSettings):
    """Parâmetros de execução do backend."""

    model_config = SettingsConfigDict(
        env_file=_ARQUIVOS_ENV,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    databricks_host: str = Field(
        default="https://dbc-097964b0-0fea.cloud.databricks.com",
        description="URL do workspace Databricks.",
    )
    databricks_token: str | None = Field(
        default=None,
        description="Token de acesso (uso em produção). Tem precedência sobre o perfil.",
    )
    databricks_config_profile: str | None = Field(
        default=None,
        description="Perfil do ~/.databrickscfg (uso local, ex.: DESLOC).",
    )
    databricks_endpoint: str = Field(
        default="desloc-corrida",
        description="Nome do endpoint de Model Serving.",
    )
    cors_origins: str = Field(
        default="http://localhost:5173",
        description="Origens permitidas para CORS, separadas por vírgula.",
    )
    prediction_log_path: str = Field(
        default="logs/previsoes.jsonl",
        description="Arquivo JSONL onde cada previsão bem-sucedida é registrada.",
    )
    port: int = Field(default=8000, description="Porta HTTP do servidor.")

    @property
    def host_normalizado(self) -> str:
        """Host do workspace sem barra final e sempre com esquema."""
        host = self.databricks_host.strip().rstrip("/")
        if not host.startswith(("http://", "https://")):
            host = f"https://{host}"
        return host

    @property
    def lista_cors_origins(self) -> list[str]:
        """Origens de CORS como lista, ignorando itens vazios."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def token(self) -> str | None:
        """Token efetivo (strings vazias são tratadas como ausentes)."""
        return (self.databricks_token or "").strip() or None

    @property
    def perfil(self) -> str | None:
        """Perfil efetivo (strings vazias são tratadas como ausentes)."""
        return (self.databricks_config_profile or "").strip() or None


@lru_cache
def get_settings() -> Settings:
    """Retorna a configuração da aplicação (instância única por processo)."""
    return Settings()
