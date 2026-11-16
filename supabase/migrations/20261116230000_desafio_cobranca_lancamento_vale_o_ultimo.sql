-- ============================================================================
-- Desafio Cobrança: no placar manual, o dia vale o ÚLTIMO lançamento (16/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «para lançar o valor manualmente não precisa de motivo,
-- o motivo tem que ser opcional. Pode fazer quantos lançamentos quiser no dia;
-- salva o horário e o valor de cada um e vai entrando no histórico. Só que não
-- vai somando: vale sempre o último valor lançado.»
--
--   • `motivo` passa a ser opcional (vazio = sem motivo);
--   • `valor` pode ser 0 (no manual, «o dia está em zero» é um valor válido);
--   • com `fonte = 'manual'`, o placar do dia é o lançamento MAIS NOVO não
--     removido daquele dia. Remover o último faz valer o anterior.
--   • com `fonte = '59'`, nada muda: o ajuste de divergência continua SOMANDO
--     por cima do 59.
--
-- `fn_desafio_cobranca_montar` é a de 20261116150000 com só o `por_dia` mudado.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Motivo opcional, valor 0 aceito ────────────────────────────────────────

DO $chk$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.desafio_cobranca_ajustes'::regclass AND contype = 'c'
       AND (pg_get_constraintdef(oid) ILIKE '%motivo%' OR pg_get_constraintdef(oid) ILIKE '%valor%')
  LOOP
    EXECUTE format('ALTER TABLE public.desafio_cobranca_ajustes DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $chk$;

ALTER TABLE public.desafio_cobranca_ajustes ALTER COLUMN motivo SET DEFAULT '';

-- ── O placar ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_montar(p_desafio uuid, p_detalhe boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT * FROM public.desafio_cobranca WHERE id = p_desafio),
  ult AS (
    SELECT l.dia, max(l.lido_em) AS lido_em
      FROM public.desafio_cobranca_leituras l
     WHERE l.desafio_id = p_desafio
     GROUP BY l.dia
  ),
  atual AS (
    SELECT l.* FROM public.desafio_cobranca_leituras l
      JOIN ult u ON u.dia = l.dia AND u.lido_em = l.lido_em
     WHERE l.desafio_id = p_desafio AND l.cod_grupo_filtro <> '*'
  ),
  soma AS (SELECT setor_id FROM public.desafio_cobranca_setores WHERE desafio_id = p_desafio AND soma),
  aj AS (
    SELECT a.* FROM public.desafio_cobranca_ajustes a
     WHERE a.desafio_id = p_desafio AND a.removido_em IS NULL
       AND (a.setor_id IS NULL OR a.setor_id IN (SELECT setor_id FROM soma))
  ),
  por_dia AS (
    SELECT x.dia, x.i,
           CASE WHEN d.fonte = 'manual' THEN 0 ELSE
           coalesce((SELECT sum(a.valor) FROM atual a
                      WHERE a.dia = x.dia
                        AND (a.setor_id IN (SELECT setor_id FROM soma)
                             OR (a.setor_id IS NULL AND a.cod_grupo_filtro = ANY (d.grupos_avulsos)))), 0) END AS v59,
           -- Manual: o lançamento mais novo do dia (não soma). 59: os ajustes somam.
           CASE WHEN d.fonte = 'manual' THEN
             coalesce((SELECT j.valor FROM aj j WHERE j.dia = x.dia ORDER BY j.criado_em DESC, j.id DESC LIMIT 1), 0)
           ELSE
             coalesce((SELECT sum(j.valor) FROM aj j WHERE j.dia = x.dia), 0)
           END AS ajuste,
           (SELECT u.lido_em FROM ult u WHERE u.dia = x.dia) AS lido_em
      FROM d, unnest(d.dias) WITH ORDINALITY AS x(dia, i)
     ORDER BY x.i
  )
  SELECT jsonb_build_object(
    'id', d.id, 'titulo', d.titulo, 'subtitulo', d.subtitulo, 'dias', to_jsonb(d.dias),
    'meta_geral', d.meta_geral, 'premio_dia', d.premio_dia, 'premio_hora', d.premio_hora,
    'premio_requisito', d.premio_requisito, 'regra_medias', d.regra_medias, 'regra_premio', d.regra_premio,
    'regra_medias_maior', d.regra_medias_maior, 'regra_premio_maior', d.regra_premio_maior,
    'grupos_avulsos', to_jsonb(d.grupos_avulsos),
    'fonte', d.fonte,
    'liberado', d.liberado,
    -- A hora do dado: o retrato do 59, ou o último lançamento no manual.
    'atualizado_em', CASE WHEN d.fonte = 'manual' THEN (SELECT max(criado_em) FROM aj)
                          ELSE (SELECT max(lido_em) FROM ult) END,
    'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', p.dia, 'valor_59', p.v59, 'ajuste', p.ajuste,
                                                             'total', p.v59 + p.ajuste, 'lido_em', p.lido_em) ORDER BY p.i)
                           FROM por_dia p), '[]'::jsonb),
    'total', coalesce((SELECT sum(v59 + ajuste) FROM por_dia), 0)
  ) || CASE WHEN p_detalhe THEN jsonb_build_object(
    'ativo', d.ativo, 'empresa_id', d.empresa_id, 'liberado_em', d.liberado_em,
    'setores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('setor_id', s.id, 'nome', s.nome, 'cidade', c.nome, 'regra', s.regra,
                                          'soma', coalesce(cfg.soma, false), 've', coalesce(cfg.ve, false))
                       ORDER BY c.nome NULLS LAST, s.nome)
        FROM public.setores s
        LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
        LEFT JOIN public.desafio_cobranca_setores cfg ON cfg.desafio_id = d.id AND cfg.setor_id = s.id
       WHERE cfg.setor_id IS NOT NULL
          OR s.id IN (SELECT g.setor_id FROM public.mestre_grupos g
                       WHERE g.empresa_id = d.empresa_id AND g.estado = 'vinculado')), '[]'::jsonb),
    'grupos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('dia', a.dia, 'cod', a.cod_grupo_filtro, 'nome', a.nome_grupo_filtro,
                                          'setor_id', a.setor_id, 'pagamentos', a.pagamentos, 'valor', a.valor)
                       ORDER BY a.dia, a.valor DESC)
        FROM atual a), '[]'::jsonb),
    'horas', coalesce((
      -- Grupo sem setor sai com o `cod`, para o avulso que soma entrar na curva.
      SELECT jsonb_agg(jsonb_build_object('lido_em', h.lido_em, 'dia', h.dia, 'setor_id', h.setor_id,
                                          'cod', h.cod, 'valor', h.valor)
                       ORDER BY h.lido_em)
        FROM (SELECT l.lido_em, l.dia, l.setor_id,
                     CASE WHEN l.setor_id IS NULL THEN l.cod_grupo_filtro END AS cod, sum(l.valor) AS valor
                FROM public.desafio_cobranca_leituras l
               WHERE l.desafio_id = d.id AND l.cod_grupo_filtro <> '*'
               GROUP BY 1, 2, 3, 4) h), '[]'::jsonb),
    'leituras', coalesce((
      SELECT jsonb_agg(DISTINCT l.lido_em) FROM public.desafio_cobranca_leituras l WHERE l.desafio_id = d.id), '[]'::jsonb),
    'ajustes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'dia', a.dia, 'setor_id', a.setor_id, 'valor', a.valor,
                                          'motivo', a.motivo, 'criado_em', a.criado_em, 'criado_por', p.nome,
                                          'removido_em', a.removido_em)
                       ORDER BY a.criado_em DESC)
        FROM public.desafio_cobranca_ajustes a
        LEFT JOIN public.perfis p ON p.id = a.criado_por
       WHERE a.desafio_id = d.id), '[]'::jsonb),
    'aberturas', (SELECT count(*) FROM public.desafio_cobranca_aberturas ab WHERE ab.desafio_id = d.id),
    'lote_59', (
      SELECT jsonb_build_object('importado_em', max(l.importado_em))
        FROM public.mestre_lotes l
       WHERE l.empresa_id = d.empresa_id AND l.estado = 'vigente'
         AND l.mes IN (SELECT DISTINCT date_trunc('month', x)::date FROM unnest(d.dias) x))
  ) ELSE '{}'::jsonb END
  FROM d;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_montar(uuid, boolean) FROM PUBLIC, anon, authenticated;

COMMIT;
