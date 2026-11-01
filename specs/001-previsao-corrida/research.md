# Research: Previsão de preço e duração da corrida

Decisões técnicas, alternativas consideradas e evidências. Métricas obtidas na execução dos notebooks 09–11 no Databricks (MLflow: experimentos `desloc-duracao-corrida` e `desloc-corrida`).

## R1. Horário da solicitação (correção do vazamento temporal)
- **Decisão**: `datahora_solicitacao ≈ datahora_entregue − duracao`; calendário (`hora`, `dia_semana`, `periodo`) calculado sobre esse proxy.
- **Motivo**: o KNN da aula usa calendário da **entrega**, que só existe após a corrida (o notebook 08 já apontava isso). O proxy usa apenas informação histórica, e na inferência o app envia o horário real da solicitação.
- **Alternativas**: remover o calendário (perde sazonalidade); usar a entrega mesmo assim (vazamento, viola o Princípio I).
- **Limite**: ignora o tempo de espera do motorista; aceitável para a demonstração e documentado.

## R2. Outlier de duração
- **Decisão**: excluir `duracao > 50` (1 corrida de 106 min para ~4,9 km) do treino; manter na Gold com `outlier_duracao = true`.
- **Motivo**: valor implausível que domina o RMSE em uma amostra de 104 corridas; o limite vem do `04_eda`.

## R3. Modelo de duração
- **Decisão**: regressão linear padronizada sobre `distancia_lalo, hora, dia_semana, periodo` (sem coordenadas absolutas).
- **Evidência (CV 5-fold, 103 corridas)**:

| Modelo | MAE (min) |
|---|---|
| Média (Dummy) | 3,17 |
| **Regressão linear** | **2,67** |
| Random Forest | 2,91 |
| Gradient Boosting | 3,04 |
| KNN 5 | 3,25 |

- As coordenadas absolutas pioraram todos os modelos (sobreajuste com 103 linhas). O ganho de 16% sobre a média é moderado: trânsito e rota não estão nos dados.

## R4. Duração estimada como feature (out-of-fold)
- **Decisão**: `cross_val_predict` (5 dobras) gera `duracao_estimada` para o treino do preço; na inferência, o modelo de duração treinado com todas as corridas.
- **Motivo**: evitar que o preço aprenda com uma duração otimista (prevista por um modelo que já viu a corrida). É *stacking* padrão.

## R5. Modelo de preço
- **Evidência (CV 5-fold, mesmas dobras, MAE em R$)**:

| Cenário | Melhor modelo | MAE |
|---|---|---|
| KNN da aula (calendário da entrega + coordenadas) | KNN 5 | 1,82 |
| Sem duração | Regressão linear | 0,62 |
| **Com `duracao_estimada` (publicado)** | **Regressão linear** | **0,62** |

- Teste reservado (20%, 21 corridas): **MAE R$ 0,69 | RMSE R$ 0,95**.
- **Leitura honesta**: a duração estimada é função das mesmas features, então acrescenta pouca informação nova. O enunciado pede seu uso, e o modelo publicado a inclui. A duração **real** reduz o erro dos modelos de árvore (GBR: R$ 0,57 no protótipo), o que indica que um modelo de duração melhor (rota/trânsito) é o caminho para ganhar precisão.
- A regressão linear também é a mais explicável: preço ≈ tarifa base + R$/km + ajustes por horário.

## R6. Hipótese "corridas mais demoradas → mais lucro"
| Teste | Resultado |
|---|---|
| Pearson (sem outlier) | r = 0,50, p ≈ 8×10⁻⁸ |
| Spearman | ρ = 0,67 |
| OLS `vlr_pago ~ duracao + distancia_lalo` | +R$ 0,072/min, p ≈ 4×10⁻⁴, R² = 0,94 |
| Receita por minuto (quartis de duração) | cai de ≈ R$ 2,75/min para ≈ R$ 1,54/min |

- **Conclusão**: H0 rejeitada **para receita**. Corridas mais demoradas rendem mais por corrida, mesmo controlando a distância. Porém cada minuto extra rende menos, e **lucro não é validável** sem custos.

## R7. Inferência: Model Serving x função SQL
- **Decisão**: modelo `mlflow.pyfunc` encadeado (features → duração → preço) servido em `desloc-corrida` (*scale-to-zero*), criado e atualizado pela **API REST** (`POST /api/2.0/serving-endpoints`, `PUT .../config`, `POST /serving-endpoints/{nome}/invocations`) via `scripts/serving_endpoint.py`.
- **Alternativas**: função SQL no UC via SQL Warehouse (exige warehouse ligado e SQL na API); carregar o modelo no backend (perde o versionamento central e o retreino sem redeploy do app).
- **Trade-off**: *cold start* de até alguns minutos após inatividade. Mitigado com retry/backoff no backend e feedback no app.

## R8. Backend e frontend
- **FastAPI** (Python, mesma linguagem dos notebooks; validação com pydantic; Swagger automático). Autenticação no Databricks via `databricks-sdk` `Config.authenticate()`: perfil OAuth da CLI localmente e token como secret em produção.
- **React + Vite + Leaflet**. APIs públicas sem chave apenas para UX: **Nominatim** (endereços, limitado à Grande SP) e **OSRM** (desenho da rota). O modelo não depende delas.

## R9. Deploy
- Backend no **Render** (Docker, plano free, `render.yaml`) e frontend no **Vercel** (SPA estática com `VITE_API_URL`). Ambos gratuitos, com deploy a partir do GitHub.
- Alternativa avaliada: apenas vídeo local. A URL pública foi mantida como objetivo porque o enunciado a prioriza; o vídeo fica como evidência complementar.
