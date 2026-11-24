/* eslint-disable react-refresh/only-export-components -- exporta junto o que pertence ao componente (hook, constante, conta); isso só tira o Fast Refresh no `npm run dev`, não muda o app. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { viNoCarregamento } from './tema';
import { CarregandoVi } from './MarcaVi';
import './vi.css';

/**
 * A cortina de carregamento do GTA VI (Cleber, 16/11/2026): «quando for
 * recarregar a página, aparece primeiro o símbolo da Rockstar carregando, igual
 * no site da Rockstar — mesmo que carregue mais rápido».
 *
 * Antes o logo morava só no `PageLoader`: aparecia enquanto a página não vinha
 * e sumia no instante em que vinha — às vezes rápido demais para ver, às vezes
 * nem aparecia. Agora é uma tela inteira por cima de tudo, com tempo mínimo:
 *
 *   - ao abrir ou recarregar o site: fica até a página chegar E os dados dela
 *     pararem de carregar, e nunca menos que o mínimo — maior na primeira vez
 *     da sessão do navegador, menor nas seguintes;
 *   - ao trocar de tela, quando a tela nova ainda precisa ser baixada: volta
 *     por um instante (o `PageLoader` avisa por `useSegurarCortinaVi`).
 *
 * Sai esmaecendo. Só existe no dia e para quem ativou o tema neste navegador
 * (`viNoCarregamento`) — fora disso não desenha nada.
 */

/** Primeira abertura da sessão: o feixe passa inteiro uma vez e começa a segunda. */
export const MINIMO_PRIMEIRA_MS = 3000;
/** Recarregou a página na mesma sessão. */
export const MINIMO_RECARGA_MS = 1600;
/** Trocou de tela e a tela nova precisou ser baixada. */
export const MINIMO_TROCA_MS = 900;
/** Dados que não acabam de chegar não seguram a cortina para sempre. */
const TETO_DOS_DADOS_MS = 8000;
/** Tudo quieto por este tempo = carregou (um pedido termina e outro começa logo depois). */
const SOSSEGO_MS = 220;
/** A duração do esmaecer (`.vi-cortina` no `vi.css`). */
const SAIDA_MS = 380;

const CHAVE_SESSAO = 'vi:abriu';

/** O mínimo na tela, pelo motivo de a cortina ter entrado. Exportada para os testes. */
export function minimoDaCortina(motivo: 'primeira' | 'recarga' | 'troca'): number {
  return motivo === 'primeira' ? MINIMO_PRIMEIRA_MS : motivo === 'recarga' ? MINIMO_RECARGA_MS : MINIMO_TROCA_MS;
}

// ── Quem está esperando (o `PageLoader`) ─────────────────────────────────────

let esperando = 0;
const ouvintes = new Set<() => void>();
function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => { ouvintes.delete(aviso); };
}
function mudar(delta: number) {
  esperando += delta;
  for (const aviso of ouvintes) aviso();
}

/** Enquanto quem chama estiver na tela, a cortina fica. */
export function useSegurarCortinaVi() {
  useEffect(() => {
    mudar(1);
    return () => mudar(-1);
  }, []);
}

/** O que o `PageLoader` desenha no dia: nada — a cortina cobre a tela toda. */
export function EsperaVi() {
  useSegurarCortinaVi();
  return <div className="min-h-[60vh]" />;
}

/** Para as esperas que têm desenho próprio (a da sessão, no `ProtectedRoute`): só segura. */
export function SeguraCortinaVi(): null {
  useSegurarCortinaVi();
  return null;
}

function motivoDaAbertura(): 'primeira' | 'recarga' {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return 'recarga';
    sessionStorage.setItem(CHAVE_SESSAO, '1');
  } catch { /* modo privado: vale como primeira */ }
  return 'primeira';
}

type Fase = 'fora' | 'dentro' | 'saindo';

export function CortinaVi() {
  const pedidos = useSyncExternalStore(assinar, () => esperando);
  const buscando = useIsFetching();
  // Na abertura do site ela já nasce na tela, antes de qualquer página pedir.
  const [fase, setFase] = useState<Fase>(() => (viNoCarregamento() ? 'dentro' : 'fora'));
  const [estourou, setEstourou] = useState(false);
  const abertura = useRef(fase === 'dentro');
  const desde = useRef(performance.now());
  const minimo = useRef(fase === 'dentro' ? minimoDaCortina(motivoDaAbertura()) : 0);

  // Trocou de tela e a tela nova está sendo baixada: a cortina volta.
  useEffect(() => {
    if (pedidos === 0 || fase === 'dentro' || !viNoCarregamento()) return;
    abertura.current = false;
    desde.current = performance.now();
    minimo.current = minimoDaCortina('troca');
    setFase('dentro');
  }, [pedidos, fase]);

  // Na abertura, os dados da página também seguram — até o teto.
  useEffect(() => {
    if (!abertura.current) return;
    const relogio = window.setTimeout(() => setEstourou(true), TETO_DOS_DADOS_MS);
    return () => window.clearTimeout(relogio);
  }, []);

  const ocupado = pedidos > 0 || (abertura.current && buscando > 0 && !estourou);

  // Sossegou: espera o mínimo e sai. Voltou a carregar antes disso: fica.
  useEffect(() => {
    if (fase !== 'dentro' || ocupado) return;
    const falta = Math.max(SOSSEGO_MS, desde.current + minimo.current - performance.now());
    const relogio = window.setTimeout(() => setFase('saindo'), falta);
    return () => window.clearTimeout(relogio);
  }, [fase, ocupado]);

  useEffect(() => {
    if (fase !== 'saindo') return;
    const relogio = window.setTimeout(() => { abertura.current = false; setFase('fora'); }, SAIDA_MS);
    return () => window.clearTimeout(relogio);
  }, [fase]);

  if (fase === 'fora') return null;
  return (
    <div className={fase === 'saindo' ? 'vi-cortina vi-cortina-sai' : 'vi-cortina'}>
      <CarregandoVi />
    </div>
  );
}
