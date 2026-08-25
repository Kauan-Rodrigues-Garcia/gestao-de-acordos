-- ============================================================================
-- Chat — um so, e nao um por empresa
-- ============================================================================
--
-- ## O que estava errado
--
-- `fn_chat_alcanca` exigia `a.empresa_id = b.empresa_id`. Para quem atende UMA
-- operacao esta certo e continua valendo. Para quem atende as duas, nao: o
-- super_admin trocava de empresa e a lista de contatos trocava junto, como se
-- ele fosse duas pessoas. As conversas ja atravessavam (a lista nunca filtrou
-- por empresa) — so nao dava para COMECAR uma.
--
-- Agora a regra e a mesma que o resto do sistema usa para dizer "esta empresa
-- e minha": `fn_can_access_empresa`. Quem tem so a propria continua exatamente
-- como estava; quem tem multiempresa liberada alcanca as empresas que lhe foram
-- concedidas, uma a uma (ver a migration 20260825200000). Super_admin alcanca
-- todas, por cargo.
--
-- Nao e afrouxamento: e a MESMA funcao que decide se a pessoa pode ver um
-- acordo daquela empresa. Se ela pode ver o dado, pode falar com quem trabalha
-- nele.
--
-- ## A tag na conversa
--
-- `fn_chat_contatos` passa a devolver a empresa da pessoa — e um sinal de que
-- ela propria e multiempresa. A tela mostra «BOOKPLAY»/«PAGUEPLAY» ao lado do
-- nome, e NAO mostra nada para quem atende as duas: rotular de uma so seria
-- dizer uma meia verdade sobre onde aquela pessoa esta.
-- ============================================================================

-- ── Alcance ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_alcanca(p_alvo UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_alvo <> (SELECT auth.uid())
     AND public.fn_chat_pode_usar()
     AND public.fn_chat_pode_usar(p_alvo)
     -- A empresa do OUTRO precisa ser uma que eu alcanço. Para a maioria isso
     -- e a propria, e nada muda. Ver o cabecalho.
     AND EXISTS (
       SELECT 1 FROM public.perfis b
        WHERE b.id = p_alvo
          AND public.fn_can_access_empresa(b.empresa_id)
     )
     AND (
       public.fn_user_is_super_admin()
       OR public.fn_user_tem('chat_escopo_todos_setores')
       OR (public.fn_user_tem('chat_escopo_setor') AND EXISTS (
             SELECT 1 FROM public.fn_setores_do_operador((SELECT auth.uid())) meu
             WHERE meu IN (SELECT public.fn_setores_do_operador(p_alvo))))
       OR (public.fn_user_tem('chat_escopo_equipe') AND EXISTS (
             SELECT 1 FROM public.fn_equipes_do_operador((SELECT auth.uid())) minha
             WHERE minha.equipe_id IN (
               SELECT e.equipe_id FROM public.fn_equipes_do_operador(p_alvo) e
             )))
     );
$$;

COMMENT ON FUNCTION public.fn_chat_alcanca(UUID) IS
  'Consigo INICIAR conversa com esta pessoa? Atravessa empresa quando eu alcanco '
  'a empresa dela (fn_can_access_empresa). Nao vale para responder: quem ja me '
  'escreveu eu respondo sempre, mesmo fora do alcance.';

-- ── Contatos, agora com a empresa junto ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_chat_contatos();

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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
         p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT,
         s.id, s.nome, e.id, e.nome,
         emp.slug,
         -- Quem atende as duas nao ganha tag: rotular de uma so seria dizer
         -- uma meia verdade sobre onde a pessoa esta.
         (p.perfil = 'super_admin' OR COALESCE(p.acesso_multiempresa, FALSE))
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id IN (
      SELECT q.equipe_id FROM public.fn_equipes_do_operador(p.id) q
    )
    LEFT JOIN public.setores  s   ON s.id   = COALESCE(e.setor_id, p.setor_id)
    LEFT JOIN public.empresas emp ON emp.id = p.empresa_id
   WHERE COALESCE(p.ativo, TRUE)
     AND NOT COALESCE(p.arquivado, FALSE)
     AND p.id <> (SELECT auth.uid())
     AND public.fn_chat_alcanca(p.id)
   ORDER BY 10, 7, 9, 2;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_contatos() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_contatos() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_contatos() IS
  'Com quem eu posso INICIAR conversa, agrupado por empresa, setor e equipe. '
  'Ja filtrado por alcance e por quem consegue receber.';

-- ── De quem e a conversa: a empresa da outra pessoa ─────────────────────────
--
-- A lista de conversas precisa da empresa do outro para desenhar a tag, e
-- `perfis` so devolve quem a RLS deixa. Uma pessoa da outra empresa passaria
-- pela policy de `perfis`? Depende do recorte dela — e depender disso para a
-- tag aparecer daria tag em algumas linhas e em outras nao, sem padrao visivel.
--
-- Esta funcao responde so o necessario (slug e o sinal de multiempresa) e so
-- para quem ja e parte da conversa.

CREATE OR REPLACE FUNCTION public.fn_chat_empresas_das_conversas()
RETURNS TABLE (perfil_id UUID, empresa_slug TEXT, multiempresa BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT outro.id, emp.slug,
         (outro.perfil = 'super_admin' OR COALESCE(outro.acesso_multiempresa, FALSE))
    FROM public.chat_conversas c
    JOIN public.perfis outro
      ON outro.id = CASE WHEN c.par_menor = (SELECT auth.uid())
                         THEN c.par_maior ELSE c.par_menor END
    LEFT JOIN public.empresas emp ON emp.id = outro.empresa_id
   WHERE (SELECT auth.uid()) IN (c.par_menor, c.par_maior)
     AND public.fn_chat_pode_usar();
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_empresas_das_conversas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_empresas_das_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_empresas_das_conversas() IS
  'A empresa de cada pessoa com quem eu tenho conversa, para a tag da lista. '
  'So responde sobre quem ja conversa comigo.';

-- ── A empresa da mensagem vem da CONVERSA ───────────────────────────────────
--
-- Ate aqui o cliente mandava a empresa da sessao dele. Numa conversa entre
-- empresas isso passa a estar errado: dois super_admins de operacoes
-- diferentes gravariam, na MESMA conversa, mensagens com empresa_id diferente,
-- conforme quem escreveu.
--
-- Nada quebraria hoje — a RLS de mensagem pergunta pela conversa, nao pela
-- empresa. Mas e o tipo de incoerencia que so aparece meses depois, num
-- relatorio que agrupa por empresa e conta a mesma conversa duas vezes.
--
-- Com o gatilho, a coluna deixa de depender de o cliente acertar.

CREATE OR REPLACE FUNCTION public.fn_chat_empresa_da_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  SELECT c.empresa_id INTO NEW.empresa_id
    FROM public.chat_conversas c WHERE c.id = NEW.conversa_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_empresa_da_mensagem ON public.chat_mensagens;
CREATE TRIGGER trg_chat_empresa_da_mensagem
BEFORE INSERT ON public.chat_mensagens
FOR EACH ROW EXECUTE FUNCTION public.fn_chat_empresa_da_mensagem();

COMMENT ON FUNCTION public.fn_chat_empresa_da_mensagem() IS
  'A empresa da mensagem e a da conversa, e nao a da sessao de quem escreveu. '
  'Importa desde que o chat passou a atravessar empresas.';
