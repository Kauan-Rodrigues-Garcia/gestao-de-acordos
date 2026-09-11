-- ============================================================================
-- Converter para Assistente ADM quem ja esta no setor do Nucleo
-- ============================================================================
--
-- NAO e migration. Roda no SQL Editor, a mao, ENTRE as duas migrations:
--
--   1. 20260911120000_assistente_adm_cargo.sql   (o cargo precisa existir)
--   2. ESTE ARQUIVO — primeiro o PASSO 1, conferir; depois o PASSO 2
--   3. 20260911121000_assistente_adm_trava.sql   (recusa aplicar se sobrar alguem)
--
-- Administrador e super_admin nao sao convertidos: acesso total nao tem lado.
-- A trigger `trg_impedir_escalada_de_cargo` deixa passar o SQL Editor (sem
-- `auth.uid()`), entao o UPDATE nao e barrado por ela.
-- ============================================================================


-- ── PASSO 1 — conferir (so leitura) ─────────────────────────────────────────
-- Quem esta no setor do Nucleo e vai virar Assistente ADM.

SELECT p.id, p.nome, p.perfil AS cargo_atual, p.situacao, s.nome AS setor
  FROM public.perfis p
  JOIN public.numeros_config c
    ON c.empresa_id = p.empresa_id AND p.setor_id = c.setor_nucleo_id
  JOIN public.setores s ON s.id = p.setor_id
 WHERE p.perfil NOT IN ('assistente_adm', 'administrador', 'super_admin')
 ORDER BY p.nome;


-- ── PASSO 2 — converter ─────────────────────────────────────────────────────
-- Atinge exatamente as linhas do PASSO 1. O RETURNING lista quem mudou.

UPDATE public.perfis p
   SET perfil = 'assistente_adm'
  FROM public.numeros_config c
 WHERE c.empresa_id = p.empresa_id
   AND p.setor_id = c.setor_nucleo_id
   AND p.perfil NOT IN ('assistente_adm', 'administrador', 'super_admin')
RETURNING p.nome, p.perfil;
