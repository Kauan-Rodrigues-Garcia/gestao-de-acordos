-- ============================================================================
-- Campanha Fácil — histórico do operador, mensagens favoritas e Pix Automático
-- 09/10/2026 (pedido do Cleber)
-- ============================================================================
--
-- 1. Desconto do Pix Automático (`campanha_facil_descontos.pix_automatico`):
--    as variáveis {{pix_automatico_21x}} e {{pix_automatico_desconto_21x}}
--    (calculadas no navegador, campaign-core) usam este percentual. Padrão 5%,
--    e as configurações já salvas ganham os 5%.
--
-- 2. Mensagens favoritas, de CADA líder (`campanha_facil_mensagens_favoritas`):
--    a estrelinha fixa a mensagem num cartão no topo do passo 2. `template_id`
--    é o id do modelo padrão (texto) ou da mensagem adicionada (uuid em texto).
--    Cada um lê e mexe só nas suas.
--
-- 3. Histórico do operador (`fn_campanha_facil_minhas_participacoes`): as
--    campanhas de que ele participou, com o andamento dele e o voto que deu
--    (20261009150000). As abertas vêm dos envios; as encerradas, do placar
--    congelado (a faxina apaga os envios). Campanha excluída pelo líder some.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Desconto do Pix Automático ───────────────────────────────────────────

ALTER TABLE public.campanha_facil_descontos
  ADD COLUMN IF NOT EXISTS pix_automatico NUMERIC NOT NULL DEFAULT 5;

-- ── 2. Mensagens favoritas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campanha_facil_mensagens_favoritas (
  perfil_id   UUID        NOT NULL DEFAULT auth.uid(),
  empresa_id  UUID        NOT NULL,
  template_id TEXT        NOT NULL CHECK (length(template_id) BETWEEN 1 AND 100),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (perfil_id, empresa_id, template_id)
);

COMMENT ON TABLE public.campanha_facil_mensagens_favoritas IS
  'Mensagens da Campanha Fácil fixadas por cada líder (estrelinha). Ver 20261009180000.';

ALTER TABLE public.campanha_facil_mensagens_favoritas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campanha_facil_mensagens_favoritas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.campanha_facil_mensagens_favoritas TO authenticated;

DROP POLICY IF EXISTS cf_favoritas_select ON public.campanha_facil_mensagens_favoritas;
CREATE POLICY cf_favoritas_select ON public.campanha_facil_mensagens_favoritas
  FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cf_favoritas_insert ON public.campanha_facil_mensagens_favoritas;
CREATE POLICY cf_favoritas_insert ON public.campanha_facil_mensagens_favoritas
  FOR INSERT TO authenticated
  WITH CHECK (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cf_favoritas_delete ON public.campanha_facil_mensagens_favoritas;
CREATE POLICY cf_favoritas_delete ON public.campanha_facil_mensagens_favoritas
  FOR DELETE TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

-- ── 3. Histórico do operador ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_minhas_participacoes()
RETURNS TABLE (
  lote_id      UUID,
  titulo       TEXT,
  liberada_por TEXT,
  setor_nome   TEXT,
  lancada_em   TIMESTAMPTZ,
  encerrada_em TIMESTAMPTZ,
  ativa        BOOLEAN,
  total        INTEGER,
  enviados     INTEGER,
  nao_enviados INTEGER,
  bom          BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  -- Campanha ainda aberta: o andamento ao vivo, somando original e repasse.
  parte_aberta AS (
    SELECT e.lote_id,
           count(c.id)::INTEGER AS total,
           count(c.id) FILTER (WHERE c.status = 'enviado')::INTEGER AS enviados,
           count(c.id) FILTER (WHERE c.status = 'nao_enviado')::INTEGER AS nao_enviados
      FROM eu
      JOIN public.campanha_facil_envios e ON e.operador_id = eu.uid
      JOIN public.campanha_facil_lotes l ON l.id = e.lote_id AND l.encerrada_em IS NULL
      LEFT JOIN public.campanha_facil_contatos c ON c.envio_id = e.id
     GROUP BY e.lote_id
  ),
  -- Campanha encerrada: o placar que a faxina congelou.
  parte_fechada AS (
    SELECT l.id AS lote_id,
           COALESCE((p.item ->> 'total')::INTEGER, 0) AS total,
           COALESCE((p.item ->> 'enviados')::INTEGER, 0) AS enviados,
           COALESCE((p.item ->> 'nao_enviados')::INTEGER, 0) AS nao_enviados
      FROM eu
      JOIN public.campanha_facil_lotes l
        ON l.encerrada_em IS NOT NULL
       AND l.placar @> jsonb_build_array(jsonb_build_object('operador_id', eu.uid))
     CROSS JOIN LATERAL jsonb_array_elements(l.placar) AS p(item)
     WHERE p.item ->> 'operador_id' = eu.uid::TEXT
  ),
  partes AS (
    SELECT * FROM parte_aberta
    UNION ALL
    SELECT * FROM parte_fechada
  )
  SELECT l.id, l.titulo, l.criado_por_nome, l.setor_nome, l.lancada_em, l.encerrada_em, l.ativa,
         pt.total, pt.enviados, pt.nao_enviados, av.bom
    FROM partes pt
    JOIN public.campanha_facil_lotes l ON l.id = pt.lote_id AND l.lancada_em IS NOT NULL
    CROSS JOIN eu
    LEFT JOIN public.campanha_facil_avaliacoes av ON av.lote_id = l.id AND av.operador_id = eu.uid
   ORDER BY l.lancada_em DESC;
$function$;

REVOKE ALL ON FUNCTION public.fn_campanha_facil_minhas_participacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_minhas_participacoes() TO authenticated;

-- ── 4. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF has_table_privilege('authenticated', 'public.campanha_facil_mensagens_favoritas', 'UPDATE') THEN
    RAISE EXCEPTION 'favoritas aceita UPDATE.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_campanha_facil_minhas_participacoes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa fn_campanha_facil_minhas_participacoes.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campanha_facil_descontos WHERE pix_automatico IS DISTINCT FROM 5) THEN
    RAISE EXCEPTION 'Configuração de desconto sem os 5%% do Pix Automático.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261009180000', 'campanha_historico_favoritas_pix', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
