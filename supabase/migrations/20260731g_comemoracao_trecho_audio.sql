-- ============================================================================
-- 20260731g — Som da comemoração: arquivo maior e trecho escolhido
-- ============================================================================
--
-- Duas coisas:
--
-- 1. O limite do bucket sobe de 5 MB para 10 MB, para caber música de verdade.
--    O teto continua vivendo NO BUCKET e não no front: validação só no
--    navegador é contornável pela API.
--
-- 2. O líder passa a escolher QUAL PEDAÇO da música toca. O arquivo vai inteiro
--    para o Storage e o que se guarda aqui é a marcação — onde começa e quanto
--    dura.
--
--    Recortar o arquivo de verdade exigiria decodar e re-codificar o áudio no
--    navegador: biblioteca nova, CPU e perda de qualidade, para um resultado
--    que o `currentTime` do player entrega de graça. E como o Storage responde
--    a Range request, o navegador do operador busca só o pedaço que vai tocar.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Trecho ───────────────────────────────────────────────────────────────

ALTER TABLE public.comemoracao_midias
  ADD COLUMN IF NOT EXISTS inicio_s  NUMERIC(6,1) NOT NULL DEFAULT 0,
  -- NULL = toca do início ao fim. É o que vale para todo som enviado antes
  -- desta migration, que não tinha trecho nenhum.
  ADD COLUMN IF NOT EXISTS trecho_s  NUMERIC(4,1);

COMMENT ON COLUMN public.comemoracao_midias.inicio_s IS
  'Segundo em que o som começa a tocar. Só vale para tipo = som.';
COMMENT ON COLUMN public.comemoracao_midias.trecho_s IS
  'Quantos segundos tocam a partir de inicio_s. NULL = arquivo inteiro.';

-- Nenhuma comemoração passa de 1 minuto, então o trecho também não.
ALTER TABLE public.comemoracao_midias
  DROP CONSTRAINT IF EXISTS comemoracao_midias_trecho_valido;

ALTER TABLE public.comemoracao_midias
  ADD CONSTRAINT comemoracao_midias_trecho_valido
  CHECK (
    inicio_s >= 0
    AND (trecho_s IS NULL OR (trecho_s > 0 AND trecho_s <= 60))
  );

-- ── 2. Bucket: 10 MB ────────────────────────────────────────────────────────

UPDATE storage.buckets
   SET file_size_limit = 10485760
 WHERE id = 'comemoracoes';

-- Se o bucket ainda não existir (20260731f não aplicada), cria já no tamanho
-- novo — assim a ordem entre as duas migrations não importa.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comemoracoes', 'comemoracoes', true, 10485760,
  ARRAY['image/gif','image/png','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/ogg']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit;
