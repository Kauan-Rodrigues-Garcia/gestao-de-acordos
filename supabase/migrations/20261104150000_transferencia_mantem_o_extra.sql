-- ═══════════════════════════════════════════════════════════════════════════
-- Autorização: transferir o DIRETO mantém o EXTRA, agora ligado a quem assumiu
-- (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O caso (NR 12926795)
--
-- Camila Ribeiro é DIRETO do NR, e Maria Valeria é o EXTRA dela. Ayslan Silva
-- pediu o acordo (transferência completa) e o líder aprovou. A aprovação caiu
-- em «NR_JA_REGISTRADO: já está tabulado por Maria Valeria»:
--
--   1. `fn_transferir_acordo_nr` apaga o DIRETO da Camila;
--   2. `trg_vinculo_par_del` (20261030235500) vê o DIRETO sair e promove o
--      EXTRA da Valeria a DIRETO — ela vira dona do NR;
--   3. o INSERT do acordo do Ayslan esbarra nela, e a aprovação inteira volta.
--
-- Ou seja: toda transferência de um DIRETO que tinha EXTRA falha desde 30/10.
--
-- ## A regra (decisão do Kauan, 04/11/2026)
--
-- Aprovada a transferência, quem pediu assume o DIRETO e o EXTRA CONTINUA,
-- agora ligado a quem assumiu. Quem perdeu o DIRETO sai só da linha
-- transferida: as outras parcelas (a paga de outubro, no caso) ficam com ela.
--
--   antes:  Camila DIRETO  <->  Valeria EXTRA
--   depois: Ayslan DIRETO  <->  Valeria EXTRA
--
-- ## Como
--
-- Só o despachante (`fn_autorizacao_decidir`) muda; o corpo da aprovação
-- (`fn_autorizacao_decidir_nr`) não é tocado. Quando o pedido é uma
-- transferência e o acordo alvo tem par EXTRA:
--
--   - liga `app.par_vinculo_em_curso` em volta da aprovação: o gatilho de
--     exclusão não promove o EXTRA, e o de inserção não tenta adivinhar par;
--   - depois que a aprovação gravou, religa as duas metades (EXTRA aponta para
--     quem assumiu, e o acordo novo aponta para o EXTRA) e avisa o EXTRA.
--
-- Tudo na mesma transação da aprovação: se qualquer passo falhar, nada muda.
-- Pedido sem EXTRA, recusa, troca_extra e tornar_direto seguem exatamente como
-- antes.
--
-- ## Para desfazer
--
-- Rodar de novo o `fn_autorizacao_decidir` de 20260930150000 (seção 8).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_autorizacao_decidir(
  p_id      UUID,
  p_aprovar BOOLEAN,
  p_motivo  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ped      public.autorizacoes_pedidos%ROWTYPE;
  v_alvo     public.acordos%ROWTYPE;
  v_extra    public.acordos%ROWTYPE;
  v_tem_par  BOOLEAN := false;
  v_res      JSONB;
  v_novo_id  UUID;
  v_extra_nome TEXT;
  v_uid      UUID := auth.uid();
  v_nome     TEXT;
BEGIN
  SELECT * INTO v_ped FROM public.autorizacoes_pedidos WHERE id = p_id;

  IF v_ped.modo = 'tornar_direto' THEN
    RETURN public.fn_tornar_direto_decidir(p_id, p_aprovar, p_motivo);
  END IF;

  -- Transferência aprovada de um DIRETO que tem EXTRA: o EXTRA fica (ver topo).
  IF p_aprovar AND v_ped.status = 'pendente' AND v_ped.modo = 'transferencia_completa'
     AND v_ped.acordo_alvo_id IS NOT NULL THEN
    SELECT * INTO v_alvo FROM public.acordos WHERE id = v_ped.acordo_alvo_id FOR UPDATE;
    IF FOUND AND COALESCE(v_alvo.tipo_vinculo, 'direto') = 'direto' AND v_alvo.par_acordo_id IS NOT NULL THEN
      SELECT * INTO v_extra FROM public.acordos
       WHERE id = v_alvo.par_acordo_id
         AND tipo_vinculo = 'extra'
         AND par_acordo_id = v_alvo.id
       FOR UPDATE;
      -- O EXTRA de quem está pedindo não entra: ele mesmo assumir o DIRETO
      -- é o «tornar direto», com o próprio fluxo.
      v_tem_par := FOUND AND v_extra.operador_id IS DISTINCT FROM v_ped.solicitante_id;
    END IF;
  END IF;

  IF NOT v_tem_par THEN
    RETURN public.fn_autorizacao_decidir_nr(p_id, p_aprovar, p_motivo);
  END IF;

  -- Os gatilhos do par ficam quietos durante a aprovação: a exclusão do DIRETO
  -- não promove o EXTRA, e o acordo novo não procura par sozinho.
  PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
  v_res := public.fn_autorizacao_decidir_nr(p_id, p_aprovar, p_motivo);

  IF COALESCE((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
    PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
    RETURN v_res;
  END IF;

  v_novo_id := COALESCE(
    NULLIF(v_res->>'acordo_id', '')::uuid,
    (SELECT acordo_criado_id FROM public.autorizacoes_pedidos WHERE id = p_id)
  );
  IF v_novo_id IS NULL THEN
    RAISE EXCEPTION 'Transferência aprovada sem acordo novo — o EXTRA não tem a quem se ligar.';
  END IF;

  SELECT nome INTO v_extra_nome FROM public.perfis WHERE id = v_extra.operador_id;

  -- As duas metades, religadas: o EXTRA passa a apontar para quem assumiu.
  UPDATE public.acordos
     SET vinculo_operador_id   = v_ped.solicitante_id,
         vinculo_operador_nome = v_ped.solicitante_nome,
         par_acordo_id         = v_novo_id
   WHERE id = v_extra.id;

  UPDATE public.acordos
     SET tipo_vinculo          = 'direto',
         vinculo_operador_id   = v_extra.operador_id,
         vinculo_operador_nome = COALESCE(v_extra_nome, v_alvo.vinculo_operador_nome),
         par_acordo_id         = v_extra.id
   WHERE id = v_novo_id;

  PERFORM set_config('app.par_vinculo_em_curso', 'off', true);

  -- Quem é EXTRA fica sabendo que o DIRETO mudou de mão.
  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_uid;
  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
  VALUES (
    v_extra.operador_id,
    format('Seu %s "%s" tem novo DIRETO', v_ped.nr_label, v_ped.nr_valor),
    format('O DIRETO do %s "%s" passou de %s para %s, com autorização de %s. Você continua como EXTRA, agora com %s.',
           v_ped.nr_label, v_ped.nr_valor, COALESCE(v_ped.dono_nome, '—'), v_ped.solicitante_nome,
           COALESCE(v_nome, 'um autorizador'), v_ped.solicitante_nome),
    v_ped.empresa_id, v_uid, COALESCE(v_nome, 'Autorizador')
  );

  RETURN v_res || jsonb_build_object('extra_mantido', v_extra.id);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) IS
  'Porta da gaveta de autorizacoes. tornar_direto -> fn_tornar_direto_decidir; '
  'o resto -> fn_autorizacao_decidir_nr (20260930150000). Transferencia de DIRETO '
  'com EXTRA mantem o EXTRA, religado a quem assumiu (20261104150000).';

-- A aprovação de dentro tem que existir e continuar fechada para o app.
DO $$
BEGIN
  IF to_regprocedure('public.fn_autorizacao_decidir_nr(uuid, boolean, text)') IS NULL THEN
    RAISE EXCEPTION 'fn_autorizacao_decidir_nr nao existe — o despachante nao tem para onde mandar';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_autorizacao_decidir_nr(uuid, boolean, text)', 'execute') THEN
    RAISE EXCEPTION 'fn_autorizacao_decidir_nr continua aberta para authenticated';
  END IF;
END $$;

COMMIT;
