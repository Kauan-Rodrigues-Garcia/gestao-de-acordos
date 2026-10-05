-- ═══════════════════════════════════════════════════════════════════════════
-- ESCRITA (05/10/2026) — avisa todo mundo que o Som ambiente ganhou faixas
--
-- ⚠ UMA VEZ SÓ, e depois do deploy das faixas novas: cada execução cria outra
--   leva de notificações. As notificações duram o dia — o pg_cron apaga as de
--   antes à 00:05 (migration 20261005190000).
--
-- O que altera: INSERT em public.notificacoes, uma por perfil ativo. Não mexe
-- em mais nada.
-- Linhas esperadas: o número de perfis ativos (conferir antes com
--   SELECT count(*) FROM public.perfis WHERE ativo;).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida)
SELECT
  p.id,
  p.empresa_id,
  '🎃 Sons de Halloween atualizados',
  'O Som ambiente (o fone no topo da tela) ganhou três temas de terror — '
  || 'Stranger Things, A Hora do Pesadelo e Eu Menti pra Você, de Pecadores — '
  || 'e duas músicas: Puxa o Lança e Na Relíquia do 2T. '
  || '«Talvez Você Precise de Mim» saiu da lista.',
  false
FROM public.perfis p
WHERE p.ativo;
