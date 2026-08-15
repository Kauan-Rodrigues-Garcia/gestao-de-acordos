# Desempenho do Dia 2.0

**Data:** 2026-08-15
**Estado:** aprovado, em implementação
**Substitui:** `components/PainelDesempenhoDiario.tsx`, `hooks/useResumoDia.ts`, `components/ResumoDiario.tsx`

---

## O problema

O painel existe só na PaguePlay, desenhado como uma grade de seis a oito cards
iguais. Todos com o mesmo peso visual — nada se destaca, e o olho não sabe onde
pousar. Três defeitos são de conteúdo, não de estética.

### 1. A taxa de eficiência conta pendente como falha

`taxaEficiencia = qtdPagos / totalHoje`. Um acordo em `verificar_pendente` entra
no denominador e não no numerador, então ele derruba a taxa exatamente como um
`nao_pago` derrubaria.

Medido nos últimos 30 dias:

| operação | agendados | pagos | verificar_pendente | não pagos |
|---|---:|---:|---:|---:|
| BookPlay | 1.963 | 720 | **799 (41%)** | 444 |
| PaguePlay | 2.880 | 1.702 | **673 (23%)** | 505 |

A BookPlay leria 37% num dia em que nada deu errado — 41% dos acordos só ainda
não foram conferidos. O número não distingue "o cliente não pagou" de "ninguém
verificou ainda", que são problemas de pessoas diferentes.

### 2. O bloco de tags é o maior do painel e fica vazio quase sempre

Só 13 dos 1.963 acordos da BookPlay têm tag (0,7%); na PaguePlay, 16 de 2.880
(0,6%). O bloco ocupa o maior espaço vertical do painel e não aparece em ~99%
dos dias.

### 3. A fonte do dinheiro não é a que as metas usam

O painel soma `acordos` com `status='pago'` e `vencimento` no dia. As metas são
calibradas contra `analitico_recebimentos` — é assim que o Painel de Metas julga
o mês, e é de onde nasce o conceito de "não tabulado".

Últimos 14 dias, mesmas datas:

| operação | acordos tabulados | analítico (ERP) | diário (ERP) |
|---|---:|---:|---:|
| BookPlay | R$ 104.172 | R$ 1.413.487 | R$ 1.560.270 |
| PaguePlay | R$ 461.809 | R$ 1.036.639 | R$ 2.611.970 |

Na BookPlay o analítico é **13,6× maior**. Uma "meta do dia" comparada ao número
de acordos ficaria vermelha todo dia, para sempre, inclusive num dia excelente.

Os dois relatórios do ERP estão frescos: em 2026-08-15 ambos tinham dados até
2026-08-15, importados no mesmo dia. Usar o analítico não custa atualidade.

---

## A decisão central: uma fonte por pergunta

O painel responde a **duas** perguntas, e elas têm fontes diferentes:

```
"quanto entrou?"        → analitico_recebimentos   (o ERP)
"como está meu trabalho?" → acordos                (a tabulação)
```

Cada faixa declara a sua fonte no rótulo. Ninguém soma coisas de fontes
diferentes por acidente, e a meta passa a ser comparável com o que ela mede.

---

## Estrutura: três faixas

Continua flutuante no canto inferior esquerdo, abrindo pelo botão da barra
lateral — é o que preserva o uso atual, espiar o dia sem sair da tarefa. Largura
sobe de 390px para 420px.

### Faixa A — o dia em dinheiro (analítico)

Número grande, sozinho, sem card em volta. Na PaguePlay, alternador H.O./Bruto à
direita. Abaixo:

- **meta do dia** com barra de progresso — meta do mês ÷ dias úteis do mês;
- **chip de variação** contra ontem e contra a média dos últimos 7 dias úteis.

A meta do dia usa a mesma conversão de unidade de `lib/unidadeValor.ts`: a meta é
gravada em bruto e traduzida para H.O. quando a unidade ativa é H.O.

### Faixa B — a minha operação (acordos)

Uma barra empilhada de três segmentos, com legenda em linha:

```
Agendados hoje                                   83
▓▓▓▓▓▓▓▓░░░░░▒▒▒▒▒▒▒▒▒
■ 31 pagos   ■ 34 a verificar   ■ 18 não pagos
```

Ao lado, formalizados no dia. A taxa de eficiência sai.

Uma taxa de **conversão** permanece, mas com denominador honesto:
`pagos ÷ (pagos + não pagos)` — o que já foi conferido. Ela some quando não há
nenhum acordo conferido no dia, porque `0/0` não é 0%.

### Faixa C — contexto, só quando existe

Nenhuma destas ocupa espaço quando está vazia:

- **Direto / Extra** — PaguePlay, e só quando o setor tem a lógica ativa;
- **Pix Automático do dia** — BookPlay: quantos entraram e a comissão dos
  aprovados (`valor × pct_comissao`, que é fração: 0,25);
- **Tags** — só quando houver acordo com tag no dia.

---

## Interatividade

| gesto | efeito |
|---|---|
| `←` `→` | dia anterior / próximo (o próximo trava em hoje) |
| `Esc` | fecha |
| hover num segmento da barra | quantidade e valor daquele estado |
| alternador H.O./Bruto | troca a unidade de todos os valores de uma vez |

O alternador é persistido por usuário na mesma chave de `lib/unidadeValor.ts`,
então a escolha acompanha o Painel de Metas — dois lugares mostrando a mesma
unidade sem o usuário configurar duas vezes.

Os números fazem contagem curta ao trocar de dia, em vez de pular.

---

## Animação

Entrada em mola, escalonada por faixa (A, depois B, depois C). Barras crescem da
esquerda. Saída mais rápida que a entrada — fechar deve parecer imediato.

Tudo sob `prefers-reduced-motion`: com a preferência ligada, as mesmas
informações aparecem sem movimento, sem contagem e sem escalonamento.

---

## Diferenças por operação

| | PaguePlay | BookPlay |
|---|---|---|
| Alternador H.O./Bruto | sim | não — `total_ho` é zero em toda linha |
| Direto / Extra | quando o setor tem a lógica | não |
| Pix Automático do dia | não existe lá | sim |
| Meta do dia, barra de 3 estados, tags | sim | sim |

O painel deixa de ser exclusivo da PaguePlay. O botão na barra lateral passa a
respeitar a permissão `ver_analitico`, e não o slug.

---

## Arquitetura

```
lib/desempenhoDia.ts          agregação pura, sem React
  ├── barraEstados()          pago / a verificar / não pago
  ├── metaDoDia()             meta do mês ÷ dias úteis
  ├── variacao()              contra ontem e contra a média de 7 dias úteis
  └── comissaoPix()           valor × pct_comissao dos aprovados

hooks/useDesempenhoDia.ts     junta as quatro leituras
components/DesempenhoDia/
  ├── index.tsx               moldura, teclado, animação
  ├── FaixaDinheiro.tsx       faixa A
  ├── FaixaOperacao.tsx       faixa B
  ├── BarraEstados.tsx        a barra de três segmentos
  └── FaixaContexto.tsx       faixa C
```

O hook busca em paralelo: o dia no analítico (com o recorte de
`escopoAnalitico`), os acordos do dia, a meta do mês e o Pix do dia na BookPlay.
Ontem e a média de 7 dias úteis saem da **mesma** leitura do analítico, com a
janela ampliada — não são consultas extras.

---

## O que é removido

- o emoji `📊` do item de menu (o ícone em linha fica);
- os três cards de H.O. Total / Direto / Extra, substituídos pelo alternador;
- a taxa de eficiência com denominador enganoso;
- o bloco de tags permanente;
- o `StatCard` local — terceira cópia do mesmo componente no projeto;
- `hooks/useResumoDia.ts`;
- `components/ResumoDiario.tsx`, arquivo órfão que nenhum import alcança.

---

## Testes

Agregação pura, sem React:

- barra de três estados, incluindo o dia sem nenhum acordo;
- conversão some quando nada foi conferido (`0/0` não é 0%);
- meta do dia, incluindo mês sem meta gravada (devolve `null`, não zero);
- variação contra ontem quando ontem é zero (não divide por zero);
- média de 7 dias úteis pulando fim de semana e feriado;
- comissão do Pix ignorando pendente e desaprovado.

Contrato por operação:

- BookPlay não recebe alternador de unidade nem Direto/Extra;
- PaguePlay não recebe o bloco de Pix;
- o painel abre nas duas operações.
