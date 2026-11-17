-- ============================================================================
-- Acordo novo completa nome do cliente e instituição pelo histórico do NR
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 17/11/2026. Os relatórios de recebimento (58/59) trazem o
-- nome do cliente e, na BookPlay, a instituição (coluna «Empresa»), e tudo isso
-- já fica em `analitico_recebimentos`. Mesmo assim, conferido em 17/11:
--
--   - 1.897 acordos BookPlay e 374 na empresa pagueplay estavam sem nome
--     (o relatório tinha o nome de 1.646 e de 256 deles);
--   - 6.717 acordos com NR estavam sem instituição (6.045 com instituição no
--     relatório).
--
-- ## A regra
--
-- Todo INSERT em `acordos`, venha de onde vier (tela, importação, parcela,
-- reagendamento, par), completa o que chegou VAZIO — nunca sobrescreve:
--
--   - nome do cliente: o do acordo mais recente com a mesma chave na mesma
--     empresa; sem ele, o do recebimento mais recente do relatório.
--   - instituição: SÓ quando o acordo tem NR. Sem NR, a `instituicao` é a
--     chave do acordo (o Código da regra Cofen — `fn_nr_campo_chave`), e
--     escrever «BOOKPLAY» ali trocaria o dono. Mesma ordem: acordo anterior,
--     depois relatório.
--
-- A instituição só entra se for uma das quatro da tela (INSTITUICOES_OPTIONS em
-- src/lib/index.ts). «UNIVERSIDADE PLAY» e «EDIT BRASIL», que o relatório traz
-- e a tela não tem, entram como «MUNDIAL EDITORA» (decisão do Cleber,
-- 17/11/2026). Qualquer outro texto não entra.
--
-- Nome com CPF não é aproveitado (`fn_texto_tem_cpf`): o gatilho de CPF
-- recusaria o acordo inteiro por causa do preenchimento.
--
-- A busca nunca derruba o salvamento: se der erro, o acordo entra como veio.
--
-- O preenchimento dos acordos JÁ SALVOS não está aqui: é o script
-- supabase/sql_scripts/preencher_cliente_dos_acordos_20261117.sql, rodado à
-- parte com autorização.
--
-- Reaplicável. Não escreve em nenhuma linha.

BEGIN;

-- ── 1. As quatro instituições da tela ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_instituicao_oficial(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE upper(btrim(coalesce(p_texto, '')))
    WHEN 'MUNDIAL EDITORA'    THEN 'MUNDIAL EDITORA'
    WHEN 'BOOKPLAY'           THEN 'BOOKPLAY'
    WHEN 'FACULDADE BOOKPLAY' THEN 'FACULDADE BOOKPLAY'
    WHEN 'FACULDADE PLAY'     THEN 'FACULDADE PLAY'
    -- Fora da lista da tela; decisão de 17/11/2026.
    WHEN 'UNIVERSIDADE PLAY'  THEN 'MUNDIAL EDITORA'
    WHEN 'EDIT BRASIL'        THEN 'MUNDIAL EDITORA'
  END;
$function$;

COMMENT ON FUNCTION public.fn_instituicao_oficial(text) IS
  'Traduz a instituição para uma das quatro da tela (INSTITUICOES_OPTIONS); NULL quando não é nenhuma. Ver 20261117120000.';

-- ── 2. O que já se sabe do cliente daquela chave ────────────────────────────

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

  -- Acordo anterior com a mesma chave. As duas formas de achar usam os
  -- índices de `nr_cliente` e de `instituicao`.
  IF v_campo = 'nr_cliente' THEN
    SELECT btrim(a.nome_cliente) INTO v_nome
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.nr_cliente = v_chave
       AND btrim(coalesce(a.nome_cliente, '')) <> ''
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
    SELECT btrim(a.nome_cliente) INTO v_nome
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.instituicao = v_chave
       AND btrim(coalesce(a.nr_cliente, '')) = ''
       AND btrim(coalesce(a.nome_cliente, '')) <> ''
       AND NOT public.fn_texto_tem_cpf(a.nome_cliente)
     ORDER BY a.criado_em DESC
     LIMIT 1;
  END IF;

  -- O relatório (`codigo` é o NR, ou o Código na regra Cofen).
  IF v_nome IS NULL THEN
    SELECT btrim(r.nome_cliente) INTO v_nome
      FROM public.analitico_recebimentos r
     WHERE r.empresa_id = p_empresa_id
       AND r.codigo = v_chave
       AND btrim(coalesce(r.nome_cliente, '')) <> ''
       AND NOT public.fn_texto_tem_cpf(r.nome_cliente)
     ORDER BY r.data_pagamento DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- Instituição só quando a chave é o NR: sem NR, ela É a chave.
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

-- Lê nome de cliente de qualquer operador: interna, só o gatilho e o script usam.
REVOKE ALL ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) IS
  'Nome e instituição já conhecidos de uma chave de acordo: acordo anterior da mesma chave, senão o relatório (analitico_recebimentos). Instituição só quando a chave é o NR. Ver 20261117120000.';

-- ── 3. O gatilho ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_acordos_completa_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_falta_nome boolean := btrim(coalesce(NEW.nome_cliente, '')) = '';
  v_falta_inst boolean := btrim(coalesce(NEW.nr_cliente, '')) <> ''
                      AND btrim(coalesce(NEW.instituicao, '')) = '';
  v_nome text;
  v_inst text;
BEGIN
  IF NOT (v_falta_nome OR v_falta_inst) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT c.cliente_nome, c.cliente_instituicao INTO v_nome, v_inst
      FROM public.fn_cliente_conhecido(NEW.empresa_id, NEW.nr_cliente, NEW.instituicao) c;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_acordos_completa_cliente: busca falhou, acordo entra como veio: %', SQLERRM;
    RETURN NEW;
  END;

  IF v_falta_nome AND v_nome IS NOT NULL THEN
    NEW.nome_cliente := v_nome;
  END IF;
  IF v_falta_inst AND v_inst IS NOT NULL THEN
    NEW.instituicao := v_inst;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordos_completa_cliente() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_acordos_completa_cliente() IS
  'BEFORE INSERT em acordos: completa nome do cliente e (com NR) instituição vazios pelo histórico da chave. Nunca sobrescreve. Ver 20261117120000.';

-- Nome escolhido pela ordem alfabética dos BEFORE: roda depois de
-- trg_acordos_chave_so_numeros e ANTES de trg_acordos_recusa_cpf, que confere
-- o nome já completado.
DROP TRIGGER IF EXISTS trg_acordos_completa_cliente ON public.acordos;
CREATE TRIGGER trg_acordos_completa_cliente
  BEFORE INSERT ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordos_completa_cliente();

COMMIT;

-- Conferência depois de aplicar:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.acordos'::regclass AND tgname = 'trg_acordos_completa_cliente';
