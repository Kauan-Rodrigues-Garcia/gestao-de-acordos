-- ============================================================================
-- Desafio do Vale: a virada do mês não pode derrubar o resultado (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «verifique que não irá quebrar o desafio pelo
-- fechamento». O desafio acaba em 30/11 — o último dia do mês — e o prêmio é
-- pago depois da virada. Conferido em 23/11 o que muda em 01/12:
--
--   * o 59 de novembro FICA (um lote vigente por mês; dezembro é outro lote);
--   * o Pix de novembro continua aprovável depois do fechamento do mês
--     (20261001130000 deixa a fila do mês passado aberta de propósito);
--   * a meta do mês e o Analítico de novembro ficam.
--
-- Três pontos quebravam:
--
-- 1. O SETOR da pessoa era o de HOJE (`perfis.setor_id`). Quem muda de setor
--    na virada (o Treinamento indo para o setor de origem, transferências)
--    passava a valer pelo % do setor novo — ou sumia do desafio, se o novo não
--    participa. Agora, passado o fim do desafio, vale o setor do RETRATO do mês
--    (`composicao_mes`, o mesmo que congela o mês nos painéis). Sem retrato,
--    o de hoje.
--
-- 2. Sem lote vigente do mês (59 apagado/reimportado no meio), a conta
--    gravava recebido 0 → 0% → todo mundo na faixa mais baixa. Agora, sem
--    lote, a conta não mexe no que estava guardado.
--
-- 3. «Confirmar o fechamento» congelava só o % do setor; as médias de cada um
--    seguiam sendo recalculadas ao vivo (Analítico e setor de hoje). Agora o
--    fechamento grava o RESULTADO de cada pessoa em `desafio_vale_resultado`
--    (médias, recebido, vale, cupons), e a gaveta mostra esse resultado.
--    Quem tem resultado gravado continua vendo o desafio mesmo se o setor
--    novo não participa.
--
-- Reexecutável. Só acrescenta (tabela nova + funções).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── O resultado gravado no fechamento ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafio_vale_resultado (
  desafio_id     uuid NOT NULL REFERENCES public.desafio_vale(id) ON DELETE CASCADE,
  perfil_id      uuid NOT NULL,
  nome           text NOT NULL,
  setor_id       uuid,
  setor_nome     text,
  equipe_nome    text,
  medias         numeric(6,1) NOT NULL DEFAULT 0,
  feito          numeric(14,2) NOT NULL DEFAULT 0,
  meta           numeric(14,2),
  bateu          boolean NOT NULL DEFAULT false,
  valor          numeric(10,2) NOT NULL DEFAULT 0,
  cupons         integer NOT NULL DEFAULT 0,
  pix_pendentes  integer NOT NULL DEFAULT 0,
  gravado_em     timestamptz NOT NULL DEFAULT now(),
  gravado_por    uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  PRIMARY KEY (desafio_id, perfil_id)
);
COMMENT ON TABLE public.desafio_vale_resultado IS
  'Resultado de cada pessoa no Desafio do Vale, gravado ao confirmar o fechamento (a virada do mês não muda mais nada).';

ALTER TABLE public.desafio_vale_resultado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS desafio_vale_resultado_super ON public.desafio_vale_resultado;
CREATE POLICY desafio_vale_resultado_super ON public.desafio_vale_resultado FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));
REVOKE ALL ON public.desafio_vale_resultado FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desafio_vale_resultado TO authenticated;

-- ── O setor da pessoa no desafio ───────────────────────────────────────────
-- Até o fim do desafio: o de hoje. Depois: o do retrato do mês do fim
-- (`composicao_mes`), se existir; senão, o de hoje.

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_setor_da_pessoa(p_desafio uuid, p_perfil uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::date <= d.fim THEN p.setor_id
    ELSE coalesce((SELECT c.setor_id FROM public.composicao_mes c
                    WHERE c.empresa_id = d.empresa_id AND c.operador_id = p_perfil
                      AND c.mes = to_char(d.fim, 'YYYY-MM') AND c.setor_id IS NOT NULL
                    LIMIT 1), p.setor_id)
  END
  FROM public.desafio_vale d, public.perfis p
  WHERE d.id = p_desafio AND p.id = p_perfil;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_setor_da_pessoa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Sem lote vigente, a conta não mexe no guardado ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_calcular(p_desafio uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d     public.desafio_vale%ROWTYPE;
  v_mes   date;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_corte integer;
  v_lote  timestamptz;
  n       integer;
BEGIN
  SELECT * INTO v_d FROM public.desafio_vale WHERE id = p_desafio;
  IF v_d.id IS NULL OR v_d.fechado_em IS NOT NULL THEN RETURN 0; END IF;

  v_mes := date_trunc('month', v_d.fim)::date;
  v_corte := CASE WHEN date_trunc('month', v_hoje)::date = v_mes THEN extract(day FROM v_hoje)::integer END;
  SELECT max(l.importado_em) INTO v_lote FROM public.mestre_lotes l
   WHERE l.empresa_id = v_d.empresa_id AND l.mes = v_mes AND l.estado = 'vigente';
  -- Sem o 59 do mês, zerar o setor seria jogar todo mundo na faixa mais baixa.
  IF v_lote IS NULL THEN RETURN 0; END IF;

  WITH linhas AS (
    SELECT l.setor_id, sum(l.recebido) AS v
      FROM public.fn_mestre_diretoria_linhas(v_d.empresa_id, to_char(v_mes, 'YYYY-MM'), v_corte) l
     WHERE l.setor_id IS NOT NULL
     GROUP BY l.setor_id
  ),
  meta AS (
    SELECT m.referencia_id::text AS setor, max(m.meta_valor) AS v
      FROM public.metas m
     WHERE m.empresa_id = v_d.empresa_id AND m.tipo = 'setor'
       AND m.mes = extract(month FROM v_mes)::integer AND m.ano = extract(year FROM v_mes)::integer
     GROUP BY 1
  )
  UPDATE public.desafio_vale_setores s
     SET recebido_auto = coalesce(li.v, 0),
         meta_auto     = me.v,
         pct_auto      = CASE WHEN coalesce(st.regra, '') = 'cofen' OR coalesce(me.v, 0) <= 0 THEN NULL
                              ELSE round(coalesce(li.v, 0) / me.v * 100, 2) END
    FROM public.setores st
    LEFT JOIN linhas li ON li.setor_id = st.id
    LEFT JOIN meta me ON me.setor = st.id::text
   WHERE s.desafio_id = v_d.id AND st.id = s.setor_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.desafio_vale SET calculado_lote = v_lote, calculado_em = now() WHERE id = v_d.id;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_calcular(uuid) FROM PUBLIC, anon, authenticated;

-- ── 1 e 3. Quem vê, com o setor do mês e o resultado gravado ───────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_atual()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa    boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_hoje  date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id    uuid;
  v_lib   boolean;
  v_todos boolean;
  v_setor uuid;
  v_res   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  IF v_sa THEN
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_vale c
     WHERE c.ativo ORDER BY c.atualizado_em DESC LIMIT 1;
  ELSE
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_vale c
     WHERE c.ativo AND c.liberado AND v_hoje BETWEEN c.inicio - 3 AND c.fim + 10
       AND (EXISTS (SELECT 1 FROM public.desafio_vale_setores s
                     WHERE s.desafio_id = c.id AND s.participa
                       AND s.setor_id = public.fn_desafio_vale_setor_da_pessoa(c.id, auth.uid()))
            OR EXISTS (SELECT 1 FROM public.desafio_vale_resultado r
                        WHERE r.desafio_id = c.id AND r.perfil_id = auth.uid()))
     ORDER BY c.atualizado_em DESC LIMIT 1;
  END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  PERFORM public.fn_desafio_vale_atualizar_se_preciso(v_id);

  v_setor := public.fn_desafio_vale_setor_da_pessoa(v_id, auth.uid());
  SELECT to_jsonb(r) - 'desafio_id' - 'gravado_por' INTO v_res
    FROM public.desafio_vale_resultado r WHERE r.desafio_id = v_id AND r.perfil_id = auth.uid();

  v_todos := v_sa OR coalesce(public.fn_user_tem('analitico_escopo_todos_setores'), false);
  RETURN public.fn_desafio_vale_montar(v_id, v_todos)
      || jsonb_build_object(
           'previa', NOT v_lib, 'super_admin', v_sa,
           'meu_setor', CASE WHEN v_setor IS NOT NULL THEN public.fn_desafio_vale_setor_json(v_id, v_setor) END,
           'meu_resultado', v_res);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_atual() TO authenticated;

-- O sinal ao vivo também quando o resultado é gravado (a gaveta troca para o final).
DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_vale_resultado ON public.desafio_vale_resultado;
CREATE TRIGGER trg_realtime_sinal_desafio_vale_resultado
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_vale_resultado
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_vale();

COMMIT;
