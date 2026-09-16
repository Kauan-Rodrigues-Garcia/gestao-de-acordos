-- ============================================================================
-- Comissao: percentual com seis casas decimais
-- ============================================================================
--
-- A premiacao do Receptivo (16/09/2026) define cada faixa como prêmio ÷ meta:
-- R$ 467,00 em R$ 90.000,00 = 0,518889%. NUMERIC(6,3) guardava 0,519%, e na
-- meta cheia a comissao saia R$ 467,10; em R$ 95.000,00 a 0,705%, R$ 669,75 em
-- vez de R$ 670,00. Com seis casas, as onze tabelas da planilha batem centavo a
-- centavo na meta de cada faixa.
--
-- So aumenta escala e precisao: todo valor gravado cabe no tipo novo sem
-- arredondar. Os CHECK (>= 0) continuam. O multiplicador fica NUMERIC(6,3).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.comissao_faixas
  ALTER COLUMN pct          TYPE NUMERIC(9,6),
  ALTER COLUMN pct_especial TYPE NUMERIC(9,6);

ALTER TABLE public.comissao_config
  ALTER COLUMN pct_indireta          TYPE NUMERIC(9,6),
  ALTER COLUMN pct_indireta_especial TYPE NUMERIC(9,6);

DO $prova$
BEGIN
  IF (
    SELECT count(*) FROM pg_attribute a
     WHERE (a.attrelid, a.attname) IN (
             ('public.comissao_faixas'::REGCLASS, 'pct'),
             ('public.comissao_faixas'::REGCLASS, 'pct_especial'),
             ('public.comissao_config'::REGCLASS, 'pct_indireta'),
             ('public.comissao_config'::REGCLASS, 'pct_indireta_especial'))
       AND format_type(a.atttypid, a.atttypmod) = 'numeric(9,6)'
  ) <> 4 THEN
    RAISE EXCEPTION 'Alguma coluna de percentual da comissao nao ficou NUMERIC(9,6).';
  END IF;
END
$prova$;

COMMIT;
