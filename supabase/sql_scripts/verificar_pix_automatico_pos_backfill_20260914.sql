-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — SOMENTE LEITURA (14/09/2026)
--
-- Confere o que as operações A e B deixaram no banco. Não altera nada.
--
-- Esperado:
--   pix_inseridos_pelo_backfill = 50   (soma 110368.27)
--   notif_caso_2b = 31, notif_caso_3 = 4, notif_duplicadas = 0
--   pix_sem_setor = 0 (se vier > 0, o operador estava sem setor no cadastro)
--
-- Os registros da operação A são reconhecidos pelo log do Pix: ação
-- 'registrado' sem autor (a inserção não teve usuário logado → 'Sistema'),
-- feita em 14/09/2026.
-- ═══════════════════════════════════════════════════════════════════════════

WITH pix_backfill AS (
  SELECT p.id, p.valor, p.setor_id, p.status
    FROM public.pix_automatico_log l
    JOIN public.pix_automatico_acordos p ON p.id = l.acordo_id
   WHERE l.acao = 'registrado'
     AND l.autor_id IS NULL
     AND l.criado_em >= timestamptz '2026-09-14 00:00:00-03'
     AND l.criado_em <  timestamptz '2026-09-15 00:00:00-03'
),
notif AS (
  SELECT n.usuario_id, n.titulo
    FROM public.notificacoes n
   WHERE n.criado_em >= timestamptz '2026-09-14 00:00:00-03'
     AND (n.titulo LIKE 'PIX Automático lançado só com a parcela — NR %'
       OR n.titulo LIKE 'Pix Automático com valor de parcela — NR %')
)
SELECT
  (SELECT count(*)                                  FROM pix_backfill) AS pix_inseridos_pelo_backfill,
  (SELECT sum(valor)                                FROM pix_backfill) AS pix_soma_valor,
  (SELECT count(*) FILTER (WHERE status <> 'pendente') FROM pix_backfill) AS pix_ja_avaliados,
  (SELECT count(*) FILTER (WHERE setor_id IS NULL)  FROM pix_backfill) AS pix_sem_setor,
  (SELECT count(*) FILTER (WHERE titulo LIKE 'PIX Automático lançado só com a parcela%') FROM notif) AS notif_caso_2b,
  (SELECT count(*) FILTER (WHERE titulo LIKE 'Pix Automático com valor de parcela%')     FROM notif) AS notif_caso_3,
  (SELECT count(*) - count(DISTINCT (usuario_id, titulo)) FROM notif)                    AS notif_duplicadas;
