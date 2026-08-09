-- ═══════════════════════════════════════════════════════════════════════════
-- ANALÍTICO — o super_admin não é operador, e um login não vira dois
-- ═══════════════════════════════════════════════════════════════════════════
-- O relatório do BookPlay traz o LOGIN do operador (`operador_usuario`) e a
-- importação resolve esse login para um perfil. Duas coisas quebravam a conta:
--
-- 1. Linhas do login `kauan_teixeira` estavam presas ao perfil `kauan_rodrigues`
--    (super_admin), de quando esse era o perfil usado na operação. Resultado: o
--    mesmo recebimento aparecia repartido entre DOIS "Kauan" — um na equipe
--    Matheus (o super_admin) e outro na equipe Bryan (o operador de verdade) —
--    e nenhuma das duas linhas era o total da pessoa.
--
-- 2. `fn_analitico_resumo_por_operador` agrupa por `operador_usuario` além do
--    perfil. Duas grafias do mesmo login no arquivo (maiúscula/minúscula, um
--    espaço a mais) já bastam para o mesmo operador virar duas linhas no
--    resumo, cada uma com um pedaço do dinheiro.
--
-- Idempotente. Só mexe em vínculo (`operador_id`); nenhum valor é alterado.

-- ─── 1. Devolver as linhas ao perfil dono do login ───────────────────────────
-- Regra: se a linha está hoje num perfil super_admin e existe OUTRO perfil ativo
-- da mesma empresa cujo `usuario` é exatamente o `operador_usuario` da linha,
-- ela pertence a esse outro perfil. É o mesmo casamento (login → perfil,
-- ignorando caixa e espaços) que a importação já faz em `resolverOperadores`.
--
-- Sem o super_admin no meio nada é tocado: só linhas mal atribuídas se movem.
UPDATE public.analitico_recebimentos ar
   SET operador_id = dono.id
  FROM public.perfis atual, public.perfis dono
 WHERE ar.operador_id  = atual.id
   AND atual.perfil    = 'super_admin'
   AND dono.empresa_id = ar.empresa_id
   AND dono.id        <> atual.id
   AND dono.perfil    <> 'super_admin'
   AND dono.ativo
   AND lower(trim(dono.usuario)) = lower(trim(ar.operador_usuario));

-- ─── 2. O resumo por operador ────────────────────────────────────────────────
-- Duas correções sobre 20260703b:
--   • super_admin fora: é conta de administração do sistema, não operador de
--     recebimento. Enquanto entrava, aparecia no ranking e na soma da equipe/
--     setor a que o perfil estivesse vinculado;
--   • agrupamento pelo PERFIL, não pela grafia do login. O login volta como
--     `MIN(...)` só para exibição — duas grafias do mesmo operador viram uma
--     linha só, com o total inteiro.
CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,
  p_mes        TEXT   -- formato 'yyyy-MM'
)
RETURNS TABLE (
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  total_recebido   NUMERIC,
  total_ho         NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_lider     BOOLEAN;
  v_equipe_id    UUID;
BEGIN
  -- Qualquer usuário da empresa (incluindo operador) pode consultar
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['operador','lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  -- Líder+ vê tudo; operador é restringido à própria equipe (server-side)
  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  IF NOT v_is_lider THEN
    SELECT equipe_id INTO v_equipe_id
    FROM public.perfis
    WHERE id = auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    ar.operador_id,
    MIN(ar.operador_usuario)        AS operador_usuario,
    p.nome                          AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id  = p_empresa_id
    AND ar.operador_id IS NOT NULL
    -- super_admin não é operador: não entra no resumo nem nas somas que saem daqui
    AND COALESCE(p.perfil, '') <> 'super_admin'
    AND ar.data_pagamento >= (p_mes || '-01')::DATE
    AND ar.data_pagamento <= (
          DATE_TRUNC('month', (p_mes || '-01')::DATE)
          + INTERVAL '1 month'
          - INTERVAL '1 day'
        )::DATE
    AND (
      -- Líder+ vê todos os operadores da empresa
      v_is_lider
      -- Operador com equipe: só a própria equipe
      OR (v_equipe_id IS NOT NULL AND p.equipe_id = v_equipe_id)
      -- Operador sem equipe: apenas a própria linha
      OR (v_equipe_id IS NULL AND ar.operador_id = auth.uid())
    )
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) IS
  'Resumo de recebimento por operador no mês. Agrupa por PERFIL (não pela grafia do login) e ignora super_admin, que é conta de administração e não operador.';
