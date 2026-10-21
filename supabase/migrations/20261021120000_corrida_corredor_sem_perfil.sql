-- ============================================================================
-- Corrida da Sorte: corredor sem perfil no sistema — 21/10/2026
-- ============================================================================
--
-- Pedido do Cleber: ao montar a corrida, poder pôr para correr alguém que não
-- tem perfil no sistema — digita o nome («João») e o setor, e aparece um
-- bichinho para ele no grid.
--
-- Quem não tem perfil não tem tela: não escolhe bichinho, não entra no lobby,
-- não recebe aviso e não aposta. Então:
--
--   - a linha em `corrida_pessoas` ganha `avulso = true`, com um id próprio
--     (gen_random_uuid) no lugar do perfil; só corre, nunca assiste;
--   - o bichinho é sorteado na hora em que ele entra na corrida — ele já vai
--     para o grid, e «Preencher quem não escolheu» nunca o espera;
--   - nenhum aviso pessoal (`corrida-eu:`) sai para ele;
--   - o setor é digitado (obrigatório): é ele que aparece na festa.
--
-- `fn_corrida_criar` e `fn_corrida_ajustar` ganham `p_avulsos jsonb`: a lista
-- inteira dos corredores sem perfil, `[{ "id"?, "nome", "setor" }]`. Quem vem
-- com o `id` de um avulso desta corrida fica (e guarda o bichinho); quem vem
-- sem `id` é novo; quem não vem sai. O padrão é `[]`, então a chamada antiga
-- (sem o parâmetro) continua funcionando.
--
-- Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.corrida_pessoas ADD COLUMN IF NOT EXISTS avulso BOOLEAN NOT NULL DEFAULT FALSE;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corrida_pessoas_avulso_so_corre') THEN
    ALTER TABLE public.corrida_pessoas
      ADD CONSTRAINT corrida_pessoas_avulso_so_corre CHECK (NOT avulso OR (corre AND NOT assiste));
  END IF;
END;
$chk$;

COMMENT ON COLUMN public.corrida_pessoas.avulso IS
  'Corrida da Sorte: corredor sem perfil no sistema (nome e setor digitados pelo super_admin); `usuario` é um id próprio, não um perfil. Ver 20261021120000.';

-- ── O JSON de cada pessoa leva o «avulso» ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_pessoa_json(p public.corrida_pessoas)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'usuario', p.usuario, 'nome', p.nome, 'setor', p.setor, 'foto', p.foto,
    'corre', p.corre, 'assiste', p.assiste, 'escolha', p.escolha, 'entrou_em', p.entrou_em,
    'palpite', p.palpite, 'avulso', p.avulso
  );
$function$;

-- ── Quantos avulsos válidos vieram (e a recusa do que não presta) ──────────
CREATE OR REPLACE FUNCTION public.fn_corrida_contar_avulsos(p_avulsos jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_n int := 0;
  v_a record;
BEGIN
  IF p_avulsos IS NULL OR jsonb_typeof(p_avulsos) = 'null' THEN
    RETURN 0;
  END IF;
  IF jsonb_typeof(p_avulsos) <> 'array' THEN
    RAISE EXCEPTION 'AVULSO_INVALIDO: a lista de corredores sem perfil veio em formato errado' USING ERRCODE = '22023';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_to_recordset(p_avulsos) AS a(id text, nome text, setor text) LOOP
    IF coalesce(length(btrim(v_a.nome)), 0) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'AVULSO_INVALIDO: o corredor sem perfil precisa de um nome (até 40 letras)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(btrim(v_a.setor)), 0) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'AVULSO_INVALIDO: % precisa do nome do setor', btrim(v_a.nome) USING ERRCODE = '22023';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- ── Quem está na corrida: perfis do cadastro + corredores sem perfil ───────
DROP FUNCTION IF EXISTS public.fn_corrida_por_pessoas(bigint, uuid[], uuid[]);

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
BEGIN
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
  INSERT INTO public.corrida_pessoas AS cp (corrida_id, usuario, corre, assiste, nome, setor, foto, avulso, escolha, escolhida_em)
  SELECT p_corrida,
         -- Comparado como texto: um id que não é uuid vira avulso novo, sem erro.
         CASE WHEN a.id = ANY (v_ficam::text[]) THEN a.id::uuid ELSE gen_random_uuid() END,
         TRUE, FALSE, btrim(a.nome), btrim(a.setor), NULL, TRUE,
         floor(random() * 3)::smallint, clock_timestamp()
    FROM jsonb_to_recordset(coalesce(p_avulsos, '[]'::jsonb)) AS a(id text, nome text, setor text)
  ON CONFLICT (corrida_id, usuario) DO UPDATE
     SET nome = EXCLUDED.nome, setor = EXCLUDED.setor
   WHERE cp.avulso;

  SELECT coalesce(array_agg(usuario), '{}') INTO v_depois
    FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND NOT avulso;
  -- Quem precisa de aviso pessoal: quem entrou ou saiu da lista.
  RETURN ARRAY(SELECT u FROM unnest(v_antes || v_depois) u
                GROUP BY u HAVING count(*) = 1);
END;
$function$;

-- ── Criar e ajustar recebem os avulsos ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_corrida_criar(text, text, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.fn_corrida_criar(p_nome text, p_premio text, p_corredores uuid[], p_plateia uuid[], p_avulsos jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
  v_u  uuid;
  v_n  int;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  PERFORM public.fn_corrida_vencidas();
  IF EXISTS (SELECT 1 FROM public.corridas WHERE estado IN ('preparando', 'aberta', 'correndo')) THEN
    RAISE EXCEPTION 'JA_TEM_UMA: termine ou cancele a corrida em andamento antes de criar outra' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(DISTINCT u) INTO v_n FROM unnest(coalesce(p_corredores, '{}')) u;
  v_n := v_n + public.fn_corrida_contar_avulsos(p_avulsos);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'POUCA_GENTE: a corrida precisa de pelo menos 2 pessoas correndo' USING ERRCODE = 'P0001';
  END IF;
  IF v_n > 300 THEN
    RAISE EXCEPTION 'GENTE_DEMAIS: no máximo 300 pessoas correndo' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.corridas (nome, premio, criada_por)
  VALUES (coalesce(nullif(btrim(p_nome), ''), 'Corrida da Sorte'), nullif(btrim(p_premio), ''), auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.fn_corrida_por_pessoas(v_id, p_corredores, p_plateia, p_avulsos);

  -- Só quem corre fica sabendo agora: é a vez de escolher o bichinho.
  FOR v_u IN SELECT usuario FROM public.corrida_pessoas WHERE corrida_id = v_id AND corre AND NOT avulso LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  RETURN public.fn_corrida_painel();
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_corrida_ajustar(bigint, text, uuid[], uuid[]);

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

-- ── Abrir e encerrar não avisam quem não tem tela ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_abrir(p_corrida bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_u uuid;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  UPDATE public.corridas SET estado = 'aberta', aberta_em = clock_timestamp(), versao = versao + 1
   WHERE id = p_corrida AND estado = 'preparando';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_DA: só abre uma corrida em preparação' USING ERRCODE = 'P0001';
  END IF;
  -- O card «Assistir» chega para todo mundo que foi chamado.
  FOR v_u IN SELECT usuario FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND NOT avulso LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  PERFORM public.fn_corrida_avisar_sala(p_corrida, 'estado');
  RETURN public.fn_corrida_painel();
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_corrida_encerrar(p_corrida bigint, p_cancelar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c public.corridas%ROWTYPE;
  v_u uuid;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF NOT FOUND OR v_c.estado NOT IN ('preparando', 'aberta', 'correndo') THEN
    RAISE EXCEPTION 'NAO_DA: a corrida já terminou' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.corridas
     SET estado = CASE WHEN p_cancelar OR v_c.estado <> 'correndo' THEN 'cancelada' ELSE 'encerrada' END,
         encerrada_em = clock_timestamp(), versao = versao + 1
   WHERE id = p_corrida;
  PERFORM public.fn_corrida_avisar_sala(p_corrida, 'estado');
  -- Cancelada antes de abrir: só quem corre sabia dela (e não ouve a sala sem ter aberto o app nela).
  FOR v_u IN SELECT usuario FROM public.corrida_pessoas
              WHERE corrida_id = p_corrida AND NOT avulso AND (corre OR v_c.estado <> 'preparando') LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  RETURN public.fn_corrida_painel();
END;
$function$;

-- ── Permissões ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_corrida_contar_avulsos(jsonb)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_por_pessoas(bigint, uuid[], uuid[], jsonb)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_ajustar(bigint, text, uuid[], uuid[], jsonb)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_ajustar(bigint, text, uuid[], uuid[], jsonb) TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'corrida_pessoas' AND column_name = 'avulso') THEN
    RAISE EXCEPTION 'corrida avulso: faltou a coluna';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_corrida_por_pessoas(bigint, uuid[], uuid[], jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'corrida avulso: função interna aberta demais';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_corrida_criar(text, text, uuid[], uuid[], jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_corrida_ajustar(bigint, text, uuid[], uuid[], jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'corrida avulso: criar/ajustar sem permissão';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- Reaplique as definições de fn_corrida_criar, fn_corrida_ajustar,
-- fn_corrida_por_pessoas, fn_corrida_abrir e fn_corrida_encerrar de
-- 20261020130000 (com DROP das versões com p_avulsos antes), e a de
-- fn_corrida_pessoa_json de 20261020210000; depois:
-- DROP FUNCTION IF EXISTS public.fn_corrida_contar_avulsos(jsonb);
-- ALTER TABLE public.corrida_pessoas DROP CONSTRAINT IF EXISTS corrida_pessoas_avulso_so_corre;
-- ALTER TABLE public.corrida_pessoas DROP COLUMN IF EXISTS avulso;
