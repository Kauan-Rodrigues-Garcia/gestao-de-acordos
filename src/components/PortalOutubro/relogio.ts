/**
 * relogio.ts — a hora do Portal de Outubro: a de verdade, ou a de teste.
 *
 * No localhost dá para viajar pela semana (pedido de 26/10/2026: «acelerar,
 * desacelerar, ver o mural completo»): o painel do relógio
 * (`PainelDoRelogio.tsx`) põe o portal numa hora qualquer, numa velocidade
 * qualquer, ou parado. Só o portal vê essa hora — o resto do app segue no
 * relógio de verdade.
 *
 * A hora de teste fica no navegador (`localStorage`), para sobreviver ao F5.
 * Fora do `npm run dev` ela não é lida: em produção o portal só conhece a hora
 * certa.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface Simulacao {
  /** Quando (no relógio de verdade) a simulação foi acertada pela última vez. */
  baseReal: number;
  /** Que horas eram no portal nesse instante. */
  baseEvento: number;
  /** Quantos segundos do portal passam a cada segundo de verdade. */
  velocidade: number;
  pausado: boolean;
}

/** A hora do portal com essa simulação, no instante `real`. Pura. */
export function horaSimulada(s: Simulacao, real: number): number {
  return s.pausado ? s.baseEvento : s.baseEvento + (real - s.baseReal) * s.velocidade;
}

/** A mesma simulação, rebaseada agora: mudar a velocidade não pode pular a hora. */
export function rebasear(s: Simulacao, real: number, mudar: Partial<Pick<Simulacao, 'velocidade' | 'pausado' | 'baseEvento'>>): Simulacao {
  const atual = horaSimulada(s, real);
  return {
    baseReal: real,
    baseEvento: mudar.baseEvento ?? atual,
    velocidade: mudar.velocidade ?? s.velocidade,
    pausado: mudar.pausado ?? s.pausado,
  };
}

const CHAVE = 'portal-outubro:simulacao';
const PODE_SIMULAR = import.meta.env.DEV;

function lerGuardada(): Simulacao | null {
  if (!PODE_SIMULAR) return null;
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Simulacao | null;
    if (!v || typeof v.baseEvento !== 'number' || typeof v.baseReal !== 'number') return null;
    return { baseReal: v.baseReal, baseEvento: v.baseEvento, velocidade: Number(v.velocidade) || 1, pausado: !!v.pausado };
  } catch {
    return null;
  }
}

let simulacao: Simulacao | null = lerGuardada();
const ouvintes = new Set<() => void>();

function avisar(): void { for (const o of ouvintes) o(); }

function guardar(s: Simulacao | null): void {
  simulacao = s;
  try {
    if (s) localStorage.setItem(CHAVE, JSON.stringify(s));
    else localStorage.removeItem(CHAVE);
  } catch { /* sem armazenamento: vale só nesta aba */ }
  avisar();
}

/** A hora do portal agora (ms). */
export function agoraDoPortal(): number {
  return simulacao ? horaSimulada(simulacao, Date.now()) : Date.now();
}

export function simulacaoAtual(): Simulacao | null {
  return simulacao;
}

/** Leva o portal para `quando`, na velocidade atual (ou 1×). */
export function irPara(quando: number): void {
  if (!PODE_SIMULAR) return;
  const s = simulacao ?? { baseReal: Date.now(), baseEvento: quando, velocidade: 1, pausado: false };
  guardar(rebasear(s, Date.now(), { baseEvento: quando }));
}

export function mudarVelocidade(velocidade: number): void {
  if (!PODE_SIMULAR) return;
  const s = simulacao ?? { baseReal: Date.now(), baseEvento: Date.now(), velocidade: 1, pausado: false };
  guardar(rebasear(s, Date.now(), { velocidade }));
}

export function pausar(pausado: boolean): void {
  if (!PODE_SIMULAR) return;
  const s = simulacao ?? { baseReal: Date.now(), baseEvento: Date.now(), velocidade: 1, pausado: false };
  guardar(rebasear(s, Date.now(), { pausado }));
}

/** Volta para a hora de verdade. */
export function voltarAoReal(): void {
  guardar(null);
}

function assinar(o: () => void): () => void {
  ouvintes.add(o);
  // A outra aba mexeu no relógio de teste: esta acompanha.
  const aoGuardar = (e: StorageEvent) => { if (e.key === CHAVE) { simulacao = lerGuardada(); avisar(); } };
  window.addEventListener('storage', aoGuardar);
  return () => { ouvintes.delete(o); window.removeEventListener('storage', aoGuardar); };
}

/** A simulação em vigor (para o painel redesenhar quando ela muda). */
export function useSimulacao(): Simulacao | null {
  return useSyncExternalStore(assinar, () => simulacao, (): Simulacao | null => null);
}

/**
 * A hora do portal, relida a cada `intervaloMs` (de verdade). Com a hora de
 * teste acelerada, o intervalo cai para 250 ms: senão a semana passaria aos
 * saltos.
 */
export function useAgoraDoPortal(intervaloMs: number): number {
  const s = useSimulacao();
  const passo = s && !s.pausado && s.velocidade > 1 ? Math.min(intervaloMs, 250) : intervaloMs;
  const [agora, setAgora] = useState(agoraDoPortal);
  useEffect(() => {
    setAgora(agoraDoPortal());
    const id = window.setInterval(() => setAgora(agoraDoPortal()), passo);
    return () => window.clearInterval(id);
  }, [passo, s]);
  return agora;
}
