-- ═══════════════════════════════════════════════════════════════════════════
-- Preenche a IDENTIDADE nos retratos já fechados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Rodar UMA vez, depois de `20260903410000`. Não é migration: é reparo de dado.
--
-- ## Por que precisa de script
--
-- A migration acrescentou `nome`, `usuario`, `email`, `cargo`, `foto_url`,
-- `ativo` e `desligado_em` a `composicao_mes`, e ensinou o snapshot a
-- preenchê-los. Só que a regra do mês fechado é NUNCA reescrever o que já está
-- lá — é ela que impede agosto de virar setembro. Consequência: as linhas dos
-- meses já fechados ficariam com as colunas novas vazias para sempre, porque a
-- função, por desenho, não volta para completá-las.
--
-- ## De onde sai a verdade
--
-- Para AGOSTO, o mesmo caminho de volta de `reconstruir_composicao_2026_08_pelos_logs.sql`:
-- o valor de um campo em 31/08 é o `antes` da PRIMEIRA alteração posterior ao
-- alvo (2026-09-01 03:00 UTC = 31/08 23:59:59 em São Paulo); sem alteração
-- posterior, é o valor de hoje.
--
-- Medido em 03/09/2026, entre o alvo e agora: 8 pessoas mudaram de CARGO, 3 de
-- nome, 3 de login, 1 de e-mail, 13 de situação. Sem isto, agosto apareceria
-- com o cargo de setembro em 7 pessoas e com um nome trocado.
--
-- Para JUNHO e JULHO o valor é o de HOJE, e isso é uma aproximação assumida: as
-- colunas `antes`/`depois` dos logs só existem desde 12/08/2026, então não há
-- de onde reconstruir o que mudou antes disso. Foi decisão do Cleber — o mês
-- que importa é o passado. Quem já foi EXCLUÍDO é resgatado do log
-- `usuario_excluido`, que guarda o `antes` inteiro do perfil: são 6 pessoas em
-- julho/BookPlay que, sem isso, apareceriam como buraco na lista.
--
-- ## Resultado
--
-- 2026-06 PP 47 · 2026-07 BP 125 / PP 47 · 2026-08 BP 252 / PP 42, todos com
-- nome e cargo preenchidos. O mês corrente é regerado pelo cron das 23:50 e não
-- precisa de reparo.

-- ── Agosto: identidade como era em 31/08 ────────────────────────────────────
WITH t AS (SELECT TIMESTAMPTZ '2026-09-01 03:00:00+00' AS quando),
mud AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em
    FROM public.logs_sistema l, t
   WHERE l.tabela = 'perfis' AND l.criado_em > t.quando AND l.antes IS NOT NULL
),
val AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em
),
excluidos AS (
  SELECT DISTINCT ON (l.registro_id::uuid) l.registro_id::uuid AS id, l.antes
    FROM public.logs_sistema l
   WHERE l.tabela = 'perfis' AND l.acao = 'usuario_excluido'
   ORDER BY l.registro_id::uuid, l.criado_em
),
em3108 AS (
  SELECT c.empresa_id, c.operador_id AS id,
         COALESCE((SELECT v.valor#>>'{}' FROM val v WHERE v.id = c.operador_id AND v.campo = 'nome'),
                  p.nome, x.antes->>'nome')             AS nome,
         COALESCE((SELECT v.valor#>>'{}' FROM val v WHERE v.id = c.operador_id AND v.campo = 'usuario'),
                  p.usuario, x.antes->>'usuario')       AS usuario,
         COALESCE((SELECT v.valor#>>'{}' FROM val v WHERE v.id = c.operador_id AND v.campo = 'email'),
                  p.email, x.antes->>'email')           AS email,
         COALESCE((SELECT v.valor#>>'{}' FROM val v WHERE v.id = c.operador_id AND v.campo = 'perfil'),
                  p.perfil::TEXT, x.antes->>'perfil')   AS cargo,
         COALESCE((SELECT v.valor#>>'{}' FROM val v WHERE v.id = c.operador_id AND v.campo = 'foto_url'),
                  p.foto_url)                           AS foto_url,
         COALESCE((SELECT (v.valor#>>'{}')::BOOLEAN FROM val v WHERE v.id = c.operador_id AND v.campo = 'ativo'),
                  p.ativo, TRUE)                        AS ativo,
         COALESCE((SELECT (v.valor#>>'{}')::TIMESTAMPTZ FROM val v WHERE v.id = c.operador_id AND v.campo = 'desligado_em'),
                  p.desligado_em)                       AS desligado_em
    FROM public.composicao_mes c
    LEFT JOIN public.perfis p    ON p.id = c.operador_id
    LEFT JOIN excluidos x        ON x.id = c.operador_id
   WHERE c.mes = '2026-08'
)
UPDATE public.composicao_mes c
   SET nome = e.nome, usuario = e.usuario, email = e.email, cargo = e.cargo,
       foto_url = e.foto_url, ativo = e.ativo, desligado_em = e.desligado_em
  FROM em3108 e
 WHERE c.mes = '2026-08' AND c.operador_id = e.id AND c.empresa_id = e.empresa_id
   -- `nome IS NULL` é a trava de idempotência: rodar duas vezes não reescreve
   -- o que já foi preenchido, que é a mesma regra do mês fechado.
   AND c.nome IS NULL;

-- ── Junho e julho: o valor de hoje, e o excluído resgatado do log ───────────
WITH excluidos AS (
  SELECT DISTINCT ON (l.registro_id::uuid) l.registro_id::uuid AS id, l.antes
    FROM public.logs_sistema l
   WHERE l.tabela = 'perfis' AND l.acao = 'usuario_excluido'
   ORDER BY l.registro_id::uuid, l.criado_em
)
UPDATE public.composicao_mes c
   SET nome     = COALESCE(p.nome, x.antes->>'nome', 'Usuário removido'),
       usuario  = COALESCE(p.usuario, x.antes->>'usuario'),
       email    = COALESCE(p.email, x.antes->>'email'),
       cargo    = COALESCE(p.perfil::TEXT, x.antes->>'perfil', 'operador'),
       foto_url = p.foto_url,
       ativo    = COALESCE(p.ativo, FALSE),
       desligado_em = p.desligado_em
  FROM public.composicao_mes c2
  LEFT JOIN public.perfis p ON p.id = c2.operador_id
  LEFT JOIN excluidos x     ON x.id = c2.operador_id
 WHERE c.mes = c2.mes AND c.operador_id = c2.operador_id AND c.empresa_id = c2.empresa_id
   AND c.mes IN ('2026-06', '2026-07') AND c.nome IS NULL;

-- ── Conferência ────────────────────────────────────────────────────────────
SELECT c.mes, e.slug, count(*) AS linhas,
       count(*) FILTER (WHERE c.nome IS NULL)  AS sem_nome,
       count(*) FILTER (WHERE c.cargo IS NULL) AS sem_cargo
  FROM public.composicao_mes c
  JOIN public.empresas e ON e.id = c.empresa_id
 GROUP BY c.mes, e.slug
 ORDER BY c.mes DESC, e.slug;
