# Quickstart: Previsão de preço e duração da corrida

## 1. Reproduzir o pipeline no Databricks

Pré-requisitos: Databricks CLI ≥ 0.2xx e um workspace com o catálogo `desloc` (schemas `bronze`, `silver`, `gold`, `models`) e o volume `/Volumes/desloc/bronze/transactions/` com `data/transacao.csv`.

```bash
databricks auth login --profile DESLOC --host https://<seu-workspace>.cloud.databricks.com
export DATABRICKS_CONFIG_PROFILE=DESLOC
for n in notebooks/*.ipynb; do
  databricks workspace import "/Users/<seu-usuario>/MLOps/$(basename "$n" .ipynb)" \
    --file "$n" --format JUPYTER --language PYTHON --overwrite
done
```

Ordem de execução: `01_bronze` → `02_silver` → `03_gold` → `04_eda` → `05_preparacao_dados` → `06_ml` → `07_deploy` → `08_avaliacao_retreino` → **`09_modelo_duracao`** → **`10_validacao_hipotese`** → **`11_modelo_preco_deploy`** (`00_features_corrida` é carregado via `%run`). Os notebooks novos fixam o ambiente serverless **6**.

## 2. Publicar o Model Serving via API REST

```bash
pip install databricks-sdk requests
python scripts/serving_endpoint.py deploy        # cria/atualiza desloc-corrida com a última versão do modelo
python scripts/serving_endpoint.py status
python scripts/serving_endpoint.py testar        # POST /serving-endpoints/desloc-corrida/invocations
```

## 3. Rodar a aplicação localmente

```bash
cp .env.example .env                              # usa o perfil DESLOC (OAuth), sem token
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn app.main:app --port 8000
```

Em outro terminal:

```bash
cd frontend && npm install && npm run dev         # http://localhost:5173
```

- Swagger: http://localhost:8000/docs
- Teste rápido:

```bash
curl -s localhost:8000/api/v1/estimativa -H 'Content-Type: application/json' \
  -d '{"origem":{"lat":-23.5614,"lon":-46.6559},"destino":{"lat":-23.5874,"lon":-46.6576}}'
```

Com Docker (exige `DATABRICKS_TOKEN` no `.env`, porque o container não tem o perfil da CLI): `docker compose up --build` → http://localhost:8080.

## 4. Testes

```bash
cd backend && pip install -r requirements-dev.txt && pytest -q
cd frontend && npm run build
```

## 5. Validação esperada
- `09`: modelo de duração com MAE de CV ≈ 2,7 min (média: ≈ 3,2 min).
- `10`: hipótese de receita confirmada (p < 0,05); receita por minuto decrescente.
- `11`: preço com MAE de CV ≈ R$ 0,62 (KNN da aula: ≈ R$ 1,82).
- App: rota da Av. Paulista ao Ibirapuera estimada em ≈ R$ 20–25 e ≈ 10–13 min.
