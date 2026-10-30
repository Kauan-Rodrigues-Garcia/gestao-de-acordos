/**
 * Os temas do Bingo. Cada um é um arquivo, carregado só quando uma partida
 * o usa. Tema desconhecido (ou que falhe ao baixar) cai no padrão.
 */
import { useEffect, useState } from 'react';
import type { TemaBingoId } from '../tipos';
import type { TemaBingo } from './contrato';

export const TEMA_PADRAO: TemaBingoId = 'chiclete';

const CARREGAR: Partial<Record<TemaBingoId, () => Promise<{ default: TemaBingo }>>> = {
  chiclete: () => import('./chiclete'),
  bloco: () => import('./bloco'),
  fliperama: () => import('./fliperama'),
  rpg: () => import('./rpg'),
  galaxia: () => import('./galaxia'),
  aquario: () => import('./aquario'),
  gacha: () => import('./gacha'),
  bichinho: () => import('./bichinho'),
};

export const TEMAS_BINGO: { id: TemaBingoId; nome: string; descricao: string; pronto: boolean }[] = [
  { id: 'chiclete',  nome: 'Máquina de chiclete', descricao: 'Bolas de chiclete com carinha, chuva de doces.', pronto: true },
  { id: 'bloco',     nome: 'Bloco surpresa',      descricao: 'Plataforma 16-bit: cabeçada no bloco solta a moeda.', pronto: true },
  { id: 'fliperama', nome: 'Fliperama fofo',      descricao: 'Gabinete de arcade neon, fonte pixel, «STAGE CLEAR!».', pronto: true },
  { id: 'rpg',       nome: 'Aventura RPG',        descricao: 'Baú do tesouro, moedas de ouro, pergaminho de missão.', pronto: true },
  { id: 'galaxia',   nome: 'Galáxia fofa',        descricao: 'Foguete na lua, planetas com anel, «Decolagem!».', pronto: true },
  { id: 'aquario',   nome: 'Aquário',             descricao: 'Peixinho nadando, número na bolha, cardume na festa.', pronto: true },
  { id: 'gacha',     nome: 'Máquina de cápsulas', descricao: 'Manivela, cápsula aberta ao meio, «Prêmio raro!».', pronto: true },
  { id: 'bichinho',  nome: 'Bichinho virtual',    descricao: 'Ovo que racha, pintinho que evolui na quina.', pronto: true },
];

const carregados = new Map<TemaBingoId, TemaBingo>();

function baixarFonte(t: TemaBingo): void {
  if (!t.fonteUrl || typeof document === 'undefined') return;
  const id = `bingo-fonte-${t.id}`;
  if (document.getElementById(id)) return;
  try {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${t.fonteUrl}&display=swap`;
    document.head.appendChild(link);
  } catch { /* fica na letra reserva */ }
}

export async function carregarTema(id: TemaBingoId): Promise<TemaBingo> {
  const pronto = carregados.get(id);
  if (pronto) return pronto;
  const carregar = CARREGAR[id] ?? CARREGAR[TEMA_PADRAO]!;
  try {
    const t = (await carregar()).default;
    baixarFonte(t);
    carregados.set(id, t);
    return t;
  } catch {
    // Falhou ao baixar o tema: o padrão, nunca tela branca.
    const t = (await CARREGAR[TEMA_PADRAO]!()).default;
    baixarFonte(t);
    return t;
  }
}

/** O tema pronto para desenhar, ou `null` enquanto baixa. */
export function useTemaBingo(id: TemaBingoId | null | undefined): TemaBingo | null {
  const [tema, setTema] = useState<TemaBingo | null>(() => (id ? carregados.get(id) ?? null : null));
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    void carregarTema(id).then(t => { if (vivo) setTema(t); });
    return () => { vivo = false; };
  }, [id]);
  return tema;
}
