-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 6: o mês fechado, e a porta que ainda deixava mexer nele
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra 9 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## O que já estava certo, medido antes de mexer
--
-- Quase tudo. A auditoria das quatro tabelas `composicao_mes*` e das três
-- funções que escrevem nelas:
--
--   RLS das tabelas ................. escrita só para super_admin. OK
--   fn_composicao_mes_congelar() .... só age no mês CORRENTE. OK
--   fn_composicao_mes_snapshot() .... já tem a trava: `p_mes < mês corrente`
--                                     em America/Sao_Paulo, e aí só acrescenta
--                                     o que falta, nunca reescreve. OK
--   fn_composicao_mes_completar_clones() ... NENHUMA trava.  ← a porta
--
-- ## A porta
--
-- `fn_composicao_mes_completar_clones` é SECURITY DEFINER — passa por cima do
-- RLS — e aceita `gerencia`, `diretoria` e `administrador`, não só super_admin.
-- Chamada com um mês já fechado, ela acrescenta ao retrato daquele mês os
-- clones de HOJE.
--
-- Ela é cuidadosa: só cresce, nunca apaga, e o próprio comentário dela diz
-- «tirar seria reescrever o mês». Mas crescer um retrato fechado também é
-- alterá-lo — e a regra 9 é explícita: «alteração feita depois vale só para o
-- mês corrente; **só super admin** pode editar um mês fechado».
--
-- Então a função continua inteira. O que muda é quem pode chamá-la para trás.
--
-- ## Por que o fechamento é derivado da data, e não um flag
--
-- A regra diz «à meia-noite do dia 1º». Isso é uma função do calendário, não um
-- estado: não precisa de job, não precisa de coluna, e não tem como ficar
-- dessincronizado. Um flag precisaria de alguém para ligá-lo, e o dia em que
-- esse alguém falhasse o mês ficaria aberto sem ninguém notar.
--
-- `fn_mes_fechado` existe para que essa definição viva num lugar só. A mesma
-- conta já estava escrita dentro de `fn_composicao_mes_snapshot`; repetir a
-- terceira vez seria o começo do mesmo problema que `fn_mestre_setor_resolvido`
-- resolveu na Fase 4 — regra copiada em N lugares, implementada inteira em
-- alguns.
--
-- ## Dois cadeados, e eles NÃO são o mesmo
--
-- O sistema já tinha um fechamento de mês, em `lib/fechamentoMes.ts`: ele trava
-- criar/editar/excluir **acordo** em mês fechado, e admite exceção por cargo ou
-- pela permissão `ignorar_fechamento_mes`.
--
-- Este aqui é outro, e é mais estrito de propósito: reescrever quem estava em
-- qual equipe em agosto muda a **atribuição histórica do dinheiro**, que é mais
-- grave que editar um acordo. Por isso a guarda abaixo exige `super_admin` e
-- NÃO honra `ignorar_fechamento_mes` — a regra 9 diz «só super admin», e é essa
-- que vale para configuração.
--
-- ## Verificado contra o banco de produção
--
--   fn_mes_fechado('2026-08') ......... true     (corrente: 2026-09)
--   fn_mes_fechado('2026-09') ......... false
--   fn_mes_fechado(null) / ('lixo') ... false
--
--   chamada em mês fechado sem ser super_admin:
--     composicao_mes de 2026-08 antes .... 326 linhas
--     composicao_mes de 2026-08 depois ... 326 linhas
--     erro ............................... MES_FECHADO: 2026-08 ja fechou.
--
--   chamada no mês corrente (dentro de bloco revertido, sem deixar rastro):
--     {"mes": "2026-09", "pessoas": 0, "equipes": 0, "setores": 0}
--
-- ## Escrita: nenhuma linha de dado. Uma função nova e uma guarda.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── O fechamento, num lugar só ─────────────────────────────────────────────
--
-- STABLE e não IMMUTABLE: depende de `now()`. Dentro de uma transação o valor
-- não muda, que é o que importa — um mês não pode fechar no meio de uma
-- operação.

create or replace function public.fn_mes_fechado(p_mes text)
returns boolean
language sql
stable
parallel safe
as $function$
  select p_mes is not null
     and p_mes ~ '^\d{4}-\d{2}$'
     and p_mes < to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM');
$function$;

comment on function public.fn_mes_fechado(text) is
  'O mes esta fechado? Verdadeiro para qualquer mes anterior ao corrente em '
  'America/Sao_Paulo — a regra 9 diz «a meia-noite do dia 1o», que e conta de '
  'calendario e nao estado. Derivado de proposito: flag precisaria de alguem '
  'para ligar, e o dia em que esse alguem falhasse o mes ficaria aberto sem '
  'ninguem notar.';

grant execute on function public.fn_mes_fechado(text) to authenticated;

-- ── A guarda na porta que faltava ──────────────────────────────────────────

create or replace function public.fn_composicao_mes_completar_clones(
  p_empresa_id uuid,
  p_mes        text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pessoas  integer := 0;
  v_equipes  integer := 0;
  v_setores  integer := 0;
  v_detalhe  jsonb;
begin
  if auth.uid() is not null and (
    not fn_can_access_empresa(p_empresa_id)
    or not (fn_user_is_super_admin()
            or fn_user_has_any_role(array['gerencia','diretoria','administrador']))
  ) then
    raise exception 'NAO_AUTORIZADO: usuário não pode completar este retrato'
      using errcode = '42501';
  end if;
  if auth.uid() is null and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'NAO_AUTORIZADO: sessão ausente' using errcode = '42501';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  /*
   * Regra 9: mes fechado so se altera por super_admin.
   *
   * Esta funcao e SECURITY DEFINER e passa por cima do RLS das tabelas
   * `composicao_mes*`, que e super_admin-only. Sem esta guarda, quem tem
   * `gerencia`, `diretoria` ou `administrador` conseguia acrescentar ao retrato
   * de um mes fechado os clones de HOJE — e «alteracao feita depois vale so
   * para o mes corrente».
   *
   * A funcao nunca apagou nada e nao passa a apagar. O que muda e quem pode
   * chama-la para tras.
   */
  if fn_mes_fechado(p_mes) and not fn_user_is_super_admin() then
    raise exception
      'MES_FECHADO: % ja fechou. Alteracao de composicao vale so para o mes corrente; '
      'somente super_admin pode mexer num mes fechado.', p_mes
      using errcode = '42501';
  end if;

  -- O que vai mudar, guardado ANTES de mudar: é o que a trilha registra, e é
  -- o que permite responder «por que agosto mudou?» meses depois.
  select coalesce(jsonb_agg(x order by x->>'setor', x->>'equipe'), '[]'::jsonb)
    into v_detalhe
    from (
      select jsonb_build_object(
               'setor', coalesce(s.nome, '(sem setor)'),
               'equipe', e.nome,
               'pessoas', count(*),
               'operadores', jsonb_agg(p.nome order by p.nome)
             ) as x
        from composicao_mes cm
        join perfis p on p.id = cm.operador_id
        join equipe_operadores_clones c
          on c.empresa_id = cm.empresa_id and c.operador_id = cm.operador_id
         and coalesce(c.conta_recebimento, true)
        join equipes e on e.id = c.equipe_id
        left join setores s on s.id = e.setor_id
       where cm.empresa_id = p_empresa_id
         and cm.mes = p_mes
         and not (c.equipe_id = any(coalesce(cm.equipes_clone, '{}'::uuid[])))
       group by s.nome, e.nome
    ) t;

  -- O setor do clone precisa existir no retrato, senão a tela não sabe o nome
  -- nem se ele é alternativo.
  insert into composicao_mes_setor (empresa_id, mes, setor_id, nome, ativo, alternativo)
  select distinct p_empresa_id, p_mes, s.id, s.nome,
         coalesce(s.ativo, true), coalesce(s.alternativo, false)
    from equipe_operadores_clones c
    join equipes e on e.id = c.equipe_id
    join setores s on s.id = e.setor_id
   where c.empresa_id = p_empresa_id
     and not exists (select 1 from composicao_mes_setor cs
                      where cs.empresa_id = p_empresa_id and cs.mes = p_mes and cs.setor_id = s.id)
  on conflict do nothing;
  get diagnostics v_setores = row_count;

  insert into composicao_mes_equipe (empresa_id, mes, equipe_id, nome, setor_id)
  select distinct p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    from equipe_operadores_clones c
    join equipes e on e.id = c.equipe_id
   where c.empresa_id = p_empresa_id
     and not exists (select 1 from composicao_mes_equipe ce
                      where ce.empresa_id = p_empresa_id and ce.mes = p_mes and ce.equipe_id = e.id)
  on conflict do nothing;
  get diagnostics v_equipes = row_count;

  -- A união dos dois conjuntos. Só cresce: o que já estava no retrato fica,
  -- mesmo que o clone não exista mais hoje — tirar seria reescrever o mês.
  with novo as (
    select cm.operador_id,
           array(
             select distinct u from (
               select unnest(coalesce(cm.equipes_clone, '{}'::uuid[])) as u
               union
               select c.equipe_id
                 from equipe_operadores_clones c
                where c.empresa_id = p_empresa_id
                  and c.operador_id = cm.operador_id
                  and coalesce(c.conta_recebimento, true)
             ) t where u is not null
           ) as lista
      from composicao_mes cm
     where cm.empresa_id = p_empresa_id and cm.mes = p_mes
  )
  update composicao_mes cm
     set equipes_clone = n.lista
    from novo n
   where cm.empresa_id = p_empresa_id
     and cm.mes = p_mes
     and cm.operador_id = n.operador_id
     -- Só quando CRESCE. Comparar o array inteiro pegaria diferença de ordem e
     -- reescreveria linha que não mudou.
     and coalesce(array_length(n.lista, 1), 0)
       > coalesce(array_length(cm.equipes_clone, 1), 0);
  get diagnostics v_pessoas = row_count;

  perform fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'aviso',
    p_descricao  => format(
      'Completou os clones do mês %s — %s pessoa(s), %s equipe(s) e %s setor(es) que faltavam no retrato',
      p_mes, v_pessoas, v_equipes, v_setores),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'apenas_clones', true,
      'pessoas', v_pessoas, 'equipes', v_equipes, 'setores', v_setores,
      'mudancas', v_detalhe),
    p_origem     => 'ui'
  );

  return jsonb_build_object(
    'mes', p_mes, 'pessoas', v_pessoas, 'equipes', v_equipes,
    'setores', v_setores, 'mudancas', v_detalhe);
end;
$function$;

comment on function public.fn_composicao_mes_completar_clones(uuid, text) is
  'Acrescenta ao retrato do mes os clones que faltavam. So CRESCE — nunca '
  'apaga, porque tirar seria reescrever o mes. Desde a Fase 6, mes fechado so '
  'aceita esta operacao de super_admin (regra 9): ela e SECURITY DEFINER e '
  'passava por cima do RLS super_admin-only das tabelas composicao_mes*.';

commit;
