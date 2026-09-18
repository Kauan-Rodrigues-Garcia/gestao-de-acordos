-- ============================================================================
-- Crachás de uma planilha, casados pelo NOME com o cadastro de um setor
-- + cidade dos setores no RH
-- ============================================================================
--
-- Pedido de 18/09/2026: vincular as pessoas da planilha «Relatório de
-- Premiações e Comissões» aos usuários que já existem no Receptivo e deixar o
-- crachá preenchido. O crachá mora em `rh_dados_operadores` (a tabela do RH
-- Gestão), e é de lá que a aba Fechamento › Premiações e Comissões lê.
--
-- ## A lista NÃO vai para o git
--
-- O repositório é público, e crachá + nome completo é dado de pessoa. Este
-- arquivo é o MODELO: a lógica, com uma linha de exemplo no lugar da planilha.
-- A cópia preenchida (as 20 pessoas de agosto/2026) fica em
-- `work/receptivo_crachas_premiacoes_2026_09.sql`, pasta ignorada pelo git.
-- Para outra planilha: copie para `work/`, troque as linhas de `planilha` nas
-- PARTES 1 e 2 (as duas iguais) e, se for outro setor, o `setor_id`.
--
-- NÃO é migration: é dado de uma empresa, rodado uma vez. Três partes, cada uma
-- rodada sozinha, na ordem:
--
--   PARTE 1 — leitura. A prévia do casamento nome da planilha → usuário.
--   PARTE 2 — escrita. Grava o crachá de quem casou sem dúvida.
--   PARTE 3 — escrita. Liga os setores que faltam à cidade no RH.
--
-- ## Como o nome casa
--
-- A planilha traz o nome completo («ANA BEATRIZ DA SILVA ROCHA»); o cadastro,
-- em geral, nome e sobrenome («Ana Rocha»). Os dois viram palavras sem
-- acento e sem «da/de/do/das/dos/e». Casa quando TODAS as palavras do cadastro
-- aparecem no nome completo (igual, ou uma começa com a outra a partir de 4
-- letras — «Pereiraa» × «PEREIRA») e a primeira palavra do cadastro é o 1º ou
-- o 2º nome da planilha. Vence o candidato com mais palavras iguais; empate
-- não casa.
--
-- Sem candidato nenhum, vale o PRIMEIRO NOME sozinho se só houver uma pessoa
-- com ele no setor — marcado «só o primeiro nome» na prévia, para conferir.
--
-- ## O que a gravação NÃO faz
--
--   • não troca crachá que já existe e é diferente (sai na prévia);
--   • não grava crachá que já é de outra pessoa (o índice único recusaria);
--   • não grava quem ficou «ambíguo», «não encontrado» ou «usuário repetido».
--
-- Nome cortado na planilha (coluna estreita) casa do mesmo jeito: a regra olha
-- as palavras do cadastro, não as da planilha — o crachá é o que vale.
-- ============================================================================


-- ── PARTE 1 — leitura: a prévia ─────────────────────────────────────────────
WITH
parametros AS (
  SELECT '9bed94cd-605d-4d43-9afb-352c72b05c50'::UUID AS empresa_id,
         '6dd54018-e78f-4f3b-bca3-4221fe97f38b'::UUID AS setor_id
),
planilha(cracha, nome_completo) AS (VALUES
  -- As linhas da planilha, uma por pessoa: ('crachá', 'NOME COMPLETO').
  ('0000000', 'NOME COMPLETO DA PLANILHA')
),
pl AS (
  SELECT x.cracha, x.nome_completo,
         ARRAY(SELECT u.t
                 FROM unnest(regexp_split_to_array(lower(translate(x.nome_completo,
                        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
                        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+'))
                      WITH ORDINALITY AS u(t, i)
                WHERE u.t <> '' AND u.t NOT IN ('da', 'de', 'do', 'das', 'dos', 'e')
                ORDER BY u.i) AS tk
    FROM planilha x
),
pf AS (
  SELECT p.id, p.nome, p.perfil, p.ativo,
         ARRAY(SELECT u.t
                 FROM unnest(regexp_split_to_array(lower(translate(p.nome,
                        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
                        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+'))
                      WITH ORDINALITY AS u(t, i)
                WHERE u.t <> '' AND u.t NOT IN ('da', 'de', 'do', 'das', 'dos', 'e')
                ORDER BY u.i) AS tk
    FROM public.perfis p
    JOIN parametros k ON k.empresa_id = p.empresa_id AND k.setor_id = p.setor_id
),
par AS (
  SELECT pl.cracha, pf.id AS operador_id,
         (SELECT bool_and(EXISTS (
                   SELECT 1 FROM unnest(pl.tk) u
                    WHERE u = t OR (length(t) >= 4 AND length(u) >= 4
                                    AND (u LIKE t || '%' OR t LIKE u || '%'))))
            FROM unnest(pf.tk) t) AS todas,
         EXISTS (SELECT 1 FROM unnest(pl.tk[1:2]) u
                  WHERE u = pf.tk[1] OR (length(u) >= 4 AND length(pf.tk[1]) >= 4
                                         AND (u LIKE pf.tk[1] || '%' OR pf.tk[1] LIKE u || '%'))) AS primeiro,
         (SELECT count(*) FROM unnest(pf.tk) t WHERE t = ANY(pl.tk)) AS iguais
    FROM pl CROSS JOIN pf
   WHERE cardinality(pf.tk) > 0
),
candidatos AS (
  SELECT cracha, operador_id, iguais,
         max(iguais) OVER (PARTITION BY cracha) AS melhor
    FROM par WHERE todas AND primeiro
),
pelo_nome AS (
  SELECT cracha, min(operador_id::TEXT)::UUID AS operador_id, count(*) AS empatados
    FROM candidatos WHERE iguais = melhor
   GROUP BY cracha
),
pelo_primeiro AS (
  SELECT pl.cracha, min(pf.id::TEXT)::UUID AS operador_id, count(*) AS quantos
    FROM pl JOIN pf ON pf.tk[1] = pl.tk[1]
   WHERE pl.cracha NOT IN (SELECT cracha FROM candidatos)
   GROUP BY pl.cracha
),
casamento AS (
  SELECT pl.cracha, pl.nome_completo,
         CASE WHEN n.empatados = 1 THEN n.operador_id
              WHEN n.cracha IS NULL AND f.quantos = 1 THEN f.operador_id END AS operador_id,
         CASE WHEN n.empatados = 1 THEN 'nome'
              WHEN n.empatados > 1 THEN 'ambíguo'
              WHEN f.quantos = 1 THEN 'só o primeiro nome'
              WHEN f.quantos > 1 THEN 'ambíguo'
              ELSE 'não encontrado' END AS como
    FROM pl
    LEFT JOIN pelo_nome n ON n.cracha = pl.cracha
    LEFT JOIN pelo_primeiro f ON f.cracha = pl.cracha
),
final AS (
  SELECT c.cracha, c.nome_completo,
         CASE WHEN count(*) OVER (PARTITION BY c.operador_id) > 1 AND c.operador_id IS NOT NULL
              THEN NULL ELSE c.operador_id END AS operador_id,
         CASE WHEN count(*) OVER (PARTITION BY c.operador_id) > 1 AND c.operador_id IS NOT NULL
              THEN 'usuário repetido' ELSE c.como END AS como,
         c.operador_id AS operador_sugerido
    FROM casamento c
)
SELECT f.cracha,
       f.nome_completo                  AS nome_na_planilha,
       p.nome                           AS usuario_no_gestao,
       p.perfil                         AS cargo,
       p.ativo,
       f.como,
       d.cracha                         AS cracha_atual,
       outro.nome                       AS cracha_ja_e_de,
       CASE
         WHEN f.operador_id IS NULL                      THEN 'não grava'
         WHEN outro.nome IS NOT NULL                     THEN 'não grava (crachá de outra pessoa)'
         WHEN d.cracha IS NOT NULL AND btrim(d.cracha) <> '' AND d.cracha <> f.cracha
                                                          THEN 'não grava (já tem outro crachá)'
         WHEN d.cracha = f.cracha                        THEN 'já está gravado'
         ELSE 'grava'
       END                              AS acao
  FROM final f
  CROSS JOIN parametros k
  LEFT JOIN public.perfis p ON p.id = COALESCE(f.operador_id, f.operador_sugerido)
  LEFT JOIN public.rh_dados_operadores d
         ON d.empresa_id = k.empresa_id AND d.operador_id = f.operador_id
  LEFT JOIN LATERAL (
    SELECT pp.nome FROM public.rh_dados_operadores dd
      JOIN public.perfis pp ON pp.id = dd.operador_id
     WHERE dd.empresa_id = k.empresa_id AND dd.cracha = f.cracha
       AND dd.operador_id IS DISTINCT FROM f.operador_id
     LIMIT 1
  ) outro ON TRUE
 ORDER BY f.nome_completo;


-- ── PARTE 2 — escrita: grava os crachás que casaram ─────────────────────────
-- A mesma conta da PARTE 1; grava só a linha com ação «grava». Devolve o que
-- gravou.
WITH
parametros AS (
  SELECT '9bed94cd-605d-4d43-9afb-352c72b05c50'::UUID AS empresa_id,
         '6dd54018-e78f-4f3b-bca3-4221fe97f38b'::UUID AS setor_id
),
planilha(cracha, nome_completo) AS (VALUES
  -- As linhas da planilha, uma por pessoa: ('crachá', 'NOME COMPLETO').
  ('0000000', 'NOME COMPLETO DA PLANILHA')
),
pl AS (
  SELECT x.cracha, x.nome_completo,
         ARRAY(SELECT u.t
                 FROM unnest(regexp_split_to_array(lower(translate(x.nome_completo,
                        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
                        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+'))
                      WITH ORDINALITY AS u(t, i)
                WHERE u.t <> '' AND u.t NOT IN ('da', 'de', 'do', 'das', 'dos', 'e')
                ORDER BY u.i) AS tk
    FROM planilha x
),
pf AS (
  SELECT p.id, p.nome,
         ARRAY(SELECT u.t
                 FROM unnest(regexp_split_to_array(lower(translate(p.nome,
                        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
                        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+'))
                      WITH ORDINALITY AS u(t, i)
                WHERE u.t <> '' AND u.t NOT IN ('da', 'de', 'do', 'das', 'dos', 'e')
                ORDER BY u.i) AS tk
    FROM public.perfis p
    JOIN parametros k ON k.empresa_id = p.empresa_id AND k.setor_id = p.setor_id
),
par AS (
  SELECT pl.cracha, pf.id AS operador_id,
         (SELECT bool_and(EXISTS (
                   SELECT 1 FROM unnest(pl.tk) u
                    WHERE u = t OR (length(t) >= 4 AND length(u) >= 4
                                    AND (u LIKE t || '%' OR t LIKE u || '%'))))
            FROM unnest(pf.tk) t) AS todas,
         EXISTS (SELECT 1 FROM unnest(pl.tk[1:2]) u
                  WHERE u = pf.tk[1] OR (length(u) >= 4 AND length(pf.tk[1]) >= 4
                                         AND (u LIKE pf.tk[1] || '%' OR pf.tk[1] LIKE u || '%'))) AS primeiro,
         (SELECT count(*) FROM unnest(pf.tk) t WHERE t = ANY(pl.tk)) AS iguais
    FROM pl CROSS JOIN pf
   WHERE cardinality(pf.tk) > 0
),
candidatos AS (
  SELECT cracha, operador_id, iguais,
         max(iguais) OVER (PARTITION BY cracha) AS melhor
    FROM par WHERE todas AND primeiro
),
pelo_nome AS (
  SELECT cracha, min(operador_id::TEXT)::UUID AS operador_id, count(*) AS empatados
    FROM candidatos WHERE iguais = melhor
   GROUP BY cracha
),
pelo_primeiro AS (
  SELECT pl.cracha, min(pf.id::TEXT)::UUID AS operador_id, count(*) AS quantos
    FROM pl JOIN pf ON pf.tk[1] = pl.tk[1]
   WHERE pl.cracha NOT IN (SELECT cracha FROM candidatos)
   GROUP BY pl.cracha
),
casamento AS (
  SELECT pl.cracha,
         CASE WHEN n.empatados = 1 THEN n.operador_id
              WHEN n.cracha IS NULL AND f.quantos = 1 THEN f.operador_id END AS operador_id
    FROM pl
    LEFT JOIN pelo_nome n ON n.cracha = pl.cracha
    LEFT JOIN pelo_primeiro f ON f.cracha = pl.cracha
),
final AS (
  SELECT c.cracha, c.operador_id
    FROM casamento c
   WHERE c.operador_id IS NOT NULL
     AND (SELECT count(*) FROM casamento o WHERE o.operador_id = c.operador_id) = 1
),
a_gravar AS (
  SELECT k.empresa_id, f.operador_id, f.cracha
    FROM final f CROSS JOIN parametros k
   WHERE NOT EXISTS (
           SELECT 1 FROM public.rh_dados_operadores dd
            WHERE dd.empresa_id = k.empresa_id AND dd.cracha = f.cracha
              AND dd.operador_id <> f.operador_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.rh_dados_operadores d
            WHERE d.empresa_id = k.empresa_id AND d.operador_id = f.operador_id
              AND d.cracha IS NOT NULL AND btrim(d.cracha) <> '')
),
gravados AS (
  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  )
  SELECT empresa_id, operador_id, cracha, NULL,
         'Planilha Premiações e Comissões ago/2026 (script 18/09/2026)'
    FROM a_gravar
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha              = EXCLUDED.cracha,
        atualizado_por      = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em       = NOW()
    WHERE public.rh_dados_operadores.cracha IS NULL
       OR btrim(public.rh_dados_operadores.cracha) = ''
  RETURNING operador_id, cracha
)
SELECT g.cracha, p.nome AS usuario_no_gestao
  FROM gravados g JOIN public.perfis p ON p.id = g.operador_id
 ORDER BY p.nome;


-- ── PARTE 3 — escrita: cidade dos setores no RH ─────────────────────────────
-- A migration 20260823092000 ligou os setores pelo nome EXATO («Receptivo»);
-- setor gravado «RECEPTIVO» ou «Play Mix Marilia» ficou de fora. Aqui o nome é
-- comparado sem acento, sem espaço e sem maiúscula. Só cria o que falta:
-- setor já configurado não muda de cidade nem de tipo.
--
--   Birigui  → premiação: Jornada, Manutenção, Play 1, Play 2, Play 3, Receptivo
--   Marília  → comissão:  Play 4, Play 5, Amauri Digital, Play Mix Marília
WITH
parametros AS (
  SELECT '9bed94cd-605d-4d43-9afb-352c72b05c50'::UUID AS empresa_id
),
celulas AS (
  INSERT INTO public.rh_celulas (empresa_id, nome, ordem)
  SELECT k.empresa_id, c.nome, c.ordem
    FROM parametros k
   CROSS JOIN (VALUES ('Birigui', 1), ('Marília', 2)) AS c(nome, ordem)
  ON CONFLICT (empresa_id, nome) DO UPDATE SET nome = EXCLUDED.nome
  RETURNING id, nome
),
lista(celula, tipo, setor) AS (VALUES
  ('Birigui', 'premiacao', 'Jornada'),
  ('Birigui', 'premiacao', 'Manutenção'),
  ('Birigui', 'premiacao', 'Play 1'),
  ('Birigui', 'premiacao', 'Play 2'),
  ('Birigui', 'premiacao', 'Play 3'),
  ('Birigui', 'premiacao', 'Receptivo'),
  ('Marília', 'comissao',  'Play 4'),
  ('Marília', 'comissao',  'Play 5'),
  ('Marília', 'comissao',  'Amauri Digital'),
  ('Marília', 'comissao',  'Play Mix Marília')
),
setores_norm AS (
  SELECT s.id, s.nome,
         regexp_replace(lower(translate(s.nome,
           'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
           'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]', '', 'g') AS chave
    FROM public.setores s JOIN parametros k ON k.empresa_id = s.empresa_id
),
ligados AS (
  INSERT INTO public.rh_config_setores (empresa_id, setor_id, celula_id, tipo_remuneracao)
  SELECT k.empresa_id, s.id, c.id, l.tipo
    FROM lista l
   CROSS JOIN parametros k
    JOIN celulas c ON c.nome = l.celula
    JOIN setores_norm s ON s.chave = regexp_replace(lower(translate(l.setor,
           'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
           'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '[^a-z0-9]', '', 'g')
  ON CONFLICT (empresa_id, setor_id) DO NOTHING
  RETURNING setor_id, celula_id, tipo_remuneracao
)
SELECT s.nome AS setor, c.nome AS cidade, g.tipo_remuneracao AS tipo, 'ligado agora' AS estado
  FROM ligados g
  JOIN public.setores s ON s.id = g.setor_id
  JOIN celulas c ON c.id = g.celula_id
 ORDER BY c.nome, s.nome;
