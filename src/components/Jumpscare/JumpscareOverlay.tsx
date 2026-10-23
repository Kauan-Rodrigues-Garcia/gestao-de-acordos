/**
 * JumpscareOverlay — a imagem que aparece em tela cheia e some (≈0,3 s).
 *
 * Montado no `Layout`, fora das rotas, como a comemoração. Marca o timer pelo
 * relógio do banco, baixa a imagem antes da hora e, na hora, mostra.
 *
 * As travas para a imagem nunca ficar presa estão no cabeçalho de
 * `jumpscare.ts`. Aqui são quatro caminhos de saída, cada um sozinho basta:
 * o timer da duração, a animação CSS que termina invisível, o vigia com o
 * teto de `DURACAO_MAX_MS`, e esconder a aba. A camada não pega clique.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  BAIXAR_ANTES_MS, DURACAO_MAX_MS, agoraDoServidor, baixarImagem, duracaoSegura,
  momentoDoDisparo, ouvirTeste, useJumpscare,
} from './jumpscare';

/** O maior atraso que o `setTimeout` aceita (~24,8 dias). */
const TIMER_MAX_MS = 2_147_483_000;

interface NaTela { url: string; duracaoMs: number; chave: number }

export function JumpscareOverlay() {
  const { empresa } = useEmpresa();
  const agendamento = useJumpscare(empresa?.id);
  const [naTela, setNaTela] = useState<NaTela | null>(null);

  /** Os horários que já dispararam nesta aba: cada um vale uma vez. */
  const disparados = useRef(new Set<string>());
  /** A imagem baixada para o agendamento da vez. */
  const pronta = useRef<{ path: string; url: string } | null>(null);

  function mostrar(url: string, duracaoMs: number) {
    if (document.visibilityState === 'hidden') return;
    setNaTela({ url, duracaoMs: duracaoSegura(duracaoMs), chave: Date.now() });
  }

  // ── O agendamento: baixar antes, disparar na hora ──
  const path = agendamento?.imagemPath ?? null;
  const disparaEm = agendamento?.disparaEm ?? null;
  const duracaoMs = agendamento?.duracaoMs ?? 0;
  useEffect(() => {
    if (!path || !disparaEm || disparados.current.has(disparaEm)) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let vivo = true;

    const baixar = () => {
      if (pronta.current?.path === path) return;
      void baixarImagem(path).then(url => {
        if (!url) return;
        if (!vivo) { URL.revokeObjectURL(url); return; }
        if (pronta.current) URL.revokeObjectURL(pronta.current.url);
        pronta.current = { path, url };
      });
    };

    const armar = () => {
      const m = momentoDoDisparo(disparaEm, agoraDoServidor());
      if (m.fase === 'perdido') return;
      if (m.fase === 'disparar') {
        disparados.current.add(disparaEm);
        // Imagem que não chegou a tempo não aparece: nem quebrada, nem atrasada.
        if (pronta.current?.path === path) mostrar(pronta.current.url, duracaoMs);
        return;
      }
      if (m.emMs > TIMER_MAX_MS) {
        // Longe demais para um timer só: confere de novo amanhã.
        timers.push(setTimeout(armar, 24 * 3_600_000));
        return;
      }
      // Baixa uns minutos antes, com sorteio: as telas não pedem a imagem juntas.
      const baixarEm = m.emMs - BAIXAR_ANTES_MS - Math.random() * 60_000;
      if (baixarEm <= 0) baixar();
      else timers.push(setTimeout(baixar, baixarEm));
      timers.push(setTimeout(armar, m.emMs));
    };
    armar();

    return () => { vivo = false; timers.forEach(clearTimeout); };
  }, [path, disparaEm, duracaoMs]);

  // Libera a imagem guardada quando a tela some.
  useEffect(() => () => {
    if (pronta.current) URL.revokeObjectURL(pronta.current.url);
  }, []);

  // ── O teste: só nesta aba ──
  useEffect(() => ouvirTeste(p => mostrar(p.url, p.duracaoMs)), []);

  // ── As saídas: timer, vigia e aba escondida ──
  useEffect(() => {
    if (!naTela) return;
    const sumir = () => setNaTela(atual => (atual?.chave === naTela.chave ? null : atual));
    const timer = setTimeout(sumir, naTela.duracaoMs);
    const vigia = setTimeout(sumir, DURACAO_MAX_MS + 500);
    const aoEsconder = () => { if (document.visibilityState === 'hidden') sumir(); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('blur', sumir);
    return () => {
      clearTimeout(timer);
      clearTimeout(vigia);
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('blur', sumir);
    };
  }, [naTela]);

  if (!naTela) return null;
  return createPortal(
    <div
      key={naTela.chave}
      aria-hidden
      data-testid="jumpscare"
      onAnimationEnd={() => setNaTela(null)}
      className="pointer-events-none fixed inset-0 z-[2147483647] select-none bg-black"
      style={{ animation: `jumpscare-some ${naTela.duracaoMs}ms steps(1, end) forwards` }}
    >
      {/* Até o fim da animação fica tudo visível; no último instante, invisível. */}
      <style>{'@keyframes jumpscare-some{from{opacity:1;visibility:visible}to{opacity:0;visibility:hidden}}'}</style>
      <img src={naTela.url} alt="" draggable={false} className="h-full w-full object-cover" />
    </div>,
    document.body,
  );
}
