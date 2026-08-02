-- ═══════════════════════════════════════════════════════════════════════════
-- 20260803b — CPF não entra em NENHUM campo de texto do acordo
-- ═══════════════════════════════════════════════════════════════════════════
-- A 20260803a fechou o campo de código. Faltavam os campos livres: nada impede
-- alguém de escrever "cliente João, CPF 529.982.247-25" nas observações, e o
-- dado pessoal entra do mesmo jeito. A regra da diretoria (28/07/2026) é que
-- nenhum CPF de cliente fica no banco — não "nenhum CPF no código".
--
-- Campos protegidos agora:
--   • instituicao   — código/inscrição (PaguePlay)
--   • nr_cliente    — NR (BookPlay)
--   • nome_cliente  — texto livre
--   • observacoes   — texto livre
--
-- ## `whatsapp` fica de fora, de propósito
--
-- Celular brasileiro tem 11 dígitos (DDD + 9), exatamente o tamanho de um CPF.
-- ~1% dos telefones passa nos dígitos verificadores por acaso: num cadastro de
-- milhares de acordos são dezenas de bloqueios falsos, com o operador sem
-- entender por que um telefone correto não salva. E um CPF digitado ali seria
-- um telefone inválido de todo jeito, pego por outro caminho. Bloqueio falso é
-- pior que passagem falsa — o mesmo critério da 20260803a.
--
-- ## Busca dentro do texto, não igualdade
--
-- Nos campos livres o CPF aparece NO MEIO da frase. `fn_texto_tem_cpf` varre os
-- candidatos com fronteira de dígito dos dois lados: sem isso, um CNPJ de 14
-- dígitos teria pedaços de 11 testados isoladamente e uma hora um passaria.
--
-- Espelho em TypeScript: `src/lib/cpf.ts` (`contemCpf`). Os dois mudam juntos.
--
-- Escopo do UPDATE segue o da 20260803a: só recusa quando o campo MUDA para um
-- valor com CPF. Linha antiga continua editável — é assim que ela vai ser
-- corrigida — e continua podendo ser paga.
--
-- Idempotente. No fim, lista os acordos que já têm CPF em algum campo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_texto_tem_cpf(p_texto TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  candidato TEXT;
BEGIN
  IF p_texto IS NULL OR p_texto = '' THEN RETURN FALSE; END IF;

  -- Candidatos: 11 dígitos com separadores opcionais, cercados por não-dígito.
  -- A fronteira é o que impede recortar um CPF de dentro de um número maior.
  FOR candidato IN
    SELECT (regexp_matches(
              p_texto,
              '(?<![0-9])([0-9]{3}[.\s]?[0-9]{3}[.\s]?[0-9]{3}[-\s]?[0-9]{2})(?![0-9])',
              'g'
            ))[1]
  LOOP
    IF public.fn_eh_cpf(candidato) THEN RETURN TRUE; END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.fn_texto_tem_cpf(TEXT) IS
  'true quando um CPF válido aparece em qualquer posição do texto. Espelha '
  'contemCpf() de src/lib/cpf.ts — os dois precisam mudar juntos.';

-- ─── Gatilho: agora sobre os quatro campos ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_acordo_recusa_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- No UPDATE só interessa o campo que MUDOU: linha antiga com CPF segue
  -- editável (é assim que ela vai ser corrigida) e segue podendo ser paga.
  IF public.fn_texto_tem_cpf(NEW.instituicao)
     AND (TG_OP = 'INSERT' OR NEW.instituicao IS DISTINCT FROM OLD.instituicao) THEN
    RAISE EXCEPTION
      'CPF no campo de código: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.nr_cliente)
     AND (TG_OP = 'INSERT' OR NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente) THEN
    RAISE EXCEPTION
      'CPF no campo de NR: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.nome_cliente)
     AND (TG_OP = 'INSERT' OR NEW.nome_cliente IS DISTINCT FROM OLD.nome_cliente) THEN
    RAISE EXCEPTION
      'CPF no nome do cliente: remova o CPF. Dado pessoal não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.observacoes)
     AND (TG_OP = 'INSERT' OR NEW.observacoes IS DISTINCT FROM OLD.observacoes) THEN
    RAISE EXCEPTION
      'CPF nas observações: remova o CPF. Dado pessoal não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- O gatilho já existe desde a 20260803a; recriado por segurança (idempotente).
DROP TRIGGER IF EXISTS trg_acordos_recusa_cpf ON public.acordos;
CREATE TRIGGER trg_acordos_recusa_cpf
  BEFORE INSERT OR UPDATE ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordo_recusa_cpf();

COMMENT ON FUNCTION public.fn_acordo_recusa_cpf() IS
  'Recusa CPF em instituicao, nr_cliente, nome_cliente e observacoes, nas duas '
  'empresas. `whatsapp` fica de fora: celular tem 11 dígitos como o CPF e ~1% '
  'cairia nos verificadores por acaso. INSERT sempre; UPDATE só quando o campo '
  'muda, para que linhas antigas possam ser corrigidas.';

-- ─── Os que já estão no banco ────────────────────────────────────────────────
-- Aparecem no TOPO da lista de acordos, em vermelho, com o aviso de que o CPF
-- precisa ser removido. Nada é apagado ou alterado por esta migration.

SELECT
  a.id,
  e.slug        AS empresa,
  a.nr_cliente,
  a.instituicao,
  a.nome_cliente,
  a.observacoes,
  a.vencimento,
  a.status,
  p.nome        AS operador,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN public.fn_texto_tem_cpf(a.instituicao)  THEN 'Código'          END,
    CASE WHEN public.fn_texto_tem_cpf(a.nr_cliente)   THEN 'NR'              END,
    CASE WHEN public.fn_texto_tem_cpf(a.nome_cliente) THEN 'Nome do cliente' END,
    CASE WHEN public.fn_texto_tem_cpf(a.observacoes)  THEN 'Observações'     END
  ], NULL) AS campos_com_cpf
FROM public.acordos a
JOIN public.empresas e ON e.id = a.empresa_id
LEFT JOIN public.perfis p ON p.id = a.operador_id
WHERE public.fn_texto_tem_cpf(a.instituicao)
   OR public.fn_texto_tem_cpf(a.nr_cliente)
   OR public.fn_texto_tem_cpf(a.nome_cliente)
   OR public.fn_texto_tem_cpf(a.observacoes)
ORDER BY e.slug, a.vencimento DESC;
