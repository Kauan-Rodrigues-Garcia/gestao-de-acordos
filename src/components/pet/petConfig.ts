/**
 * petConfig — configuração central do joguinho do pet.
 *
 * Fase atual (esboço): sem sistema financeiro, sem itens no banco.
 * Estado local (roupa equipada) persiste em localStorage por usuário/empresa.
 * Liberado apenas para administrador/super_admin enquanto está em teste.
 */
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/lib/tenant-config';

export type PetHumor = 'idle' | 'feliz' | 'dormindo';
export type PetRoupa = 'nenhuma' | 'chapeu' | 'cachecol';

export interface RoupaCatalogo {
  id: PetRoupa;
  nome: string;
  emoji: string;
}

/** Catálogo de roupas do esboço — igual para os dois tenants. */
export const ROUPAS_CATALOGO: RoupaCatalogo[] = [
  { id: 'chapeu',   nome: 'Chapéu de festa', emoji: '🥳' },
  { id: 'cachecol', nome: 'Cachecol',        emoji: '🧣' },
];

/** Comidas placeholder (loja entra junto com o sistema de moedas). */
export const COMIDAS_CATALOGO = [
  { id: 'maca',    nome: 'Maçã',    emoji: '🍎' },
  { id: 'racao',   nome: 'Ração',   emoji: '🥣' },
  { id: 'bolinho', nome: 'Bolinho', emoji: '🧁' },
];

/** Pet do tenant: PaguePlay = Aura (coelhinho espiritual), BookPlay = Rolo (tanuki). */
export function usePetDoTenant(): { nome: string; tipo: 'aura' | 'rolo' } {
  const tenant = useTenant();
  return tenant.isPaguePlay
    ? { nome: 'Aura', tipo: 'aura' }
    : { nome: 'Rolo', tipo: 'rolo' };
}

/** Fase de teste: só admin e super_admin veem o pet. */
export function usePetHabilitado(): boolean {
  const { perfil } = useAuth();
  const p = String(perfil?.perfil ?? '').toLowerCase();
  return p === 'administrador' || p === 'super_admin';
}

export function petStorageKey(empresaId?: string, perfilId?: string): string {
  return `pet-estado::${empresaId ?? 'noemp'}::${perfilId ?? 'nouser'}`;
}
