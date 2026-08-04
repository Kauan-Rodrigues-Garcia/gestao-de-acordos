-- ═══════════════════════════════════════════════════════════════════════════
-- Isolamento do RECEBIMENTO DIÁRIO por setor (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Em 23/07/2026 a migration 20260723b fechou `acordos` por setor: um líder do
-- Receptivo tinha acesso aos acordos do Play 4/5. A MESMA falha continuou em
-- `diario_recebimentos`, cuja policy de SELECT (20260729a) libera a empresa
-- inteira para qualquer cargo de líder para cima. Foi o que a operação relatou
-- em 04/08/2026: o pessoal do Play 4 lendo o recebimento do Receptivo.
--
-- A tela já foi corrigida no mesmo commit, mas filtro de tela não é isolamento:
-- sem esta policy as linhas continuam saindo do banco e chegando ao navegador,
-- ao alcance de quem souber chamar a API direto.
--
-- ## Como o setor de uma linha é decidido
--
-- `diario_recebimentos` não tem coluna de setor — diferente de
-- `analitico_recebimentos`, que tem o carimbo da importação. O setor da linha
-- é o do OPERADOR dela, pela mesma regra que a aplicação usa (setoresDoOperador
-- em analitico.service.ts):
--
--   • setor da EQUIPE do operador; sem equipe, o setor do perfil dele;
--   • MAIS os setores das equipes em que ele é clone com `conta_recebimento`
--     ligado — o operador emprestado ao Digital conta nos dois setores, e os
--     dois líderes precisam vê-lo.
--
-- Linha ÓRFÃ (operador_id NULL) não tem dono, logo não tem setor: fica visível
-- só para quem enxerga a empresa toda. Atribuí-la ao setor de quem consulta
-- seria inventar um dado.
--
-- ## Escopo desta migration
--
-- Só o SELECT, e só na BookPlay:
--
--   • PaguePlay tem um setor só — apertar lá não protegeria nada e arriscaria
--     zerar a tela de quem estiver com o perfil sem setor. As duas operações
--     dividem o mesmo banco, então o recorte por empresa é obrigatório.
--   • INSERT/UPDATE/DELETE ficam como estão DE PROPÓSITO: na BookPlay o mesmo
--     arquivo alimenta o analítico e o diário, e um relatório de setor costuma
--     trazer linhas órfãs. Apertar o INSERT por setor derrubaria a importação
--     inteira por causa delas. A tela já esconde "Limpar dia"/"Limpar tudo" de
--     quem enxerga um setor só; fechar essa porta no banco pede uma função de
--     limpeza por setor, que não existe ainda.
--
-- Pré-requisitos: 20260712a (equipe_operadores_clones), 20260723e
-- (conta_recebimento) e 20260723b (fn_user_setor_id, fn_user_empresa_is_bookplay).

-- ─── O operador conta neste setor? ───────────────────────────────────────────
-- Espelha `setoresDoOperador` do cliente. Existir nos dois lados é o preço de
-- ter a regra no banco; se um dia divergirem, a tela mostra menos que o banco
-- entrega — nunca o contrário, que é o lado seguro do erro.
CREATE OR REPLACE FUNCTION public.fn_operador_conta_no_setor(
  p_operador_id UUID,
  p_setor_id    UUID
)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_operador_id IS NOT NULL
     AND p_setor_id    IS NOT NULL
     AND (
       -- Setor da equipe; quem não tem equipe usa o setor do próprio perfil.
       EXISTS (
         SELECT 1
         FROM public.perfis p
         LEFT JOIN public.equipes e ON e.id = p.equipe_id
         WHERE p.id = p_operador_id
           AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
       )
       -- Clone: conta também no setor da equipe que o tomou emprestado.
       OR EXISTS (
         SELECT 1
         FROM public.equipe_operadores_clones c
         JOIN public.equipes e2 ON e2.id = c.equipe_id
         WHERE c.operador_id = p_operador_id
           AND e2.setor_id   = p_setor_id
           AND COALESCE(c.conta_recebimento, TRUE)
       )
     );
$$;

GRANT EXECUTE ON FUNCTION public.fn_operador_conta_no_setor(UUID, UUID) TO authenticated;

-- ─── SELECT escopado ─────────────────────────────────────────────────────────
-- Mantém a estrutura da 20260729a (subselects para o InitPlan do planejador) e
-- só aperta o ramo de líder/elite/gerência da BookPlay.
DROP POLICY IF EXISTS "diario_select" ON public.diario_recebimentos;
CREATE POLICY "diario_select" ON public.diario_recebimentos
  FOR SELECT USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      -- O operador continua vendo o próprio recebimento.
      (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
      OR (SELECT public.fn_user_is_super_admin())
      -- PaguePlay e demais: comportamento antigo, líder+ vê a empresa.
      OR (
        NOT (SELECT public.fn_user_empresa_is_bookplay())
        AND (SELECT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            ))
      )
      OR (
        (SELECT public.fn_user_empresa_is_bookplay())
        AND (
          -- Gestão segue vendo todos os setores.
          (SELECT public.fn_user_has_any_role(ARRAY['administrador','diretoria']))
          -- Líder/elite/gerência: só quem conta no setor deles.
          OR (
            (SELECT public.fn_user_has_any_role(ARRAY['lider','elite','gerencia']))
            AND public.fn_operador_conta_no_setor(
              operador_id, (SELECT public.fn_user_setor_id())
            )
          )
        )
      )
    )
  );

-- ─── Conferência ─────────────────────────────────────────────────────────────
-- Quantos operadores contam em cada setor da BookPlay. Serve para conferir que
-- ninguém ficou de fora por perfil sem equipe e sem setor — esses aparecem em
-- 'SEM SETOR' e não serão vistos por líder nenhum.
SELECT
  COALESCE(s.nome, 'SEM SETOR') AS setor,
  COUNT(*)                      AS operadores
FROM public.perfis p
JOIN public.empresas em ON em.id = p.empresa_id AND lower(em.slug) = 'bookplay'
LEFT JOIN public.equipes e ON e.id = p.equipe_id
LEFT JOIN public.setores s ON s.id = COALESCE(e.setor_id, p.setor_id)
WHERE p.ativo
GROUP BY 1
ORDER BY 1;
