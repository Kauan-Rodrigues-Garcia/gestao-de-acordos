-- ============================================================================
-- Equipe excluída continua no mês fechado
-- ============================================================================
--
-- Fase 2 da auditoria de fechamento (29/10/2026). Decisão do Cleber, no mesmo
-- dia: excluir equipe continua sendo excluir (não vira «arquivar»), mas «se eu
-- deletar uma equipe que existia no mês anterior, ela não some do mês que está
-- fechado».
--
-- ## O que a fase 1 tinha feito
--
-- `trg_equipes_preserva_mes_fechado` RECUSAVA a exclusão de equipe com
-- comissão ou meta de Pix em mês fechado. Protegia o histórico, mas impedia a
-- exclusão. Sai.
--
-- ## Por que a exclusão apagava (ou soltava) o mês fechado
--
-- As FKs para `equipes` (conferidas em pg_constraint, 29/10):
--
--   CASCADE   comissao_config, pix_automatico_metas      a linha do mês some
--             equipe_subgrupos → comissao_config.subgrupo_id   idem, por tabela
--   SET NULL  analitico_ajustes_manuais, vendas, indicacoes,
--             perfis_transferencias.origem_equipe_id, comemoracoes
--                                                      a linha fica sem equipe
--
-- E o SET NULL num ajuste de mês fechado é um UPDATE, que a trava recusa para
-- quem não é super admin — a exclusão falhava com um erro sobre ajuste.
--
-- ## A correção
--
-- Essas colunas passam a ser como `metas.referencia_id` e o retrato
-- (`composicao_mes*`): guardam o id sem FK. A linha do mês fechado continua
-- apontando para a equipe, e o nome dela vem do retrato do mês
-- (`composicao_mes_equipe`), que nunca teve FK.
--
-- O que a CASCADE fazia de certo — limpar a configuração do mês EM ABERTO —
-- passa para um gatilho: excluir equipe (ou subgrupo) apaga a comissão e a meta
-- de Pix dela do mês corrente em diante. Mês fechado fica.
--
-- Ficam com FK, de propósito, as tabelas que são estrutura de HOJE e não
-- história: equipe_lideres, equipe_operadores_clones, equipe_membros,
-- equipe_subgrupos, tv_paineis (o mês está em tv_paineis_mes), perfis,
-- mestre_equipes (o vínculo do mês está em composicao_mes_config) e
-- solicitacoes_whatsapp.
--
-- Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Sai a recusa da fase 1 ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_equipes_preserva_mes_fechado ON public.equipes;
DROP FUNCTION IF EXISTS public.fn_equipes_preserva_mes_fechado();
DROP FUNCTION IF EXISTS public.fn_equipe_historico_fechado(uuid);

-- ── 2. As FKs das tabelas de história ───────────────────────────────────────
-- Pelo catálogo, e não pelo nome: o nome de uma FK criada pelo SQL Editor não
-- é garantido.
DO $fks$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabela, c.conname
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND (
         (c.confrelid = 'public.equipes'::regclass
          AND c.conrelid IN ('public.comissao_config'::regclass,
                             'public.pix_automatico_metas'::regclass,
                             'public.analitico_ajustes_manuais'::regclass,
                             'public.vendas'::regclass,
                             'public.indicacoes'::regclass,
                             'public.perfis_transferencias'::regclass,
                             'public.comemoracoes'::regclass))
         OR
         (c.confrelid = 'public.equipe_subgrupos'::regclass
          AND c.conrelid = 'public.comissao_config'::regclass)
       )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
    RAISE NOTICE 'FK removida: %.%', r.tabela, r.conname;
  END LOOP;
END
$fks$;

COMMENT ON COLUMN public.comissao_config.equipe_id IS
  'Equipe da excecao. Sem FK desde 20261029221000: excluir a equipe nao apaga '
  'a comissao de mes fechado. O nome do mes vem de composicao_mes_equipe.';
COMMENT ON COLUMN public.pix_automatico_metas.equipe_id IS
  'Sem FK desde 20261029221000: excluir a equipe nao apaga a meta de mes fechado.';
COMMENT ON COLUMN public.analitico_ajustes_manuais.equipe_id IS
  'Sem FK desde 20261029221000: excluir a equipe nao solta o ajuste de mes fechado.';

-- ── 3. O mês em aberto continua sendo limpo ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_equipe_excluida_limpa_mes_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_corrente TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
BEGIN
  IF TG_TABLE_NAME = 'equipes' THEN
    DELETE FROM public.comissao_config
     WHERE equipe_id = OLD.id AND public.fn_mes_texto(ano, mes) >= v_corrente;
    DELETE FROM public.pix_automatico_metas
     WHERE equipe_id = OLD.id AND public.fn_mes_texto(ano, mes) >= v_corrente;
  ELSE
    DELETE FROM public.comissao_config
     WHERE subgrupo_id = OLD.id AND public.fn_mes_texto(ano, mes) >= v_corrente;
  END IF;
  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.fn_equipe_excluida_limpa_mes_aberto() IS
  'Excluir equipe/subgrupo apaga a comissao e a meta de Pix dele do mes '
  'corrente em diante. Mes fechado fica (20261029221000).';

REVOKE ALL ON FUNCTION public.fn_equipe_excluida_limpa_mes_aberto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipe_excluida_limpa_mes_aberto ON public.equipes;
CREATE TRIGGER trg_equipe_excluida_limpa_mes_aberto
  BEFORE DELETE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_excluida_limpa_mes_aberto();

DROP TRIGGER IF EXISTS trg_equipe_excluida_limpa_mes_aberto ON public.equipe_subgrupos;
CREATE TRIGGER trg_equipe_excluida_limpa_mes_aberto
  BEFORE DELETE ON public.equipe_subgrupos
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_excluida_limpa_mes_aberto();

-- Verificação: nenhuma tabela de história ainda desce em CASCADE ou SET NULL
-- a partir de equipes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid IN ('public.equipes'::regclass, 'public.equipe_subgrupos'::regclass)
       AND c.conrelid IN ('public.comissao_config'::regclass,
                          'public.pix_automatico_metas'::regclass,
                          'public.analitico_ajustes_manuais'::regclass,
                          'public.vendas'::regclass,
                          'public.indicacoes'::regclass,
                          'public.perfis_transferencias'::regclass,
                          'public.comemoracoes'::regclass)
  ) THEN
    RAISE EXCEPTION 'ainda ha FK de historia apontando para equipes';
  END IF;
END
$$;

COMMIT;
