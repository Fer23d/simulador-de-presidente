# Guerra, Ligas e Traits

## Objetivo

Resolver a guerra como uma maquina de estados com acordo de paz explicito,
adicionar defesa coletiva por liga, e tornar traits e leis modificadores reais
do turno mensal. O jogo continua client-side, imutavel e centrado em
`game-state.js`.

## Estado

Cada contato diplomatico passa a manter `cash`, `gdp`, `population`,
`area_km2`, `trait`, `destruido` e `atWar`. Um pais destruido deixa de ser
renderizado e nao pode receber acoes.

`geopolitics.peaceTreaty` e nulo fora de uma vitoria. Ao reduzir o poder
militar inimigo a zero, o turno encerra a guerra e grava:

```js
{ targetId, status: 'pending' }
```

`geopolitics.league` e nulo sem liga, ou contem:

```js
{ name, leaderId, memberIds: [] }
```

## Resolucao de guerra

`advanceGeopolitics` reduz o poder do alvo a zero, desativa `atWar` e cria
um tratado pendente. A interface mostra uma unica janela de Tratado de Paz.

`anexarPais(state, targetId)` valida o tratado pendente ou um alvo ja
derrotado, soma a populacao, area e PIB atuais do alvo ao pais do jogador,
define `destruido: true`, remove o contato da lista ativa e limpa o tratado.
O comando retorna um novo estado; o handler chama `commit`, que persiste e
renderiza a tela imediatamente.

`saquearTesouro(state, targetId)` transfere 80% de `target.cash` para
`state.economy.cash`, retira esse valor do alvo, fixa relacao em -100 e
limpa o tratado. O alvo continua no mundo.

## Ligas militares

Criar uma liga custa R$ 25 bi e exige reputacao ONU de pelo menos 40. Convites
exigem relacao acima de 80 e ideologia compativel. Ao declarar guerra contra
um membro, todos os membros entram automaticamente no lado defensivo e seu
poder e somado ao calculo de combate. A liga nao cria anexacoes automaticas.

## Traits

Todo item de `COUNTRIES` recebe exatamente um `trait`, por regras
deterministicas baseadas em IDs e regioes. Sobrescritas representam os casos
especificos: Venezuela e Arabia Saudita (`oil_rich`), Russia e Israel
(`military_tradition`), Japao e Coreia do Sul (`tech_giant`), Brasil e
Argentina (`agri_power`), Suica e Singapura (`financial_hub`).

Efeitos mensais:

- `oil_rich`: receita de exportacao adicional; sancoes reduzem esse bonus.
- `military_tradition`: recrutamento custa metade.
- `tech_giant`: dobra a geracao de pontos de pesquisa.
- `agri_power`: reduz o componente de inflacao de alimentos.
- `financial_hub`: adiciona juros ao caixa positivo.

## Leis

`LAWS` tera no minimo 15 entradas, cada uma com `category`, afinidade
parlamentar e `monthlyEffects`. As categorias sao Economia, Sociedade,
Seguranca e Ambiente. Os efeitos serao agregados no inicio de `advanceMonth`
e repassados aos modulos de economia, militar e geopolitica.

## Migracao e testes

Saves anteriores recebem contatos enriquecidos a partir do seed, traits
gerados e `peaceTreaty: null`; a liga inicia nula. Testes devem cobrir:

1. vitoria cria tratado e encerra guerra;
2. anexacao e saque atualizam valores e removem o alvo quando aplicavel;
3. defesa coletiva da liga;
4. cada trait altera o sistema correspondente;
5. catalogo possui pelo menos 15 leis;
6. hidracao de saves antigos preserva dados validos.
