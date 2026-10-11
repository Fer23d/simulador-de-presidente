# Simulador de Presidente

MVP web de um jogo de estrategia politica e economica. O jogador escolhe uma
nacao, ajusta Imposto de Renda e IVA, negocia apoio parlamentar e decide o
destino de uma Lei Trabalhista enquanto acompanha os indicadores mensais.

Jogue em: https://fer23d.github.io/simulador-de-presidente/

## Sistemas incluidos

- Seed local com 200 nacoes jogaveis e area territorial em km2.
- PIB, inflacao, desemprego, popularidade, caixa nacional e resultado fiscal.
- Orcamento mensal interativo com controles para IR e IVA.
- Congresso de 300 assentos, negociacao por bancada e maioria simples.
- Lei Trabalhista com efeitos mensais apos aprovacao.
- Persistencia de partida no navegador por `localStorage`.

## Executar localmente

O projeto nao exige instalacao de dependencias para rodar os testes:

```bash
npm test
npx --yes serve . -l 4173
```

Abra `http://localhost:4173` no navegador.

## Dados

As areas territoriais e nomes do seed foram gerados a partir do projeto aberto
[mledoze/countries](https://github.com/mledoze/countries). A lista combina os
193 Estados-membros da ONU com Vaticano, Palestina, Ilhas Cook, Niue, Kosovo,
Taiwan e Saara Ocidental para atingir o roster de 200 nacoes jogaveis. Os
atributos economicos, biomas e tipos de governo iniciais sao gerados de forma
deterministica para o MVP e podem ser substituidos futuramente por um banco
curado.

## Limites do MVP

Comercio exterior, eleicoes, clima, desastres e uma arvore completa de leis
estao fora desta primeira entrega. Os modulos de estado foram separados para
permitir que esses sistemas entrem sem acoplar a interface ao motor de regras.
