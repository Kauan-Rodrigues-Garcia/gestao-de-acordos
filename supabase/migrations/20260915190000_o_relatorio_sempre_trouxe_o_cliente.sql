-- ============================================================================
-- O relatorio sempre trouxe o cliente — o parser e que nao o lia
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026.
--
-- ## O sintoma
--
-- Projetadas as 140 vendas de setembro, a aba Vendas mostrava «sem cliente» na
-- frente de TODOS os NRs. Parecia dado que o prospeccao nao traz.
--
-- Traz. Coluna 51, `Cliente`, com nome de gente — e com ZERO vazios em 3.101
-- linhas, presente tanto em agosto quanto em setembro. O que faltava era o
-- parser declara-la em `COLUNAS`, e esta tabela ter onde guarda-la.
--
-- ## Dois lados perdiam o mesmo dado
--
-- `prospeccaoSetorParser.ts` JA lia `Identificação da Prospecção | Cliente`
-- desde que nasceu. So que `fn_vendas_lote_linhas` nao tinha a coluna no
-- INSERT: o nome chegava no JSON e era descartado na porta. Entao nem o geral
-- nem a previa do setor gravavam cliente — por dois motivos diferentes, com o
-- mesmo efeito na tela.
--
-- ## Na atualizacao, quem digitou vence
--
-- Criando a venda, o nome do relatorio entra direto. ATUALIZANDO, o que ja esta
-- gravado vence: quem digitou o nome a mao pode ter corrigido o que o ERP tem
-- errado, e uma carga nao desfaz correcao de gente. O relatorio so preenche o
-- que estava vazio — que e exatamente o caso das 140 de hoje.
--
-- Por isso nao ha backfill aqui: reimportar e reprojetar preenche as 140, pelo
-- caminho normal, sem SQL de mao.
--
-- `obrigatoria: true` no parser e deliberado. Se um export futuro deixar de
-- trazer a coluna, e melhor a importacao recusar dizendo qual falta do que
-- voltar a gravar 140 nomes em branco sem ninguem perceber.
--
-- Escrita de dados: nenhuma.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.vendas_relatorio
  ADD COLUMN IF NOT EXISTS cliente TEXT;

COMMENT ON COLUMN public.vendas_relatorio.cliente IS
  'Quem comprou. Coluna `Cliente` do prospeccao, posicao 51 — existe desde '
  'sempre e ficou de fora do parser ate 15/09/2026. Medido: ZERO vazios em '
  '3.101 linhas, nos dois meses.';

-- ── A carga passa a gravar o nome ───────────────────────────────────────────
--
-- Uma coluna a mais no INSERT, e so. Vale para as DUAS origens: o parser do
-- setor ja lia `Identificação da Prospecção | Cliente` desde que nasceu, e o
-- nome chegava aqui dentro do JSON para ser descartado na porta.

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_linhas(
  p_lote_id UUID,
  p_linhas  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote     public.vendas_lotes%ROWTYPE;
  v_gravadas INTEGER;
BEGIN
  IF NOT public.fn_user_tem('importar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode importar o relatório de vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lote.estado <> 'carregando' THEN
    RAISE EXCEPTION 'Este lote já foi fechado (%). Abra um lote novo.', v_lote.estado
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.vendas_relatorio (
    lote_id, empresa_id, codigo_venda, nr_documento, data_venda, data_confirmacao,
    codigo_franquia, franquia, cliente, uf, nome_vendedor, login_vendedor,
    situacao, contrato_assinado, valor_total, qtde_parcela, valor_parcela,
    valor_recebido, valor_entrada, tipo_recebimento, tipo_documento,
    produto, categoria, tipo_venda, tipo_produto,
    data_cancelamento, data_devolucao, motivo, setor_cancelamento,
    veio_de_lead, score_classe, spc_serasa, linha_num
  )
  SELECT
    p_lote_id, v_lote.empresa_id,
    j->>'codigo_venda', j->>'nr_documento',
    (j->>'data_venda')::DATE, (j->>'data_confirmacao')::DATE,
    j->>'codigo_franquia', j->>'franquia',
    NULLIF(BTRIM(COALESCE(j->>'cliente','')), ''),
    NULLIF(UPPER(BTRIM(COALESCE(j->>'uf',''))), '')::CHAR(2),
    j->>'nome_vendedor', j->>'login_vendedor',
    j->>'situacao', COALESCE((j->>'contrato_assinado')::BOOLEAN, FALSE),
    (j->>'valor_total')::NUMERIC, (j->>'qtde_parcela')::INTEGER,
    (j->>'valor_parcela')::NUMERIC,
    COALESCE((j->>'valor_recebido')::NUMERIC, 0), (j->>'valor_entrada')::NUMERIC,
    j->>'tipo_recebimento', j->>'tipo_documento',
    j->>'produto', j->>'categoria', j->>'tipo_venda', j->>'tipo_produto',
    (j->>'data_cancelamento')::DATE, (j->>'data_devolucao')::DATE,
    j->>'motivo', j->>'setor_cancelamento',
    COALESCE((j->>'veio_de_lead')::BOOLEAN, FALSE),
    j->>'score_classe', j->>'spc_serasa', (j->>'linha_num')::INTEGER
  FROM jsonb_array_elements(p_linhas) AS j;

  GET DIAGNOSTICS v_gravadas = ROW_COUNT;
  RETURN v_gravadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_linhas(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_lote_linhas(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_vendas_projetar(p_lote_id UUID)
RETURNS TABLE(
  criadas            INTEGER,
  atualizadas        INTEGER,
  revertidas         INTEGER,
  revertido_valor    NUMERIC,
  preservadas        INTEGER,
  sem_dono           INTEGER,
  divergencia_setor  INTEGER,
  sem_franquia       INTEGER,
  sem_franquia_valor NUMERIC,
  franquia_ignorada  INTEGER,
  ignorada_valor     NUMERIC,
  sem_dono_valor     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote         public.vendas_lotes%ROWTYPE;
  v_criadas      INTEGER := 0;
  v_atualizadas  INTEGER := 0;
  v_revertidas   INTEGER := 0;
  v_valor        NUMERIC := 0;
  v_preservadas  INTEGER := 0;
  v_sem_dono     INTEGER := 0;
  v_sem_dono_v   NUMERIC := 0;
  v_diverg       INTEGER := 0;
  v_sem_fr       INTEGER := 0;
  v_sem_fr_v     NUMERIC := 0;
  v_ignorada     INTEGER := 0;
  v_ignorada_v   NUMERIC := 0;
  r              RECORD;
  v_antes        public.vendas%ROWTYPE;
  v_equipe       UUID;
  v_setor_pessoa UUID;
  v_id           UUID;
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

  IF v_lote.origem <> 'geral' THEN
    RAISE EXCEPTION 'Só o relatório geral vira venda. O do setor é prévia — ele entra na conciliação.'
      USING ERRCODE = '22023';
  END IF;

  -- LEFT JOIN, e nao INNER: o descarte precisa passar por aqui para ser
  -- contado. Ver 20260915160000.
  FOR r IN
    SELECT rel.*,
           f.estado   AS franquia_estado,
           f.setor_id AS franquia_setor,
           public.fn_vendas_perfil_do_login(rel.empresa_id, rel.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio rel
      LEFT JOIN public.vendas_franquias f
        ON f.empresa_id = rel.empresa_id
       AND f.codigo     = rel.codigo_franquia
     WHERE rel.lote_id = p_lote_id
  LOOP
    IF r.franquia_estado IS NULL OR r.franquia_estado = 'novo' THEN
      v_sem_fr   := v_sem_fr + 1;
      v_sem_fr_v := v_sem_fr_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    IF r.franquia_estado = 'ignorado' THEN
      v_ignorada   := v_ignorada + 1;
      v_ignorada_v := v_ignorada_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    IF r.perfil_id IS NULL THEN
      v_sem_dono   := v_sem_dono + 1;
      v_sem_dono_v := v_sem_dono_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    -- A equipe que CREDITA, nao a do cadastro.
    v_equipe := public.fn_vendas_equipe_que_credita(r.perfil_id);

    SELECT p.setor_id INTO v_setor_pessoa FROM public.perfis p WHERE p.id = r.perfil_id;

    IF v_setor_pessoa IS NOT NULL AND v_setor_pessoa IS DISTINCT FROM r.franquia_setor THEN
      v_diverg := v_diverg + 1;
    END IF;

    SELECT * INTO v_antes FROM public.vendas
     WHERE empresa_id = r.empresa_id AND nr_documento = r.nr_documento;

    IF FOUND THEN
      -- Retrato velho nao desfaz retrato novo.
      IF v_antes.lote_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.vendas_lotes lb
         WHERE lb.id = v_antes.lote_id AND lb.importado_em > v_lote.importado_em
      ) THEN
        v_preservadas := v_preservadas + 1;
        CONTINUE;
      END IF;

      UPDATE public.vendas SET
        operador_id       = r.perfil_id,
        setor_id          = r.franquia_setor,
        equipe_id         = v_equipe,
        -- Quem digitou vence: uma carga nao desfaz correcao de gente.
        cliente           = COALESCE(v_antes.cliente, NULLIF(BTRIM(COALESCE(r.cliente,'')), '')),
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
        r.nr_documento, NULLIF(BTRIM(COALESCE(r.cliente,'')), ''), r.uf,
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
    v_preservadas, v_sem_dono, v_diverg,
    v_sem_fr, v_sem_fr_v, v_ignorada, v_ignorada_v, v_sem_dono_v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_projetar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_projetar(UUID) TO authenticated;

DO $$
DECLARE def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vendas_relatorio' AND column_name='cliente'
  ) THEN
    RAISE EXCEPTION 'vendas_relatorio.cliente nao foi criada.';
  END IF;

  IF pg_get_functiondef('public.fn_vendas_lote_linhas'::regproc) NOT ILIKE '%j->>''cliente''%' THEN
    RAISE EXCEPTION 'a carga nao passou a ler o cliente do JSON.';
  END IF;

  def := pg_get_functiondef('public.fn_vendas_projetar'::regproc);

  -- Na atualizacao, quem digitou vence. Sem este COALESCE uma carga apagaria
  -- correcao de nome feita a mao.
  IF def NOT ILIKE '%COALESCE(v_antes.cliente%' THEN
    RAISE EXCEPTION 'a projecao nao preserva o cliente digitado a mao.';
  END IF;

  IF def ILIKE '%''importada''%' THEN
    RAISE EXCEPTION 'fn_vendas_projetar voltou a gravar evento tipo «importada», que o CHECK recusa.';
  END IF;

  IF def NOT ILIKE '%origem, lote_id, criado_por%' THEN
    RAISE EXCEPTION 'fn_vendas_projetar perdeu criado_por no INSERT de vendas.';
  END IF;

  -- E os dois consertos da Fase 6 continuam de pe.
  IF def NOT ILIKE '%LEFT JOIN public.vendas_franquias%' THEN
    RAISE EXCEPTION 'o LEFT JOIN da Fase 6 se perdeu.';
  END IF;

  IF def NOT ILIKE '%fn_vendas_equipe_que_credita%' THEN
    RAISE EXCEPTION 'a equipe que credita se perdeu.';
  END IF;
END $$;

COMMIT;
