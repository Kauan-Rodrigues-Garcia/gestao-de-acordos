-- ============================================================================
-- Uma aba para de falar pela outra na leitura de perfis
--
-- `perfis_select` decide quem a pessoa consegue LER na tabela de gente. Hoje
-- ela tem uma condição só, chaveada em `fn_user_escopo('usuarios')`. Como é a
-- ÚNICA policy de SELECT em `perfis`, toda tela que lê a tabela — Equipes,
-- Dashboard, Analítico, Painel, Acordos, Pix, RH, Chat — herda o escopo da aba
-- Usuários. Baixar o alcance da aba Usuários apaga gente de telas que nada têm
-- a ver com a aba Usuários, e nenhuma configuração das outras abas consegue
-- trazer essa gente de volta: a RLS corta antes de o front escolher.
--
-- Isso contraria a regra do projeto, escrita em `permissoes-escopo.ts`: «cada
-- aba carrega os próprios níveis, e uma aba não fala pela outra».
--
-- O conserto não é novo — é o mesmo que `acordos` já usa desde a migration
-- 20260822233010. Lá, `fn_user_escopo_acordos()` é «o MAIOR escopo entre as
-- abas que leem acordos», e cada tela estreita dali para baixo com o próprio
-- nível. A RLS vira o TETO do que a pessoa pode ver em qualquer lugar; o
-- recorte por aba continua sendo do front, aba por aba.
--
-- Aqui a mesma ideia chega a `perfis`, com `fn_user_escopo_perfis()`.
--
-- ── O que isso muda na prática ─────────────────────────────────────────────
--
-- Quem tem Dashboard de empresa inteira e Usuários só do setor passa a
-- CONSEGUIR ler as linhas de perfil da empresa inteira. Antes não conseguia, e
-- por isso o Dashboard dele mostrava buracos. É o efeito pedido.
--
-- A contrapartida é honesta e precisa ficar escrita: a RLS deixa de ser o
-- recorte por aba e passa a ser o teto. Uma tela que esquecer de aplicar o
-- próprio escopo mostra até o teto. As telas já aplicam (é o que
-- `permissoes-escopo.ts` faz), mas a rede embaixo agora é mais larga.
--
-- ── Dois níveis que faltavam ───────────────────────────────────────────────
--
-- 1. `equipe` (nível 1) nunca existiu em `perfis_select`: quem tinha alcance de
--    equipe caía no ramo final e via só o próprio perfil — uma aba de equipe
--    sem os colegas dela. Agora existe, e conta tanto a equipe a que a pessoa
--    pertence quanto as que ela LIDERA (`equipe_lideres`), que é o sentido de
--    `equipe` no RH e no Painel.
--
-- 2. O nível `setor` comparava o setor do LEITOR com `fn_user_setor_id()`, um
--    valor único, ignorando que o próprio leitor pode ser clone em outro setor.
--    Um líder clonado no play 4 não enxergava o play 4. Agora os dois lados
--    passam por `fn_setores_do_operador`, então clone enxerga e é enxergado.
--
-- Não altera dados: só funções e uma policy.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Equipes em que a pessoa aparece, liderança incluída ─────────────────────
--
-- Função NOVA, de propósito. `fn_equipes_do_operador` já existe e representa
-- só a associação OPERACIONAL (perfil + clones de operador), e a migration
-- 20260826180803 registrou por escrito que a liderança de `equipe_lideres`
-- «não pode ser misturada globalmente nessa função, porque relatórios têm
-- regras diferentes» — o analítico usa aquela função para decidir QUAIS
-- OPERADORES CONTAM num total, e liderar uma equipe não pode passar o
-- recebimento dela para o líder. A decisão continua valendo; nada aqui a toca.
--
-- Esta responde outra pergunta: em que equipes a pessoa ESTÁ PRESENTE, para
-- efeito de alcance de leitura. Aí liderar conta.
--
-- O chat já tinha resolvido isso para si em `fn_chat_equipes_do_perfil`, com o
-- mesmo corpo. Duas cópias é o preço de não mexer no chat no meio de uma
-- mudança de permissões; quando o chat for revisto, ele pode passar a chamar
-- esta e a dele vira um apelido.
CREATE OR REPLACE FUNCTION public.fn_equipes_com_lideranca(p_perfil uuid)
RETURNS TABLE (equipe_id uuid, setor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT q.equipe_id, q.setor_id
    FROM public.fn_equipes_do_operador(p_perfil) q
  UNION
  SELECT el.equipe_id, e.setor_id
    FROM public.equipe_lideres el
    JOIN public.equipes e ON e.id = el.equipe_id
   WHERE el.lider_id = p_perfil;
$function$;

COMMENT ON FUNCTION public.fn_equipes_com_lideranca(uuid) IS
  'Equipes em que a pessoa esta presente PARA EFEITO DE ALCANCE: associacao operacional (fn_equipes_do_operador) mais as equipes que ela lidera. NAO usar para atribuir recebimento — para totais vale fn_equipes_do_operador, que exclui lideranca de proposito.';

REVOKE ALL ON FUNCTION public.fn_equipes_com_lideranca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_equipes_com_lideranca(uuid) TO authenticated;

-- ── O maior escopo entre as abas que leem perfis ────────────────────────────
-- Todas as abas do catálogo mostram gente de alguma forma — nome no card, no
-- filtro, na coluna Operador, na lista de destinatários. Por isso a lista é
-- `fn_abas_escopo()` inteira, e não um subconjunto escolhido a dedo: subconjunto
-- vira exatamente o bug que esta migration conserta, só que com outra aba no
-- lugar de Usuários.
CREATE OR REPLACE FUNCTION public.fn_user_escopo_perfis()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(MAX(public.fn_user_escopo(a.aba)), -1)
    FROM public.fn_abas_escopo() a;
$function$;

COMMENT ON FUNCTION public.fn_user_escopo_perfis() IS
  'Ate onde a pessoa alcanca em perfis: -1=so o proprio, 1=equipe, 2=setor, 3=empresa. E o MAIOR escopo entre TODAS as abas do catalogo — a RLS de perfis e o teto, e cada aba estreita dali para baixo com o proprio nivel. Mesmo desenho de fn_user_escopo_acordos.';

REVOKE ALL ON FUNCTION public.fn_user_escopo_perfis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_escopo_perfis() TO authenticated;

-- ── A policy ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS perfis_select ON public.perfis;
CREATE POLICY perfis_select ON public.perfis
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = id
  OR (SELECT public.fn_user_is_super_admin())
  OR (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (
      (SELECT public.fn_user_escopo_perfis()) >= 3
      OR (
        (SELECT public.fn_user_escopo_perfis()) = 2
        AND EXISTS (
          SELECT 1
            FROM public.fn_setores_do_operador(id) AS alvo(setor_id)
           WHERE alvo.setor_id IN (
             SELECT eu.setor_id
               FROM public.fn_setores_do_operador((SELECT auth.uid())) AS eu(setor_id)
           )
        )
      )
      OR (
        (SELECT public.fn_user_escopo_perfis()) = 1
        AND EXISTS (
          SELECT 1
            FROM public.fn_equipes_com_lideranca(id) AS alvo
           WHERE alvo.equipe_id IN (
             SELECT eu.equipe_id
               FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS eu
           )
        )
      )
    )
  )
);

COMMENT ON POLICY perfis_select ON public.perfis IS
  'Teto de leitura de gente: o MAIOR escopo entre todas as abas (fn_user_escopo_perfis). Cada aba estreita dali para baixo no front — nenhuma aba manda no alcance de outra.';

COMMIT;
