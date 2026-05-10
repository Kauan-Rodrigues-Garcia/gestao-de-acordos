-- Fix metas RLS: allow elite and gerencia roles to upsert/update metas
-- Previously only administrador, lider, super_admin could write.
-- Elite and gerencia have ver_metas=true and access to MetasConfig route.

DROP POLICY IF EXISTS "metas_upsert" ON public.metas;
DROP POLICY IF EXISTS "metas_update" ON public.metas;

CREATE POLICY "metas_upsert" ON public.metas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND perfil IN ('administrador','lider','super_admin','elite','gerencia')
  )
);

CREATE POLICY "metas_update" ON public.metas FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND perfil IN ('administrador','lider','super_admin','elite','gerencia')
  )
);
