-- ============================================================================
-- 20260825170000_produto_por_empresa.sql
--
-- `empresas.produto` — a diferenca entre EMPRESA e TIPO DE OPERACAO.
--
-- ## Por que a coluna existe
--
-- Durante um ano «empresa» e «tipo de operacao» foram a mesma coisa: havia
-- BookPlay e PaguePlay, as duas cobrando. `isPaguePlay`, espalhado por 410
-- pontos do codigo, nunca significou «que empresa e esta» — significou «qual
-- das duas variacoes da cobranca», pergunta que so faz sentido DENTRO da
-- cobranca.
--
-- Em 25/08 entraram COMERCIAL e RH. Sao empresas do mesmo grupo, no mesmo
-- banco, e nao compartilham regra de calculo, relatorio nem tela com a
-- cobranca. Nao sao variacao — sao outro produto.
--
--   cobranca   BookPlay, PaguePlay   (duas empresas, um produto)
--   comercial  Comercial
--   rh         Recursos Humanos
--
-- ## O DEFAULT some de proposito
--
-- A coluna nasce com `DEFAULT 'cobranca'` para preencher as linhas que ja
-- existem, e o default e REMOVIDO logo em seguida. Nao e capricho: com default,
-- a proxima empresa criada vira cobranca em silencio, que e exatamente o
-- vazamento que esta migration existe para fechar. Sem ele, quem criar uma
-- empresa e obrigado a dizer o que ela e — e o INSERT falha se nao disser.
--
-- O `CHECK` recusa produto inventado. Produto novo exige tela nova, entao ele
-- passa por codigo de qualquer forma; que passe por aqui tambem.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS produto TEXT NOT NULL DEFAULT 'cobranca';

-- As duas de agosto foram criadas antes da coluna e pegaram o default.
UPDATE public.empresas SET produto = 'comercial' WHERE slug = 'comercial';
UPDATE public.empresas SET produto = 'rh'        WHERE slug = 'rh';

ALTER TABLE public.empresas ALTER COLUMN produto DROP DEFAULT;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.empresas'::REGCLASS
       AND conname  = 'empresas_produto_conhecido'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_produto_conhecido
      CHECK (produto IN ('cobranca', 'comercial', 'rh'));
  END IF;
END
$check$;

COMMENT ON COLUMN public.empresas.produto IS
  'Que operacao esta empresa roda. BookPlay e PaguePlay sao duas empresas do '
  'produto cobranca. Sem DEFAULT de proposito: empresa nova precisa declarar. '
  'Ver 20260825170000.';

-- ── O cargo `rh` que faltou nas duas empresas novas ─────────────────────────
--
-- BookPlay e PaguePlay tem 9 cargos em `cargos_permissoes`; COMERCIAL e RH
-- nasceram com 8. O que falta e justamente `rh` — inclusive na empresa de RH.
--
-- A causa e conhecida: a semeadura usa `ON CONFLICT DO NOTHING`, entao cargo
-- acrescentado depois da criacao da empresa nunca ganha linha. Aqui a linha e
-- criada vazia (`'{}'`), que e o estado correto: nenhuma permissao ligada, para
-- alguem decidir na tela de Permissoes o que aquele cargo enxerga em cada
-- produto. Semear com os padroes da cobranca seria repetir o vazamento.

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
SELECT e.id, 'rh', '{}'::JSONB
  FROM public.empresas e
 WHERE NOT EXISTS (
   SELECT 1 FROM public.cargos_permissoes cp
    WHERE cp.empresa_id = e.id AND cp.cargo = 'rh'
 )
ON CONFLICT DO NOTHING;

COMMIT;
