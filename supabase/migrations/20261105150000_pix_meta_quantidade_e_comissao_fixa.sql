-- ============================================================================
-- 20261105150000_pix_meta_quantidade_e_comissao_fixa.sql
--
-- Pix automático com a regra do Jornada (pedido de 05/11/2026). Duas opções
-- por SETOR, na configuração do Pix:
--
--   meta_modo       'valor'      a meta do Pix é medida em R$ (como sempre foi)
--                   'quantidade' a meta é medida em quantidade de acordos Pix
--
--   comissao_modo   'percentual' comissão = valor do Pix × % do setor (como era)
--                   'fixo'       comissão = um valor fixo em R$ por Pix aprovado
--                                (comissao_valor_fixo)
--
-- ## O valor fixo fica travado na aprovação
--
-- Do mesmo jeito que `pct_comissao` trava o % na aprovação, `comissao_fixa`
-- trava o valor fixo no acordo aprovado: mudar o valor do setor depois não
-- mexe no que já foi aprovado. A tela grava os dois juntos.
--
-- ## Segurança da coluna nova
--
-- O operador não pode carimbar a própria comissão. O gatilho que já protege
-- `pct_comissao` (fn_pix_congela_campos_do_operador) NÃO é reescrito: um
-- gatilho NOVO, só desta coluna, faz o mesmo. E a restauração da lixeira, que
-- insere a linha sem conhecer a coluna, recebe o valor de volta do retrato
-- guardado na própria lixeira.
--
-- Nada muda para os setores que não tocarem nas opções: o padrão é 'valor' e
-- 'percentual', exatamente o comportamento de hoje. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. As opções do setor ──────────────────────────────────────────────────

ALTER TABLE public.pix_automatico_config
  ADD COLUMN IF NOT EXISTS meta_modo           TEXT NOT NULL DEFAULT 'valor',
  ADD COLUMN IF NOT EXISTS comissao_modo       TEXT NOT NULL DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS comissao_valor_fixo NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_automatico_config_meta_modo') THEN
    ALTER TABLE public.pix_automatico_config
      ADD CONSTRAINT pix_automatico_config_meta_modo CHECK (meta_modo IN ('valor', 'quantidade'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_automatico_config_comissao_modo') THEN
    ALTER TABLE public.pix_automatico_config
      ADD CONSTRAINT pix_automatico_config_comissao_modo CHECK (comissao_modo IN ('percentual', 'fixo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_automatico_config_valor_fixo') THEN
    ALTER TABLE public.pix_automatico_config
      ADD CONSTRAINT pix_automatico_config_valor_fixo CHECK (
        comissao_valor_fixo IS NULL OR comissao_valor_fixo BETWEEN 0 AND 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_automatico_config_fixo_tem_valor') THEN
    ALTER TABLE public.pix_automatico_config
      ADD CONSTRAINT pix_automatico_config_fixo_tem_valor CHECK (
        comissao_modo = 'percentual' OR comissao_valor_fixo IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.pix_automatico_config.meta_modo IS
  'Como a meta do Pix do setor e medida: valor (R$) ou quantidade de acordos. 20261105150000.';
COMMENT ON COLUMN public.pix_automatico_config.comissao_modo IS
  'Comissao do Pix do setor: percentual do valor ou valor fixo por Pix. 20261105150000.';
COMMENT ON COLUMN public.pix_automatico_config.comissao_valor_fixo IS
  'R$ por Pix aprovado quando comissao_modo = fixo. 20261105150000.';

-- ── 2. O valor fixo travado no acordo ──────────────────────────────────────

ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS comissao_fixa NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_automatico_acordos_comissao_fixa') THEN
    ALTER TABLE public.pix_automatico_acordos
      ADD CONSTRAINT pix_automatico_acordos_comissao_fixa CHECK (
        comissao_fixa IS NULL OR comissao_fixa BETWEEN 0 AND 100000);
  END IF;
END $$;

COMMENT ON COLUMN public.pix_automatico_acordos.comissao_fixa IS
  'Comissao FIXA (R$) travada na aprovacao, quando o setor paga valor fixo por '
  'Pix. NULL = comissao percentual (pct_comissao). 20261105150000.';

-- ── 3. Quem pode gravar a coluna ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_comissao_fixa_guarda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Restauração da lixeira: a função de restaurar não conhece a coluna; o
  -- valor volta do retrato que a lixeira guardou.
  IF TG_OP = 'INSERT' AND COALESCE(current_setting('pix.restaurando', true), '') = 'on' THEN
    IF NEW.comissao_fixa IS NULL THEN
      SELECT NULLIF(l.dados_completos->>'comissao_fixa', '')::NUMERIC
        INTO NEW.comissao_fixa
        FROM public.lixeira_pix_automatico l
       WHERE l.acordo_id = NEW.id
       LIMIT 1;
    END IF;
    RETURN NEW;
  END IF;

  IF public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RETURN NEW;
  END IF;

  -- O operador não carimba comissão: no INSERT nasce vazia, no UPDATE fica.
  IF TG_OP = 'INSERT' THEN
    NEW.comissao_fixa := NULL;
  ELSE
    NEW.comissao_fixa := OLD.comissao_fixa;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_comissao_fixa_guarda ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_comissao_fixa_guarda
  BEFORE INSERT OR UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_comissao_fixa_guarda();

REVOKE ALL ON FUNCTION public.fn_pix_comissao_fixa_guarda() FROM PUBLIC, anon, authenticated;

COMMIT;
