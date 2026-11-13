-- ============================================================================
-- Natal: os quebra-nozes (o diretor e o head da cidade no pé da janela)
-- ============================================================================
--
-- Pedido do Cleber, 12/11/2026. O diretor Anderson e o head da cidade (Jessica
-- em Birigui, Robson em Marília) aparecem como quebra-nozes para a cidade
-- inteira ao mesmo tempo: umas três aparições por dia, de segunda a sexta, e
-- às 10h a chamada dos destaques de ontem, um por setor. A agenda é sorteada
-- no navegador com semente (`src/components/Natal/quebraNozes/agenda.ts`): o
-- banco só guarda os interruptores, a chamada feita na hora, e responde quem
-- são os destaques.
--
-- ## A configuração
--
--   natal_quebra_nozes   uma linha só. Sobe DESLIGADA: o super_admin liga pelo
--                        card de Configurações › Geral.
--                          automaticas   as aparições sorteadas do dia
--                          chamada_10h   a chamada dos destaques, às 10h
--                          sons          os sons do espetáculo (cada pessoa
--                                        ainda pode calar os dela)
--                          chamada_*     a chamada feita na hora pelo card:
--                                        quando começa, o tipo, a cidade e o
--                                        número (a semente do sorteio)
--
-- Mudou a linha, um Broadcast no tópico `permissoes:<empresa>` de todas as
-- empresas, que todo mundo logado já escuta (mesmo molde de `natal_liberacao`,
-- 20261109150000). A chamada na hora marca o começo 15 s à frente: dá tempo de
-- o sinal chegar e todos começarem juntos.
--
-- ## Os destaques
--
--   natal_quebra_nozes_destaques   o resultado do dia, por cidade: calculado
--                                  uma vez (o primeiro que pergunta) e lido
--                                  pelos outros.
--
-- O destaque de um setor é o mesmo da cena «Destaque» do Modo TV: quem mais
-- recebeu no dia, pelo analítico (`fn_tv_numeros_calcular`, escopo `setor`).
-- «Ontem» é o último dia antes de hoje com recebimento em algum setor da
-- cidade, dentro do mês: na segunda-feira é a sexta. No primeiro dia útil do
-- mês não há «ontem» no mês, e a chamada vira uma aparição comum. O valor não
-- sai daqui: só o setor, o nome e a foto.
--
-- ## As fotos
--
-- A foto de cada boneco é a do perfil, lida a cada aparição. O operador não
-- enxerga o perfil da diretoria (`perfis_select`), então a leitura passa por
-- `fn_natal_quebra_nozes_elenco`: os perfis de cargo Diretoria, ativos, cujo
-- primeiro nome é Anderson, Jessica ou Robson. Devolve só a foto.
--
-- ## Funções (todas para `authenticated`)
--
--   fn_natal_quebra_nozes_configurar(p_automaticas, p_chamada_10h, p_sons)
--                                         só o super_admin; NULL = não mexe.
--   fn_natal_quebra_nozes_chamar(p_tipo, p_cidade)
--                                         só o super_admin; 'aparicao' |
--                                         'parabens', 'birigui' | 'marilia' |
--                                         'todas'. Uma a cada 90 s.
--   fn_natal_quebra_nozes_elenco()        a cidade de quem pergunta e as fotos.
--   fn_natal_quebra_nozes_destaques(p_cidade)
--                                         os destaques da cidade de quem
--                                         pergunta (`p_cidade` só vale para o
--                                         super_admin, para conferir).
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── A configuração ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_quebra_nozes (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  automaticas         BOOLEAN NOT NULL DEFAULT FALSE,
  chamada_10h         BOOLEAN NOT NULL DEFAULT FALSE,
  sons                BOOLEAN NOT NULL DEFAULT TRUE,
  chamada_em          TIMESTAMPTZ,
  chamada_tipo        TEXT CHECK (chamada_tipo IN ('aparicao', 'parabens')),
  chamada_cidade      TEXT CHECK (chamada_cidade IN ('birigui', 'marilia', 'todas')),
  chamada_numero      INTEGER NOT NULL DEFAULT 0,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por_nome TEXT
);

COMMENT ON TABLE public.natal_quebra_nozes IS
  'Uma linha: os interruptores dos quebra-nozes do Natal e a chamada feita na hora. '
  'Escrita só por fn_natal_quebra_nozes_configurar e fn_natal_quebra_nozes_chamar (super_admin). Ver 20261112180100.';

INSERT INTO public.natal_quebra_nozes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.natal_quebra_nozes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS natal_quebra_nozes_leitura ON public.natal_quebra_nozes;
CREATE POLICY natal_quebra_nozes_leitura ON public.natal_quebra_nozes
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.natal_quebra_nozes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.natal_quebra_nozes TO authenticated;
GRANT ALL    ON public.natal_quebra_nozes TO service_role;

-- Mudou: avisa quem está logado em todas as empresas.
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(
      jsonb_build_object('tabela', 'natal_quebra_nozes', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_natal_quebra_nozes_avisar ON public.natal_quebra_nozes;
CREATE TRIGGER trg_natal_quebra_nozes_avisar
  AFTER UPDATE ON public.natal_quebra_nozes
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_natal_quebra_nozes_avisar();

CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_configurar(
  p_automaticas BOOLEAN DEFAULT NULL,
  p_chamada_10h BOOLEAN DEFAULT NULL,
  p_sons        BOOLEAN DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_atual public.natal_quebra_nozes%ROWTYPE;
  v_nome  text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura os quebra-nozes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_atual FROM public.natal_quebra_nozes WHERE id = 1;

  -- Nada mudou: não escreve (o gatilho é por comando e avisaria todo mundo à toa).
  IF COALESCE(p_automaticas, v_atual.automaticas) = v_atual.automaticas
     AND COALESCE(p_chamada_10h, v_atual.chamada_10h) = v_atual.chamada_10h
     AND COALESCE(p_sons, v_atual.sons) = v_atual.sons THEN
    RETURN;
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.natal_quebra_nozes
     SET automaticas         = COALESCE(p_automaticas, automaticas),
         chamada_10h         = COALESCE(p_chamada_10h, chamada_10h),
         sons                = COALESCE(p_sons, sons),
         atualizado_em       = now(),
         atualizado_por_nome = v_nome
   WHERE id = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_configurar(BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_configurar(BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- A chamada na hora: começa 15 s à frente, para o sinal chegar e todos começarem juntos.
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_chamar(p_tipo TEXT, p_cidade TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ultima timestamptz;
  v_em     timestamptz := now() + INTERVAL '15 seconds';
  v_nome   text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin chama os quebra-nozes' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('aparicao', 'parabens') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_cidade IS NULL OR p_cidade NOT IN ('birigui', 'marilia', 'todas') THEN
    RAISE EXCEPTION 'CIDADE_INVALIDA: %', p_cidade USING ERRCODE = '22023';
  END IF;

  SELECT q.chamada_em INTO v_ultima FROM public.natal_quebra_nozes q WHERE q.id = 1;
  IF v_ultima IS NOT NULL AND v_ultima > now() - INTERVAL '90 seconds' THEN
    RAISE EXCEPTION 'JA_TEM_CHAMADA: espere a chamada anterior terminar' USING ERRCODE = '55000';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.natal_quebra_nozes
     SET chamada_em          = v_em,
         chamada_tipo        = p_tipo,
         chamada_cidade      = p_cidade,
         chamada_numero      = chamada_numero + 1,
         atualizado_em       = now(),
         atualizado_por_nome = v_nome
   WHERE id = 1;
  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_chamar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_chamar(TEXT, TEXT) TO authenticated;

-- ── As fotos ───────────────────────────────────────────────────────────────
-- SQL, não plpgsql: o corpo é conferido já na criação.
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_elenco()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'cidade', public.fn_natal_cidade_de(auth.uid()),
    'fotos',  COALESCE((
      SELECT jsonb_object_agg(x.quem, x.foto_url)
        FROM (
          SELECT DISTINCT ON (n.quem) n.quem, btrim(p.foto_url) AS foto_url
            FROM (VALUES ('anderson'), ('jessica'), ('robson')) AS n(quem)
            JOIN public.perfis p
              ON split_part(
                   translate(lower(btrim(p.nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
                   ' ', 1) = n.quem
           WHERE p.perfil::text = 'diretoria'
             AND p.ativo
             AND NOT COALESCE(p.arquivado, FALSE)
             AND NULLIF(btrim(p.foto_url), '') IS NOT NULL
           ORDER BY n.quem, p.id
        ) x
    ), '{}'::jsonb)
  ) END
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_elenco() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_elenco() TO authenticated;

-- ── Os destaques ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_quebra_nozes_destaques (
  cidade        TEXT NOT NULL CHECK (cidade IN ('birigui', 'marilia')),
  -- O dia em que foi calculado (hoje, em Brasília): vale até a meia-noite.
  calculado_dia DATE NOT NULL,
  -- O dia dos destaques («ontem»); NULL = não havia dia anterior com recebimento no mês.
  dia           DATE,
  -- [{setor_id, setor, nome, foto}]
  dados         JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cidade, calculado_dia)
);

COMMENT ON TABLE public.natal_quebra_nozes_destaques IS
  'Os destaques de ontem por cidade, calculados uma vez por dia por fn_natal_quebra_nozes_destaques. Ver 20261112180100.';

ALTER TABLE public.natal_quebra_nozes_destaques ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.natal_quebra_nozes_destaques FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.natal_quebra_nozes_destaques TO service_role;

CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_destaques(p_cidade TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
SET statement_timeout TO '45s'
AS $function$
DECLARE
  v_hoje   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_cidade TEXT;
  v_cache  public.natal_quebra_nozes_destaques%ROWTYPE;
  v_setor  RECORD;
  v_pacote JSONB;
  v_linhas JSONB := '[]'::JSONB;
  v_dia    DATE;
  v_dados  JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  v_cidade := CASE
    WHEN p_cidade IN ('birigui', 'marilia') AND public.fn_user_is_super_admin() THEN p_cidade
    ELSE public.fn_natal_cidade_de(auth.uid())
  END;
  IF v_cidade IS NULL OR v_cidade NOT IN ('birigui', 'marilia') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cache FROM public.natal_quebra_nozes_destaques d
   WHERE d.cidade = v_cidade AND d.calculado_dia = v_hoje;
  IF v_cache.cidade IS NOT NULL THEN
    RETURN jsonb_build_object('pronto', TRUE, 'dia', v_cache.dia, 'destaques', v_cache.dados);
  END IF;

  -- Outro está calculando agora: quem pergunta tenta de novo daqui a pouco.
  IF NOT pg_try_advisory_xact_lock(hashtext('natal_quebra_nozes_destaques:' || v_cidade)) THEN
    RETURN jsonb_build_object('pronto', FALSE);
  END IF;

  SELECT * INTO v_cache FROM public.natal_quebra_nozes_destaques d
   WHERE d.cidade = v_cidade AND d.calculado_dia = v_hoje;
  IF v_cache.cidade IS NOT NULL THEN
    RETURN jsonb_build_object('pronto', TRUE, 'dia', v_cache.dia, 'destaques', v_cache.dados);
  END IF;

  -- O 1º de cada dia em cada setor da cidade, como a cena «Destaque» do Modo TV.
  FOR v_setor IN
    SELECT s.id, s.nome
      FROM public.setores s
      JOIN public.rh_celulas c ON c.id = s.cidade_id
     WHERE translate(lower(btrim(c.nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = v_cidade
       AND s.excluido_em IS NULL
     ORDER BY s.nome
  LOOP
    BEGIN
      v_pacote := public.fn_tv_numeros_calcular(v_setor.id, NULL);
    EXCEPTION WHEN OTHERS THEN
      -- Um setor que não calcula não derruba a chamada dos outros.
      v_pacote := NULL;
    END;

    v_linhas := v_linhas || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'setor_id', v_setor.id, 'setor', v_setor.nome,
               'dia', d.item ->> 'dia', 'nome', d.item ->> 'nome', 'foto', d.item ->> 'foto'))
        FROM jsonb_array_elements(COALESCE(v_pacote -> 'destaques', '[]'::JSONB)) AS d(item)
       WHERE d.item ->> 'escopo' = 'setor'
         AND d.item ->> 'dia' ~ '^\d{4}-\d{2}-\d{2}$'
         AND (d.item ->> 'dia')::DATE < v_hoje
    ), '[]'::JSONB);
  END LOOP;

  SELECT MAX((l.item ->> 'dia')::DATE) INTO v_dia
    FROM jsonb_array_elements(v_linhas) AS l(item);

  SELECT COALESCE(jsonb_agg(l.item - 'dia' ORDER BY l.item ->> 'setor'), '[]'::JSONB) INTO v_dados
    FROM jsonb_array_elements(v_linhas) AS l(item)
   WHERE (l.item ->> 'dia')::DATE = v_dia;

  INSERT INTO public.natal_quebra_nozes_destaques (cidade, calculado_dia, dia, dados)
  VALUES (v_cidade, v_hoje, v_dia, v_dados)
  ON CONFLICT (cidade, calculado_dia) DO NOTHING;

  -- Os dias que já passaram não servem mais.
  DELETE FROM public.natal_quebra_nozes_destaques d WHERE d.calculado_dia < v_hoje - 7;

  RETURN jsonb_build_object('pronto', TRUE, 'dia', v_dia, 'destaques', v_dados);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_destaques(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_destaques(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_natal_quebra_nozes_destaques(TEXT) IS
  'Os destaques de ontem (quem mais recebeu em cada setor, como no Modo TV) da cidade de quem pergunta. '
  'Calcula uma vez por dia e guarda em natal_quebra_nozes_destaques. Ver 20261112180100.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.natal_quebra_nozes') IS NULL OR to_regclass('public.natal_quebra_nozes_destaques') IS NULL THEN
    RAISE EXCEPTION 'as tabelas dos quebra-nozes não foram criadas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.natal_quebra_nozes WHERE id = 1) THEN
    RAISE EXCEPTION 'a linha de configuração dos quebra-nozes não existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_natal_quebra_nozes_avisar' AND tgrelid = 'public.natal_quebra_nozes'::regclass) THEN
    RAISE EXCEPTION 'trg_natal_quebra_nozes_avisar ausente';
  END IF;
  IF to_regprocedure('public.fn_tv_numeros_calcular(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_tv_numeros_calcular(uuid, uuid) não existe: os destaques dependem dela';
  END IF;
  IF to_regprocedure('public.fn_natal_cidade_de(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_natal_cidade_de(uuid) não existe (20261109150000)';
  END IF;
END
$prova$;

COMMIT;
