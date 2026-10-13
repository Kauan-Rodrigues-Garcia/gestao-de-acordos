# Modo TV

**Arquivado em:** 13/10/2026
**No ar desde:** 01/09/2026 (migration `20260902110000_modo_tv_fase_1`)

## O que era

A apresentação que rodava no PC ligado à TV do setor por HDMI. Duas telas:

- **A mesa** (`/modo-tv`): onde se montavam as cenas (fontes, fundo, relógio,
  métricas do setor, jogos, sorteio, bingo, alertas ao vivo), com prévia, «no
  ar» e o corte, e onde se cadastravam as telas e as imagens da biblioteca.
- **O palco** (`/tv/:slug`): a tela cheia que a TV mostrava o dia inteiro,
  lendo a cena no ar por uma RPC só (`fn_tv_palco`). Exigia login desde a
  auditoria de 06/10/2026.

Só BookPlay, e atrás da chave `ver_modo_tv`, que nascia desligada para todo
cargo configurável.

## Por que saiu

Decisão de 13/10/2026: o Modo TV não será utilizado.

## O que veio para cá

```
src/pages/ModoTV/     index · PainelEstudio · Palco · Galeria · Jogos
                      AlertaAoVivo · useModoTV · geometria(+test)
                      slug(+test) · templates(+test)
src/pages/TvPalco.tsx o palco
```

## O que foi removido do código vivo

- as rotas `/modo-tv` e `/tv/:slug` em `src/App.tsx`, e `ROUTE_PATHS.MODO_TV`
  e `ROUTE_PATHS.TV_PALCO` em `lib/index.ts`
- o item de menu em `lib/menuLateral.ts` (e o ícone `Tv` importado só para ele)
- a aba `modo_tv` de `lib/permissoes-abas.ts`
- o grupo «Modo TV» e as cinco chaves em `lib/permissoes-catalogo.ts`:
  `ver_modo_tv`, `tv_editar_cenas`, `tv_cortar`, `tv_gerenciar_telas`,
  `tv_enviar_midia`

## O que ficou de propósito

**O rótulo `'modo-tv'` em `lib/telas-catalogo.ts`** e a regra que não mede
`/tv/:slug`. `uso_telas` guarda o que foi aberto enquanto a tela existia; tirar
o rótulo transformaria esse histórico em chave crua no Monitoramento de uso.

Os tipos de `fn_tv_palco` em `lib/database.types.ts` também ficam: o arquivo é
gerado a partir do banco, e a função continua lá.

## Banco: uma migration PENDENTE

`supabase/migrations/20261013160000_remove_permissoes_modo_tv.sql` tira as cinco
chaves do catálogo SQL (`fn_permissoes_catalogo`), no mesmo padrão da remoção
da Ouvidoria. Sem ela, toda empresa nova nasceria com cinco interruptores em
Admin → Cargos que não ligam mais nada.

**Ela ainda não foi aplicada.** Aplicar é decisão do dono do banco.

Nada mais é apagado. Continuam no banco:

- tabelas `tv_telas`, `tv_cenas`, `tv_estado`, `tv_fontes`, `tv_midias`,
  `tv_alertas`, `tv_sorteios`
- funções `fn_tv_palco`, `fn_tv_cortar`, `fn_tv_rotacao`, `fn_tv_sinal_vida`,
  `fn_tv_metricas_setor`, `fn_tv_alerta_disparar`, `fn_tv_sorteio_*`,
  `fn_tv_bingo_*`
- o bucket de storage `tv`
- os valores já gravados em `cargos_permissoes.permissoes` / `perfis_permissoes`

Migrations que criaram isso (ficam em `supabase/migrations/`, sempre):

```
20260902110000_modo_tv_fase_1          20260903240000_tv_palco_desafio_coluna_certa
20260902120000_modo_tv_fundo_e_relogio 20260903250000_tv_metricas_do_setor
20260902130000_modo_tv_fase_2_e_3      20260903260000_tv_palco_metricas_e_equipe
20260902140000_modo_tv_fase_4_e_6      20260903270000_tv_palco_jogo_por_tipo
20260903280000_tv_jogos_fase_3         20261006260000_seguranca_tv_exige_login
```

Apagar tabela, função ou bucket é decisão à parte, com o dono do banco na sala.

## Como voltar

Copiar a árvore `src/` desta pasta por cima de `src/`, refazer as pontas
listadas acima e reverter a migration de remoção das chaves. O
`git log --follow` de cada arquivo alcança a história inteira.
