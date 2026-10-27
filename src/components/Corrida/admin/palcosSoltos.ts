/**
 * palcosSoltos.ts — o «Assistir» e o «Testar só na minha tela» do card da
 * Corrida, soltos da página de Configurações (23/10/2026). Quem monta é o Layout
 * (`PalcoDoOrganizador.tsx`), que fica de pé de uma aba para outra: o super_admin
 * troca de aba no menu e a corrida, o teste e o Cavalo da Guerra continuam.
 * Antes, sair de Configurações desmontava tudo e a luta acabava ali.
 */
import { useSyncExternalStore } from 'react';
import type { TemaLobby } from '../lobbies/cena';

export interface Assistindo { corridaId: number; cavalos: boolean }
export interface Testando { cavalos: boolean; premio: string; tema: TemaLobby; especial?: boolean }
export interface PalcosDoOrganizador { assistindo: Assistindo | null; testando: Testando | null }

let atual: PalcosDoOrganizador = { assistindo: null, testando: null };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<PalcosDoOrganizador>): void { atual = { ...atual, ...p }; for (const o of ouvintes) o(); }

export const assistirComoOrganizador = (corridaId: number, cavalos: boolean): void => mudar({ assistindo: { corridaId, cavalos } });
export const pararDeAssistir = (): void => mudar({ assistindo: null });
export const testarComoOrganizador = (t: Testando): void => mudar({ testando: t });
export const pararDeTestar = (): void => mudar({ testando: null });

export function usePalcosDoOrganizador(): PalcosDoOrganizador {
  return useSyncExternalStore(fn => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; }, () => atual);
}
