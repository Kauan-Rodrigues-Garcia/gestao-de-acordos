-- ============================================================================
-- Meta direta e indireta  [PaguePlay]
-- ============================================================================
--
-- ## O que muda
--
-- Operador com a logica Direto/Extra ativa passa a poder ter DUAS metas no mes:
--
--   • a meta de sempre, que agora se chama DIRETA — cobrada contra o recebimento
--     do analitico, exatamente como hoje;
--   • uma meta INDIRETA, opcional, cobrada contra os acordos EXTRA que ele
--     fechou e que foram pagos.
--
-- Por que o extra precisava de um lugar: hoje ele nao soma em canto nenhum. O
-- operador fecha um acordo em nome de outra pessoa, o dinheiro entra pelo
-- titular, e o trabalho dele nao aparece em meta nenhuma. A meta indireta e o
-- unico lugar onde esse valor conta.
--
-- ## O que NAO muda
--
-- Meta indireta e recebimento indireto sao INDIVIDUAIS. Nao entram no acumulado
-- da equipe nem no do setor — decisao explicita de 18/08/2026. Somar ali contaria
-- o mesmo dinheiro duas vezes: o extra ja entra no recebimento do titular
-- DIRETO, que esta na mesma equipe.
--
-- O quartil, esse sim, passa a ser calculado sobre o TOTAL de quem tem as duas:
-- (meta direta + meta indireta) contra (recebido direto + recebido indireto).
-- Cobrar o quartil so pela metade direta puniria justamente quem foi bem no
-- extra, que e o oposto do que a meta indireta existe para fazer.
-- ============================================================================

-- ── 1. As duas colunas ─────────────────────────────────────────────────────
--
-- Colunas, e nao mais uma entrada em `metas_extras`: aquele JSONB guarda os
-- DEGRAUS em cascata da BookPlay (2a meta, 3a meta), que sao o mesmo dinheiro
-- em alvos maiores. A meta indireta e outra natureza de dinheiro, com outra
-- fonte de recebimento. Empilhar as duas no mesmo campo faria o degrau virar
-- meta e a meta virar degrau na primeira leitura desatenta.

alter table public.metas
  add column if not exists meta_indireta_ativa  boolean not null default false,
  add column if not exists meta_indireta_valor  numeric not null default 0;

comment on column public.metas.meta_indireta_ativa is
  'Operador com Direto/Extra ativo pode ter meta indireta. Falso = a linha tem uma meta so, e `meta_valor` e a meta cheia.';
comment on column public.metas.meta_indireta_valor is
  'Meta do recebimento INDIRETO (acordos extra pagos), em valor BRUTO — o H.O. e derivado na tela, igual a `meta_valor`. Individual: nao soma em equipe nem em setor.';

-- Guarda-corpo: valor sem a chave ligada e lixo silencioso, e ligada sem valor
-- e uma meta que ninguem consegue bater. As duas coisas juntas ou nenhuma.
alter table public.metas
  drop constraint if exists metas_indireta_coerente;
alter table public.metas
  add constraint metas_indireta_coerente
  check (
    (meta_indireta_ativa = false and meta_indireta_valor = 0)
    or (meta_indireta_ativa = true and meta_indireta_valor > 0)
  );

-- ── 2. A porta de escrita das metas ────────────────────────────────────────
--
-- `fn_metas_upsert` e o unico caminho de gravacao (respeita a trava por setor).
-- As duas colunas novas entram com a MESMA protecao que `metas_extras` ja tinha:
-- so sao sobrescritas quando a chave vem no payload. Sem isso, a tela da
-- BookPlay — que nunca manda esses campos — zeraria a meta indireta de todo
-- mundo da PaguePlay a cada salvamento, e ninguem veria acontecer.

create or replace function public.fn_metas_upsert(p_payloads jsonb)
returns table(salvos integer, bloqueados jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_perfil     TEXT;
  v_empresa    UUID;
  v_item       JSONB;
  v_tipo       TEXT;
  v_ref        UUID;
  v_emp_item   UUID;
  v_mes        INTEGER;
  v_ano        INTEGER;
  v_ind_ativa  BOOLEAN;
  v_ind_valor  NUMERIC;
  v_salvos     INTEGER := 0;
  v_bloqueados JSONB := '[]'::JSONB;
BEGIN
  SELECT perfil::text, empresa_id INTO v_perfil, v_empresa FROM public.perfis WHERE id = auth.uid();

  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF v_perfil NOT IN ('administrador','lider','super_admin','elite','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada: cargo % não pode salvar metas', v_perfil;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payloads) LOOP
    v_tipo     := v_item->>'tipo';
    v_ref      := (v_item->>'referencia_id')::UUID;
    v_emp_item := (v_item->>'empresa_id')::UUID;
    v_mes      := (v_item->>'mes')::INTEGER;
    v_ano      := (v_item->>'ano')::INTEGER;

    IF v_emp_item != v_empresa AND v_perfil != 'super_admin' THEN
      RAISE EXCEPTION 'Permissão negada: empresa_id inválido';
    END IF;

    IF public.fn_meta_esta_bloqueada(v_tipo, v_ref, v_emp_item, v_mes, v_ano) THEN
      v_bloqueados := v_bloqueados || jsonb_build_object('referencia_id', v_ref, 'tipo', v_tipo);
      CONTINUE;
    END IF;

    -- Meta indireta so existe para OPERADOR. Setor e equipe nao tem recebimento
    -- indireto proprio (ver o cabecalho); aceitar o campo ali criaria um numero
    -- que nenhuma tela sabe cobrar.
    v_ind_ativa := COALESCE((v_item->>'meta_indireta_ativa')::BOOLEAN, false) AND v_tipo = 'operador';
    v_ind_valor := CASE WHEN v_ind_ativa
                        THEN COALESCE((v_item->>'meta_indireta_valor')::NUMERIC, 0)
                        ELSE 0 END;

    -- Ligada sem valor nao passa no CHECK e derrubaria o lote inteiro. Vale
    -- mais desligar em silencio do que perder as outras metas do salvamento.
    IF v_ind_ativa AND v_ind_valor <= 0 THEN
      v_ind_ativa := false;
      v_ind_valor := 0;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, meta_proporcional,
       metas_extras, meta_indireta_ativa, meta_indireta_valor, mes, ano)
    VALUES (
      v_tipo, v_ref, v_emp_item,
      (v_item->>'meta_valor')::NUMERIC,
      COALESCE((v_item->>'meta_acordos')::INTEGER, 0),
      COALESCE((v_item->>'meta_proporcional')::BOOLEAN, false),
      COALESCE(v_item->'metas_extras', '[]'::jsonb),
      v_ind_ativa, v_ind_valor,
      v_mes, v_ano
    )
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE SET
      meta_valor        = EXCLUDED.meta_valor,
      meta_acordos      = EXCLUDED.meta_acordos,
      meta_proporcional = EXCLUDED.meta_proporcional,
      metas_extras      = CASE WHEN v_item ? 'metas_extras' THEN EXCLUDED.metas_extras ELSE public.metas.metas_extras END,
      -- Só sobrescreve quando a tela mandou. Ver o cabeçalho desta seção.
      meta_indireta_ativa = CASE WHEN v_item ? 'meta_indireta_ativa'
                                 THEN EXCLUDED.meta_indireta_ativa
                                 ELSE public.metas.meta_indireta_ativa END,
      meta_indireta_valor = CASE WHEN v_item ? 'meta_indireta_ativa'
                                 THEN EXCLUDED.meta_indireta_valor
                                 ELSE public.metas.meta_indireta_valor END,
      updated_at        = now();

    v_salvos := v_salvos + 1;
  END LOOP;

  RETURN QUERY SELECT v_salvos, v_bloqueados;
END;
$function$;

-- ── 3. O recebimento indireto ──────────────────────────────────────────────
--
-- "Todos os acordos marcados como PAGOS que tenham a marca de EXTRA, com ou sem
-- operador direto vinculado" — a definicao do dono do produto, em 18/08/2026.
--
-- Tres decisoes que a consulta materializa:
--
-- 1. `public.acordos`, nao `acordos_deduplicados`. A view guarda UMA linha por
--    `acordo_grupo_id` (a ultima parcela) e serve para LISTAR. Somar dinheiro
--    por ela perderia todas as parcelas menos uma. Cada linha de `acordos`
--    carrega o proprio `valor` e o proprio `status`: parcela paga soma, parcela
--    nao paga nao soma, que e a leitura certa.
--
-- 2. O mes vem de `coalesce(data_pagamento, vencimento)`. Nao e invencao: em
--    `parcelas.service.ts` um acordo marcado como pago recebe
--    `data_pagamento = vencimento` — o projeto ja trata recebimento por
--    vencimento. O coalesce cobre as 12 linhas pagas do historico que ficaram
--    sem `data_pagamento` sem precisar de uma terceira regra.
--
-- 3. `vinculo_operador_id` NAO entra no filtro. Extra sem titular direto (o
--    par foi excluido, o titular saiu da empresa) continua sendo trabalho
--    feito, e continua contando.
--
-- SECURITY INVOKER: a RLS de `acordos` (fn_pode_gerir_acordo) decide o que cada
-- um ve. O operador recebe so o proprio total; o lider, o do setor dele. Uma
-- funcao DEFINER aqui entregaria o mes inteiro da empresa a quem chamasse.

create or replace function public.fn_recebimento_indireto_mes(
  p_empresa_id uuid,
  p_mes        date,                    -- qualquer dia do mes; truncado aqui
  p_operadores uuid[] default null      -- NULL = todos os que a RLS permitir
)
returns table (
  operador_id  uuid,
  total_bruto  numeric,
  qtd          bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select a.operador_id,
         coalesce(sum(a.valor), 0)::numeric as total_bruto,
         count(*)::bigint                   as qtd
    from public.acordos a
   where a.empresa_id  = p_empresa_id
     and a.tipo_vinculo = 'extra'
     and a.status       = 'pago'
     and a.operador_id is not null
     and (p_operadores is null or a.operador_id = any(p_operadores))
     and date_trunc('month', coalesce(a.data_pagamento, a.vencimento))
         = date_trunc('month', p_mes)
   group by a.operador_id;
$function$;

comment on function public.fn_recebimento_indireto_mes(uuid, date, uuid[]) is
  'Recebimento INDIRETO do mes por operador: acordos extra com status pago, somados por coalesce(data_pagamento, vencimento). Valor BRUTO — o H.O. e derivado na tela.';

revoke all on function public.fn_recebimento_indireto_mes(uuid, date, uuid[]) from public;
grant execute on function public.fn_recebimento_indireto_mes(uuid, date, uuid[]) to authenticated;

-- Sem indice dedicado: `extra` sao 159 linhas em 7.348, e o filtro por empresa
-- ja e coberto. Um indice parcial aqui custaria escrita em todo acordo para
-- servir uma consulta que varre pouco.

-- ── 4. Verificacao ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='metas'
       and column_name in ('meta_indireta_ativa','meta_indireta_valor')
     having count(*) = 2
  ) then
    raise exception 'Colunas de meta indireta nao foram criadas';
  end if;

  if not has_function_privilege('authenticated',
        'public.fn_recebimento_indireto_mes(uuid, date, uuid[])', 'execute') then
    raise exception 'fn_recebimento_indireto_mes sem EXECUTE para authenticated';
  end if;
end;
$$;
