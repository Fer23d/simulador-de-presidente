# Árvore de Tecnologia Militar

**Status:** aprovado para planejamento
**Data:** 2026-10-12
**Escopo:** desbloqueios militares estratégicos, pesquisa militar mensal e bloqueios de ações de fim de jogo.

## Objetivo

Transformar Ciberataque, Vírus Sintético, Códigos Nucleares e o projeto Mão Morta em capacidades estratégicas pesquisáveis. A pesquisa militar deve evoluir separadamente da pesquisa civil já existente em `state.technology`.

## Estado

O estado raiz passa a conter:

```js
{
  military_research_points: 0,
  unlocked_techs: [],
}
```

Os dois campos são normalizados durante a hidratação. Saves anteriores recebem `0` e `[]`, respectivamente. Nenhuma tecnologia civil existente será migrada automaticamente para a nova árvore.

## Geração Mensal

Ao final de um mês válido, o jogo calculará a pesquisa militar a partir do PIB corrente e da parcela de Defesa do orçamento:

```js
const generated = Math.floor((economy.gdp / 1_000_000_000) * budget.defenseSpend);
```

Quando `budget.defenseSpend > 0`, o resultado mínimo é `1`. Caso contrário, é `0`. O valor é somado a `state.military_research_points` sem afetar `state.technology.points`.

## Catálogo e Dependências

`src/core/tech_tree.js` será a única fonte dos projetos militares:

| ID | Nome | Custo | Dependência |
| --- | --- | ---: | --- |
| `missiles` | `[ MÍSSEIS BALÍSTICOS ]` | 1.000 PP | Nenhuma |
| `cyber` | `[ CIBER-GUERRA ZERO-DAY ]` | 2.500 PP | Nenhuma |
| `bio` | `[ ENGENHARIA PATOGÉNICA (VÍRUS) ]` | 5.000 PP | Nenhuma |
| `nuke` | `[ ENRIQUECIMENTO DE URÂNIO ]` | 10.000 PP | `missiles` |
| `dead_hand` | `[ I.A. MÃO MORTA ]` | 25.000 PP | `nuke` |

`pesquisarTecnologia(state, techId)` retorna um novo estado. Ela rejeita IDs inexistentes, tecnologias já compradas, dependências ausentes e PP insuficientes sem modificar o estado de entrada. Em caso de sucesso, subtrai o custo, adiciona o ID a `unlocked_techs` e publica uma notícia/aviso de desbloqueio.

## Regras de Ações Estratégicas

As verificações pertencem tanto ao domínio quanto à interface:

| Ação | Tecnologia militar necessária | Condições já existentes preservadas |
| --- | --- | --- |
| Lançar Ciberataque | `cyber` | Alvo válido e custo/defesa digital |
| Lançar Vírus Sintético | `bio` | Caixa e terras-raras suficientes |
| Abrir/Criar Códigos Nucleares | `nuke` | Guerra ativa, arsenal concluído e urânio |
| Iniciar Rede Mão Morta | `dead_hand` | Recursos, custo e requisitos do megaprojeto |

As dependências civis históricas (`state-hackers`, `advanced-bioengineering` e `efficient-fission`) deixam de ser bloqueadores dessas quatro ações. Elas permanecem válidas apenas para os efeitos civis que já possuem.

## Interface

A aba Forças Armadas recebe a seção `/// PROJETOS ESPECIAIS ///`:

- Indicador CRT verde com os PP militares disponíveis.
- Lista de projetos com nome, custo, dependência e estado.
- `[ INICIAR PROJETO ]` verde apenas para projeto disponível e financiável.
- Botão cinza/desabilitado para custo insuficiente, dependência ausente ou projeto concluído.

Na Diplomacia, botões de Ciberataque, Vírus e Códigos Nucleares não são renderizados enquanto suas tecnologias não estiverem desbloqueadas. O controle de Mão Morta seguirá a mesma regra onde seu projeto for apresentado.

## Critérios de Aceite

1. Um novo estado possui PP militares zerados e nenhuma tecnologia desbloqueada.
2. Um mês com orçamento de Defesa positivo adiciona PP pela fórmula aprovada, sem mudar PP civis.
3. Cada projeto desconta seu custo uma única vez e não pode ser comprado novamente.
4. Nuclear exige Mísseis; Mão Morta exige Nuclear.
5. As funções de domínio recusam operações estratégicas sem a tecnologia correta, mesmo quando chamadas sem a UI.
6. A tela militar mostra a árvore e seu estado, e as ações extremas só aparecem depois do desbloqueio correspondente.
7. Saves antigos hidratam sem erro e recebem valores padrão para os novos campos.

## Fora do Escopo

- Novos tipos de unidades convencionais.
- Mudança de custos de recursos, arsenal ou manutenção.
- Alteração da árvore de pesquisa civil.
- Rebalanceamento de guerras, DEFCON ou tratados que não decorra diretamente dos bloqueios acima.
