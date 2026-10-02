# Reorganização empresa > setor > equipe > cargo — estado e retomada

Atualizado em 02/10/2026: fases 2 a 6 em `main`.

Plano completo (diagnóstico e as 7 fases):
https://claude.ai/code/artifact/a95081b0-ebf0-4027-b599-67d617ee00bc

## Como retomar numa sessão nova

As fases 2 a 6 estão em `main` e aplicadas no banco. Só falta a fase 7, que não
começa antes de novembro/2026.

Peça: «Continuar a reorganização da hierarquia a partir de
`docs/REORGANIZACAO-HIERARQUIA-ESTADO.md`, em `main`. Próximo passo: fase 7.»

A sessão nova deve:

1. Ler este arquivo, o `CLAUDE.md` (regra do banco) e o plano acima.
2. Criar a branch da fase 7 a partir de `main` e abrir o PR em rascunho.
3. Não rodar nada no banco sem um «pode» explícito para aquela operação.

## Regras combinadas (valem para todas as fases)

- Responder em português; citar `arquivo:linha`.
- Um PR em rascunho por fase.
- **Banco é produção.** Nenhuma leitura ou escrita sem autorização explícita
  daquela operação (`CLAUDE.md`). Ao propor: SQL exato, o que altera, quantas
  linhas.
- O MCP do Supabase trava em DDL (confirmado de novo na fase 6: timeout, nada gravado) (ALTER/DROP/CREATE). Para migrations: gerar um
  script único em `/mnt/project-files/faseN/aplicar_faseN.sql` com
  `BEGIN`/`COMMIT`, uma prova que desfaz tudo se algo divergir, o `INSERT` em
  `supabase_migrations.schema_migrations ... ON CONFLICT DO NOTHING` e um
  `SELECT` de conferência no fim. O Cleber roda no SQL Editor e devolve o
  resultado. Se o editor perguntar sobre RLS e o script já liga o RLS, escolher
  «Run without RLS».
- Antes de mandar o script, testar a migration num Postgres 16 local
  (`/usr/lib/postgresql/16/bin`) com tabelas mínimas e cenários de borda,
  inclusive forçando a prova a falhar.
- Cargos são globais (iguais para todas as empresas); permissão segue por
  empresa em `cargos_permissoes`.
- Não mexer em velocidade da suíte de testes (pedido do Cleber).
- Desejo futuro, fora do plano: setor com mais de uma cidade (multirregião).

## Situação por fase

| Fase | O que é | PR | Banco |
|---|---|---|---|
| 1 | Medir (só leitura) | — | feito em 02/10, tudo zerado |
| 2 | Tabela `cargos` + FKs | #39, em `main` | aplicada 02/10: cargos=10, fks_validadas=2 |
| 3 | Listas de cargo viram atributos; `fn_user_tem` e `fn_perfis_escopo_empresa` leem `cargos`; chave `campanha_escopo_todos_setores` | #40, em `main` | aplicada 02/10: as duas checagens true; chave no catálogo |
| 4 | `equipes.setor_id/empresa_id` NOT NULL, FKs compostas empresa>setor>equipe | #41, em `main` | aplicada 02/10: fks_validadas=2, equipes_aceitam_nulo=0 |
| 5 | `equipe_membros` + espelho por gatilho; 5 funções de equipe leem dela | #42, em `main` | aplicada 02/10: membros=311, lideres=46, clones=51, funcoes=5, gatilhos=4 |
| 6 | `setores.tipo` + regra única do Núcleo lida de `cargos`; `empresas.variante` e `isPaguePlay` lendo dela | #45, em `main` | aplicada 02/10 pelo SQL Editor: setores_nucleo=1, assistentes_no_nucleo=4, variantes bookplay/pagueplay, gatilhos=3 |
| 7 | Limpeza | — | pendente, só depois de um mês fechado sem divergência |

Todos entraram em `main` em 02/10/2026 (merge 710699f0).

## Fase 6 — feita (código e banco)

- Migration `20261002230000_setor_tipo_e_variante.sql`, testada em PGlite
  (`src/lib/__tests__/setorTipoEVariante.sql.test.ts`) e em Postgres 16.
- `numeros_config.setor_nucleo_id` continua sendo onde se escolhe o Núcleo;
  gatilho espelha em `setores.tipo`; índice único: um Núcleo por empresa.
- Front: `lib/variante.ts` (registro por slug, abastecido por `useEmpresa` e
  `fetchEmpresas`); `isPaguePlay` e `getTenantCapabilities` leem dele.
  `CARGO_DO_NUCLEO` sai de `cargos.exige_tipo_setor`.
- Correção paralela: embeds de `perfis` nomeiam a chave de `setores`/`equipes`
  (FK composta da fase 4 causou `PGRST201`, lista de Usuários vazia). PR #44.

## Fase 6 — plano original

Do plano: «setores.tipo, preenchido com nucleo a partir de
numeros_config.setor_nucleo_id; o gatilho do Núcleo passa a ler
cargos.exige_tipo_setor. empresas.variante entra, e isPaguePlay(slug) passa a
ler a variante; os 439 usos ficam como estão, só a função muda.»

- `setores.tipo` (texto, ex. `operacao`, `nucleo`), preenchido a partir de
  `numeros_config.setor_nucleo_id`. Contar antes (com autorização) quantos
  setores viram `nucleo`.
- Gatilho `fn_perfis_cargo_do_nucleo`
  (`supabase/migrations/20260911121000_assistente_adm_trava.sql:75`) passa a
  ler `cargos.exige_tipo_setor` em vez da lista escrita. Ler a definição de
  produção com `pg_get_functiondef` antes (pedir autorização).
- Regra única do plano: se `pertence_a_setor` é falso, setor nulo; se
  `exige_tipo_setor` está preenchido, o setor tem de ser daquele tipo; setor de
  tipo exclusivo só aceita os cargos que o exigem.
- `empresas.variante`; `isPaguePlay(slug)` em `src/lib/index.ts:455` passa a
  ler a variante. Os usos dela não mudam.
- Front: `cargoDoNucleo.ts` (`CARGO_DO_NUCLEO`, `CARGOS_FORA_DO_NUCLEO`) passa a
  ler o atributo.

## Fase 7 — limpeza (não antes de novembro/2026)

Só depois de um mês fechado (outubro/2026) sem divergência entre
`equipe_membros` e as tabelas antigas.

- Conferir a divergência (leitura, pedir autorização): comparar
  `equipe_membros` com `perfis.equipe_id` (sem cargo `lider`),
  `equipe_lideres` e `equipe_operadores_clones`.
- Passar as telas que GRAVAM equipe a gravar em `equipe_membros`, e os demais
  leitores do front (cerca de 140 referências às tabelas antigas em `src/`).
- Passar `fn_composicao_mes_snapshot` a ler `equipe_membros`.
- Remover `perfis.equipe_id`, `perfis.lider_id`, `equipe_lideres` e
  `equipe_operadores_clones` (ou deixá-las como views), o CHECK antigo de
  cargo e as listas mortas do front; atualizar `ARQUITETURA.md`.

## Lição das fases 4 e 5: embeds do PostgREST

FK nova entre duas tabelas que já tinham uma (fase 4: `perfis`→`setores`
composta) ou tabela de junção nova (fase 5: `equipe_membros` entre `perfis` e
`equipes`) deixa ambíguo todo embed sem chave (`setores(...)`), e o PostgREST
recusa a consulta inteira (PGRST201). Correção: nomear a chave
(`setores!perfis_setor_id_fkey`, `equipes!perfis_equipe_id_fkey`); o teste
`src/lib/__tests__/embedsDePerfis.test.ts` trava isso a partir de `perfis`.
Antes de criar FK ou junção na fase 7, procurar os embeds afetados.

## Pendências soltas

- `fn_permissoes_semear_empresa` ainda tem uma lista de cargos escrita à mão
  (última definição em
  `supabase/migrations/20260815164659_fechamento_configuravel_e_semeadura_com_padrao.sql`). Fica para
  a fase 7, ou antes se alguém criar empresa nova.
- Na fase 5, a reserva da composição para a coluna `conta_recebimento` ausente
  (migration de julho) saiu; a porta única é
  `src/services/equipes/equipeMembros.ts`, que cai nas tabelas antigas se
  `equipe_membros` não responder.
- As telas de cadastro de equipe ainda gravam nas tabelas antigas;
  os gatilhos `trg_equipe_membros_espelho` (em `perfis`, `equipe_lideres`,
  `equipe_operadores_clones` e `equipes`) mantêm a nova em espelho. Não
  desligar esses gatilhos antes da fase 7.
