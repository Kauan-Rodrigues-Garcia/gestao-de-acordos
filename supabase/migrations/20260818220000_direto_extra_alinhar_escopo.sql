-- ============================================================================
-- Direto/Extra: ativar a EQUIPE tem de valer para a equipe
-- ============================================================================
--
-- ## O relato
--
-- "Ativei a logica para a equipe Atendimento 0800, que tem 4 pessoas, e so
-- pegou para 1. As outras 3 tive que ativar uma a uma."
--
-- ## O que realmente aconteceu
--
-- A cascata funcionou como documentada — e por isso o defeito nao estava nela.
-- `resolverDiretoExtraAtivo` vai do mais especifico para o mais geral
-- (usuario -> equipe -> setor), e uma config de `usuario` VENCE a da equipe,
-- inclusive para desativar.
--
-- Os dados confirmam, linha por linha:
--
--   Camila Rebelato  — sem config de `usuario`  -> herdou a equipe. Funcionou.
--   Helena, Tassiane, Thais — tinham config de `usuario` (02/07 e 03/08), que
--   continuou valendo e escondeu a da equipe. Nao funcionou.
--
-- Uma pessoa de quatro "funcionar" nao era aleatorio: era exatamente a unica
-- sem excecao individual.
--
-- ## O que muda
--
-- Ativar (ou desativar) um escopo mais amplo passa a ALINHAR as excecoes que o
-- contradizem. Ligar a equipe apaga as configs de `usuario` que estavam
-- desligadas naquela equipe; desligar a equipe apaga as que estavam ligadas.
--
-- A cascata NAO muda: continua "o mais especifico vence". O que muda e o efeito
-- de um ato explicito do administrador sobre o escopo amplo — ele deixa de ser
-- silenciosamente anulado por uma decisao antiga de que ninguem se lembra.
--
-- A excecao continua possivel, e na ordem que a pessoa espera: liga a equipe,
-- depois desliga quem nao deve ter. O que nao sobrevive e a excecao que existia
-- ANTES do ato — e e essa que causava a confusao.
--
-- So alinha o que CONTRADIZ. Quem ja estava alinhado nao e tocado, e por isso a
-- operacao nao apaga configuracao a toa.
--
-- ## Por que no servidor
--
-- Precisa ser atomico com o upsert do escopo: alinhar em duas chamadas deixaria
-- uma janela em que a equipe esta ligada e as excecoes ainda nao. E precisa ler
-- `perfis` de terceiros e `equipe_operadores_clones`, que a RLS nao entrega ao
-- lider por caminho direto.
-- ============================================================================

create or replace function public.fn_direto_extra_definir(
  p_empresa_id    uuid,
  p_escopo        text,
  p_referencia_id uuid,
  p_ativo         boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid       uuid := auth.uid();
  v_perfil    text;
  v_empresa   uuid;
  v_alinhados integer := 0;
  v_equipes   integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;
  if p_escopo not in ('setor','equipe','usuario') then
    return jsonb_build_object('ok', false, 'erro', 'escopo_invalido');
  end if;

  select p.perfil::text, p.empresa_id into v_perfil, v_empresa
    from public.perfis p where p.id = v_uid;

  -- Os mesmos cargos que a tela ja oferece. A checagem existe porque esta
  -- funcao e SECURITY DEFINER: sem ela, qualquer sessao poderia ligar a logica
  -- para a empresa inteira.
  if v_perfil is null
     or v_perfil not in ('lider','elite','gerencia','administrador','super_admin') then
    return jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  end if;
  if v_empresa is distinct from p_empresa_id and v_perfil <> 'super_admin' then
    return jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  end if;

  -- 1. A config do escopo pedido.
  insert into public.direto_extra_config (empresa_id, escopo, referencia_id, ativo, atualizado_em)
  values (p_empresa_id, p_escopo, p_referencia_id, p_ativo, now())
  on conflict (empresa_id, escopo, referencia_id) do update
     set ativo = excluded.ativo, atualizado_em = now();

  -- 2. As excecoes que contradizem, apagadas.
  if p_escopo = 'equipe' then
    delete from public.direto_extra_config c
     where c.empresa_id = p_empresa_id
       and c.escopo = 'usuario'
       and c.ativo is distinct from p_ativo
       and c.referencia_id in (
         -- Quem esta na equipe pelo vinculo direto...
         select p.id from public.perfis p where p.equipe_id = p_referencia_id
         union
         -- ...e quem esta nela como CLONE. Um emprestado tambem trabalha ali,
         -- e deixa-lo de fora reproduziria o mesmo defeito num caso mais raro.
         select k.operador_id from public.equipe_operadores_clones k
          where k.equipe_id = p_referencia_id
       );
    get diagnostics v_alinhados = row_count;

  elsif p_escopo = 'setor' then
    -- Setor alcanca as EQUIPES dele e as pessoas dentro delas.
    delete from public.direto_extra_config c
     where c.empresa_id = p_empresa_id
       and c.escopo = 'equipe'
       and c.ativo is distinct from p_ativo
       and c.referencia_id in (
         select e.id from public.equipes e where e.setor_id = p_referencia_id
       );
    get diagnostics v_equipes = row_count;

    delete from public.direto_extra_config c
     where c.empresa_id = p_empresa_id
       and c.escopo = 'usuario'
       and c.ativo is distinct from p_ativo
       and c.referencia_id in (
         select p.id from public.perfis p where p.setor_id = p_referencia_id
         union
         select p.id from public.perfis p
           join public.equipes e on e.id = p.equipe_id
          where e.setor_id = p_referencia_id
         union
         select k.operador_id from public.equipe_operadores_clones k
           join public.equipes e on e.id = k.equipe_id
          where e.setor_id = p_referencia_id
       );
    get diagnostics v_alinhados = row_count;
  end if;
  -- escopo = 'usuario' nao alinha nada: nao ha nivel mais especifico abaixo.

  return jsonb_build_object(
    'ok', true,
    'alinhados_usuario', v_alinhados,
    'alinhados_equipe',  v_equipes
  );
end;
$function$;

comment on function public.fn_direto_extra_definir(uuid, text, uuid, boolean) is
  'Grava a config Direto/Extra de um escopo e apaga as excecoes mais especificas que a contradizem. Ativar a equipe passa a valer para a equipe — ver migration 20260818220000.';

revoke all on function public.fn_direto_extra_definir(uuid, text, uuid, boolean) from public;
grant execute on function public.fn_direto_extra_definir(uuid, text, uuid, boolean) to authenticated;

-- ── Verificacao ────────────────────────────────────────────────────────────

do $$
begin
  if not has_function_privilege('authenticated',
        'public.fn_direto_extra_definir(uuid, text, uuid, boolean)', 'execute') then
    raise exception 'fn_direto_extra_definir sem EXECUTE para authenticated';
  end if;
end;
$$;
