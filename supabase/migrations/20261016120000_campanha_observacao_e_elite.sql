-- ============================================================================
-- Campanha Fácil: a observação do operador para o líder, e a Elite — 16/10/2026
-- ============================================================================
--
-- ## Por que
--
--   • «Colocar um campo de observação depois de realizar a campanha, para o
--     líder saber se a campanha está okay, com um texto diferente para ele
--     identificar.» O operador já vota bom retorno / sem retorno
--     (20261009150000); agora escreve também uma observação, que o líder lê na
--     campanha, com o nome de quem escreveu.
--   • «Nas permissões, permitir que a Elite consiga mandar campanha.» A Elite
--     não aparecia em «Quem encaminhará» (a tela buscava só operador e líder) e
--     não tinha a aba Campanhas de WhatsApp para enviar.
--
-- ## O que muda
--
-- 1. `campanha_facil_avaliacoes` ganha `observacao` (até 500 caracteres) e
--    `observado_em`. `bom` passa a aceitar NULL: dá para deixar a observação
--    sem votar. As contagens (`votos_bom`, `votos_ruim`) já filtram por
--    `bom` / `NOT bom` e ignoram o NULL.
--
-- 2. `campanha_facil_lotes.observacoes` — quantas observações a campanha tem.
--    O histórico do líder já lê o lote; é o que marca a campanha na lista.
--
-- 3. `fn_campanha_facil_avaliar` — tirar o voto de quem deixou observação não
--    apaga a observação (vira `bom = NULL`). O resto é o da 20261009150000.
--
-- 4. `fn_campanha_facil_observar(lote, texto)` — grava, troca ou apaga
--    (texto vazio) a observação. Mesma regra do voto: só quem recebeu a
--    campanha, enquanto ela não encerrou. Texto novo avisa quem lançou.
--
-- 5. Cargo `elite` da BookPlay: liga `ver_campanhas_whatsapp` (receber e
--    enviar) e `ver_campanha_facil` (montar e liberar) — o mesmo que ligar no
--    painel de permissões.
--
-- Reaplicável.

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A observação mora com o voto ─────────────────────────────────────────

ALTER TABLE public.campanha_facil_avaliacoes ALTER COLUMN bom DROP NOT NULL;
ALTER TABLE public.campanha_facil_avaliacoes ADD COLUMN IF NOT EXISTS observacao   TEXT;
ALTER TABLE public.campanha_facil_avaliacoes ADD COLUMN IF NOT EXISTS observado_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_avaliacoes_observacao_tamanho') THEN
    ALTER TABLE public.campanha_facil_avaliacoes
      ADD CONSTRAINT cf_avaliacoes_observacao_tamanho CHECK (char_length(observacao) <= 500);
  END IF;
  -- Linha sem voto e sem observação não diz nada: não deve existir.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_avaliacoes_voto_ou_observacao') THEN
    ALTER TABLE public.campanha_facil_avaliacoes
      ADD CONSTRAINT cf_avaliacoes_voto_ou_observacao CHECK (bom IS NOT NULL OR observacao IS NOT NULL);
  END IF;
END $$;

-- ── 2. A contagem na campanha ───────────────────────────────────────────────

ALTER TABLE public.campanha_facil_lotes
  ADD COLUMN IF NOT EXISTS observacoes INTEGER NOT NULL DEFAULT 0;

-- ── 3. Votar sem apagar a observação ────────────────────────────────────────

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
    -- Com observação, a linha fica e só o voto sai.
    UPDATE public.campanha_facil_avaliacoes
       SET bom = NULL, alterado_em = now()
     WHERE lote_id = l.id AND operador_id = v_uid AND observacao IS NOT NULL;
    DELETE FROM public.campanha_facil_avaliacoes
     WHERE lote_id = l.id AND operador_id = v_uid AND observacao IS NULL;
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

-- ── 4. Observar ─────────────────────────────────────────────────────────────
--
-- `p_texto` vazio (ou só espaços) apaga a observação. Devolve quantas
-- observações a campanha tem. Texto novo — não a mesma frase salva de novo —
-- vira notificação para quem lançou a campanha, que abre a campanha dele.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_observar(p_lote UUID, p_texto TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_texto  TEXT := NULLIF(btrim(COALESCE(p_texto, '')), '');
  v_antes  TEXT;
  l        public.campanha_facil_lotes%ROWTYPE;
  v_n      INTEGER;
  v_autor  RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_texto) > 500 THEN
    RAISE EXCEPTION 'A observação passa de 500 caracteres.';
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

  SELECT a.observacao INTO v_antes
    FROM public.campanha_facil_avaliacoes a
   WHERE a.lote_id = l.id AND a.operador_id = v_uid;

  IF v_texto IS NULL THEN
    UPDATE public.campanha_facil_avaliacoes
       SET observacao = NULL, observado_em = NULL, alterado_em = now()
     WHERE lote_id = l.id AND operador_id = v_uid AND bom IS NOT NULL;
    DELETE FROM public.campanha_facil_avaliacoes
     WHERE lote_id = l.id AND operador_id = v_uid AND bom IS NULL;
  ELSE
    INSERT INTO public.campanha_facil_avaliacoes
      (lote_id, operador_id, empresa_id, bom, observacao, observado_em)
    VALUES (l.id, v_uid, l.empresa_id, NULL, v_texto, now())
    ON CONFLICT (lote_id, operador_id) DO UPDATE
      SET observacao = EXCLUDED.observacao, observado_em = now(), alterado_em = now();
  END IF;

  SELECT count(*)::INTEGER INTO v_n
    FROM public.campanha_facil_avaliacoes a
   WHERE a.lote_id = l.id AND a.observacao IS NOT NULL;
  UPDATE public.campanha_facil_lotes SET observacoes = v_n WHERE id = l.id;

  IF v_texto IS NOT NULL AND v_texto IS DISTINCT FROM v_antes AND l.criado_por IS DISTINCT FROM v_uid THEN
    SELECT pf.nome, pf.foto_url INTO v_autor FROM public.perfis pf WHERE pf.id = v_uid;
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, rota, autor_id, autor_nome, autor_foto)
    VALUES (
      l.criado_por, l.empresa_id, 'Observação na campanha',
      COALESCE(v_autor.nome, 'Operador') || ' · ' || l.titulo || ': «'
        || left(v_texto, 140) || CASE WHEN char_length(v_texto) > 140 THEN '…' ELSE '' END || '»',
      '/campanha-facil?campanha=' || l.id::TEXT,
      v_uid, v_autor.nome, v_autor.foto_url
    );
  END IF;

  RETURN jsonb_build_object('observacoes', v_n);
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_observar(UUID, TEXT) IS
  'Observação do operador sobre a campanha, para o líder. Só quem recebeu, com a campanha aberta. Ver 20261016120000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_observar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_observar(uuid, text) TO authenticated;

COMMENT ON TABLE public.campanha_facil_avaliacoes IS
  'Voto (bom = joinha) e observação do operador sobre a campanha. Lê o próprio operador e quem lançou a campanha. '
  'Escrita só por fn_campanha_facil_avaliar e fn_campanha_facil_observar. Ver 20261009150000, 20261013120000 e 20261016120000.';

-- ── 5. A Elite manda campanha ───────────────────────────────────────────────
--
-- O catálogo passa a ter `ver_campanhas_whatsapp` ligada por padrão também
-- para a Elite (empresa nova já nasce assim). Por acumulação, como
-- 20260911120000: a chave sai da versão anterior pelo `NOT IN` e volta com o
-- padrão novo. `ver_campanha_facil` já tinha a Elite no padrão (liderança).

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_campanha_elite_20261016()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_campanha_elite_20261016;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_campanha_elite_20261016() IS
  'Retrato do catalogo antes de ver_campanhas_whatsapp valer para a Elite (16/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.* FROM public.fn_permissoes_catalogo_antes_campanha_elite_20261016() c
   WHERE c.chave NOT IN ('ver_campanhas_whatsapp')
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba de quem recebe a campanha: o operador e, desde 16/10/2026, a Elite.
    ('ver_campanhas_whatsapp', ARRAY['bookplay']::TEXT[], ARRAY['operador', 'elite']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261016120000 poe a Elite no padrao de ver_campanhas_whatsapp.';

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes
                    || jsonb_build_object('ver_campanhas_whatsapp', true, 'ver_campanha_facil', true)
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo = 'elite'
   AND (
     (cp.permissoes ->> 'ver_campanhas_whatsapp')::BOOLEAN IS DISTINCT FROM TRUE
     OR (cp.permissoes ->> 'ver_campanha_facil')::BOOLEAN IS DISTINCT FROM TRUE
   );

-- ── 6. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'DELETE') THEN
    RAISE EXCEPTION 'campanha_facil_avaliacoes aceita escrita direta.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_campanha_facil_observar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa fn_campanha_facil_observar.';
  END IF;
  -- A redefinição não pode duplicar chave: o NOT IN e o VALUES têm de casar.
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() GROUP BY chave HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Chave duplicada no catalogo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo()
     WHERE chave = 'ver_campanhas_whatsapp' AND 'elite' = ANY (padrao)
  ) THEN
    RAISE EXCEPTION 'ver_campanhas_whatsapp sem a Elite no padrao.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'bookplay'
     WHERE cp.cargo = 'elite'
  ) THEN
    RAISE NOTICE 'A BookPlay não tem linha do cargo elite em cargos_permissoes: ligue as abas pelo painel de permissões.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261016120000', 'campanha_observacao_e_elite', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
