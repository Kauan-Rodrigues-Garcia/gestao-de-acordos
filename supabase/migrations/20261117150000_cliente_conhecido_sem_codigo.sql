-- ============================================================================
-- Nome do cliente sem o código do ERP na frente
-- ============================================================================
--
-- ## Por que
--
-- 17/11/2026: o preenchimento da migration 20261117120000 gravou nomes como
-- «1994034 - NOME DO CLIENTE». O relatório 58 corta esse código na leitura
-- (`extrairNome`, src/services/analitico/analiticoComum.ts), mas a projeção do
-- 59 (`vw_mestre_projecao_analitico`) grava a coluna «Cliente» inteira — e
-- `fn_cliente_conhecido` reaproveitou o texto como veio.
--
-- ## O que muda
--
--   - `fn_nome_sem_codigo`: tira «números + hífen» do começo do nome, a mesma
--     regra do `extrairNome`. Nome que é só o código vira NULL (não aproveita).
--   - `fn_cliente_conhecido` passa todo nome por ela, venha do acordo anterior
--     ou do relatório. Fora isso, igual à 20261117120000.
--
-- A limpeza dos acordos já gravados é o script
-- supabase/sql_scripts/limpar_codigo_no_nome_dos_acordos_20261117.sql.
--
-- Reaplicável. Não escreve em nenhuma linha.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_nome_sem_codigo(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT nullif(btrim(regexp_replace(coalesce(p_nome, ''), '^\s*\d+\s*[-–]\s*', '')), '');
$function$;

COMMENT ON FUNCTION public.fn_nome_sem_codigo(text) IS
  'Tira o código do ERP do começo do nome («1994034 - NOME» → «NOME»), como extrairNome no front. NULL quando não sobra nome. Ver 20261117150000.';

CREATE OR REPLACE FUNCTION public.fn_cliente_conhecido(
  p_empresa_id  uuid,
  p_nr_cliente  text,
  p_instituicao text
)
RETURNS TABLE (cliente_nome text, cliente_instituicao text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campo text := public.fn_nr_campo_chave(p_nr_cliente, p_instituicao);
  v_chave text := public.fn_acordo_chave_valor(p_nr_cliente, p_instituicao);
  v_nome  text;
  v_inst  text;
BEGIN
  IF p_empresa_id IS NULL OR v_campo IS NULL OR coalesce(v_chave, '') = '' THEN
    RETURN;
  END IF;

  IF v_campo = 'nr_cliente' THEN
    SELECT public.fn_nome_sem_codigo(a.nome_cliente) INTO v_nome
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.nr_cliente = v_chave
       AND public.fn_nome_sem_codigo(a.nome_cliente) IS NOT NULL
       AND NOT public.fn_texto_tem_cpf(a.nome_cliente)
     ORDER BY a.criado_em DESC
     LIMIT 1;

    SELECT public.fn_instituicao_oficial(a.instituicao) INTO v_inst
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.nr_cliente = v_chave
       AND public.fn_instituicao_oficial(a.instituicao) IS NOT NULL
     ORDER BY a.criado_em DESC
     LIMIT 1;
  ELSE
    SELECT public.fn_nome_sem_codigo(a.nome_cliente) INTO v_nome
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.instituicao = v_chave
       AND btrim(coalesce(a.nr_cliente, '')) = ''
       AND public.fn_nome_sem_codigo(a.nome_cliente) IS NOT NULL
       AND NOT public.fn_texto_tem_cpf(a.nome_cliente)
     ORDER BY a.criado_em DESC
     LIMIT 1;
  END IF;

  IF v_nome IS NULL THEN
    SELECT public.fn_nome_sem_codigo(r.nome_cliente) INTO v_nome
      FROM public.analitico_recebimentos r
     WHERE r.empresa_id = p_empresa_id
       AND r.codigo = v_chave
       AND public.fn_nome_sem_codigo(r.nome_cliente) IS NOT NULL
       AND NOT public.fn_texto_tem_cpf(r.nome_cliente)
     ORDER BY r.data_pagamento DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_campo = 'nr_cliente' AND v_inst IS NULL THEN
    SELECT public.fn_instituicao_oficial(r.instituicao) INTO v_inst
      FROM public.analitico_recebimentos r
     WHERE r.empresa_id = p_empresa_id
       AND r.codigo = v_chave
       AND public.fn_instituicao_oficial(r.instituicao) IS NOT NULL
     ORDER BY r.data_pagamento DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_campo <> 'nr_cliente' THEN
    v_inst := NULL;
  END IF;

  IF v_nome IS NOT NULL OR v_inst IS NOT NULL THEN
    cliente_nome        := v_nome;
    cliente_instituicao := v_inst;
    RETURN NEXT;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) IS
  'Nome (sem o código do ERP) e instituição já conhecidos de uma chave de acordo: acordo anterior da mesma chave, senão o relatório. Instituição só quando a chave é o NR. Ver 20261117120000 e 20261117150000.';

COMMIT;
