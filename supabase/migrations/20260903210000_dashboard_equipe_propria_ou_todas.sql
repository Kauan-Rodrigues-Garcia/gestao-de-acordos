-- ============================================================================
-- Dashboard: "só a minha equipe" vira uma chave de verdade
-- ============================================================================
--
-- ## O pedido
--
--   «Em permissões no dashboard, tanto BookPlay quanto PaguePlay, tem a opção
--    de eu ver os dados de equipes ou não, porém não tem a opção de se eu posso
--    ver todas as equipes ou só a minha. Crie a opção de eu conseguir colocar,
--    para os cargos, se tem acesso aos dados do dashboard só da equipe dele ou
--    de todas.»
--
-- `dashboard_escopo_equipe` responde «esta pessoa enxerga equipe?». Não
-- respondia QUAL equipe: ligada, o filtro do Dashboard listava todas as equipes
-- do setor em foco. Para a liderança isso é o certo; para o operador é demais —
-- ele precisa acompanhar a equipe DELE.
--
-- ## A chave nova
--
--   dashboard_escopo_equipe_todas
--     ligada   → o alcance de equipe cobre TODAS as equipes do setor
--     desligada→ cobre só as equipes de que a pessoa participa
--
-- Ela não é um quinto nível: é um qualificador do nível `equipe`, e por isso
-- fica no grupo Dashboard, ao lado dos alcances, e não dentro de
-- `ABAS_COM_ESCOPO` (que descreve a escada individual → equipe → setor →
-- todos). Meter um `_escopo_` a mais no nome faria `fn_user_escopo()` tentar
-- lê-la como nível e devolver um peso que não existe.
--
-- Não tem efeito sobre quem já alcança o SETOR: setor contém todas as equipes
-- por definição. Ela só decide alguma coisa quando `equipe` é o teto da pessoa.
--
-- ## Ninguém perde acesso nesta migration
--
-- Hoje todo cargo com `dashboard_escopo_equipe` vê todas as equipes. A chave
-- nova nasceria `false` — «ausente vale negado» — e isso ESTREITARIA em
-- silêncio o filtro da liderança inteira. Por isso o backfill liga a chave para
-- todo cargo que já tem `dashboard_escopo_equipe`, em todas as empresas: o
-- estado de hoje, escrito por extenso. Desligar para o operador passa a ser uma
-- decisão no painel, que é o que foi pedido.
--
-- ## O nível `equipe` também passa a valer no RLS de acordos
--
-- `acordos_select` tinha ramo para `>= 3` e `>= 2` e NENHUM para `1`. Ou seja:
-- ligar só `equipe` num cargo ampliava a tela e não ampliava o banco — a pessoa
-- escolheria a equipe no filtro e receberia apenas os próprios acordos. É o
-- mesmo defeito da queixa «eu libero e não acontece nada», e sem tapá-lo a
-- chave desta migration nasceria decorativa: desligar `setor` para o operador o
-- deixaria sem nada em vez de o deixar com a equipe.
--
-- O ramo novo usa `= 1`, e não `>= 1`, de propósito: quem tem 2 ou 3 já foi
-- atendido pelos ramos acima, e o `= 1` faz o InitPlan cortar o ramo inteiro
-- para essas pessoas — a função por linha nunca chega a rodar para elas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '180s';

-- ── Catálogo SQL (encadeado, nunca reescrito) ───────────────────────────────
ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_equipe_20260903;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_equipe_20260903()
  UNION ALL
  SELECT * FROM (VALUES
    -- `padrao` = a mesma lista de `dashboard_escopo_equipe` (lideranca).
    -- Empresa nova nasce como as de hoje: quem vê equipe, vê todas.
    ('dashboard_escopo_equipe_todas', NULL::TEXT[],
     ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260903 acrescenta '
  'dashboard_escopo_equipe_todas sem reescrever o catalogo anterior.';

-- ── Backfill: o estado de hoje, escrito por extenso ─────────────────────────
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('dashboard_escopo_equipe_todas', TRUE)
 WHERE COALESCE((permissoes->>'dashboard_escopo_equipe')::BOOLEAN, FALSE)
   AND NOT (permissoes ? 'dashboard_escopo_equipe_todas');

-- Quem NÃO tem `equipe` recebe a chave desligada, explicitamente. Sem isso o
-- painel mostraria o cartão em branco («ausente») para uns cargos e ligado para
-- outros, e ninguém saberia dizer se aquilo é um não ou um "ainda não decidi".
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('dashboard_escopo_equipe_todas', FALSE)
 WHERE NOT COALESCE((permissoes->>'dashboard_escopo_equipe')::BOOLEAN, FALSE)
   AND NOT (permissoes ? 'dashboard_escopo_equipe_todas');

-- ── Quem cabe no meu alcance de equipe ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_operador_no_meu_alcance_de_equipe(p_operador UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    -- Todas as equipes: basta a pessoa estar em ALGUMA equipe de um setor meu.
    WHEN public.fn_user_tem('dashboard_escopo_equipe_todas') THEN EXISTS (
      SELECT 1 FROM public.fn_equipes_do_operador(p_operador) dele
       WHERE dele.setor_id IN (
         SELECT public.fn_setores_do_operador((SELECT auth.uid()))
       )
    )
    -- Só a minha: a equipe tem que ser literalmente uma das minhas.
    ELSE EXISTS (
      SELECT 1 FROM public.fn_equipes_do_operador(p_operador) dele
       WHERE dele.equipe_id IN (
         SELECT eq.equipe_id FROM public.fn_equipes_do_operador((SELECT auth.uid())) eq
       )
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_operador_no_meu_alcance_de_equipe(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_operador_no_meu_alcance_de_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_operador_no_meu_alcance_de_equipe(UUID) IS
  'Esta pessoa esta no alcance de EQUIPE de quem esta logado? Com '
  'dashboard_escopo_equipe_todas ligada vale qualquer equipe dos meus setores; '
  'sem ela, so as equipes de que eu participo (a do cadastro e as clonadas).';

-- ── acordos_select ganha o ramo de equipe ───────────────────────────────────
-- Os ramos de super_admin, `>= 3` e `>= 2` ficam LETRA POR LETRA como estavam.
-- O que entra é o quarto ramo, e só ele.
DROP POLICY IF EXISTS acordos_select ON public.acordos;

CREATE POLICY acordos_select ON public.acordos
FOR SELECT
USING (
  (
    (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  )
  AND (
    -- Os proprios acordos. Nao e regra de cargo: e o piso de qualquer pessoa
    -- sobre o proprio trabalho, e o painel nao precisa conceder isso.
    operador_id = (SELECT auth.uid())

    -- Chave-mestra: existe para que ninguem se tranque para fora editando o
    -- painel. E o unico cargo que a tela nao consegue reduzir.
    OR (SELECT public.fn_user_is_super_admin())

    -- Daqui para baixo quem manda e o painel, sem intermediario.
    OR (SELECT public.fn_user_escopo_acordos()) >= 3

    OR (
      (SELECT public.fn_user_escopo_acordos()) >= 2
      AND (
        setor_id = (SELECT public.fn_user_setor_id())
        OR (setor_id IS NULL
            AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
        OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))
      )
    )

    -- `= 1`: para quem alcanca 2 ou 3 os ramos acima ja responderam, e o
    -- InitPlan corta este antes de a funcao por linha rodar.
    OR (
      (SELECT public.fn_user_escopo_acordos()) = 1
      AND public.fn_operador_no_meu_alcance_de_equipe(operador_id)
    )
  )
);

COMMENT ON POLICY acordos_select ON public.acordos IS
  'Leitura de acordos. O alcance vem de fn_user_escopo_acordos(), que espelha '
  'o painel de permissoes sem teto. O nivel equipe passa por '
  'fn_operador_no_meu_alcance_de_equipe, que le dashboard_escopo_equipe_todas. '
  'As unicas regras acima do painel sao os proprios acordos da pessoa e a '
  'chave-mestra do super_admin.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_sem   TEXT;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
                  WHERE chave = 'dashboard_escopo_equipe_todas') THEN
    RAISE EXCEPTION 'a chave nova nao entrou no catalogo';
  END IF;

  -- O backfill nao pode ter deixado ninguem sem a chave gravada: chave ausente
  -- num cargo que TEM equipe seria justamente o estreitamento silencioso.
  SELECT string_agg(e.slug || '/' || cp.cargo, ', ')
    INTO v_sem
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id
   WHERE NOT (cp.permissoes ? 'dashboard_escopo_equipe_todas');

  IF v_sem IS NOT NULL THEN
    RAISE EXCEPTION 'ficaram sem a chave nova: %', v_sem;
  END IF;

  -- E ninguem que via todas as equipes pode ter deixado de ver.
  SELECT string_agg(e.slug || '/' || cp.cargo, ', ')
    INTO v_sem
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id
   WHERE COALESCE((cp.permissoes->>'dashboard_escopo_equipe')::BOOLEAN, FALSE)
     AND NOT COALESCE((cp.permissoes->>'dashboard_escopo_equipe_todas')::BOOLEAN, FALSE);

  IF v_sem IS NOT NULL THEN
    RAISE EXCEPTION 'perderiam equipes que ja viam: %', v_sem;
  END IF;
END
$prova$;

COMMIT;
