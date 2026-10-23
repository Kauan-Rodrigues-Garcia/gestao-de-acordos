/**
 * ensaioDoChefe.ts — o «Testar o Cavalo da Guerra só na minha tela» (23/10/2026),
 * como o teste da chefona da Bruxa: o chefe aparece direto na página, sem a
 * corrida, com a vida no ensaio (`ensaio.ts`, a mesma conta do banco). Nada vai
 * para o banco e ninguém mais vê. Os botões (anjo, tirar vida, finalizar,
 * fugir, robôs, cada ataque) ficam no card da Corrida (`TesteDoChefe.tsx`); o
 * chefe mora no Layout (`ChefeDeTeste.tsx`), então dá para ir de tela em tela.
 */
import { useSyncExternalStore } from 'react';
import { EnsaioGuerra } from './ensaio';
import type { LoteDeGolpes } from './regras';
import type { EstadoGuerra } from './tipos';
import type { AtaqueDoChefe, PalcoGuerra } from './palcoGuerra.js';

export interface TesteSolto { estado: EstadoGuerra; numero: number; robos: boolean }

/** Quantos robôs atiram quando «Robôs atirando» está ligado. */
export const ROBOS = 8;

let ensaio: EnsaioGuerra | null = null;
let atual: TesteSolto | null = null;
let palco: PalcoGuerra | null = null;
let relogio = 0;
const ouvintes = new Set<() => void>();
const avisar = () => { for (const o of ouvintes) o(); };
function mudar(e: EstadoGuerra) { if (atual) { atual = { ...atual, estado: e }; avisar(); } }

/** Solta o chefe daqui a `esperaS` (o título primeiro), com a vida de `pessoas` atacando. */
export function soltarChefeDeTeste(pessoas: number, esperaS = 3): void {
  limparChefeDeTeste();
  ensaio = new EnsaioGuerra(10, pessoas);
  atual = { estado: ensaio.chefeAgora(pessoas, esperaS), numero: 1 + Math.floor(Math.random() * 50), robos: false };
  relogio = window.setInterval(() => { if (ensaio) mudar(ensaio.recalcular()); }, 500);
  avisar();
}
export function limparChefeDeTeste(): void {
  window.clearInterval(relogio); ensaio = null; palco = null;
  if (atual) { atual = null; avisar(); }
}
export const curarChefeDeTeste = () => { if (ensaio) mudar(ensaio.curarAgora()); };
export const arrancarDoChefeDeTeste = (fracao: number) => { if (ensaio) mudar(ensaio.arrancar(fracao)); };
export const finalizarChefeDeTeste = () => { if (ensaio) mudar(ensaio.finalizar()); };
export const fugirChefeDeTeste = () => { if (ensaio) mudar(ensaio.fugir()); };
export const forcarAtaqueDeTeste = (tipo: AtaqueDoChefe) => { palco?.forcar(tipo); };
export function robosNoTeste(ligar: boolean): void {
  if (!atual) return;
  atual = { ...atual, robos: ligar }; palco?.simular(ligar ? ROBOS : 0); avisar();
}
/** Os tiros (os meus e os dos robôs) entram no ensaio. */
export function golpearNoTeste(quem: string, l: LoteDeGolpes): void { if (ensaio) mudar(ensaio.golpear(quem, l)); }
/** O `ChefeDeTeste` avisa quando o palco monta (e desmonta). */
export function registrarPalcoDeTeste(p: PalcoGuerra | null): void { palco = p; if (p && atual?.robos) p.simular(ROBOS); }

export function useChefeDeTeste(): TesteSolto | null {
  return useSyncExternalStore(fn => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; }, () => atual);
}
