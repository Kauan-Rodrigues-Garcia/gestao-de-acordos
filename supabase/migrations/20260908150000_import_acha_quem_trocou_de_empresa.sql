-- ═══════════════════════════════════════════════════════════════════════════
-- A importação volta a achar quem trocou de EMPRESA no meio do mês
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado
--
-- `resolverOperadores` (`services/analitico/analitico.service.ts`) casa o login
-- do relatório do ERP com o perfil da pessoa. Ela lê:
--
--     supabase.from('perfis').select(...).eq('empresa_id', empresaId)
--
-- O comentário dela já defende, com nome e data, que `ativo` e `arquivado` NÃO
-- podem filtrar ali: quem foi desligado ou arquivado no meio do mês continua
-- aparecendo no relatório, e excluí-lo transformava as linhas dele em órfãs —
-- o dinheiro saía de qualquer equipe, em silêncio.
--
-- O mesmo raciocínio vale para `empresa_id`, e ninguém tinha reparado. Quem é
-- transferido para OUTRA empresa some da consulta pelo mesmo motivo, com a
-- mesma consequência, e é um caso mais grave: o desligado ao menos para de
-- produzir, enquanto o transferido continua cobrando a carteira da empresa de
-- origem o mês inteiro.
--
-- ## O caso medido — PaguePlay, setembro/2026
--
-- Onze pessoas do setor Conecta Play / equipe Digital foram transferidas para a
-- BookPlay em agosto e setembro, todas com fantasma ativo em
-- `perfis_transferencias`. Em 08/09/2026 o analítico foi limpo e reimportado.
-- Na reimportação nenhum dos onze logins casou, e as linhas entraram sem
-- `operador_id`:
--
--     analítico   128 linhas   R$ 61.549,86
--     diário      424 linhas   R$ 108.441,66
--
-- Agosto, que não foi reimportado, tinha os mesmos logins resolvidos — porque
-- a importação de agosto rodou quando as pessoas ainda estavam na PaguePlay.
-- Isto é, o defeito não aparece na hora da transferência: ele aparece na
-- primeira reimportação depois dela.
--
-- E não é só cosmético. Na PaguePlay o total do setor soma por USUÁRIO
-- (`setorSomaPorUsuarios` devolve `true` para o tenant inteiro, independente da
-- flag `alternativo`), com a órfã entrando pelo carimbo `setor_id`. Sem
-- `operador_id` a linha até conta no setor, mas some da EQUIPE — que é onde o
-- líder procura o número da pessoa.
--
-- ## Por que uma função, e não um `.or()` no cliente
--
-- A policy `perfis_select` exige `fn_can_access_empresa(perfis.empresa_id)`.
-- Quem importa na PaguePlay não alcança um perfil da BookPlay: pedir os dois
-- pelo cliente devolveria a mesma lista de antes, sem erro nenhum — o conserto
-- pareceria feito e não estaria.
--
-- ## O portão
--
-- Esta função NÃO abre `perfis`. Ela devolve três campos (id, usuario, nome) e
-- só de quem a empresa que pergunta JÁ registrou em `perfis_transferencias` —
-- tabela onde essa mesma empresa guarda `perfil_nome` desde a 20260813d, e que
-- ela já lê pelo cliente em `buscarFantasmasDoMes`. Não há informação nova
-- atravessando a fronteira; há o `id` e o `usuario` de alguém cujo nome a
-- origem já tem na mão.
--
-- Os recortes, todos obrigatórios:
--
--   • `fn_can_access_empresa(p_empresa_id)` — você tem que poder olhar a
--     empresa de ORIGEM. É o mesmo portão do resto do analítico;
--   • `tipo = 'empresa'` — transferência de setor não muda de empresa, e o
--     perfil continua visível pela policy normal;
--   • `fantasma_ativo AND desfeita_em IS NULL` — a liderança da origem decide
--     se quer a pessoa ali. Tirou o fantasma, a importação volta a não achá-la,
--     que é exatamente o que "tirar o fantasma" quer dizer;
--   • o perfil tem que estar em OUTRA empresa hoje. Quem voltou já é achado
--     pela consulta normal, e devolvê-lo aqui seria uma segunda resposta para a
--     mesma pergunta.
--
-- ## Sem mês, de propósito
--
-- `resolverOperadores` não recebe mês, e não deve receber. O comentário dela
-- diz por quê: «esta função só precisa acertar a pessoa; quem decide o que
-- aparece na tela são as consultas de composição, que conhecem o mês em foco».
-- Importar agosto em setembro tem de continuar achando quem trabalhou em
-- agosto. Filtrar o fantasma por mês AQUI repetiria, no lugar errado, a decisão
-- que `aplicarFantasmas` já toma no lugar certo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_operadores_transferidos(p_empresa_id uuid)
returns table (id uuid, usuario text, nome text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select distinct p.id, p.usuario, p.nome
    from public.perfis_transferencias t
    join public.perfis p on p.id = t.perfil_id
   where t.empresa_id = p_empresa_id
     and t.tipo = 'empresa'
     and t.fantasma_ativo
     and t.desfeita_em is null
     and p.empresa_id is distinct from p_empresa_id
     and coalesce(btrim(p.usuario), '') <> ''
     and (
       public.fn_user_is_super_admin()
       or public.fn_can_access_empresa(p_empresa_id)
     );
$function$;

comment on function public.fn_operadores_transferidos(uuid) is
  'Login e id de quem saiu desta empresa e ainda tem fantasma ativo. Existe para a importação do analítico/diário não transformar em órfã a linha de quem trocou de empresa no meio do mês. Devolve só id, usuario e nome, e só de quem esta empresa já registrou em perfis_transferencias.';

revoke all on function public.fn_operadores_transferidos(uuid) from public, anon;
grant execute on function public.fn_operadores_transferidos(uuid) to authenticated;

-- ── Verificação ────────────────────────────────────────────────────────────
--
-- A função depende de duas outras e de uma coluna. Se qualquer uma sair do
-- lugar, a importação volta a criar órfã em silêncio — que é justamente o modo
-- de falhar que esta migration existe para acabar. Falha alto.

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_can_access_empresa'
  ) then
    raise exception 'fn_can_access_empresa nao existe — o portao da funcao depende dela';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfis_transferencias'
       and column_name = 'fantasma_ativo'
  ) then
    raise exception 'perfis_transferencias.fantasma_ativo nao existe';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_operadores_transferidos'
       and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id uuid'
  ) then
    raise exception 'fn_operadores_transferidos(uuid) nao foi criada';
  end if;
end;
$$;
