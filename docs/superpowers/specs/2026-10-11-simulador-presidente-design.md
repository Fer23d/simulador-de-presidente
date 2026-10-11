# Simulador de Presidente - Design do MVP

## Objetivo

Entregar um jogo web de estrategia politica para GitHub Pages. O jogador
seleciona um pais, gere o orcamento mensal e tenta aprovar uma lei
trabalhista em um Congresso dividido por ideologia. As decisoes alteram os
indicadores nacionais e ficam salvas no navegador.

## Limites do MVP

Inclui:

- Base local com 200 paises reais e area total em km2.
- Atributos iniciais plausiveis e deterministas: populacao, PIB, bioma e tipo
  de governo.
- Selecionador de pais para iniciar ou trocar a simulacao.
- Painel de indicadores: PIB, inflacao, desemprego, popularidade, caixa e
  deficit/superavit mensal projetado.
- Aba Orcamento para configurar IR e IVA por controles de mais/menos e ver a
  arrecadacao e o saldo projetados em tempo real.
- Aba Congresso com distribuicao de assentos, apoio por bloco ideologico,
  custo de negociacao e uma votacao de Lei Trabalhista.
- Avanco mensal: aplica efeitos de impostos, gastos, lei aprovada e variacao
  economica; atualiza caixa, indicadores e popularidade.
- Salvamento automatico e botao para reiniciar o estado.

Ficam fora desta entrega: mapa, comercio exterior jogavel, eleicoes,
desastres, IA diplomatica e arvore completa de leis. A arquitetura reserva
modulos para esses sistemas sem apresentar controles inativos na interface.

## Experiencia

A tela e um dashboard escuro, denso e operacional. Uma barra lateral contem
identidade do pais e navegacao. O conteudo principal traz indicadores no topo
e uma unica area de trabalho por aba. Nenhuma acao depende de servidor; erros
de dados e localStorage indisponivel geram mensagens discretas e mantem a
partida utilizavel.

## Arquitetura

Arquivos estaticos, sem framework ou etapa de build:

- `index.html`: estrutura semantica do aplicativo.
- `assets/styles.css`: tokens visuais, layout responsivo e componentes.
- `src/data/countries.js`: seed de 200 paises e validacao do conjunto.
- `src/core/economy.js`: formulas puras de arrecadacao, gasto, saldo e
  atualizacao de indicadores.
- `src/core/congress.js`: composicao parlamentar e resolucao da votacao.
- `src/core/laws.js`: definicao da Lei Trabalhista e efeitos persistentes.
- `src/core/game-state.js`: fabrica, serializacao, avanco mensal e
  coordenacao dos sistemas.
- `src/ui/dashboard.js`: renderizacao do DOM e listeners de interface.
- `src/main.js`: bootstrap.

As regras centrais nao acessam o DOM ou localStorage. A UI recebe um estado,
emite intencoes e renderiza o novo estado devolvido por `game-state`.

## Modelo de Dados

Cada pais tem:

```js
{
  id: 'bra',
  nome: 'Brasil',
  area_km2: 8515770,
  populacao_base: 216400000,
  pib_base: 2170000000000,
  bioma_dominante: 'tropical',
  tipo_governo: 'Republica presidencialista'
}
```

Os 200 registros sao um seed explicito para `id`, `nome` e `area_km2`.
`populacao_base`, `pib_base`, `bioma_dominante` e `tipo_governo` sao derivados
de uma regra deterministica por pais quando nao houver uma fonte inicial mais
detalhada. Isso evita dados aleatorios mudando a cada carregamento e permite
substituir os valores por dados curados posteriormente.

O estado de uma partida registra identificador do pais, mes, ano, economia,
orcamento, Congresso, leis ativas, historico curto e configuracoes do jogador.

## Regras de Simulacao

- Receita mensal = base tributavel mensal x taxas de IR e IVA, corrigida por
  eficiencia administrativa.
- Gasto mensal = parcelas de saude, educacao, logistica, seguranca e servico
  da divida. O jogador altera apenas as duas taxas tributarias neste MVP.
- Saldo = receita - gasto; caixa acumula o saldo.
- Inflacao aumenta quando a demanda estimulada pelo deficit supera a capacidade
  produtiva; impostos altos reduzem demanda e aprovacao de curto prazo.
- Desemprego cai com crescimento real e sobe quando a carga tributaria passa
  de um limiar. Os valores possuem limites para impedir estados invalidos.
- A Lei Trabalhista exige maioria simples. O apoio parte da afinidade
  ideologica, e pode subir via negociacao, limitada por caixa, popularidade e
  risco politico. Uma lei aprovada e unica e aplica efeitos mensais pequenos
  em desemprego, custo empresarial e apoio social.

## Fluxo de Dados

```text
seed de paises -> nova partida -> estado central -> UI
                                  |                |
                                  v                v
                          regras de economia   intencao do jogador
                                  ^                |
                                  +----------------+
```

Ao clicar em `Avancar mes`, o estado central primeiro calcula economia e
orcamento, depois aplica a lei ativa e por fim atualiza popularidade e
historico. A votacao nao avanca o calendario; ela modifica o conjunto de leis
ativas e consome os recursos de negociacao imediatamente.

## Testes e Verificacao

Testes unitarios com Node para regras puras:

- o seed possui 200 IDs unicos e areas validas;
- a arrecadacao aumenta ao elevar uma taxa;
- o caixa muda pelo saldo mensal;
- uma maioria favoravel aprova a lei;
- negociacao nunca leva o caixa abaixo de zero;
- o avanco mensal mantem os indicadores dentro dos limites definidos.

Uma verificacao manual responsiva cobre desktop e largura mobile, troca de
pais, ajuste de impostos, negociacao, votacao, avanco de mes e recarga da
pagina. O deploy do GitHub Pages publica a raiz do repositorio.

## Publicacao

O repositorio publico sera criado como `Fer23d/simulador-de-presidente`.
Depois dos testes, o codigo sera enviado para `main` e o GitHub Pages sera
ativado pela opcao de deploy a partir da branch `main`, raiz do repositorio.
