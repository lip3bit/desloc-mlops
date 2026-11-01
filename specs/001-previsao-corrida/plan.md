# Implementation Plan: Previsão de preço e duração da corrida

**Branch**: `001-previsao-corrida` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-previsao-corrida/spec.md`

## Summary

Criar o modelo de **duração** (feature que só existe após a corrida), usá-lo como feature de um novo modelo de **preço** sem vazamento temporal, validar a hipótese duração → receita e entregar um **app web** (React + FastAPI) que consulta um **Model Serving** do Databricks criado via API REST. Os notebooks, o código da aplicação, a infraestrutura e a documentação ficam no mesmo repositório Git, com URL pública e vídeo de demonstração.

## Technical Context

**Language/Version**: Python 3.12 (Databricks serverless, ambiente 6; backend), TypeScript 5 (frontend)
**Primary Dependencies**: scikit-learn, MLflow (Unity Catalog), statsmodels/scipy; FastAPI, pydantic, httpx, databricks-sdk; React, Vite, Leaflet
**Storage**: Delta Lake no Unity Catalog (`desloc.bronze/silver/gold`), MLflow Model Registry (`desloc.models`), log JSONL de previsões no backend
**Testing**: pytest (backend, Databricks simulado), `tsc` + `vite build` (frontend), CI no GitHub Actions
**Target Platform**: Databricks Free Edition (AWS), Render (backend Docker), Vercel (frontend estático)
**Project Type**: web application (frontend + backend) + pipeline de dados/ML
**Performance Goals**: estimativa < 3 s com endpoint aquecido
**Constraints**: cota do Free Edition (endpoint *scale-to-zero*, com *cold start*); 104 corridas de treino; sem segredos no Git
**Scale/Scope**: demonstração acadêmica, região de São Paulo, poucos usuários simultâneos

## Constitution Check

*GATE: verificado antes da pesquisa e revisado após o design.*

| Princípio | Como o plano atende | Status |
|---|---|---|
| I. Sem vazamento temporal | Calendário pelo proxy `entrega − duração`; duração real fora das features | ✅ |
| II. Uma definição de feature | `00_features_corrida` usado no treino e embutido no pyfunc servido | ✅ |
| III. Reprodutibilidade | Medalhão no UC; modelos com params, métricas, assinatura e exemplo no MLflow; versão retornada na API | ✅ |
| IV. Avaliação honesta | CV 5-fold com Dummy e KNN da aula nas mesmas dobras; OOF; teste reservado único; receita ≠ lucro | ✅ |
| V. Contrato antes do código | `contracts/openapi.yaml` escrito antes do backend e do frontend | ✅ |
| VI. Testes e CI | pytest + build do frontend + validação dos notebooks na CI | ✅ |
| VII. Segredos fora do Git | OAuth da CLI local; secret no Render; `.env` ignorado | ✅ |
| VIII. Explicabilidade | Interpretação em cada notebook; versão do modelo exibida no app | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/001-previsao-corrida/
├── spec.md              # O quê e por quê
├── plan.md              # Este arquivo
├── research.md          # Decisões e evidências
├── data-model.md        # Tabelas, modelos e log
├── quickstart.md        # Como executar e reproduzir
├── contracts/
│   └── openapi.yaml     # Contrato backend + payload do Serving
├── checklists/
│   └── requirements.md  # Qualidade da especificação e atendimento ao enunciado
└── tasks.md             # Tarefas executadas
```

### Source Code (repository root)

```text
notebooks/               # Databricks: 01–08 (aulas) + 00, 09, 10, 11 (novos)
scripts/
└── serving_endpoint.py  # Model Serving via API REST (criar/atualizar/testar)
backend/
├── app/                 # FastAPI: main, config, schemas, features, inference, prediction_log
├── tests/               # pytest
└── Dockerfile
frontend/
├── src/                 # React: api, services (nominatim, osrm), components, hooks
├── vercel.json
└── Dockerfile
data/transacao.csv       # dados brutos (origem da Bronze)
assets/                  # vídeo de demonstração
.github/workflows/ci.yml
docker-compose.yml  render.yaml  .env.example
```

**Structure Decision**: opção "web application" do template (frontend + backend), acrescida de `notebooks/` e `scripts/` para a parte de dados e MLOps, que roda no Databricks.

## Fluxo de inferência

```text
Usuário ─► Frontend (Vercel) ─► POST /api/v1/estimativa ─► Backend FastAPI (Render)
                                                              │ valida, adiciona data/hora SP, autentica (SDK)
                                                              ▼
                                POST /serving-endpoints/desloc-corrida/invocations (REST)
                                                              │
                         pyfunc CorridaDesloc: features ─► modelo de duração ─► modelo de preço
                                                              │
                         {valor_previsto, duracao_estimada_min, distancia_km} ─► log JSONL ─► app
```

## Complexity Tracking

| Exceção | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Modelo encadeado (pyfunc) em vez de dois endpoints | Uma chamada, uma versão e features calculadas no servidor (Princípio II) | Dois endpoints dobram a cota e o *cold start* e espalham a lógica de features |
| Deploy em duas plataformas (Render + Vercel) | Planos gratuitos: Render roda Docker Python; Vercel serve SPA estática com CDN | Uma única plataforma gratuita exigiria servir o build do React pelo FastAPI, acoplando os deploys |
