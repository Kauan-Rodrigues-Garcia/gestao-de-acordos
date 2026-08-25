-- ============================================================================
-- Chat — mandar a mesma mensagem para varias pessoas, sem poluir a lista
-- ============================================================================
--
-- ## O defeito da Pomba que isto existe para nao repetir
--
-- La, disparar para 20 pessoas enche a lista de conversas com 20 linhas — 19
-- das quais ninguem vai responder. A lista deixa de servir para conversar.
--
-- ## O desenho
--
-- O disparo NAO cria grupo. Cria (ou reusa) as 20 conversas de duas pessoas, e
-- cada destinatario recebe uma mensagem comum: do lado dele nao ha nada
-- escondido, nada diferente, e ele responde como responderia qualquer outra.
--
-- O que muda e so a MINHA lista:
--
--   * conversa que eu JA via .............. continua na lista, atualiza normal.
--     E o mesmo chat, nao um paralelo.
--   * conversa que nasceu do disparo ...... fica fora da minha lista e vive na
--     aba de Disparos.
--   * a pessoa respondeu .................. entra na minha lista naquele
--     instante, com a conversa inteira.
--
-- Quem carrega isso e `chat_participantes.oculta_em`, no MEU lado. Nao e o
-- mesmo que `apagada_em`: apagada e escolha ("some daqui"), oculta e origem
-- ("nunca chegou a aparecer"). Separadas porque respondem a perguntas
-- diferentes e uma nao deve apagar a outra.
--
-- ## O gatilho precisou mudar
--
-- `fn_chat_apos_mensagem` ressuscitava a conversa dos DOIS lados a cada
-- mensagem. Certo para conversa comum: se eu apaguei e a pessoa escreve, tem
-- que voltar. Errado para disparo: a minha propria mensagem desfaria o esconde
-- na mesma transacao, e a lista encheria de novo — exatamente o que a Pomba faz.
--
-- Agora a regra e por AUTOR: mensagem revela a conversa para quem NAO escreveu.
-- Quem escreveu ja sabe que ela existe.
-- ============================================================================

-- ── O disparo ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_disparos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  autor_id       UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  texto          TEXT,
  anexos         JSONB NOT NULL DEFAULT '[]'::JSONB,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Quantos REALMENTE receberam. Nao e o tamanho da selecao: quem esta sem
  -- chat, bloqueado ou fora do alcance e pulado, e o numero tem que dizer a
  -- verdade sobre o que saiu.
  total_destinos INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_disparo_autor
  ON public.chat_disparos (autor_id, criado_em DESC);

-- Para quem foi, e onde a mensagem caiu. E o que a aba de Disparos abre:
-- quem recebeu, quem leu, quem respondeu.
CREATE TABLE IF NOT EXISTS public.chat_disparo_destinos (
  disparo_id  UUID NOT NULL REFERENCES public.chat_disparos(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  conversa_id UUID NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  mensagem_id UUID          REFERENCES public.chat_mensagens(id) ON DELETE SET NULL,
  PRIMARY KEY (disparo_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_disparo_destinos_conversa
  ON public.chat_disparo_destinos (conversa_id);

-- ── As duas colunas novas ───────────────────────────────────────────────────

ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS disparo_id UUID REFERENCES public.chat_disparos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chat_mensagens.disparo_id IS
  'Preenchido quando a mensagem saiu de um disparo. E o que o gatilho consulta '
  'para nao revelar a conversa na lista de quem disparou.';

ALTER TABLE public.chat_participantes
  ADD COLUMN IF NOT EXISTS oculta_em TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_participantes.oculta_em IS
  'Conversa que existe mas nunca apareceu na lista desta pessoa — nasceu de um '
  'disparo feito por ela. Some quando o outro lado responde. Diferente de '
  'apagada_em, que e escolha de quem apagou.';

-- A lista principal le por aqui: nem apagada, nem oculta.
DROP INDEX IF EXISTS public.idx_chat_part_pessoa;
CREATE INDEX IF NOT EXISTS idx_chat_part_pessoa
  ON public.chat_participantes (perfil_id)
  WHERE apagada_em IS NULL AND oculta_em IS NULL;

-- ── O gatilho, agora ciente de quem escreveu ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.chat_conversas
     SET ultima_mensagem_em = NEW.criado_em
   WHERE id = NEW.conversa_id;

  /*
   * Mensagem revela a conversa para quem NAO escreveu.
   *
   * Antes valia para os dois lados, e nao dava para separar disparo de conversa
   * comum: a minha propria mensagem de disparo apagava o `oculta_em` que a
   * `fn_chat_disparar` acabara de gravar, na mesma transacao.
   *
   * Por autor funciona nos dois casos, sem consultar `disparo_id`:
   *   * eu apaguei e a pessoa escreve .... volta para mim. Certo.
   *   * eu apaguei e EU escrevo .......... a RPC de abrir ja me desapagou.
   *   * disparei ......................... o destinatario ve; eu nao.
   *   * a pessoa respondeu o disparo ..... some o `oculta_em` do meu lado, e a
   *                                        conversa entra na minha lista.
   */
  UPDATE public.chat_participantes
     SET apagada_em = NULL,
         oculta_em  = NULL
   WHERE conversa_id = NEW.conversa_id
     AND perfil_id IS DISTINCT FROM NEW.autor_id
     AND (apagada_em IS NOT NULL OR oculta_em IS NOT NULL);

  -- Quem escreveu leu o que escreveu.
  UPDATE public.chat_participantes
     SET ultima_leitura_em = NEW.criado_em
   WHERE conversa_id = NEW.conversa_id AND perfil_id = NEW.autor_id;

  RETURN NEW;
END;
$$;

-- ── Disparar ────────────────────────────────────────────────────────────────
--
-- Uma RPC, e nao N chamadas do cliente: a decisao "esta conversa ja aparecia na
-- minha lista?" tem que ser lida ANTES da mensagem entrar, e o cliente nao tem
-- como garantir essa ordem. Vinte idas e vindas tambem deixariam metade do
-- disparo pela metade se a rede caisse no meio.
--
-- Quem nao pode receber e PULADO, nao derruba o disparo — e volta na resposta,
-- nominalmente, para quem disparou saber quem ficou de fora.

CREATE OR REPLACE FUNCTION public.fn_chat_disparar(
  p_destinos UUID[],
  p_texto    TEXT,
  p_anexos   JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_empresa  UUID;
  v_disparo  UUID;
  v_alvo     UUID;
  v_conversa UUID;
  v_menor    UUID;
  v_maior    UUID;
  v_aparecia BOOLEAN;
  v_msg      UUID;
  v_enviados INTEGER := 0;
  v_pulados  UUID[]  := ARRAY[]::UUID[];
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_sessao'; END IF;
  IF NOT public.fn_chat_pode_usar() THEN RAISE EXCEPTION 'sem_chat'; END IF;

  IF COALESCE(TRIM(p_texto), '') = '' AND jsonb_array_length(COALESCE(p_anexos, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'mensagem_vazia';
  END IF;

  SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_eu;

  INSERT INTO public.chat_disparos (empresa_id, autor_id, texto, anexos)
  VALUES (v_empresa, v_eu, NULLIF(TRIM(p_texto), ''), COALESCE(p_anexos, '[]'::JSONB))
  RETURNING id INTO v_disparo;

  FOREACH v_alvo IN ARRAY COALESCE(p_destinos, ARRAY[]::UUID[]) LOOP
    CONTINUE WHEN v_alvo IS NULL OR v_alvo = v_eu;

    v_menor := LEAST(v_eu, v_alvo);
    v_maior := GREATEST(v_eu, v_alvo);

    SELECT c.id INTO v_conversa
      FROM public.chat_conversas c
     WHERE c.empresa_id = v_empresa AND c.par_menor = v_menor AND c.par_maior = v_maior;

    -- Conversa que ja existe eu uso mesmo fora do alcance — e a mesma regra de
    -- `fn_chat_abrir`: responder nunca depende de alcance.
    IF v_conversa IS NULL AND NOT public.fn_chat_alcanca(v_alvo) THEN
      v_pulados := v_pulados || v_alvo;
      CONTINUE;
    END IF;

    -- Mesmo com conversa aberta, quem perdeu o chat nao recebe.
    IF NOT public.fn_chat_pode_usar(v_alvo) THEN
      v_pulados := v_pulados || v_alvo;
      CONTINUE;
    END IF;

    IF v_conversa IS NULL THEN
      INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
      VALUES (v_empresa, v_menor, v_maior)
      ON CONFLICT (empresa_id, par_menor, par_maior) DO NOTHING
      RETURNING id INTO v_conversa;

      IF v_conversa IS NULL THEN
        SELECT c.id INTO v_conversa FROM public.chat_conversas c
         WHERE c.empresa_id = v_empresa AND c.par_menor = v_menor AND c.par_maior = v_maior;
      END IF;

      INSERT INTO public.chat_participantes (conversa_id, perfil_id)
      VALUES (v_conversa, v_menor), (v_conversa, v_maior)
      ON CONFLICT DO NOTHING;
    END IF;

    -- ANTES de escrever: esta conversa ja aparecia na minha lista?
    SELECT (pa.apagada_em IS NULL AND pa.oculta_em IS NULL
            AND (SELECT c.ultima_mensagem_em FROM public.chat_conversas c WHERE c.id = v_conversa) IS NOT NULL)
      INTO v_aparecia
      FROM public.chat_participantes pa
     WHERE pa.conversa_id = v_conversa AND pa.perfil_id = v_eu;

    INSERT INTO public.chat_mensagens (conversa_id, empresa_id, autor_id, texto, anexos, disparo_id)
    VALUES (v_conversa, v_empresa, v_eu, NULLIF(TRIM(p_texto), ''),
            COALESCE(p_anexos, '[]'::JSONB), v_disparo)
    RETURNING id INTO v_msg;

    -- Nao aparecia: continua nao aparecendo, ate alguem responder. O gatilho
    -- nao desfaz isto porque nao mexe na linha de quem escreveu.
    IF NOT COALESCE(v_aparecia, FALSE) THEN
      UPDATE public.chat_participantes
         SET oculta_em = NOW()
       WHERE conversa_id = v_conversa AND perfil_id = v_eu;
    END IF;

    INSERT INTO public.chat_disparo_destinos (disparo_id, perfil_id, conversa_id, mensagem_id)
    VALUES (v_disparo, v_alvo, v_conversa, v_msg)
    ON CONFLICT DO NOTHING;

    v_enviados := v_enviados + 1;
  END LOOP;

  UPDATE public.chat_disparos SET total_destinos = v_enviados WHERE id = v_disparo;

  RETURN jsonb_build_object(
    'disparo_id', v_disparo,
    'enviados',   v_enviados,
    'pulados',    to_jsonb(v_pulados)
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) IS
  'Manda a mesma mensagem para varias pessoas em conversas 1:1. Quem nao pode '
  'receber e pulado e volta em `pulados`. Ver a migration 20260825220000.';

-- ── Quem eu posso escolher no disparo ───────────────────────────────────────
--
-- A telinha de selecao pede as pessoas ja agrupadas por setor e por equipe,
-- para "marcar o setor" marcar exatamente quem o banco deixaria receber. Se a
-- tela montasse essa lista por conta propria, marcar um setor incluiria gente
-- sem chat e o disparo sairia com pulados que ninguem entenderia.
--
-- Uma pessoa aparece uma vez por equipe/setor em que esta — clone aparece nos
-- dois, e e o certo: e assim que ela existe no sistema.

CREATE OR REPLACE FUNCTION public.fn_chat_contatos()
RETURNS TABLE (
  perfil_id   UUID,
  nome        TEXT,
  usuario     TEXT,
  foto_url    TEXT,
  cargo       TEXT,
  setor_id    UUID,
  setor_nome  TEXT,
  equipe_id   UUID,
  equipe_nome TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
         p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT,
         s.id, s.nome, e.id, e.nome
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id IN (
      SELECT q.equipe_id FROM public.fn_equipes_do_operador(p.id) q
    )
    LEFT JOIN public.setores s ON s.id = COALESCE(e.setor_id, p.setor_id)
   WHERE COALESCE(p.ativo, TRUE)
     -- Arquivado nao e o mesmo que inativo: e quem saiu e ficou no cadastro
     -- para o historico continuar fazendo sentido. Nao entra em lista de
     -- contato — mandar mensagem para ele seria escrever para ninguem.
     AND NOT COALESCE(p.arquivado, FALSE)
     AND p.id <> (SELECT auth.uid())
     AND public.fn_chat_alcanca(p.id)
   ORDER BY 7, 9, 2;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_contatos() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_contatos() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_contatos() IS
  'Com quem eu posso INICIAR conversa, agrupado por setor e equipe. Ja filtrado '
  'por alcance e por quem consegue receber — o que a tela marca, o banco aceita.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_disparos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_disparo_destinos  ENABLE ROW LEVEL SECURITY;

-- O disparo e de quem disparou. Quem recebe ve a MENSAGEM, na conversa dele,
-- como qualquer outra — e nao precisa saber que foi para mais dezenove.
DROP POLICY IF EXISTS chat_disparos_select ON public.chat_disparos;
CREATE POLICY chat_disparos_select ON public.chat_disparos FOR SELECT TO authenticated
USING (autor_id = (SELECT auth.uid()) AND public.fn_chat_pode_usar());

DROP POLICY IF EXISTS chat_disparo_destinos_select ON public.chat_disparo_destinos;
CREATE POLICY chat_disparo_destinos_select ON public.chat_disparo_destinos
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chat_disparos d
   WHERE d.id = disparo_id AND d.autor_id = (SELECT auth.uid())
));

-- Sem INSERT nem UPDATE por policy: quem escreve e `fn_chat_disparar`, que
-- confere alcance destino a destino.

GRANT SELECT ON public.chat_disparos         TO authenticated;
GRANT SELECT ON public.chat_disparo_destinos TO authenticated;

-- ── Tempo real ──────────────────────────────────────────────────────────────
--
-- `chat_participantes` ja esta na publicacao (migration anterior): e por ela
-- que a conversa APARECE na lista quando alguem responde o disparo — o UPDATE
-- que zera `oculta_em` chega como evento, e a lista se refaz sozinha.

ALTER TABLE public.chat_disparos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_disparos;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
