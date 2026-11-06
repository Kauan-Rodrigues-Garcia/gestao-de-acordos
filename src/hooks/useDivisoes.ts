/**
 * useDivisoes — as divisões dos setores da empresa ativa (ver
 * `services/setores/divisoes.ts`).
 *
 * Uma leitura por empresa, compartilhada por todas as telas (Dashboard, Metas,
 * Configurações) num cache de módulo. Quem grava chama `invalidar()`, e todas
 * as telas montadas releem.
 *
 * Sem React Query de propósito: o hook entra no `useEscopoAnalitico`, que é
 * montado por telas (e testes) que não têm o provedor. Falha de leitura vira
 * «nenhuma divisão» — a tela segue como era antes das divisões.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  buscarDivisoesDaEmpresa, SEM_DIVISOES, type DivisoesDaEmpresa,
} from '@/services/setores/divisoes.service';

interface Entrada { dados: DivisoesDaEmpresa; carregado: boolean }

const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<void>>();
const ouvintes = new Set<() => void>();

function avisar() { for (const f of ouvintes) f(); }

function ouvir(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

function carregar(empresaId: string): Promise<void> {
  const atual = emVoo.get(empresaId);
  if (atual) return atual;
  const p = (async () => {
    let dados: DivisoesDaEmpresa = SEM_DIVISOES;
    try {
      dados = await buscarDivisoesDaEmpresa(empresaId);
    } catch {
      dados = SEM_DIVISOES;
    }
    cache.set(empresaId, { dados, carregado: true });
    emVoo.delete(empresaId);
    avisar();
  })();
  emVoo.set(empresaId, p);
  return p;
}

/** Relê as divisões de todas as empresas já vistas. */
export function invalidarDivisoes(): void {
  for (const id of [...cache.keys()]) void carregar(id);
}

export function useDivisoes(): DivisoesDaEmpresa & { carregando: boolean; invalidar: () => void } {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const entrada = useSyncExternalStore(
    ouvir,
    () => (empresaId ? cache.get(empresaId) : undefined),
  );

  useEffect(() => {
    if (empresaId && !cache.has(empresaId)) void carregar(empresaId);
  }, [empresaId]);

  const invalidar = useCallback(() => { invalidarDivisoes(); }, []);

  return {
    ...(entrada?.dados ?? SEM_DIVISOES),
    carregando: !!empresaId && !entrada?.carregado,
    invalidar,
  };
}
