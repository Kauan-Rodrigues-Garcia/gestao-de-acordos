-- ============================================================================
-- O líder clonado de outro setor volta a aparecer para quem enxerga só o setor
--
-- Sintoma: na BookPlay, a equipe "Digital Bruno" (setor play 4) tem como líder
-- o Bruno Picolo, cujo perfil é do setor Marília Digital. O super admin vê o
-- chip do Bruno na caixa "Líderes da equipe"; a Isabela, líder do play 4, não
-- vê nada — a caixa aparece vazia, sem erro e sem aviso.
--
-- Causa: `fn_setores_do_operador(uuid)` responde "em que setores esta pessoa
-- aparece" e é o que `perfis_select` usa no escopo 2 (somente o setor). Ela
-- conhece DUAS origens: o setor do próprio perfil e as equipes em que a pessoa
-- foi clonada como OPERADOR (`equipe_operadores_clones`). O clone de LÍDER vive
-- em outra tabela — `equipe_lideres` (migration 20260725b) — e nunca foi
-- ensinado a ela. Resultado: para o banco, o Bruno só existe em Marília
-- Digital, e a linha de perfil dele não é devolvida a ninguém do play 4.
--
-- Correção: acrescentar o terceiro UNION. Liderar uma equipe de um setor passa
-- a colocar a pessoa naquele setor, exatamente como já acontece quando ela é
-- clonada como operador. Não é uma exceção nova: é a mesma regra de clone
-- aplicada à tabela que ficou de fora.
--
-- Alcance: a função é usada por `perfis_select`, pelo escopo das autorizações,
-- pelo chat e pelo card por operador. Em todos eles o efeito é o mesmo e é o
-- pretendido — quem lidera uma equipe do play 4 conta como gente do play 4.
-- Nenhuma permissão é concedida por aqui: quem não tem a aba, continua sem ela;
-- quem está no escopo 2 continua preso ao próprio setor. O que muda é só QUEM
-- pertence ao setor.
--
-- Não altera dados: só a definição da função.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_setores_do_operador(p_operador uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.setor_id
    FROM public.perfis p
   WHERE p.id = p_operador AND p.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador AND e.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_lideres l
    JOIN public.equipes e ON e.id = l.equipe_id
   WHERE l.lider_id = p_operador AND e.setor_id IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.fn_setores_do_operador(uuid) IS
  'Setores em que a pessoa aparece: o do perfil, os das equipes em que foi clonada como operador (equipe_operadores_clones) e os das equipes que lidera (equipe_lideres).';

-- O índice evita varredura em equipe_lideres a cada avaliação da policy.
CREATE INDEX IF NOT EXISTS equipe_lideres_lider_id_idx
  ON public.equipe_lideres (lider_id);

COMMIT;
