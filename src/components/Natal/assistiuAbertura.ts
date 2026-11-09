/**
 * assistiuAbertura.ts — a pessoa já viu a abertura do Natal INTEIRA? (09/11/2026)
 *
 * O card da música avisa quem entrou no Natal sem ver o vídeo (pulou, ou o
 * vídeo não carregou) e deixa ver a abertura de novo quando quiser.
 *
 * Quem responde é o banco (`fn_natal_minha_abertura`, `assistiu_em`), uma vez
 * por pessoa por sessão. Este navegador guarda o «sim» assim que a pessoa vê
 * até o fim — pela abertura ou pela revisão —, e daí em diante não pergunta
 * mais. Banco sem resposta (função ausente, rede) = `null`: sem aviso.
 *
 * No «Entrar como» nada é gravado no nome da pessoa (como em `abertura.ts`).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { marcarAbertura, videoDaCidade, type VideoDaCidade } from './abertura';

const chave = (pessoa: string) => `natal:assistiu-abertura:${pessoa}`;
const EVENTO = 'natal-assistiu-abertura';

export interface AssistiuAbertura {
  /** `true` viu inteiro; `false` não viu; `null` ainda não se sabe (ou não dá para saber). */
  assistiu: boolean | null;
  /** O vídeo da cidade do setor dela. */
  video: VideoDaCidade;
}

interface Resposta { cidade?: string | null; assistiu_em?: string | null }

/** Uma leitura por pessoa por sessão. */
const lidas = new Map<string, AssistiuAbertura>();
const lendo = new Set<string>();

function avisar() { window.dispatchEvent(new Event(EVENTO)); }

function lerLocal(pessoa: string): boolean {
  try { return localStorage.getItem(chave(pessoa)) === '1'; } catch { return false; }
}

/** Guarda neste navegador que a pessoa viu inteiro (sem gravar no banco). */
export function guardarAssistiu(pessoa: string | null | undefined): void {
  if (!pessoa || getImpersonacaoAtiva()) return;
  try { localStorage.setItem(chave(pessoa), '1'); } catch { /* modo privado */ }
  const atual = lidas.get(pessoa);
  lidas.set(pessoa, { assistiu: true, video: atual?.video ?? 'birigui' });
  avisar();
}

/** Viu inteiro pela revisão: guarda aqui e grava no banco. */
export function marcarAssistiu(pessoa: string | null | undefined, video: VideoDaCidade): void {
  if (!pessoa || getImpersonacaoAtiva()) return;
  guardarAssistiu(pessoa);
  marcarAbertura('assistiu', video);
}

async function perguntar(pessoa: string) {
  if (lendo.has(pessoa)) return;
  lendo.add(pessoa);
  try {
    const { data, error } = await rpcSemTipo<Resposta>('fn_natal_minha_abertura', {});
    const video = videoDaCidade(data?.cidade ?? null);
    const assistiu = error || !data ? null : (lerLocal(pessoa) || !!data.assistiu_em);
    lidas.set(pessoa, { assistiu, video });
  } catch {
    lidas.set(pessoa, { assistiu: null, video: 'birigui' });
  } finally {
    lendo.delete(pessoa);
    avisar();
  }
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
}

const SEM_RESPOSTA: AssistiuAbertura = { assistiu: null, video: 'birigui' };

/** Se a pessoa já viu a abertura inteira, e qual é o vídeo dela. */
export function useAssistiuAbertura(pessoa: string | null | undefined): AssistiuAbertura {
  const estado = useSyncExternalStore(assinar, () => (pessoa ? lidas.get(pessoa) ?? null : null));
  useEffect(() => {
    // Mesmo com o «sim» guardado, o banco diz a cidade (o vídeo certo para rever).
    if (pessoa && !lidas.has(pessoa)) void perguntar(pessoa);
  }, [pessoa]);
  if (!pessoa) return SEM_RESPOSTA;
  if (estado) return estado;
  return lerLocal(pessoa) ? { assistiu: true, video: 'birigui' } : SEM_RESPOSTA;
}

/** Para os testes: esquece o que foi lido nesta sessão. */
export function esquecerLeiturasDaAbertura(): void {
  lidas.clear();
  lendo.clear();
}
