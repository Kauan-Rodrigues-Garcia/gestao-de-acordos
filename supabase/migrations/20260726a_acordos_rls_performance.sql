-- ═══════════════════════════════════════════════════════════════════════════
-- PERFORMANCE — statement timeout na listagem de acordos
-- ═══════════════════════════════════════════════════════════════════════════
-- Sintoma (log do Postgres): "canceling statement due to statement timeout"
-- (57014) numa SELECT em acordos_deduplicados, contexto fn_user_is_super_admin
-- / fn_can_access_empresa. Dashboard e Acordos lentos.
--
-- Causa: a policy de SELECT roda com security_invoker (migration 20260723d) e
-- chama varias funcoes SECURITY DEFINER POR LINHA — fn_can_access_empresa e
-- fn_pode_gerir_acordo, que por sua vez chamam fn_user_is_super_admin,
-- fn_user_empresa_id, fn_user_has_any_role, fn_user_setor_id,
-- fn_user_empresa_is_pagueplay. Cada uma faz um SELECT em perfis. Sobre a view
-- acordos_deduplicados (DISTINCT ON da tabela) MAIS o count exato do PostgREST
-- (materializa o conjunto inteiro), isso multiplica os SELECTs por dezenas de
-- milhares de linhas e estoura o statement_timeout conforme a base cresce.
--
-- Correcao (NAO muda a semantica de acesso — mesmo booleano de 20260723f):
--   1. Inline do predicado de SELECT com as chamadas de SESSAO (que so dependem
--      de auth.uid(), logo tem o MESMO valor em toda linha) embrulhadas em
--      (SELECT ...). O planner promove cada uma a InitPlan e as avalia UMA vez
--      por query, nao por linha. Só fn_operador_setor_id(operador_id), que
--      depende da coluna, continua por-linha — e apenas no ramo legado
--      setor_id IS NULL.
--   2. Indice de expressao casando com o ORDER BY da view (DISTINCT ON via
--      index-scan em vez de sort da tabela inteira).
--   3. Indice (empresa_id, vencimento) para o filtro + ordenacao da listagem.
--
-- Idempotente. Afeta os dois tenants (RLS compartilhada); semantica preservada.

-- ─── Indices ─────────────────────────────────────────────────────────────────
-- Casa com: ORDER BY COALESCE(acordo_grupo_id::text, id::text),
--                    numero_parcela DESC NULLS LAST, criado_em DESC
-- (view_acordos_deduplicados_2026_04_17.sql).
CREATE INDEX IF NOT EXISTS idx_acordos_dedup_grupo
  ON public.acordos ((COALESCE(acordo_grupo_id::text, id::text)),
                     numero_parcela DESC NULLS LAST, criado_em DESC);

-- Listagem: WHERE empresa_id = $ ORDER BY vencimento.
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_vencimento
  ON public.acordos (empresa_id, vencimento);

-- ─── SELECT inlined com chamadas de sessao em (SELECT ...) (InitPlan) ─────────
-- Equivalente logico EXATO de:
--   fn_can_access_empresa(empresa_id) AND fn_pode_gerir_acordo(setor_id, operador_id)
-- (20260723f), so que avaliado uma vez por query em vez de por linha.
DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos
  FOR SELECT USING (
    -- fn_can_access_empresa(empresa_id)
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    -- fn_pode_gerir_acordo(setor_id, operador_id)
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_is_super_admin())
      OR (SELECT public.fn_user_has_any_role(ARRAY['administrador']))
      OR (
        (SELECT public.fn_user_empresa_is_pagueplay())
        AND (SELECT public.fn_user_has_any_role(ARRAY['lider']))
      )
      OR (
        NOT (SELECT public.fn_user_empresa_is_pagueplay())
        AND (
          (SELECT public.fn_user_has_any_role(ARRAY['diretoria']))
          OR (
            (SELECT public.fn_user_has_any_role(ARRAY['lider','elite','gerencia']))
            AND (
              setor_id = (SELECT public.fn_user_setor_id())
              OR (
                setor_id IS NULL
                AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id())
              )
            )
          )
        )
      )
    )
  );

-- INSERT/UPDATE/DELETE nao mudam: sao operacoes de 1 linha (sem custo de escala)
-- e continuam usando fn_pode_gerir_acordo (20260723f), preservando a semantica.
