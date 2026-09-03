-- ═══════════════════════════════════════════════════════════════════════════
-- Clonar operador de outro setor volta a enxergar os outros setores
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sintoma: o líder do setor alternativo abre Equipes → clonar, escolhe o setor
-- de onde quer puxar o operador, e a lista vem VAZIA. Só administrador e super
-- admin conseguiam usar o seletor.
--
-- ## Como isto foi criado
--
-- Ontem (`20260903310000`) a policy de `perfis` deixou de ser chaveada em
-- `fn_user_escopo('usuarios')` e passou a ser um TETO: o MAIOR escopo que a
-- pessoa tem entre as abas de `fn_abas_escopo()`. Foi a correção certa para o
-- problema certo — a aba Usuários governava toda tela que lia gente.
--
-- Só que o catálogo de clones em `AdminEquipes.tsx` lia `perfis` direto, com um
-- comentário dizendo «a RLS já permite — quem restringia ao setor era só o
-- filtro do front». Isso era verdade ANTES daquela migration e deixou de ser
-- depois dela, sem que nada acusasse: a consulta continua respondendo 200, só
-- que com o setor da pessoa em vez da empresa.
--
-- Medido, na BookPlay:
--
--   cargo          teto em perfis   equipes_gerenciar_composicao
--   administrador  3 (empresa)      sim
--   super_admin    3 (empresa)      sim
--   gerencia       2 (setor)        sim   ← quebrado
--   lider          2 (setor)        sim   ← quebrado
--
-- Dois cargos com permissão de clonar e sem alcance para clonar.
--
-- ## Por que uma função, e não mexer no teto
--
-- Subir o teto resolveria o sintoma criando o problema de ontem de novo: toda
-- tela que lê `perfis` e esquecer de aplicar o próprio recorte passaria a
-- mostrar a empresa inteira. O teto é o piso de segurança, não o lugar de
-- resolver a necessidade de UMA tela.
--
-- A necessidade desta tela já tem nome no catálogo de permissões, e a descrição
-- da chave é literalmente o que falta:
--
--   equipes_gerenciar_composicao
--   «Definir líderes da equipe e clonar operadores de outros setores»
--
-- Então a leitura é autorizada por ela — a MESMA condição que a policy de
-- escrita `clones_write_gestao` já exige em `equipe_operadores_clones`. Quem
-- pode gravar o clone passa a poder ler quem clonar; nem um a mais.
--
-- É o desenho de sempre por aqui: quando uma tela precisa de mais do que o
-- teto, ela ganha uma função `SECURITY DEFINER` com a própria pergunta de
-- autorização — não um teto mais alto para todo mundo.
--
-- `setores` e `equipes` não entram: as duas já são legíveis pela empresa
-- inteira (`fn_can_access_empresa`), e é por isso que no defeito o seletor de
-- setor aparecia certinho e só a lista de gente vinha vazia.

CREATE OR REPLACE FUNCTION public.fn_equipes_operadores_para_clone(p_empresa UUID)
RETURNS TABLE (
  id        UUID,
  nome      TEXT,
  setor_id  UUID,
  equipe_id UUID,
  perfil    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa) THEN
    RAISE EXCEPTION 'EQUIPES_CLONE_EMPRESA: esta empresa não está no seu acesso.'
      USING ERRCODE = '42501';
  END IF;

  -- A mesma pergunta da policy de escrita de `equipe_operadores_clones`. Se as
  -- duas divergirem, a tela oferece gente que o banco depois recusa clonar.
  IF NOT public.fn_user_tem('equipes_gerenciar_composicao') THEN
    RAISE EXCEPTION 'EQUIPES_CLONE_SEM_PERMISSAO: seu cargo não pode gerenciar a composição das equipes.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome, p.setor_id, p.equipe_id, p.perfil::TEXT
    FROM public.perfis p
   WHERE p.empresa_id = p_empresa
     AND p.ativo
     -- Os mesmos cargos que a tela já pedia. Cúpula não é clonável: clone é
     -- empréstimo de mão de obra de operação para operação.
     AND p.perfil IN ('operador', 'lider', 'elite')
   ORDER BY p.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_equipes_operadores_para_clone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_equipes_operadores_para_clone(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_equipes_operadores_para_clone(UUID) IS
  'Operadores da empresa inteira para o seletor de clone em Equipes. Passa por '
  'cima do teto de perfis de proposito: a autorizacao aqui e '
  'equipes_gerenciar_composicao, a mesma da policy de escrita de '
  'equipe_operadores_clones. Nao use para desenhar lista de gente em outra '
  'tela — cada tela pergunta pelo proprio escopo.';

-- ── Conferência ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.fn_equipes_operadores_para_clone(uuid)') IS NULL THEN
    RAISE EXCEPTION 'a funcao nao foi criada';
  END IF;
END $$;
