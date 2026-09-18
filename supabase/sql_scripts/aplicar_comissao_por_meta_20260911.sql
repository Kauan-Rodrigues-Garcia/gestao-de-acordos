-- ============================================================================
-- Aplicar: comissao por meta (versao que pode rodar de novo)
-- ============================================================================
--
-- Mesmo conteudo de supabase/migrations/20260911190000_comissao_por_meta.sql,
-- com duas diferencas:
--
--   1. o passo 5 so renomeia e recria `fn_permissoes_catalogo` se isso ainda
--      nao foi feito;
--   2. a prova tambem confere as colunas e a constraint que as RPCs usam.
--
-- ## Por que existe
--
-- Em 2026-09-11 o arquivo original falhou no banco com
--
--   42723: function fn_permissoes_catalogo_antes_comissao_por_meta_20260911() already exists
--
-- ou seja: o catalogo ja tinha passado por esta migration, inteira ou em parte.
-- O original vai falhar sempre nesse ponto.
--
-- ## Como rodar
--
-- SQL Editor do Supabase, o arquivo inteiro de uma vez.
--
-- ## O que acontece em cada caso
--
--   * nada aplicado ainda  -> aplica tudo;
--   * ja aplicado inteiro  -> nao cria nada novo: recria as 4 RPCs e as 2
--                             policies com o mesmo texto, e os UPDATEs em
--                             cargos_permissoes atingem 0 linhas;
--   * aplicado pela metade -> para com um erro dizendo o que falta.
--
-- Tudo numa transacao: se qualquer passo ou a prova falhar, nada fica gravado.
-- A consulta depois do COMMIT devolve uma linha com o estado final; o esperado
-- esta no fim do arquivo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- 1. As tabelas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.comissao_config (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id                       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  equipe_id                      UUID          REFERENCES public.equipes(id)  ON DELETE CASCADE,
  ano                            INTEGER NOT NULL CHECK (ano >= 2024),
  mes                            INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  modo_indireta                  TEXT NOT NULL DEFAULT 'junto'
                                   CHECK (modo_indireta IN ('junto', 'separado')),
  pct_indireta                   NUMERIC(6,3) CHECK (pct_indireta >= 0),
  pct_indireta_especial          NUMERIC(6,3) CHECK (pct_indireta_especial >= 0),
  regra_setor                    TEXT NOT NULL DEFAULT 'nenhuma'
                                   CHECK (regra_setor IN ('nenhuma', 'percentual_especial', 'multiplicador')),
  multiplicador                  NUMERIC(6,3) CHECK (multiplicador > 0),
  setor_meta_confirmada_em       TIMESTAMPTZ,
  setor_meta_confirmada_por      UUID,
  setor_meta_confirmada_por_nome TEXT,
  atualizado_por                 UUID,
  atualizado_em                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comissao_config_excecao_sem_regra CHECK (
    equipe_id IS NULL
    OR (regra_setor = 'nenhuma' AND multiplicador IS NULL AND setor_meta_confirmada_em IS NULL)
  ),
  -- NULLS NOT DISTINCT: sem isto, dois "padrao do setor" do mesmo mes seriam
  -- aceitos, porque NULL nunca e igual a NULL numa UNIQUE comum.
  CONSTRAINT comissao_config_competencia_unica
    UNIQUE NULLS NOT DISTINCT (empresa_id, setor_id, equipe_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_comissao_config_empresa_mes
  ON public.comissao_config(empresa_id, ano, mes);

COMMENT ON TABLE public.comissao_config IS
  'Configuracao da comissao por meta de um mes: padrao do setor (equipe_id nulo) '
  'ou excecao de equipe. O valor das faixas vem de metas; aqui ficam percentuais '
  'e regras. Escrita so pelas RPCs fn_comissao_*.';

CREATE TABLE IF NOT EXISTS public.comissao_faixas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id    UUID NOT NULL REFERENCES public.comissao_config(id) ON DELETE CASCADE,
  ordem        SMALLINT NOT NULL CHECK (ordem BETWEEN 1 AND 20),
  pct          NUMERIC(6,3) NOT NULL CHECK (pct >= 0),
  pct_especial NUMERIC(6,3) CHECK (pct_especial >= 0),
  CONSTRAINT comissao_faixas_ordem_unica UNIQUE (config_id, ordem)
);

COMMENT ON TABLE public.comissao_faixas IS
  'Percentual de cada faixa (ordem 1 = 1a Meta) de uma configuracao de comissao. '
  'pct_especial vale quando o setor bate a meta e a regra do setor e percentual_especial.';

-- ============================================================================
-- 2. RLS: so leitura
-- ============================================================================

ALTER TABLE public.comissao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_faixas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissao_config_select ON public.comissao_config;
CREATE POLICY comissao_config_select ON public.comissao_config
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS comissao_faixas_select ON public.comissao_faixas;
CREATE POLICY comissao_faixas_select ON public.comissao_faixas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.id = config_id
       AND public.fn_can_access_empresa(c.empresa_id)
  ));

-- ============================================================================
-- 3. As RPCs
-- ============================================================================

-- ── Salvar uma configuracao (padrao ou excecao) ─────────────────────────────
--
-- A unidade de gravacao e a configuracao inteira: as faixas sao SUBSTITUIDAS.
-- Gravar faixa a faixa deixaria o mes com metade das faixas novas e metade
-- velhas se a segunda escrita falhasse.

CREATE OR REPLACE FUNCTION public.fn_comissao_salvar(p_config JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID    := NULLIF(p_config->>'empresa_id', '')::UUID;
  v_setor   UUID    := NULLIF(p_config->>'setor_id', '')::UUID;
  v_equipe  UUID    := NULLIF(p_config->>'equipe_id', '')::UUID;
  v_ano     INTEGER := NULLIF(p_config->>'ano', '')::INTEGER;
  v_mes     INTEGER := NULLIF(p_config->>'mes', '')::INTEGER;
  v_id      UUID;
  v_faixa   JSONB;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  IF v_empresa IS NULL OR v_setor IS NULL OR v_ano IS NULL OR v_mes IS NULL THEN
    RAISE EXCEPTION 'Configuração incompleta: empresa, setor, ano e mês são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = v_setor AND s.empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'O setor não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF public.fn_metas_esta_validada(v_empresa, v_setor, v_mes, v_ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para editar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  IF v_equipe IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.equipes e WHERE e.id = v_equipe AND e.setor_id = v_setor) THEN
      RAISE EXCEPTION 'A equipe não pertence a este setor.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.comissao_config c
       WHERE c.empresa_id = v_empresa AND c.setor_id = v_setor AND c.equipe_id IS NULL
         AND c.ano = v_ano AND c.mes = v_mes
    ) THEN
      RAISE EXCEPTION 'Configure o padrão do setor antes de criar a exceção da equipe.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.comissao_config (
    empresa_id, setor_id, equipe_id, ano, mes,
    modo_indireta, pct_indireta, pct_indireta_especial,
    regra_setor, multiplicador,
    atualizado_por, atualizado_em
  ) VALUES (
    v_empresa, v_setor, v_equipe, v_ano, v_mes,
    COALESCE(NULLIF(p_config->>'modo_indireta', ''), 'junto'),
    NULLIF(p_config->>'pct_indireta', '')::NUMERIC,
    NULLIF(p_config->>'pct_indireta_especial', '')::NUMERIC,
    -- A regra do setor so existe na linha do setor.
    CASE WHEN v_equipe IS NULL
         THEN COALESCE(NULLIF(p_config->>'regra_setor', ''), 'nenhuma')
         ELSE 'nenhuma' END,
    CASE WHEN v_equipe IS NULL
         THEN NULLIF(p_config->>'multiplicador', '')::NUMERIC END,
    auth.uid(), NOW()
  )
  ON CONFLICT ON CONSTRAINT comissao_config_competencia_unica DO UPDATE SET
    modo_indireta         = EXCLUDED.modo_indireta,
    pct_indireta          = EXCLUDED.pct_indireta,
    pct_indireta_especial = EXCLUDED.pct_indireta_especial,
    regra_setor           = EXCLUDED.regra_setor,
    multiplicador         = EXCLUDED.multiplicador,
    atualizado_por        = EXCLUDED.atualizado_por,
    atualizado_em         = NOW()
  RETURNING id INTO v_id;

  DELETE FROM public.comissao_faixas WHERE config_id = v_id;

  FOR v_faixa IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'faixas', '[]'::JSONB)) LOOP
    INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
    VALUES (
      v_id,
      (v_faixa->>'ordem')::SMALLINT,
      (v_faixa->>'pct')::NUMERIC,
      NULLIF(v_faixa->>'pct_especial', '')::NUMERIC
    );
  END LOOP;

  RETURN v_id;
END;
$function$;

-- ── Importar o mes anterior ──────────────────────────────────────────────────
--
-- Copia padrao e excecoes como LINHAS NOVAS. Nao copia a confirmacao da meta do
-- setor: ela e um fato do mes de origem. Excecao de equipe que saiu do setor
-- fica para tras. Mes de destino ja preenchido so e substituido com
-- p_substituir = true.

CREATE OR REPLACE FUNCTION public.fn_comissao_importar_mes_anterior(
  p_empresa_id UUID,
  p_setor_id   UUID,
  p_ano        INTEGER,
  p_mes        INTEGER,
  p_substituir BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_origem INTEGER;
  v_mes_origem INTEGER;
  v_origem     RECORD;
  v_novo       UUID;
  v_total      INTEGER := 0;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  IF p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_ano IS NULL THEN
    RAISE EXCEPTION 'Mês inválido.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF public.fn_metas_esta_validada(p_empresa_id, p_setor_id, p_mes, p_ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para importar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  v_ano_origem := CASE WHEN p_mes = 1 THEN p_ano - 1 ELSE p_ano END;
  v_mes_origem := CASE WHEN p_mes = 1 THEN 12 ELSE p_mes - 1 END;

  IF NOT EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = v_ano_origem AND c.mes = v_mes_origem
  ) THEN
    RAISE EXCEPTION 'Não há configuração de comissão no mês anterior para este setor.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = p_ano AND c.mes = p_mes
  ) THEN
    IF NOT COALESCE(p_substituir, FALSE) THEN
      RAISE EXCEPTION 'Este mês já tem configuração de comissão. Confirme a substituição para importar.'
        USING ERRCODE = '23505';
    END IF;
    DELETE FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = p_ano AND c.mes = p_mes;
  END IF;

  FOR v_origem IN
    SELECT c.id, c.equipe_id, c.modo_indireta, c.pct_indireta, c.pct_indireta_especial,
           c.regra_setor, c.multiplicador
      FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = v_ano_origem AND c.mes = v_mes_origem
       AND (c.equipe_id IS NULL
            OR EXISTS (SELECT 1 FROM public.equipes e
                        WHERE e.id = c.equipe_id AND e.setor_id = p_setor_id))
     -- O padrao primeiro: e ele que a excecao pressupoe.
     ORDER BY (c.equipe_id IS NOT NULL)
  LOOP
    INSERT INTO public.comissao_config (
      empresa_id, setor_id, equipe_id, ano, mes,
      modo_indireta, pct_indireta, pct_indireta_especial,
      regra_setor, multiplicador,
      atualizado_por, atualizado_em
    ) VALUES (
      p_empresa_id, p_setor_id, v_origem.equipe_id, p_ano, p_mes,
      v_origem.modo_indireta, v_origem.pct_indireta, v_origem.pct_indireta_especial,
      v_origem.regra_setor, v_origem.multiplicador,
      auth.uid(), NOW()
    )
    RETURNING id INTO v_novo;

    INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
    SELECT v_novo, f.ordem, f.pct, f.pct_especial
      FROM public.comissao_faixas f
     WHERE f.config_id = v_origem.id;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- ── Excluir a excecao de uma equipe ──────────────────────────────────────────
--
-- A equipe volta ao padrao do setor. O padrao em si nao e excecao e nao sai por
-- aqui.

CREATE OR REPLACE FUNCTION public.fn_comissao_excluir_excecao(p_config_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.comissao_config%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.comissao_config WHERE id = p_config_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração de comissão não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_cfg.empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF v_cfg.equipe_id IS NULL THEN
    RAISE EXCEPTION 'O padrão do setor não é uma exceção de equipe.' USING ERRCODE = '22023';
  END IF;

  IF public.fn_metas_esta_validada(v_cfg.empresa_id, v_cfg.setor_id, v_cfg.mes, v_cfg.ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para editar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.comissao_config WHERE id = v_cfg.id;
END;
$function$;

-- ── Confirmar (ou desfazer) que o setor bateu a meta ─────────────────────────
--
-- Liga o beneficio da comissao para os operadores do setor. Quem confirma olha o
-- acumulado do setor na tela de Metas, calculado pelo mesmo codigo do card de
-- Desempenho Equipes — o banco nao recalcula esse numero.

CREATE OR REPLACE FUNCTION public.fn_comissao_confirmar_meta_setor(
  p_empresa_id UUID,
  p_setor_id   UUID,
  p_ano        INTEGER,
  p_mes        INTEGER,
  p_confirmado BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_nome   TEXT;
  v_linhas INTEGER;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_confirmar_setor') THEN
    RAISE EXCEPTION 'Seu cargo não pode confirmar a meta do setor na comissão.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.comissao_config c
     SET setor_meta_confirmada_em       = CASE WHEN p_confirmado THEN NOW() END,
         setor_meta_confirmada_por      = CASE WHEN p_confirmado THEN auth.uid() END,
         setor_meta_confirmada_por_nome = CASE WHEN p_confirmado THEN v_nome END,
         atualizado_em                  = NOW()
   WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id AND c.equipe_id IS NULL
     AND c.ano = p_ano AND c.mes = p_mes;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas = 0 THEN
    RAISE EXCEPTION 'Configure a comissão do setor neste mês antes de confirmar a meta.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_comissao_salvar(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_comissao_importar_mes_anterior(UUID, UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_comissao_excluir_excecao(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_comissao_confirmar_meta_setor(UUID, UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_comissao_salvar(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comissao_importar_mes_anterior(UUID, UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comissao_excluir_excecao(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comissao_confirmar_meta_setor(UUID, UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- ============================================================================
-- 4. Tempo real
-- ============================================================================
--
-- A confirmacao da meta do setor precisa chegar ao painel do operador sem
-- recarregar. A RLS de SELECT acima filtra os eventos.

DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comissao_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comissao_config;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comissao_faixas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comissao_faixas;
  END IF;
END
$realtime$;

-- ============================================================================
-- 5. As chaves de permissao — so se ainda nao entraram
-- ============================================================================
--
-- O original renomeava sempre, e por isso falhou: o nome de destino ja existia.
-- Aqui:
--   * sem a funcao "_antes_": renomeia e recria, como no original;
--   * com ela, e o catalogo atual ja tem as 4 chaves: nao mexe em nada;
--   * com ela, mas sem o catalogo atual ou sem as chaves: para. E um estado
--     parcial, e corrigir no escuro poderia apagar chaves do catalogo.

DO $catalogo$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_comissao_por_meta_20260911()') IS NULL THEN

    ALTER FUNCTION public.fn_permissoes_catalogo()
      RENAME TO fn_permissoes_catalogo_antes_comissao_por_meta_20260911;

    CREATE FUNCTION public.fn_permissoes_catalogo()
    RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
    LANGUAGE sql
    IMMUTABLE
    SET search_path TO ''
    AS $function$
      SELECT * FROM public.fn_permissoes_catalogo_antes_comissao_por_meta_20260911()
      UNION ALL
      SELECT * FROM (VALUES
        -- Ver a comissao da equipe na tela de Metas.
        ('metas_comissao_ver',             NULL::TEXT[], ARRAY['lider','elite','gerencia']::TEXT[], false),
        -- Configurar e confirmar mexem em dinheiro: nascem so na gerencia.
        ('metas_comissao_editar',          NULL::TEXT[], ARRAY['gerencia']::TEXT[], false),
        ('metas_comissao_confirmar_setor', NULL::TEXT[], ARRAY['gerencia']::TEXT[], false),
        -- A propria comissao no menu lateral: todo cargo que tem meta.
        ('dashboard_comissao',             NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false)
      ) AS novas(chave, tenants, padrao, explicita);
    $function$;

    COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
      'Catalogo completo de permissoes. A extensao 20260911 da comissao por meta '
      'acrescenta metas_comissao_ver, metas_comissao_editar, '
      'metas_comissao_confirmar_setor e dashboard_comissao, sem perder o catalogo '
      'anterior. Espelha src/lib/permissoes-catalogo.ts; o teste de contrato quebra '
      'a CI se os dois lados divergirem.';

    RAISE NOTICE 'Catalogo: chaves da comissao acrescentadas.';

  ELSIF to_regprocedure('public.fn_permissoes_catalogo()') IS NULL THEN

    RAISE EXCEPTION 'Estado parcial: fn_permissoes_catalogo_antes_comissao_por_meta_20260911 existe, '
      'mas fn_permissoes_catalogo() nao. Nada foi gravado; confira antes de corrigir.';

  ELSIF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo()
          WHERE chave IN ('metas_comissao_ver', 'metas_comissao_editar',
                          'metas_comissao_confirmar_setor', 'dashboard_comissao')) <> 4 THEN

    RAISE EXCEPTION 'Estado parcial: fn_permissoes_catalogo_antes_comissao_por_meta_20260911 existe, '
      'mas o catalogo atual nao tem as 4 chaves da comissao. Nada foi gravado; confira antes de corrigir.';

  ELSE

    RAISE NOTICE 'Catalogo: as chaves da comissao ja estavam la. Nada mudou neste passo.';

  END IF;
END
$catalogo$;

-- Os padroes nos cargos que ja existem. So a linha que ainda nao tem a chave:
-- configuracao feita a mao no painel nao regride numa reaplicacao. Acesso total
-- nasce ligado, como em toda chave nao explicita.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'metas_comissao_ver',
         cp.cargo IN ('lider', 'elite', 'gerencia', 'administrador', 'super_admin')),
       atualizado_em = NOW()
 WHERE NOT (cp.permissoes ? 'metas_comissao_ver');

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'metas_comissao_editar',
         cp.cargo IN ('gerencia', 'administrador', 'super_admin')),
       atualizado_em = NOW()
 WHERE NOT (cp.permissoes ? 'metas_comissao_editar');

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'metas_comissao_confirmar_setor',
         cp.cargo IN ('gerencia', 'administrador', 'super_admin')),
       atualizado_em = NOW()
 WHERE NOT (cp.permissoes ? 'metas_comissao_confirmar_setor');

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'dashboard_comissao',
         cp.cargo IN ('operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria',
                      'administrador', 'super_admin')),
       atualizado_em = NOW()
 WHERE NOT (cp.permissoes ? 'dashboard_comissao');

-- ============================================================================
-- 6. Prova
-- ============================================================================

DO $prova$
BEGIN
  IF to_regclass('public.comissao_config') IS NULL
     OR to_regclass('public.comissao_faixas') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de comissao nao foram criadas.';
  END IF;

  -- Tabela que ja existia de uma versao anterior passaria pelo IF NOT EXISTS
  -- sem as colunas que as RPCs escrevem.
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'comissao_config'
         AND column_name IN ('id', 'empresa_id', 'setor_id', 'equipe_id', 'ano', 'mes',
                             'modo_indireta', 'pct_indireta', 'pct_indireta_especial',
                             'regra_setor', 'multiplicador', 'setor_meta_confirmada_em',
                             'setor_meta_confirmada_por', 'setor_meta_confirmada_por_nome',
                             'atualizado_por', 'atualizado_em', 'criado_em')) <> 17
     OR (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'comissao_faixas'
            AND column_name IN ('id', 'config_id', 'ordem', 'pct', 'pct_especial')) <> 5 THEN
    RAISE EXCEPTION 'As tabelas de comissao existem, mas com colunas diferentes das esperadas.';
  END IF;

  -- fn_comissao_salvar depende dela no ON CONFLICT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'comissao_config_competencia_unica'
       AND conrelid = 'public.comissao_config'::REGCLASS
  ) THEN
    RAISE EXCEPTION 'Falta a constraint comissao_config_competencia_unica.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comissao_config'::REGCLASS)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comissao_faixas'::REGCLASS) THEN
    RAISE EXCEPTION 'A RLS das tabelas de comissao esta desligada.';
  END IF;

  IF to_regprocedure('public.fn_comissao_salvar(jsonb)') IS NULL
     OR to_regprocedure('public.fn_comissao_importar_mes_anterior(uuid,uuid,integer,integer,boolean)') IS NULL
     OR to_regprocedure('public.fn_comissao_excluir_excecao(uuid)') IS NULL
     OR to_regprocedure('public.fn_comissao_confirmar_meta_setor(uuid,uuid,integer,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Alguma RPC de comissao nao foi criada.';
  END IF;

  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo()
       WHERE chave IN ('metas_comissao_ver', 'metas_comissao_editar',
                       'metas_comissao_confirmar_setor', 'dashboard_comissao')) <> 4 THEN
    RAISE EXCEPTION 'As chaves da comissao nao entraram no catalogo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() GROUP BY chave HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'O catalogo ficou com chave repetida.';
  END IF;
END
$prova$;

COMMIT;

-- ============================================================================
-- Estado final (so leitura)
-- ============================================================================
--
-- Esperado: as 6 primeiras colunas preenchidas, chaves_no_catalogo = 4,
-- tabelas_no_realtime = 2 e cargos_com_a_chave = cargos_total.

SELECT
  to_regclass('public.comissao_config')                                                          AS tabela_config,
  to_regclass('public.comissao_faixas')                                                          AS tabela_faixas,
  to_regprocedure('public.fn_comissao_salvar(jsonb)')                                            AS rpc_salvar,
  to_regprocedure('public.fn_comissao_importar_mes_anterior(uuid,uuid,integer,integer,boolean)') AS rpc_importar,
  to_regprocedure('public.fn_comissao_excluir_excecao(uuid)')                                    AS rpc_excluir_excecao,
  to_regprocedure('public.fn_comissao_confirmar_meta_setor(uuid,uuid,integer,integer,boolean)')  AS rpc_confirmar,
  (SELECT COUNT(*) FROM public.fn_permissoes_catalogo()
    WHERE chave IN ('metas_comissao_ver', 'metas_comissao_editar',
                    'metas_comissao_confirmar_setor', 'dashboard_comissao'))                     AS chaves_no_catalogo,
  (SELECT COUNT(*) FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('comissao_config', 'comissao_faixas'))                                   AS tabelas_no_realtime,
  (SELECT COUNT(*) FROM public.cargos_permissoes WHERE permissoes ? 'dashboard_comissao')        AS cargos_com_a_chave,
  (SELECT COUNT(*) FROM public.cargos_permissoes)                                                AS cargos_total;
