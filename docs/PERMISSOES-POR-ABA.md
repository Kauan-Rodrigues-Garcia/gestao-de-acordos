# Permissões por aba

Desde a migration `20260820210000_permissoes_por_aba.sql`, o modelo de acesso é:

```text
Cargo → aba principal → subaba/ação/escopo de dados
                     ↘ exceção por pessoa
```

Cada escopo pertence a um único módulo. Por exemplo,
`dashboard_escopo_todos_setores` não concede acesso a Acordos BP, Lixeira,
Tickets ou Pix Automático. As antigas categorias globais continuam somente no
JSON de backup/compatibilidade da implantação e não são consultadas pelos novos
resolvedores.

## Regras de operação

- Desligar a permissão principal torna todas as filhas inefetivas.
- Uma exceção por pessoa continua sobrescrevendo o cargo apenas naquela chave.
- PaguePlay usa as ações `dashboard_*`; BookPlay usa as ações de Acordos BP.
- Pix Automático é exibido dentro de Acordos, mas possui rota, escopos, ações e
  políticas independentes de `ver_acordos`.
- Novo Acordo é uma permissão própria, subordinada à ativação de Acordos BP.
- Alterar status e editar os demais campos de um acordo são ações distintas.
  A RLS autoriza o `UPDATE` e um trigger valida as colunas realmente alteradas.
- RPCs analíticas compartilhadas recebem `p_contexto` (`dashboard`,
  `analitico`, `painel_lider`, `diretoria` ou `pix_automatico`). O servidor
  resolve o escopo da aba informada e o contexto também compõe a chave de cache
  do frontend, impedindo reaproveitamento de dados entre abas.

O mapeamento central de escopos do frontend fica em
`src/lib/permissoes-escopo.ts`; o catálogo e as dependências hierárquicas ficam
em `src/lib/permissoes-catalogo.ts`.

## Implantação segura

1. Aplicar `20260820210000_permissoes_por_aba.sql`.
2. Confirmar que o bloco de verificação no fim da migration concluiu sem erro.
3. Publicar o frontend.
4. Conferir um cargo e uma exceção individual de cada tenant antes de editar a
   matriz em produção.

A migration é atômica, cria snapshots privados de `cargos_permissoes` e
`perfis_permissoes`, e deriva as chaves novas do acesso efetivo anterior. Ela
não executa `UPSERT` destrutivo nem reseed em empresas existentes.

## Rollback

As chaves antigas são preservadas durante a fase de expansão. Por isso, o
rollback normal é republicar o frontend anterior; não é necessário reverter os
mapas de permissão imediatamente.

Para desfazer também o banco, primeiro restaure as funções/policies da versão
anterior e só depois copie os mapas das tabelas
`permissoes_backup_20260820_abas_cargos` e
`permissoes_backup_20260820_abas_pessoas`. Restaurar apenas o JSON enquanto as
policies novas continuam ativas bloquearia os acessos baseados nas chaves
novas.

## Provas automatizadas

- `permissoes-catalogo.sql.test.ts`: catálogo TypeScript e SQL idênticos.
- `permissoes-catalogo.test.ts`: nenhuma chave decorativa ou órfã.
- `permissoes-escopo.test.ts`: uma concessão de uma aba não libera outra.
- `acordos-escopo-setor.sql.test.ts`: snapshot, atomicidade, RLS por tenant e
  contrato contextual das RPCs analíticas.
