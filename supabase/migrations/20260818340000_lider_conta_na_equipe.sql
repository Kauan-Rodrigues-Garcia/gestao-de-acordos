-- ─────────────────────────────────────────────────────────────────────────────
-- O recebimento do LÍDER passa a contar na equipe que ele lidera
-- ─────────────────────────────────────────────────────────────────────────────
-- O PROBLEMA
-- Um líder também atende, e as linhas dele entram no analítico como as de
-- qualquer um. Mas o retrato do mês (`composicao_mes`) monta a equipe de cada
-- pessoa a partir de `perfis.equipe_id` — o modelo LEGADO. Quem foi vinculado
-- pela tela de Equipes está em `equipe_lideres` (20260725b) e continua com
-- `perfis.equipe_id` NULO.
--
-- Medido na BookPlay em 2026-08: R$ 4.597,92 recebidos por cargos de liderança
-- no mês. Só o líder Matheus Costa tem R$ 1.316,17 — ele é o líder explícito da
-- equipe "Matheus", e no retrato do mês está gravado como "Sem equipe". O
-- dinheiro aparecia no total do SETOR (que sai do carimbo do relatório) e não
-- aparecia em card de equipe nenhum: o setor não fechava com a soma das equipes.
--
-- A REGRA
-- Vale `perfis.equipe_id` quando existe; na falta dele, o vínculo explícito de
-- `equipe_lideres` — e SÓ quando ele é único. Quem lidera três equipes não tem
-- "a sua equipe": creditar as três contaria o mesmo dinheiro três vezes dentro
-- do mesmo setor. Esse caso fica como está (conta no setor, não na equipe).
--
-- É a mesma regra do caminho ao vivo, em `src/services/equipes/equipeDoLider.ts`
-- e `buscarComposicaoAoVivo`. As duas fontes do `operadorEquipeMap` têm que
-- concordar, senão o painel muda de número quando o mês é congelado.

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
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

  -- Contagem anterior: é o que permite ler no log se o retrato cresceu,
  -- encolheu ou ficou igual — a única pergunta que as 240 linhas por execução
  -- respondiam, e respondiam mal.
  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  DELETE FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  DELETE FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

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
    -- A equipe do líder explícito entra AQUI, e não num COALESCE solto no
    -- SELECT, porque o LEFT JOIN de `equipes` logo abaixo precisa enxergá-la —
    -- é dele que saem o nome e o setor gravados no retrato.
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        p.equipe_id,
        (SELECT (array_agg(DISTINCT el.equipe_id))[1]
           FROM public.equipe_lideres el
          WHERE el.empresa_id = p_empresa_id
            AND el.lider_id   = p.id
         -- Agregado sem GROUP BY devolve UMA linha; o HAVING a descarta quando
         -- o líder comanda mais de uma equipe. Ver o cabeçalho da migration.
         HAVING count(DISTINCT el.equipe_id) = 1)
      ) AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Um log por execução. `fn_log_registrar` nunca levanta exceção, então o
  -- retrato não deixa de ser gravado se a auditoria falhar.
  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => format(
      'Regerou a composição do mês %s — %s operador(es) e %s equipe(s)',
      p_mes, v_linhas, v_equipes
    ),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes',                p_mes,
      'operadores',         v_linhas,
      'equipes',            v_equipes,
      'operadores_antes',   v_antes_operador,
      'equipes_antes',      v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Regera o retrato mensal de operadores e equipes da empresa. Apaga e reescreve '
  'a composição inteira do mês, e registra UM log de resumo com as contagens. '
  'A equipe de cada pessoa sai de perfis.equipe_id e, na falta dele, do vínculo '
  'ÚNICO em equipe_lideres — é o que faz o recebimento do líder contar na equipe '
  'que ele lidera (20260818340000).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Reaplica o retrato do MÊS CORRENTE, e só dele.
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto, a correção só apareceria na próxima importação do analítico — quem
-- abre o painel hoje continuaria vendo a equipe sem o líder.
--
-- Mês corrente apenas, de propósito: o retrato de um mês fechado existe para
-- que mover alguém de equipe HOJE não reescreva a lista de um mês passado.
-- Regerar tudo traria junto toda mudança de equipe feita desde então.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT empresa_id, mes
      FROM public.composicao_mes
     WHERE mes = to_char(current_date, 'YYYY-MM')
  LOOP
    PERFORM public.fn_composicao_mes_snapshot(r.empresa_id, r.mes);
  END LOOP;
END $$;
