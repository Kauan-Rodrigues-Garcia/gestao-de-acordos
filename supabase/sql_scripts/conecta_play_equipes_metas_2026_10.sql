-- ============================================================================
-- Conecta Play (PaguePlay, regra Cofen): equipes e metas de outubro/2026
-- pelo «10 - Progresso Mensal (Metas).xlsx», aba Preencher (Cleber, 05/10/2026)
-- ============================================================================
--
-- Decisões do Cleber:
--   - Leticia Romeu: continua líder, agora da equipe da Bruna, junto com ela
--     (e deixa de liderar a equipe «Leticia Romeu», que fica vazia — a equipe
--     e a meta dela não são apagadas). Os 5 membros dela vão para a Bruna.
--   - Isabela Monteiro: vira líder do Treinamento (equipe «Isabela Monteiro»).
--   - Sai de equipe: Jhonata Nazawa (ouvidoria) e os desligados Aline Pupim,
--     Geovanna Almeida e Valquiria Xavier.
--   - Equipe «Layane» (vazia, fora da planilha) é apagada com a meta.
--   - Equipes renomeadas com os nomes da planilha.
--   - Treinamento: as 6 pessoas vêm da BookPlay pela TRANSFERÊNCIA DA TELA de
--     Usuários (relatório + acordos + fantasma). Este script já grava as metas
--     delas (empresa PaguePlay); a equipe é posta depois da transferência.
--
-- Metas: a planilha está em H.O.; o banco guarda bruto = H.O. ÷ 0,226
-- (empresas.config.ho_percentual da PaguePlay). Níveis: meta_valor = Desafio,
-- metas_extras = [Desafio 1, Desafio 2, Desafio 4]. Proporcional = coluna SIM.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Os 5 da equipe da Leticia vão para a da Bruna ────────────────────────
UPDATE public.perfis SET equipe_id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7'
 WHERE id IN ('701bbce0-88aa-452f-aeb2-89febe8070ac',   -- Kaue Nadai
              '4513dbba-7a04-4a9b-931a-c14702df3ac7',   -- Mirella Arias
              '6db48dfe-cdf2-4502-be14-2ea6ffe693f0',   -- Tassiane Viana
              'b74a80fa-f5bf-49bf-b5f3-d1faa5ec6bb7',   -- Thais Mayara
              '905f5b4d-4b8b-4f83-8fc4-0fe41179542b');  -- Thauany Moura

-- ── 2. Saem de equipe ────────────────────────────────────────────────────────
UPDATE public.perfis SET equipe_id = NULL
 WHERE id IN ('8fa7149b-5db8-4c33-a61a-e2e98cbf1cd1',   -- Jhonata Nazawa (ouvidoria)
              'daae90ec-aede-4634-bdf5-2d56db3ac99c',   -- Aline Pupim (desligada)
              '71a89ccf-5356-478c-929f-1c3126d20b38',   -- Geovanna Almeida (desligada)
              '6c8553d5-ed68-477b-81c5-5b72ac942f43');  -- Valquiria Xavier (desligada)

-- ── 3. Isabela Monteiro: líder do Treinamento ───────────────────────────────
UPDATE public.perfis SET perfil = 'lider', equipe_id = NULL
 WHERE id = '8259396e-8c88-44c2-b12f-474f3df51776';
INSERT INTO public.equipe_lideres (empresa_id, equipe_id, lider_id)
SELECT 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0', '5db02ddb-e313-44f9-950a-8216d3377621', '8259396e-8c88-44c2-b12f-474f3df51776'
 WHERE NOT EXISTS (SELECT 1 FROM public.equipe_lideres
                    WHERE equipe_id = '5db02ddb-e313-44f9-950a-8216d3377621'
                      AND lider_id  = '8259396e-8c88-44c2-b12f-474f3df51776');

-- ── 3b. Leticia Romeu: co-líder da equipe da Bruna ──────────────────────────
INSERT INTO public.equipe_lideres (empresa_id, equipe_id, lider_id)
SELECT 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0', '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7', 'd39fbe72-0e9a-4f79-9953-8cb8eabb7ce5'
 WHERE NOT EXISTS (SELECT 1 FROM public.equipe_lideres
                    WHERE equipe_id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7'
                      AND lider_id  = 'd39fbe72-0e9a-4f79-9953-8cb8eabb7ce5');
DELETE FROM public.equipe_lideres
 WHERE equipe_id = 'a34f0b0c-76fb-4876-af06-e34e36c2e625'
   AND lider_id  = 'd39fbe72-0e9a-4f79-9953-8cb8eabb7ce5';

-- ── 4. Equipe Layane: apagada, com a meta ───────────────────────────────────
DELETE FROM public.metas WHERE tipo = 'equipe' AND referencia_id = 'd3f8f3f1-a627-48ad-aa7b-50df259ecbc0';
DELETE FROM public.equipes WHERE id = 'd3f8f3f1-a627-48ad-aa7b-50df259ecbc0';

-- ── 5. Nomes da planilha ─────────────────────────────────────────────────────
UPDATE public.equipes SET nome = 'COFEN BRUNA CHATPLAY'      WHERE id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7';
UPDATE public.equipes SET nome = 'COFEN KÁTIA 2º TURNO'      WHERE id = '14ad6964-17cc-4d84-8518-cda220db53fb';
UPDATE public.equipes SET nome = 'COFEN MARÍLIA - STEPHANIE' WHERE id = '81d8066f-ee60-44f1-85e9-c7406edd2db7';
UPDATE public.equipes SET nome = 'TREINAMENTO / ISABELLA'    WHERE id = '5db02ddb-e313-44f9-950a-8216d3377621';

-- ── 6. Meta da equipe da Bruna: 350.000 H.O. ────────────────────────────────
UPDATE public.metas SET meta_valor = 1548672.57, updated_at = now()
 WHERE tipo = 'equipe' AND referencia_id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7'
   AND empresa_id = 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0' AND mes = 10 AND ano = 2026;

-- ── 7. Metas individuais de outubro (34 pessoas; Leticia Romeu fora) ─────────
INSERT INTO public.metas AS m (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, metas_extras, meta_proporcional, mes, ano)
SELECT v.tipo, v.ref, 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0'::uuid, v.valor, 0, v.extras, v.prop, 10, 2026
  FROM (VALUES
  ('operador', '471aeeb3-10f5-4156-b8e9-cb284ec854e0'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, true), -- Diego Rodrigues: H.O. (22000, 26000, 30000, 34000)
  ('operador', '701bbce0-88aa-452f-aeb2-89febe8070ac'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, true), -- Kaue Nadai: H.O. (22000, 26000, 30000, 34000)
  ('operador', 'cd6470b5-59df-48dd-8e99-094e72a5aa78'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Silva Beatriz: H.O. (30000, 34000, 38000, 42000)
  ('operador', '6db48dfe-cdf2-4502-be14-2ea6ffe693f0'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, false), -- Tassiane Viana: H.O. (22000, 26000, 30000, 34000)
  ('operador', 'b74a80fa-f5bf-49bf-b5f3-d1faa5ec6bb7'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, false), -- Thais Mayara: H.O. (22000, 26000, 30000, 34000)
  ('operador', '905f5b4d-4b8b-4f83-8fc4-0fe41179542b'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, false), -- Thauany Moura: H.O. (22000, 26000, 30000, 34000)
  ('operador', '75ff69ac-3cef-437e-b7d0-da99ebd1f9a4'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Amabelly Santos: H.O. (30000, 34000, 38000, 42000)
  ('operador', '523aefd7-2b6f-4633-bc9f-774e79348ef2'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Caio Shimite: H.O. (30000, 34000, 38000, 42000)
  ('operador', '31c68daa-3d75-4c52-b014-c8521b899831'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Caroline Valverde: H.O. (30000, 34000, 38000, 42000)
  ('operador', '4513dbba-7a04-4a9b-931a-c14702df3ac7'::uuid, 97345.13, '[115044.25, 132743.36, 150442.48]'::jsonb, true), -- Mirella Arias: H.O. (22000, 26000, 30000, 34000)
  ('operador', '90895b4a-1356-4d4b-8863-599f0ed956ad'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Raissa Paloma: H.O. (30000, 34000, 38000, 42000)
  ('operador', '5bb7e740-e179-4f0e-a254-ef4f0ae34793'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Stephanie Fagundes: H.O. (30000, 34000, 38000, 42000)
  ('operador', 'b9a3224c-7608-47c7-b914-7ada497cb0ab'::uuid, 132743.36, '[150442.48, 168141.59, 185840.71]'::jsonb, false), -- Thayla Santana: H.O. (30000, 34000, 38000, 42000)
  ('operador', '4839017a-4e50-4379-9cc1-030c69dcd5c0'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Giovana Souza: H.O. (18000, 24000, 28000, 32000)
  ('operador', 'fd294905-6d10-4b48-9161-1bcd1b113467'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true), -- Debora Sobrinho: H.O. (12000, 16000, 20000, 24000)
  ('operador', 'c0ad121a-d7bd-4bcb-a96a-fcb5a882e4bb'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Gisleide Guedes: H.O. (18000, 24000, 28000, 32000)
  ('operador', '01c25174-e425-4be7-9216-ef8a1ba6ade7'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true), -- Jade Faustino: H.O. (12000, 16000, 20000, 24000)
  ('operador', 'a700a9ee-2672-47eb-871d-295e6eafbb25'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Kauane Azevedo: H.O. (18000, 24000, 28000, 32000)
  ('operador', '0785af5a-f0da-4b97-99ee-9170947c30f9'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Rayssa R. Oliveira: H.O. (18000, 24000, 28000, 32000)
  ('operador', '754afad1-bd60-478c-b7b6-22e760164bb5'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Manuela Marini: H.O. (5000, 9000, 13000, 17000)
  ('operador', '8616852d-2ccc-4e7e-997a-e11bbb6a58bc'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Allana Barbosa: H.O. (5000, 9000, 13000, 17000)
  ('operador', 'd4fb8410-5100-49fc-b499-2933e1d110e6'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Kethely Santos: H.O. (5000, 9000, 13000, 17000)
  ('operador', 'e4f2a6ee-1f37-4614-8053-7f001c3859bc'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Leticia Quinallia: H.O. (5000, 9000, 13000, 17000)
  ('operador', 'f480140a-6acd-4373-8dd2-55ec22be3346'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Sophia Costa: H.O. (5000, 9000, 13000, 17000)
  ('operador', 'ea1df409-6fdd-404d-95d9-9f5b1b666bc4'::uuid, 22123.89, '[39823.01, 57522.12, 75221.24]'::jsonb, true), -- Luan Pinto: H.O. (5000, 9000, 13000, 17000)
  ('operador', '8b917744-de12-442c-91e0-a24fab04461c'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true), -- Bruna Teles: H.O. (12000, 16000, 20000, 24000)
  ('operador', '75a01a7a-c640-4334-b1f6-f0d2b0cdb150'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Bruna Garbi: H.O. (18000, 24000, 28000, 32000)
  ('operador', '3e2ea21b-c43e-479e-9cec-a294f512dcbc'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Claudineia Messias: H.O. (18000, 24000, 28000, 32000)
  ('operador', 'eac22ec4-fdff-4f48-98cd-a1ca4e26f641'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true), -- Isabella Santos: H.O. (12000, 16000, 20000, 24000)
  ('operador', 'a198fb76-f29b-4f4e-8918-6ed3cdfae4a2'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Itallo Cardamoni: H.O. (18000, 24000, 28000, 32000)
  ('operador', 'a9745768-c048-4947-9f13-06d137875aee'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Joao Anguita: H.O. (18000, 24000, 28000, 32000)
  ('operador', '603b8153-23eb-496f-a31d-808d9a3eff06'::uuid, 79646.02, '[106194.69, 123893.81, 141592.92]'::jsonb, false), -- Karina Colonez: H.O. (18000, 24000, 28000, 32000)
  ('operador', '5857df5d-b2d0-494f-bb52-2b5c49f8b8fe'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true), -- Leonardo Costa: H.O. (12000, 16000, 20000, 24000)
  ('operador', '6f98b9d0-6d33-4bee-8bda-854264bdadaf'::uuid, 53097.35, '[70796.46, 88495.58, 106194.69]'::jsonb, true) -- Rebeca Camargo: H.O. (12000, 16000, 20000, 24000)
  ) AS v(tipo, ref, valor, extras, prop)
ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
   SET meta_valor = excluded.meta_valor, metas_extras = excluded.metas_extras,
       meta_proporcional = excluded.meta_proporcional, updated_at = now();

-- ── Prova: confere e desfaz tudo se algo não bater ──────────────────────────
DO $prova$
DECLARE
  v_bruna   int; v_katia int; v_steph int; v_trein_lider int; v_metas int; v_layane int; v_bruna_lideres int;
BEGIN
  SELECT count(*) INTO v_bruna FROM public.equipe_membros WHERE equipe_id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7' AND papel = 'membro';
  SELECT count(*) INTO v_katia FROM public.equipe_membros WHERE equipe_id = '14ad6964-17cc-4d84-8518-cda220db53fb' AND papel = 'membro';
  SELECT count(*) INTO v_steph FROM public.equipe_membros WHERE equipe_id = '81d8066f-ee60-44f1-85e9-c7406edd2db7' AND papel = 'membro';
  SELECT count(*) INTO v_trein_lider FROM public.equipe_membros
   WHERE equipe_id = '5db02ddb-e313-44f9-950a-8216d3377621' AND papel = 'lider' AND pessoa_id = '8259396e-8c88-44c2-b12f-474f3df51776';
  SELECT count(*) INTO v_metas FROM public.metas
   WHERE tipo = 'operador' AND empresa_id = 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0' AND mes = 10 AND ano = 2026
     AND jsonb_array_length(metas_extras) = 3 AND updated_at > now() - interval '1 minute';
  SELECT count(*) INTO v_layane FROM public.equipes WHERE id = 'd3f8f3f1-a627-48ad-aa7b-50df259ecbc0';
  SELECT count(*) INTO v_bruna_lideres FROM public.equipe_membros
   WHERE equipe_id = '5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7' AND papel = 'lider'
     AND pessoa_id IN ('17fbd0f4-c98e-4eb2-9e8d-7a4ab8d44134', 'd39fbe72-0e9a-4f79-9953-8cb8eabb7ce5');
  IF v_bruna_lideres <> 2 THEN RAISE EXCEPTION 'Bruna e Leticia deveriam liderar a equipe juntas, achei % líderes', v_bruna_lideres; END IF;
  IF v_bruna <> 13 THEN RAISE EXCEPTION 'Bruna deveria ter 13 membros (14 da planilha menos a Leticia), tem %', v_bruna; END IF;
  IF v_katia <> 6  THEN RAISE EXCEPTION 'Kátia deveria ter 6 membros, tem %', v_katia; END IF;
  IF v_steph <> 9  THEN RAISE EXCEPTION 'Stephanie deveria ter 9 membros, tem %', v_steph; END IF;
  IF v_trein_lider <> 1 THEN RAISE EXCEPTION 'Isabela Monteiro não ficou líder do Treinamento'; END IF;
  IF v_metas < 34 THEN RAISE EXCEPTION 'esperava 34 metas gravadas agora, foram %', v_metas; END IF;
  IF v_layane <> 0 THEN RAISE EXCEPTION 'equipe Layane não foi apagada'; END IF;
END
$prova$;

COMMIT;

SELECT e.nome AS equipe,
       count(*) FILTER (WHERE m.papel = 'membro') AS membros,
       string_agg(p.nome, ', ' ORDER BY p.nome) FILTER (WHERE m.papel = 'lider') AS lider
  FROM public.equipes e
  LEFT JOIN public.equipe_membros m ON m.equipe_id = e.id
  LEFT JOIN public.perfis p ON p.id = m.pessoa_id
 WHERE e.setor_id = '4c44cd71-378d-43aa-a1f6-7dd39339839f'
 GROUP BY e.nome ORDER BY e.nome;
