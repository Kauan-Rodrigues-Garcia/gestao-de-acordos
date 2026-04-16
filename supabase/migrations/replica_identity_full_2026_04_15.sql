
-- ══════════════════════════════════════════════════════════════════════════════
-- REPLICA IDENTITY FULL — necessário para Supabase Realtime com filtros
--
-- Sem FULL: no evento DELETE, payload.old fica vazio (sem campos = filtro falha)
-- Com FULL: payload.old/new contém todos os campos → filtros funcionam
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.acordos        REPLICA IDENTITY FULL;
ALTER TABLE public.notificacoes   REPLICA IDENTITY FULL;
ALTER TABLE public.nr_registros   REPLICA IDENTITY FULL;
ALTER TABLE public.lixeira_acordos REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação do Supabase (supabase_realtime) se ainda não estiverem
-- Isso garante que o Realtime receba eventos de todas as operações
DO $$
BEGIN
  -- acordos
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'acordos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.acordos;
  END IF;

  -- notificacoes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;

  -- nr_registros
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'nr_registros'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nr_registros;
  END IF;

  -- lixeira_acordos
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lixeira_acordos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lixeira_acordos;
  END IF;
END $$;

-- Confirmar
SELECT tablename, relreplident
FROM pg_publication_tables pt
JOIN pg_class c ON c.relname = pt.tablename AND c.relnamespace = 'public'::regnamespace
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('acordos', 'notificacoes', 'nr_registros', 'lixeira_acordos')
ORDER BY tablename;
