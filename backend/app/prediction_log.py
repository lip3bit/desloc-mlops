"""Registro de previsões em JSONL, usado para monitoramento do modelo."""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("desloc.registro")


class RegistroPrevisoes:
    """Acrescenta uma linha JSON por previsão bem-sucedida.

    Falhas de escrita são apenas registradas em log e nunca interrompem a requisição.
    """

    def __init__(self, caminho: str | Path) -> None:
        self.caminho = Path(caminho)
        self._lock = threading.Lock()

    def registrar(
        self,
        *,
        requisicao: dict[str, Any],
        resposta: dict[str, Any],
        endpoint: str,
        versao: str | None,
        latencia_ms: float,
        features: dict[str, Any] | None = None,
    ) -> bool:
        """Grava o registro; retorna `True` em caso de sucesso."""
        linha = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "endpoint": endpoint,
            "versao": versao,
            "latency_ms": round(latencia_ms, 1),
            "request": requisicao,
            "response": resposta,
        }
        if features:
            linha["features"] = features
        try:
            texto = json.dumps(linha, ensure_ascii=False, default=str)
            with self._lock:
                self.caminho.parent.mkdir(parents=True, exist_ok=True)
                with self.caminho.open("a", encoding="utf-8") as arquivo:
                    arquivo.write(texto + "\n")
            return True
        except Exception as exc:  # noqa: BLE001 - o log nunca deve quebrar a previsão
            logger.warning("Não foi possível gravar o registro de previsão: %s", exc)
            return False
