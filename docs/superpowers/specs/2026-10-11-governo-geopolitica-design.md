# Governo, Geopolitica e Regime: especificacao de design

## Objetivo

Expandir o simulador mensal com controles orcamentarios completos,
diplomacia, conflitos, projetos nucleares abstratos e estabilidade de
regime. A simulacao continua inteiramente client-side, serializavel em
`localStorage` e compativel com a interface de dashboard existente.

Esta expansao privilegia consequencias encadeadas: uma decisao fiscal
altera economia e popularidade; defesa altera capacidade militar;
diplomacia e guerra alteram comercio e caixa; e crises politicas podem
encerrar a partida ou substituir as instituicoes democraticas.

## Escopo e limites

Incluido nesta etapa:

- Sliders para imposto de renda, IVA, saude, educacao, infraestrutura e
  defesa, com projecao fiscal imediata.
- Um conjunto inicial de contatos internacionais, tratados comerciais,
  aliancas, guerras e sancoes.
- Projetos nucleares de uso civil e militar, mantidos como progresso e
  efeitos macroeconomicos abstratos.
- Risco mensal de golpe, autogolpe, ditadura e revolucao popular.
- Integracao de todos os sistemas ao turno mensal, persistencia e testes.

Fora de escopo nesta etapa:

- Mapa tatico, movimentacao de unidades, ocupacao territorial ou combate
  em tempo real.
- Arvore tecnologica detalhada ou qualquer procedimento operacional para
  construcao de armas. O programa nuclear e somente uma mecanica de jogo
  de alto nivel.
- IA diplomatica completa, eleicoes parlamentares adicionais e novos tipos
  de lei alem da integracao do fluxo de aprovacao ja existente.

## Modelo de dados

O estado continua sendo um objeto plano, para que possa ser salvo em JSON.
`STATE_VERSION` passa para `2`; estados da versao 1 recebem valores-padrao
ao serem hidratados.

```js
{
  budget: {
    incomeTaxRate: 0.16,
    vatRate: 0.12,
    healthSpend: 0.045,
    educationSpend: 0.04,
    infrastructureSpend: 0.03,
    defenseSpend: 0.035,
    socialSpend: 0.055,
    securitySpend: 0.025,
    debtService: 0.015,
  },
  geopolitics: {
    contacts: [{
      id: 'usa',
      name: 'Estados Unidos',
      relation: -10,
      militaryPower: 92,
      tradeTreaty: false,
      alliance: false,
      atWar: false,
    }],
    sanctionSeverity: 0,
  },
  military: {
    power: 18,
    support: 58,
    nuclear: {
      civilProgress: 0,
      militaryProgress: 0,
      civilOnline: false,
      bombBuilt: false,
    },
  },
  regime: {
    type: 'democracy',
    coupRisk: 0,
    revolutionRisk: 0,
    electionsSuspended: false,
    gameOver: false,
    outcome: null,
  },
  randomSeed: 123456789,
}
```

Os contatos iniciais sao Estados Unidos, China e Argentina. Seus valores
de relacao e poder sao perfis de gameplay, nao uma classificacao real de
forca militar. A lista podera crescer depois sem alterar a API publica.

## Sistemas de dominio

### Orcamento

`class Orcamento` centraliza limites, projecoes e efeitos fiscais. Ela
recebe a economia e o orcamento atual e devolve uma projecao sem mutar o
estado.

- Imposto de renda e IVA usam faixa de 0% a 60%.
- Saude, educacao, infraestrutura e defesa usam faixa de 0% a 15% do PIB.
- `setRate(budget, key, value)` valida a chave e aplica `clamp`.
- `project(economy, budget, modifiers)` informa receita, despesa, saldo e
  efeitos para o proximo mes.
- Tributos altos elevam a arrecadacao, mas aplicam penalidade gradual a
  crescimento e popularidade. A penalidade cresce depois de uma zona
  moderada, evitando que a melhor estrategia seja sempre taxar ao maximo.
- Saude reduz pressao social, educacao aumenta produtividade de longo
  prazo, infraestrutura amplia crescimento e defesa alimenta poder e apoio
  militar. Os efeitos permanecem pequenos por turno e acumulam-se pelo
  estado economico existente.

`DEFAULT_BUDGET` passa a conter `defenseSpend`; os gastos sociais,
seguranca e servico da divida existentes continuam visiveis na projecao,
mesmo sem novos controles nesta entrega.

### Geopolitica

`class Geopolitica` gerencia contatos e eventos internacionais.

- Relacoes sao limitadas ao intervalo de -100 a 100.
- `proposeTradeTreaty` exige relacao acima de 20 e ausencia de guerra. Um
  tratado aprovado acrescenta bonus comercial mensal ao crescimento e a
  receita de comercio exterior.
- `proposeAlliance` exige relacao acima de 45 e um tratado comercial ou
  afinidade diplomatica equivalente. Aliancas elevam dissuasao e apoio em
  guerra, mas nao eliminam custo de conflito.
- `declareWar` marca o contato como hostil, reduz imediatamente a relacao
  para -100 e registra o conflito.
- `advanceMonth` resolve cada guerra uma vez. O resultado compara poder
  militar, prontidao derivada da defesa, aliancas e um pequeno fator
  pseudoaleatorio persistente. Guerras consomem caixa, reduzem
  popularidade e podem deteriorar poder militar. Vitorias aumentam
  popularidade; derrotas fazem o oposto.
- `sanctionSeverity` reduz receita de comercio e crescimento. Ela sobe
  depois de um artefato nuclear militar e decai lentamente se nao houver
  nova escalada.

Os resultados pseudoaleatorios usam `randomSeed` do estado, atualizado a
cada sorteio. Assim, uma partida salva nao muda de resultado apenas por
ser recarregada.

### Militar e programa nuclear

`class Militar` possui poder, apoio das forcas armadas e progresso nuclear.

- O poder inicial e derivado de populacao e PIB do pais, limitado para
  manter comparabilidade na escala de 0 a 100.
- `advanceMonth` converte parte do gasto de defesa em prontidao e poder.
  Deficit, guerra e baixa popularidade podem reduzir apoio militar.
- `fundNuclearProject(state, kind, amount)` financia progresso civil ou
  militar em unidades de bilhoes abstratas, apenas se o tesouro suportar o
  custo. O valor e imediatamente descontado do caixa.
- Ao concluir o projeto civil, `civilOnline` concede bonus permanente de
  crescimento e reduz o custo efetivo de infraestrutura.
- Ao concluir o projeto militar, `bombBuilt` eleva fortemente a dissuasao,
  reduz relacoes com todos os contatos e aumenta sancoes. A bomba nao e
  usada em combate; ela e um modificador diplomatico e militar.

### Estabilidade e regime

O modulo de estabilidade calcula riscos e pode encerrar a partida.

- Em democracia, risco de golpe depende de popularidade muito baixa,
  caixa negativo, contracao economica, guerra desfavoravel e apoio militar.
  A chance somente e sorteada durante crise severa, em vez de punir toda
  oscilacao economica.
- `canAutogolpe` exige democracia, apoio militar de pelo menos 85 e gasto
  de defesa de pelo menos 6% do PIB. `attemptAutogolpe` troca o regime por
  ditadura quando elegivel.
- Em ditadura, `electionsSuspended` permanece verdadeiro e a aprovacao de
  leis ignora a votacao do Congresso. A interface do Congresso fica em
  estado desativado, preservando sua distribuicao para eventual uso futuro.
- Em ditadura, o risco de revolucao substitui o risco de golpe. Ele cresce
  com baixa popularidade, inflacao, desemprego, repressao financeira e
  guerras. Se o sorteio for acionado, a partida termina com resultado
  `revolucao-popular`.
- Um golpe militar bem-sucedido encerra a partida com resultado
  `golpe-militar`.

## Ordem do turno mensal

`advanceMonth` passa a executar a seguinte sequencia. Se `gameOver` for
verdadeiro, ele preserva o estado e retorna uma notificacao sem avancar o
calendario.

1. Gerar a projecao de `Orcamento` com impostos, gastos e modificadores
   ativos de tratados, sancoes e energia nuclear civil.
2. Avancar a economia usando saldo fiscal, efeitos das leis existentes e
   os modificadores fiscais/comerciais calculados.
3. Atualizar o poder e o apoio militar a partir da defesa, deficit, guerra
   e desempenho economico.
4. Aplicar efeitos recorrentes do programa nuclear civil e decaimento de
   sancoes, quando aplicavel.
5. Resolver tratados e cada guerra ativa por `Geopolitica.advanceMonth`.
6. Calcular risco de golpe ou revolucao e executar o sorteio deterministico
   de estabilidade.
7. Atualizar mes/ano, historico e uma notificacao curta dos acontecimentos.

Os passos trabalham com copias imutaveis das fatias de estado. O historico
guarda dados suficientes para o painel resumir caixa, poder militar,
relacoes e resultado do turno sem duplicar formulas na UI.

## Integracao com leis e Congresso

Em democracia, `voteLaborLaw` preserva a previsao, negociacao e votacao
existentes. Em ditadura, o mesmo comando aprova ou altera a lei de forma
imediata, registrando no historico que ela foi imposta por decreto. A
logica de afinidade partidaria permanece em `laws.js`; a UI nao mantem
numeros de voto ou afinidade proprios.

## Interface

O dashboard ganha abas `Visao Geral`, `Orcamento`, `Diplomacia`, `Forcas
Armadas`, `Congresso` e `Paises`. As abas existentes sao preservadas.

- `Orcamento`: seis sliders nativos com valor percentual acessivel,
  receita, despesa, saldo e projecao dos efeitos macroeconomicos. Cada
  mudanca atualiza a tela imediatamente, sem avancar o mes.
- `Diplomacia`: lista de contatos com relacao, status de tratado, alianca,
  guerra e sancao; botoes contextuais sao desativados quando os requisitos
  nao sao atendidos. Acoes exibem um motivo curto no proprio painel.
- `Forcas Armadas`: poder, apoio militar, custos de defesa, risco atual,
  progresso nuclear e comandos de financiamento. O controle de autogolpe
  somente fica disponivel quando todos os requisitos sao atendidos.
- `Visao Geral`: adiciona regime, poder militar e risco institucional aos
  indicadores ja existentes. Uma condicao de fim de jogo bloqueia acoes de
  simulacao e apresenta a causa.
- `Congresso`: em ditadura, mostra o estado institucional suspenso e nao
  oferece negociacao nem voto parlamentar.

O visual segue o dashboard dark existente, CSS Grid/Flexbox, botoes com
icones onde fizer sentido e layout responsivo. Nenhum framework ou asset
externo sera necessario.

## Persistencia, migracao e validacao

`hydrateGameState` deve aceitar estados validos da versao 1 e criar as
novas fatias com defaults. Estruturas invalidas para `budget`,
`geopolitics`, `military`, `regime` ou `history` fazem fallback para um
novo estado seguro, mantendo a regra atual de nao quebrar a tela por
`localStorage` corrompido. A leitura e escrita de armazenamento continua
protegida por `try/catch` e exibe aviso quando uma gravacao falhar.

## Plano de testes

Testes de dominio com `node:test` cobrirao:

- Limites dos sliders, projecao fiscal e compensacao entre arrecadacao,
  crescimento e popularidade.
- Crescimento de poder militar com gasto de defesa durante um turno.
- Requisitos de tratado e alianca, custo mensal de guerra e resultado
  reprodutivel para uma seed fixa.
- Projeto nuclear civil concluido, bomba militar concluida e sancoes
  aplicadas.
- Elegibilidade de autogolpe, golpe em crise severa e revolucao em
  ditadura, todos com seed previsivel.
- Aprovacao de lei por decreto em ditadura e preservacao do fluxo
  parlamentar em democracia.
- Migracao de save v1, rejeicao de saves malformados e bloqueio de turno
  depois do fim da partida.

Uma verificacao manual no navegador confirmara navegação de abas,
projecao imediata dos sliders, estados desativados e responsividade em
larguras desktop e mobile.

## Criterios de aceite

- Alterar qualquer slider muda a projecao sem avancar o turno.
- Defesa altera poder militar ao longo dos meses e influencia guerra.
- Um tratado so e firmado acima do limiar diplomatico; guerra gera custo e
  resultado mensal observavel.
- Energia nuclear civil traz beneficio permanente; bomba traz dissuasao e
  consequencias diplomaticas.
- Democracia exige Congresso; ditadura remove essa exigencia e passa a
  expor risco de revolucao.
- Saves antigos continuam abrindo e testes automatizados passam antes da
  publicacao em `main`/GitHub Pages.
