-- Colunas usadas pelo fluxo Chatplay (ChatplayNewFeatureModal, ChatplayOnboardingModal)
-- desde antes deste repo rastrear migrations — nunca existiu arquivo de migration
-- para elas, então o database.types.ts ficava sem a coluna e o tsc não pegava.
-- IF NOT EXISTS: idempotente, seguro rodar mesmo se já foram criadas manualmente.
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS tampermonkey_configured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS viu_notificacao_chatplay BOOLEAN DEFAULT FALSE;
