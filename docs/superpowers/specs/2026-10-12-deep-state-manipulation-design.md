# Deep State: Caixa 2, Sosias e Sitios Negros

## Objetivo

Adicionar tres sistemas de manipulacao politica ao Simulador de Presidente mantendo o estado imutavel, a simulacao mensal deterministica e os modais CRT bloqueantes. O conjunto cria um final pessoal secreto, uma operacao diplomatica de controle indireto e contra-espionagem baseada em eventos.

## Escopo

Esta entrega inclui Caixa 2, dilema entre Caixa 2 e Mao Morta, sosias de lideres e Sitios Negros. Nao altera os sistemas de economia geral, guerra convencional ou regras de voto existentes, exceto pelas integracoes listadas abaixo.

## Estado persistente

`createGameState()` e `hydrateGameState()` passam a manter os campos abaixo:

```js
{
  slush_fund: 0,
  slushFundTransfersThisMonth: 0,
  escape_ending_triggered: false,
  pendingFinalDilemma: false,
  double_agent_active: false,
  pendingInterrogation: null
}
```

Cada contato diplomatico pode receber `is_puppet_of: 'jogador'`. O campo nao substitui `puppet`, que continua reservado para o sistema de guerras por procuracao.

## Caixa 2

`src/core/corruption.js` exporta `desviarFundos(state)` e `interceptarFinalCaixa2(state)`.

`desviarFundos` move 5% do caixa atual (`state.economy.cash`) para `state.slush_fund`. O caixa disponivel nunca fica negativo. Cada transferencia apos a primeira no mesmo mes reduz todas as faccoes existentes em 2 pontos, para um minimo de 0. O contador mensal e zerado ao concluir `advanceMonth`.

Uma derrota terminal com `slush_fund >= 50_000_000_000` habilita a fuga pessoal. O resultado final define `escape_ending_triggered: true`, mantem `regime.gameOver: true` e nao permite novas acoes da partida.

## Resolvedor de final e dilema

O motor usa um unico resolvedor terminal antes de exibir a derrota comum:

1. Se `slush_fund >= 50 bi` e `dead_hand_active`, definir `pendingFinalDilemma: true` e parar a simulacao.
2. Se apenas o Caixa 2 estiver elegivel, executar `interceptarFinalCaixa2`.
3. Se apenas Mao Morta estiver ativa, executar `interceptarGameOverComMaoMorta`.
4. Sem qualquer protecao, preservar a derrota normal.

Enquanto `pendingFinalDilemma` for verdadeiro, `advanceMonth` e toda acao que muda o estado devem retornar uma mensagem de bloqueio. O modal oferece tres resolucoes:

- `fugirEmSilencio(state)`: executa o final Caixa 2.
- `afundarComONavio(state)`: executa a Mao Morta e a tela terminal vermelha.
- `destruirDoHelicoptero(state)`: executa a Mao Morta e depois define a vitoria pessoal; a tela exibida e a de fuga.

O ultimo caminho preserva o estado `wasteland` resultante da retaliacao e tem `escape_ending_triggered: true`.

## Sosia do lider

`src/core/black_ops.js` exporta `infiltrarSosia(state, alvoId)`.

Pre-condicoes:

- alvo existente, nao destruido, nao anexado e nao em zona nuclear;
- alvo com governo nao democratico;
- R$ 200 bi de caixa e 500 PP;
- partida nao terminada.

A operacao sempre desconta os recursos e consome uma rolagem deterministica. Com probabilidade de 60%, grava `is_puppet_of: 'jogador'` no alvo. Com 40%, o alvo entra em guerra com o jogador, relacao vai para -100 e `global_defcon` vira 1.

No motor mensal, cada sosia transfere 20% de seu `pib_base` ao caixa do jogador. A Assembleia da ONU recebe um resolvedor de voto do jogador e usa esse mesmo voto para todo contato com `is_puppet_of: 'jogador'`.

## Sitios Negros

`src/core/interrogation.js` exporta:

- `sortearCapturaAgente(state)`;
- `resolverInterrogatorio(state, metodo)`.

Ao fim de um mes valido, existe 5% de chance deterministica de abrir `pendingInterrogation`. O sorteio nao ocorre se ja houver tratado de paz, crise, voto ONU, candidatura global, dilema final, interrogatorio pendente ou qualquer fim de jogo.

Metodos e resultados:

| Metodo | Custo | Chance de quebrar | Resultado ao sucesso |
| --- | --- | --- | --- |
| Soro da Verdade | nenhum | 70% | escolher segredos ou agente duplo |
| Tortura Psicologica | nenhum | 45% | escolher segredos ou agente duplo |
| Suborno | R$ 1 bi | 85% | escolher segredos ou agente duplo |

Ao quebrar o agente, o estado permanece no modal com `resolution: 'success'` para que o jogador escolha `extract-secrets` (+2.000 PP) ou `turn-double-agent` (`double_agent_active: true`). Falha encerra o evento sem premio. O suborno so desconta o custo quando ha saldo suficiente.

`double_agent_active` garante sucesso na proxima Falsa Bandeira ou no proximo Ciberataque e e consumido nessa acao. A Falsa Bandeira mantem seus custos e efeitos. O Ciberataque ainda aplica a paralisia normal.

## UI e acessibilidade

`index.html` recebe tres containers estaticos, todos inicialmente `hidden`:

- `#modal-fuga.modal-arcade-gold`;
- `#modal-dilema-final.modal-arcade`;
- `#modal-interrogatorio.modal-arcade-terminal`.

`dashboard.js` renderiza os tres modais, desabilita Avancar Mes diante de qualquer estado pendente e delega botoes via `data-action`. O painel Economia exibe Caixa 2 e o botao de desvio. Diplomacia mostra `Infiltrar Sosia do Lider` apenas para alvos elegiveis.

`assets/styles.css` reutiliza a linguagem CRT vigente. `.modal-arcade-terminal` usa fundo preto esverdeado, borda cyan/verde, texto monoespacado e sem degradientes. A fuga usa bordas douradas e texto verde piscante. O dilema usa a moldura amarela do modal arcade existente.

## Testes

Testes automatizados devem cobrir:

1. transferencia e penalidade acumulada do Caixa 2;
2. precedencia Caixa 2, Mao Morta e dilema;
3. cada escolha do dilema;
4. sucesso e falha deterministica do sosia, custos e vassalagem mensal;
5. captura bloqueante, custos, resultados e consumo do agente duplo;
6. hidratacao de cada novo campo;
7. renderizacao dos controles e modais novos.

## Criterios de aceite

- Nenhum final apresenta dois modais concorrentes.
- Uma partida terminada nao volta a aceitar comandos de jogo.
- A vitoria pessoal e preservada em save/reload.
- A rolagem de sosia e interrogatorio e reprodutivel com a mesma semente.
- A suite completa permanece verde.
