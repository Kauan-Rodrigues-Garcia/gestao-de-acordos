-- ============================================================
-- Migration: economia do pet Aura — Fase 1 (2026-07-09)
--
-- Objetivo: cada usuário passa a ter o SEU pet configurado no banco
-- (roupa equipada, saldo de moedas, quanto ganhou/gastou, xp/nível/streak)
-- e ganha moedas a partir do RECEBIMENTO DIÁRIO (tabela diario_recebimentos).
--
-- Segurança (anti-hack de "dinheiro infinito"):
--   • O cliente NUNCA credita moedas nem escreve o saldo diretamente.
--   • Todo crédito é calculado no servidor a partir de diario_recebimentos
--     (fonte certeira do recebimento), via funções SECURITY DEFINER.
--   • RLS em pet_estado permite ao usuário apenas LER a própria linha; todas
--     as escritas (resgatar recompensa, gastar, salvar visual) passam por RPC.
--
-- Base do recebimento (provisório, fácil de mudar depois):
--   • operador  → soma do próprio recebimento (operador_id = auth.uid())
--   • líder+    → soma do recebimento da empresa (mesma visibilidade do diário)
--   Janela de resgate: últimos 7 dias. Conversão: 1 moeda a cada R$ 10.
-- ============================================================

-- ── Estado do pet (1 linha por usuário) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pet_estado (
  usuario_id          UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  moedas              INTEGER     NOT NULL DEFAULT 0,   -- saldo atual
  moedas_ganhas_total BIGINT      NOT NULL DEFAULT 0,   -- total já ganho (histórico)
  moedas_gastas_total BIGINT      NOT NULL DEFAULT 0,   -- total já gasto (histórico)
  xp                  INTEGER     NOT NULL DEFAULT 0,
  nivel               INTEGER     NOT NULL DEFAULT 1,
  streak              INTEGER     NOT NULL DEFAULT 0,
  ultimo_dia_ativo    DATE,
  roupa_equipada      TEXT        NOT NULL DEFAULT 'nenhuma',
  itens_desbloqueados JSONB       NOT NULL DEFAULT '[]'::jsonb,
  dormindo            BOOLEAN     NOT NULL DEFAULT false,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Ledger de recompensas resgatadas (impede resgatar o mesmo dia 2x) ─────────
-- valor_resgatado é a "marca d'água" do quanto daquele dia já virou moeda; se
-- mais recebimento chegar no mesmo dia, só o delta novo é creditado.

CREATE TABLE IF NOT EXISTS public.pet_recompensas (
  usuario_id        UUID          NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  dia_referencia    DATE          NOT NULL,
  valor_resgatado   NUMERIC(12,2) NOT NULL DEFAULT 0,
  moedas_creditadas INTEGER       NOT NULL DEFAULT 0,
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, dia_referencia)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Leitura: só a própria linha. Escrita: nenhuma direta — tudo via RPC (abaixo).

ALTER TABLE public.pet_estado      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_recompensas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_estado_select" ON public.pet_estado;
CREATE POLICY "pet_estado_select" ON public.pet_estado
  FOR SELECT USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "pet_recompensas_select" ON public.pet_recompensas;
CREATE POLICY "pet_recompensas_select" ON public.pet_recompensas
  FOR SELECT USING (usuario_id = auth.uid());

-- ── Helper interno: dias com recebimento ainda não resgatado (últimos 7d) ─────
-- Usa auth.uid() diretamente (sempre o chamador). Respeita a mesma visibilidade
-- do diário: operador vê o próprio, líder+ vê a empresa. Ignora acordos com
-- prox_contato ≤ hoje (mesma regra dos totais do diário).

CREATE OR REPLACE FUNCTION public.fn_pet_dias_disponiveis()
RETURNS TABLE(dia DATE, total_dia NUMERIC, ja_resgatado NUMERIC, delta NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH is_lider AS (
    SELECT public.fn_user_has_any_role(
      ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
    ) AS v
  ),
  receb AS (
    SELECT d.dia_referencia AS dia, SUM(d.valor_recebido) AS total_dia
    FROM public.diario_recebimentos d, is_lider l
    WHERE d.dia_referencia >= (CURRENT_DATE - 6)
      AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE)
      AND (
        (NOT l.v AND d.operador_id = auth.uid())
        OR (l.v AND public.fn_can_access_empresa(d.empresa_id))
      )
    GROUP BY d.dia_referencia
  )
  SELECT r.dia,
         r.total_dia,
         COALESCE(pr.valor_resgatado, 0),
         GREATEST(r.total_dia - COALESCE(pr.valor_resgatado, 0), 0)
  FROM receb r
  LEFT JOIN public.pet_recompensas pr
    ON pr.usuario_id = auth.uid() AND pr.dia_referencia = r.dia;
$$;

-- ── RPC: quanto há disponível para resgatar agora (só leitura) ────────────────

CREATE OR REPLACE FUNCTION public.fn_pet_recompensa_disponivel()
RETURNS TABLE(valor_disponivel NUMERIC, moedas_disponivel INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC,
         FLOOR(COALESCE(SUM(delta), 0) * 0.1)::INTEGER
  FROM public.fn_pet_dias_disponiveis();
$$;

-- ── RPC: pegar a recompensa (converte recebimento em moedas, atômico) ─────────

CREATE OR REPLACE FUNCTION public.fn_pet_resgatar_recompensa()
RETURNS TABLE(moedas_creditadas INTEGER, valor_base NUMERIC, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID    := auth.uid();
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
      VALUES (v_uid, rec.dia, rec.total_dia, FLOOR(rec.delta * 0.1)::INTEGER)
    ON CONFLICT (usuario_id, dia_referencia) DO UPDATE
      SET valor_resgatado   = EXCLUDED.valor_resgatado,
          moedas_creditadas = public.pet_recompensas.moedas_creditadas + EXCLUDED.moedas_creditadas,
          atualizado_em     = NOW();
  END LOOP;

  v_moedas := FLOOR(v_valor * 0.1)::INTEGER;

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

-- ── RPC: gastar moedas (loja futura; garante saldo, registra gasto) ───────────

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
        itens_desbloqueados = CASE
          WHEN p_item IS NULL OR itens_desbloqueados ? p_item THEN itens_desbloqueados
          ELSE itens_desbloqueados || to_jsonb(p_item)
        END,
        atualizado_em       = NOW()
    WHERE usuario_id = v_uid
    RETURNING moedas INTO v_saldo;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;

-- ── RPC: salvar personalização (roupa/sono) — única escrita "visual" ──────────
-- Não toca em moedas: fecha o vetor de hack mesmo se o cliente chamar direto.

CREATE OR REPLACE FUNCTION public.fn_pet_salvar_visual(p_roupa TEXT, p_dormindo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.pet_estado (usuario_id, roupa_equipada, dormindo)
    VALUES (v_uid, COALESCE(p_roupa, 'nenhuma'), COALESCE(p_dormindo, false))
  ON CONFLICT (usuario_id) DO UPDATE
    SET roupa_equipada = COALESCE(EXCLUDED.roupa_equipada, 'nenhuma'),
        dormindo       = COALESCE(EXCLUDED.dormindo, false),
        atualizado_em  = NOW();
END;
$$;

-- ── RPC: carregar o estado (cria a linha na primeira vez e devolve) ───────────

CREATE OR REPLACE FUNCTION public.fn_pet_estado_get()
RETURNS public.pet_estado
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.pet_estado;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;
  SELECT * INTO v_row FROM public.pet_estado WHERE usuario_id = v_uid;
  RETURN v_row;
END;
$$;

-- ── Realtime: saldo atualiza ao vivo entre as abas do próprio usuário ─────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pet_estado'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pet_estado;
  END IF;
END $$;
