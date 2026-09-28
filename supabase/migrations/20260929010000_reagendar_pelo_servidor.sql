-- ============================================================================
-- Reagendar a próxima parcela pelo servidor — e para o DONO do acordo
-- ============================================================================
--
-- ## O pedido (29/09/2026)
--
-- «O botão de reagendar deve aparecer também para líderes ou cargos
-- superiores. Só que o botão pertence ao usuário que é dono daquele acordo: se
-- eu sou líder e clico para reagendar um acordo do usuário 1, vai reagendar
-- para esse usuário.»
--
-- ## Por que o navegador não dava conta
--
-- Até aqui a parcela nova nascia de um `insert` feito pelo navegador, em três
-- telas (Dashboard, Acordos, detalhe do acordo). O insert passa pela RLS
-- `acordos_insert`, e a régua dela NÃO é a mesma da leitura:
--
--   acordos_select ... dono, super_admin, escopo 3, escopo 2 (setor) e
--                      escopo 1 (equipe, via fn_operador_no_meu_alcance_de_equipe)
--   acordos_insert ... dono, super_admin, escopo 3, escopo 2 (setor)
--                      — sem o ramo de EQUIPE
--
-- Um líder de equipe via o acordo do operador na lista, clicava, e o banco
-- recusava a parcela com «new row violates row-level security policy». Criar
-- a parcela no nome dele mesmo não era saída: a parcela é do dono.
--
-- As três telas ainda montavam a linha cada uma do seu jeito, e cada uma
-- esquecia algo diferente: a aba Acordos não levava `estado_uf` (que o
-- gatilho `trg_acordos_exige_estado` cobra na PaguePlay), o Dashboard não
-- levava `valor_total` nem `valor_entrada`, o detalhe não levava `estado_uf`.
--
-- ## O que esta função faz
--
-- Uma porta só. Quem ENXERGA o acordo (a mesma régua de `acordos_select`) e
-- tem `editar_acordos` agenda a próxima parcela — e ela nasce do DONO, com a
-- identidade inteira copiada da parcela de origem. O par do vínculo
-- Direto/Extra, quando existe, ganha a parcela dele na mesma transação.
--
-- A regra do que pode ser reagendado é a de `services/reagendamento`:
-- parcelamento (> 1 parcela), não a última, com grupo, e nunca PIX Automático
-- ou Cartão Recorrente. A duplicidade fica com `uq_acordos_grupo_parcela`
-- (20260928230000): se a parcela já existe, a função devolve a que existe.
--
-- O fechamento do mês continua valendo: os gatilhos de `acordos` disparam no
-- insert daqui como disparavam no do navegador.
--
-- Cria uma função nova. Nenhuma linha existente é tocada. Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- plpgsql só confere nome de coluna na hora de RODAR. Sem esta guarda, uma
-- coluna faltando passaria pela migration e estouraria no primeiro clique.
do $$
DECLARE
  v_faltando TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO v_faltando
    FROM unnest(ARRAY[
      'acordo_grupo_id', 'numero_parcela', 'parcelas', 'estado_uf',
      'valor_total', 'usou_quarenta_pct', 'valor_entrada', 'tipo_vinculo',
      'vinculo_operador_id', 'vinculo_operador_nome', 'instituicao', 'setor_id'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'acordos' AND column_name = c);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'acordos sem as colunas: %', v_faltando;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_acordo_agendar_proxima_parcela(
  p_acordo_id  uuid,
  p_vencimento date,
  p_valor      numeric,
  p_valor_par  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b          public.acordos%ROWTYPE;
  par        public.acordos%ROWTYPE;
  v_escopo   INTEGER;
  v_proxima  INTEGER;
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_id       UUID;
  v_par_id   UUID;
  v_existia  BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_vencimento IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: informe data e valor da próxima parcela'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  -- ── Quem pode: a MESMA régua de acordos_select ─────────────────────────────
  -- Se a pessoa enxerga o acordo na lista, pode agendar a próxima parcela
  -- dele. Divergir daqui é o que produzia o botão que aparece e falha.
  v_escopo := public.fn_user_escopo_acordos();

  IF NOT (
    (public.fn_user_is_super_admin()
     OR public.fn_user_acesso_multiempresa()
     OR b.empresa_id = public.fn_user_empresa_id())
    AND (
      b.operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR v_escopo >= 3
      OR (v_escopo >= 2 AND (
            b.setor_id = public.fn_user_setor_id()
            OR (b.setor_id IS NULL
                AND public.fn_operador_setor_id(b.operador_id) = public.fn_user_setor_id())
            OR public.fn_operador_clonado_no_setor(b.operador_id, public.fn_user_setor_id())))
      OR (v_escopo = 1 AND public.fn_operador_no_meu_alcance_de_equipe(b.operador_id))
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: este acordo não está no seu alcance'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_user_tem('editar_acordos') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: seu cargo não pode editar acordos'
      USING ERRCODE = '42501';
  END IF;

  -- ── O que pode: a regra de services/reagendamento ──────────────────────────
  IF b.acordo_grupo_id IS NULL THEN
    RAISE EXCEPTION 'SEM_GRUPO: o acordo não tem grupo de parcelas' USING ERRCODE = '22023';
  END IF;
  IF b.tipo IN ('pix_automatico', 'cartao_recorrente') THEN
    RAISE EXCEPTION 'FORMA_RECORRENTE: PIX Automático e Cartão Recorrente não reagendam'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(b.parcelas, 1) <= 1 THEN
    RAISE EXCEPTION 'PARCELA_UNICA: o acordo não é parcelado' USING ERRCODE = '22023';
  END IF;
  v_proxima := COALESCE(b.numero_parcela, 1) + 1;
  IF v_proxima > COALESCE(b.parcelas, 1) THEN
    RAISE EXCEPTION 'ULTIMA_PARCELA: esta já é a última parcela' USING ERRCODE = '22023';
  END IF;

  -- ── A parcela nova, do dono ────────────────────────────────────────────────
  SELECT a.id INTO v_id
    FROM public.acordos a
   WHERE a.acordo_grupo_id = b.acordo_grupo_id AND a.numero_parcela = v_proxima;

  IF v_id IS NOT NULL THEN
    v_existia := TRUE;
  ELSE
    BEGIN
      INSERT INTO public.acordos (
        nome_cliente, nr_cliente, instituicao, whatsapp, observacoes, estado_uf,
        tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
        acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
        vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
        status, valor, vencimento)
      VALUES (
        b.nome_cliente, b.nr_cliente, b.instituicao, b.whatsapp, b.observacoes, b.estado_uf,
        b.tipo, b.parcelas, b.operador_id, b.empresa_id, b.setor_id, v_hoje,
        b.acordo_grupo_id, v_proxima, b.tipo_vinculo, b.vinculo_operador_id,
        b.vinculo_operador_nome, b.valor_total, COALESCE(b.usou_quarenta_pct, FALSE), b.valor_entrada,
        'verificar_pendente', round(p_valor, 2), p_vencimento)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Outra aba chegou primeiro, entre o SELECT acima e este INSERT.
      SELECT a.id INTO v_id
        FROM public.acordos a
       WHERE a.acordo_grupo_id = b.acordo_grupo_id AND a.numero_parcela = v_proxima;
      v_existia := TRUE;
    END;
  END IF;

  -- ── O par do vínculo Direto/Extra, quando existe ───────────────────────────
  -- Mesma busca de fn_sync_par_vinculo: o outro operador, o tipo de vínculo
  -- oposto, o mesmo NR (ou a mesma instituição quando não há NR), a mesma
  -- parcela de origem.
  IF NOT v_existia AND b.vinculo_operador_id IS NOT NULL THEN
    SELECT a.* INTO par
      FROM public.acordos a
     WHERE a.empresa_id = b.empresa_id
       AND a.id <> b.id
       AND a.operador_id = b.vinculo_operador_id
       AND a.vinculo_operador_id = b.operador_id
       AND a.tipo_vinculo = CASE WHEN b.tipo_vinculo = 'extra' THEN 'direto' ELSE 'extra' END
       AND a.numero_parcela IS NOT DISTINCT FROM b.numero_parcela
       AND a.acordo_grupo_id IS NOT NULL
       AND (
         (TRIM(COALESCE(b.nr_cliente, '')) <> ''
          AND TRIM(COALESCE(a.nr_cliente, '')) = TRIM(b.nr_cliente))
         OR (TRIM(COALESCE(b.nr_cliente, '')) = '' AND TRIM(COALESCE(b.instituicao, '')) <> ''
             AND TRIM(COALESCE(a.instituicao, '')) = TRIM(b.instituicao))
       )
     ORDER BY a.criado_em
     LIMIT 1
     FOR UPDATE;

    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.acordos x
       WHERE x.acordo_grupo_id = par.acordo_grupo_id AND x.numero_parcela = v_proxima
    ) THEN
      BEGIN
        INSERT INTO public.acordos (
          nome_cliente, nr_cliente, instituicao, whatsapp, observacoes, estado_uf,
          tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
          acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
          vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
          status, valor, vencimento)
        VALUES (
          par.nome_cliente, par.nr_cliente, par.instituicao, par.whatsapp, par.observacoes, par.estado_uf,
          par.tipo, par.parcelas, par.operador_id, par.empresa_id, par.setor_id, v_hoje,
          par.acordo_grupo_id, v_proxima, par.tipo_vinculo, par.vinculo_operador_id,
          par.vinculo_operador_nome, par.valor_total, COALESCE(par.usou_quarenta_pct, FALSE), par.valor_entrada,
          'verificar_pendente', round(COALESCE(p_valor_par, p_valor), 2), p_vencimento)
        RETURNING id INTO v_par_id;
      EXCEPTION WHEN unique_violation THEN
        v_par_id := NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',             v_id,
    'numero_parcela', v_proxima,
    'parcelas',       b.parcelas,
    'ja_existia',     v_existia,
    'par_id',         v_par_id,
    'operador_id',    b.operador_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordo_agendar_proxima_parcela(uuid, date, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_acordo_agendar_proxima_parcela(uuid, date, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.fn_acordo_agendar_proxima_parcela(uuid, date, numeric, numeric) IS
  'Cria a próxima parcela de um acordo parcelado, sempre do DONO. Quem pode: '
  'a mesma régua de acordos_select + editar_acordos — líder de equipe incluído, '
  'que a RLS de insert barrava. Copia a identidade inteira da parcela de '
  'origem e cria a do par Direto/Extra. Se a parcela já existe, devolve a que '
  'existe (ja_existia). Migration 20260929010000.';

commit;
