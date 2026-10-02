-- ============================================================================
-- Play 2 (BookPlay) — equipe Luan/Gaby: metas de setembro copiadas para
-- outubro/2026
-- ============================================================================
--
-- Pedido de 02/10/2026: «a equipe do Luan/Gaby segue a mesma meta do mês
-- passado; copie para este mês só as metas dessa equipe».
--
-- Copia, de setembro para outubro:
--   - a meta da EQUIPE;
--   - a meta de cada OPERADOR que está hoje na equipe e tinha meta em setembro.
-- Vai a linha inteira: meta, degraus (metas_extras), meta em quantidade,
-- proporcional, meta indireta e régua. Linha de outubro que já exista é
-- SUBSTITUÍDA pela de setembro.
--
-- Não toca: outras equipes, a meta do setor Play 2, nem quem saiu da equipe
-- depois de setembro. Quem está na equipe e NÃO tinha meta em setembro fica
-- sem meta em outubro — a tabela final lista essas pessoas como «sem meta em
-- setembro».
--
-- A equipe é achada no setor Play 2 da BookPlay pelo nome com «luan» e «gaby»
-- (sem acento/maiúscula/espaço). Precisa achar UMA; senão, não grava nada e
-- lista as equipes do Play 2. Recusa também se a meta do Play 2 estiver
-- validada em outubro.
--
-- Reexecutável: rodar de novo regrava os mesmos valores.
-- ============================================================================

create or replace function pg_temp.norm(t text) returns text
language sql immutable as $fn$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '[^a-z0-9]', '', 'g')
$fn$;

drop table if exists pg_temp._alvo;
create temp table _alvo (chave text primary key, id uuid);

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_ano     CONSTANT INTEGER := 2026;
  c_de      CONSTANT INTEGER := 9;
  c_para    CONSTANT INTEGER := 10;
  v_setor   UUID;
  v_equipe  UUID;
  v_n       INTEGER;
  v_lista   TEXT;
  v_copiar  INTEGER;
  v_conferem INTEGER;
BEGIN
  -- 1. Setor Play 2 da BookPlay.
  SELECT count(*), min(s.id::text)::uuid, string_agg(s.nome, ' | ')
    INTO v_n, v_setor, v_lista
    FROM public.setores s
   WHERE s.empresa_id = c_empresa AND s.ativo AND pg_temp.norm(s.nome) = 'play2';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Setor Play 2 na BookPlay: esperava 1, achei % (%).', v_n, coalesce(v_lista, 'nenhum');
  END IF;

  IF public.fn_metas_esta_validada(c_empresa, v_setor, c_para, c_ano) THEN
    RAISE EXCEPTION 'A meta do Play 2 está validada em outubro/2026: reabra antes de copiar.';
  END IF;

  -- 2. Equipe Luan/Gaby.
  SELECT count(*), min(e.id::text)::uuid
    INTO v_n, v_equipe
    FROM public.equipes e
   WHERE e.setor_id = v_setor
     AND pg_temp.norm(e.nome) LIKE '%luan%'
     AND pg_temp.norm(e.nome) LIKE '%gaby%';
  IF v_n <> 1 THEN
    SELECT string_agg(e.nome, ' | ' ORDER BY e.nome) INTO v_lista
      FROM public.equipes e WHERE e.setor_id = v_setor;
    RAISE EXCEPTION 'Equipe Luan/Gaby no Play 2: esperava 1, achei %. Equipes do Play 2: %',
      v_n, coalesce(v_lista, 'nenhuma');
  END IF;

  INSERT INTO _alvo VALUES ('setor', v_setor), ('equipe', v_equipe);

  -- 3. O que copiar: a equipe + quem está nela hoje, com meta em setembro.
  CREATE TEMP TABLE _copiar ON COMMIT DROP AS
  SELECT m.*
    FROM public.metas m
   WHERE m.empresa_id = c_empresa AND m.ano = c_ano AND m.mes = c_de
     AND ((m.tipo = 'equipe' AND m.referencia_id = v_equipe)
       OR (m.tipo = 'operador' AND m.referencia_id IN (
             SELECT p.id FROM public.perfis p
              WHERE p.empresa_id = c_empresa AND p.equipe_id = v_equipe)));

  SELECT count(*) INTO v_copiar FROM _copiar;
  IF v_copiar = 0 THEN
    RAISE EXCEPTION 'Nada a copiar: a equipe Luan/Gaby não tem meta em setembro/2026.';
  END IF;

  INSERT INTO public.metas
    (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, metas_extras,
     meta_proporcional, meta_indireta_ativa, meta_indireta_valor, regua, mes, ano)
  SELECT tipo, referencia_id, empresa_id, meta_valor, meta_acordos, metas_extras,
         meta_proporcional, meta_indireta_ativa, meta_indireta_valor, regua, c_para, c_ano
    FROM _copiar
  ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
     SET meta_valor          = EXCLUDED.meta_valor,
         meta_acordos        = EXCLUDED.meta_acordos,
         metas_extras        = EXCLUDED.metas_extras,
         meta_proporcional   = EXCLUDED.meta_proporcional,
         meta_indireta_ativa = EXCLUDED.meta_indireta_ativa,
         meta_indireta_valor = EXCLUDED.meta_indireta_valor,
         regua               = EXCLUDED.regua,
         updated_at          = NOW();

  -- 4. Prova: cada linha de setembro tem a gêmea igual em outubro.
  SELECT count(*) INTO v_conferem
    FROM _copiar s
    JOIN public.metas o
      ON o.tipo = s.tipo AND o.referencia_id = s.referencia_id
     AND o.empresa_id = s.empresa_id AND o.ano = c_ano AND o.mes = c_para
   WHERE o.meta_valor = s.meta_valor
     AND o.meta_acordos = s.meta_acordos
     AND o.metas_extras = s.metas_extras
     AND o.meta_proporcional = s.meta_proporcional
     AND o.meta_indireta_ativa = s.meta_indireta_ativa
     AND o.meta_indireta_valor = s.meta_indireta_valor
     AND o.regua IS NOT DISTINCT FROM s.regua;
  IF v_conferem <> v_copiar THEN
    RAISE EXCEPTION 'Esperadas % linhas copiadas, conferem %.', v_copiar, v_conferem;
  END IF;
END
$metas$;

COMMIT;

-- Conferência na tela do SQL Editor: setembro × outubro da equipe.
SELECT CASE WHEN x.tipo = 'equipe' THEN 'EQUIPE' ELSE p.usuario END AS quem,
       coalesce(e.nome, p.nome) AS nome,
       s.meta_valor   AS setembro,
       o.meta_valor   AS outubro,
       o.metas_extras AS degraus_outubro,
       CASE WHEN s.id IS NULL THEN 'sem meta em setembro' ELSE 'copiada' END AS situacao
  FROM (
    SELECT 'equipe' AS tipo, a.id AS referencia_id FROM _alvo a WHERE a.chave = 'equipe'
    UNION ALL
    SELECT 'operador', p.id FROM public.perfis p
     WHERE p.equipe_id = (SELECT id FROM _alvo WHERE chave = 'equipe')
  ) x
  LEFT JOIN public.perfis  p ON x.tipo = 'operador' AND p.id = x.referencia_id
  LEFT JOIN public.equipes e ON x.tipo = 'equipe'   AND e.id = x.referencia_id
  LEFT JOIN public.metas s
    ON s.tipo = x.tipo AND s.referencia_id = x.referencia_id
   AND s.empresa_id = '9bed94cd-605d-4d43-9afb-352c72b05c50' AND s.ano = 2026 AND s.mes = 9
  LEFT JOIN public.metas o
    ON o.tipo = x.tipo AND o.referencia_id = x.referencia_id
   AND o.empresa_id = '9bed94cd-605d-4d43-9afb-352c72b05c50' AND o.ano = 2026 AND o.mes = 10
 ORDER BY x.tipo, p.nome;
