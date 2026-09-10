## 0. Regra que vale para todas as tarefas de banco

- [ ] 0.1 Nenhum arquivo `.sql` deste change é executado contra o Supabase sem
      autorização explícita do Kauan **para aquela operação**. Escrever o
      arquivo é livre; aplicar não é. Ver `CLAUDE.md`.
- [ ] 0.2 Antes de aplicar qualquer migration, conferir o objeto no schema
      (`to_regclass`, `pg_proc`) em vez de confiar em `list_migrations` — o
      histórico em `supabase_migrations.schema_migrations` está defasado.

## 1. Regras puras e formato do número (sem banco, sem tela)

- [x] 1.1 Criar `src/services/numeros/numerosFormato.ts`: `normalizarNumero`
      (só dígitos, remove `+55` inicial quando sobra 12–13 dígitos),
      `validarNumero` (10 ou 11 dígitos, DDD 11–99), `mascararNumero`
      (`(18) 99999-9999` / `(18) 9999-9999`)
- [x] 1.2 Criar `src/services/numeros/numerosRegras.ts`: `LIMITE_POR_CELULAR = 6`,
      `SITUACOES`, `POSSES`, `MOTIVOS_RETORNO` com rótulos em português, e
      `podeLiberarAoSetor` / `podeLancarAoOperador` / `podeRelancar` /
      `podeDevolver` como funções puras sobre `{ situacao, posse, operador_id }`
- [x] 1.3 Testes de `numerosFormato`: máscara e número cru colidem depois de
      normalizar; `+5518999999999` normaliza igual a `18999999999`; 9 dígitos e
      DDD 09 são recusados
- [x] 1.4 Testes de `numerosRegras`: cada transição aceita e recusa os estados
      certos; o limite é 6

## 2. Migration 1 — tabelas, índices e triggers

- [x] 2.1 Criar `supabase/migrations/<ts>_numeros_whatsapp.sql` com cabeçalho
      explicando o processo e as decisões, no estilo de `20260823090000_rh_gestao.sql`
- [x] 2.2 `numeros_config` (PK `empresa_id`, `setor_nucleo_id` → `setores`
      `ON DELETE RESTRICT`, autoria)
- [x] 2.3 `numeros_celulares` + índice único por `(empresa_id, lower(trim(identificacao)))`
      + índice `(empresa_id, setor_id) WHERE ativo`
- [x] 2.4 `numeros_whatsapp` com os `CHECK` de `situacao`, `posse` e o de
      coerência `posse <> 'nucleo' OR operador_id IS NULL`, `UNIQUE (empresa_id, numero)`
      e os três índices do design
- [x] 2.5 `numeros_movimentacoes` append-only, com os snapshots **sem FK** e os
      dois índices
- [x] 2.6 Trigger `fn_numeros_whatsapp_valida` — `BEFORE INSERT OR UPDATE` em
      `numeros_whatsapp`: sobrescreve `setor_id` com o do celular, confere a
      empresa e aplica o limite (as tres perguntas usam a MESMA leitura
      travada do celular, entao viraram uma funcao so)
- [x] 2.7 O limite de 6 dentro dela, com `SELECT ... FOR UPDATE` na linha do
      celular antes de contar; so conta quando um numero ENTRA no aparelho
- [x] 2.8 Trigger `fn_numeros_celular_valida` — `BEFORE INSERT OR UPDATE` em
      `numeros_celulares`: setor da mesma empresa, e recusa troca de
      `setor_id` havendo numero vinculado
- [x] 2.9 `fn_numeros_sou_do_nucleo(uuid)` e `fn_numeros_visivel(uuid, uuid, uuid)`,
      `STABLE SECURITY DEFINER SET search_path`, com `REVOKE ... FROM PUBLIC` e
      `GRANT EXECUTE ... TO authenticated`
- [x] 2.10 `fn_numeros_movimentacao(...)` — monta `descricao` em português e
      grava; `REVOKE ... FROM PUBLIC` (só as RPCs chamam)
- [x] 2.11 `src/services/numeros/__tests__/numerosBanco.sql.test.ts` — trava as
      garantias da migration por leitura do SQL, no padrao de
      `rhSeguranca.sql.test.ts`. Nao estava no plano; entrou porque e como
      este repo prova regra que mora no banco

## 3. Migration 2 — RPCs de transição e RLS

- [ ] 3.1 Criar `supabase/migrations/<ts>_numeros_whatsapp_fluxo.sql`
- [ ] 3.2 `fn_numeros_liberar_ao_setor(p_numero_id)` — exige Núcleo +
      `numeros_liberar_ao_setor`, `posse='nucleo'`, `situacao='ativo'`
- [ ] 3.3 `fn_numeros_lancar_ao_operador(p_numero_id, p_operador_id)` — exige
      `chips_lancar_ao_operador`, escopo de setor, `posse='setor'`, e que o
      operador seja do mesmo setor do número
- [ ] 3.4 `fn_numeros_devolver_a_lideranca(p_numero_id, p_motivo, p_observacao)`
      — exige `chips_devolver_a_lideranca` e `operador_id = auth.uid()`
- [ ] 3.5 `fn_numeros_relancar_ao_nucleo(p_numero_id, p_motivo, p_observacao)` —
      exige `chips_relancar_ao_nucleo`, escopo de setor, motivo obrigatório
- [ ] 3.6 `fn_numeros_alterar_situacao(p_numero_id, p_situacao)` — exige Núcleo +
      `numeros_administrar`
- [ ] 3.7 Todas as cinco: `SECURITY DEFINER SET search_path TO 'public'`,
      `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO authenticated`, e
      gravam movimentação antes de retornar
- [x] 3.8 `ENABLE ROW LEVEL SECURITY` nas 4 tabelas — **feito na migration 1**
      (20260910190000), sem policy nenhuma, para a janela entre as duas
      migrations negar tudo em vez de liberar tudo
- [ ] 3.9 Policies de `SELECT` chamando `fn_numeros_visivel`, com as chamadas
      envoltas em `(SELECT ...)` para o planejador avaliar uma vez, não por
      linha (padrão de `20260910180000`)
- [ ] 3.10 Policies de escrita: `INSERT`/`UPDATE`/`DELETE` de celular e número
      só para o Núcleo com `numeros_administrar`; `numeros_config` só com
      `numeros_configurar`; `numeros_movimentacoes` **sem** policy de `UPDATE`
      nem de `DELETE`

## 4. Migration 3 — permissões e ponto de partida

> **Descoberta que muda a ordem do plano.** Os dois catálogos são amarrados por
> dois testes de contrato, e eles se contradizem enquanto o módulo está pela
> metade:
>
> - `permissoes-catalogo.sql.test.ts` exige que SQL e TypeScript tenham
>   **exatamente** as mesmas chaves, tenants, padrões e marcação de explícita;
> - `permissoes-catalogo.test.ts` exige que **toda** chave do catálogo seja
>   consultada por código real (`temPermissao`, `requiredPermissao`,
>   `permissao:`, ou via `escopoEfetivo('chips')`).
>
> Não existe ordem em que estes três — migration 3, catálogo TS e as telas —
> possam entrar separados com a suíte verde. Os blocos **4 e 9 fecham junto com
> 5–8**, num commit só. A migration 3 também não é aplicada antes disso: aplicar
> abriria 10 toggles no painel para telas que ainda não existem.

- [x] 4.1 Criar `supabase/migrations/<ts>_numeros_whatsapp_permissoes.sql`
- [x] 4.2 `CREATE OR REPLACE FUNCTION fn_permissoes_catalogo()` acrescentando as
      10 chaves com `tenants = ARRAY['bookplay']`, mantendo **todas** as
      existentes intactas; `numeros_configurar` com `explicita = true`
- [x] 4.3 `CREATE OR REPLACE FUNCTION fn_abas_escopo()` acrescentando
      `('chips', 'ver_meus_chips')` às nove entradas atuais
- [x] 4.4 Laço `DO $semear$` acrescentando as chaves novas a `cargos_permissoes`
      de cargo existente, no molde de `20260823092000`
- [x] 4.5 Semear `numeros_config` da BOOKPLAY apontando o setor
      `Núcleo de Inteligência e Gestão`, **por nome e só se existir**; `RAISE
      NOTICE` quando não existir, sem criar setor
- [x] 4.6 Bloco de verificação no fim: as 10 chaves existem no catálogo, a aba
      `chips` aponta para chave que existe, e a acumulação não perdeu o
      catálogo anterior
- [x] 4.7 Lado TypeScript, adiantado de 9.4 porque o contrato SQL↔TS não aceita
      um lado só: as 10 chaves em `permissoes-catalogo.ts`, o grupo
      `'Controle de Números'`, `numeros_configurar` em `PERMISSOES_EXPLICITAS`
- [x] 4.8 `ABAS_COM_ESCOPO.chips` em `permissoes-escopo.ts`, níveis
      `['individual', 'setor']`
- [x] 4.9 Dois cards em `MODULOS_PERMISSAO` (`permissoes-abas.ts`): um grupo de
      catálogo vira DOIS cards, porque são as duas pontas do mesmo caminho —
      senão `permissoes-abas.test.ts` acusa permissão fora de card
- [ ] 4.10 **Pendente até as telas existirem:** aplicar a migration 3 e commitar

## 5. Camada de serviço

- [ ] 5.1 Criar `src/services/numeros/numeros.service.ts` com as leituras:
      `listarCelulares`, `listarNumeros` (filtros setor/situação/posse),
      `listarNumerosDoOperador`, `listarMovimentacoes`, `buscarConfig`
- [ ] 5.2 Escritas de cadastro: `criarCelular`, `editarCelular`,
      `desativarCelular`, `criarNumero` — traduzindo erro de unicidade do
      Postgres (`23505`) e as exceções das triggers em mensagem legível
- [ ] 5.3 Chamadas às 5 RPCs via `supabase.rpc(...)`
- [ ] 5.4 `salvarConfigNucleo(setorId)`
- [ ] 5.5 Testes do serviço com mock do cliente Supabase, no padrão de
      `src/services/__tests__/`: duplicado vira mensagem de "já possui
      cadastro"; limite vira mensagem de 6 números

## 6. Hooks

- [ ] 6.1 `src/hooks/useControleNumeros.ts` — celulares, números, config,
      movimentações; realtime nas 3 tabelas seguindo o padrão dos hooks atuais;
      reconciliação com `reconciliarLista`/`dadosVivos` para a tela não piscar
- [ ] 6.2 `src/hooks/useMeusChips.ts` — resolve a visão (liderança ou operador)
      a partir de `temPermissao('chips_escopo_setor')` e carrega só o que
      aquela visão precisa
- [ ] 6.3 Ambos com `loading` só na primeira carga, não em releitura (a lição
      documentada em `useCargoPermissoes`)

## 7. Páginas — Núcleo

- [ ] 7.1 `src/pages/ControleNumeros/index.tsx` com as abas Celulares, Números e
      Configuração, seguindo o padrão de abas de `RhGestao/index.tsx`
- [ ] 7.2 `ListaCelulares.tsx` — cartão por celular com setor, modelo e contador
      `n/6`; ação de cadastrar número desabilitada em 6/6
- [ ] 7.3 `DialogoCelular.tsx` — campo de setor desabilitado com explicação
      quando o celular já tem número
- [ ] 7.4 `DialogoNumero.tsx` — máscara na digitação, validação antes de enviar,
      e mensagem de duplicado apontando onde o número já está
- [ ] 7.5 `ListaNumeros.tsx` — filtros por setor, situação e posse; ação
      "Liberar ao setor" visível só quando a regra pura permite
- [ ] 7.6 `DialogoSituacao.tsx` — troca de situação com confirmação
- [ ] 7.7 `HistoricoNumero.tsx` — linha do tempo lendo `descricao` do banco
- [ ] 7.8 `PainelConfiguracao.tsx` — escolhe o setor do Núcleo; só aparece com
      `numeros_configurar`, e avisa o efeito antes de salvar

## 8. Páginas — Meus Chips

- [ ] 8.1 `src/pages/MeusChips/index.tsx` — escolhe a visão pelo escopo
- [ ] 8.2 `VisaoLideranca.tsx` — números do setor separados entre "disponíveis
      para lançar" e "com operador"; ações de lançar e relançar
- [ ] 8.3 `VisaoOperador.tsx` — só os números lançados para a pessoa; ação de
      devolver
- [ ] 8.4 `DialogoLancar.tsx` — lista só operadores do mesmo setor
- [ ] 8.5 `DialogoRelancar.tsx` — motivo obrigatório (lista) + observação
- [ ] 8.6 `DialogoDevolver.tsx` — motivo + observação
- [ ] 8.7 Histórico reusando `HistoricoNumero`

## 9. Ligação com o sistema existente (só acréscimos)

- [ ] 9.1 `src/lib/index.ts`: `CONTROLE_NUMEROS: '/controle-numeros'` e
      `MEUS_CHIPS: '/meus-chips'` em `ROUTE_PATHS`
- [ ] 9.2 `src/App.tsx`: duas rotas com `lazy` + `ProtectedRoute`, cada uma com
      `produtos={SO_COBRANCA}` e sua `requiredPermissao`. **Sem
      `allowedProfiles`** — quem abre é a chave, como nas abas já convertidas
- [ ] 9.3 `src/lib/menuLateral.ts`: dois itens em `NAV_ITEMS` com
      `produtos: SO_COBRANCA`, `hiddenForPaguePay: true`, `permissaoKey`, e
      ícone do `lucide-react` (`Smartphone` e `MessageCircle`)
- [ ] 9.4 `src/lib/permissoes-catalogo.ts`: as 10 chaves com `grupo`, `label`,
      `descricao`, `tenants: ['bookplay']` e `padrao` no formato de objeto que o
      arquivo usa (`TODOS`, `LIDERANCA` ou `{}`); `numeros_configurar` também em
      `PERMISSOES_EXPLICITAS`; grupo novo `'Controle de Números'` em
      `GRUPOS_PERMISSAO`
- [ ] 9.5 Conferir que `src/services/menuLateral.service.ts` (ordem salva do
      menu) aceita os itens novos sem quebrar a ordenação de quem já usa

## 10. Verificação

- [ ] 10.1 `npx tsc --noEmit`
- [ ] 10.2 `npx eslint --max-warnings=0` nos arquivos novos e alterados
- [ ] 10.3 `npm test` — com atenção ao teste de contrato do catálogo de
      permissões, que só passa com os dois lados espelhados
- [ ] 10.4 `npm run build`
- [ ] 10.5 Revisar o diff completo antes de propor qualquer aplicação de
      migration
- [ ] 10.6 Apresentar as 3 migrations ao Kauan: o que cada uma altera e quantas
      linhas deve atingir. **Esperar o "pode" de cada uma.**

## 11. Depois de aplicado (só com autorização)

- [ ] 11.1 Conferir no painel de permissões que as 10 chaves apareceram
- [ ] 11.2 Conceder as chaves do Núcleo às pessoas do setor
- [ ] 11.3 Cadastrar um celular de teste, 6 números, e tentar o sétimo
- [ ] 11.4 Percorrer o caminho inteiro com um número: aquecer, ativar, liberar,
      lançar, devolver, relançar, tratar, liberar de novo — e conferir que o
      histórico tem as oito linhas
- [ ] 11.5 Entrar como operador de outro setor e confirmar que não enxerga nada
