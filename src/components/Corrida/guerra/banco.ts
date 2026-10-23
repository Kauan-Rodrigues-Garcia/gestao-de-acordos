/**
 * banco.ts — a Guerra na Corrida do lado do app (23/10/2026): ler, ligar, os
 * cliques do ataque e os tiros no chefe. A regra mora na migration
 * 20261023150000; as contas, em `regras.ts`.
 *
 * Como chega a cada tela, sem ninguém ficar perguntando: o estado vem na
 * resposta de cada chamada e no sinal `guerra` da sala (`corrida-sala:<id>`,
 * o mesmo canal da corrida — nenhum canal novo), no máximo 1 a cada 2 s, fora
 * os momentos que importam. `versao` só sobe: aviso atrasado não desfaz nada.
 *
 * Sem a migration no banco, tudo desliga em silêncio: `lerGuerra` devolve
 * «desligada» e a corrida segue igual. O card do super_admin avisa o que falta.
 */
import { useSyncExternalStore } from 'react';
import { ajustarRelogio, mensagemDoErro, ouvirSinalGuerra, rpc } from '../banco';
import type { LoteDeGolpes } from './regras';
import type { EstadoGuerra } from './tipos';

export type { EstadoGuerra, RankingGuerra } from './tipos';

const estados = new Map<number, EstadoGuerra>();
const ouvintes = new Set<() => void>();
const avisar = () => { for (const o of ouvintes) o(); };

/** Guarda o estado mais novo (pela versão) e avisa quem estiver olhando. */
export function aceitarGuerra(e: EstadoGuerra | null | undefined): void {
  if (!e || typeof e.corrida_id !== 'number') return;
  const antes = estados.get(e.corrida_id);
  if (antes?.ligada && e.ligada && (antes.versao ?? 0) > (e.versao ?? 0)) return;
  if (e.agora) ajustarRelogio(e.agora);
  estados.set(e.corrida_id, e);
  avisar();
}
ouvirSinalGuerra((_, e) => aceitarGuerra(e as EstadoGuerra));

export const estadoDaGuerra = (id: number): EstadoGuerra | null => estados.get(id) ?? null;
export function useGuerra(id: number | null | undefined): EstadoGuerra | null {
  return useSyncExternalStore(
    fn => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    () => (id ? estados.get(id) ?? null : null),
  );
}

export const faltaMigrationGuerra = (e: unknown) => /fn_corrida_guerra|corrida_guerra|schema cache|does not exist/i.test(mensagemDoErro(e));
let semBanco = false;

export async function lerGuerra(id: number): Promise<EstadoGuerra> {
  if (semBanco) return { corrida_id: id, ligada: false };
  try {
    const e = await rpc<EstadoGuerra>('fn_corrida_guerra_estado', { p_corrida: id });
    aceitarGuerra(e); return e;
  } catch (e) {
    if (faltaMigrationGuerra(e)) { semBanco = true; console.warn('[guerra] a guerra ainda não está no banco (20261023150000): a corrida segue sem ela'); return { corrida_id: id, ligada: false }; }
    throw e;
  }
}
/** O super_admin liga ou desliga (antes da largada). */
export async function ligarGuerra(id: number, ligar: boolean): Promise<EstadoGuerra> {
  const e = await rpc<EstadoGuerra>('fn_corrida_guerra_ligar', { p_corrida: id, p_ligar: ligar });
  aceitarGuerra(e); return e;
}
/** Os cliques juntados pela página (ela manda no máximo 1 vez a cada `GUERRA.envioMs`). */
export async function atacarGuerra(id: number, cliques: number): Promise<EstadoGuerra | null> {
  if (semBanco) return null;
  const e = await rpc<EstadoGuerra>('fn_corrida_guerra_atacar', { p_corrida: id, p_cliques: cliques });
  aceitarGuerra(e); return e;
}
/** Os tiros de um lote. Devolve `false` se o banco frear (cedo demais): o lote volta para o próximo. */
export async function golpearGuerra(id: number, l: LoteDeGolpes): Promise<boolean> {
  if (semBanco) return true;
  const e = await rpc<EstadoGuerra>('fn_corrida_guerra_golpear', { p_corrida: id, p_dano: Math.round(l.dano * 10) / 10, p_acertos: l.acertos, p_bolas: l.bolas, p_banidos: l.banidos });
  aceitarGuerra(e);
  return !e.freio;
}
