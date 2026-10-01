-- ============================================================================
-- Mês fechado: metas, comissão, Pix e ajuste manual passam a ser só leitura
-- ============================================================================
--
-- ## O buraco (achado na virada de 01/10/2026)
--
-- O cadeado do mês fechado (`lib/fechamentoMes.ts`) cobre acordos e lixeira.
-- O resto do que forma o número de um mês continuava gravável depois da
-- virada:
--
--   metas / metas_config_mes        só travavam com o setor VALIDADO
--   comissao_*                      idem
--   pix_automatico_acordos          registro com data do mês passado, troca de
--                                   valor, NR ou dono
--   analitico_ajustes_manuais       lançar, editar ou cancelar ajuste do mês
--
-- A regra (Cleber, 01/10/2026): «nada muda no mês passado — só o relatório com
-- pagamento daquele mês». Importação continua aberta; ela não passa por aqui.
--
-- ## Quem passa
--
-- A mesma exceção do cadeado de acordos: `super_admin` e quem tem a permissão
-- `ignorar_fechamento_mes` (que nasce desligada para todo mundo). E o próprio
-- banco — sem sessão (cron, service role) a trava não se aplica, porque não há
-- pessoa a quem dizer não.
--
-- ## O que continua aberto, de propósito
--
--   * comissao_config: CONFIRMAR a meta do setor (`setor_meta_confirmada_*`).
--     O setor bate a meta no fim do mês, e a confirmação acontece depois da
--     virada — é o desenho de `fn_comissao_confirmar_meta_setor`.
--   * metas_validacoes: validar e reabrir. Reabrir não destrava a escrita de
--     um mês fechado; esta trava vale com o setor aberto ou validado.
--   * pix_automatico_acordos: AVALIAR (aprovar/desaprovar), PAGAR, aplicar a
--     correção de saldo e autorizar duplicidade. É a fila do mês passado sendo
--     resolvida, não o mês sendo reescrito. Excluir só o DESAPROVADO (é o
--     expurgo de 2 dias úteis, e o dono pode excluir o seu).
--
-- Só funções e gatilhos. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── A barreira, num lugar só ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mes_fechado_barrar(p_mes text, p_oque text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_mes_fechado(p_mes) THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF public.fn_user_is_super_admin() OR public.fn_user_tem('ignorar_fechamento_mes') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION
    'MES_FECHADO: % de %/% — o mês está fechado, somente leitura. Só super admin ou quem tem a permissão «Ignorar fechamento do mês» altera mês fechado.',
    p_oque, substr(p_mes, 6, 2), substr(p_mes, 1, 4)
    USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.fn_mes_fechado_barrar(text, text) IS
  'Levanta MES_FECHADO quando p_mes ja fechou e quem grava nao e super_admin nem tem '
  'ignorar_fechamento_mes. Sem sessao (cron/service) passa (20261001130000).';

REVOKE ALL ON FUNCTION public.fn_mes_fechado_barrar(text, text) FROM PUBLIC, anon, authenticated;

-- 'YYYY-MM' a partir de ano e mês inteiros.
CREATE OR REPLACE FUNCTION public.fn_mes_texto(p_ano integer, p_mes integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE WHEN p_ano IS NULL OR p_mes IS NULL THEN NULL
              ELSE lpad(p_ano::text, 4, '0') || '-' || lpad(p_mes::text, 2, '0') END;
$function$;

-- ── Tabelas com (ano, mes): metas, metas_config_mes, comissão ──────────────
--
-- TG_ARGV[0]: o que é, para a frase. TG_ARGV[1] (opcional): colunas que podem
-- mudar num UPDATE de mês fechado sem passar pela trava.
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_ano_mes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_oque   TEXT := COALESCE(TG_ARGV[0], 'Este registro');
  v_livres TEXT[] := CASE WHEN TG_NARGS > 1 THEN string_to_array(TG_ARGV[1], ',') ELSE '{}' END;
  v_novo   JSONB;
  v_velho  JSONB;
BEGIN
  IF TG_OP = 'UPDATE' AND cardinality(v_livres) > 0 THEN
    v_novo  := to_jsonb(NEW) - v_livres;
    v_velho := to_jsonb(OLD) - v_livres;
    IF v_novo = v_velho THEN RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fn_mes_fechado_barrar(public.fn_mes_texto(OLD.ano, OLD.mes), v_oque);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fn_mes_fechado_barrar(public.fn_mes_texto(NEW.ano, NEW.mes), v_oque);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$function$;

DO $gatilhos$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('metas',                    'Meta',                       NULL),
      ('metas_config_mes',         'Configuração de metas',      NULL),
      ('comissao_config',          'Configuração de comissão',
         'setor_meta_confirmada_em,setor_meta_confirmada_por,setor_meta_confirmada_por_nome,atualizado_em,atualizado_por'),
      ('comissao_config_usuarios', 'Exceção de comissão',        NULL),
      ('comissao_bonus',           'Bônus de comissão',          NULL)
    ) AS t(tabela, oque, livres)
  LOOP
    -- Tabela ausente (migration pendente neste ambiente): pula, não aborta.
    CONTINUE WHEN to_regclass('public.' || r.tabela) IS NULL;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.%I', r.tabela);
    EXECUTE format(
      'CREATE TRIGGER trg_trava_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_ano_mes(%L%s)',
      r.tabela, r.oque, CASE WHEN r.livres IS NULL THEN '' ELSE format(', %L', r.livres) END
    );
  END LOOP;
END
$gatilhos$;

-- ── Filhas da comissão: o mês vem da linha-mãe ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_comissao_filha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_maes UUID[] := '{}';
  v_mae  UUID;
  v_mes  TEXT;
BEGIN
  -- A linha-mãe de antes e a de depois (UPDATE pode trocar de mãe).
  IF TG_TABLE_NAME = 'comissao_faixas' THEN
    IF TG_OP <> 'INSERT' THEN v_maes := v_maes || OLD.config_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_maes := v_maes || NEW.config_id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_maes := v_maes || OLD.bonus_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_maes := v_maes || NEW.bonus_id; END IF;
  END IF;

  FOREACH v_mae IN ARRAY v_maes LOOP
    IF TG_TABLE_NAME = 'comissao_faixas' THEN
      SELECT public.fn_mes_texto(c.ano, c.mes) INTO v_mes
        FROM public.comissao_config c WHERE c.id = v_mae;
      PERFORM public.fn_mes_fechado_barrar(v_mes, 'Faixa de comissão');
    ELSE
      SELECT public.fn_mes_texto(b.ano, b.mes) INTO v_mes
        FROM public.comissao_bonus b WHERE b.id = v_mae;
      PERFORM public.fn_mes_fechado_barrar(v_mes, 'Bônus de comissão');
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DO $filhas$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['comissao_faixas', 'comissao_bonus_usuarios'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_trava_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_comissao_filha()', t);
  END LOOP;
END
$filhas$;

-- ── Pix Automático: o mês é o de `criado_em` em São Paulo ──────────────────
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_pix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- O que muda o NÚMERO do mês. Avaliar, pagar, corrigir saldo e autorizar
  -- duplicidade ficam livres (ver cabeçalho).
  c_numero CONSTANT TEXT[] := ARRAY['operador_id', 'setor_id', 'nr_cliente', 'valor', 'criado_em', 'extra', 'empresa_id'];
  v_k      TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_mes_fechado_barrar(
      to_char(NEW.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Registro de Pix');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'desaprovado' THEN
      PERFORM public.fn_mes_fechado_barrar(
        to_char(OLD.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Excluir registro de Pix');
    END IF;
    RETURN OLD;
  END IF;

  FOREACH v_k IN ARRAY c_numero LOOP
    IF (to_jsonb(NEW) -> v_k) IS DISTINCT FROM (to_jsonb(OLD) -> v_k) THEN
      PERFORM public.fn_mes_fechado_barrar(
        to_char(OLD.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Registro de Pix');
      PERFORM public.fn_mes_fechado_barrar(
        to_char(NEW.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Registro de Pix');
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.pix_automatico_acordos;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_pix();

-- ── Ajuste manual de recebimento: o mês é `mes_referencia` ─────────────────
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_ajuste()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_char(OLD.mes_referencia, 'YYYY-MM'), 'Ajuste de recebimento');
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_char(NEW.mes_referencia, 'YYYY-MM'), 'Ajuste de recebimento');
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$function$;

DO $ajuste$
BEGIN
  IF to_regclass('public.analitico_ajustes_manuais') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.analitico_ajustes_manuais;
    CREATE TRIGGER trg_trava_mes_fechado
      BEFORE INSERT OR UPDATE OR DELETE ON public.analitico_ajustes_manuais
      FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_ajuste();
  END IF;
END
$ajuste$;

COMMIT;

-- ── Conferência. SOMENTE LEITURA, rode depois ───────────────────────────────
-- Espere uma linha por tabela que existe neste banco (até 9).
SELECT c.relname AS tabela
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE t.tgname = 'trg_trava_mes_fechado'
 ORDER BY 1;
