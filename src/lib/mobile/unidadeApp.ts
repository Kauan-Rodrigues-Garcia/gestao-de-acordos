/**
 * A unidade dos valores no app do celular — H.O. ou bruto — para a regra Cofen.
 *
 * Desenho de 06/10/2026 (docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md
 * §2.5): quem é de setor Cofen vê TUDO em H.O. — o que fica com a operação — e
 * troca para bruto num interruptor. Abre em H.O.; a escolha fica no aparelho.
 * Quem não é Cofen nunca vê o interruptor e vê sempre bruto.
 *
 * Um estado só para as três telas (`/m`, `/m/equipe`, `/m/setor`): trocar numa
 * vale nas outras.
 */
import { useSyncExternalStore } from 'react';

export type UnidadeApp = 'ho' | 'bruto';

const CHAVE = 'mobile:unidade';
const ouvintes = new Set<() => void>();

function ler(): UnidadeApp {
  try {
    return localStorage.getItem(CHAVE) === 'bruto' ? 'bruto' : 'ho';
  } catch {
    return 'ho';
  }
}

let atual: UnidadeApp = typeof window === 'undefined' ? 'ho' : ler();

export function definirUnidadeApp(u: UnidadeApp): void {
  atual = u;
  try {
    if (u === 'bruto') localStorage.setItem(CHAVE, 'bruto');
    else localStorage.removeItem(CHAVE);
  } catch { /* vale só nesta visita */ }
  for (const f of ouvintes) f();
}

function assinar(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/**
 * A unidade em vigor. `cofen` falso → sempre bruto (e o interruptor some).
 * `emHO` é o que as contas perguntam.
 */
export function useUnidadeApp(cofen: boolean): { unidade: UnidadeApp; emHO: boolean } {
  const escolhida = useSyncExternalStore(assinar, () => atual, () => 'ho' as UnidadeApp);
  const unidade: UnidadeApp = cofen ? escolhida : 'bruto';
  return { unidade, emHO: unidade === 'ho' };
}

/** Só para teste: volta ao estado de fábrica. */
export function _reiniciarUnidadeApp(): void {
  atual = ler();
}
