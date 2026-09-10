-- ============================================================
-- Autopreenchimento por NR na BookPlay: o cadastro de profissionais
-- (mailing, hoje só usado pela PaguePlay) passa a guardar também a
-- instituição, para preencher o Select da BookPlay ao digitar o NR.
-- ============================================================

ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS instituicao text;

COMMENT ON COLUMN public.profissionais.instituicao IS
  'Instituição do cliente (BookPlay) — MUNDIAL EDITORA, BOOKPLAY, FACULDADE '
  'BOOKPLAY ou FACULDADE PLAY. NULL para cadastros da PaguePlay ou quando a '
  'base de origem não trouxe um valor reconhecido.';
