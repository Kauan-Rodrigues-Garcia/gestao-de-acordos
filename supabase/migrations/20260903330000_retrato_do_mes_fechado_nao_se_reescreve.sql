-- ═══════════════════════════════════════════════════════════════════════════
-- O retrato de um mês FECHADO para de ser reescrito
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O congelamento existia e não segurava nada
--
-- `composicao_mes` é o retrato de quem estava em qual equipe naquele mês, e o
-- cron `composicao-mes-congelar` o refaz todo dia às 23:50 de São Paulo. Isso
-- funciona: o job roda desde 04/08/2026, 30 execuções, nenhuma falha.
--
-- O que não funciona é o que acontece DEPOIS da virada.
-- `fn_composicao_mes_snapshot` sempre foi um DELETE + INSERT do mês inteiro a
-- partir das tabelas de HOJE, e a importação do analítico a chama para o mês do
-- arquivo (`congelarComposicaoDoMes`). Importar agosto em setembro, então,
-- jogava fora o retrato de agosto e gravava no lugar a composição de setembro.
--
-- Medido em 01/09/2026, no próprio log da função (`composicao_mes_regerado`):
-- o retrato de 2026-08 da BookPlay foi reescrito oito vezes ao longo do dia, e
-- numa delas as equipes saltaram de 19 para 21 — duas equipes criadas em
-- SETEMBRO entraram na fotografia de AGOSTO. A PaguePlay teve o mesmo mês
-- reescrito duas vezes.
--
-- ## A regra nova
--
-- Mês corrente: reescreve inteiro, como sempre. Ele ainda está acontecendo.
--
-- Mês fechado que JÁ tem retrato: nada do que está lá é apagado nem movido. A
-- função só ACRESCENTA quem falta — o operador que apareceu numa importação
-- atrasada e não estava na foto, a equipe idem. Sem isso, uma correção de
-- agosto importada em setembro traria linhas de recebimento de gente que não
-- existe no retrato, e o dinheiro delas cairia fora de qualquer card.
--
-- Mês fechado SEM retrato nenhum (backfill de um mês antigo) continua sendo
-- escrito por inteiro: não há foto para preservar.
--
-- ## A segunda correção: a equipe do líder
--
-- Mesma mudança de `src/services/equipes/equipeDoLider.ts`. O `COALESCE` daqui
-- punha `perfis.equipe_id` na frente do vínculo de `equipe_lideres` para todo
-- mundo. Para um MEMBRO isso está certo — ele pertence àquela equipe. Para
-- quem tem cargo `lider`, não: a tela de Equipes esconde o líder de toda lista
-- de membros e só edita `equipe_lideres`, então o `perfis.equipe_id` dele é
-- resíduo do modelo antigo, invisível e ineditável pela interface.
--
-- Medido na BookPlay, setor Play 4, em 02/09/2026:
--
--   equipe            lidera hoje       preso pelo cadastro
--   ────────────────  ────────────────  ───────────────────
--   Digital Bruno     Brunno Piccolo    Maria Oliveira
--   Maria - Capitã    Maria Oliveira    Tamires Valentin
--
-- Os R$ 7.916,99 recebidos por Maria Oliveira em agosto contavam no card do
-- Brunno, não no dela. Trocaram a liderança das duas equipes e só
-- `equipe_lideres` acompanhou.

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
      'Completou a composição do mês fechado %s — %s operador(es) e %s equipe(s) que faltavam',
      p_mes, v_linhas, v_equipes
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es) e %s equipe(s)',
      p_mes, v_linhas, v_equipes
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
      'operadores_antes',   v_antes_operador,
      'equipes_antes',      v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Retrato mensal de operadores e equipes. Mes CORRENTE: reescreve inteiro. Mes '
  'FECHADO que ja tem retrato: nao apaga nem move nada, so acrescenta quem falta '
  '— era por aqui que a importacao de um mes passado reescrevia a composicao com '
  'o estado de hoje (20260903330000). A equipe de cada pessoa sai do cadastro; '
  'para cargo lider sai do vinculo UNICO em equipe_lideres, que e o unico que a '
  'tela de Equipes edita.';

-- ── Reaplica o retrato do MÊS CORRENTE, e só dele ───────────────────────────
--
-- Sem isto, a correção da equipe do líder só apareceria na próxima importação.
-- Mês corrente apenas, de propósito — e agora a regra acima já protegeria os
-- meses fechados de qualquer jeito.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT empresa_id, mes
      FROM public.composicao_mes
     WHERE mes = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  LOOP
    PERFORM public.fn_composicao_mes_snapshot(r.empresa_id, r.mes);
  END LOOP;
END $$;
