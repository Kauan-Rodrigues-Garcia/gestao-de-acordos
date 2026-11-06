/**
 * useMarca — a marca (nome e cor) da pessoa logada, pela cidade do setor dela.
 * Ver `lib/marca.ts`. Sem setor ou setor sem cidade: `null`, e quem chama cai
 * no nome da empresa. Só vale na cobrança (kauan, 02/10/2026): no Comercial e
 * no RH é sempre `null`.
 */
import { useEffect, useState } from 'react';
import { lerCidadeDoSetor } from '@/lib/cidadeDoSetor';
import { marcaDaCidade, type Marca } from '@/lib/marca';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa } from '@/lib/produto';

const cache = new Map<string, Marca | null>();

/**
 * Uma leitura por setor por sessão, e a busca em curso é compartilhada: a
 * página monta vários componentes com `useMarca` ao mesmo tempo, e cada um
 * buscava sozinho antes de o primeiro guardar — 7 mil leituras de `setores`
 * e 6,8 mil de `rh_celulas` em 26 h (09/10/2026). A leitura da cidade é a
 * mesma da previsão do tempo do Calendário (`lib/cidadeDoSetor.ts`).
 */
function lerMarcaDoSetor(setorId: string): Promise<Marca | null> {
  if (cache.has(setorId)) return Promise.resolve(cache.get(setorId) ?? null);
  return lerCidadeDoSetor(setorId).then(nome => {
    const marca = marcaDaCidade(nome);
    cache.set(setorId, marca);
    return marca;
  });
}

export function useMarca(): Marca | null {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const ehCobranca = produtoDaEmpresa(empresa, tenantSlug) === 'cobranca';
  const setorId = ehCobranca ? perfil?.setor_id ?? null : null;
  const [marca, setMarca] = useState<Marca | null>(() => (setorId ? cache.get(setorId) ?? null : null));

  useEffect(() => {
    let vivo = true;
    if (!setorId) { setMarca(null); return; }
    void lerMarcaDoSetor(setorId).then(m => { if (vivo) setMarca(m); });
    return () => { vivo = false; };
  }, [setorId]);

  return marca;
}
