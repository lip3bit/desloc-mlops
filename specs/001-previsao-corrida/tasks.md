# Tasks: Previsão de preço e duração da corrida

**Input**: Documentos de design em `/specs/001-previsao-corrida/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Formato**: `[ID] [P?] [Story] Descrição`. `[P]` = pode rodar em paralelo (arquivos diferentes, sem dependência).

## Phase 1: Setup

- [X] T001 Criar estrutura do repositório (`notebooks/`, `backend/`, `frontend/`, `scripts/`, `specs/`, `data/`, `assets/`)
- [X] T002 [P] Copiar notebooks 01–08 das aulas para `notebooks/` e `transacao.csv` para `data/`
- [X] T003 [P] Configurar `.gitignore`, `.env.example`, `docker-compose.yml`, `render.yaml`
- [X] T004 [P] Escrever a constituição em `.specify/memory/constitution.md`

## Phase 2: Foundational (bloqueia as histórias)

- [X] T005 Definir o contrato em `specs/001-previsao-corrida/contracts/openapi.yaml` (backend + payload do Serving)
- [X] T006 Criar `notebooks/00_features_corrida` com a função única de features (haversine, hora, dia_semana, período)
- [X] T007 Renovar o login OAuth da Databricks CLI (perfil `DESLOC`)

## Phase 3: User Story 2 — Duração estimada (P2, pré-requisito técnico da P1)

**Goal**: prever a duração antes da corrida e gerar a feature OOF.
**Independent Test**: tabela `desloc.gold.duracao_oof` e modelo `desloc.models.duracao_corrida` existem; MAE < média.

- [X] T008 [US2] Criar `desloc.gold.corridas_features` com proxy `datahora_inicio` e flag de outlier em `notebooks/09_modelo_duracao`
- [X] T009 [US2] Comparar 5 modelos por CV 5-fold e escolher o de menor MAE
- [X] T010 [US2] Gerar previsões OOF em `desloc.gold.duracao_oof`
- [X] T011 [US2] Registrar `desloc.models.duracao_corrida` no MLflow/UC
- [X] T012 [US2] Corrigir a compatibilidade do ambiente do job (fixar ambiente serverless 6)

## Phase 4: User Story 1 — Cotar uma corrida (P1) 🎯 MVP

**Goal**: o passageiro escolhe origem/destino e vê preço, duração e distância.
**Independent Test**: estimativa ponta a ponta no app, com o valor vindo do endpoint do Databricks.

- [X] T013 [US1] Treinar o preço v2 com `duracao_estimada` e comparar com o KNN da aula em `notebooks/11_modelo_preco_deploy`
- [X] T014 [US1] Empacotar e registrar o pyfunc encadeado `desloc.models.corrida_desloc`
- [X] T015 [US1] Implementar `scripts/serving_endpoint.py` (REST: criar, atualizar, status, invocations)
- [X] T016 [US1] Publicar o endpoint `desloc-corrida` via API REST
- [X] T017 [P] [US1] Backend FastAPI: `backend/app/` (schemas, features, inferência REST, log JSONL, health)
- [X] T018 [P] [US1] Testes do backend em `backend/tests/` (Databricks simulado)
- [X] T019 [P] [US1] Frontend React: mapa, busca Nominatim, rota OSRM, cartão de resultado em `frontend/src/`
- [X] T020 [US1] Integração local frontend → backend → Serving
- [X] T021 [US1] Gravar o vídeo de demonstração em `assets/demo-aplicacao.mp4`

## Phase 5: User Story 3 — Validar a hipótese (P3)

**Goal**: decidir se corridas mais demoradas geram mais receita/lucro.
**Independent Test**: `notebooks/10_validacao_hipotese` imprime a decisão e grava `desloc.gold.validacao_hipotese`.

- [X] T022 [P] [US3] Correlação, OLS simples/múltipla e receita por minuto em `notebooks/10_validacao_hipotese`
- [X] T023 [US3] Ajustar a dependência `statsmodels>=0.14.5` (compatível com o scipy do ambiente 6)

## Phase 6: Polish & Cross-Cutting

- [X] T024 [P] CI no GitHub Actions (`.github/workflows/ci.yml`): pytest, build do frontend, JSON dos notebooks
- [X] T025 [P] Documentação spec-kit (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, checklist)
- [X] T026 README com atendimento ao enunciado, arquitetura, resultados e links
- [X] T027 Publicar o repositório no GitHub
- [ ] T028 (Opcional) Deploy público no Render + Vercel. Não executado: a entrega usa o vídeo da demonstração local, opção aceita pelo enunciado. A configuração está em `render.yaml` e `frontend/vercel.json`

## Dependencies & Execution Order

- Setup → Foundational → US2 → US1. A US1 precisa da duração estimada dentro do modelo publicado.
- US3 é independente das demais (lê só a Gold de EDA) e rodou em paralelo com a US2.
- T017, T018 e T019 rodaram em paralelo após o contrato (T005).
