# Specification Quality Checklist: Previsão de preço e duração da corrida

**Purpose**: validar a completude da especificação e o atendimento ao enunciado da avaliação
**Created**: 2026-11-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] Sem detalhes de implementação na seção de histórias de usuário
- [X] Focada no valor para o usuário e para o negócio
- [X] Todas as seções obrigatórias preenchidas

## Requirement Completeness

- [X] Nenhum marcador `[NEEDS CLARIFICATION]` pendente
- [X] Requisitos testáveis e sem ambiguidade
- [X] Critérios de sucesso mensuráveis
- [X] Casos de borda identificados
- [X] Premissas e limites declarados (proxy de horário, receita ≠ lucro, região SP)

## Atendimento ao enunciado

- [X] 1. Feature de duração criada por algoritmo baseado em lat/long e corridas realizadas (`09_modelo_duracao`)
- [X] 1a. Saída do algoritmo usada como feature do modelo de preço (`11_modelo_preco_deploy`, `duracao_estimada` OOF)
- [X] 1b. Hipótese "quanto mais demorada, mais lucramos" validada estatisticamente (`10_validacao_hipotese`)
- [X] 2. Aplicativo web estilo Uber: origem/destino → valor previsto pelo modelo (`frontend/` + `backend/`)
- [X] 3. Código-fonte versionado no Git, com backend e frontend
- [X] 3. Vídeo da aplicação funcionando localmente (`assets/demo-aplicacao.mp4`)
- [ ] 3. URL pública do deploy (depende de login no Render/Vercel e do secret do autor)
- [X] Serving do Databricks gerado via API REST (`scripts/serving_endpoint.py`)

## Notes

- Adicionais além do enunciado: notebooks no Git, Serving via API REST com modelo encadeado, correção do vazamento temporal, testes, CI e log de previsões para monitoramento.
