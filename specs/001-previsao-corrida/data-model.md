# Data Model: Previsão de preço e duração da corrida

Catálogo Unity Catalog: `desloc`. Arquitetura medalhão.

```
data/transacao.csv ──► /Volumes/desloc/bronze/transactions/transacao.csv
        │ 01_bronze
        ▼
desloc.bronze.transacoes ──► 02_silver ──► desloc.silver.transacoes ──► 03_gold ──► desloc.gold.transacoes_ml
        │                                                                     └──► desloc.gold.transacoes_eda ──► 04_eda, 10_validacao_hipotese
        │ 09_modelo_duracao (+ 00_features_corrida)
        ├──► desloc.gold.corridas_features
        ├──► desloc.gold.duracao_oof
        └──► desloc.models.duracao_corrida ──┐
                                             ▼ 11_modelo_preco_deploy
                                   desloc.models.corrida_desloc ──► Serving: desloc-corrida
10_validacao_hipotese ──► desloc.gold.validacao_hipotese
```

## Bronze — `desloc.bronze.transacoes`
| Coluna | Tipo | Observação |
|---|---|---|
| datahora_entregue | string `dd/MM/yyyy HH:mm` | conhecida **após** a corrida |
| duracao | int (min) | conhecida **após** a corrida, alvo do modelo de duração |
| distancia | double (km) | distância registrada pelo app |
| vlr_pago | double (R$) | alvo do modelo de preço (receita bruta) |
| id_motorista | int | não usada nos modelos |
| latitude/longitude_origem, latitude/longitude_destino | double | disponíveis antes da corrida |

## Gold — `desloc.gold.corridas_features` (novo, notebook 09)
| Coluna | Regra |
|---|---|
| id_corrida | sequencial, para unir com OOF |
| datahora_entregue | timestamp |
| datahora_inicio | `datahora_entregue − duracao` (proxy da solicitação) |
| distancia_lalo | haversine origem→destino (km) |
| hora, dia_semana, periodo | derivados de `datahora_inicio` (`dia_semana`: 1 = domingo; `periodo`: 1 = 07–11h, 2 = 12–17h, 3 = demais) |
| outlier_duracao | `duracao > 50` |
| duracao, vlr_pago, coordenadas | repassados da Bronze |

## Gold — `desloc.gold.duracao_oof` (novo, notebook 09)
| Coluna | Descrição |
|---|---|
| id_corrida | chave |
| duracao | real (min) |
| duracao_estimada | previsão out-of-fold (5 dobras) |
| modelo | algoritmo escolhido |

## Gold — `desloc.gold.validacao_hipotese` (novo, notebook 10)
Uma linha: `pearson_r`, `pearson_p`, `spearman_rho`, `coef_duracao_ajustado`, `p_duracao_ajustado`, `r2_multipla`, `receita_confirmada`, `receita_por_min_cai`.

## Modelos (MLflow / Unity Catalog)
| Modelo | Tipo | Entrada | Saída |
|---|---|---|---|
| `desloc.models.preco_corrida_knn` | sklearn (aula, v1) | features da entrega | vlr_pago |
| `desloc.models.duracao_corrida` | sklearn | distancia_lalo, hora, dia_semana, periodo | duração (min) |
| `desloc.models.corrida_desloc` | pyfunc encadeado | latitude_origem, longitude_origem, latitude_destino, longitude_destino (double), datahora_solicitacao (string `YYYY-MM-DD HH:MM:SS`, horário de São Paulo) | valor_previsto, duracao_estimada_min, distancia_km |

## Log de previsões (backend)
`logs/previsoes.jsonl`, uma linha por estimativa: `timestamp_utc`, `request`, `response`, `endpoint`, `versao`, `latency_ms`. Base para medir erro em produção e drift quando o `vlr_pago` real for conhecido.
