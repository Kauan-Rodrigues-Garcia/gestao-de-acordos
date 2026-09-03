-- ═══════════════════════════════════════════════════════════════════════════
-- Confere o retrato de AGOSTO/2026 pelo caminho de volta dos logs — para o Pix
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SOMENTE LEITURA. Nada aqui escreve. É a conferência que precedeu a correção
-- do Pix Automático em mês fechado, e serve para repetir a medição depois.
--
-- ## O que se perguntou
--
-- `reconstruir_composicao_2026_08_pelos_logs.sql` reconstruiu o retrato de
-- agosto em 02/09. Desde então houve mais um dia de mudanças. A pergunta é se
-- o retrato ainda descreve 31/08 — e, com ele validado, quanto do Pix de agosto
-- estava sendo mostrado no lugar errado.
--
-- Método idêntico ao de ontem: o valor de um campo em 31/08 é o `antes` da
-- PRIMEIRA alteração posterior ao alvo; sem alteração posterior, é o valor de
-- hoje. Alvo = 2026-09-01 03:00:00+00 = 31/08 às 23:59:59 em São Paulo.
--
-- ## O que se mediu (03/09/2026)
--
-- 1. RETRATO ÍNTEGRO. BookPlay 252 pessoas / 20 equipes / 23 lideranças / 13
--    setores; PaguePlay 42 / 4 / 4 / 1. Última escrita 02/09 23:20 UTC — a
--    reconstrução de ontem. Nada o sobrescreveu depois: `20260903330000` está
--    segurando.
--
-- 2. ZERO DIVERGÊNCIAS REAIS. A consulta 1 acusa 14 pessoas com equipe
--    diferente, e as 14 são de cargo `lider`: o `perfis.equipe_id` delas está
--    nulo e o retrato guarda a equipe que elas LIDERAVAM. É a regra deliberada
--    de `20260903330000` — para o líder, o vínculo vale mais que o cadastro.
--    Setor: 0 divergências.
--
-- 3. O ESTRAGO NO PIX (consulta 2). Dos 30 operadores com Pix em agosto na
--    BookPlay, 15 caíam na equipe errada: 565 acordos, R$ 2.037.140,69 no card
--    de outra equipe. A causa é uma reorganização de setembro — a equipe
--    «Bryan» foi dividida em «Matheus» e «Luciana» e depois APAGADA, então a
--    produção dela em agosto não tinha sequer onde cair.
--
-- 4. RÓTULOS (consulta 3). Oito equipes e um setor mudaram de nome ou sumiram:
--    «Tamires» → «Maria - Capitã», «Ariana / Mateus» → «Rhaissa / Mateus»,
--    «Digital Amauri - Play 4» → «Digital Bruno», «Treinamento» → «Equipe
--    Camila», «Amauri Digital» → «Marília Digital», e «Bryan» e «Brunno
--    Digital» apagadas.
--
-- 5. COBERTURA (consulta 4). Nenhum operador e nenhum setor com Pix em agosto
--    está fora do retrato, e nenhuma linha está sem setor. A correção não
--    deixa nada órfão.
--
-- ## Conclusão
--
-- Nenhum reparo de dado. O retrato estava certo; quem não o lia era a aba.
-- A correção é de código — ver `fetchRetratoPixDoMes` / `aplicarRetratoPix`.

-- ── 1. O retrato ainda descreve 31/08? ─────────────────────────────────────
-- Divergência esperada: só cargo `lider` (ver nota 2 acima).
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
em3108 AS (
  SELECT p.id, p.nome, p.perfil::TEXT AS cargo,
         NULLIF(COALESCE(
           (SELECT v.valor FROM val v WHERE v.id = p.id AND v.campo = 'equipe_id'),
           to_jsonb(p.equipe_id))::TEXT, 'null') AS eq_log
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id AND e.slug = 'bookplay'
)
SELECT x.nome, x.cargo,
       COALESCE(c.equipe_nome, '(sem equipe)') AS equipe_no_retrato
  FROM em3108 x
  JOIN public.composicao_mes c
    ON c.operador_id = x.id AND c.mes = '2026-08'
   AND c.empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
 WHERE x.eq_log IS DISTINCT FROM NULLIF(to_jsonb(c.equipe_id)::TEXT, 'null')
 ORDER BY x.cargo, x.nome;

-- ── 2. Quanto do Pix de agosto estava no card errado ───────────────────────
WITH pix AS (
  SELECT a.operador_id, a.operador_nome,
         count(*) AS acordos, sum(a.valor) AS valor
    FROM public.pix_automatico_acordos a
    JOIN public.empresas e ON e.id = a.empresa_id AND e.slug = 'bookplay'
   WHERE to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = '2026-08'
     AND a.status <> 'desaprovado'
   GROUP BY 1, 2
)
SELECT pix.operador_nome, p.perfil::TEXT AS cargo_hoje, pix.acordos, pix.valor,
       COALESCE(eq.nome, '(sem equipe)')      AS equipe_hoje,
       COALESCE(c.equipe_nome, '(sem equipe)') AS equipe_em_agosto
  FROM pix
  LEFT JOIN public.perfis p  ON p.id = pix.operador_id
  LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
  LEFT JOIN public.composicao_mes c
    ON c.operador_id = pix.operador_id AND c.mes = '2026-08'
   AND c.empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
 WHERE p.equipe_id IS DISTINCT FROM c.equipe_id
 ORDER BY pix.valor DESC;

-- ── 3. Rótulos que mudaram depois de agosto ────────────────────────────────
SELECT 'equipe' AS o, c.nome AS nome_em_agosto,
       COALESCE(e.nome, '(APAGADA depois)') AS nome_hoje
  FROM public.composicao_mes_equipe c
  LEFT JOIN public.equipes e ON e.id = c.equipe_id
 WHERE c.mes = '2026-08'
   AND c.empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
   AND COALESCE(e.nome, '') IS DISTINCT FROM c.nome
UNION ALL
SELECT 'setor', c.nome, COALESCE(s.nome, '(APAGADO depois)')
  FROM public.composicao_mes_setor c
  LEFT JOIN public.setores s ON s.id = c.setor_id
 WHERE c.mes = '2026-08'
   AND c.empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
   AND COALESCE(s.nome, '') IS DISTINCT FROM c.nome
 ORDER BY 1, 2;

-- ── 4. A correção deixa alguém órfão? ──────────────────────────────────────
-- Tudo zero = todo operador e todo setor com Pix em agosto estão no retrato.
WITH emp AS (SELECT id FROM public.empresas WHERE slug = 'bookplay'),
pix AS (
  SELECT DISTINCT a.operador_id, a.setor_id
    FROM public.pix_automatico_acordos a, emp
   WHERE a.empresa_id = emp.id
     AND to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = '2026-08'
)
SELECT count(DISTINCT pix.operador_id) AS operadores,
       count(DISTINCT pix.operador_id) FILTER (
         WHERE NOT EXISTS (
           SELECT 1 FROM public.composicao_mes c, emp
            WHERE c.empresa_id = emp.id AND c.mes = '2026-08'
              AND c.operador_id = pix.operador_id)) AS operador_fora_do_retrato,
       count(DISTINCT pix.setor_id) FILTER (
         WHERE pix.setor_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.composicao_mes_setor s, emp
              WHERE s.empresa_id = emp.id AND s.mes = '2026-08'
                AND s.setor_id = pix.setor_id)) AS setor_fora_do_retrato,
       count(*) FILTER (WHERE pix.setor_id IS NULL) AS linhas_sem_setor
  FROM pix;
