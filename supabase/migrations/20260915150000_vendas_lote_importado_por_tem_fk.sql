-- ============================================================================
-- Comercial: `vendas_lotes.importado_por` precisa da FK para o PostgREST
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026.
--
-- ## O defeito, e por que ele custou tanto para achar
--
-- A coluna nasceu sem REFERENCES na migration 20260915110000. Para o Postgres
-- isso e so um UUID solto e nada quebra — mas o PostgREST monta os joins da API
-- A PARTIR das foreign keys, e a tela pedia:
--
--     .select('... perfis:importado_por ( id, nome )')
--
-- Sem a FK ele responde:
--
--     Could not find a relationship between 'vendas_lotes' and 'perfis'
--     in the schema cache
--
-- Essa frase contem «could not find» E «schema cache» — que eram exatamente as
-- duas pistas que `tabelaAusente()` usava para concluir «a tabela nao existe».
-- O resultado foi uma tela pedindo que se aplicasse uma migration JA APLICADA,
-- por horas, enquanto o defeito era esta constraint.
--
-- O conserto de verdade foi duplo: a FK aqui, e a deteccao de erro em
-- `src/services/vendas/erroDoBanco.ts`, que agora separa «tabela ausente» de
-- «vinculo ausente» e tem teste para cada frase. Erro que aponta para o lugar
-- errado custa mais caro do que erro nenhum: faz a pessoa mexer no que estava
-- certo.
--
-- ON DELETE SET NULL, como o `confirmado_por` de `vendas`: apagar um perfil nao
-- pode levar junto o registro da carga. Quem importou deixa de ser
-- identificado; a carga continua existindo.
--
-- Escrita de dados: nenhuma. As duas tabelas estao vazias.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.vendas_lotes
  DROP CONSTRAINT IF EXISTS vendas_lotes_importado_por_fkey;

ALTER TABLE public.vendas_lotes
  ADD CONSTRAINT vendas_lotes_importado_por_fkey
  FOREIGN KEY (importado_por) REFERENCES public.perfis(id) ON DELETE SET NULL;

-- FK sem indice deixa o ON DELETE SET NULL varrendo a tabela.
CREATE INDEX IF NOT EXISTS idx_vendas_lotes_importado_por
  ON public.vendas_lotes(importado_por);

COMMENT ON COLUMN public.vendas_lotes.importado_por IS
  'Quem carregou. A FK nao e enfeite: o PostgREST monta o join da API a partir '
  'dela, e sem ela `perfis:importado_por` falha com «could not find a '
  'relationship».';

-- Mesma armadilha em potencial: a lixeira guarda quem excluiu, e uma tela
-- futura vai querer o nome pelo join em vez de pelo texto desnormalizado.
ALTER TABLE public.lixeira_vendas
  DROP CONSTRAINT IF EXISTS lixeira_vendas_excluido_por_id_fkey;

ALTER TABLE public.lixeira_vendas
  ADD CONSTRAINT lixeira_vendas_excluido_por_id_fkey
  FOREIGN KEY (excluido_por_id) REFERENCES public.perfis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lixeira_vendas_excluido_por
  ON public.lixeira_vendas(excluido_por_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.vendas_lotes'::regclass
       AND conname = 'vendas_lotes_importado_por_fkey'
  ) THEN
    RAISE EXCEPTION 'A FK de importado_por nao foi criada — o join da API continua quebrado.';
  END IF;
END $$;

COMMIT;
