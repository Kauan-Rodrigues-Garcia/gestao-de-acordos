-- ============================================================================
-- Chat: lista de contatos e monitoria calculadas em lote + cartao do contato
-- ============================================================================
--
-- Pedido de 19/09/2026: «o chat esta demorando muito para carregar a lista de
-- usuarios ao clicar para iniciar um novo disparo [...] qualquer pesquisa que
-- exista no chat deve melhorar». E: clicar no nome da conversa direta abre o
-- perfil da pessoa, como ja acontece no grupo.
--
-- ## Onde o tempo ia
--
-- `fn_chat_contatos` chamava `fn_chat_alcanca(p.id)` para CADA perfil. Cada
-- chamada refazia, do zero, perguntas que so dependem de quem pergunta:
--
--   - `fn_chat_pode_usar()` de mim mesmo, uma vez por linha;
--   - `fn_user_tem(...)` duas a quatro vezes, e `fn_perfil_tem` do alvo;
--   - `fn_can_access_empresa`, que chama `fn_user_tem` de novo.
--
-- E toda `fn_user_tem` le `fn_permissoes_catalogo()`, que hoje e uma cadeia de
-- ~25 funcoes (`..._antes_elite_20260919` -> `..._antes_robo_59_...` -> ...),
-- nenhuma embutivel por causa do `SET search_path`. Para quem alcanca a
-- empresa inteira isso eram centenas de perfis x cinco cadeias de catalogo:
-- dezenas de milhares de chamadas de funcao para montar uma lista de nomes.
-- O super_admin quase nao sentia (`fn_user_is_super_admin` corta cedo); o
-- diretor com «todos os setores» sentia inteiro.
--
-- ## O que muda
--
-- As perguntas sobre QUEM PERGUNTA sao feitas uma vez, antes da consulta:
-- pode usar, e super_admin, quais escopos tem, quais cargos alcanca (uma
-- chamada por cargo existente, ~10), quais empresas alcanca (uma por empresa).
-- A consulta so compara colunas com essas respostas.
--
-- «O alvo RECEBE?» (`fn_chat_pode_usar(alvo)`) virou JOIN: `chat_config` da
-- empresa dele, a excecao em `perfis_permissoes` e o mapa em
-- `cargos_permissoes` — a mesma ordem de `fn_perfil_tem` (acesso total menos
-- chave explicita, excecao por pessoa, mapa do cargo, ausente = negado), com
-- o «ver_chat e explicita?» lido UMA vez. Sao duas copias da mesma regra, e
-- por isso a copia fica aqui, com este aviso: mudou `fn_perfil_tem` ou
-- `fn_chat_pode_usar`, muda o bloco `recebe` junto.
--
-- Equipes e setores do alvo continuam saindo de `fn_chat_equipes_do_perfil` e
-- `fn_chat_setores_do_perfil` — a fonte unica de «onde a pessoa esta», com
-- clone e lider de equipe. Uma chamada por candidato, e nao por par
-- candidato x equipe como o `LEFT JOIN ... ON e.id IN (SELECT ...)` antigo.
--
-- `fn_chat_alcanca` NAO muda: e ela que autoriza abrir conversa, criar e
-- engordar grupo, uma pessoa por vez — onde o custo por chamada nao pesa. Esta
-- lista e a mesma resposta em lote; se as duas divergirem, a tela oferece
-- alguem que `fn_chat_abrir` recusa, e e isso que o aviso acima evita.
--
-- `fn_chat_monitoraveis` tinha o mesmo desenho (`fn_chat_posso_monitorar` por
-- linha, com ate tres `fn_user_tem` cada) e ganhou o mesmo tratamento.
--
-- ## O cartao do contato
--
-- `fn_chat_perfil_contato(conversa, alvo)`: nome, login, cargo, setor, equipe,
-- lideranca, empresa, desde quando esta na planilha (`perfis.criado_em`),
-- ferias e os grupos em comum. So responde sobre quem esta numa conversa que
-- eu posso ver — a minha, ou uma que monitoro. A RLS de `perfis` e mais
-- estreita que o chat (operador nao le cadastro de outro setor), e o chat deixa
-- conversar com gente de fora do setor: sem a RPC, metade dos cartoes abriria
-- vazia. Grupos em comum so saem para quem e PARTE da conversa; na monitoria,
-- «em comum» seria entre a pessoa e quem monitora.
--
-- Idempotente: so `CREATE OR REPLACE`, mesmas assinaturas e mesmos retornos.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Com quem eu posso INICIAR conversa — em lote
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_chat_contatos()
RETURNS TABLE (
  perfil_id     UUID,
  nome          TEXT,
  usuario       TEXT,
  foto_url      TEXT,
  cargo         TEXT,
  setor_id      UUID,
  setor_nome    TEXT,
  equipe_id     UUID,
  equipe_nome   TEXT,
  empresa_slug  TEXT,
  multiempresa  BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_eu              UUID := (SELECT auth.uid());
  v_super           BOOLEAN;
  v_todos           BOOLEAN;
  v_setor           BOOLEAN := FALSE;
  v_equipe          BOOLEAN := FALSE;
  v_cargos_todos    TEXT[];
  v_cargos          TEXT[];
  v_empresas        UUID[];
  v_meus_setores    UUID[] := '{}';
  v_minhas_equipes  UUID[] := '{}';
  v_ver_chat_explicita BOOLEAN;
BEGIN
  -- Mesmo portao de fn_chat_alcanca: quem nao usa o chat nao alcanca ninguem.
  IF v_eu IS NULL OR NOT public.fn_chat_pode_usar() THEN
    RETURN;
  END IF;

  v_super := COALESCE(public.fn_user_is_super_admin(), FALSE);
  v_todos := v_super OR public.fn_user_tem('chat_escopo_todos_setores');
  IF NOT v_todos THEN
    v_setor  := public.fn_user_tem('chat_escopo_setor');
    v_equipe := public.fn_user_tem('chat_escopo_equipe');
    IF NOT (v_setor OR v_equipe) THEN
      RETURN;
    END IF;
  END IF;

  -- Cargos alcancados: uma pergunta por cargo existente, nao por pessoa. Em
  -- duas etapas de proposito — um WHERE sobre `SELECT DISTINCT` seria empurrado
  -- para dentro dele e voltaria a rodar uma vez por perfil.
  IF NOT v_super THEN
    SELECT array_agg(DISTINCT p.perfil::TEXT) INTO v_cargos_todos FROM public.perfis p;
    SELECT COALESCE(array_agg(c.cargo), '{}') INTO v_cargos
      FROM unnest(COALESCE(v_cargos_todos, '{}')) AS c(cargo)
     WHERE public.fn_user_tem('chat_cargo_' || c.cargo);

    SELECT COALESCE(array_agg(emp.id), '{}') INTO v_empresas
      FROM public.empresas emp
     WHERE public.fn_can_access_empresa(emp.id);
  END IF;

  IF v_setor THEN
    SELECT COALESCE(array_agg(s.setor_id), '{}') INTO v_meus_setores
      FROM public.fn_chat_setores_do_perfil(v_eu) s;
  END IF;
  IF v_equipe THEN
    SELECT COALESCE(array_agg(q.equipe_id), '{}') INTO v_minhas_equipes
      FROM public.fn_chat_equipes_do_perfil(v_eu) q;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() cat
     WHERE cat.chave = 'ver_chat' AND cat.explicita
  ) INTO v_ver_chat_explicita;

  RETURN QUERY
  WITH candidatos AS MATERIALIZED (
    SELECT p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT AS cargo,
           p.setor_id AS setor_do_perfil, p.empresa_id,
           (p.perfil = 'super_admin' OR COALESCE(p.acesso_multiempresa, FALSE)) AS multiempresa
      FROM public.perfis p
      LEFT JOIN public.chat_config cc ON cc.empresa_id = p.empresa_id
      LEFT JOIN public.perfis_permissoes pp
             ON pp.usuario_id = p.id AND pp.permissoes ? 'ver_chat'
      LEFT JOIN public.cargos_permissoes cp
             ON cp.empresa_id = p.empresa_id AND cp.cargo = p.perfil
            AND cp.permissoes ? 'ver_chat'
     WHERE p.id <> v_eu
       AND COALESCE(p.ativo, TRUE)
       AND NOT COALESCE(p.arquivado, FALSE)
       -- fn_can_access_empresa + chat_cargo_<cargo>, respondidos acima.
       AND (v_super OR p.empresa_id = ANY (v_empresas))
       AND (v_super OR p.perfil::TEXT = ANY (v_cargos))
       -- recebe: fn_chat_pode_usar(p.id) em lote. Mesma regra, mesma ordem
       -- de fn_perfil_tem — ver o cabecalho antes de mexer.
       AND NOT p.chat_bloqueado
       AND (
         p.perfil = 'super_admin'
         OR (
           COALESCE(cc.liberado, FALSE)
           AND CASE
                 WHEN p.perfil IN ('administrador', 'super_admin') AND NOT v_ver_chat_explicita
                   THEN TRUE
                 WHEN pp.usuario_id IS NOT NULL
                   THEN COALESCE((pp.permissoes->>'ver_chat')::BOOLEAN, FALSE)
                 WHEN cp.empresa_id IS NOT NULL
                   THEN COALESCE((cp.permissoes->>'ver_chat')::BOOLEAN, FALSE)
                 ELSE FALSE
               END
         )
       )
  ),
  vinculos AS MATERIALIZED (
    SELECT c.id AS dono, q.equipe_id AS equipe
      FROM candidatos c
      CROSS JOIN LATERAL public.fn_chat_equipes_do_perfil(c.id) q
  ),
  alcancados AS (
    SELECT c.*
      FROM candidatos c
     WHERE v_todos
        OR (v_equipe AND EXISTS (
              SELECT 1 FROM vinculos v
               WHERE v.dono = c.id AND v.equipe = ANY (v_minhas_equipes)))
        OR (v_setor AND EXISTS (
              SELECT 1 FROM public.fn_chat_setores_do_perfil(c.id) s
               WHERE s.setor_id = ANY (v_meus_setores)))
  )
  SELECT lista.*
    FROM (
      SELECT DISTINCT
             a.id,
             a.nome::TEXT,
             a.usuario::TEXT,
             a.foto_url::TEXT,
             a.cargo,
             s.id,
             s.nome::TEXT,
             e.id,
             e.nome::TEXT,
             emp.slug::TEXT,
             a.multiempresa
        FROM alcancados a
        -- Mesmo recorte do LEFT JOIN antigo: todas as equipes da pessoa, e o
        -- setor do perfil so quando ela nao tem equipe nenhuma.
        LEFT JOIN LATERAL (
          SELECT eq.id, eq.nome, eq.setor_id
            FROM public.equipes eq
           WHERE eq.id IN (SELECT v.equipe FROM vinculos v WHERE v.dono = a.id)
        ) e ON TRUE
        LEFT JOIN public.setores  s   ON s.id = COALESCE(e.setor_id, a.setor_do_perfil)
        LEFT JOIN public.empresas emp ON emp.id = a.empresa_id
    ) AS lista (perfil_id, nome, usuario, foto_url, cargo, setor_id, setor_nome,
                equipe_id, equipe_nome, empresa_slug, multiempresa)
   ORDER BY lista.multiempresa, lista.setor_nome, lista.equipe_nome,
            (lista.cargo = 'lider') DESC, lista.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_contatos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_contatos() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_contatos() IS
  'Contatos do chat (quem eu alcanco E recebe), calculados em lote: as '
  'perguntas sobre quem pergunta sao feitas uma vez. Espelha fn_chat_alcanca '
  'e fn_chat_pode_usar — ver 20260919150000.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Quem eu posso acompanhar — em lote
-- ════════════════════════════════════════════════════════════════════════════
--
-- Espelha fn_chat_posso_monitorar: mudou la, muda aqui.

CREATE OR REPLACE FUNCTION public.fn_chat_monitoraveis(p_busca TEXT DEFAULT NULL)
RETURNS TABLE (
  perfil_id UUID, nome TEXT, usuario TEXT, foto_url TEXT,
  cargo TEXT, setor_nome TEXT, empresa_slug TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_eu     UUID := (SELECT auth.uid());
  v_meu    RECORD;
  v_super  BOOLEAN;
  v_todos  BOOLEAN := FALSE;
  v_setor  BOOLEAN := FALSE;
  v_equipe BOOLEAN := FALSE;
  v_termo  TEXT := NULLIF(BTRIM(p_busca), '');
BEGIN
  IF v_eu IS NULL OR NOT public.fn_user_tem('chat_monitor') THEN
    RETURN;
  END IF;

  SELECT p.perfil, p.empresa_id, p.setor_id, p.equipe_id, p.acesso_multiempresa
    INTO v_meu
    FROM public.perfis p
   WHERE p.id = v_eu;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_super := v_meu.perfil = 'super_admin';
  IF NOT v_super THEN
    v_todos := public.fn_user_tem('chat_monitor_escopo_todos_setores');
    IF NOT v_todos THEN
      v_setor  := v_meu.setor_id IS NOT NULL
                  AND public.fn_user_tem('chat_monitor_escopo_setor');
      v_equipe := v_meu.equipe_id IS NOT NULL
                  AND public.fn_user_tem('chat_monitor_escopo_equipe');
      IF NOT (v_setor OR v_equipe) THEN
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome::TEXT, p.usuario::TEXT, p.foto_url::TEXT, p.perfil::TEXT,
         s.nome::TEXT, e.slug::TEXT
    FROM public.perfis p
    LEFT JOIN public.setores  s ON s.id = p.setor_id
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
   WHERE COALESCE(p.arquivado, FALSE) = FALSE
     AND p.ativo
     AND p.id <> v_eu
     AND (
       v_super
       OR (
         -- Fora da empresa so com acesso multiempresa.
         (p.empresa_id IS NOT DISTINCT FROM v_meu.empresa_id
          OR COALESCE(v_meu.acesso_multiempresa, FALSE))
         AND (
           v_todos
           OR (v_setor  AND p.setor_id  = v_meu.setor_id)
           OR (v_equipe AND p.equipe_id = v_meu.equipe_id)
         )
       )
     )
     AND (
       v_termo IS NULL
       OR p.nome    ILIKE '%' || v_termo || '%'
       OR p.usuario ILIKE '%' || v_termo || '%'
     )
   ORDER BY p.nome
   LIMIT 60;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitoraveis(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitoraveis(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. O cartao do contato
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_chat_perfil_contato(p_conversa UUID, p_alvo UUID)
RETURNS TABLE (
  perfil_id       UUID,
  nome            TEXT,
  usuario         TEXT,
  foto_url        TEXT,
  cargo           TEXT,
  setor_nome      TEXT,
  equipe_nome     TEXT,
  lideres         TEXT,
  empresa_nome    TEXT,
  criado_em       TIMESTAMPTZ,
  situacao        TEXT,
  ferias_ate      DATE,
  grupos_em_comum JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id,
         p.nome::TEXT,
         p.usuario::TEXT,
         p.foto_url::TEXT,
         p.perfil::TEXT,
         s.nome::TEXT,
         e.nome::TEXT,
         -- Quem lidera a equipe dela, sem ela mesma (lider nao se lidera).
         (SELECT string_agg(l.nome::TEXT, ', ' ORDER BY l.nome)
            FROM public.equipe_lideres el
            JOIN public.perfis l ON l.id = el.lider_id
           WHERE el.equipe_id = p.equipe_id
             AND el.lider_id <> p.id
             AND COALESCE(l.ativo, TRUE)
             AND NOT COALESCE(l.arquivado, FALSE)),
         emp.nome::TEXT,
         p.criado_em::TIMESTAMPTZ,
         p.situacao::TEXT,
         p.ferias_ate::DATE,
         CASE WHEN public.fn_chat_sou_parte(p_conversa) THEN COALESCE((
           SELECT jsonb_agg(
                    jsonb_build_object('id', g.id, 'nome', g.nome, 'foto_url', g.foto_url)
                    ORDER BY g.ultima_mensagem_em DESC NULLS LAST)
             FROM public.chat_conversas g
            WHERE g.tipo = 'grupo'
              AND EXISTS (SELECT 1 FROM public.chat_participantes eu
                           WHERE eu.conversa_id = g.id
                             AND eu.perfil_id = (SELECT auth.uid())
                             AND eu.saiu_em IS NULL
                             AND eu.apagada_em IS NULL)
              AND EXISTS (SELECT 1 FROM public.chat_participantes ele
                           WHERE ele.conversa_id = g.id
                             AND ele.perfil_id = p.id
                             AND ele.saiu_em IS NULL)
         ), '[]'::JSONB) ELSE '[]'::JSONB END
    FROM public.perfis p
    LEFT JOIN public.setores  s   ON s.id = p.setor_id
    LEFT JOIN public.equipes  e   ON e.id = p.equipe_id
    LEFT JOIN public.empresas emp ON emp.id = p.empresa_id
   WHERE p.id = p_alvo
     AND public.fn_chat_pode_usar()
     AND (public.fn_chat_sou_parte(p_conversa)
          OR public.fn_chat_monitoro_conversa(p_conversa))
     AND EXISTS (SELECT 1 FROM public.chat_participantes cp
                  WHERE cp.conversa_id = p_conversa
                    AND cp.perfil_id = p_alvo);
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_perfil_contato(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_perfil_contato(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_perfil_contato(UUID, UUID) IS
  'Cartao de uma pessoa de uma conversa que eu posso ver (minha ou monitorada): '
  'cargo, lotacao, lideranca, desde quando esta na planilha, ferias e grupos em '
  'comum. Ver 20260919150000.';

COMMIT;
