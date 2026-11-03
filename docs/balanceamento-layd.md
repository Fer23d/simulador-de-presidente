# Balanceamento da Layd, do Vault e do Mercado Sombrio

## Método

O script `scripts/simulate-layd.mjs` executa 150 meses do Vault com a seed determinística `91` e quatro políticas:

- **Guardião:** prioriza o estoque do Vault; entrega comida e vacina ao povo, mas usa uma dose emergencial para evitar a morte clínica de Layd.
- **Cuidador:** desvia comida e vacinas para Layd, aceitando o risco de descoberta e fugindo quando isso acontece.
- **Equilibrado:** compra ração e sintetiza vacinas com sucata; não desvia recursos salvo emergência.
- **Escondido:** mantém Layd escondida e só a expõe durante a aplicação de cada dose.

O Vault simulado constrói geradores, estufas, dormitório, suporte de vida, laboratório, escritório, suíte presidencial, elevador e Sala de Tratamento de Radiação. O Mercado Sombrio é medido a partir do primeiro mês em que o traje pode ser comprado, sem depender da chegada da Layd. Eventos pendentes são resolvidos automaticamente pela política de cada estratégia para permitir a comparação contínua.

## Resultado antes da calibração

Este é o registro diagnóstico capturado antes dos ajustes, com os valores originais. O traje não foi alcançado em 150 meses; a coluna do mercado aparece como “não alcançado” porque o custo de 8.000 sucatas excedia a renda simulada.

| Estratégia | Adoeceu | Curou | Morreu | Descoberta | Lealdade média | Sucata inicial → final | Missões | Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Guardião | — | — | 45 | — | 16,0 | 133 → 2.560 | 53 | morte |
| Cuidador | 47 | — | — | 53 | 8,3 | 133 → 555 | 21 | fuga |
| Equilibrado | 47 | 54 | — | — | 9,2 | 133 → 1.640 | 88 | cura sem descoberta |
| Escondido | 47 | — | 58 | — | 9,2 | 133 → 2.110 | 57 | morte |

## Resultado depois da calibração

| Estratégia | Adoeceu | Curou | Morreu | Descoberta | Lealdade média | Sucata inicial → final (mín.–máx.) | Mercado | Missões | Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Guardião | 45 | — | — | 55 | 13,1 | 183 → 5.745 (19–5.745) | 24 | 52 | entrega |
| Cuidador | 45 | — | — | 54 | 9,4 | 183 → 1.027 (42–1.027) | 25 | 19 | fuga |
| Equilibrado | 45 | — | — | 57 | 9,9 | 183 → 5.562 (42–5.562) | 25 | 51 | entrega |
| Escondido | 45 | 59 | — | — | 9,6 | 183 → 5.962 (42–5.962) | 25 | 53 | cura sem descoberta |

A descoberta ocorre 9 meses depois da doença para o Guardião/Cuidador e 12 meses depois para o Equilibrado; portanto, não há descoberta precoce antes da janela mínima de oito meses. O caminho Escondido prova que curar sem ser descoberto é possível, mas exige manter Layd fora de vista e controlar o calendário de doses. As estratégias não têm o mesmo melhor resultado: fuga, entrega, morte evitada por concessão e cura limpa ficam distribuídas entre elas.

## Constantes e fórmulas alteradas

| Arquivo | Constante/fórmula | Antes | Depois | Motivo |
| --- | --- | ---: | ---: | --- |
| `src/core/layd_care.js` | `SICK_AFTER_MONTHS` | 12 | 10 | Fazer a história de cuidado começar mais cedo após a adoção. |
| `src/core/layd_care.js` | `DOSE_SCRAP_COST` | 40 | 25 | Permitir quatro doses sem transformar o tratamento em uma espera de dezenas de meses. |
| `src/core/layd_care.js` | `RATION_SCRAP_COST` | 30 | 20 | Tornar a compra emergencial de ração uma alternativa real. |
| `src/core/layd_care.js` | `MISSION_GAP_MONTHS` | 2 | 4 | Reduzir sobreposição de missões e evitar que a descoberta aconteça cedo demais. |
| `src/core/layd_care.js` | perda visível de suspeita por mês | 5 | 6 | Manter pressão narrativa sem atingir o limite em poucos turnos. |
| `src/core/layd_care.js` | perda escondida de suspeita por mês | 2 | 3 | Esconder ajuda, mas não torna a conspiração invisível. |
| `src/core/layd_care.js` | suspeita por dose aplicada | 3 | 4 | Cada tratamento deixa uma pequena trilha política. |
| `src/core/layd_care.js` | `divertFood` / desvio de comida | 6 | 10 | Desvio direto do estoque deve ser mais arriscado que compra clandestina. |
| `src/core/layd_care.js` | opção `divert-ration` do evento | 10 | 8 | O evento já tem o custo de lealdade; o risco de suspeita fica menor que o desvio manual repetido. |
| `src/core/layd_care.js` | custo de vacina sintética | 90 | 70 | Dar ao caminho Equilibrado uma solução cara, porém sustentável. |
| `src/core/layd_care.js` + `src/core/companion.js` | ração inicial de Layd | 4 | 8 | Evitar que a primeira decisão seja uma emergência imediata. |
| `src/core/layd_care.js` | perda de saúde por fome | 10 | 5 | Fome continua perigosa, mas não mata antes de o jogador ter uma janela de reação. |
| `src/core/wasteland.js` | renda base mensal de sucata | 25 | 60 | A renda mínima passa a sustentar decisões básicas. |
| `src/core/wasteland.js` | sucata por unidade de trabalho do gerador | 15 | 30 | Geradores operacionais recompensam investimento e dão escala ao Vault. |
| `src/core/wasteland.js` | sucata por nível de escritório | 5 | 10 | Escritórios ajudam a financiar missões sem dominar a economia. |
| `src/core/player_state.js` | custo da skin `hazmat` | 8.000 | 250 | Com a nova renda e os custos de construção, o traje fica alcançável no mês 24–25. |
| `src/core/market.js` | `MARKET_SELL_MARGIN` | 0,80 | 0,72 | Vender fica claramente abaixo do valor de referência. |
| `src/core/market.js` | `MARKET_BUY_MARGIN` | 1,30 | 1,32 | Comprar continua mais caro; com as faixas de variação atuais, uma revenda imediata sempre dá prejuízo. |
| `src/core/wasteland.js` | fórmula de sucata | `25 + geradores × 15 + escritórios × 5` | `60 + unidadesDeTrabalho × 30 + níveisDeEscritório × 10` | Aumentar a renda sem remover o custo de construir, reparar e cuidar da colônia. |

O período de abertura do Mercado Sombrio continua em **3 dias por mês**, sem alteração. Os lotes e limites por oferta também continuam limitados para impedir ganho infinito.

## Decisões de design deixadas abertas

1. A chegada de Layd continua presa à escolha da Porta após o marco de 36 meses e nível 25. Antecipar essa escolha mudaria o ritmo do capítulo, então não foi implementado como ajuste de balanceamento.
2. Depois de curada, Layd permanece uma companheira sem novos conflitos de doença. Isso preserva o encerramento emocional atual; um arco pós-cura exigiria conteúdo narrativo novo.
3. A lealdade média cai bastante em uma simulação de 150 meses com o Vault inicial e poucos dormitórios. Não aumentei artificialmente essa média porque o próximo ajuste deve ser uma decisão separada sobre capacidade populacional, comida e habitação.

## Verificação

Executado:

```text
node scripts/simulate-layd.mjs
npm test
```

Resultado final: **547 testes passando, 0 falhas**.
