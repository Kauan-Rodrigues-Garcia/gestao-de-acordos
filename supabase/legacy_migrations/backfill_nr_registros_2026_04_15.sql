
-- ────────────────────────────────────────────────────────────────────
-- Backfill: nr_registros a partir dos acordos existentes
-- Data: 2026-04-15
--
-- Regras de precedência:
--   1. Exclui acordos com status = 'nao_pago' (NR livre)
--   2. Por (empresa_id, campo, nr_value) mantém o acordo mais recente
--      (maior criado_em)
-- ────────────────────────────────────────────────────────────────────

-- 1. Backfill Bookplay — campo = 'nr_cliente'
INSERT INTO public.nr_registros (
  empresa_id, nr_value, campo,
  operador_id, operador_nome, acordo_id,
  criado_em, atualizado_em
)
SELECT DISTINCT ON (a.empresa_id, a.nr_cliente)
  a.empresa_id,
  a.nr_cliente,
  'nr_cliente'::text,
  a.operador_id,
  COALESCE(p.nome, p.email, 'Operador'),
  a.id,
  NOW(),
  NOW()
FROM public.acordos a
LEFT JOIN public.perfis p ON p.id = a.operador_id
WHERE
  a.empresa_id IS NOT NULL
  AND a.operador_id IS NOT NULL
  AND a.nr_cliente IS NOT NULL
  AND a.nr_cliente <> ''
  AND a.status <> 'nao_pago'
ORDER BY
  a.empresa_id, a.nr_cliente,
  a.criado_em DESC NULLS LAST
ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
  operador_id   = EXCLUDED.operador_id,
  operador_nome = EXCLUDED.operador_nome,
  acordo_id     = EXCLUDED.acordo_id,
  atualizado_em = NOW();

-- 2. Backfill PaguePay — campo = 'instituicao'
INSERT INTO public.nr_registros (
  empresa_id, nr_value, campo,
  operador_id, operador_nome, acordo_id,
  criado_em, atualizado_em
)
SELECT DISTINCT ON (a.empresa_id, a.instituicao)
  a.empresa_id,
  a.instituicao,
  'instituicao'::text,
  a.operador_id,
  COALESCE(p.nome, p.email, 'Operador'),
  a.id,
  NOW(),
  NOW()
FROM public.acordos a
LEFT JOIN public.perfis p ON p.id = a.operador_id
WHERE
  a.empresa_id IS NOT NULL
  AND a.operador_id IS NOT NULL
  AND a.instituicao IS NOT NULL
  AND a.instituicao <> ''
  AND a.status <> 'nao_pago'
ORDER BY
  a.empresa_id, a.instituicao,
  a.criado_em DESC NULLS LAST
ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
  operador_id   = EXCLUDED.operador_id,
  operador_nome = EXCLUDED.operador_nome,
  acordo_id     = EXCLUDED.acordo_id,
  atualizado_em = NOW();

-- Verificação rápida
SELECT
  campo,
  COUNT(*) AS total_registros
FROM public.nr_registros
GROUP BY campo
ORDER BY campo;
