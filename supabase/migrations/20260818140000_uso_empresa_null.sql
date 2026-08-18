-- ============================================================================
-- Monitoramento de uso — empresa NULL = todas, nas quatro leituras
-- ============================================================================
--
-- ## O defeito
--
-- A migration 20260817200000 ensinou `fn_uso_por_pessoa` a aceitar
-- `p_empresa_id = NULL` como "todas as empresas que a RLS permitir", porque a
-- lista de pessoas precisa mostrar as duas operações de uma vez.
--
-- As outras três leituras ficaram para trás. Elas continuaram com
--
--     where u.empresa_id = p_empresa_id
--
-- e em SQL `x = NULL` não é falso: é NULL, que o WHERE descarta. O resultado é
-- zero linha, sem erro e sem aviso.
--
-- O painel abre com "Todas as empresas" selecionado — é o padrão do componente.
-- Então, na abertura, a lista de pessoas vinha cheia (função corrigida) e três
-- blocos vinham vazios (funções não corrigidas):
--
--   • "Telas mais usadas"    → `fn_uso_por_tela`
--   • "Atividade por dia"    → `fn_uso_por_dia`
--   • "Adoção de uma tela"   → `fn_uso_adocao_tela`
--
-- Escolher uma empresa no seletor fazia os três voltarem, o que fez o defeito
-- parecer "o card não funciona" em vez de "o filtro padrão zera a consulta".
--
-- ## A correção
--
-- O mesmo predicado tolerante das demais funções do projeto:
--
--     (p_empresa_id is null or <coluna> = p_empresa_id)
--
-- `SECURITY INVOKER` continua em todas: o parâmetro amplia o PEDIDO, nunca o
-- direito. Administrador que pedir NULL continua recebendo só a própria empresa,
-- porque a policy de `uso_telas` o prende lá.
--
-- ## De quebra: de qual empresa é cada pessoa na adoção
--
-- Com as duas operações juntas, a tabela de adoção lista líderes das duas sem
-- dizer de qual empresa é cada um — dois "líderes que não abriram" que não dá
-- para cobrar porque não se sabe de quem cobrar. `fn_uso_adocao_tela` passa a
-- devolver `empresa_id`/`empresa_nome`, como `fn_uso_por_pessoa` já devolve.
-- ============================================================================

-- ── 1. Telas mais usadas ───────────────────────────────────────────────────

create or replace function public.fn_uso_por_tela(
  p_empresa_id uuid,          -- NULL = todas as empresas que a RLS permitir
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  tela       text,
  aberturas  bigint,
  segundos   bigint,
  pessoas    bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.tela,
         sum(u.aberturas)::bigint             as aberturas,
         sum(u.segundos)::bigint              as segundos,
         count(distinct u.usuario_id)::bigint as pessoas
    from public.uso_telas u
   where (p_empresa_id is null or u.empresa_id = p_empresa_id)
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   group by u.tela
   order by sum(u.segundos) desc;
$function$;

-- ── 2. Atividade por dia ───────────────────────────────────────────────────

create or replace function public.fn_uso_por_dia(
  p_empresa_id uuid,          -- NULL = todas as empresas que a RLS permitir
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  dia       date,
  aberturas bigint,
  segundos  bigint,
  pessoas   bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.dia,
         sum(u.aberturas)::bigint             as aberturas,
         sum(u.segundos)::bigint              as segundos,
         count(distinct u.usuario_id)::bigint as pessoas
    from public.uso_telas u
   where (p_empresa_id is null or u.empresa_id = p_empresa_id)
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   group by u.dia
   order by u.dia;
$function$;

-- ── 3. Adoção de uma tela ──────────────────────────────────────────────────
--
-- DROP antes do CREATE: o retorno ganha `empresa_id`/`empresa_nome`, e
-- `create or replace` não muda a assinatura de retorno de uma função que
-- devolve TABLE — o PostgreSQL recusa com 42P13. Mesmo motivo da 20260817200000.

drop function if exists public.fn_uso_adocao_tela(uuid, date, date, text, text);

create or replace function public.fn_uso_adocao_tela(
  p_empresa_id uuid,          -- NULL = todas as empresas que a RLS permitir
  p_desde      date,
  p_ate        date,
  p_tela       text,
  p_cargo      text default null
)
returns table (
  usuario_id   uuid,
  nome         text,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  aberturas    bigint,
  segundos     bigint,
  ultimo_em    timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  -- Parte de `perfis`, não de `uso_telas`: a resposta útil não é o ranking de
  -- quem abre — é a lista de quem NUNCA abriu, e essa lista não existe dentro
  -- de `uso_telas`, porque quem não usou não tem linha.
  select p.id,
         p.nome,
         p.perfil,
         p.empresa_id,
         coalesce(e.nome, '—')                 as empresa_nome,
         coalesce(sum(u.aberturas), 0)::bigint as aberturas,
         coalesce(sum(u.segundos), 0)::bigint  as segundos,
         max(u.ultimo_em)                      as ultimo_em
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
    left join public.uso_telas u
           on u.usuario_id = p.id
          and u.empresa_id = p.empresa_id
          and u.tela = p_tela
          and u.dia between p_desde and p_ate
   where (p_empresa_id is null or p.empresa_id = p_empresa_id)
     and p.ativo = true
     and coalesce(p.situacao, 'ativo') = 'ativo'
     and (p_cargo is null or p.perfil = p_cargo)
   group by p.id, p.nome, p.perfil, p.empresa_id, e.nome
   order by coalesce(sum(u.segundos), 0) desc, p.nome;
$function$;

-- ── 4. Permissões ──────────────────────────────────────────────────────────
--
-- O DROP levou junto os GRANTs de `fn_uso_adocao_tela`. As outras duas foram
-- substituídas por REPLACE e mantiveram os seus, mas repetir é barato e evita
-- que uma reaplicação parcial deixe uma delas sem EXECUTE.

revoke all on function public.fn_uso_por_tela(uuid, date, date, text)           from public;
revoke all on function public.fn_uso_por_dia(uuid, date, date, text)            from public;
revoke all on function public.fn_uso_adocao_tela(uuid, date, date, text, text)  from public;
grant execute on function public.fn_uso_por_tela(uuid, date, date, text)          to authenticated;
grant execute on function public.fn_uso_por_dia(uuid, date, date, text)           to authenticated;
grant execute on function public.fn_uso_adocao_tela(uuid, date, date, text, text) to authenticated;

-- ── 5. Verificação ─────────────────────────────────────────────────────────
--
-- Falha alto se alguma das três ficou sem EXECUTE para `authenticated`: uma
-- função sem GRANT devolve 42501 ao PostgREST, que o serviço converte em lista
-- vazia — exatamente o sintoma que esta migration existe para eliminar.

do $$
declare
  v_faltando text;
begin
  select string_agg(p.proname, ', ')
    into v_faltando
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_uso_por_tela', 'fn_uso_por_dia', 'fn_uso_adocao_tela')
     and not has_function_privilege('authenticated', p.oid, 'execute');

  if v_faltando is not null then
    raise exception 'Sem EXECUTE para authenticated: %', v_faltando;
  end if;
end;
$$;
