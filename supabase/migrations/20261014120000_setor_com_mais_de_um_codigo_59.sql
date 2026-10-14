-- ─────────────────────────────────────────────────────────────────────────────
-- Um setor pode ter mais de um código do 59
--
-- ── O pedido (Cleber, 14/10/2026) ────────────────────────────────────────────
-- «O setor do Play 4 não existe mais, ele virou o Play Mix: juntou o pessoal do
-- Play Mix com o pessoal que era do Play 4. Todo recebimento que venha com o
-- nome do Play 4 pelo relatório 59 conta para o Play Mix Marília.»
--
-- O 59 continua trazendo a carteira do Play 4 com o código dela (38, pelo
-- registro de 20260910190216), e o Play Mix Marília tem o seu (79). Até aqui um
-- setor guardava UM código (`setores.codigo_erp`), então não havia como as duas
-- carteiras caírem no mesmo setor.
--
-- ── O desenho ────────────────────────────────────────────────────────────────
-- `setores.codigos_erp_extras` guarda os códigos ALÉM do principal. O principal
-- continua em `codigo_erp`, com o índice único de sempre — nada que lê a coluna
-- muda. A regra que importa continua valendo: um código pertence a UM setor só.
-- O que muda é que um setor pode reivindicar mais de um.
--
-- Na aba Códigos (Painel Diretoria) o campo aceita a lista separada por
-- vírgula: «79, 38». O primeiro é o principal.
--
-- Mexe em quatro funções, e só nelas — são as únicas que leem `codigo_erp`
-- (conferido por busca em todas as migrations):
--
--   • fn_setor_codigo_erp_so_super_admin — a trava vale para a coluna nova;
--   • fn_mestre_grupo_herda_setor        — carteira nova acha o setor por
--                                          qualquer um dos códigos;
--   • fn_setor_definir_codigo_erp        — recebe a lista, solta o que saiu e
--                                          amarra o que entrou;
--   • fn_setores_codigos_erp             — a aba mostra a lista e as carteiras.
--
-- A assinatura e o retorno das duas RPCs da tela ficam IGUAIS: `codigo_erp`
-- volta como texto («79, 38») e `carteira`/`desvinculou` juntam os nomes com
-- « / ». Tela antiga aberta continua funcionando com um código só.
--
-- ── Como o dinheiro muda de setor ────────────────────────────────────────────
-- O analítico não lê o código: lê `mestre_grupos.setor_id`, que o código
-- preenche. Quando a carteira 38 passa a apontar para o Play Mix Marília, a
-- próxima carga do 59 do mês (o robô sobe de hora em hora) projeta as linhas
-- dela no Play Mix Marília, e a sincronização (`fn_mestre_sincronizar_
-- analitico_aplicar`) move as linhas que estavam no Play 4 — o conflito pela
-- chave (empresa, código, data, forma, login) atualiza o `setor_id`.
--
-- Mês anterior não muda: a sincronização só reescreve o mês do lote que entrou.
--
-- ── Esta migration NÃO mexe em dado ──────────────────────────────────────────
-- Só esquema e funções. O vínculo em si é feito na aba Códigos, por quem é
-- super_admin: apagar o código do Play 4 (solta a carteira 38) e gravar
-- «79, 38» no Play Mix Marília (amarra a 38 nele).
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
-- As versões anteriores das funções estão em 20260910184908 (trava e gatilho),
-- 20260910190808 (definir) e 20260910192814 (listar). Antes de voltar, apague
-- os extras pela aba (senão a carteira fica presa sem código que a justifique);
-- depois `ALTER TABLE public.setores DROP COLUMN codigos_erp_extras`.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

set local lock_timeout = '15s';

-- ═══ 1. A coluna ════════════════════════════════════════════════════════════

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS codigos_erp_extras text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.setores.codigos_erp_extras IS
  'CodGrupoFiltro do relatorio 59 que pertencem a este setor ALEM do principal '
  '(codigo_erp). Ex.: o Play Mix Marilia recebe a carteira do Play 4 desde '
  '14/10/2026. Um codigo pertence a um setor so — conferido em '
  'fn_setor_definir_codigo_erp. Only super_admin edita.';

-- ═══ 2. A trava vale para a coluna nova ═════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_setor_codigo_erp_so_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- UPDATE que nao encosta nos codigos segue o caminho normal: renomear setor e
  -- ativar/desativar continuam sendo de quem tem `setores_criar_editar`.
  IF NEW.codigo_erp IS NOT DISTINCT FROM OLD.codigo_erp
     AND NEW.codigos_erp_extras IS NOT DISTINCT FROM OLD.codigos_erp_extras THEN
    RETURN NEW;
  END IF;

  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION
      'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

-- ═══ 3. Carteira nova acha o setor por qualquer código ══════════════════════

CREATE OR REPLACE FUNCTION public.fn_mestre_grupo_herda_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_setor uuid;
BEGIN
  IF NEW.setor_id IS NOT NULL OR NEW.cod_grupo_filtro IS NULL THEN
    RETURN NEW;
  END IF;

  -- Um codigo e de um setor so; a ordem so desempata dado incoerente, e ai
  -- quem tem o codigo como principal ganha.
  SELECT s.id INTO v_setor
    FROM public.setores s
   WHERE s.empresa_id = NEW.empresa_id
     AND (s.codigo_erp = NEW.cod_grupo_filtro
          OR NEW.cod_grupo_filtro = ANY (s.codigos_erp_extras))
   ORDER BY (s.codigo_erp = NEW.cod_grupo_filtro) DESC NULLS LAST
   LIMIT 1;

  IF v_setor IS NOT NULL THEN
    NEW.setor_id     := v_setor;
    NEW.estado       := 'vinculado';
    NEW.vinculado_em := now();
    NEW.observacao   := 'Vinculado pelo codigo do setor.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ═══ 4. Gravar os códigos, e resolver na hora ═══════════════════════════════
--
-- Mesma assinatura e mesmo retorno de 20260910190808 (CREATE OR REPLACE basta).
-- `p_codigo` agora pode ser uma lista: «79, 38» (vírgula, ponto e vírgula ou
-- espaço). Repetido conta uma vez; o primeiro é o principal.

CREATE OR REPLACE FUNCTION public.fn_setor_definir_codigo_erp(
  p_setor_id uuid,
  p_codigo   text
)
RETURNS TABLE (setor_id uuid, codigo_erp text, carteira text, vinculou boolean, desvinculou text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa  uuid;
  v_codigos  text[];
  v_antigos  text[];
  v_dono     text;
  v_em_uso   text;
  v_vinculou boolean := false;
  v_carteira text;
  v_soltou   text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION
      'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A lista, na ordem digitada, sem vazio e sem repetido. Campo em branco e
  -- sem codigo (array vazio), nao string vazia. Separador e tudo que nao e
  -- letra, numero, ponto, hifen ou sublinhado: virgula, ponto e virgula, espaco.
  SELECT COALESCE(array_agg(t.c ORDER BY t.o), '{}')
    INTO v_codigos
    FROM (
      SELECT x AS c, min(n) AS o
        FROM unnest(regexp_split_to_array(COALESCE(p_codigo, ''), '[^0-9A-Za-z_.-]+'))
             WITH ORDINALITY AS u(x, n)
       WHERE x <> ''
       GROUP BY x
    ) t;

  SELECT s.empresa_id,
         array_remove(ARRAY[s.codigo_erp], NULL) || s.codigos_erp_extras
    INTO v_empresa, v_antigos
    FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'SETOR_NAO_ENCONTRADO: setor % nao existe.', p_setor_id;
  END IF;

  -- Um codigo pertence a um setor so, principal ou extra.
  SELECT s.nome, c INTO v_dono, v_em_uso
    FROM public.setores s
    CROSS JOIN unnest(v_codigos) AS c
   WHERE s.empresa_id = v_empresa
     AND s.id <> p_setor_id
     AND (s.codigo_erp = c OR c = ANY (s.codigos_erp_extras))
   LIMIT 1;
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION
      'CODIGO_ERP_EM_USO: o codigo % ja e do setor "%". Um codigo pertence a um setor so.',
      v_em_uso, v_dono;
  END IF;

  -- O primeiro e o principal; os demais, extras.
  UPDATE public.setores s
     SET codigo_erp         = v_codigos[1],
         codigos_erp_extras = ARRAY(
           SELECT e.c FROM unnest(v_codigos) WITH ORDINALITY AS e(c, n)
            WHERE e.n > 1 ORDER BY e.n)
   WHERE s.id = p_setor_id;

  -- Os codigos que SAIRAM soltam a carteira que eles haviam amarrado neste
  -- setor. Carteira que pertence a outro setor nao e assunto daqui.
  WITH solta AS (
    UPDATE public.mestre_grupos g
       SET setor_id         = NULL,
           estado           = 'novo',
           vinculado_por_id = NULL,
           vinculado_em     = NULL,
           observacao       = NULL,
           atualizado_em    = now()
     WHERE g.empresa_id = v_empresa
       AND g.cod_grupo_filtro = ANY (v_antigos)
       AND NOT (g.cod_grupo_filtro = ANY (v_codigos))
       AND g.setor_id = p_setor_id
    RETURNING g.nome_grupo_filtro
  )
  SELECT string_agg(solta.nome_grupo_filtro, ' / ' ORDER BY solta.nome_grupo_filtro)
    INTO v_soltou FROM solta;

  IF cardinality(v_codigos) > 0 THEN
    WITH amarra AS (
      UPDATE public.mestre_grupos g
         SET setor_id         = p_setor_id,
             estado           = 'vinculado',
             vinculado_por_id = (SELECT auth.uid()),
             vinculado_em     = now(),
             observacao       = 'Vinculado pelo codigo do setor.',
             atualizado_em    = now()
       WHERE g.empresa_id = v_empresa
         AND g.cod_grupo_filtro = ANY (v_codigos)
         AND g.setor_id IS DISTINCT FROM p_setor_id
      RETURNING 1
    )
    SELECT count(*) > 0 INTO v_vinculou FROM amarra;

    -- Todas as carteiras que os codigos encontram, as ja vinculadas inclusive:
    -- a tela precisa dos nomes para confirmar que os numeros sao os certos.
    SELECT string_agg(g.nome_grupo_filtro, ' / '
                      ORDER BY array_position(v_codigos, g.cod_grupo_filtro))
      INTO v_carteira
      FROM public.mestre_grupos g
     WHERE g.empresa_id = v_empresa AND g.cod_grupo_filtro = ANY (v_codigos);
  END IF;

  RETURN QUERY SELECT p_setor_id,
                      NULLIF(array_to_string(v_codigos, ', '), ''),
                      v_carteira, v_vinculou, v_soltou;
END;
$function$;

COMMENT ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) IS
  'Grava os CodGrupoFiltro do setor (lista 79, 38: o primeiro e o principal), solta '
  'a carteira dos codigos que sairam e amarra a dos que entraram. So '
  'super_admin. E a unica via de vinculo de carteira desde 20260910190216; '
  'lista desde 20261014120000.';

REVOKE ALL ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) TO authenticated;

-- ═══ 5. O que a aba lê ══════════════════════════════════════════════════════
--
-- Mesmas colunas de 20260910192814. `codigo_erp` é a lista em texto; `carteira`
-- junta as que os códigos encontram; `carteira_ok` só quando TODOS encontram.

CREATE OR REPLACE FUNCTION public.fn_setores_codigos_erp(p_empresa_id uuid)
RETURNS TABLE (
  setor_id     uuid,
  setor_nome   text,
  ativo        boolean,
  codigo_erp   text,
  carteira     text,
  carteira_ok  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.nome, s.ativo,
         NULLIF(array_to_string(c.cods, ', '), ''),
         g.nomes,
         (cardinality(c.cods) > 0 AND g.achados = cardinality(c.cods))
    FROM public.setores s
    CROSS JOIN LATERAL (
      SELECT array_remove(ARRAY[s.codigo_erp], NULL) || s.codigos_erp_extras AS cods
    ) c
    CROSS JOIN LATERAL (
      SELECT string_agg(mg.nome_grupo_filtro, ' / '
                        ORDER BY array_position(c.cods, mg.cod_grupo_filtro)) AS nomes,
             count(*) AS achados
        FROM public.mestre_grupos mg
       WHERE mg.empresa_id = s.empresa_id
         AND mg.cod_grupo_filtro = ANY (c.cods)
    ) g
   WHERE s.empresa_id = p_empresa_id
     AND s.alternativo IS NOT TRUE
     AND public.fn_can_access_empresa(s.empresa_id)
   ORDER BY s.ativo DESC, s.nome;
$function$;

COMMENT ON FUNCTION public.fn_setores_codigos_erp(uuid) IS
  'Os setores da empresa que PODEM ter codigo do 59, com os codigos (lista em '
  'texto, o principal primeiro) e as carteiras que eles encontram. Alternativo '
  'fica de fora: ele clona recebimento de gente de outros setores e nao tem '
  'carteira propria.';

REVOKE ALL ON FUNCTION public.fn_setores_codigos_erp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setores_codigos_erp(uuid) TO authenticated;

commit;
