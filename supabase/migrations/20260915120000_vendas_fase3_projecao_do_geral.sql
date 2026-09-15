-- ============================================================================
-- Comercial, Fase 3: o relatorio geral vira venda
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026. Depende das Fases 1 e 2.
--
-- ## O que a projecao faz, e o que ela recusa a fazer
--
-- Pega o lote `geral` vigente de um mes e escreve em `vendas`. Escreve SO o que
-- tem dono: franquia vinculada a um setor e login vinculado a uma pessoa. O
-- resto nao e erro — e cadastro que ninguem fez ainda, e a funcao devolve a
-- contagem para a tela dizer o tamanho da pendencia.
--
-- ## O dedupe entre meses ja esta feito, e nao por esta funcao
--
-- Medido: 99 NRs aparecem em agosto E em setembro; 76 deles cancelados em
-- agosto e reconfirmados em setembro, 16 confirmados nos dois. Somar os dois
-- meses sem resolver contaria R$ 432.714,40 de faturamento duas vezes, tudo
-- para o mesmo vendedor (o vendedor e o mesmo em 99 de 99 casos).
--
-- `vendas` tem UNIQUE (empresa_id, nr_documento), da Fase 1. Entao o NR que foi
-- reconfirmado em setembro nao vira uma segunda linha: a linha existente MUDA
-- de `data_confirmacao`, e com ela muda de mes. A dobra e impossivel por
-- construcao, e nao por cuidado de quem escreve a consulta.
--
-- ## O retrato velho nao desfaz o novo
--
-- Ha um jeito de a chave unica virar armadilha: reimportar agosto DEPOIS de
-- setembro. O arquivo de agosto foi exportado em 31/08 e nao sabe da
-- reconfirmacao de 02/09 — projeta-lo por cima puxaria a venda de volta para
-- agosto, com a situacao velha.
--
-- Por isso `vendas.lote_id` guarda qual lote escreveu a linha, e a projecao so
-- sobrescreve quando o lote dela foi importado DEPOIS do que esta la. O
-- contrario e contado como `preservadas` e aparece na tela. Mesma logica do
-- «a referencia de data e sempre a do 59» na cobranca.
--
-- ## Setor vem da franquia; a divergencia com a pessoa fica VISIVEL
--
-- A regra e a de 15/09: «cada setor cuida de algumas franquias especificas».
-- Ela funciona para quase todo mundo — medido em setembro, 356 dos 359 logins
-- vendem para UMA franquia so.
--
-- Mas os 3 que espalham carregam 7,0% do faturamento (R$ 961.659,16), e
-- R$ 534.107,80 — 3,90% do total — cairia num setor diferente do setor
-- cadastral da pessoa. `camila45` sozinha aparece em quatro franquias.
--
-- A funcao NAO escolhe em silencio: grava o setor da FRANQUIA, como pedido, e
-- devolve `divergencia_setor` com quantas linhas e quanto dinheiro discordam do
-- cadastro da pessoa. Escolher calado seria repetir o defeito que o de-para do
-- 59 existe para nao cometer.
--
-- ## Reversao
--
-- Venda que contava e passou a devolvida ou cancelada sai do recebimento — o
-- `valor_na_meta` e coluna GERADA, entao sai sozinha — e deixa um evento
-- `revertida` com o valor de antes. E a regra 5 do plano.
--
-- Escrita de dados: nenhuma linha. Cria a coluna `lote_id`, duas funcoes e uma
-- permissao.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- 1. Catalogo: a permissao de projetar
-- ============================================================================
--
-- Separada de `importar_vendas` de proposito. Importar troca o retrato do
-- RELATORIO, que nao conta para meta nenhuma. Projetar escreve em `vendas`, que
-- e o placar do operador — e pode reverter venda que estava contando.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_projecao_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_lote_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('importar_vendas',            ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('ver_importacoes_vendas',     ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('vendas_vincular_franquia',   ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_projecao_20260915() IS
  'Retrato do catalogo antes da chave de projecao do Comercial (15/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_projecao_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('projetar_vendas', ARRAY['comercial']::TEXT[], ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260915120000 adiciona '
  'projetar_vendas — escrever o relatorio sobre o placar.';

-- ============================================================================
-- 2. De qual lote veio cada venda
-- ============================================================================

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES public.vendas_lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_lote ON public.vendas(lote_id);

COMMENT ON COLUMN public.vendas.lote_id IS
  'Qual lote escreveu esta linha pela ultima vez. NULL = lancamento manual. '
  'A projecao compara `importado_em` para nao deixar um retrato velho desfazer '
  'um novo — ver o cabecalho da migration 20260915120000.';

-- ============================================================================
-- 3. Quem e o vendedor deste login
-- ============================================================================
--
-- `perfis.usuario` e o login do sistema, e ele coincide com `Login_Vendedor` do
-- ERP para a operacao propria. Comparacao sem caixa e sem espaco: o arquivo traz
-- `Kevin` e `kevin` na mesma coluna.
--
-- Devolve NULL quando nao acha OU quando acha mais de um — dois perfis com o
-- mesmo usuario e problema de cadastro, e escolher um deles por sorte poria o
-- faturamento de alguem no nome de outra pessoa.

CREATE OR REPLACE FUNCTION public.fn_vendas_perfil_do_login(
  p_empresa_id UUID, p_login TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE WHEN COUNT(*) = 1 THEN (ARRAY_AGG(p.id))[1] ELSE NULL END
    FROM public.perfis p
   WHERE p.empresa_id = p_empresa_id
     AND LOWER(BTRIM(p.usuario)) = LOWER(BTRIM(p_login))
     AND BTRIM(COALESCE(p_login, '')) <> '';
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_perfil_do_login(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_perfil_do_login(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_perfil_do_login(UUID, TEXT) IS
  'O perfil deste login do ERP, ou NULL quando nao ha um so. Ambiguidade vira '
  'pendencia, nunca escolha por sorte.';

-- ============================================================================
-- 4. A previa: o que a projecao FARIA
-- ============================================================================
--
-- Existe porque projetar pode reverter venda que estava contando, e ninguem
-- deve descobrir isso depois. A tela mostra os numeros e pergunta.

CREATE OR REPLACE FUNCTION public.fn_vendas_projecao_previa(p_lote_id UUID)
RETURNS TABLE(
  total_no_lote        INTEGER,
  com_dono             INTEGER,
  sem_franquia         INTEGER,
  franquia_ignorada    INTEGER,
  sem_operador         INTEGER,
  a_criar              INTEGER,
  a_atualizar          INTEGER,
  a_reverter           INTEGER,
  reverter_valor       NUMERIC,
  preservadas          INTEGER,
  divergencia_setor    INTEGER,
  divergencia_valor    NUMERIC,
  logins_sem_vinculo   TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH lote AS (
    SELECT l.* FROM public.vendas_lotes l WHERE l.id = p_lote_id
  ),
  base AS (
    SELECT
      r.*,
      f.estado    AS franquia_estado,
      f.setor_id  AS franquia_setor,
      public.fn_vendas_perfil_do_login(r.empresa_id, r.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio r
      LEFT JOIN public.vendas_franquias f
        ON f.empresa_id = r.empresa_id AND f.codigo = r.codigo_franquia
     WHERE r.lote_id = p_lote_id
  ),
  comparada AS (
    SELECT
      b.*,
      v.id            AS venda_id,
      v.conta_na_meta AS antes_contava,
      v.valor_na_meta AS antes_valor,
      v.lote_id       AS antes_lote,
      lb.importado_em AS antes_importado_em,
      p.setor_id      AS setor_da_pessoa
      FROM base b
      LEFT JOIN public.vendas v
        ON v.empresa_id = b.empresa_id AND v.nr_documento = b.nr_documento
      LEFT JOIN public.vendas_lotes lb ON lb.id = v.lote_id
      LEFT JOIN public.perfis p ON p.id = b.perfil_id
  ),
  classificada AS (
    SELECT
      c.*,
      (c.franquia_estado = 'vinculado' AND c.perfil_id IS NOT NULL) AS tem_dono,
      -- Retrato velho nao desfaz retrato novo.
      (c.antes_importado_em IS NOT NULL
         AND c.antes_importado_em > (SELECT importado_em FROM lote)) AS e_velho
      FROM comparada c
  )
  SELECT
    (SELECT COUNT(*)::INTEGER FROM base),
    COUNT(*) FILTER (WHERE tem_dono)::INTEGER,
    COUNT(*) FILTER (WHERE franquia_estado IS NULL OR franquia_estado = 'novo')::INTEGER,
    COUNT(*) FILTER (WHERE franquia_estado = 'ignorado')::INTEGER,
    COUNT(*) FILTER (WHERE franquia_estado = 'vinculado' AND perfil_id IS NULL)::INTEGER,
    COUNT(*) FILTER (WHERE tem_dono AND NOT e_velho AND venda_id IS NULL)::INTEGER,
    COUNT(*) FILTER (WHERE tem_dono AND NOT e_velho AND venda_id IS NOT NULL)::INTEGER,
    COUNT(*) FILTER (
      WHERE tem_dono AND NOT e_velho AND antes_contava
        AND NOT (situacao = 'confirmada' AND contrato_assinado)
    )::INTEGER,
    COALESCE(SUM(antes_valor) FILTER (
      WHERE tem_dono AND NOT e_velho AND antes_contava
        AND NOT (situacao = 'confirmada' AND contrato_assinado)
    ), 0),
    COUNT(*) FILTER (WHERE tem_dono AND e_velho)::INTEGER,
    COUNT(*) FILTER (
      WHERE tem_dono AND setor_da_pessoa IS NOT NULL
        AND setor_da_pessoa IS DISTINCT FROM franquia_setor
    )::INTEGER,
    COALESCE(SUM(valor_total) FILTER (
      WHERE tem_dono AND setor_da_pessoa IS NOT NULL
        AND setor_da_pessoa IS DISTINCT FROM franquia_setor
    ), 0),
    COALESCE(
      (SELECT ARRAY_AGG(DISTINCT login_vendedor ORDER BY login_vendedor)
         FROM classificada
        WHERE franquia_estado = 'vinculado' AND perfil_id IS NULL
          AND login_vendedor IS NOT NULL),
      ARRAY[]::TEXT[])
  FROM classificada;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_projecao_previa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_projecao_previa(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_projecao_previa(UUID) IS
  'O que fn_vendas_projetar faria, sem fazer. Existe porque projetar pode '
  'reverter venda que estava contando.';

-- ============================================================================
-- 5. A projecao
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_projetar(p_lote_id UUID)
RETURNS TABLE(
  criadas           INTEGER,
  atualizadas       INTEGER,
  revertidas        INTEGER,
  revertido_valor   NUMERIC,
  preservadas       INTEGER,
  sem_dono          INTEGER,
  divergencia_setor INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote       public.vendas_lotes%ROWTYPE;
  v_criadas    INTEGER := 0;
  v_atualizadas INTEGER := 0;
  v_revertidas INTEGER := 0;
  v_valor      NUMERIC := 0;
  v_preservadas INTEGER := 0;
  v_sem_dono   INTEGER := 0;
  v_diverg     INTEGER := 0;
  r            RECORD;
  v_antes      public.vendas%ROWTYPE;
  v_equipe     UUID;
  v_setor_pessoa UUID;
  v_id         UUID;
BEGIN
  IF NOT public.fn_user_tem('projetar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode lançar o relatório sobre as vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  IF v_lote.estado <> 'vigente' THEN
    RAISE EXCEPTION 'Só o lote vigente é projetado (este está %).', v_lote.estado
      USING ERRCODE = '22023';
  END IF;

  -- O relatorio do setor e PREVIA: ele recorta por data da venda e traz venda
  -- em aberto. Projeta-lo como se fosse oficial daria data de confirmacao a
  -- quem nao tem. A previa entra na conciliacao, que e a Fase 4.
  IF v_lote.origem <> 'geral' THEN
    RAISE EXCEPTION 'Só o relatório geral vira venda. O do setor é prévia — ele entra na conciliação.'
      USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT rel.*,
           f.setor_id AS franquia_setor,
           public.fn_vendas_perfil_do_login(rel.empresa_id, rel.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio rel
      JOIN public.vendas_franquias f
        ON f.empresa_id = rel.empresa_id
       AND f.codigo     = rel.codigo_franquia
       AND f.estado     = 'vinculado'
     WHERE rel.lote_id = p_lote_id
  LOOP
    IF r.perfil_id IS NULL THEN
      v_sem_dono := v_sem_dono + 1;
      CONTINUE;
    END IF;

    SELECT equipe_id, setor_id INTO v_equipe, v_setor_pessoa
      FROM public.perfis WHERE id = r.perfil_id;

    IF v_setor_pessoa IS NOT NULL AND v_setor_pessoa IS DISTINCT FROM r.franquia_setor THEN
      v_diverg := v_diverg + 1;
    END IF;

    SELECT * INTO v_antes FROM public.vendas
     WHERE empresa_id = r.empresa_id AND nr_documento = r.nr_documento;

    IF FOUND THEN
      -- Retrato velho nao desfaz retrato novo. Ver o cabecalho.
      IF v_antes.lote_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.vendas_lotes lb
         WHERE lb.id = v_antes.lote_id AND lb.importado_em > v_lote.importado_em
      ) THEN
        v_preservadas := v_preservadas + 1;
        CONTINUE;
      END IF;

      UPDATE public.vendas SET
        operador_id       = r.perfil_id,
        -- Setor vem da FRANQUIA, como pedido em 15/09. A divergencia com o
        -- cadastro da pessoa esta contada em `divergencia_setor`.
        setor_id          = r.franquia_setor,
        equipe_id         = v_equipe,
        cliente           = COALESCE(v_antes.cliente, NULL),
        uf                = COALESCE(r.uf, v_antes.uf),
        valor_total       = r.valor_total,
        valor_entrada     = COALESCE(r.valor_entrada, v_antes.valor_entrada),
        valor_recebido    = r.valor_recebido,
        forma_pagamento   = COALESCE(r.tipo_recebimento, v_antes.forma_pagamento),
        data_venda        = r.data_venda,
        data_confirmacao  = r.data_confirmacao,
        situacao          = r.situacao,
        contrato_assinado = r.contrato_assinado,
        motivo            = r.motivo,
        origem            = 'geral',
        lote_id           = p_lote_id,
        atualizado_em     = NOW()
      WHERE id = v_antes.id;

      v_atualizadas := v_atualizadas + 1;

      IF v_antes.conta_na_meta
         AND NOT (r.situacao = 'confirmada' AND r.contrato_assinado) THEN
        v_revertidas := v_revertidas + 1;
        v_valor := v_valor + COALESCE(v_antes.valor_na_meta, 0);

        INSERT INTO public.vendas_eventos (
          venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
          assinado_antes, assinado_depois, valor_antes, valor_depois,
          origem, motivo, autor_id
        ) VALUES (
          v_antes.id, r.empresa_id, 'revertida', v_antes.situacao, r.situacao,
          v_antes.contrato_assinado, r.contrato_assinado,
          v_antes.valor_na_meta, 0, 'geral', r.motivo, auth.uid()
        );
      END IF;

    ELSE
      INSERT INTO public.vendas (
        empresa_id, operador_id, setor_id, equipe_id,
        nr_documento, cliente, uf,
        valor_total, valor_entrada, valor_recebido, forma_pagamento,
        data_venda, data_confirmacao, situacao, contrato_assinado, motivo,
        origem, lote_id, criado_por
      ) VALUES (
        r.empresa_id, r.perfil_id, r.franquia_setor, v_equipe,
        r.nr_documento, NULL, r.uf,
        r.valor_total, r.valor_entrada, r.valor_recebido, r.tipo_recebimento,
        r.data_venda, r.data_confirmacao, r.situacao, r.contrato_assinado, r.motivo,
        'geral', p_lote_id, auth.uid()
      )
      RETURNING id INTO v_id;

      v_criadas := v_criadas + 1;

      INSERT INTO public.vendas_eventos (
        venda_id, empresa_id, tipo, situacao_depois, assinado_depois,
        valor_depois, origem, autor_id
      ) VALUES (
        v_id, r.empresa_id, 'criada', r.situacao, r.contrato_assinado,
        CASE WHEN r.situacao = 'confirmada' AND r.contrato_assinado
             THEN r.valor_total ELSE 0 END,
        'geral', auth.uid()
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_criadas, v_atualizadas, v_revertidas, v_valor,
    v_preservadas, v_sem_dono, v_diverg;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_projetar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_projetar(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_projetar(UUID) IS
  'Escreve o lote geral vigente em `vendas`. So o que tem franquia vinculada e '
  'login vinculado. Setor vem da franquia; a divergencia com o cadastro da '
  'pessoa e contada, nunca resolvida em silencio. Reversao gera evento.';

-- ============================================================================
-- 6. O que sumiu do retrato
-- ============================================================================
--
-- Venda que veio de um lote geral de um mes e que o retrato NOVO daquele mes
-- nao tem mais. Duas causas, e as duas importam:
--
--   • o NR migrou de mes — cancelado num mes, reconfirmado no seguinte. Sao 76
--     casos so entre agosto e setembro. Importar o outro mes o traz de volta,
--     no lugar certo;
--   • o ERP apagou a venda.
--
-- A funcao so LISTA. Apagar por conta propria levaria junto o que foi lancado a
-- mao e o historico — e a Fase 4 (conciliacao) e quem decide o destino.

CREATE OR REPLACE FUNCTION public.fn_vendas_sumidas_do_retrato(p_lote_id UUID)
RETURNS TABLE(
  venda_id         UUID,
  nr_documento     TEXT,
  operador_nome    TEXT,
  data_confirmacao DATE,
  situacao         TEXT,
  valor_na_meta    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH lote AS (
    SELECT l.* FROM public.vendas_lotes l WHERE l.id = p_lote_id
  )
  SELECT v.id, v.nr_documento, p.nome, v.data_confirmacao, v.situacao, v.valor_na_meta
    FROM public.vendas v
    LEFT JOIN public.perfis p ON p.id = v.operador_id
   WHERE v.empresa_id = (SELECT empresa_id FROM lote)
     AND v.origem = 'geral'
     -- Do mesmo mes que este lote retrata.
     AND date_trunc('month', v.data_confirmacao) = (SELECT mes FROM lote)
     AND NOT EXISTS (
       SELECT 1 FROM public.vendas_relatorio r
        WHERE r.lote_id = p_lote_id AND r.nr_documento = v.nr_documento
     )
     AND public.fn_can_access_empresa(v.empresa_id)
   ORDER BY v.valor_na_meta DESC, v.nr_documento;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_sumidas_do_retrato(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_sumidas_do_retrato(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_sumidas_do_retrato(UUID) IS
  'Vendas do mes deste lote que vieram do geral e que o retrato novo nao tem '
  'mais. So lista — apagar e decisao da conciliacao (Fase 4).';

-- ============================================================================
-- 7. Semear e verificar
-- ============================================================================

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

DO $$
DECLARE v_faltando TEXT;
BEGIN
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     -- O cargo `rh` fica de fora, e nao por descuido: o ARRAY de
     -- fn_permissoes_semear_empresa tem NOVE cargos e nao o inclui, entao a
     -- linha dele nunca recebe chave nova. Conferi-la aqui faria esta migration
     -- falhar por um buraco que ela nao abriu — e que e anterior a ela.
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- A chave unica e o que torna a dobra entre meses impossivel. Se ela nao
  -- estiver de pe, a projecao criaria a segunda linha do NR reconfirmado e os
  -- R$ 432.714,40 medidos voltariam a contar duas vezes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.vendas'::regclass AND conname = 'vendas_nr_unico'
  ) THEN
    RAISE EXCEPTION 'vendas_nr_unico nao existe — sem ela a projecao dobra faturamento entre meses.';
  END IF;
END $$;

COMMIT;
