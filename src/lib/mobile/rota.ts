/**
 * «Estou numa tela do celular?» — para quem fica FORA do roteador.
 *
 * Os provedores globais (ex.: `RealtimeAcordosProvider`) ficam acima do
 * `HashRouter` e não alcançam `useLocation`. O app usa rota por hash, então a
 * resposta está em `location.hash` e muda no `hashchange`.
 */
import { useEffect, useState } from 'react';

/** `#/m`, `#/m/equipe`, `#/m?novos=1` — e só elas. */
export function ehRotaDoCelular(hash: string): boolean {
  return /^#\/m(?:[/?]|$)/.test(hash);
}

export function useNaRotaDoCelular(): boolean {
  const [naRota, setNaRota] = useState(() =>
    typeof window !== 'undefined' && ehRotaDoCelular(window.location.hash));
  useEffect(() => {
    const atualizar = () => setNaRota(ehRotaDoCelular(window.location.hash));
    window.addEventListener('hashchange', atualizar);
    return () => window.removeEventListener('hashchange', atualizar);
  }, []);
  return naRota;
}
