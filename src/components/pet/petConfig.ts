/**
 * petConfig — configuração central do joguinho do pet.
 *
 * Economia (Fase 1): estado por usuário no banco (pet_estado) — moedas ganhas
 * a partir do recebimento diário, roupa equipada, gasto etc. (ver usePetEstado
 * e 20260709a_pet_economia.sql). O localStorage (petStorageKey) fica só como
 * cache/fallback quando a migration ainda não foi aplicada.
 * Liberado apenas para administrador/super_admin enquanto está em teste.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

export type PetHumor =
  | 'idle' | 'feliz' | 'dormindo' | 'jogando' | 'comemorando'
  // eventos aleatórios que mudam a pose do corpo
  | 'pescando' | 'dancando' | 'assando';
/** Cenas extras desenhadas junto do pet (eventos aleatórios / comemoração). */
export type PetCena = 'nenhuma' | 'confete' | 'borboleta' | 'moeda' | 'aceno' | 'carrinho';
/** Micro-animações ocasionais do corpo. */
export type PetMicro = 'none' | 'pulinho' | 'espreguica';
export type PetRoupa =
  | 'nenhuma' | 'chapeu' | 'cachecol'
  // Itens da loja mensal (ids permanentes — nunca reutilizar entre meses)
  | 'coroa' | 'oculos_sol' | 'laco' | 'bone' | 'gravata'
  | 'flor' | 'capa' | 'oculos_nerd' | 'colar' | 'tiara';

export interface RoupaCatalogo {
  id: PetRoupa;
  nome: string;
  emoji: string;
}

/** Roupas grátis de sempre (todo mundo tem no guarda-roupa). */
export const ROUPAS_CATALOGO: RoupaCatalogo[] = [
  { id: 'chapeu',   nome: 'Chapéu de festa', emoji: '🥳' },
  { id: 'cachecol', nome: 'Cachecol',        emoji: '🧣' },
];

// ── Loja mensal ────────────────────────────────────────────────────────────────
// Vitrine rotativa: cada item fica disponível para COMPRA só no seu `mes`
// ('yyyy-MM'); depois sai da loja, mas quem comprou fica com ele para sempre
// (itens_desbloqueados no pet_estado). Para o próximo mês, basta acrescentar
// novos itens aqui — ids antigos continuam válidos no guarda-roupa.

export interface ItemLojaMensal extends RoupaCatalogo {
  preco: number;   // em moedas
  mes: string;     // 'yyyy-MM' em que aparece na vitrine
}

export const LOJA_MENSAL: ItemLojaMensal[] = [
  // ── Julho/2026 ──
  { id: 'coroa',       nome: 'Coroa dourada',      emoji: '👑', preco: 250, mes: '2026-07' },
  { id: 'capa',        nome: 'Capa de heroína',    emoji: '🦸', preco: 220, mes: '2026-07' },
  { id: 'oculos_sol',  nome: 'Óculos de sol',      emoji: '🕶️', preco: 150, mes: '2026-07' },
  { id: 'tiara',       nome: 'Tiara de estrela',   emoji: '⭐', preco: 140, mes: '2026-07' },
  { id: 'colar',       nome: 'Colar de pérolas',   emoji: '📿', preco: 130, mes: '2026-07' },
  { id: 'bone',        nome: 'Boné vermelho',      emoji: '🧢', preco: 110, mes: '2026-07' },
  { id: 'oculos_nerd', nome: 'Óculos redondos',    emoji: '🤓', preco: 100, mes: '2026-07' },
  { id: 'laco',        nome: 'Laço de fita',       emoji: '🎀', preco: 90,  mes: '2026-07' },
  { id: 'gravata',     nome: 'Gravata borboleta',  emoji: '🤵', preco: 80,  mes: '2026-07' },
  { id: 'flor',        nome: 'Flor na orelha',     emoji: '🌸', preco: 60,  mes: '2026-07' },
];

/** Itens da vitrine de um mês ('yyyy-MM'). */
export function itensLojaDoMes(mes: string): ItemLojaMensal[] {
  return LOJA_MENSAL.filter(i => i.mes === mes);
}

/** Info de exibição de qualquer roupa (grátis ou de loja), para o guarda-roupa. */
export function roupaInfo(id: string): RoupaCatalogo | null {
  return ROUPAS_CATALOGO.find(r => r.id === id)
    ?? LOJA_MENSAL.find(i => i.id === id)
    ?? null;
}

/** Todas as roupas que existem (validação de roupa equipada). */
export const ROUPAS_VALIDAS: PetRoupa[] = [
  'nenhuma',
  ...ROUPAS_CATALOGO.map(r => r.id),
  ...LOJA_MENSAL.map(i => i.id),
];

/** Comidas — sempre disponíveis, baratinhas; alimentar de verdade custa moedas. */
export const COMIDAS_CATALOGO = [
  { id: 'maca',    nome: 'Maçã',    emoji: '🍎', preco: 3 },
  { id: 'racao',   nome: 'Ração',   emoji: '🥣', preco: 5 },
  { id: 'bolinho', nome: 'Bolinho', emoji: '🧁', preco: 8 },
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

/** Preferência "pet desativado": para o passeio/animações e deixa só um
 *  iconezinho fixo no canto (clicável para reabrir o quartinho). Preferência
 *  de interface por usuário+dispositivo — localStorage, não é estado do jogo. */
export function usePetMinimizado(): [boolean, (v: boolean) => void] {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const key = `${petStorageKey(empresa?.id, perfil?.id)}::minimizado`;

  const [mini, setMini] = useState(false);
  useEffect(() => {
    try { setMini(localStorage.getItem(key) === '1'); } catch { /* noop */ }
  }, [key]);

  const salvar = (v: boolean) => {
    setMini(v);
    try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* noop */ }
  };
  return [mini, salvar];
}
