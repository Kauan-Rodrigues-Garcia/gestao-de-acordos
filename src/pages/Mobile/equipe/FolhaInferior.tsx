/**
 * A folha que sobe de baixo (bottom sheet) da tela da equipe.
 *
 * Correção de 30/09/2026 — «ao clicar num usuário, o card abre lá no final da
 * aba» e «no iPhone não funciona». A folha era `position: fixed` DENTRO do
 * conteúdo da aba, e o conteúdo entra com uma animação de `transform`: um
 * ancestral com `transform` vira o bloco de referência do `fixed`, e a folha
 * passava a se posicionar no fim da aba em vez de na tela (no Safari do iPhone
 * ela nem chegava a aparecer).
 *
 * Agora ela é desenhada num portal direto no `<body>` — nenhum ancestral
 * interfere —, fica presa na tela, sobe deslizando e fecha:
 *   • arrastando para baixo pelo topo (alça + cabeçalho);
 *   • tocando fora;
 *   • com Esc.
 * A rolagem da página por trás trava enquanto ela está aberta, do jeito que
 * funciona no iPhone (`overflow: hidden` no body sozinho não segura lá).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DURACAO_MS = 300;

function semMovimento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** Arrastou mais que isto (px), ou rápido para baixo: fecha. */
const LIMITE_FECHAR = 90;
const VELOCIDADE_FECHAR = 0.5; // px/ms

function travarRolagem(): () => void {
  const y = window.scrollY;
  const b = document.body.style;
  const antes = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow };
  Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
  return () => {
    Object.assign(b, antes);
    window.scrollTo(0, y);
  };
}

export function FolhaInferior({ aberta, onFechar, rotuloId, cabecalho, children }: {
  aberta: boolean;
  onFechar: () => void;
  /** id do título, para o leitor de tela anunciar a folha. */
  rotuloId?: string;
  /** O topo da folha — é por ele (e pela alça) que se arrasta para fechar. */
  cabecalho: React.ReactNode;
  children: React.ReactNode;
}) {
  // `montada` segura a folha no DOM durante a animação de saída.
  const [montada, setMontada] = useState(aberta);
  const [visivel, setVisivel] = useState(false);
  const [arrasto, setArrasto] = useState<number | null>(null);
  const toque = useRef<{ y: number; t: number } | null>(null);
  const folhaRef = useRef<HTMLElement>(null);
  // O efeito da trava não pode depender de `onFechar`: se o pai recria a função
  // a cada render, a trava soltaria e voltaria (e a página pularia).
  const fecharRef = useRef(onFechar);
  useEffect(() => { fecharRef.current = onFechar; }, [onFechar]);
  const fechar = useCallback(() => fecharRef.current(), []);

  useEffect(() => {
    if (aberta) {
      setMontada(true);
      // Entra no quadro seguinte ao da montagem — é o que faz a transição rodar.
      let q2 = 0;
      const q1 = requestAnimationFrame(() => { q2 = requestAnimationFrame(() => setVisivel(true)); });
      return () => { cancelAnimationFrame(q1); cancelAnimationFrame(q2); };
    }
    setVisivel(false);
    setArrasto(null);
    if (semMovimento()) { setMontada(false); return undefined; }
    const t = window.setTimeout(() => setMontada(false), DURACAO_MS);
    return () => window.clearTimeout(t);
  }, [aberta]);

  useEffect(() => {
    if (!montada) return undefined;
    const soltar = travarRolagem();
    const antes = document.activeElement as HTMLElement | null;
    folhaRef.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    return () => {
      soltar();
      document.removeEventListener('keydown', esc);
      antes?.focus?.({ preventScroll: true });
    };
  }, [montada, fechar]);

  const inicio = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    toque.current = { y: e.clientY, t: performance.now() };
    setArrasto(0);
  }, []);

  const mover = useCallback((e: React.PointerEvent) => {
    const t = toque.current;
    if (!t) return;
    // Para cima só resiste um pouco — a folha não descola do rodapé.
    const dy = e.clientY - t.y;
    setArrasto(dy >= 0 ? dy : dy / 6);
  }, []);

  const fim = useCallback((e: React.PointerEvent) => {
    const t = toque.current;
    toque.current = null;
    if (!t) return;
    const dy = e.clientY - t.y;
    const vel = dy / Math.max(1, performance.now() - t.t);
    setArrasto(null);
    if (e.type !== 'pointercancel' && (dy > LIMITE_FECHAR || (dy > 24 && vel > VELOCIDADE_FECHAR))) fechar();
  }, [fechar]);

  if (!montada || typeof document === 'undefined') return null;

  const deslocado = arrasto ?? 0;
  return createPortal(
    <div className="tela-equipe e-portal">
      <div
        className={visivel ? 'e-veu e-veu-on' : 'e-veu'}
        onClick={fechar}
        style={visivel && deslocado > 0 ? { opacity: Math.max(0.25, 1 - deslocado / 360) } : undefined}
      />
      <section
        ref={folhaRef}
        tabIndex={-1}
        className={`e-folha${visivel ? ' e-folha-on' : ''}${arrasto !== null ? ' e-folha-arrasto' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby={rotuloId}
        style={visivel && deslocado !== 0 ? { transform: `translate3d(0, ${deslocado}px, 0)` } : undefined}
      >
        <div className="e-folha-topo" onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerCancel={fim}>
          <button type="button" className="e-alca" aria-label="Fechar" onClick={fechar} />
          {cabecalho}
        </div>
        <div className="e-folha-corpo">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
