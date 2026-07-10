/**
 * petConfig — configuração central do joguinho do pet.
 *
 * Economia (Fase 1): estado por usuário no banco (pet_estado) — moedas ganhas
 * a partir do recebimento diário, roupa equipada, gasto etc. (ver usePetEstado
 * e 20260709a_pet_economia.sql). O localStorage (petStorageKey) fica só como
 * cache/fallback quando a migration ainda não foi aplicada.
 * Liberado apenas para administrador/super_admin enquanto está em teste.
 */
import { useAuth } from '@/hooks/useAuth';

export type PetHumor = 'idle' | 'feliz' | 'dormindo' | 'jogando' | 'comemorando';
/** Cenas extras desenhadas junto do pet (eventos aleatórios / comemoração). */
export type PetCena = 'nenhuma' | 'confete' | 'borboleta' | 'moeda' | 'aceno';
/** Micro-animações ocasionais do corpo. */
export type PetMicro = 'none' | 'pulinho' | 'espreguica';
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

/** Pet oficial das duas empresas (coelhinha espiritual lilás).
 *  Nome removido enquanto a votação Aura/Lupi/Albi acontece — usa um rótulo
 *  neutro ("mascote"). (PetRolo fica no repositório como possível skin.) */
export function usePetDoTenant(): { nome: string; tipo: 'aura' | 'rolo' } {
  return { nome: 'mascote', tipo: 'aura' };
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
