# Relatório 59 — conferido e aprovado (25/08/2026)

Servidor de arquivos da empresa (`\\servarq\Dados`, montado como `Y:`), atualizado
por rotina. Caminho:

```
\\servarq\Dados\Cobranca\Multiplay\OPERADORES\Cleber Junior\Base\rel_59\rel_59_202608.csv
```

O objetivo era responder uma pergunta: **dá para trocar a importação manual do
rel_58 por uma rotina automática lendo o rel_59, sem risco de o número mudar?**

A resposta é **sim**. O que segue é a prova, para ninguém ter que refazer.

## O medo, e por que ele caiu

O rel_58 é o que a liderança importa hoje pela tela — um arquivo por setor, 16
colunas. O rel_59 é um arquivo só, com todos os setores e 28 colunas. O receio
era o ERP mexer num e não no outro, e os dois passarem a discordar em silêncio.

Comparado **arquivo contra arquivo**, setor Play 5, agosto/2026:

| | rel_58 (`1600.xlsx`) | rel_59 (CSV) |
|---|---|---|
| Linhas, dias 01–24 | 1.585 | 1.585 |
| Recebido | R$ 260.384,42 | R$ 260.384,42 |
| Colchão = Sim | 16 linhas, R$ 1.613,92 | 16 linhas, R$ 1.613,92 |

Diferença: **R$ 0,00**.

E não foi o total fechando por acaso. O cruzamento foi por chave
`operador + NR + parcela + dia + marcação de colchão` nos 1.585 registros:
**zero chave só no 58, zero chave só no 59**. Todo dia bate ao centavo.

O rel_59 é o rel_58 com mais colunas. Mesmo dado, mesmo valor, mesma marcação.

## A única diferença: o dia corrente

| Dia 25 | Linhas | Valor |
|---|---|---|
| rel_58 (baixado 16:00) | 55 | R$ 13.091,64 |
| rel_59 | 29 | R$ 3.647,43 |
| | | **R$ 9.444,21** |

Não é divergência de conteúdo — é **idade**. Confirmado com a empresa em
25/08/2026: o rel_59 atualiza **só no início do dia**. Há ticket aberto na TI
para passar a de hora em hora.

Observado no dia: o arquivo foi reescrito às 13:49, 15:18 e 15:52 — sempre
38.503 linhas e R$ 8.867.372,60. **Três gravações, zero dado novo.**

> ⚠️ A rotina toca no arquivo mesmo quando não há dado novo. Quem for automatizar
> **não pode decidir "mudou" pelo `mtime`** — tem que comparar o conteúdo (hash).
> Confiar na data do arquivo faria a tela dizer "sincronizado às 15:52" mostrando
> número da madrugada, que é pior do que não dizer nada.

## O layout, e o que encaixa direto no parser

28 colunas, UTF-8 com BOM, separador `;`, sem aspas, decimal com ponto, datas
ISO. Todas as 38.503 linhas com os 28 campos — nenhuma linha torta, e **sem
rodapé de total** (o xlsx do rel_58 tem; ver a seção final).

O `bookplayRecebimentoParser` reconhece sozinho, pelos aliases que já existem:

| O parser procura | Coluna no rel_59 |
|---|---|
| Cobradora | `Cobradora` |
| Equipe/SubGrupo | `SubgrupoEquipe` |
| Cliente | `Cliente` |
| Colchão? | `Colchão?` |
| Título / Parcela | `Titulo` / `Parcela` |
| NrDocumento | `NrDocumento` |
| Empresa | `Empresa` |
| TpDoc | `TpDoc` |
| DtPgto | `DtPgto` |
| Recebido | `Recebido` |

Conferido coluna a coluna que o layout novo não cria colisão: `DtLig` não rouba
o `DtPgto`, `TipoVenda` não rouba o `TpDoc`, `Colchão?` não é capturado por
alias anterior.

`parseRelatorioBookplayRows(rows)` recebe linhas cruas — sem `File`, sem xlsx.
É a emenda que uma automação usa para rodar **o mesmo código da tela**, sem
duplicar regra nenhuma.

### A coluna `Colchão?` chegou em 25/08/2026

Não existia de manhã. Foi pedida e entregue no mesmo dia, na posição certa
(entre `Titulo` e `Parcela`). `norm('Colchão?')` vira `colchao?`, que é o alias
já cadastrado — **zero código novo**.

No mês: 2.748 linhas, R$ 363.015,65. Pela regra do corte (`colchaoContaNaMeta`,
pago até 14/08/2026): 1.746 linhas / R$ 230.631,09 entram na meta, e 1.002 /
R$ 132.384,56 ficam fora.

Sem essa coluna, uma importação automática teria contado os R$ 363 mil como
recebimento normal.

### O que ainda falta ajustar

**`Tipo` não é lido.** A coluna do Direto/Extra chama-se `Tipo` no rel_59
(`Integral` / `Extra`), e o alias no código é `['tipocomissao','tipodecomissao']`.
Não casa por igualdade nem por `startsWith` — os **R$ 700.902,46 de Extra do mês
seriam descartados em silêncio**. É uma linha em cada parser.

## O que o rel_59 traz a mais

Onze colunas que a planilha não recebe hoje:

- **`Tipo`** — Integral / Extra, o Direto/Extra vindo pronto do ERP
- **`Setor`** e **`NomeGrupoFiltro`** — o `Setor` codifica a transferência:
  `COB RECEPTIVO - BEATRIZ - COB PLAY 1 - PAOLA` é receptivo recebendo *para* o
  Play 1. A Contribuição Receptivo, explícita na linha.
- **`OperadorOrig`** e **`SetorOrig`** — de quem era antes (22% preenchido)
- **`DDD1`, `Fone1`** — telefone do cliente
- **`PrevPgto`, `Dias`, `DiasAtraso`, `DiasLigacaoBaixa`, `TipoVenda`, `CodCli`,
  `CodGrupo*`**

O `TpDoc` vem mais rico que no rel_58: 9 formas, com `PIX AUTOMÁTICO` e
`RECORRENTE` separados, e **sem nenhum vazio**. A regra "TpDoc vazio = cartão de
crédito" do rel_58 não se aplica aqui — neste relatório o cartão vem escrito.
Os dois caem no mesmo enum `cartao`, então a chave única do banco continua
batendo entre as duas origens.

## Mapeamento de setor

O filtro que reproduz o rel_58 de um setor é o **`NomeGrupoFiltro`**, não o
`Setor`:

| Filtro para o Play 5 | Linhas | Operadores |
|---|---|---|
| `NomeGrupoFiltro = 'MARILIA - PLAY 5'` | 1.614 | 44 — todos presentes no rel_58 |
| `Setor = 'MARILIA - PLAY 5'` | 1.140 | 28 — faltam 19 |

No Receptivo (`COB RECEPTIVO - BEATRIZ`) os dois filtros dão praticamente o mesmo
total; a escolha só importa para setores que recebem transferência.

## Como o colchão é decidido (não é reproduzível)

Tentativa de derivar a marcação a partir das outras colunas, para o caso de ela
sumir de novo. **Não deu.** Fica registrado o que se aprendeu:

- **100%** das linhas de colchão são `PIX AUTOMÁTICO` ou `RECORRENTE` — zero
  exceção
- 97,3% têm parcela ≥ 2 (74 linhas de parcela 1 escapam)
- o que separa de verdade é o **tempo entre negociação e pagamento**
  (`DiasLigacaoBaixa`): com ≤ 7 dias são 364 colchões contra 3.271 não-colchões;
  com ≥ 8 a proporção inverte, 2.384 contra 134

É a definição real: recebimento automático de acordo **feito num período
anterior** — dinheiro que cai sem trabalho novo no mês.

Mesmo assim nenhuma fórmula bate exato. A melhor chega a ~87% de concordância.
Há regra interna do ERP que não está nas 28 colunas. **Depender da coluna, não
tentar recalcular.**

## Achado separado: banco × relatório

Comparando o **banco** (setor Receptivo, importado do rel_58) contra o rel_59,
dias 01–24, o saldo é quase zero — mas por compensação, não por igualdade:

- **R$ 15.518,64** que o banco tem **a mais** que o relatório
- **R$ 15.632,99** que o relatório tem a mais que o banco

O segundo lado é normal: pagamento que entrou depois da última importação
daquele líder, e some sozinho na próxima.

O primeiro lado não. É dinheiro no banco que o relatório **não mostra mais** — o
`importarLoteAnalitico` nunca rebaixa valor ("só aumenta", para relatório parcial
não derrubar acumulado). Quando o valor de um NR cai entre duas importações, o
sistema fica com o antigo, maior, e ninguém fica sabendo.

R$ 15,5 mil num setor, num mês, invisível. **Não tem relação com o rel_59** — é
consequência de ter dois momentos de importação, e some quando a fonte virar
única. Registrado aqui para não se perder.

## Rodapé do xlsx do rel_58

A última linha do `1600.xlsx` é um total: tudo nulo, menos `Recebido` =
R$ 273.476,06. O parser já descarta (não tem operador nem NR), mas empurrando um
`Linha 1642: dados incompletos` na lista de erros da tela.

Ou seja: **toda importação manual da BookPlay mostra hoje um erro que não é
erro.** Vale calar quando alguém encostar no parser.

## Situação em 25/08/2026

- rel_59 **conferido e aprovado** para virar fonte da automação
- bloqueio: atualiza uma vez por dia; **ticket aberto na TI** para hora em hora
- decisão de arquitetura: fonte única (rel_59), com o import manual mantido como
  quebra-vidro — não apagado. Ver a conversa de 25/08 sobre o risco de dois
  escritores no mesmo espaço de chave.
- ainda sem PaguePlay equivalente (segue importação manual)
- Comercial tem fonte própria (`Base/Prospc/Prospeccao_202608.csv`, 60 colunas,
  5.239 vendas) — atualização futura

### Vizinhos na mesma pasta, não usados ainda

- `Base/usuarios.csv` — cadastro do ERP: `Uid, Login, Nome, CodGrupo, NomeGrupo,
  Ativo, CodSubGrupo, NomeSubGrupo, CodFranquia, NomeFranquia, DtAdmissao,
  DtDemissao`. 18.472 pessoas, 1.449 ativas.
- `Base/Prospc/Prospeccao_202608.csv` — o Comercial. **Cuidado:** números em dois
  formatos no mesmo arquivo — `Valor_Faturamento` vem `3.816,00` (pt-BR) e
  `Total_Recebido` / `Valor_Parcela` vêm `159.0`. Consistente por coluna, mas
  quem escrever o parser precisa saber antes.
