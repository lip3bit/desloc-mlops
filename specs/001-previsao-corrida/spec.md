# Feature Specification: Previsão de preço e duração da corrida

**Feature Branch**: `001-previsao-corrida`
**Created**: 2026-11-01
**Status**: Implementada
**Input**: Enunciado da avaliação de MLOps (ESUDA): *"Criar a feature de tempo/duração da corrida, que só é gerada após a corrida, com um algoritmo baseado em lat/long e corridas já realizadas, usando sua saída como feature da previsão do valor; validar a hipótese 'quanto mais demorada a corrida, mais lucramos'; criar um aplicativo web simulando o Uber em que o usuário escolhe origem e destino e vê o valor previsto pelo modelo; versionar o código no Git com URL do deploy ou vídeo de demonstração."*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cotar uma corrida antes de pedir (Priority: P1)

Como passageiro, quero escolher origem e destino no mapa ou por endereço e ver o **valor estimado** da corrida antes de solicitá-la, para decidir se vou pedir.

**Why this priority**: é o requisito central do enunciado (item 2) e o único que entrega valor direto ao usuário final. Sem ele não há aplicação.

**Independent Test**: abrir o app, informar dois endereços de São Paulo, clicar em "Estimar corrida" e ver um valor em R$ produzido pelo endpoint do Databricks.

**Acceptance Scenarios**:

1. **Dado** que o app está aberto em São Paulo, **Quando** digito "Avenida Paulista, 1000" na origem, escolho a sugestão, digito "Parque Ibirapuera" no destino e clico em "Estimar corrida", **Então** vejo o valor em reais, a duração estimada e a distância, além da versão do modelo usada.
2. **Dado** que nenhum endereço foi digitado, **Quando** clico no mapa duas vezes, **Então** o primeiro clique define a origem, o segundo o destino, e ambos recebem um rótulo de endereço.
3. **Dado** que o endpoint de Serving está em *scale-to-zero*, **Quando** peço a estimativa, **Então** vejo a mensagem "Acordando o modelo no Databricks…" e, ao final, o resultado ou uma mensagem amigável pedindo para tentar de novo.

---

### User Story 2 - Ver o tempo estimado da corrida (Priority: P2)

Como passageiro, quero ver **quanto tempo** a corrida deve durar, e como empresa quero usar essa estimativa como **feature** do preço.

**Why this priority**: o enunciado (item 1a) pede um algoritmo de duração cuja saída seja usada pelo modelo de preço. Depende da infraestrutura da P1 para chegar ao usuário.

**Independent Test**: executar `09_modelo_duracao` e verificar a tabela `desloc.gold.duracao_oof` e o modelo `desloc.models.duracao_corrida`. Pelo app, a resposta traz `duracao_estimada_min`.

**Acceptance Scenarios**:

1. **Dado** o histórico de corridas, **Quando** o notebook 09 é executado, **Então** o modelo de duração escolhido tem MAE (validação cruzada) menor que a referência pela média.
2. **Dado** o modelo de duração, **Quando** o notebook 11 treina o preço, **Então** `duracao_estimada` (out-of-fold) está entre as features e o modelo encadeado devolve preço e duração na mesma chamada.

---

### User Story 3 - Validar a hipótese de negócio (Priority: P3)

Como gestor, quero saber se **corridas mais demoradas geram mais lucro**, para orientar a precificação.

**Why this priority**: o enunciado (item 1b) pede a validação, mas ela não afeta o fluxo do app.

**Independent Test**: executar `10_validacao_hipotese` e ler a decisão impressa e a tabela `desloc.gold.validacao_hipotese`.

**Acceptance Scenarios**:

1. **Dado** a tabela Gold de EDA, **Quando** o notebook 10 é executado, **Então** ele reporta correlação (Pearson/Spearman), regressão simples e múltipla (controlando distância), com p-valores e decisão a α = 0,05.
2. **Dado** que a base não tem custos, **Quando** a conclusão é emitida, **Então** ela separa explicitamente **receita** (testável) de **lucro** (não testável).

---

### Edge Cases

- Origem e destino iguais ou a menos de 100 m → a API responde 422 com mensagem clara.
- Coordenadas inválidas (fora de ±90/±180) → 422.
- Endereço não encontrado ou Nominatim indisponível → o app avisa e sugere clicar no mapa.
- OSRM indisponível → a rota é desenhada como linha reta tracejada; a estimativa não é afetada.
- Endpoint frio (*scale-to-zero*) ou indisponível → a API tenta de novo com espera crescente e responde 503 amigável.
- Pontos fora de São Paulo → o modelo extrapola. A busca de endereços é restrita à Grande São Paulo e o mapa abre em SP.
- Corrida com duração implausível no histórico (106 min para ~5 km) → marcada como outlier e excluída do treino.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE prever a duração da corrida (min) usando apenas informações disponíveis antes da corrida (origem, destino, data/hora da solicitação).
- **FR-002**: O sistema DEVE usar a duração prevista como feature do modelo de preço, com previsões out-of-fold no treino.
- **FR-003**: O sistema DEVE validar estatisticamente a hipótese duração → receita e documentar a limitação quanto ao lucro.
- **FR-004**: O sistema DEVE publicar um único endpoint de Model Serving no Databricks, criado e atualizado via **API REST**, que receba coordenadas + data/hora e devolva preço, duração e distância.
- **FR-005**: O backend DEVE expor `POST /api/v1/estimativa` conforme `contracts/openapi.yaml`, validando a entrada e repassando ao Serving via REST.
- **FR-006**: O frontend DEVE permitir escolher origem/destino por busca de endereço, clique no mapa ou localização do dispositivo, e exibir valor, duração e distância.
- **FR-007**: O backend DEVE registrar cada previsão (entrada, saída, versão do modelo, latência) para monitoramento.
- **FR-008**: Todo o código (notebooks, backend, frontend, infraestrutura) DEVE estar versionado no Git, com vídeo de demonstração e URL de deploy.
- **FR-009**: Nenhum segredo PODE ser versionado.

### Key Entities

- **Corrida (histórico)**: data/hora de entrega, duração real, distância, valor pago, motorista, coordenadas de origem/destino. Bronze `desloc.bronze.transacoes`.
- **Features da corrida**: distância haversine, hora, dia da semana, período, flag de outlier. Gold `desloc.gold.corridas_features`.
- **Duração OOF**: duração real x estimada fora da dobra. Gold `desloc.gold.duracao_oof`.
- **Solicitação de estimativa**: origem, destino, data/hora da solicitação (contrato da API).
- **Estimativa**: valor previsto, duração estimada, distância, versão do modelo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O modelo de duração tem MAE de validação cruzada menor que a referência pela média.
- **SC-002**: O modelo de preço publicado tem MAE de validação cruzada menor que o KNN da aula nas mesmas dobras.
- **SC-003**: Com o endpoint aquecido, uma estimativa responde no app em menos de 3 s. Com o endpoint frio, o usuário recebe feedback em menos de 1 s e o resultado ou um erro amigável.
- **SC-004**: 100% dos testes automatizados do backend passam e o frontend compila sem erros na CI.
- **SC-005**: A decisão da hipótese é reprodutível: reexecutar o notebook 10 gera a mesma conclusão.

## Assumptions

- `datahora_entregue − duracao` é um proxy aceitável para o horário da solicitação (o tempo de espera do motorista não é conhecido).
- `vlr_pago` representa receita bruta; não há dados de custo.
- O uso é acadêmico e restrito à região de São Paulo, de onde vêm as 104 corridas de treino.
- O Databricks Free Edition permite um endpoint de Serving com *scale-to-zero*; o *cold start* é aceitável para a demonstração.
