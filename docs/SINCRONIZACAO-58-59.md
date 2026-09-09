# Sincronizar o 58 com o 59 — o que já se sabe, e o que falta

> Registrado em 2026-09-08, ao fechar a fase 2 do Painel Diretoria.
>
> Este documento existe porque a análise que sustenta a sincronização levou
> várias sessões e mora hoje só na cabeça de quem participou dela. Ele não é o
> plano final: é o que já foi **medido**, o que já foi **descartado**, e as
> decisões que ainda não foram tomadas.
>
> Ver também: `relatorio-59-conferencia-2026-08-25.md` (a conferência que
> aprovou o 59 como fonte) e `REGRAS-DE-NEGOCIO.md`.

---

## O objetivo, nas palavras de quem pediu

> "Vincular o recebimento do 58 com os operadores, vincular com o recebimento
> das equipes, que é a parte mais difícil, eu acho. E vincular o recebimento dos
> setores. Eu quero fazer isso de uma forma que seja **assertiva, não seja fácil
> de quebrar e que seja customizável**."

Objetivo maior: **acabar de vez com divergência de valores** entre o que o ERP
diz e o que o sistema mostra.

---

## Estado atual: nada é sincronizado

⚠️ **Isto é uma restrição em vigor, não uma etapa que ficou para trás.**

O 59 alimenta **apenas** o Painel Diretoria da BookPlay. Vincular uma carteira a
um setor muda o que aquele painel mostra — e nada mais. `analitico_recebimentos`,
meta, quartil e as outras abas seguem exatamente como estavam.

| Fase | O que é | Situação |
|---|---|---|
| 1 | Painel Diretoria · Visão geral (`fn_mestre_diretoria_visao_geral`) | ✅ no ar |
| 2 | Painel Diretoria · Setores e equipes (`fn_mestre_diretoria_setores`, `_setor`) | ✅ no ar |
| 3 | **Sincronizar o 58 com o 59** | ❌ não começou |

A PaguePlay continua no painel antigo. A chave é
`usaPainel59 = tenant.slug === 'bookplay'` em `PainelDiretoria/index.tsx`.

---

## O que já foi medido

### O 59 não contém o 58 inteiro

Foi a primeira conclusão, e ela **estava errada**. O relatório do Cofen tem uma
linha que existe só no 58. A regra correta:

> Linha que está só no 58 é um retrato **mais novo**, não um erro de importação.

Comparação arquivo contra arquivo, agosto/2026, seis setores:

| | 58 | 59 |
|---|---|---|
| Linhas | 27.367 | 27.368 |
| Valor | R$ 6.790.938,83 | R$ 6.791.148,11 |

Saldo líquido **+R$ 209,28**. O resíduo são 3 linhas / R$ 466,94: Receptivo
−338,11 (só no 59) e Cofen +128,83 (só no 58). Quatro dos seis setores fecharam
em **zero exato**.

### A chave do join é a carteira, nunca o setor

`NomeGrupoFiltro` é a **carteira**. O dinheiro conta para o setor da **pessoa**,
não o da carteira. Ver a memória `mestre-59-carteira-nao-e-equipe`.

### O 58 é o retrato cadastral mais novo da equipe

O campo de equipe diverge em **6.357 dos 27.366 pares** (R$ 1.536.192, 55 de 244
operadores). E a divergência é sempre **1:1 por operador, zero misturado** — o
que descarta erro de linha e aponta para diferença de retrato cadastral. A
segunda exportação do Play 3 confirmou: **o 58 é o retrato mais novo**.

Consequência para o desenho da fase 3:

- **equipe** → o 58 manda
- **dinheiro** → o 59 manda

### A soma dos setores é maior que o total da empresa, e está certo

Quando um grupo cobra `Integral` para outro (a coluna `setor` vem como
`"Receptivo - Play 5"`), o dinheiro conta **nos dois**: é rateio de comissão,
não transferência. Estabelecido e medido em `20260904300000`.

Qualquer tela que mostre porcentagem por setor tem que usar **a soma dos
setores** como denominador, nunca o total da empresa — senão as fatias passam de
100%.

### Retenção é descartada de propósito

`ehEquipeRetencao` (`analiticoComum.ts`) derruba a linha **antes** de salvar.
R$ 100.111,73 em agosto. Não é bug, e a sincronização não deve "recuperar" isso
sem uma decisão explícita.

---

## Divergências sistema × 59 que sobraram

Medidas depois de importar os fechamentos de agosto:

| Setor | Diferença | Causa |
|---|---|---|
| Play 4 | 0 | — |
| Play 5 | 0 | — |
| Play 3 | −792,98 | `analitico_colchao_fora_meta` não é limpa ao reimportar |
| Receptivo | −7.384,76 | idem (−7.722,87) · já descontado o descarte da Retenção |
| Play Mix | +690,00 | duas linhas carimbadas em Play 5 / Receptivo por importação antiga |

**A causa do Play 3 e do Receptivo é um defeito de código, não de dado:**
`limparDadosDoMes` e `limparDadosDoMesSetor` mexem só em
`analitico_recebimentos` e deixam `analitico_colchao_fora_meta` para trás. Toda
reimportação futura deixa resíduo novo. Ver a memória
`receptivo-retencao-e-colchao-residual`.

O Play Mix é diferente: limpeza por setor não alcança linha carimbada em outro
setor.

---

## Decisões que ainda não foram tomadas

- [ ] **Como o 59 é filtrado por setor.** Ele precisa reproduzir o mesmo recorte
  que o 58 faz (por equipe + setor), senão os dois nunca vão fechar.
- [ ] **O que acontece quando o 58 e o 59 discordam da equipe.** Regra proposta,
  não aprovada: equipe vem do 58, dinheiro vem do 59.
- [ ] **Alias de login.** `JOAO_FAUSTINO` (ERP) e `JADE_FAUSTINO` (sistema) são a
  mesma pessoa, que mudou de nome. Precisa de um mecanismo, não de um remendo —
  vai acontecer de novo. Ver a memória `jade-faustino-login-do-erp`.
- [ ] **Se a sincronização escreve ou só compara.** Escrever em
  `analitico_recebimentos` a partir do 59 é irreversível na prática, e hoje
  está proibido.

---

## Pendências menores, já levantadas

- [ ] `analitico_colchao_fora_meta` não é limpa na reimportação (defeito de
  código; gera resíduo novo a cada importação).
- [ ] 5 lotes `mestre_lotes` em estado `aberto` órfãos, 61.651 linhas. SQL de
  limpeza pronto (`delete from public.mestre_lotes where estado = 'aberto';`),
  **não autorizado**.
- [ ] Migration `20260908142410_chat_presenca_entre_empresas.sql` ainda não
  aplicada no banco.
- [ ] Play Mix: R$ 690,00 em duas linhas carimbadas fora do setor.
- [ ] Ajuste manual da Allana Barbosa em agosto (R$ 3.270,34) nunca reinserido
  depois do cancelamento.
- [ ] Colchão foi regra **exclusiva de agosto/2026** (`colchaoContaNaMeta`, dias
  01–14). Não generalizar.
