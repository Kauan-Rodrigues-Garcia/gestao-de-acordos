-- ============================================================================
-- Tickets: tempo real e anexo de 10 MB
-- ============================================================================
--
-- A tela relia a lista a cada acao propria. Quem estava com o ticket aberto do
-- outro lado nao via a mensagem chegar — via depois, quando alguma outra coisa
-- forcasse a releitura. Chat que precisa de F5 nao e chat.
--
-- Publicar as tres tabelas em `supabase_realtime` e o que falta: a RLS continua
-- valendo no canal, entao cada pessoa so recebe evento de linha que ela ja
-- podia ler.
--
-- O limite do anexo desce de 15 MB para 10 MB, que e o numero combinado. O
-- cliente barra antes de subir e diz o motivo; este limite e a rede de baixo.
-- ============================================================================

DO $$
BEGIN
  -- `ADD TABLE` estoura se a tabela ja estiver publicada, e esta migration
  -- precisa poder rodar de novo sem quebrar o resto do arquivo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tickets_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets_mensagens;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tickets_eventos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets_eventos;
  END IF;
END;
$$;

UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'tickets';
