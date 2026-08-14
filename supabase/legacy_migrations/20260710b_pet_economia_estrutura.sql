-- ============================================================
-- Migration: estrutura da economia do pet — catálogo, inventário e regras
-- por cargo (2026-07-10)
--
-- Organiza a base para as próximas fases (loja/mercado, itens, troféus):
--   • pet_itens          — catálogo/mercado (roupas, comidas, móveis, troféus,
--                          colecionáveis): preço, raridade, janela sazonal,
--                          exclusivo (só concedido), por tenant ou global.
--   • pet_inventario     — itens que cada usuário possui (comprou/ganhou).
--                          "Bloqueado" = item do catálogo que NÃO está aqui.
--   • pet_economia_regras — o sistema de moedas é DIFERENTE por cargo. Cada
--                          cargo tem taxa (moedas por R$), janela de resgate e
--                          base do recebimento. Começa focado no operador;
--                          admin/super_admin espelham o operador (para testar a
--                          visão de operador). Demais cargos ficam inativos até
--                          serem desenhados.
--
-- As RPCs de resgate/gasto passam a LER essas regras (server-side), mantendo o
-- anti-hack: o cliente nunca credita nem escreve saldo. Assinaturas das RPCs
-- não mudam — o front continua igual.
-- ============================================================

-- ── Catálogo / mercado ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pet_itens (
  id             TEXT PRIMARY KEY,                 -- slug estável ('chapeu', 'gorro_natal'...)
  tipo           TEXT NOT NULL CHECK (tipo IN ('roupa','comida','movel','trofeu','colecionavel')),
  nome           TEXT NOT NULL,
  descricao      TEXT,
  emoji          TEXT,
  raridade       TEXT NOT NULL DEFAULT 'comum'
                 CHECK (raridade IN ('comum','raro','epico','lendario','exclusivo')),
  preco_moedas   INTEGER,                          -- NULL = não vendável (só concedido)
  tenant         TEXT,                             -- NULL = ambos; 'bookplay' | 'pagueplay'
  disponivel_de  TIMESTAMPTZ,                      -- janela sazonal (NULL = sempre)
  disponivel_ate TIMESTAMPTZ,
  exclusivo      BOOLEAN NOT NULL DEFAULT false,   -- destaque do mês etc.: nunca vendido
  ativo          BOOLEAN NOT NULL DEFAULT true,
  ordem          INTEGER NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pet_itens_listagem
  ON public.pet_itens(tipo, ativo, ordem);

-- ── Inventário do usuário ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pet_inventario (
  usuario_id   UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES public.pet_itens(id) ON DELETE CASCADE,
  origem       TEXT NOT NULL DEFAULT 'compra'
               CHECK (origem IN ('compra','recompensa','concessao','evento','inicial')),
  adquirido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, item_id)
);

-- ── Regras de economia por cargo ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pet_economia_regras (
  cargo            TEXT PRIMARY KEY,
  moedas_por_real  NUMERIC NOT NULL DEFAULT 0.1,   -- ex.: 0.1 = 1 moeda a cada R$ 10
  janela_dias      INTEGER NOT NULL DEFAULT 7,     -- dias retroativos p/ resgate
  base_recebimento TEXT    NOT NULL DEFAULT 'proprio'
                   CHECK (base_recebimento IN ('proprio','empresa','equipe')),
  ativo            BOOLEAN NOT NULL DEFAULT false, -- se o cargo ganha moedas agora
  observacao       TEXT,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeds: foco no operador; admin/super_admin espelham operador (visão de
-- operador p/ polir). Demais cargos existem mas inativos (a definir).
INSERT INTO public.pet_economia_regras (cargo, moedas_por_real, janela_dias, base_recebimento, ativo, observacao) VALUES
  ('operador',      0.1, 7, 'proprio', true,  'Ganha do próprio recebimento diário.'),
  ('administrador', 0.1, 7, 'proprio', true,  'Espelha o operador para testar/polir.'),
  ('super_admin',   0.1, 7, 'proprio', true,  'Espelha o operador para testar/polir.'),
  ('lider',         0.1, 7, 'empresa', false, 'Sistema do líder a definir.'),
  ('elite',         0.1, 7, 'empresa', false, 'Sistema do elite a definir.'),
  ('gerencia',      0.1, 7, 'empresa', false, 'A definir.'),
  ('diretoria',     0.1, 7, 'empresa', false, 'A definir.')
ON CONFLICT (cargo) DO NOTHING;

-- ── Seeds do catálogo (roupas/comidas já existentes no front) ─────────────────

INSERT INTO public.pet_itens (id, tipo, nome, descricao, emoji, raridade, preco_moedas, ordem) VALUES
  ('chapeu',   'roupa',  'Chapéu de festa', 'Um chapéu animado para comemorar.', '🥳', 'comum', 300, 1),
  ('cachecol', 'roupa',  'Cachecol',        'Quentinho e estiloso.',             '🧣', 'comum', 200, 2),
  ('maca',     'comida', 'Maçã',            'Um docinho saudável.',              '🍎', 'comum',  50, 1),
  ('racao',    'comida', 'Ração',           'A refeição de sempre.',             '🥣', 'comum',  40, 2),
  ('bolinho',  'comida', 'Bolinho',         'Recompensa fofa.',                  '🧁', 'comum',  60, 3)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Catálogo e regras: leitura para autenticados. Inventário: só o próprio.
-- Escritas de saldo/itens: apenas via RPCs SECURITY DEFINER (abaixo).

ALTER TABLE public.pet_itens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_inventario      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_economia_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_itens_select" ON public.pet_itens;
CREATE POLICY "pet_itens_select" ON public.pet_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "pet_regras_select" ON public.pet_economia_regras;
CREATE POLICY "pet_regras_select" ON public.pet_economia_regras
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "pet_inventario_select" ON public.pet_inventario;
CREATE POLICY "pet_inventario_select" ON public.pet_inventario
  FOR SELECT USING (usuario_id = auth.uid());

-- ── Helper: taxa (moedas por R$) do cargo do usuário; 0 se inativo/sem regra ──

CREATE OR REPLACE FUNCTION public.fn_pet_taxa()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT r.moedas_por_real
    FROM public.pet_economia_regras r
    JOIN public.perfis p ON p.id = auth.uid()
    WHERE r.cargo = p.perfil::text AND r.ativo
  ), 0)::NUMERIC;
$$;

-- ── Helper: dias com recebimento disponível, agora dirigido pelas regras ──────
-- Substitui a versão de 20260709a: lê base_recebimento/janela/ativo do cargo.

CREATE OR REPLACE FUNCTION public.fn_pet_dias_disponiveis()
RETURNS TABLE(dia DATE, total_dia NUMERIC, ja_resgatado NUMERIC, delta NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_cargo  TEXT;
  v_base   TEXT;
  v_janela INTEGER;
  v_ativo  BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.perfil::text INTO v_cargo FROM public.perfis p WHERE p.id = v_uid;

  SELECT r.base_recebimento, r.janela_dias, r.ativo
    INTO v_base, v_janela, v_ativo
    FROM public.pet_economia_regras r
    WHERE r.cargo = v_cargo;

  IF NOT COALESCE(v_ativo, false) THEN RETURN; END IF;

  RETURN QUERY
  WITH receb AS (
    SELECT d.dia_referencia AS dia, SUM(d.valor_recebido) AS total_dia
    FROM public.diario_recebimentos d
    WHERE d.dia_referencia >= (CURRENT_DATE - (COALESCE(v_janela, 7) - 1))
      AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE)
      AND (
        (v_base = 'proprio' AND d.operador_id = v_uid)
        OR (v_base = 'empresa' AND public.fn_can_access_empresa(d.empresa_id))
      )
    GROUP BY d.dia_referencia
  )
  SELECT r.dia,
         r.total_dia,
         COALESCE(pr.valor_resgatado, 0),
         GREATEST(r.total_dia - COALESCE(pr.valor_resgatado, 0), 0)
  FROM receb r
  LEFT JOIN public.pet_recompensas pr
    ON pr.usuario_id = v_uid AND pr.dia_referencia = r.dia;
END;
$$;

-- ── RPC: disponível (usa a taxa do cargo) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pet_recompensa_disponivel()
RETURNS TABLE(valor_disponivel NUMERIC, moedas_disponivel INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC,
         FLOOR(COALESCE(SUM(delta), 0) * public.fn_pet_taxa())::INTEGER
  FROM public.fn_pet_dias_disponiveis();
$$;

-- ── RPC: resgatar (taxa do cargo; atômico) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pet_resgatar_recompensa()
RETURNS TABLE(moedas_creditadas INTEGER, valor_base NUMERIC, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID    := auth.uid();
  v_taxa   NUMERIC := public.fn_pet_taxa();
  v_valor  NUMERIC := 0;
  v_moedas INTEGER := 0;
  rec      RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  FOR rec IN SELECT * FROM public.fn_pet_dias_disponiveis() WHERE delta > 0 LOOP
    v_valor := v_valor + rec.delta;
    INSERT INTO public.pet_recompensas (usuario_id, dia_referencia, valor_resgatado, moedas_creditadas)
      VALUES (v_uid, rec.dia, rec.total_dia, FLOOR(rec.delta * v_taxa)::INTEGER)
    ON CONFLICT (usuario_id, dia_referencia) DO UPDATE
      SET valor_resgatado   = EXCLUDED.valor_resgatado,
          moedas_creditadas = public.pet_recompensas.moedas_creditadas + EXCLUDED.moedas_creditadas,
          atualizado_em     = NOW();
  END LOOP;

  v_moedas := FLOOR(v_valor * v_taxa)::INTEGER;

  IF v_moedas > 0 THEN
    UPDATE public.pet_estado
      SET moedas              = moedas + v_moedas,
          moedas_ganhas_total = moedas_ganhas_total + v_moedas,
          xp                  = xp + v_moedas,
          ultimo_dia_ativo    = CURRENT_DATE,
          atualizado_em       = NOW()
      WHERE usuario_id = v_uid;
  END IF;

  RETURN QUERY
    SELECT v_moedas, v_valor,
           (SELECT moedas FROM public.pet_estado WHERE usuario_id = v_uid);
END;
$$;

-- ── RPC: gastar (agora registra no inventário) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pet_gastar_moedas(p_valor INTEGER, p_item TEXT DEFAULT NULL)
RETURNS TABLE(ok BOOLEAN, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID    := auth.uid();
  v_saldo INTEGER;
BEGIN
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

  IF p_item IS NOT NULL THEN
    INSERT INTO public.pet_inventario (usuario_id, item_id, origem)
      VALUES (v_uid, p_item, 'compra')
    ON CONFLICT (usuario_id, item_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;
