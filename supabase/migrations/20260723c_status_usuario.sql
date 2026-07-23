-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 5 — Situação do usuário: ativo / férias / desligamento
-- ═══════════════════════════════════════════════════════════════════════════
-- Além da coluna `ativo` (bolinha verde / login), cada perfil ganha uma
-- SITUAÇÃO operacional:
--   • ativo      → normal.
--   • ferias     → some de rankings e quartis; recebimento CONTINUA contando
--                  (setor e equipe). Ainda pode logar.
--   • desligado  → some de rankings e quartis; recebimento do mês atual ainda
--                  conta; NÃO loga mais (bloqueio na app + ativo=false). Na
--                  virada do mês é arquivado (some das listas padrão).
--
-- `ativo` continua sendo o gate de login/uso; desligar zera ativo. Férias NÃO
-- mexe em ativo (a pessoa ainda acessa). A exclusão de ranking/quartil é feita
-- na aplicação (a lista de ocultos vem de situacao != 'ativo'); o recebimento
-- não é filtrado, então os totais de setor/equipe seguem inteiros.

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT 'ativo'
    CHECK (situacao IN ('ativo', 'ferias', 'desligado'));

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS desligado_em TIMESTAMPTZ;

-- Arquivado = desligado que já virou o mês. Sai das listas padrão de usuários.
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_perfis_situacao ON public.perfis(empresa_id, situacao);

-- ─── Arquivamento automático dos desligados de meses anteriores ──────────────
-- Sem pg_cron: a aplicação chama esta RPC ao abrir a aba Usuários. Desligado no
-- mês corrente continua visível; desligado de mês anterior vira arquivado.
CREATE OR REPLACE FUNCTION public.fn_arquivar_desligados_anteriores(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN 0;
  END IF;
  UPDATE public.perfis
     SET arquivado = TRUE
   WHERE empresa_id = p_empresa_id
     AND situacao = 'desligado'
     AND arquivado = FALSE
     AND desligado_em IS NOT NULL
     AND desligado_em < date_trunc('month', now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_arquivar_desligados_anteriores(UUID) TO authenticated;
