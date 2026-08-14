-- ═══════════════════════════════════════════════════════════════════════════
-- 20260803a — CPF não entra pelo campo de código do acordo
-- ═══════════════════════════════════════════════════════════════════════════
-- A diretoria decidiu em 28/07/2026 que nenhum CPF de cliente fica no banco, e
-- a 20260728b removeu as colunas que existiam. Só que o campo de CÓDIGO do
-- acordo é texto livre: em 03/08/2026 apareceu um acordo com o CPF do cliente
-- digitado no lugar do código. A porta estava aberta e ninguém olhava.
--
-- Campos protegidos (os dois, nas duas empresas — CPF não pertence a nenhum):
--   • `instituicao` — o código/inscrição da PaguePlay;
--   • `nr_cliente`  — o NR da BookPlay.
--
-- ## Por que conferir o dígito verificador em vez de recusar 11 dígitos
--
-- Recusar todo valor de 11 dígitos pegaria mais casos, mas bloquearia trabalho
-- legítimo se algum código do ERP tiver esse tamanho — e bloqueio falso é pior
-- que passagem falsa: o operador não consegue tabular e não descobre o motivo.
-- Com os verificadores, a chance de confundir um número qualquer com CPF é ~1%,
-- e os códigos reais que o ERP emite (relatórios de julho/2026 das duas
-- empresas) têm 7 ou 8 dígitos. O espelho em TypeScript é `src/lib/cpf.ts`; os
-- dois precisam mudar juntos.
--
-- ## Escopo do UPDATE
--
-- INSERT sempre recusa. UPDATE recusa apenas quando o valor MUDA para um CPF.
-- Um acordo antigo que já tem CPF gravado continua editável — inclusive para
-- ser CORRIGIDO, que é o que se quer — e continua podendo ser marcado como
-- pago. Travar qualquer update dele deixaria a linha impossível de consertar
-- pela tela e pararia a operação por causa de dado histórico.
--
-- Idempotente. No fim, uma consulta lista os acordos que já estão com CPF.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Validador de CPF ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_eh_cpf(p_valor TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d    TEXT;
  soma INT;
  dig  INT;
  i    INT;
BEGIN
  IF p_valor IS NULL THEN RETURN FALSE; END IF;

  -- Aceita com ou sem máscara: 529.982.247-25 e 52998224725 são o mesmo CPF.
  d := regexp_replace(p_valor, '\D', '', 'g');
  IF length(d) <> 11 THEN RETURN FALSE; END IF;

  -- Sequência de um dígito só passa na conta dos verificadores; é o caso
  -- clássico que engana validador ingênuo. Não é CPF.
  IF d ~ '^(.)\1{10}$' THEN RETURN FALSE; END IF;

  -- 1º dígito verificador: pesos 10..2 sobre os 9 primeiros.
  soma := 0;
  FOR i IN 1..9 LOOP
    soma := soma + substr(d, i, 1)::INT * (11 - i);
  END LOOP;
  dig := (soma * 10) % 11;
  IF dig >= 10 THEN dig := 0; END IF;   -- regra da Receita, não arredondamento
  IF dig <> substr(d, 10, 1)::INT THEN RETURN FALSE; END IF;

  -- 2º dígito verificador: pesos 11..2 sobre os 10 primeiros.
  soma := 0;
  FOR i IN 1..10 LOOP
    soma := soma + substr(d, i, 1)::INT * (12 - i);
  END LOOP;
  dig := (soma * 10) % 11;
  IF dig >= 10 THEN dig := 0; END IF;
  RETURN dig = substr(d, 11, 1)::INT;
END;
$$;

COMMENT ON FUNCTION public.fn_eh_cpf(TEXT) IS
  'true quando o texto é um CPF válido (com ou sem máscara). Espelha '
  'src/lib/cpf.ts — os dois precisam mudar juntos.';

-- ─── Gatilho nos acordos ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_acordo_recusa_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- No UPDATE só interessa o que MUDOU: linha antiga com CPF segue editável
  -- (é assim que ela vai ser corrigida) e segue podendo ser paga.
  IF public.fn_eh_cpf(NEW.instituicao)
     AND (TG_OP = 'INSERT' OR NEW.instituicao IS DISTINCT FROM OLD.instituicao) THEN
    RAISE EXCEPTION
      'CPF no campo de código: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_eh_cpf(NEW.nr_cliente)
     AND (TG_OP = 'INSERT' OR NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente) THEN
    RAISE EXCEPTION
      'CPF no campo de NR: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acordos_recusa_cpf ON public.acordos;
CREATE TRIGGER trg_acordos_recusa_cpf
  BEFORE INSERT OR UPDATE ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordo_recusa_cpf();

COMMENT ON FUNCTION public.fn_acordo_recusa_cpf() IS
  'Recusa CPF em acordos.instituicao (código PaguePlay) e acordos.nr_cliente '
  '(NR BookPlay), nas duas empresas. INSERT sempre; UPDATE só quando o valor '
  'muda para um CPF, para que linhas antigas possam ser corrigidas.';

-- ─── Os que já estão no banco ────────────────────────────────────────────────
-- Não são apagados nem alterados por esta migration: só a empresa sabe qual é
-- o código certo de cada um. A lista abaixo é para corrigir um a um pela tela.

SELECT
  a.id,
  e.slug            AS empresa,
  a.nr_cliente,
  a.instituicao,
  a.nome_cliente,
  a.vencimento,
  a.status,
  p.nome            AS operador
FROM public.acordos a
JOIN public.empresas e ON e.id = a.empresa_id
LEFT JOIN public.perfis p ON p.id = a.operador_id
WHERE public.fn_eh_cpf(a.instituicao) OR public.fn_eh_cpf(a.nr_cliente)
ORDER BY e.slug, a.vencimento DESC;
