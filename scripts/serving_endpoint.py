"""Cria, atualiza e testa o endpoint de Model Serving da DESLOC via API REST do Databricks.

Uso:
    python scripts/serving_endpoint.py deploy  [--versao N]   # cria ou atualiza o endpoint
    python scripts/serving_endpoint.py status
    python scripts/serving_endpoint.py testar

Autenticação: perfil da Databricks CLI (DATABRICKS_CONFIG_PROFILE, ex.: DESLOC) ou
DATABRICKS_HOST + DATABRICKS_TOKEN. Nenhum token fica no código.
"""
import argparse
import json
import os
import sys
import time

import requests
from databricks.sdk.core import Config

ENDPOINT = os.getenv("DATABRICKS_ENDPOINT", "desloc-corrida")
MODELO = os.getenv("DESLOC_MODELO_UC", "desloc.models.corrida_desloc")
EXEMPLO = [{
    "latitude_origem": -23.5614, "longitude_origem": -46.6559,
    "latitude_destino": -23.5874, "longitude_destino": -46.6576,
    "datahora_solicitacao": "2026-11-02 08:15:00",
}]


class ServingApi:
    def __init__(self):
        self.cfg = Config()
        self.host = self.cfg.host.rstrip("/")

    def chamar(self, metodo, caminho, corpo=None, timeout=60):
        resposta = requests.request(metodo, f"{self.host}{caminho}", headers=self.cfg.authenticate(),
                                    json=corpo, timeout=timeout)
        if not resposta.ok:
            raise RuntimeError(f"{metodo} {caminho} → HTTP {resposta.status_code}: {resposta.text[:500]}")
        return resposta.json() if resposta.text else {}

    def ultima_versao(self):
        versoes = self.chamar("GET", f"/api/2.1/unity-catalog/models/{MODELO}/versions?max_results=100")
        prontas = [v for v in versoes.get("model_versions", []) if v.get("status") == "READY"]
        if not prontas:
            raise RuntimeError(f"Nenhuma versão READY de {MODELO}")
        return str(max(int(v["version"]) for v in prontas))

    def endpoint(self):
        try:
            return self.chamar("GET", f"/api/2.0/serving-endpoints/{ENDPOINT}")
        except RuntimeError as erro:
            if "RESOURCE_DOES_NOT_EXIST" in str(erro) or "404" in str(erro):
                return None
            raise

    def deploy(self, versao):
        entidade = {"name": "corrida-desloc", "entity_name": MODELO, "entity_version": versao,
                    "workload_size": "Small", "scale_to_zero_enabled": True}
        if self.endpoint() is None:
            print(f"POST /api/2.0/serving-endpoints → criando {ENDPOINT} ({MODELO} v{versao})")
            self.chamar("POST", "/api/2.0/serving-endpoints",
                        {"name": ENDPOINT, "config": {"served_entities": [entidade]}})
        else:
            print(f"PUT /api/2.0/serving-endpoints/{ENDPOINT}/config → {MODELO} v{versao}")
            self.chamar("PUT", f"/api/2.0/serving-endpoints/{ENDPOINT}/config", {"served_entities": [entidade]})
        return self.aguardar()

    def aguardar(self, limite_s=1800):
        inicio = time.time()
        while time.time() - inicio < limite_s:
            estado = self.endpoint()["state"]
            print(f"  {int(time.time() - inicio):4d}s  {estado}")
            if estado.get("config_update") == "UPDATE_FAILED":
                raise RuntimeError(f"Falha no deploy: {estado}")
            if estado.get("ready") == "READY" and estado.get("config_update") == "NOT_UPDATING":
                return estado
            time.sleep(30)
        raise TimeoutError("Endpoint não ficou READY dentro do limite")

    def testar(self):
        return self.chamar("POST", f"/serving-endpoints/{ENDPOINT}/invocations",
                           {"dataframe_records": EXEMPLO}, timeout=300)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("acao", choices=["deploy", "status", "testar"])
    parser.add_argument("--versao", help="Versão do modelo no UC (padrão: a mais recente)")
    args = parser.parse_args()
    api = ServingApi()

    if args.acao == "deploy":
        print(json.dumps(api.deploy(args.versao or api.ultima_versao()), indent=2))
        print(json.dumps(api.testar(), indent=2, ensure_ascii=False))
    elif args.acao == "status":
        info = api.endpoint()
        if info is None:
            sys.exit(f"Endpoint {ENDPOINT} não existe")
        print(json.dumps({"state": info["state"], "served_entities": [
            {k: e.get(k) for k in ("entity_name", "entity_version", "scale_to_zero_enabled", "state")}
            for e in info["config"]["served_entities"]]}, indent=2))
    else:
        print(json.dumps(api.testar(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
