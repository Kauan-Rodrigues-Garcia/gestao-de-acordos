# Aba Ouvidoria

**Arquivada em:** 05/09/2026

## O que era

Uma aba exclusiva da PaguePlay para registrar e acompanhar atendimentos de
ouvidoria — reclamações de cliente. Tinha concessão de acesso por pessoa
(`ouvidoria_acessos`), um responsável que via tudo, e quatro chaves de permissão
próprias.

## O CARGO `ouvidoria` NÃO foi removido

Isto é a distinção que importa neste arquivamento. `ouvidoria` é ao mesmo tempo:

- uma **aba** — removida, e é do que trata esta pasta;
- um **cargo** (`perfis.perfil = 'ouvidoria'`) — **mantido**, com tudo o que ele
  tem hoje: entra em `PERFIS_LIDER`, tem nível de escopo próprio, tem rótulo e
  cor, aparece no seletor de cargo em Usuários, no chat (`chat_cargo_ouvidoria`)
  e no painel de permissões como qualquer outro.

Quem tem o cargo continua trabalhando exatamente como antes — só não tem mais
essa aba. Confundir as duas coisas apagaria o cargo de gente real.

## O que veio para cá

```
src/pages/Ouvidoria/index.tsx    a tela
src/services/ouvidoria.service.ts as consultas
src/hooks/useOuvidoriaAcesso.ts   quem enxerga, e em qual nível
```

## O que foi removido do código vivo

- a rota `/ouvidoria` em `src/App.tsx` e `ROUTE_PATHS.OUVIDORIA` em `lib/index.ts`
- o item de menu e a regra especial dele em `lib/menuLateral.ts`, junto com o
  campo `acessoOuvidoria` do `ContextoMenu` (e o `useOuvidoriaAcesso` que o
  alimentava, em `Layout.tsx`)
- a aba `ouvidoria` de `lib/permissoes-abas.ts`
- as quatro chaves em `lib/permissoes-catalogo.ts`: `ver_ouvidoria`,
  `editar_ouvidoria`, `gerenciar_acessos_ouvidoria`, `ouvidoria_responsavel`
- a categoria "Ouvidoria" da lista de abas em `pages/Tickets/categorias.ts`,
  que era filtrada por `ver_ouvidoria`
- a prévia por cargo em `MenuLateralEditor.tsx`

## O que ficou de propósito

**O rótulo em `lib/telas-catalogo.ts` e as categorias em `lib/logs-catalogo.ts`.**
`uso_telas` e a tabela de logs guardam o que foi aberto e o que foi feito
enquanto a aba existia. Tirar o rótulo não apaga o passado — só o transforma em
chave crua na tela de Monitoramento de uso e no histórico de logs.

Em `MonitoramentoUso.tsx`, `ouvidoria` continua em `TELAS_EXCLUSIVAS`: assim ela
não aparece como "tela abandonada". Não foi abandonada — foi removida.

## Banco: uma migration PENDENTE

`supabase/migrations/20260905100000_remove_permissoes_ouvidoria.sql` tira as
quatro chaves do catálogo SQL (`fn_permissoes_catalogo`), no mesmo padrão da
remoção de 31/08. Sem ela, toda empresa nova nasceria com quatro interruptores
em Admin → Cargos que não ligam mais nada.

**Ela ainda não foi aplicada.** Aplicar é decisão do dono do banco.

Nada mais é apagado: `ouvidoria_acessos`, `ouvidoria_atendimentos` e os valores
já gravados em `cargos_permissoes.permissoes` / `perfis_permissoes` ficam como
estão. Uma chave fora do catálogo cai no ramo "ausente vale negado" de
`fn_user_tem`, e ninguém mais a consulta.

## Como voltar

Copiar a árvore `src/` desta pasta por cima de `src/`, refazer as pontas
listadas acima e reverter a migration.
