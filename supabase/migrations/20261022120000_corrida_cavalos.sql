-- Corrida de Cavalos (22/10/2026): a segunda categoria da Corrida da Sorte.
--
-- O super_admin monta a corrida escolhendo a categoria: «bichinhos» (a de
-- sempre) ou «cavalos». O resto do caminho é o mesmo — chamar, escolher, abrir
-- o lobby, gravar, largar, encerrar —, com as mesmas funções. O que muda:
--
--   • corridas.categoria  'bichinhos' | 'cavalos' (padrão: bichinhos; as
--     corridas antigas continuam bichinhos).
--   • A escolha: bichinho é 0 a 2 e repete (três estilos para todo mundo);
--     cavalo é 0 a 23 e tem UM dono só. Quem chega depois recebe
--     «CAVALO_TEM_DONO» e escolhe outro. A trava é a linha da corrida
--     (`FOR UPDATE`): duas escolhas da mesma corrida nunca correm juntas.
--   • Corrida de cavalos tem no máximo 24 corredores (são 24 cavalos).
--   • O sorteio de quem não escolheu (`fn_corrida_preencher`) e o cavalo do
--     corredor sem perfil saem só entre os cavalos livres.
--   • Quem corre ou assiste nunca lê «grav» na corrida de cavalos (regra do
--     Cleber: a corrida é aleatória; a palavra é que gera briga). Os erros que
--     chegam a eles falam em «preparada».
--
-- Não muda: as tabelas de pessoas e de divulgação, o realtime, o bucket, o
-- relógio, o palpite. A gravação dos cavalos usa o mesmo `fn_corrida_gravar`
-- (arquivo, mapa, semente, vencedor) — o arquivo leva as posições.
--
-- Reexecutável. Desfazer: ver o fim do arquivo.

BEGIN;

-- ── A categoria ────────────────────────────────────────────────────────────
ALTER TABLE public.corridas ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'bichinhos';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corridas_categoria_valida') THEN
    ALTER TABLE public.corridas ADD CONSTRAINT corridas_categoria_valida CHECK (categoria IN ('bichinhos', 'cavalos'));
  END IF;
END $$;

-- ── A escolha vai até o cavalo 23 ──────────────────────────────────────────
-- O CHECK antigo (0 a 2) nasceu na coluna, com o nome que o Postgres dá.
ALTER TABLE public.corrida_pessoas DROP CONSTRAINT IF EXISTS corrida_pessoas_escolha_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corrida_pessoas_escolha_faixa') THEN
    ALTER TABLE public.corrida_pessoas ADD CONSTRAINT corrida_pessoas_escolha_faixa CHECK (escolha BETWEEN 0 AND 23);
  END IF;
END $$;

-- ── O JSON da corrida leva a categoria ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_json(p_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'premio', c.premio, 'estado', c.estado, 'versao', c.versao, 'tema', c.tema,
    'categoria', c.categoria,
    'criada_em', c.criada_em, 'aberta_em', c.aberta_em, 'gravada_em', c.gravada_em,
    'inicia_em', c.inicia_em, 'encerrada_em', c.encerrada_em,
    'gravacao', c.gravacao, 'vencedor', c.vencedor, 'vencedor_nome', c.vencedor_nome,
    'corredores', (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.corre),
    'chamados',   (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id),
    'escolheram', (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.corre AND p.escolha IS NOT NULL),
    'no_lobby',   (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.entrou_em IS NOT NULL)
  )
  FROM public.corridas c
  WHERE c.id = p_id;
$function$;

-- ── Um cavalo sem dono, sorteado ───────────────────────────────────────────
-- Quem chama já segura a linha da corrida (FOR UPDATE). Nulo: os 24 têm dono.
CREATE OR REPLACE FUNCTION public.fn_corrida_cavalo_livre(p_corrida bigint)
RETURNS smallint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT h::smallint FROM generate_series(0, 23) h
   WHERE NOT EXISTS (SELECT 1 FROM public.corrida_pessoas p
                      WHERE p.corrida_id = p_corrida AND p.corre AND p.escolha = h)
   ORDER BY random() LIMIT 1;
$function$;

-- ── Escolher: bichinho repete; cavalo tem um dono só ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_escolher(p_corrida bigint, p_escolha smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu uuid := auth.uid();
  v_c  public.corridas%ROWTYPE;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  -- A trava da corrida: duas pessoas escolhendo o mesmo cavalo não passam juntas.
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF p_escolha IS NULL OR p_escolha < 0 OR p_escolha > (CASE WHEN v_c.categoria = 'cavalos' THEN 23 ELSE 2 END) THEN
    RAISE EXCEPTION 'ESCOLHA_INVALIDA' USING ERRCODE = '22023';
  END IF;
  IF NOT FOUND OR v_c.estado NOT IN ('preparando', 'aberta') OR v_c.gravada_em IS NOT NULL THEN
    IF v_c.categoria = 'cavalos' THEN
      RAISE EXCEPTION 'ESCOLHA_FECHADA: a largada já foi preparada; o cavalo ficou o que estava' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'ESCOLHA_FECHADA: a corrida já foi gravada; o bichinho ficou o que estava' USING ERRCODE = 'P0001';
  END IF;
  IF v_c.categoria = 'cavalos' AND EXISTS (
       SELECT 1 FROM public.corrida_pessoas
        WHERE corrida_id = p_corrida AND corre AND escolha = p_escolha AND usuario <> v_eu) THEN
    RAISE EXCEPTION 'CAVALO_TEM_DONO: outra pessoa pegou esse cavalo um instante antes; escolha outro' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.corrida_pessoas SET escolha = p_escolha, escolhida_em = clock_timestamp()
   WHERE corrida_id = p_corrida AND usuario = v_eu AND corre;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_CORRE: você não está nesta corrida' USING ERRCODE = '42501';
  END IF;
  -- Na corrida de cavalos, quem ainda está escolhendo precisa saber na hora
  -- que aquele cavalo saiu: a sala avisa já na fase de escolha.
  IF v_c.estado = 'aberta' OR v_c.categoria = 'cavalos' THEN
    PERFORM public.fn_corrida_avisar_sala(p_corrida, 'escolha', jsonb_build_object('usuario', v_eu, 'escolha', p_escolha));
  END IF;
  RETURN public.fn_corrida_minha_de(v_eu);
END;
$function$;

-- ── Sortear quem não escolheu ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_preencher(p_corrida bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c public.corridas%ROWTYPE;
  v_u uuid;
  v_avulso boolean;
  v_mudou boolean := FALSE;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF NOT FOUND OR v_c.estado NOT IN ('preparando', 'aberta') OR v_c.gravada_em IS NOT NULL THEN
    RAISE EXCEPTION 'NAO_DA: só preenche antes de gravar' USING ERRCODE = 'P0001';
  END IF;

  -- Um por um: no cavalo, cada sorteio tira o cavalo dos próximos.
  FOR v_u, v_avulso IN
    SELECT usuario, avulso FROM public.corrida_pessoas
     WHERE corrida_id = p_corrida AND corre AND escolha IS NULL
     ORDER BY random()
  LOOP
    UPDATE public.corrida_pessoas
       SET escolha = CASE WHEN v_c.categoria = 'cavalos' THEN public.fn_corrida_cavalo_livre(p_corrida)
                          ELSE floor(random() * 3)::smallint END,
           escolhida_em = clock_timestamp()
     WHERE corrida_id = p_corrida AND usuario = v_u;
    IF NOT v_avulso THEN PERFORM public.fn_corrida_avisar_pessoa(v_u); END IF;
    v_mudou := TRUE;
  END LOOP;
  IF v_mudou THEN
    PERFORM public.fn_corrida_avisar_sala(p_corrida, 'pessoas');
  END IF;
  RETURN public.fn_corrida_painel();
END;
$function$;

-- ── Quem corre e quem assiste: o corredor sem perfil ganha um cavalo livre ─
CREATE OR REPLACE FUNCTION public.fn_corrida_por_pessoas(p_corrida bigint, p_corredores uuid[], p_plateia uuid[], p_avulsos jsonb DEFAULT '[]'::jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_antes  uuid[];
  v_depois uuid[];
  v_ficam  uuid[];
  v_cat    text;
  v_u      uuid;
BEGIN
  SELECT categoria INTO v_cat FROM public.corridas WHERE id = p_corrida;

  -- Só quem tem perfil recebe aviso: os avulsos ficam fora da conta.
  SELECT coalesce(array_agg(usuario), '{}') INTO v_antes
    FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND NOT avulso;

  DELETE FROM public.corrida_pessoas
   WHERE corrida_id = p_corrida AND NOT avulso
     AND NOT (usuario = ANY (coalesce(p_corredores, '{}')) OR usuario = ANY (coalesce(p_plateia, '{}')));

  INSERT INTO public.corrida_pessoas AS cp (corrida_id, usuario, corre, assiste, nome, setor, foto)
  SELECT p_corrida, pf.id,
         pf.id = ANY (coalesce(p_corredores, '{}')),
         pf.id = ANY (coalesce(p_plateia, '{}')),
         coalesce(nullif(btrim(pf.nome), ''), 'Alguém'), nullif(btrim(s.nome), ''), nullif(btrim(pf.foto_url), '')
    FROM public.perfis pf
    LEFT JOIN public.setores s ON s.id = pf.setor_id
   WHERE pf.id = ANY (coalesce(p_corredores, '{}') || coalesce(p_plateia, '{}'))
  ON CONFLICT (corrida_id, usuario) DO UPDATE
     SET corre = EXCLUDED.corre, assiste = EXCLUDED.assiste,
         nome = EXCLUDED.nome, setor = EXCLUDED.setor, foto = EXCLUDED.foto,
         escolha = CASE WHEN EXCLUDED.corre THEN cp.escolha END
   WHERE NOT cp.avulso;

  -- Os avulsos: fica quem veio com o id de um avulso DESTA corrida; o resto sai.
  SELECT coalesce(array_agg(cp.usuario), '{}') INTO v_ficam
    FROM public.corrida_pessoas cp
   WHERE cp.corrida_id = p_corrida AND cp.avulso
     AND cp.usuario::text IN (SELECT a.id FROM jsonb_to_recordset(coalesce(p_avulsos, '[]'::jsonb)) AS a(id text, nome text, setor text));

  DELETE FROM public.corrida_pessoas
   WHERE corrida_id = p_corrida AND avulso AND NOT (usuario = ANY (v_ficam));

  -- Novo avulso já nasce com o bichinho sorteado: não tem tela para escolher.
  -- No cavalo, nasce sem e ganha um cavalo livre logo abaixo (um por vez).
  INSERT INTO public.corrida_pessoas AS cp (corrida_id, usuario, corre, assiste, nome, setor, foto, avulso, escolha, escolhida_em)
  SELECT p_corrida,
         -- Comparado como texto: um id que não é uuid vira avulso novo, sem erro.
         CASE WHEN a.id = ANY (v_ficam::text[]) THEN a.id::uuid ELSE gen_random_uuid() END,
         TRUE, FALSE, btrim(a.nome), btrim(a.setor), NULL, TRUE,
         CASE WHEN v_cat = 'cavalos' THEN NULL ELSE floor(random() * 3)::smallint END,
         CASE WHEN v_cat = 'cavalos' THEN NULL ELSE clock_timestamp() END
    FROM jsonb_to_recordset(coalesce(p_avulsos, '[]'::jsonb)) AS a(id text, nome text, setor text)
  ON CONFLICT (corrida_id, usuario) DO UPDATE
     SET nome = EXCLUDED.nome, setor = EXCLUDED.setor
   WHERE cp.avulso;

  IF v_cat = 'cavalos' THEN
    FOR v_u IN SELECT usuario FROM public.corrida_pessoas
                WHERE corrida_id = p_corrida AND avulso AND escolha IS NULL ORDER BY random() LOOP
      UPDATE public.corrida_pessoas
         SET escolha = public.fn_corrida_cavalo_livre(p_corrida), escolhida_em = clock_timestamp()
       WHERE corrida_id = p_corrida AND usuario = v_u;
    END LOOP;
  END IF;

  SELECT coalesce(array_agg(usuario), '{}') INTO v_depois
    FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND NOT avulso;
  -- Quem precisa de aviso pessoal: quem entrou ou saiu da lista.
  RETURN ARRAY(SELECT u FROM unnest(v_antes || v_depois) u
                GROUP BY u HAVING count(*) = 1);
END;
$function$;

-- ── Criar recebe a categoria ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb);

CREATE OR REPLACE FUNCTION public.fn_corrida_criar(p_nome text, p_premio text, p_corredores uuid[], p_plateia uuid[],
                                                   p_avulsos jsonb DEFAULT '[]'::jsonb, p_categoria text DEFAULT 'bichinhos')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id  bigint;
  v_u   uuid;
  v_n   int;
  v_cat text := coalesce(nullif(btrim(p_categoria), ''), 'bichinhos');
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  PERFORM public.fn_corrida_vencidas();
  IF v_cat NOT IN ('bichinhos', 'cavalos') THEN
    RAISE EXCEPTION 'CATEGORIA_INVALIDA: a corrida é de bichinhos ou de cavalos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.corridas WHERE estado IN ('preparando', 'aberta', 'correndo')) THEN
    RAISE EXCEPTION 'JA_TEM_UMA: termine ou cancele a corrida em andamento antes de criar outra' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(DISTINCT u) INTO v_n FROM unnest(coalesce(p_corredores, '{}')) u;
  v_n := v_n + public.fn_corrida_contar_avulsos(p_avulsos);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'POUCA_GENTE: a corrida precisa de pelo menos 2 pessoas correndo' USING ERRCODE = 'P0001';
  END IF;
  IF v_cat = 'cavalos' AND v_n > 24 THEN
    RAISE EXCEPTION 'GENTE_DEMAIS: a corrida de cavalos tem 24 cavalos; marque até 24 pessoas para correr' USING ERRCODE = 'P0001';
  END IF;
  IF v_n > 300 THEN
    RAISE EXCEPTION 'GENTE_DEMAIS: no máximo 300 pessoas correndo' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.corridas (nome, premio, criada_por, categoria)
  VALUES (coalesce(nullif(btrim(p_nome), ''), CASE WHEN v_cat = 'cavalos' THEN 'Corrida de Cavalos' ELSE 'Corrida da Sorte' END),
          nullif(btrim(p_premio), ''), auth.uid(), v_cat)
  RETURNING id INTO v_id;

  PERFORM public.fn_corrida_por_pessoas(v_id, p_corredores, p_plateia, p_avulsos);

  -- Só quem corre fica sabendo agora: é a vez de escolher o bichinho (ou o cavalo).
  FOR v_u IN SELECT usuario FROM public.corrida_pessoas WHERE corrida_id = v_id AND corre AND NOT avulso LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  RETURN public.fn_corrida_painel();
END;
$function$;

-- ── Ajustar respeita os 24 cavalos ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_ajustar(p_corrida bigint, p_premio text, p_corredores uuid[], p_plateia uuid[], p_avulsos jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c public.corridas%ROWTYPE;
  v_u uuid;
  v_n int;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF NOT FOUND OR v_c.estado NOT IN ('preparando', 'aberta') THEN
    RAISE EXCEPTION 'NAO_DA: a corrida já largou ou terminou' USING ERRCODE = 'P0001';
  END IF;
  IF v_c.gravada_em IS NOT NULL THEN
    RAISE EXCEPTION 'JA_GRAVADA: a corrida já foi gravada com essas pessoas e esse prêmio; descarte a gravação para mudar' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(DISTINCT u) INTO v_n FROM unnest(coalesce(p_corredores, '{}')) u;
  v_n := v_n + public.fn_corrida_contar_avulsos(p_avulsos);
  IF v_n < 2 OR v_n > 300 THEN
    RAISE EXCEPTION 'POUCA_GENTE: a corrida precisa de 2 a 300 pessoas correndo' USING ERRCODE = 'P0001';
  END IF;
  IF v_c.categoria = 'cavalos' AND v_n > 24 THEN
    RAISE EXCEPTION 'GENTE_DEMAIS: a corrida de cavalos tem 24 cavalos; marque até 24 pessoas para correr' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.corridas SET premio = nullif(btrim(p_premio), ''), versao = versao + 1 WHERE id = p_corrida;
  FOR v_u IN SELECT unnest(public.fn_corrida_por_pessoas(p_corrida, p_corredores, p_plateia, p_avulsos)) LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  -- Mudou o papel de quem já estava (passou a correr, por exemplo): o estado
  -- pessoal de todo mundo segue pela sala.
  PERFORM public.fn_corrida_avisar_sala(p_corrida, 'pessoas');
  RETURN public.fn_corrida_painel();
END;
$function$;

-- ── O painel mostra a categoria no histórico ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_painel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  -- A em andamento; senão, a última que terminou.
  SELECT id INTO v_id FROM public.corridas
   ORDER BY (estado IN ('preparando', 'aberta', 'correndo')) DESC, id DESC LIMIT 1;
  RETURN jsonb_build_object(
    'agora', clock_timestamp(),
    'corrida', CASE WHEN v_id IS NULL THEN NULL ELSE public.fn_corrida_json(v_id) END,
    'pessoas', coalesce((SELECT jsonb_agg(public.fn_corrida_pessoa_json(p) ORDER BY p.corre DESC, p.nome)
                           FROM public.corrida_pessoas p WHERE p.corrida_id = v_id), '[]'::jsonb),
    'historico', coalesce((SELECT jsonb_agg(h ORDER BY (h->>'id')::bigint DESC) FROM (
                             SELECT jsonb_build_object('id', c.id, 'nome', c.nome, 'premio', c.premio, 'estado', c.estado, 'categoria', c.categoria,
                                                       'criada_em', c.criada_em, 'vencedor_nome', c.vencedor_nome) h
                               FROM public.corridas c ORDER BY c.id DESC LIMIT 8) x), '[]'::jsonb),
    'divulgacoes', coalesce((SELECT jsonb_agg(x.j ORDER BY x.id DESC) FROM (
                               SELECT d.id, jsonb_build_object('id', d.id, 'titulo', d.titulo, 'categoria', d.categoria, 'criada_em', d.criada_em, 'expira_em', d.expira_em,
                                        'alvos', (SELECT count(*) FROM public.corrida_divulgacao_alvos a WHERE a.divulgacao_id = d.id),
                                        'fecharam', (SELECT count(*) FROM public.corrida_divulgacao_alvos a WHERE a.divulgacao_id = d.id AND a.fechado_em IS NOT NULL)) j
                                 FROM public.corrida_divulgacoes d ORDER BY d.id DESC LIMIT 5) x), '[]'::jsonb)
  );
END;
$function$;

-- ── O card de divulgação também tem categoria (o tema do card) ─────────────
ALTER TABLE public.corrida_divulgacoes ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'bichinhos';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corrida_divulgacoes_categoria_valida') THEN
    ALTER TABLE public.corrida_divulgacoes ADD CONSTRAINT corrida_divulgacoes_categoria_valida CHECK (categoria IN ('bichinhos', 'cavalos'));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_corrida_divulgar(text, text, text, uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_corrida_divulgar(p_titulo text, p_mensagem text, p_premio text, p_alvos uuid[],
                                                      p_dias integer DEFAULT 3, p_categoria text DEFAULT 'bichinhos')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id  bigint;
  v_u   uuid;
  v_cat text := coalesce(nullif(btrim(p_categoria), ''), 'bichinhos');
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  IF v_cat NOT IN ('bichinhos', 'cavalos') THEN
    RAISE EXCEPTION 'CATEGORIA_INVALIDA: o card é da corrida de bichinhos ou da de cavalos' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_alvos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'SEM_ALVO: escolha quem vai ver o card' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.corrida_divulgacoes (titulo, mensagem, premio, criada_por, expira_em, categoria)
  VALUES (btrim(p_titulo), btrim(p_mensagem), nullif(btrim(p_premio), ''), auth.uid(),
          clock_timestamp() + make_interval(days => least(greatest(coalesce(p_dias, 3), 1), 30)), v_cat)
  RETURNING id INTO v_id;
  INSERT INTO public.corrida_divulgacao_alvos (divulgacao_id, usuario)
  SELECT v_id, pf.id FROM public.perfis pf WHERE pf.id = ANY (p_alvos)
  ON CONFLICT DO NOTHING;
  FOR v_u IN SELECT usuario FROM public.corrida_divulgacao_alvos WHERE divulgacao_id = v_id LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  RETURN public.fn_corrida_painel();
END;
$function$;

-- O estado de cada pessoa: o card chega com a categoria (o resto é igual a 20261020130000).
CREATE OR REPLACE FUNCTION public.fn_corrida_minha_de(p_usuario uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c   public.corridas%ROWTYPE;
  v_p   public.corrida_pessoas%ROWTYPE;
  v_div jsonb;
BEGIN
  SELECT c.* INTO v_c
    FROM public.corridas c
    JOIN public.corrida_pessoas p ON p.corrida_id = c.id AND p.usuario = p_usuario
   WHERE (c.estado IN ('aberta', 'correndo') OR (c.estado = 'preparando' AND p.corre)
          OR (c.estado = 'encerrada' AND c.encerrada_em > clock_timestamp() - interval '15 minutes'))
   ORDER BY c.id DESC
   LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_p FROM public.corrida_pessoas WHERE corrida_id = v_c.id AND usuario = p_usuario;
  END IF;

  SELECT jsonb_build_object('id', d.id, 'titulo', d.titulo, 'mensagem', d.mensagem, 'premio', d.premio, 'criada_em', d.criada_em,
                            'categoria', d.categoria)
    INTO v_div
    FROM public.corrida_divulgacao_alvos a
    JOIN public.corrida_divulgacoes d ON d.id = a.divulgacao_id
   WHERE a.usuario = p_usuario AND a.fechado_em IS NULL AND d.expira_em > clock_timestamp()
   ORDER BY d.id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'agora', clock_timestamp(),
    'corrida', CASE WHEN v_c.id IS NULL THEN NULL ELSE public.fn_corrida_json(v_c.id) END,
    'eu', CASE WHEN v_c.id IS NULL THEN NULL ELSE public.fn_corrida_pessoa_json(v_p) END,
    'divulgacao', v_div
  );
END;
$function$;

-- ── Permissões ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_corrida_divulgar(text, text, text, uuid[], integer, text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_divulgar(text, text, text, uuid[], integer, text)  TO authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_minha_de(uuid)                                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_cavalo_livre(bigint)                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_por_pessoas(bigint, uuid[], uuid[], jsonb)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_ajustar(bigint, text, uuid[], uuid[], jsonb)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_escolher(bigint, smallint)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_preencher(bigint)                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_ajustar(bigint, text, uuid[], uuid[], jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_escolher(bigint, smallint)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_preencher(bigint)                                  TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'corridas' AND column_name = 'categoria') THEN
    RAISE EXCEPTION 'corridas.categoria não foi criada';
  END IF;
  IF to_regprocedure('public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb, text)') IS NULL THEN
    RAISE EXCEPTION 'fn_corrida_criar com a categoria não existe';
  END IF;
  IF to_regprocedure('public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'sobrou o fn_corrida_criar antigo: a chamada ficaria ambígua';
  END IF;
  IF to_regprocedure('public.fn_corrida_cavalo_livre(bigint)') IS NULL THEN
    RAISE EXCEPTION 'fn_corrida_cavalo_livre não existe';
  END IF;
  IF to_regprocedure('public.fn_corrida_divulgar(text, text, text, uuid[], integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'sobrou o fn_corrida_divulgar antigo: a chamada ficaria ambígua';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'corrida_divulgacoes' AND column_name = 'categoria') THEN
    RAISE EXCEPTION 'corrida_divulgacoes.categoria não foi criada';
  END IF;
END
$prova$;

COMMIT;

-- Desfazer (com o dono do banco na sala; só se nenhuma corrida de cavalos existir):
-- DROP FUNCTION IF EXISTS public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb, text);
--   e reaplicar fn_corrida_criar/ajustar/por_pessoas de 20261021120000, fn_corrida_escolher
--   de 20261020130000, fn_corrida_preencher de 20261020200000 e fn_corrida_json de 20261020210000;
-- DROP FUNCTION IF EXISTS public.fn_corrida_divulgar(text, text, text, uuid[], integer, text);
--   e reaplicar fn_corrida_divulgar e fn_corrida_minha_de de 20261020130000;
-- ALTER TABLE public.corrida_divulgacoes DROP CONSTRAINT IF EXISTS corrida_divulgacoes_categoria_valida;
-- ALTER TABLE public.corrida_divulgacoes DROP COLUMN IF EXISTS categoria;
-- DROP FUNCTION IF EXISTS public.fn_corrida_cavalo_livre(bigint);
-- ALTER TABLE public.corrida_pessoas DROP CONSTRAINT IF EXISTS corrida_pessoas_escolha_faixa;
-- ALTER TABLE public.corrida_pessoas ADD CONSTRAINT corrida_pessoas_escolha_check CHECK (escolha BETWEEN 0 AND 2);
-- ALTER TABLE public.corridas DROP CONSTRAINT IF EXISTS corridas_categoria_valida;
-- ALTER TABLE public.corridas DROP COLUMN IF EXISTS categoria;
