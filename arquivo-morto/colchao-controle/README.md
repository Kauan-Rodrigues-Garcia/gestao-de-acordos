# Controle do Colchão (aba Colchão do Analítico)

**Arquivado em:** 21/10/2026
**No ar desde:** 14/08/2026 (migration `20260814143858_analitico_colchao_fora_meta`)

## O que era

A aba **Colchão** dentro do Analítico. A cada importação do 58, as linhas com
«Colchão?» = Sim que ficavam fora da meta eram gravadas, uma a uma, na tabela
`analitico_colchao_fora_meta`. A aba listava essas linhas por dia e por
operador, com total do dia e do mês, e copiava os NRs no formato
«COLCHÃO dd/mm/aaaa». Era acompanhamento: nunca entrou em total nem em meta.

Só BookPlay (`!tenant.isPaguePlay`), atrás da chave `analitico_sub_colchao`.

## Por que saiu

Decisão de 21/10/2026: o controle do colchão não estava sendo utilizado.

## O que veio para cá

```
src/pages/Analitico/Colchao/            index (a aba) · helpers(+test)
src/services/analitico/colchao.service  importar, revincular órfãos e listar (+test)
```

## O que foi removido do código vivo

- a aba `colchao` em `pages/Analitico/index.tsx` (e o ícone `Layers3`, que era
  só dela); `?aba=colchao` agora abre o Analítico;
- a gravação em `analitico_colchao_fora_meta` e a revinculação de órfãos dela
  em `hooks/useAnaliticoImport.ts`, e os contadores «Colchão inserido / já
  existentes» do resultado em `ImportarModal.tsx`;
- a chave `analitico_sub_colchao` de `lib/permissoes-catalogo.ts` e de
  `lib/permissoes-abas.ts`.

## O que ficou de propósito — e por quê

**A regra do colchão continua viva e igual.** Colchão é a 2ª parcela em diante
de Pix Automático ou cartão recorrente; entra no total da empresa e não conta
para setor, equipe ou operador (exceção histórica: 01 a 14/08/2026). Ela mora em:

- `colchaoContaNaMeta` / `ehLinhaColchao` (`services/analitico/analiticoComum.ts`),
  usados pelos parsers do 58 (PaguePlay e BookPlay): a linha de colchão continua
  sendo tirada do Analítico na importação;
- `fn_mestre_conta_na_meta` no banco, que o 59 e o Painel Diretoria usam;
- o aviso da prévia da importação, que continua dizendo quantas linhas de
  colchão ficaram fora da meta.

Por isso **nenhum mês muda**: o que já foi importado continua como está, e as
importações novas tiram o colchão da meta exatamente como antes. A única
diferença é que essas linhas não são mais copiadas para a tabela de
acompanhamento.

**O rótulo `colchao` em `lib/telas-catalogo.ts`** fica: `uso_telas` guarda as
visitas à aba enquanto ela existia.

**A tabela `analitico_colchao_fora_meta`** e as linhas já gravadas ficam no
banco. A trava de exclusão de setor (`20260916100000`) ainda as conta. Apagar a
tabela é decisão à parte, com o dono do banco na sala.

## Banco: uma migration PENDENTE

`supabase/migrations/20261021150000_remove_permissao_colchao.sql` tira a chave
`analitico_sub_colchao` do catálogo SQL (`fn_permissoes_catalogo`), no mesmo
padrão da remoção do Modo TV. Sem ela, empresa nova nasce com um interruptor em
Admin → Cargos que não liga nada — não quebra nada.

**Ela ainda não foi aplicada.** Aplicar é decisão do dono do banco.
