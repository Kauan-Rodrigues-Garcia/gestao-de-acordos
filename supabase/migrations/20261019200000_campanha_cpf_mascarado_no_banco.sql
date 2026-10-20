-- ============================================================================
-- Campanha Fácil: o CPF é mascarado no BANCO, venha de onde vier — 19/10/2026
-- ============================================================================
--
-- O {{cpf}} sai mascarado desde hoje («xxx.xxx.789-00», os 5 últimos dígitos),
-- mas a máscara morava só no navegador. Às 12h04 uma campanha foi liberada de
-- uma aba aberta antes da atualização — o código antigo daquela aba gravou 189
-- mensagens com o CPF INTEIRO, numa campanha ativa. Aba velha, extensão,
-- chamada direta à API: qualquer caminho que não passe pelo código novo escapa
-- de uma máscara que só existe na tela.
--
-- Agora quem garante é a tabela. Um gatilho em `campanha_facil_contatos`
-- mascara o CPF de `mensagem`, `mensagem_editada` e `variaveis->cpf` em todo
-- INSERT e em todo UPDATE dessas colunas — inclusive o texto que
-- `fn_cf_renderizar` refaz quando o líder edita a campanha.
--
-- O que conta como CPF no texto (o mesmo critério das limpezas de hoje):
--   «CPF» seguido de 11 dígitos, com ou sem pontuação  → CPF xxx.xxx.789-00
--   000.000.000-00 em qualquer lugar                    → xxx.xxx.789-00
-- Telefone e 0800 não têm esse formato e não são tocados.
--
-- E conserta as mensagens que já estão gravadas com CPF inteiro.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A máscara ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cf_mascarar_cpf(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
           regexp_replace(p_texto,
             '(cpf\W{0,6})\d{3}\.?\d{3}\.?(\d{3})-?(\d{2})', '\1xxx.xxx.\2-\3', 'gi'),
           '\d{3}\.\d{3}\.(\d{3})-(\d{2})', 'xxx.xxx.\1-\2', 'g');
$function$;

COMMENT ON FUNCTION public.fn_cf_mascarar_cpf(TEXT) IS
  'Troca o CPF inteiro escrito num texto por xxx.xxx.789-00 (os 5 ultimos digitos). '
  'Mesma mascara de maskCpf (campaign-core.js). 20261019200000.';

-- ── 2. O gatilho ────────────────────────────────────────────────────────────
--
-- `variaveis->cpf` é o valor puro (sem «CPF» na frente): 11 dígitos viram a
-- máscara; o que já vier mascarado passa pela máscara de texto sem mudar.

CREATE OR REPLACE FUNCTION public.fn_cf_contatos_mascarar_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_cpf TEXT;
  v_dig TEXT;
BEGIN
  NEW.mensagem := public.fn_cf_mascarar_cpf(NEW.mensagem);
  IF NEW.mensagem_editada IS NOT NULL THEN
    NEW.mensagem_editada := public.fn_cf_mascarar_cpf(NEW.mensagem_editada);
  END IF;

  IF NEW.variaveis IS NOT NULL AND jsonb_typeof(NEW.variaveis) = 'object' AND NEW.variaveis ? 'cpf' THEN
    v_cpf := NEW.variaveis->>'cpf';
    v_dig := regexp_replace(COALESCE(v_cpf, ''), '\D', '', 'g');
    IF length(v_dig) = 11 AND v_cpf !~ 'x' THEN
      v_cpf := 'xxx.xxx.' || substr(v_dig, 7, 3) || '-' || substr(v_dig, 10, 2);
    ELSE
      v_cpf := public.fn_cf_mascarar_cpf(v_cpf);
    END IF;
    NEW.variaveis := jsonb_set(NEW.variaveis, '{cpf}', to_jsonb(v_cpf));
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cf_contatos_mascarar_cpf() FROM PUBLIC, anon, authenticated;

-- «zz»: gatilhos BEFORE da mesma tabela rodam em ordem alfabética. Este fica
-- por último, depois de `trg_cf_contatos_ao_alterar` e `..._do_envio`, para
-- mascarar o texto como ele vai mesmo ser gravado.
DROP TRIGGER IF EXISTS trg_cf_contatos_zz_mascarar_cpf ON public.campanha_facil_contatos;
CREATE TRIGGER trg_cf_contatos_zz_mascarar_cpf
  BEFORE INSERT OR UPDATE OF mensagem, mensagem_editada, variaveis
  ON public.campanha_facil_contatos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cf_contatos_mascarar_cpf();

-- ── 3. O que já está gravado ────────────────────────────────────────────────

DO $consertar$
DECLARE
  v_num CONSTANT TEXT := '(cpf\W{0,6}\d{3}\.?\d{3}\.?\d{3}-?\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})';
  v_n   INT;
BEGIN
  -- O gatilho acima faz a máscara: basta tocar as colunas.
  UPDATE public.campanha_facil_contatos
     SET mensagem = mensagem, mensagem_editada = mensagem_editada, variaveis = variaveis
   WHERE (mensagem || ' ' || COALESCE(mensagem_editada, '')) ~* v_num
      OR (variaveis->>'cpf') ~ '^\D*\d{3}\D?\d{3}\D?\d{3}\D?\d{2}\D*$';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM public.campanha_facil_contatos
              WHERE (mensagem || ' ' || COALESCE(mensagem_editada, '')) ~* v_num) THEN
    RAISE EXCEPTION 'Sobrou CPF inteiro nas mensagens. Tudo desfeito.';
  END IF;
  RAISE NOTICE 'Mensagens mascaradas agora: %', v_n;
END
$consertar$;

-- ── Prova: o gatilho mascara o que entra ────────────────────────────────────

DO $prova$
BEGIN
  IF public.fn_cf_mascarar_cpf('Olá - *_CPF: 123.456.789-00_*') <> 'Olá - *_CPF: xxx.xxx.789-00_*' THEN
    RAISE EXCEPTION 'A máscara não deu o formato esperado.';
  END IF;
  IF public.fn_cf_mascarar_cpf('Fone (18) 99999-9999, 0800 123 4567') <> 'Fone (18) 99999-9999, 0800 123 4567' THEN
    RAISE EXCEPTION 'A máscara mexeu em telefone.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_cf_contatos_zz_mascarar_cpf'
                    AND tgrelid = 'public.campanha_facil_contatos'::regclass) THEN
    RAISE EXCEPTION 'O gatilho não foi criado.';
  END IF;
END
$prova$;

COMMIT;

-- Conferência (somente leitura): espere cpf_inteiro = 0.
SELECT count(*) FILTER (WHERE (mensagem || ' ' || COALESCE(mensagem_editada, ''))
         ~* '(cpf\W{0,6}\d{3}\.?\d{3}\.?\d{3}-?\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})') AS cpf_inteiro
  FROM public.campanha_facil_contatos;
