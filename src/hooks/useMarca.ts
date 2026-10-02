/**
 * useMarca — a marca (nome e cor) da pessoa logada, pela cidade do setor dela.
 * Ver `lib/marca.ts`. Sem setor ou setor sem cidade: `null`, e quem chama cai
 * no nome da empresa.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { marcaDaCidade, type Marca } from '@/lib/marca';
import { useAuth } from '@/hooks/useAuth';

const cache = new Map<string, Marca | null>();

async function lerMarcaDoSetor(setorId: string): Promise<Marca | null> {
  if (cache.has(setorId)) return cache.get(setorId) ?? null;
  const { data: setor } = await supabase
    .from('setores').select('cidade_id').eq('id', setorId).maybeSingle();
  const cidadeId = (setor as { cidade_id?: string | null } | null)?.cidade_id ?? null;
  let marca: Marca | null = null;
  if (cidadeId) {
    const { data: cidade } = await supabase
      .from('rh_celulas').select('nome').eq('id', cidadeId).maybeSingle();
    marca = marcaDaCidade((cidade as { nome?: string } | null)?.nome);
  }
  cache.set(setorId, marca);
  return marca;
}

export function useMarca(): Marca | null {
  const { perfil } = useAuth();
  const setorId = perfil?.setor_id ?? null;
  const [marca, setMarca] = useState<Marca | null>(() => (setorId ? cache.get(setorId) ?? null : null));

  useEffect(() => {
    let vivo = true;
    if (!setorId) { setMarca(null); return; }
    void lerMarcaDoSetor(setorId).then(m => { if (vivo) setMarca(m); });
    return () => { vivo = false; };
  }, [setorId]);

  return marca;
}
