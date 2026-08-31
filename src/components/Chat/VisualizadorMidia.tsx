/**
 * VisualizadorMidia.tsx — foto e vídeo abrem AQUI, não numa aba nova.
 *
 * ## Por que não abrir a URL
 *
 * O balde é privado, então o endereço é uma URL assinada — um link enorme do
 * Supabase com token dentro, válido por uma hora. Abrir numa aba mostra esse
 * endereço na barra, e quem o copiar tem a foto acessível FORA do sistema até
 * ele vencer. Aqui não há endereço à vista.
 *
 * E tirar a pessoa da conversa para ver uma foto é atrito: ela sai, olha, e tem
 * que voltar de aba — no meio de uma conversa que pode estar recebendo mensagem
 * enquanto isso.
 *
 * ## PDF continua abrindo fora, de propósito
 *
 * O leitor de PDF do navegador tem busca, zoom e impressão. Reimplementar isso
 * seria trabalho para entregar menos.
 *
 * ## O zoom
 *
 * Roda do mouse amplia no ponto onde o cursor está, e não no centro: ampliar
 * pelo centro obriga a pessoa a arrastar de volta para o detalhe que ela queria
 * ver, toda vez. Duplo clique alterna 1× e 2,5×. Arrastar só move quando há o
 * que mover.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { urlDoAnexo, type AnexoChat } from '@/services/chat/chat.service';

const ESCALA_MIN = 1;
const ESCALA_MAX = 6;
/** Para onde o duplo clique leva, quando está em 1×. */
const ESCALA_DUPLO = 2.5;

interface Props {
  midias: AnexoChat[];
  /** Índice inicial. `null` mantém fechado. */
  inicial: number | null;
  onFechar: () => void;
}

export function VisualizadorMidia({ midias, inicial, onFechar }: Props) {
  const [indice, setIndice] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const arrastando = useRef(false);
  const partida = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const palco = useRef<HTMLDivElement>(null);

  const aberto = inicial !== null;
  const atual = midias[indice];
  const ehVideo = atual?.tipo?.startsWith('video/');
  const varios = midias.length > 1;

  const reiniciar = useCallback(() => { setEscala(1); setPos({ x: 0, y: 0 }); }, []);

  useEffect(() => {
    if (inicial === null) return;
    setIndice(inicial);
    reiniciar();
  }, [inicial, reiniciar]);

  // A assinatura é pedida por mídia. `urlDoAnexo` guarda em cache, então
  // andar para frente e para trás não repete a chamada.
  useEffect(() => {
    if (!aberto || !atual) { setUrl(null); return; }
    let vivo = true;
    setUrl(null);
    void urlDoAnexo(atual.url).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [aberto, atual]);

  const andar = useCallback((passo: number) => {
    if (!varios) return;
    setIndice(i => (i + passo + midias.length) % midias.length);
    reiniciar();
  }, [varios, midias.length, reiniciar]);

  // ── Teclado ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     { onFechar(); return; }
      if (e.key === 'ArrowRight') { andar(1);   return; }
      if (e.key === 'ArrowLeft')  { andar(-1);  return; }
      if (e.key === '+' || e.key === '=') setEscala(s => Math.min(ESCALA_MAX, s * 1.3));
      if (e.key === '-')                  setEscala(s => Math.max(ESCALA_MIN, s / 1.3));
      if (e.key === '0') reiniciar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, andar, onFechar, reiniciar]);

  // Fundo fixo não pode deixar a página rolar atrás.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [aberto]);

  // ── Zoom na roda, ancorado no cursor ───────────────────────────────────────
  const aoRodar = useCallback((e: React.WheelEvent) => {
    if (ehVideo) return;
    e.preventDefault();

    const caixa = palco.current?.getBoundingClientRect();
    if (!caixa) return;

    const nova = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN,
      escala * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (nova === escala) return;

    if (nova === 1) { reiniciar(); return; }

    /*
     * Mantém sob o cursor o mesmo ponto da imagem.
     *
     * Sem esta conta o zoom acontece pelo centro, e quem está olhando um
     * detalhe no canto precisa arrastar de volta a cada passo — que é
     * exatamente o momento em que a pessoa desiste de usar o zoom.
     */
    const cx = e.clientX - caixa.left - caixa.width / 2;
    const cy = e.clientY - caixa.top - caixa.height / 2;
    const k = nova / escala;
    setPos(p => ({ x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }));
    setEscala(nova);
  }, [escala, ehVideo, reiniciar]);

  // ── Arrastar ───────────────────────────────────────────────────────────────
  const aoPressionar = (e: React.MouseEvent) => {
    if (escala <= 1 || ehVideo) return;
    arrastando.current = true;
    partida.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };

  useEffect(() => {
    const mover = (e: MouseEvent) => {
      if (!arrastando.current) return;
      setPos({
        x: partida.current.px + (e.clientX - partida.current.x),
        y: partida.current.py + (e.clientY - partida.current.y),
      });
    };
    const soltar = () => { arrastando.current = false; };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    };
  }, []);

  if (!aberto || !atual) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
      // É um diálogo modal de fato, e o `role` não é só acessibilidade: o ESC
      // do chat procura por `[role="dialog"][data-state="open"]` para não fechar
      // a conversa que está atrás de um modal aberto. Ver BolhaChat.
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de mídia"
      data-state="open"
      // Clique no fundo fecha; clique na mídia não. Por isso a checagem de alvo.
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
    >
      {/* Barra */}
      <div className="flex items-center gap-1 px-3 py-2 text-white/90 shrink-0">
        <p className="text-sm truncate flex-1 min-w-0" title={atual.nome}>{atual.nome}</p>

        {varios && (
          <span className="text-xs text-white/60 tabular-nums px-2">
            {indice + 1} de {midias.length}
          </span>
        )}

        {!ehVideo && (
          <>
            <BotaoBarra onClick={() => setEscala(s => Math.max(ESCALA_MIN, s / 1.3))}
                        rotulo="Diminuir"><ZoomOut className="w-4 h-4" /></BotaoBarra>
            <span className="text-xs text-white/60 tabular-nums w-11 text-center">
              {Math.round(escala * 100)}%
            </span>
            <BotaoBarra onClick={() => setEscala(s => Math.min(ESCALA_MAX, s * 1.3))}
                        rotulo="Aumentar"><ZoomIn className="w-4 h-4" /></BotaoBarra>
            {escala !== 1 && (
              <BotaoBarra onClick={reiniciar} rotulo="Tamanho original">
                <RotateCcw className="w-4 h-4" />
              </BotaoBarra>
            )}
          </>
        )}

        {url && (
          <a href={url} download={atual.nome} target="_blank" rel="noreferrer"
             className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Baixar">
            <Download className="w-4 h-4" />
          </a>
        )}
        <BotaoBarra onClick={onFechar} rotulo="Fechar"><X className="w-5 h-5" /></BotaoBarra>
      </div>

      {/* Palco */}
      <div
        ref={palco}
        className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center select-none"
        onWheel={aoRodar}
        onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
        onDoubleClick={() => {
          if (ehVideo) return;
          if (escala > 1) reiniciar(); else setEscala(ESCALA_DUPLO);
        }}
      >
        {!url && <p className="text-white/50 text-sm">Carregando…</p>}

        {url && (ehVideo ? (
          <video
            src={url} controls autoPlay
            className="max-w-[92vw] max-h-full rounded-lg"
            onMouseDown={e => e.stopPropagation()}
          />
        ) : (
          <img
            src={url} alt={atual.nome} draggable={false}
            onMouseDown={aoPressionar}
            className={cn(
              'max-w-[92vw] max-h-full object-contain',
              escala > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
              // Sem transição durante o arrasto: interpolar a cada quadro
              // deixa a imagem correndo atrás do mouse.
              !arrastando.current && 'transition-transform duration-150',
            )}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})` }}
          />
        ))}

        {varios && (
          <>
            <Seta lado="esq" onClick={() => andar(-1)} />
            <Seta lado="dir" onClick={() => andar(1)} />
          </>
        )}
      </div>

      {!ehVideo && (
        <p className="text-center text-[11px] text-white/40 pb-2 shrink-0">
          Roda do mouse amplia · duplo clique alterna · setas trocam · Esc fecha
        </p>
      )}
    </div>
  );
}

function BotaoBarra({
  onClick, rotulo, children,
}: { onClick: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={rotulo} aria-label={rotulo}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors">
      {children}
    </button>
  );
}

function Seta({ lado, onClick }: { lado: 'esq' | 'dir'; onClick: () => void }) {
  const Icone = lado === 'esq' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={lado === 'esq' ? 'Anterior' : 'Próxima'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 p-2 rounded-full',
        'bg-black/40 hover:bg-black/70 text-white transition-colors',
        lado === 'esq' ? 'left-3' : 'right-3',
      )}
    >
      <Icone className="w-6 h-6" />
    </button>
  );
}
