/**
 * petConfig — configuração central do joguinho do pet.
 *
 * Fase atual (esboço): sem sistema financeiro, sem itens no banco.
 * Estado local (roupa equipada) persiste em localStorage por usuário/empresa.
 * Liberado apenas para administrador/super_admin enquanto está em teste.
 */
import { useAuth } from '@/hooks/useAuth';

export type PetHumor = 'idle' | 'feliz' | 'dormindo' | 'jogando';
export type PetRoupa =
  | 'nenhuma' | 'chapeu' | 'cachecol'
  | 'abobora' | 'marinheiro' | 'morango' | 'celestial' | 'sueter' | 'pijama';

export interface RoupaCatalogo {
  id: PetRoupa;
  nome: string;
  emoji: string;
}

/** Catálogo de roupas do esboço — igual para os dois tenants. */
export const ROUPAS_CATALOGO: RoupaCatalogo[] = [
  { id: 'abobora',    nome: 'Fantasia de Abóbora',  emoji: '🎃' },
  { id: 'marinheiro', nome: 'Marinheira',           emoji: '⚓' },
  { id: 'morango',    nome: 'Look Morango',         emoji: '🍓' },
  { id: 'celestial',  nome: 'Vestido Celestial',    emoji: '🌙' },
  { id: 'sueter',     nome: 'Suéter de Tricô',      emoji: '🧶' },
  { id: 'pijama',     nome: 'Pijaminha dos Sonhos', emoji: '💤' },
  { id: 'chapeu',     nome: 'Chapéu de Festa',      emoji: '🥳' },
  { id: 'cachecol',   nome: 'Cachecol',             emoji: '🧣' },
];

/** Comidas placeholder (loja entra junto com o sistema de moedas). */
export const COMIDAS_CATALOGO = [
  { id: 'maca',    nome: 'Maçã',    emoji: '🍎' },
  { id: 'racao',   nome: 'Ração',   emoji: '🥣' },
  { id: 'bolinho', nome: 'Bolinho', emoji: '🧁' },
];

/** Pet oficial das duas empresas: Aura (coelhinha espiritual lilás).
 *  (PetRolo fica no repositório como possível skin futura.) */
export function usePetDoTenant(): { nome: string; tipo: 'aura' | 'rolo' } {
  return { nome: 'Aura', tipo: 'aura' };
}

/** Pet visível para todos os cargos (usado também p/ subir o sino). */
export function usePetHabilitado(): boolean {
  return true;
}

/** Interações completas (alimentar, roupas, passeio): só admin/super_admin
 *  enquanto o sistema de moedas não entra — os demais veem o teaser. */
export function usePetInterativo(): boolean {
  const { perfil } = useAuth();
  const p = String(perfil?.perfil ?? '').toLowerCase();
  return p === 'administrador' || p === 'super_admin';
}

export function petStorageKey(empresaId?: string, perfilId?: string): string {
  return `pet-estado::${empresaId ?? 'noemp'}::${perfilId ?? 'nouser'}`;
}
