/**
 * CardComemoracao — o conteúdo da comemoração.
 *
 * **Fundo transparente**: o que preenche a tela é a chuva (confete ou moedas),
 * atrás. Aqui só ficam a imagem e o texto, empilhados nesta ordem:
 *
 *     GIF  →  título  →  foto e nome  →  mensagem
 *
 * Sem caixa colorida, o texto precisa se defender de qualquer coisa que esteja
 * embaixo — daí o contorno escuro em tudo (`SOMBRA_TEXTO`). É o mesmo recurso
 * de legenda de vídeo: funciona sobre claro e sobre escuro.
 *
 * O MESMO componente serve à exibição e ao preview do editor, via `modo`. Se
 * fossem dois, divergiriam na primeira mudança — e o líder descobriria isso
 * com a comemoração já na tela de todo mundo.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy, Move } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import {
  posicaoDe, definirPosicao, posicaoArrastada,
  type ElementoId, type LayoutComemoracao, type PosicaoElemento,
} from '@/pages/Comemoracoes/layout';

/** Card de referência, em unidades lógicas. As posições do editor são % disto. */
export const LARGURA_LOGICA = 640;
export const ALTURA_LOGICA  = 360;
export const ASPECTO = `${LARGURA_LOGICA} / ${ALTURA_LOGICA}`;

/**
 * Contorno escuro em volta do texto.
 *
 * Sem fundo, o branco sumiria sobre a tela clara do sistema. Quatro sombras de
 * 1px (uma por diagonal) desenham a borda; a quinta dá profundidade.
 */
const SOMBRA_TEXTO: CSSProperties = {
  textShadow:
    '1px 1px 0 rgba(0,0,0,.75), -1px 1px 0 rgba(0,0,0,.75), ' +
    '1px -1px 0 rgba(0,0,0,.75), -1px -1px 0 rgba(0,0,0,.75), ' +
    '0 3px 10px rgba(0,0,0,.5)',
};

/** Primeiro nome — o card não tem largura para nome completo de 4 palavras. */
function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || '—';
}

function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

// ── Elemento posicionável ────────────────────────────────────────────────────

/**
 * FORA do componente principal de propósito.
 *
 * Definido lá dentro, o React o tratava como um tipo NOVO a cada render:
 * desmontava e remontava a subárvore inteira a cada `pointermove`, o elemento
 * perdia a captura do ponteiro e o arrasto morria depois de poucos pixels.
 */
function Posicionado({
  id, pos, ehEditor, selecionado, onPegar, onSelecionar, children,
}: {
  id:          ElementoId;
  pos:         PosicaoElemento;
  ehEditor:    boolean;
  selecionado: boolean;
  onPegar:     (id: ElementoId, e: React.PointerEvent) => void;
  onSelecionar:(id: ElementoId) => void;
  children:    ReactNode;
}) {
  return (
    <div
      style={{
        left: `${pos.x}%`,
        top:  `${pos.y}%`,
        transform: `translate(-50%, -50%) scale(${pos.escala})`,
      }}
      onPointerDown={ehEditor ? (e) => onPegar(id, e) : undefined}
      onClick={ehEditor ? () => onSelecionar(id) : undefined}
      className={cn(
        'absolute flex w-max max-w-[92%] flex-col items-center',
        ehEditor && 'cursor-grab touch-none rounded-lg p-1 outline-dashed outline-1 outline-white/30',
        ehEditor && selecionado && 'outline-2 outline-white/90',
      )}
    >
      {ehEditor && (
        <span className="pointer-events-none absolute -right-2 -top-2 rounded-full bg-white/90 p-0.5 text-black/70 shadow">
          <Move className="h-2.5 w-2.5" />
        </span>
      )}
      {children}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export interface CardComemoracaoProps {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  /** GIF enviado pelo líder. Ausente = troféu do catálogo. */
  gifUrl?:      string | null;
  layout?:      LayoutComemoracao;
  /** 'editor' ganha alças de arrasto; 'exibicao' só anima. */
  modo?:        'editor' | 'exibicao';
  selecionado?: ElementoId | null;
  onSelecionar?: (e: ElementoId) => void;
  onMover?:     (proximo: LayoutComemoracao) => void;
  onFechar?:    () => void;
  /** Duração, para a barra de tempo. Ausente = sem barra (preview). */
  tempoTotalS?: number;
}

export function CardComemoracao({
  titulo, mensagem, homenageados, gifUrl, layout = {},
  modo = 'exibicao', selecionado, onSelecionar, onMover, onFechar, tempoTotalS,
}: CardComemoracaoProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const ehEditor = modo === 'editor';

  /** Layout mais recente, para o arrasto não ler um valor velho do closure. */
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Com muita gente as fotos encolhem, senão a última linha sai do card.
  const muitos = homenageados.length > 6;

  /**
   * Arrasto por ponteiro — mouse e toque no mesmo código.
   *
   * Os listeners vão no `window`, não no elemento: assim o arrasto continua
   * mesmo quando o cursor sai de cima do que está sendo arrastado, que é o
   * normal quando se puxa rápido.
   */
  function aoPegar(elemento: ElementoId, e: React.PointerEvent) {
    if (!ehEditor || !onMover) return;
    e.preventDefault();
    e.stopPropagation();
    onSelecionar?.(elemento);

    const caixa = cardRef.current?.getBoundingClientRect();
    if (!caixa) return;

    // Posição de ONDE começou + deslocamento TOTAL. Ver `posicaoArrastada`:
    // a versão incremental travava ao encostar na margem.
    const origem  = posicaoDe(layoutRef.current, elemento);
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    setArrastando(true);

    const aoMover = (ev: PointerEvent) => {
      onMover(definirPosicao(
        layoutRef.current,
        elemento,
        posicaoArrastada(
          origem,
          { dx: ev.clientX - inicioX, dy: ev.clientY - inicioY },
          { largura: caixa.width, altura: caixa.height },
        ),
      ));
    };

    const aoSoltar = () => {
      setArrastando(false);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    };

    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  }

  const comum = {
    ehEditor,
    onPegar: aoPegar,
    onSelecionar: (id: ElementoId) => onSelecionar?.(id),
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative w-full',
        // Fundo transparente: quem preenche a tela é a chuva, atrás.
        ehEditor && 'rounded-xl bg-black/20 ring-1 ring-primary/40',
        arrastando && 'select-none',
      )}
      style={{ aspectRatio: ASPECTO }}
    >
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar comemoração"
          // O card inteiro é `pointer-events-none` na exibição (ver o overlay);
          // este botão reativa só para si.
          className="pointer-events-auto absolute right-0 top-0 z-20 rounded-full bg-black/40 p-1 text-white/90 transition-colors hover:bg-black/70"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="relative h-full w-full text-center text-white">
        {/* 1. GIF (ou o troféu, quando não há imagem) */}
        <Posicionado id="midia" pos={posicaoDe(layout, 'midia')}
          selecionado={selecionado === 'midia'} {...comum}>
          {gifUrl ? (
            <img
              src={gifUrl}
              alt=""
              draggable={false}
              className="w-auto rounded-xl object-contain drop-shadow-2xl"
              style={{ maxHeight: ALTURA_LOGICA * 0.36, maxWidth: LARGURA_LOGICA * 0.5 }}
            />
          ) : (
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="rounded-full bg-amber-400 p-3 shadow-xl"
            >
              <Trophy className="h-8 w-8 text-white drop-shadow" />
            </motion.div>
          )}
        </Posicionado>

        {/* 2. Título */}
        <Posicionado id="titulo" pos={posicaoDe(layout, 'titulo')}
          selecionado={selecionado === 'titulo'} {...comum}>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={SOMBRA_TEXTO}
            className="whitespace-pre-wrap text-3xl font-black uppercase leading-none tracking-tight text-amber-300"
          >
            {titulo}
          </motion.h2>
        </Posicionado>

        {/* 3. Foto e nome */}
        <Posicionado id="pessoas" pos={posicaoDe(layout, 'pessoas')}
          selecionado={selecionado === 'pessoas'} {...comum}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-start justify-center gap-x-4 gap-y-2"
          >
            {homenageados.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <Avatar className={cn(
                  'border-2 border-white shadow-[0_2px_12px_rgba(0,0,0,.5)]',
                  muitos ? 'h-10 w-10' : 'h-14 w-14',
                )}>
                  {p.foto_url && <AvatarImage src={p.foto_url} alt={p.nome} className="object-cover" />}
                  <AvatarFallback className="bg-amber-500 text-sm font-bold text-white">
                    {iniciais(p.nome)}
                  </AvatarFallback>
                </Avatar>
                <span style={SOMBRA_TEXTO}
                  className={cn('font-bold', muitos ? 'text-[11px]' : 'text-sm')}>
                  {primeiroNome(p.nome)}
                </span>
              </div>
            ))}
          </motion.div>
        </Posicionado>

        {/* 4. Mensagem */}
        {mensagem && (
          <Posicionado id="mensagem" pos={posicaoDe(layout, 'mensagem')}
            selecionado={selecionado === 'mensagem'} {...comum}>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={SOMBRA_TEXTO}
              className="text-sm font-semibold leading-snug"
            >
              {mensagem}
            </motion.p>
          </Posicionado>
        )}
      </div>

      {/* Relógio visual: mostra quanto falta, para o card não parecer travado. */}
      {!!tempoTotalS && (
        <div className="absolute bottom-0 left-1/2 h-1 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-black/40">
          <motion.div
            className="h-full bg-amber-300"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: tempoTotalS, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}
