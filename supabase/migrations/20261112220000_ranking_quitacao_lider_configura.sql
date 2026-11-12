-- ============================================================================
-- 20261112220000_ranking_quitacao_lider_configura.sql
--
-- Ranking de quitação: o líder configura o ranking do PRÓPRIO setor, na aba
-- (pedido de 12/11/2026).
--
-- ## Por quê
--
-- Configurar (quem disputa, o que conta, prêmios, destaques) só era possível
-- com `ranking_quitacao_configurar`, que nasce para ninguém e alcança todos os
-- setores — na prática, só o administrador, em Configurações › Eventos. O
-- pedido é o líder ajustar o ranking dele sem depender disso.
--
-- ## O que entra
--
-- 1. A chave `ranking_quitacao_configurar_setor` («Ranking de quitação:
--    configurar o do próprio setor»), que nasce para `lider` e `gerencia`.
--    Semeada só onde ainda não existe (o que já está configurado não muda).
-- 2. `fn_ranking_quitacao_definir_setor` aceita quem tem essa chave, com três
--    limites, conferidos AQUI (o botão escondido é só conveniência):
--      a. só nos setores da pessoa (`fn_setores_do_operador`: o do perfil e os
--         das equipes em que é líder);
--      b. só em setor que JÁ tem o ranking ligado;
--      c. não liga nem desliga (`p_ativo` precisa ser verdadeiro ou nulo):
--         em que setor o ranking existe continua com quem tem a chave geral.
--    Cargo de acesso total segue alcançando tudo (como em toda chave).
-- 3. A config aceita `aceita` = 'todas' | 'so_quitacao' (o filtro mora em
--    20261112230000).
--
-- O corpo da função é o de 20261111150500 com a trava nova; validação da
-- config, gravação e aviso às TVs e à aba não mudam.
--
-- Reverter: reaplicar a seção 6 de 20261111150500; renomear
-- fn_permissoes_catalogo_antes_ranking_quitacao_setor_20261112 de volta para
-- fn_permissoes_catalogo (a chave semeada fica sem efeito).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. A chave ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_ranking_quitacao_setor_20261112()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_ranking_quitacao_setor_20261112;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_ranking_quitacao_setor_20261112() IS
  'Retrato do catalogo antes de ranking_quitacao_configurar_setor (12/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_ranking_quitacao_setor_20261112()
  UNION ALL
  SELECT * FROM (VALUES
    -- O líder (e a gerência) configura o ranking dos próprios setores, na aba.
    ('ranking_quitacao_configurar_setor', NULL::TEXT[], ARRAY['lider','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261112220000 soma ranking_quitacao_configurar_setor.';

-- Semeia só as chaves ausentes (o que já está configurado não muda).
DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 2. Configurar o setor ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_definir_setor(
  p_empresa_id UUID, p_setor_id UUID, p_ativo BOOLEAN,
  p_premios NUMERIC[] DEFAULT NULL, p_config JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_premios NUMERIC[];
  v_x       JSONB;
  v_fora    TEXT;
  v_geral   BOOLEAN;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Setor nao encontrado nesta empresa.';
  END IF;

  v_geral := public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_configurar');
  -- 20261112220000: o líder, só no próprio setor, já ligado, sem ligar/desligar.
  IF NOT v_geral THEN
    IF NOT public.fn_user_tem('ranking_quitacao_configurar_setor') THEN
      RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
    END IF;
    IF NOT (p_setor_id IN (SELECT public.fn_setores_do_operador((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Voce so configura o Ranking de quitacao do seu setor.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ranking_quitacao_setores s
                    WHERE s.empresa_id = p_empresa_id AND s.setor_id = p_setor_id AND s.ativo) THEN
      RAISE EXCEPTION 'O Ranking de quitacao nao esta ligado neste setor. Quem liga e o administrador, em Configuracoes.' USING ERRCODE = '42501';
    END IF;
    IF p_ativo IS FALSE THEN
      RAISE EXCEPTION 'Desligar o Ranking de quitacao e com o administrador, em Configuracoes.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_premios IS NOT NULL AND (
       cardinality(p_premios) > 10
       OR EXISTS (SELECT 1 FROM unnest(p_premios) v WHERE v IS NULL OR v < 0)
     ) THEN
    RAISE EXCEPTION 'Os premios vao de 0 a 10 posicoes, sem valor negativo.';
  END IF;

  IF p_config IS NOT NULL THEN
    IF jsonb_typeof(p_config) <> 'object' OR pg_column_size(p_config) > 16384 THEN
      RAISE EXCEPTION 'A configuracao do ranking veio em formato invalido.';
    END IF;
    IF COALESCE(p_config->>'criterio', 'valor') NOT IN ('valor', 'quantidade') THEN
      RAISE EXCEPTION 'O criterio do ranking e valor ou quantidade.';
    END IF;
    IF COALESCE(p_config->>'disputa', 'setor') NOT IN ('setor', 'equipe') THEN
      RAISE EXCEPTION 'A disputa do ranking e por setor ou por equipe.';
    END IF;
    -- 20261112230000: o que conta como quitação no setor.
    IF COALESCE(p_config->>'aceita', 'todas') NOT IN ('todas', 'so_quitacao') THEN
      RAISE EXCEPTION 'O ranking aceita todas as quitacoes ou so acordo de Quitacao.';
    END IF;
    IF p_config ? 'minimo_quitacoes' AND (
         jsonb_typeof(p_config->'minimo_quitacoes') <> 'number'
         OR (p_config->>'minimo_quitacoes') !~ '^[0-9]{1,3}$'
       ) THEN
      RAISE EXCEPTION 'O minimo de quitacoes e um numero inteiro de 0 a 999.';
    END IF;
    IF p_config ? 'equipes_fora' THEN
      IF jsonb_typeof(p_config->'equipes_fora') <> 'array' THEN
        RAISE EXCEPTION 'As equipes de fora vieram em formato invalido.';
      END IF;
      FOR v_fora IN SELECT jsonb_array_elements_text(p_config->'equipes_fora') LOOP
        IF v_fora !~ '^[0-9a-f-]{36}$'
           OR NOT EXISTS (SELECT 1 FROM public.equipes e
                           WHERE e.id = v_fora::UUID AND e.empresa_id = p_empresa_id AND e.setor_id = p_setor_id) THEN
          RAISE EXCEPTION 'Uma equipe de fora nao e deste setor.';
        END IF;
      END LOOP;
    END IF;
    IF p_config ? 'premios_texto' AND (
         jsonb_typeof(p_config->'premios_texto') <> 'array'
         OR jsonb_array_length(p_config->'premios_texto') > 10
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'premios_texto') t
                     WHERE jsonb_typeof(t) <> 'string' OR char_length(t #>> '{}') > 40)
       ) THEN
      RAISE EXCEPTION 'O brinde de cada posicao e um texto de ate 40 letras.';
    END IF;
    IF p_config ? 'categorias' THEN
      IF jsonb_typeof(p_config->'categorias') <> 'array' OR jsonb_array_length(p_config->'categorias') > 8 THEN
        RAISE EXCEPTION 'Os destaques do ranking vieram em formato invalido.';
      END IF;
      FOR v_x IN SELECT jsonb_array_elements(p_config->'categorias') LOOP
        IF jsonb_typeof(v_x) <> 'object'
           OR COALESCE(v_x->>'id', '') NOT IN ('mais_quitacoes', 'maior_valor', 'maior_quitacao', 'equipe_campea')
           OR (v_x ? 'ativo' AND jsonb_typeof(v_x->'ativo') <> 'boolean')
           OR (v_x ? 'premio' AND jsonb_typeof(v_x->'premio') NOT IN ('number', 'null'))
           OR (jsonb_typeof(v_x->'premio') = 'number' AND (v_x->>'premio')::NUMERIC < 0)
           OR (v_x ? 'premio_texto' AND jsonb_typeof(v_x->'premio_texto') NOT IN ('string', 'null'))
           OR char_length(COALESCE(v_x->>'premio_texto', '')) > 40 THEN
          RAISE EXCEPTION 'Um destaque do ranking esta invalido.';
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.ranking_quitacao_setores AS s
         (empresa_id, setor_id, ativo, premios, config, atualizado_por, atualizado_em)
  VALUES (p_empresa_id, p_setor_id, COALESCE(p_ativo, TRUE),
          COALESCE(p_premios, ARRAY[350, 250, 180, 100, 70, 50]::NUMERIC[]),
          COALESCE(p_config, '{}'::JSONB),
          (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, setor_id) DO UPDATE
     SET ativo          = COALESCE(p_ativo, s.ativo),
         premios        = COALESCE(p_premios, s.premios),
         config         = COALESCE(p_config, s.config),
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em  = NOW()
  RETURNING s.premios INTO v_premios;

  IF p_config ? 'premios_texto'
     AND jsonb_array_length(p_config->'premios_texto') > cardinality(v_premios) THEN
    RAISE EXCEPTION 'Ha mais brindes do que posicoes premiadas.';
  END IF;

  PERFORM public.fn_ranking_quitacao_avisar(p_empresa_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) IS
  'Liga/desliga o Ranking de quitacao num setor e grava premios (0 a 10) e a config '
  '(NULL mantem). ranking_quitacao_configurar: todos os setores; '
  'ranking_quitacao_configurar_setor: so os setores da pessoa, ja ligados, sem ligar/desligar. '
  'Avisa TVs e aba. 20261111150500, 20261112220000.';

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo() WHERE chave = 'ranking_quitacao_configurar_setor') <> 1 THEN
    RAISE EXCEPTION 'PROVA: ranking_quitacao_configurar_setor nao entrou no catalogo (ou entrou duas vezes).';
  END IF;
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo() WHERE chave = 'ranking_quitacao_configurar') <> 1 THEN
    RAISE EXCEPTION 'PROVA: o catalogo antigo se perdeu.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants de fn_ranking_quitacao_definir_setor ficaram errados.';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112220000', 'ranking_quitacao_lider_configura', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
