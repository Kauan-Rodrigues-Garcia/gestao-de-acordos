-- ============================================================================
-- Campanhas de WhatsApp: o operador avalia o retorno da campanha — 09/10/2026
-- ============================================================================
--
-- Pedido do Cleber: «a operação marca um joinha verde se a campanha teve bom
-- retorno, ou uma mãozinha vermelha se não teve. Cada operador salva o seu, e
-- o líder fica sabendo quantos votaram que foi boa e quantos que não deu.»
--
-- • `campanha_facil_avaliacoes`: um voto por operador e campanha (lote) —
--   original e repasse da mesma pessoa contam uma vez. Troca à vontade;
--   clicar de novo no mesmo tira o voto.
-- • A contagem fica na própria campanha (`votos_bom`, `votos_ruim`): o
--   histórico do líder já lê `campanha_facil_lotes`, e a RLS dele continua
--   a mesma. O líder vê só os números, não quem votou.
-- • Escrita só pela RPC `fn_campanha_facil_avaliar` (SECURITY DEFINER): só
--   quem recebeu a campanha, enquanto ela não encerrou. O operador lê o
--   próprio voto pela policy.
-- • O voto sobrevive à faxina (o lote fica no histórico) e some com a
--   exclusão da campanha (cascade).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A contagem na campanha ───────────────────────────────────────────────

ALTER TABLE public.campanha_facil_lotes
  ADD COLUMN IF NOT EXISTS votos_bom  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS votos_ruim INTEGER NOT NULL DEFAULT 0;

-- ── 2. Os votos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campanha_facil_avaliacoes (
  lote_id     UUID        NOT NULL REFERENCES public.campanha_facil_lotes(id) ON DELETE CASCADE,
  operador_id UUID        NOT NULL,
  empresa_id  UUID        NOT NULL,
  bom         BOOLEAN     NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, operador_id)
);

COMMENT ON TABLE public.campanha_facil_avaliacoes IS
  'Voto do operador sobre o retorno da campanha (bom = joinha). Escrita só por fn_campanha_facil_avaliar. Ver 20261009150000.';

CREATE INDEX IF NOT EXISTS idx_cf_avaliacoes_operador ON public.campanha_facil_avaliacoes (operador_id);

ALTER TABLE public.campanha_facil_avaliacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campanha_facil_avaliacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.campanha_facil_avaliacoes TO authenticated;

DROP POLICY IF EXISTS cf_avaliacoes_select ON public.campanha_facil_avaliacoes;
CREATE POLICY cf_avaliacoes_select ON public.campanha_facil_avaliacoes
  FOR SELECT TO authenticated
  USING (operador_id = (SELECT auth.uid()));

-- ── 3. Votar ────────────────────────────────────────────────────────────────
--
-- `p_bom`: TRUE = bom retorno, FALSE = não deu retorno, NULL = tira o voto.
-- Devolve a contagem nova. O `FOR UPDATE` no lote enfileira votos simultâneos
-- da mesma campanha, e a contagem é refeita a partir dos votos (nunca soma
-- em cima do número guardado).
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_avaliar(p_lote UUID, p_bom BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  l      public.campanha_facil_lotes%ROWTYPE;
  v_bom  INTEGER;
  v_ruim INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = '42501';
  END IF;

  SELECT lt.* INTO l FROM public.campanha_facil_lotes lt
   WHERE lt.id = p_lote AND lt.encerrada_em IS NULL
     AND EXISTS (
       SELECT 1 FROM public.campanha_facil_envios e WHERE e.lote_id = lt.id AND e.operador_id = v_uid
     )
   FOR UPDATE OF lt;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF p_bom IS NULL THEN
    DELETE FROM public.campanha_facil_avaliacoes WHERE lote_id = l.id AND operador_id = v_uid;
  ELSE
    INSERT INTO public.campanha_facil_avaliacoes (lote_id, operador_id, empresa_id, bom)
    VALUES (l.id, v_uid, l.empresa_id, p_bom)
    ON CONFLICT (lote_id, operador_id) DO UPDATE SET bom = EXCLUDED.bom, alterado_em = now();
  END IF;

  SELECT count(*) FILTER (WHERE a.bom)::INTEGER, count(*) FILTER (WHERE NOT a.bom)::INTEGER
    INTO v_bom, v_ruim
    FROM public.campanha_facil_avaliacoes a WHERE a.lote_id = l.id;
  UPDATE public.campanha_facil_lotes SET votos_bom = v_bom, votos_ruim = v_ruim WHERE id = l.id;

  RETURN jsonb_build_object('bom', v_bom, 'ruim', v_ruim);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_campanha_facil_avaliar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_avaliar(uuid, boolean) TO authenticated;

-- ── 4. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'DELETE') THEN
    RAISE EXCEPTION 'campanha_facil_avaliacoes aceita escrita direta.';
  END IF;
  IF has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'UPDATE') THEN
    RAISE EXCEPTION 'campanha_facil_lotes aceita escrita direta.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_campanha_facil_avaliar(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa fn_campanha_facil_avaliar.';
  END IF;
END;
$verificacao$;

-- A 20261009120000 (editar com WHERE TRUE) foi aplicada pelo SQL Editor em
-- 09/10 e conferida com pg_get_functiondef; registra junto.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261009120000', 'campanha_editar_delete_com_where', ARRAY[]::TEXT[]),
       ('20261009150000', 'campanha_avaliacao', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
