-- ============================================================================
-- `fn_vendas_projetar`: os tres defeitos de ter REDIGITADO em vez de editar
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026. Corrige a Fase 6 (20260915160000).
--
-- ## O que quebrou, e onde
--
-- A Fase 6 precisava mudar DUAS coisas em `fn_vendas_projetar`: o INNER JOIN
-- virar LEFT JOIN, e a equipe passar a sair de `fn_vendas_equipe_que_credita`.
-- Em vez de mudar essas duas, a funcao inteira — 200 linhas — foi redigitada do
-- zero. Tres defeitos entraram junto, e nenhum deles aparece na criacao:
-- corpo de plpgsql nao e planejado no `CREATE`, so na execucao.
--
-- 1. **INSERT com 12 colunas e 11 valores.** O evento da venda nova ficou sem o
--    `motivo`. Esta e a mensagem que a tela mostrou:
--
--        INSERT has more target columns than expressions
--
-- 2. **`tipo = 'importada'`, que nao existe.** O CHECK de `vendas_eventos`
--    aceita criada, editada, confirmada, assinada, revertida, excluida e
--    restaurada. Corrigido o defeito 1, este estouraria na linha seguinte. O
--    tipo certo e `'criada'` — foi sempre ele, na Fase 3.
--
-- 3. **`cliente` e `criado_por` sumiram do INSERT de `vendas`.** O segundo e
--    quem rodou a projecao. Sem ele as 138 vendas nasceriam sem autor, e a
--    pergunta «quem lancou isto?» ficaria sem resposta para sempre.
--
-- ## O que nao quebrou, e por que
--
-- Nada foi gravado. A RPC e uma transacao: as 140 linhas falharam juntas e o
-- banco voltou ao que era — `vendas` e `vendas_eventos` seguiram em zero. O
-- unico custo foi o clique perdido.
--
-- ## A licao, que ja e regra nesta casa
--
-- Redigitar uma funcao para mudar duas linhas dela troca um diff de 2 linhas
-- por um de 200, e nenhuma revisao le 200 linhas com a atencao que le 2. Pior
-- aqui do que em outros lugares, porque `CREATE OR REPLACE FUNCTION` aceita
-- plpgsql com erro de aridade sem reclamar — ver a memoria
-- «plpgsql so valida em execucao».
--
-- O teste `vendas.sql.test.ts` agora conta as colunas e os valores de TODO
-- INSERT das migrations de vendas, e confere o `tipo` contra o CHECK. Ele teria
-- pego os tres antes de qualquer clique.
--
-- Escrita de dados: nenhuma.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

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
    v_preservadas, v_sem_dono, v_diverg,
    v_sem_fr, v_sem_fr_v, v_ignorada, v_ignorada_v, v_sem_dono_v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_projetar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_projetar(UUID) TO authenticated;

DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.fn_vendas_projetar'::regproc);

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
