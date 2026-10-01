# IAs do Comercial: tipo e vínculo a operador

Pedido de 01/10/2026. Migration `20261001150000_vendas_ia_vinculos.sql`.

## O problema

O Comercial tem logins de IA (`perfis.robo`) que vendem de verdade: a venda é
confirmada, assinada e soma no setor. Hoje ela fica só no setor — sem pessoa e
sem equipe. A gerência quer:

1. Ver quais logins são IA (uma etiqueta **IA**) e classificá-los por tipo
   (**Comum**, **Indicação**, e outros que forem criados).
2. Vincular uma IA a um operador: a venda da IA passa a contar para o operador
   e para a equipe dele, **uma vez só** no total geral.
3. Um card no Dashboard dizendo quanto do total veio de IA, por tipo.
4. Desvincular devolve o valor à IA; trocar passa para a outra pessoa — sem
   duplicar.

## Decisões

| Pergunta | Decisão |
|---|---|
| Quais vendas o vínculo pega? | Quem vincula escolhe, na hora: **mês inteiro** (desde o dia 1 do mês) ou **a partir de uma data**. O novo vínculo substitui tudo daquele dia em diante. |
| Onde o crédito é resolvido? | **Na leitura** (abordagem A). `vendas.operador_id` continua sendo a IA; nada é regravado. |
| Tag IA | É `perfis.robo`, que já existia. Sem coluna nova. |
| Tipo | Tabela `vendas_ia_tipos`, semeada com Comum e Indicação; `perfis.ia_tipo_id`. Marcado à mão — o nome do ERP é inconsistente (`(Comun)`, Antonio sem sufixo). |
| Quem mexe | `usuarios_editar_cargo`, a mesma chave da caixa «este login é automação». |

## A regra do crédito

> Venda de uma IA cuja data cai num período `[desde, ate)` de vínculo
> credita o operador do vínculo e a equipe dele. Fora de período, fica com a
> IA: conta no setor e em equipe nenhuma.

A data é `COALESCE(data_confirmacao, data_venda)`. Existe em dois lugares que
se citam: `fn_vendas_ia_credito` (SQL) e `creditoDaVenda` (`src/lib/vendasIa.ts`).
O teste de banco compara os dois dia a dia em três meses.

**Por que não duplica:** a venda continua sendo UMA linha. Total geral e total
do setor somam linhas e não mudam com vínculo nenhum. O vínculo só decide em
que pessoa e em que equipe a linha aparece.

## Peças

**Banco** (`20261001150000`)

- `vendas_ia_tipos`, `vendas_ia_vinculos` (sem sobreposição por IA),
  `vendas_ia_vinculos_historico` (antes/depois de cada troca).
- `fn_vendas_ia_vincular(ia, operador|null, desde)` — a única escrita nos
  vínculos. Trava a IA com `FOR UPDATE`; recusa não-IA, IA→IA e falta de
  permissão; apaga o que começaria depois de `desde`, corta o que atravessa,
  estende o período colado do mesmo operador.
- `fn_vendas_ia_definir_tipo`, `fn_vendas_ia_tipo_criar`.
- `fn_vendas_ia_cadastro(empresa)` — DEFINER, porque `perfis_select` não deixa
  o operador ler o perfil da IA.
- `vendas_select` ganha um caso: quem leva o crédito, e o líder da equipe dele
  (escopo 1), enxerga a venda da IA. **`fn_vendas_alcanca` não muda** — é o
  alcance de escrita, e levar o crédito não dá o direito de editar a venda.
- `fn_vendas_fechamento_do_setor` — equipe e natureza pelo crédito; total e
  destinos iguais.

**Front**

- `src/lib/vendasIa.ts` — `creditoDaVenda`, `creditarVendas`, `donoDaVenda`,
  `resumoDeIa`, `rotuloDoVendedor`.
- `vendas.service.ts` — toda busca de vendas passa por `creditarVendas`
  (cadastro das IAs com cache de 30 s, invalidado por toda escrita).
- `vendasPlacar.ts` — todo agrupamento por pessoa e equipe usa `donoDaVenda`.
- Telas: etiqueta IA em Usuários; aba **IAs** em Usuários (Comercial); card
  **Vendas via IA** no Dashboard; a lista de vendas mostra «IA · crédito de X».

## Fora do escopo

- Criar o setor Extreme, as equipes e os logins da lista de 01/10 (pedido
  separado, adiado pelo Cleber).
- Comissão/premiação pela venda da IA: o crédito entra no número da pessoa, e
  qualquer regra que leia esse número herda o crédito.
