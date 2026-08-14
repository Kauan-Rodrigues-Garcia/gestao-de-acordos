-- ============================================================
-- Migration: loja do pet validada no SERVIDOR + painel admin (2026-07-11)
--
-- Fecha as duas brechas conhecidas (ver docs/contexto-pet-loja-mensal-2026-07-11.md):
--   1. O preço era validado no CLIENTE — fn_pet_gastar_moedas só conferia saldo.
--      Agora a compra é por id (fn_pet_comprar_item): o servidor lê o preço na
--      pet_itens, valida janela/ativo/"já possui" e debita.
--   2. Equipar roupa não-comprada via RPC direta era possível —
--      fn_pet_salvar_visual agora só aceita roupa grátis (preço 0) ou possuída.
--
-- Também liga o catálogo do front na tabela pet_itens (de 20260710b):
--   • corrige os preços-semente para os valores reais do front
--     (chapéu/cachecol grátis; maçã 3, ração 5, bolinho 8);
--   • semeia os 10 itens da loja mensal de julho/2026 com janela de vitrine;
--   • sincroniza itens_desbloqueados (jsonb) ⇄ pet_inventario nos dois
--     sentidos (idempotente), qualquer que tenha sido o histórico aplicado.
--
-- Painel admin (aba Pet em Configurações):
--   • fn_pet_admin_listar()          — visão geral dos jogadores (só admin);
--   • fn_pet_admin_ajustar_moedas()  — crédito/débito manual (só admin);
--   • RLS de escrita em pet_itens e pet_economia_regras para admins.
--
-- Pré-requisito: 20260709a_pet_economia.sql e 20260710b_pet_economia_estrutura.sql.
-- (Os CREATE TABLE IF NOT EXISTS abaixo repetem a estrutura por segurança.)
-- ============================================================

-- ── Garantias de estrutura (no-op se 20260710b já foi aplicada) ───────────────

CREATE TABLE IF NOT EXISTS public.pet_itens (
  id             TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('roupa','comida','movel','trofeu','colecionavel')),
  nome           TEXT NOT NULL,
  descricao      TEXT,
  emoji          TEXT,
  raridade       TEXT NOT NULL DEFAULT 'comum'
                 CHECK (raridade IN ('comum','raro','epico','lendario','exclusivo')),
  preco_moedas   INTEGER,
  tenant         TEXT,
  disponivel_de  TIMESTAMPTZ,
  disponivel_ate TIMESTAMPTZ,
  exclusivo      BOOLEAN NOT NULL DEFAULT false,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  ordem          INTEGER NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pet_inventario (
  usuario_id   UUID NOT NULL REFERENCES public.perfis(id)    ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES public.pet_itens(id) ON DELETE CASCADE,
  origem       TEXT NOT NULL DEFAULT 'compra'
               CHECK (origem IN ('compra','recompensa','concessao','evento','inicial')),
  adquirido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, item_id)
);

ALTER TABLE public.pet_itens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_itens_select" ON public.pet_itens;
CREATE POLICY "pet_itens_select" ON public.pet_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "pet_inventario_select" ON public.pet_inventario;
CREATE POLICY "pet_inventario_select" ON public.pet_inventario
  FOR SELECT USING (usuario_id = auth.uid());

-- ── Catálogo: preços reais do front + loja mensal de julho/2026 ───────────────
-- Grátis = preco_moedas 0 (todo mundo pode equipar sem comprar).
-- Loja mensal = janela [1º dia do mês, 1º dia do mês seguinte).

INSERT INTO public.pet_itens (id, tipo, nome, descricao, emoji, raridade, preco_moedas, disponivel_de, disponivel_ate, ordem) VALUES
  -- roupas grátis de sempre
  ('chapeu',   'roupa', 'Chapéu de festa', 'Um chapéu animado para comemorar.', '🥳', 'comum', 0, NULL, NULL, 1),
  ('cachecol', 'roupa', 'Cachecol',        'Quentinho e estiloso.',             '🧣', 'comum', 0, NULL, NULL, 2),
  -- comidas (consumíveis, sempre disponíveis)
  ('maca',     'comida', 'Maçã',    'Um docinho saudável.', '🍎', 'comum', 3, NULL, NULL, 1),
  ('racao',    'comida', 'Ração',   'A refeição de sempre.','🥣', 'comum', 5, NULL, NULL, 2),
  ('bolinho',  'comida', 'Bolinho', 'Recompensa fofa.',     '🧁', 'comum', 8, NULL, NULL, 3),
  -- loja mensal — julho/2026
  ('coroa',       'roupa', 'Coroa dourada',     NULL, '👑', 'epico', 250, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 10),
  ('capa',        'roupa', 'Capa de heroína',   NULL, '🦸', 'epico', 220, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 11),
  ('oculos_sol',  'roupa', 'Óculos de sol',     NULL, '🕶️', 'raro',  150, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 12),
  ('tiara',       'roupa', 'Tiara de estrela',  NULL, '⭐', 'raro',  140, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 13),
  ('colar',       'roupa', 'Colar de pérolas',  NULL, '📿', 'raro',  130, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 14),
  ('bone',        'roupa', 'Boné vermelho',     NULL, '🧢', 'comum', 110, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 15),
  ('oculos_nerd', 'roupa', 'Óculos redondos',   NULL, '🤓', 'comum', 100, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 16),
  ('laco',        'roupa', 'Laço de fita',      NULL, '🎀', 'comum',  90, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 17),
  ('gravata',     'roupa', 'Gravata borboleta', NULL, '🤵', 'comum',  80, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 18),
  ('flor',        'roupa', 'Flor na orelha',    NULL, '🌸', 'comum',  60, '2026-07-01 00:00-03', '2026-08-01 00:00-03', 19)
ON CONFLICT (id) DO UPDATE
  SET nome           = EXCLUDED.nome,
      emoji          = EXCLUDED.emoji,
      preco_moedas   = EXCLUDED.preco_moedas,
      disponivel_de  = EXCLUDED.disponivel_de,
      disponivel_ate = EXCLUDED.disponivel_ate,
      ordem          = EXCLUDED.ordem;

-- ── Backfill: sincroniza inventário jsonb ⇄ tabela (idempotente) ──────────────
-- Qualquer compra registrada só num dos lados passa a existir nos dois.

INSERT INTO public.pet_inventario (usuario_id, item_id, origem)
SELECT e.usuario_id, j.item_id, 'compra'
FROM public.pet_estado e
CROSS JOIN LATERAL jsonb_array_elements_text(e.itens_desbloqueados) AS j(item_id)
WHERE EXISTS (SELECT 1 FROM public.pet_itens i WHERE i.id = j.item_id)
ON CONFLICT (usuario_id, item_id) DO NOTHING;

UPDATE public.pet_estado e
SET itens_desbloqueados = sub.itens
FROM (
  SELECT inv.usuario_id, jsonb_agg(DISTINCT inv.item_id) AS itens
  FROM public.pet_inventario inv
  JOIN public.pet_itens i ON i.id = inv.item_id AND i.tipo <> 'comida'
  GROUP BY inv.usuario_id
) sub
WHERE sub.usuario_id = e.usuario_id
  AND (SELECT COUNT(*) FROM jsonb_array_elements_text(e.itens_desbloqueados)) <
      (SELECT COUNT(*) FROM jsonb_array_elements_text(sub.itens));

-- ── RPC: comprar por ID — preço/janela/posse validados NO SERVIDOR ────────────
-- erro: NULL = ok | 'nao_encontrado' | 'indisponivel' | 'ja_possui' | 'saldo'

CREATE OR REPLACE FUNCTION public.fn_pet_comprar_item(p_item_id TEXT)
RETURNS TABLE(ok BOOLEAN, erro TEXT, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_item  public.pet_itens;
  v_saldo INTEGER;
BEGIN
  IF v_uid IS NULL OR p_item_id IS NULL THEN
    RETURN QUERY SELECT false, 'nao_encontrado'::TEXT, 0; RETURN;
  END IF;

  SELECT * INTO v_item FROM public.pet_itens WHERE id = p_item_id;

  IF v_item.id IS NULL THEN
    RETURN QUERY SELECT false, 'nao_encontrado'::TEXT, 0; RETURN;
  END IF;

  -- vendável agora? (ativo, não-exclusivo, com preço, dentro da janela)
  IF NOT v_item.ativo
     OR v_item.exclusivo
     OR v_item.preco_moedas IS NULL
     OR v_item.preco_moedas <= 0
     OR (v_item.disponivel_de  IS NOT NULL AND NOW() <  v_item.disponivel_de)
     OR (v_item.disponivel_ate IS NOT NULL AND NOW() >= v_item.disponivel_ate)
  THEN
    RETURN QUERY SELECT false, 'indisponivel'::TEXT, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  -- itens permanentes não podem ser comprados duas vezes
  IF v_item.tipo <> 'comida' AND EXISTS (
    SELECT 1 FROM public.pet_inventario
    WHERE usuario_id = v_uid AND item_id = v_item.id
  ) THEN
    RETURN QUERY SELECT false, 'ja_possui'::TEXT,
      (SELECT moedas FROM public.pet_estado WHERE usuario_id = v_uid);
    RETURN;
  END IF;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = v_uid FOR UPDATE;

  IF v_saldo < v_item.preco_moedas THEN
    RETURN QUERY SELECT false, 'saldo'::TEXT, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas - v_item.preco_moedas,
        moedas_gastas_total = moedas_gastas_total + v_item.preco_moedas,
        itens_desbloqueados = CASE
          WHEN v_item.tipo = 'comida' OR itens_desbloqueados ? v_item.id THEN itens_desbloqueados
          ELSE itens_desbloqueados || to_jsonb(v_item.id)
        END,
        atualizado_em       = NOW()
    WHERE usuario_id = v_uid
    RETURNING moedas INTO v_saldo;

  IF v_item.tipo <> 'comida' THEN
    INSERT INTO public.pet_inventario (usuario_id, item_id, origem)
      VALUES (v_uid, v_item.id, 'compra')
    ON CONFLICT (usuario_id, item_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, v_saldo;
END;
$$;

-- ── Endurece a RPC legada: compra com item DELEGA para a validada ─────────────
-- (clientes antigos passavam o preço do cliente — agora é ignorado; o gasto
-- "solto" sem item continua permitido: só debita, nunca credita)

CREATE OR REPLACE FUNCTION public.fn_pet_gastar_moedas(p_valor INTEGER, p_item TEXT DEFAULT NULL)
RETURNS TABLE(ok BOOLEAN, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_saldo INTEGER;
BEGIN
  IF p_item IS NOT NULL THEN
    RETURN QUERY SELECT c.ok, c.moedas_total FROM public.fn_pet_comprar_item(p_item) c;
    RETURN;
  END IF;

  IF v_uid IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = v_uid FOR UPDATE;

  IF v_saldo < p_valor THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas - p_valor,
        moedas_gastas_total = moedas_gastas_total + p_valor,
        atualizado_em       = NOW()
    WHERE usuario_id = v_uid
    RETURNING moedas INTO v_saldo;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;

-- ── Endurece o visual: só equipa roupa grátis (preço 0) ou possuída ───────────
-- Roupa inválida é ignorada (mantém a atual); o sono é salvo normalmente.

CREATE OR REPLACE FUNCTION public.fn_pet_salvar_visual(p_roupa TEXT, p_dormindo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_permitida BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_permitida := COALESCE(p_roupa, 'nenhuma') = 'nenhuma'
    OR EXISTS (
      SELECT 1 FROM public.pet_itens i
      WHERE i.id = p_roupa AND i.tipo = 'roupa' AND i.preco_moedas = 0
    )
    OR EXISTS (
      SELECT 1 FROM public.pet_inventario inv
      WHERE inv.usuario_id = v_uid AND inv.item_id = p_roupa
    )
    OR EXISTS (
      SELECT 1 FROM public.pet_estado e
      WHERE e.usuario_id = v_uid AND e.itens_desbloqueados ? p_roupa
    );

  INSERT INTO public.pet_estado (usuario_id, roupa_equipada, dormindo)
    VALUES (v_uid,
            CASE WHEN v_permitida THEN COALESCE(p_roupa, 'nenhuma') ELSE 'nenhuma' END,
            COALESCE(p_dormindo, false))
  ON CONFLICT (usuario_id) DO UPDATE
    SET roupa_equipada = CASE WHEN v_permitida
                              THEN COALESCE(EXCLUDED.roupa_equipada, 'nenhuma')
                              ELSE public.pet_estado.roupa_equipada END,
        dormindo       = COALESCE(EXCLUDED.dormindo, false),
        atualizado_em  = NOW();
END;
$$;

-- ── Painel admin ──────────────────────────────────────────────────────────────

-- Escrita no catálogo e nas regras: só administrador/super_admin.
DROP POLICY IF EXISTS "pet_itens_admin_write" ON public.pet_itens;
CREATE POLICY "pet_itens_admin_write" ON public.pet_itens
  FOR ALL
  USING (public.fn_user_has_any_role(ARRAY['administrador','super_admin']))
  WITH CHECK (public.fn_user_has_any_role(ARRAY['administrador','super_admin']));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pet_economia_regras') THEN
    EXECUTE 'DROP POLICY IF EXISTS "pet_regras_admin_write" ON public.pet_economia_regras';
    EXECUTE 'CREATE POLICY "pet_regras_admin_write" ON public.pet_economia_regras
      FOR UPDATE
      USING (public.fn_user_has_any_role(ARRAY[''administrador'',''super_admin'']))
      WITH CHECK (public.fn_user_has_any_role(ARRAY[''administrador'',''super_admin'']))';
  END IF;
END $$;

-- Visão geral dos jogadores (uma linha por usuário com pet).
CREATE OR REPLACE FUNCTION public.fn_pet_admin_listar()
RETURNS TABLE(
  usuario_id UUID, nome TEXT, cargo TEXT,
  moedas INTEGER, moedas_ganhas_total BIGINT, moedas_gastas_total BIGINT,
  xp INTEGER, nivel INTEGER, streak INTEGER,
  qtd_itens INTEGER, roupa_equipada TEXT, ultimo_dia_ativo DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.usuario_id, p.nome, p.perfil::text,
         e.moedas, e.moedas_ganhas_total, e.moedas_gastas_total,
         e.xp, e.nivel, e.streak,
         (SELECT COUNT(*) FROM jsonb_array_elements_text(e.itens_desbloqueados))::INTEGER,
         e.roupa_equipada, e.ultimo_dia_ativo
  FROM public.pet_estado e
  JOIN public.perfis p ON p.id = e.usuario_id
  WHERE public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  ORDER BY e.moedas DESC, p.nome;
$$;

-- Ajuste manual de moedas (bônus/correção). Saldo nunca fica negativo.
CREATE OR REPLACE FUNCTION public.fn_pet_admin_ajustar_moedas(p_usuario UUID, p_delta INTEGER)
RETURNS TABLE(ok BOOLEAN, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo INTEGER;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR p_usuario IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (p_usuario)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = p_usuario FOR UPDATE;

  IF v_saldo + p_delta < 0 THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas + p_delta,
        moedas_ganhas_total = moedas_ganhas_total + GREATEST(p_delta, 0),
        moedas_gastas_total = moedas_gastas_total + GREATEST(-p_delta, 0),
        atualizado_em       = NOW()
    WHERE usuario_id = p_usuario
    RETURNING moedas INTO v_saldo;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;
