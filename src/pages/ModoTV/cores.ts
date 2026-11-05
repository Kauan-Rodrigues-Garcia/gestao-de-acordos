/**
 * cores.ts — as cores de cada tema da TV.
 *
 * Fora de `TelaTv.tsx` (30/10/2026) para o arquivo dos componentes exportar
 * só componentes — o fast refresh do Vite não recarrega um módulo misto. A
 * montagem (`Editor`) e a TV (`TvPalco`) leem daqui.
 */
import type { TemaId } from './tipos';

// ── Temas ────────────────────────────────────────────────────────────────────

export interface Cores { fundo: string; fundo2: string; texto: string; suave: string; linha: string; destaque: string; ok: string; alerta: string; trilho: string }

export const CORES: Record<TemaId, Cores> = {
  noite:    { fundo: '#0b1220', fundo2: '#14203a', texto: '#f4f6fb', suave: '#8b97b3', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.10)', destaque: '#5eead4', ok: '#4ade80', alerta: '#fbbf24' },
  grafite:  { fundo: '#111111', fundo2: '#1f1f1f', texto: '#f5f5f5', suave: '#9a9a9a', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.10)', destaque: '#f5c542', ok: '#4ade80', alerta: '#fb923c' },
  oceano:   { fundo: '#04253a', fundo2: '#0a3d5c', texto: '#eaf6ff', suave: '#8fb5cc', linha: 'rgba(255,255,255,.09)', trilho: 'rgba(255,255,255,.12)', destaque: '#38bdf8', ok: '#4ade80', alerta: '#fbbf24' },
  floresta: { fundo: '#0a1f15', fundo2: '#123526', texto: '#effaf3', suave: '#8fb8a0', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.11)', destaque: '#86efac', ok: '#bef264', alerta: '#fbbf24' },
  vinho:    { fundo: '#250a14', fundo2: '#40122a', texto: '#fff1f4', suave: '#c9a0ac', linha: 'rgba(255,255,255,.08)', trilho: 'rgba(255,255,255,.11)', destaque: '#fb7185', ok: '#4ade80', alerta: '#fbbf24' },
  claro:    { fundo: '#eef1f7', fundo2: '#ffffff', texto: '#0f172a', suave: '#64748b', linha: 'rgba(15,23,42,.08)', trilho: 'rgba(15,23,42,.08)', destaque: '#2563eb', ok: '#16a34a', alerta: '#d97706' },
};
