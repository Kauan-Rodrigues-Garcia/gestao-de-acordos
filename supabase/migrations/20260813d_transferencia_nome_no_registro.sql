-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813d — O nome de quem foi transferido, gravado no registro
-- ═══════════════════════════════════════════════════════════════════════════
-- ## Por que o nome não pode vir de um JOIN
--
-- O fantasma aparece na empresa de ORIGEM: é lá que a pessoa deixou o
-- recebimento do mês. Só que, numa transferência de empresa, ela não está mais
-- em `perfis` daquela empresa — e a RLS de `perfis` é clara:
--
--     auth.uid() = id
--     OR fn_user_is_super_admin()
--     OR (empresa_id = fn_user_empresa_id() AND cargo IN (...))
--
-- Um líder da PaguePlay não lê o perfil de quem foi para a BookPlay. O JOIN
-- devolve NULL e o card do fantasma sai sem nome — justamente para o público
-- que mais precisa dele, porque é ele quem decide se tira o recebimento da
-- equipe.
--
-- Guardar o nome no registro também é o certo por si: um registro de
-- transferência que depende de um JOIN vivo deixa de contar a história no dia
-- em que o perfil é apagado. Nome é o estado de então, não o de agora.
--
-- Idempotente. Backfill inclui as linhas já gravadas.

ALTER TABLE public.perfis_transferencias
  ADD COLUMN IF NOT EXISTS perfil_nome TEXT;

COMMENT ON COLUMN public.perfis_transferencias.perfil_nome IS
  'Nome de quem foi transferido, no momento da transferência. Cópia proposital: '
  'a empresa de ORIGEM não enxerga o perfil depois de uma troca de empresa.';

-- Backfill: as linhas gravadas antes desta migration. Roda como dono da
-- migration, então enxerga os dois lados.
UPDATE public.perfis_transferencias t
   SET perfil_nome = p.nome
  FROM public.perfis p
 WHERE p.id = t.perfil_id
   AND t.perfil_nome IS NULL;

-- ─── Conferência ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sem_nome INT;
BEGIN
  SELECT count(*) INTO v_sem_nome
    FROM public.perfis_transferencias WHERE perfil_nome IS NULL;

  IF v_sem_nome > 0 THEN
    -- Não é erro: um perfil apagado depois da transferência não tem de onde
    -- puxar o nome. A tela mostra "usuário removido" nesses casos.
    RAISE NOTICE
      '% transferência(s) sem nome — perfil já não existe. A tela cobre o caso.',
      v_sem_nome;
  END IF;

  RAISE NOTICE 'perfis_transferencias.perfil_nome pronta.';
END $$;
