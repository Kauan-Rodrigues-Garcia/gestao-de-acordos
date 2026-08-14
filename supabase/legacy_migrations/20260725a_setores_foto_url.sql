-- ═══════════════════════════════════════════════════════════════════════════
-- 20260725a — Foto do setor (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- O card do setor em "Desempenho Equipes" passa a ter foto própria, clicável
-- para upload (igual à foto de usuário). Guardada em setores.foto_url; o arquivo
-- fica no bucket 'perfis' em setores/<setor_id>.<ext>.

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

COMMENT ON COLUMN public.setores.foto_url IS
  'URL pública da foto do setor (bucket perfis, path setores/<id>). Exibida no card do setor em Desempenho Equipes.';
