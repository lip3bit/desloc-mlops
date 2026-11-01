# Constituição do Projeto DESLOC

Princípios que orientam todas as especificações, planos e implementações deste repositório. Toda decisão registrada em `specs/` deve passar pelo **Constitution Check** do `plan.md` correspondente.

## Princípios fundamentais

### I. Só se usa o que existe no momento da cotação (sem vazamento temporal)
Nenhuma feature de um modelo de inferência pode depender de informação conhecida apenas após o fim da corrida (`duracao` real, `datahora_entregue`, `vlr_pago`). Quando o histórico não tiver o dado no momento certo, usa-se um **proxy documentado** (ex.: `datahora_solicitacao ≈ datahora_entregue − duracao`) e a limitação é registrada no `research.md`.

### II. Uma única definição de feature para treino e inferência
O cálculo de features vive em um único lugar (`notebooks/00_features_corrida`) e é embutido no modelo publicado (`mlflow.pyfunc`). O app envia apenas dados brutos (coordenadas e data/hora); nunca recalcula features por conta própria para alimentar o modelo.

### III. Reprodutibilidade e rastreabilidade (MLOps)
Dados seguem a arquitetura medalhão (Bronze → Silver → Gold) no Unity Catalog. Todo modelo é registrado no MLflow/UC com parâmetros, métricas, assinatura e exemplo de entrada. Cada previsão servida pode ser ligada a uma **versão de modelo**.

### IV. Avaliação honesta antes de publicar
Modelos são escolhidos por validação cruzada contra uma referência mínima (média) e contra o modelo anterior (KNN da aula), nas **mesmas dobras**. Previsões usadas como feature de outro modelo são **out-of-fold**. O teste reservado é avaliado uma única vez. Conclusões de negócio distinguem **receita** de **lucro**.

### V. Contrato antes do código
A interface entre frontend, backend e Model Serving é definida primeiro em `specs/*/contracts/openapi.yaml`. Mudanças no contrato exigem atualizar a especificação e os testes.

### VI. Testes automatizados e CI
O backend tem testes unitários e de API sem dependência de rede (Databricks simulado). O frontend precisa compilar sem erros de tipo. A CI (GitHub Actions) executa ambos a cada push.

### VII. Segredos fora do Git
Tokens e credenciais nunca são versionados. Localmente usa-se o perfil OAuth da Databricks CLI; em produção, variáveis de ambiente/secrets da plataforma de deploy. `.env` está no `.gitignore`; `.env.example` documenta as variáveis.

### VIII. Explicabilidade e limites declarados
Cada notebook termina com interpretação em linguagem de negócio e com as limitações conhecidas (tamanho da amostra, proxies, ausência de custos). O app mostra a versão do modelo que gerou a estimativa.

## Restrições do ambiente
- Databricks **Free Edition**: computação serverless, cota limitada de Model Serving (endpoint com *scale-to-zero*, que implica *cold start*).
- Base de treino: 104 corridas em São Paulo; o app é restrito a essa região.
- APIs públicas sem chave (Nominatim, OSRM) apenas para UX (endereços e desenho de rota), nunca como dependência do modelo.

## Fluxo de desenvolvimento (Spec-Driven Development)
1. `spec.md`: o quê e por quê (histórias, requisitos, critérios de sucesso), sem detalhes de implementação.
2. `plan.md` + `research.md` + `data-model.md` + `contracts/`: como, com o Constitution Check.
3. `tasks.md`: tarefas ordenadas por história; `[P]` marca as paralelizáveis.
4. Implementação, verificação contra os critérios de sucesso e atualização do checklist.

## Governança
Esta constituição prevalece sobre preferências individuais de implementação. Exceções são registradas na seção *Complexity Tracking* do `plan.md` com justificativa.

**Versão**: 1.0.0 | **Ratificada**: 2026-11-01 | **Última alteração**: 2026-11-01
