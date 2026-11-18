-- Tema do GTA VI (18 e 19/11/2026): quem ativou e quem recusou.
--
-- A resposta da pessoa continua valendo pelo navegador (`Vi/tema.ts`); esta
-- tabela só existe para contar. Sem policy: ninguém lê pelo app, e a escrita é
-- pela função, sempre na linha de quem está logado.
--
-- Aplicada em produção em 18/11/2026 pelo SQL, sem registro em
-- `supabase_migrations.schema_migrations`.

CREATE TABLE public.vi_tema_escolhas (
  perfil_id     UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  escolha       TEXT NOT NULL CHECK (escolha IN ('sim', 'nao')),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vi_tema_escolhas ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.fn_vi_registrar_escolha(p_escolha TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.vi_tema_escolhas (perfil_id, escolha)
  SELECT auth.uid(), p_escolha
   WHERE auth.uid() IS NOT NULL
  ON CONFLICT (perfil_id) DO UPDATE
    SET escolha = EXCLUDED.escolha, atualizado_em = now()
    WHERE vi_tema_escolhas.escolha <> EXCLUDED.escolha;
$fn$;

REVOKE ALL ON FUNCTION public.fn_vi_registrar_escolha(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vi_registrar_escolha(TEXT) TO authenticated;
