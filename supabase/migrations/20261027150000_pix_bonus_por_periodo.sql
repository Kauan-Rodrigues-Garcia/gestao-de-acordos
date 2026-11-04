-- ═══════════════════════════════════════════════════════════════════════════
-- Pix Automático: bônus de comissão por setor e período (27/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O caso
--
-- A operação vai rodar semanas com bônus: durante o período, quem fecha Pix
-- nos setores escolhidos ganha alguns pontos a mais no percentual. Exemplo: o
-- setor paga 0,25%, o bônus é +0,02, e o acordo do período vale 0,27%.
--
-- ## O que muda
--
--   1. `pix_automatico_bonus`: o bônus (pontos percentuais SOMADOS ao % do
--      setor), os setores que participam e o período (`inicio` .. `fim`; `fim`
--      nulo = sem data para acabar).
--   2. `pix_automatico_acordos.bonus_pct`: o carimbo na linha. É a etiqueta que
--      a tela mostra e o número que a comissão soma.
--   3. Um gatilho em `pix_automatico_acordos` carimba o bônus vigente na data
--      do acordo (`criado_em` em São Paulo) a cada INSERT/UPDATE. Quem decide é
--      o banco, então o operador não forja bônus, e todo caminho que cria linha
--      (registro, lote, restauro da lixeira, pedido de NR) passa por ele.
--   4. Mudar um bônus recarimba as linhas que ainda podem mudar.
--
-- ## O que não muda
--
-- `pct_comissao` continua travando só o % do SETOR na aprovação. O bônus fica
-- separado, por isso o acordo aprovado antes de o bônus ser lançado também o
-- recebe.
--
-- Linha PAGA não muda mais: o bônus fica como estava quando foi paga. Linha de
-- MÊS FECHADO também não é recarimbada. Linhas já pagas quando o bônus é
-- lançado ficam sem ele.
--
-- Dois bônus vigentes para o mesmo setor e dia não somam: vale o maior.
--
-- Reaplicável.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O bônus ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_automatico_bonus (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pct              NUMERIC(6,4) NOT NULL,
  setor_ids        UUID[] NOT NULL,
  inicio           DATE NOT NULL,
  fim              DATE,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  descricao        TEXT,
  criado_por       UUID,
  criado_por_nome  TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pix_bonus_pct_positivo  CHECK (pct > 0 AND pct <= 100),
  CONSTRAINT pix_bonus_tem_setor     CHECK (cardinality(setor_ids) > 0),
  CONSTRAINT pix_bonus_periodo_valido CHECK (fim IS NULL OR fim >= inicio)
);

COMMENT ON TABLE public.pix_automatico_bonus IS
  'Bônus de comissão do Pix Automático por setor e período. pct são pontos '
  'percentuais SOMADOS ao % do setor (0,25 + 0,02 = 0,27). Ver 20261027150000.';

CREATE INDEX IF NOT EXISTS idx_pix_bonus_empresa ON public.pix_automatico_bonus (empresa_id);

ALTER TABLE public.pix_automatico_bonus ENABLE ROW LEVEL SECURITY;

-- As mesmas portas de `pix_automatico_config`.
DROP POLICY IF EXISTS pix_bonus_select ON public.pix_automatico_bonus;
CREATE POLICY pix_bonus_select ON public.pix_automatico_bonus
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS pix_bonus_write ON public.pix_automatico_bonus;
CREATE POLICY pix_bonus_write ON public.pix_automatico_bonus
  USING (public.fn_can_access_empresa(empresa_id)
         AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin']))
  WITH CHECK (public.fn_can_access_empresa(empresa_id)
         AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin']));

DROP POLICY IF EXISTS pix_bonus_super_admin_total ON public.pix_automatico_bonus;
CREATE POLICY pix_bonus_super_admin_total ON public.pix_automatico_bonus
  TO authenticated
  USING (public.fn_user_is_super_admin()) WITH CHECK (public.fn_user_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pix_automatico_bonus TO authenticated;

DROP TRIGGER IF EXISTS trg_pix_bonus_updated ON public.pix_automatico_bonus;
CREATE TRIGGER trg_pix_bonus_updated
  BEFORE UPDATE ON public.pix_automatico_bonus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

DROP TRIGGER IF EXISTS trg_log_pix_automatico_bonus ON public.pix_automatico_bonus;
CREATE TRIGGER trg_log_pix_automatico_bonus
  AFTER INSERT OR DELETE OR UPDATE ON public.pix_automatico_bonus
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'financeiro', 'pix_bonus', 'o bônus do Pix', 'descricao', '', 'empresa_id', 'critico');

-- ── 2. O carimbo na linha ───────────────────────────────────────────────────

ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS bonus_pct NUMERIC(6,4);

COMMENT ON COLUMN public.pix_automatico_acordos.bonus_pct IS
  'Bônus (pontos percentuais) somado ao % do setor nesta linha. Carimbado pelo '
  'gatilho trg_pix_bonus_carimbo; nulo = sem bônus. Ver 20261027150000.';

-- O bônus que vale para um setor num instante. Vários vigentes: o maior.
CREATE OR REPLACE FUNCTION public.fn_pix_bonus_vigente(
  p_empresa UUID, p_setor UUID, p_criado_em TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT max(b.pct)
    FROM public.pix_automatico_bonus b
   WHERE b.empresa_id = p_empresa
     AND b.ativo
     AND p_setor IS NOT NULL
     AND p_setor = ANY (b.setor_ids)
     AND (p_criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= b.inicio
     AND (b.fim IS NULL OR (p_criado_em AT TIME ZONE 'America/Sao_Paulo')::date <= b.fim);
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_bonus_vigente(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fn_pix_bonus_carimbo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Paga continua paga com o bônus que tinha.
    IF OLD.pago AND NEW.pago THEN
      NEW.bonus_pct := OLD.bonus_pct;
      RETURN NEW;
    END IF;
    -- Mês fechado não muda de número por causa de bônus lançado depois.
    IF public.fn_mes_fechado(to_char(OLD.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')) THEN
      NEW.bonus_pct := OLD.bonus_pct;
      RETURN NEW;
    END IF;
  END IF;

  NEW.bonus_pct := public.fn_pix_bonus_vigente(NEW.empresa_id, NEW.setor_id, NEW.criado_em);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_bonus_carimbo ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_bonus_carimbo
  BEFORE INSERT OR UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_bonus_carimbo();

-- O recarimbo abaixo mexe em muitas linhas de uma vez: sem ignorar `bonus_pct`,
-- a auditoria ganharia uma entrada por acordo. A mudança já fica registrada
-- uma vez só, no log de `pix_automatico_bonus`.
DROP TRIGGER IF EXISTS trg_log_pix_automatico_acordos ON public.pix_automatico_acordos;
CREATE TRIGGER trg_log_pix_automatico_acordos
  AFTER INSERT OR DELETE OR UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'financeiro', 'pix_registro', 'o registro de Pix', 'nr_cliente,operador_nome', 'bonus_pct', 'empresa_id', 'info');

-- ── 3. Mudar o bônus recarimba o que ainda pode mudar ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_bonus_recarimbar(p_empresa UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  -- O valor do SET é o mesmo que o gatilho calcula; ele roda de novo e confirma.
  UPDATE public.pix_automatico_acordos a
     SET bonus_pct = public.fn_pix_bonus_vigente(a.empresa_id, a.setor_id, a.criado_em)
   WHERE a.empresa_id = p_empresa
     AND NOT a.pago
     AND a.bonus_pct IS DISTINCT FROM public.fn_pix_bonus_vigente(a.empresa_id, a.setor_id, a.criado_em)
     AND NOT public.fn_mes_fechado(to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_bonus_recarimbar(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_pix_bonus_apos_mudar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_pix_bonus_recarimbar(COALESCE(NEW.empresa_id, OLD.empresa_id));
  IF TG_OP = 'UPDATE' AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    PERFORM public.fn_pix_bonus_recarimbar(OLD.empresa_id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_bonus_recarimba ON public.pix_automatico_bonus;
CREATE TRIGGER trg_pix_bonus_recarimba
  AFTER INSERT OR UPDATE OR DELETE ON public.pix_automatico_bonus
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_bonus_apos_mudar();

-- Gatilho fora do REST, como os demais.
REVOKE ALL ON FUNCTION public.fn_pix_bonus_carimbo()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_bonus_apos_mudar() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
