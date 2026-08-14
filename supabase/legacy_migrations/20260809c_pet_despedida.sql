-- ═══════════════════════════════════════════════════════════════════════════
-- PET — despedida: quem conviveu com ele ganha um adeus, quem nunca entrou não
-- ═══════════════════════════════════════════════════════════════════════════
-- O pet sai de cena por um tempo para abrir espaço para outro jogo. Sair sem
-- aviso seria estranho para quem convive com ele todo dia, então quem já usava
-- o sistema recebe um card de despedida com animação de saída. Quem foi
-- cadastrado e nunca entrou não precisa saber que existiu um pet.
--
-- Três estados na coluna:
--   'pendente'   → já tinha logado quando esta migration rodou: vê a despedida
--   'concluida'  → já dispensou o card: pet some de vez
--   NULL         → nunca acessou, ou foi criado depois: o pet nunca existiu
--
-- Ver docs/superpowers/specs/2026-08-09-despedida-do-pet-design.md
--
-- Idempotente.

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS pet_despedida TEXT;

COMMENT ON COLUMN public.perfis.pet_despedida IS
  'Despedida do pet: ''pendente'' (deve ver o card), ''concluida'' (já se despediu), NULL (nunca conviveu com o pet). Ver 20260809c.';

-- ─── Backfill: quem já esteve aqui ──────────────────────────────────────────
--
-- O critério é `auth.users.last_sign_in_at`, não `perfis.criado_em`. Usuário
-- cadastrado semanas atrás que nunca entrou tem `criado_em` antigo e seria
-- tratado como veterano — exatamente o caso que se quer excluir. `perfis.ativo`
-- também não serve: quem é criado e nunca acessa nasce ativo.
--
-- O `pet_despedida IS NULL` no WHERE é o que torna isto idempotente de verdade:
-- sem ele, rodar a migration de novo devolveria 'pendente' a quem já se
-- despediu, e o card ressuscitaria para todo mundo.
UPDATE public.perfis p
   SET pet_despedida = 'pendente'
  FROM auth.users u
 WHERE u.id = p.id
   AND u.last_sign_in_at IS NOT NULL
   AND p.pet_despedida IS NULL;
