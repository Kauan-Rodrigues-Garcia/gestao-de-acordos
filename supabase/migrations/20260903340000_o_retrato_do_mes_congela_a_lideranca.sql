-- ═══════════════════════════════════════════════════════════════════════════
-- O retrato do mês passa a congelar também QUEM LIDERAVA cada equipe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O buraco
--
-- `composicao_mes` congela quem estava em qual equipe, e `composicao_mes_equipe`
-- congela o nome e o setor da equipe. A LIDERANÇA ficou de fora: o Desempenho
-- Equipes sempre montou as fotos a partir de `equipe_lideres`, `perfis` e
-- `equipe_operadores_clones` ao vivo, sem filtro de mês.
--
-- Resultado: filtrar agosto mostrava a composição de agosto com os líderes de
-- HOJE. Depois da reconstrução de 02/09, as equipes "Digital Amauri - Play 4",
-- "Digital Amauri - Play 5", "Play 4" e "Play 5" apareciam em agosto com a foto
-- do Brunno Piccolo — em agosto elas eram do Amauri.
--
-- ## A regra gravada
--
-- É a de `src/pages/Dashboard/Analitico/lideresDaEquipe.ts`, resolvida UMA vez,
-- na hora da foto:
--
--   • equipe COM vínculo em `equipe_lideres` → a lista é essa, e só essa;
--   • equipe SEM vínculo → cai na reserva: quem tem cargo `lider` com
--     `perfis.equipe_id` apontando para ela, mais os líderes clonados nela;
--   • quem já lidera alguma equipe explicitamente NÃO entra pela reserva em
--     lugar nenhum.
--
-- Gravar o resultado, e não os ingredientes, é de propósito: para um mês
-- fechado não há segunda avaliação possível, então a tela não pode divergir da
-- foto. O mês corrente continua sendo resolvido ao vivo pelo TypeScript.
--
-- `ordem` existe para a fila de fotos não trocar de posição entre aberturas.
-- Explícitos primeiro (por data do vínculo), reserva depois (por nome).

CREATE TABLE IF NOT EXISTS public.composicao_mes_lider (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes        TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  equipe_id  UUID NOT NULL,
  lider_id   UUID NOT NULL,
  ordem      INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, mes, equipe_id, lider_id)
);

-- Sem FK para `equipes` nem para `perfis` de propósito: a foto tem de sobreviver
-- à equipe apagada e ao usuário excluído depois. É a mesma escolha de
-- `composicao_mes_equipe`, que também guarda `equipe_id` solto.
CREATE INDEX IF NOT EXISTS composicao_mes_lider_mes_idx
  ON public.composicao_mes_lider (empresa_id, mes);

ALTER TABLE public.composicao_mes_lider ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composicao_mes_lider_leitura ON public.composicao_mes_lider;
CREATE POLICY composicao_mes_lider_leitura ON public.composicao_mes_lider
  FOR SELECT USING (
    public.fn_user_acesso_multiempresa()
    OR empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS composicao_mes_lider_super_admin_total ON public.composicao_mes_lider;
CREATE POLICY composicao_mes_lider_super_admin_total ON public.composicao_mes_lider
  FOR ALL USING (public.fn_user_is_super_admin())
  WITH CHECK (public.fn_user_is_super_admin());

GRANT SELECT ON public.composicao_mes_lider TO authenticated;
GRANT ALL    ON public.composicao_mes_lider TO service_role;

COMMENT ON TABLE public.composicao_mes_lider IS
  'Quem liderava cada equipe NAQUELE mes, ja resolvido pela regra de '
  'lideresDaEquipe.ts (explicito manda, legado e reserva). Sem esta tabela o '
  'Desempenho Equipes mostrava a composicao do mes filtrado com os lideres de '
  'hoje (20260903340000).';

-- ─────────────────────────────────────────────────────────────────────────────
-- A função passa a gravar a liderança junto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_lideres         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
  v_mes_corrente    TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_fechado         BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  -- Calls without a JWT are accepted only for the database owner/pg_cron.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  -- O mês é comparado como TEXTO 'YYYY-MM', que ordena igual à data. O mês de
  -- São Paulo, não o do servidor: às 23:50 do dia 31, em UTC já é dia 1º.
  v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;

  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_equipe
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_lider
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
  END IF;

  -- ── Equipes ───────────────────────────────────────────────────────────────
  -- Mês fechado: só as que faltam. O nome e o setor gravados na foto ficam como
  -- estavam, mesmo que a equipe tenha sido renomeada ou trocada de setor depois.
  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_equipe ce
        WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = e.id))
  -- A PK e (empresa_id, mes, equipe_id). O DO NOTHING existe para o caso de
  -- duas importacoes do mesmo mes se cruzarem: perder a corrida vira uma linha
  -- a menos no contador, nao um erro que derruba a importacao inteira.
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  -- ── Liderança ─────────────────────────────────────────────────────────────
  -- A regra de `lideresDaEquipe.ts`, resolvida aqui uma vez só. Mês fechado:
  -- só as equipes que ainda não têm liderança gravada — a lista já congelada
  -- não é tocada.
  INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
  WITH explicitos AS (
    SELECT el.equipe_id, el.lider_id, el.criado_em
      FROM public.equipe_lideres el
      JOIN public.perfis p ON p.id = el.lider_id AND p.perfil = 'lider'
     WHERE el.empresa_id = p_empresa_id
  ),
  -- Quem já lidera alguma equipe não volta pela reserva em lugar nenhum: é o
  -- resíduo de `perfis.equipe_id` que fazia a equipe antiga exibir a foto dele.
  ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
  reserva AS (
    SELECT e.id AS equipe_id, p.id AS lider_id, p.nome
      FROM public.equipes e
      JOIN public.perfis p ON p.equipe_id = e.id AND p.perfil = 'lider'
     WHERE e.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = e.id)
    UNION
    SELECT c.equipe_id, p.id, p.nome
      FROM public.equipe_operadores_clones c
      JOIN public.perfis p ON p.id = c.operador_id AND p.perfil = 'lider'
     WHERE c.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)
  ),
  lista AS (
    SELECT equipe_id, lider_id,
           row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
      FROM explicitos
    UNION ALL
    SELECT equipe_id, lider_id,
           (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
      FROM reserva
  )
  SELECT p_empresa_id, p_mes, l.equipe_id, l.lider_id, l.ordem
    FROM lista l
   WHERE NOT v_fechado OR NOT EXISTS (
     SELECT 1 FROM public.composicao_mes_lider cl
      WHERE cl.empresa_id = p_empresa_id AND cl.mes = p_mes AND cl.equipe_id = l.equipe_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  -- ── Pessoas ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         COALESCE((
           SELECT array_agg(c.equipe_id)
             FROM public.equipe_operadores_clones c
            WHERE c.empresa_id = p_empresa_id
              AND c.operador_id = p.id
              AND COALESCE(c.conta_recebimento, TRUE)
         ), '{}'::UUID[])
    FROM public.perfis p
    -- A equipe é resolvida AQUI, em JOIN, e não num COALESCE solto no SELECT,
    -- porque o LEFT JOIN de `equipes` logo abaixo precisa enxergá-la — é dele
    -- que saem o nome e o setor gravados no retrato.
    --
    -- `l` é a equipe do vínculo explícito, e só quando ele é ÚNICO: agregado sem
    -- GROUP BY devolve UMA linha, e o HAVING a descarta quando o líder comanda
    -- mais de uma equipe — creditar as três contaria o mesmo dinheiro três vezes
    -- dentro do mesmo setor. Sem linha, o `ON TRUE` deixa `l.equipe_id` nulo.
    LEFT JOIN LATERAL (
      SELECT (array_agg(DISTINCT el.equipe_id))[1] AS equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id
         AND el.lider_id   = p.id
      HAVING count(DISTINCT el.equipe_id) = 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               -- Cargo `lider`: manda a equipe que ele LIDERA. O cadastro dele
               -- é resíduo que a tela de Equipes não mostra nem edita.
               WHEN p.perfil = 'lider' THEN COALESCE(l.equipe_id, p.equipe_id)
               -- Todo o resto é MEMBRO: o cadastro manda, e liderar outra
               -- equipe não tira a pessoa da equipe de que ela faz parte.
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes cm
        WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = p.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Um log por execução. `fn_log_registrar` nunca levanta exceção, então o
  -- retrato não deixa de ser gravado se a auditoria falhar. `preservado` é o
  -- que diz, na leitura do log, se o mês foi reescrito ou só complementado.
  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es), %s equipe(s) e %s liderança(s) que faltavam',
      p_mes, v_linhas, v_equipes, v_lideres
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es), %s equipe(s) e %s liderança(s)',
      p_mes, v_linhas, v_equipes, v_lideres
    ) END,
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes',                p_mes,
      'preservado',         v_fechado,
      'operadores',         v_linhas,
      'equipes',            v_equipes,
      'lideres',            v_lideres,
      'operadores_antes',   v_antes_operador,
      'equipes_antes',      v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Retrato mensal de operadores, equipes e LIDERANCA. Mes CORRENTE: reescreve '
  'inteiro. Mes FECHADO que ja tem retrato: nao apaga nem move nada, so '
  'acrescenta quem falta (20260903330000). A lideranca e resolvida pela regra de '
  'lideresDaEquipe.ts e gravada em composicao_mes_lider (20260903340000).';

-- ── Preenche o mês corrente ─────────────────────────────────────────────────
-- Só o corrente: os meses fechados não podem ser refeitos a partir das tabelas
-- de hoje — é justamente o que esta série de migrations veio impedir. Agosto é
-- preenchido à parte, pelos logs, em
-- `sql_scripts/reconstruir_lideranca_2026_08_pelos_logs.sql`.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT empresa_id, mes FROM public.composicao_mes
     WHERE mes = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  LOOP
    PERFORM public.fn_composicao_mes_snapshot(r.empresa_id, r.mes);
  END LOOP;
END $$;
