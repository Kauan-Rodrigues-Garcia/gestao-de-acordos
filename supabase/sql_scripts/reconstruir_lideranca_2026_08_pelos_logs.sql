-- ═══════════════════════════════════════════════════════════════════════════
-- Preenche `composicao_mes_lider` de AGOSTO/2026 com quem liderava em 31/08
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Companheiro de `reconstruir_composicao_2026_08_pelos_logs.sql`, que já
-- devolveu as PESSOAS e as EQUIPES de agosto. Faltava a liderança, que só passou
-- a ser congelada na migration `20260903340000`.
--
-- Rodar UMA vez, depois daquela migration. Mesma fonte e mesmo instante alvo:
-- `logs_sistema` e 2026-09-01 03:00:00+00 (31/08 às 23:59:59 em São Paulo).
--
-- Mesma regra de `lideresDaEquipe.ts`, aplicada aos dados DAQUELE dia:
--   • equipe com vínculo em `equipe_lideres` → só esses;
--   • equipe sem vínculo → reserva (cargo `lider` com `perfis.equipe_id` nela,
--     mais os líderes clonados nela);
--   • quem já lidera alguma equipe não entra pela reserva em lugar nenhum.
--
-- O cargo também é o de 31/08: quem virou `lider` em setembro não vira líder
-- retroativo, e quem deixou de ser continua na foto.

BEGIN;

WITH t AS (SELECT TIMESTAMPTZ '2026-09-01 03:00:00+00' AS quando),

-- ── perfis em 31/08 (cargo e equipe do cadastro) ────────────────────────────
mud AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em FROM public.logs_sistema l, t
   WHERE l.tabela='perfis' AND l.criado_em > t.quando AND l.antes IS NOT NULL),
val AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em),
nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='perfis' AND l.acao='usuario_criado' AND l.criado_em > t.quando),
perfis31 AS (
  SELECT p.id, p.nome,
    (COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='empresa_id'), to_jsonb(p.empresa_id))#>>'{}')::uuid AS empresa_id,
    (COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='equipe_id'),  to_jsonb(p.equipe_id)) #>>'{}')::uuid AS equipe_id,
     COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='perfil'),     to_jsonb(p.perfil))    #>>'{}'        AS perfil
    FROM public.perfis p WHERE p.id NOT IN (SELECT id FROM nasc)),

-- ── vínculos de liderança em 31/08 ──────────────────────────────────────────
lid_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_lideres' AND l.acao='equipe_lideranca_criado' AND l.criado_em > t.quando),
lideres31 AS (
  SELECT el.equipe_id, el.lider_id, el.criado_em
    FROM public.equipe_lideres el WHERE el.id NOT IN (SELECT id FROM lid_nasc)
  UNION
  SELECT (l.antes->>'equipe_id')::uuid, (l.antes->>'lider_id')::uuid, (l.antes->>'criado_em')::timestamptz
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_lideres' AND l.acao='equipe_lideranca_excluido' AND l.criado_em > t.quando),

-- ── clones em 31/08 (a caixinha de recebimento não importa para a FOTO) ─────
cl_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_operadores_clones' AND l.acao='equipe_clone_criado' AND l.criado_em > t.quando),
clones31 AS (
  SELECT c.equipe_id, c.operador_id FROM public.equipe_operadores_clones c
   WHERE c.id NOT IN (SELECT id FROM cl_nasc)
  UNION
  SELECT (l.antes->>'equipe_id')::uuid, (l.antes->>'operador_id')::uuid
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_operadores_clones' AND l.acao='equipe_clone_excluido' AND l.criado_em > t.quando),

-- ── a regra ─────────────────────────────────────────────────────────────────
explicitos AS (
  SELECT l31.equipe_id, l31.lider_id, l31.criado_em, p.empresa_id, p.nome
    FROM lideres31 l31 JOIN perfis31 p ON p.id = l31.lider_id AND p.perfil = 'lider'),
ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
reserva AS (
  SELECT p.equipe_id, p.id AS lider_id, p.empresa_id, p.nome
    FROM perfis31 p
   WHERE p.perfil = 'lider' AND p.equipe_id IS NOT NULL
     AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
     AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = p.equipe_id)
  UNION
  SELECT c.equipe_id, p.id, p.empresa_id, p.nome
    FROM clones31 c JOIN perfis31 p ON p.id = c.operador_id AND p.perfil = 'lider'
   WHERE p.id NOT IN (SELECT lider_id FROM ja_lidera)
     AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)),
lista AS (
  SELECT empresa_id, equipe_id, lider_id,
         row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
    FROM explicitos
  UNION ALL
  SELECT empresa_id, equipe_id, lider_id,
         (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
    FROM reserva)
INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
SELECT l.empresa_id, '2026-08', l.equipe_id, l.lider_id, l.ordem
  FROM lista l
 -- Só equipes que estão no retrato de agosto: uma equipe fora da foto não tem
 -- card, e a liderança dela não seria lida por ninguém.
 WHERE EXISTS (
   SELECT 1 FROM public.composicao_mes_equipe ce
    WHERE ce.mes = '2026-08' AND ce.empresa_id = l.empresa_id AND ce.equipe_id = l.equipe_id)
ON CONFLICT DO NOTHING;

COMMIT;
