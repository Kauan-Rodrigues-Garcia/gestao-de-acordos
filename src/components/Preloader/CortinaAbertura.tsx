import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { Preloader } from './Preloader';

/**
 * A cortina de abertura do Gestão (16/11/2026): ao abrir ou recarregar o site,
 * a tela inteira é o `Preloader` — as linhas desenham a logo — e, quando o
 * sistema está pronto, ela esmaece e mostra a página.
 *
 * Fica até:
 *   - a sessão carregar (`ProtectedRoute`/`PublicRoute`) e a tela da rota ser
 *     baixada (`PageLoader`) — quem espera segura com `<SeguraCortina />`;
 *   - os dados da primeira tela pararem de chegar, até um teto;
 *   - e nunca menos que o mínimo: na primeira abertura da sessão do navegador,
 *     o bastante para as linhas fecharem a logo e ela se encher de cor; ao
 *     recarregar, menos.
 *
 * Só na abertura: trocar de tela depois disso continua com o esqueleto do
 * `PageLoader`, sem cortina.
 */

/** Primeira abertura da sessão: as linhas fecham e a logo enche (64% de 3 s) e assenta. */
export const MINIMO_PRIMEIRA_MS = 2200;
/** Recarregou a página na mesma sessão. */
export const MINIMO_RECARGA_MS = 1200;
/** Dados que não acabam de chegar não seguram a cortina para sempre. */
const TETO_DOS_DADOS_MS = 8000;
/** Tudo quieto por este tempo = carregou (um pedido termina e outro começa logo depois). */
const SOSSEGO_MS = 220;
/** A duração do esmaecer (`.gda-pre` no `preloader.css`). */
const SAIDA_MS = 420;

const CHAVE_SESSAO = 'gda:abriu';

// ── Quem está esperando ──────────────────────────────────────────────────────

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

/** Enquanto quem chama estiver na tela, a cortina da abertura fica. */
export function useSegurarCortina() {
  useEffect(() => {
    mudar(1);
    return () => mudar(-1);
  }, []);
}

/** Para as esperas que têm desenho próprio (sessão, página baixando): só segura. */
export function SeguraCortina(): null {
  useSegurarCortina();
  return null;
}

/** O mínimo na tela. Exportada para os testes. */
export function minimoDaAbertura(motivo: 'primeira' | 'recarga'): number {
  return motivo === 'primeira' ? MINIMO_PRIMEIRA_MS : MINIMO_RECARGA_MS;
}

function motivoDaAbertura(): 'primeira' | 'recarga' {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return 'recarga';
    sessionStorage.setItem(CHAVE_SESSAO, '1');
  } catch { /* modo privado: vale como primeira */ }
  return 'primeira';
}

type Fase = 'dentro' | 'saindo' | 'fora';

/**
 * `desligada`: outra cortina cuida da abertura (o tema de um dia especial).
 * Desligada, não desenha nada.
 */
export function CortinaAbertura({ desligada = false }: { desligada?: boolean }) {
  const pedidos = useSyncExternalStore(assinar, () => esperando);
  const buscando = useIsFetching();
  const [fase, setFase] = useState<Fase>(desligada ? 'fora' : 'dentro');
  const [estourou, setEstourou] = useState(false);
  const desde = useRef(performance.now());
  const minimo = useRef(desligada ? 0 : minimoDaAbertura(motivoDaAbertura()));

  useEffect(() => {
    const relogio = window.setTimeout(() => setEstourou(true), TETO_DOS_DADOS_MS);
    return () => window.clearTimeout(relogio);
  }, []);

  const ocupado = pedidos > 0 || (buscando > 0 && !estourou);

  // Sossegou: espera o mínimo e sai. Voltou a carregar antes disso: fica.
  useEffect(() => {
    if (fase !== 'dentro' || ocupado) return;
    const falta = Math.max(SOSSEGO_MS, desde.current + minimo.current - performance.now());
    const relogio = window.setTimeout(() => setFase('saindo'), falta);
    return () => window.clearTimeout(relogio);
  }, [fase, ocupado]);

  useEffect(() => {
    if (fase !== 'saindo') return;
    const relogio = window.setTimeout(() => setFase('fora'), SAIDA_MS);
    return () => window.clearTimeout(relogio);
  }, [fase]);

  if (fase === 'fora' || desligada) return null;
  return <Preloader saindo={fase === 'saindo'} />;
}
