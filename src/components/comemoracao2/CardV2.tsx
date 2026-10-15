/**
 * CardV2 — o card da Comemoração 2.0.
 *
 * Um cartão sólido com papel de parede, não mais texto solto sobre a tela.
 * O MESMO componente desenha:
 *   • a festa na tela de todo mundo  (`modo="exibicao"`)
 *   • o palco do estúdio, arrastável (`modo="editor"`)
 *   • as miniaturas do histórico     (`modo="miniatura"`)
 * Se fossem três, divergiriam na primeira mudança — e o líder descobriria isso
 * com a festa já no ar.
 *
 * O conteúdo é desenhado numa caixa lógica de 640×400 e escalado inteiro com
 * `transform`: letra, foto, GIF e vãos crescem juntos, então o editor e a
 * exibição ficam idênticos por construção.
 */
import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import {
  ALTURA_CARD, FONTES, LARGURA_CARD, arrastar, escalaDoCard, larguraDoTexto, nomesDoCard,
  type DesignCard, type ElementoCard, type Posicao,
} from './design';
import { papelDeParede, type PapelDeParede } from './papeisDeParede';
import { carregarFontesDoCard } from './carregarFontes';
import { TrofeuIlustracao } from './TrofeuIlustracao';

export type ModoCard = 'exibicao' | 'editor' | 'miniatura';

export interface CardV2Props {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  design:       DesignCard;
  modo?:        ModoCard;
  /** Exibição: duração total, para a barra de tempo. */
  tempoTotalS?: number;
  /** Editor: toca a entrada (o palco fica parado até alguém pedir). */
  animar?:      boolean;
  selecionado?: ElementoCard | null;
  onSelecionar?: (e: ElementoCard | null) => void;
  onMudarDesign?: (d: DesignCard) => void;
  className?:   string;
}

// ── Medida ───────────────────────────────────────────────────────────────────

function useLargura(ref: RefObject<HTMLElement | null>): number {
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `offsetWidth`, não `getBoundingClientRect`: a festa entra com `scale`
    // animado, e medir no meio da entrada travaria o card no tamanho encolhido
    // (transformação não dispara o ResizeObserver para corrigir depois).
    const medir = () => setLargura(el.offsetWidth);
    medir();
    // Sem ResizeObserver no jsdom: os testes que montam o card não quebram.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return largura;
}

// ── Pedaços ──────────────────────────────────────────────────────────────────

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Preenchimento do título como gradiente — cor sólida vira gradiente de uma cor só. */
function tintaDoTitulo(papel: PapelDeParede): string {
  return papel.titulo ?? `linear-gradient(${papel.tinta},${papel.tinta})`;
}

const BRILHO_LETREIRO = 'linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,.95) 50%, rgba(255,255,255,0) 60%)';

function Titulo({
  texto, design, papel, animar,
}: { texto: string; design: DesignCard; papel: PapelDeParede; animar: boolean }) {
  const fonte = FONTES.find((f) => f.id === design.fonte) ?? FONTES[0];
  const tamanho = fonte.id === 'impacto' ? 54 : 48;
  const letreiro = design.entrada === 'letreiro' && animar;

  const estilo: CSSProperties = {
    fontFamily: fonte.familia,
    fontWeight: fonte.peso,
    fontStyle: fonte.id === 'elegante' ? 'italic' : 'normal',
    textTransform: fonte.maiusculas ? 'uppercase' : 'none',
    letterSpacing: fonte.maiusculas ? '0.01em' : '-0.015em',
    fontSize: tamanho,
    lineHeight: 1.04,
    textWrap: 'balance',
    // Texto com gradiente: o `background-clip` pinta as letras, e a sombra vai
    // no `filter` — `text-shadow` pintaria por cima do gradiente.
    backgroundImage: letreiro ? `${BRILHO_LETREIRO}, ${tintaDoTitulo(papel)}` : tintaDoTitulo(papel),
    backgroundSize: letreiro ? '250% 100%, 100% 100%' : '100% 100%',
    backgroundRepeat: 'no-repeat',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    filter: papel.claro ? 'drop-shadow(0 1px 0 rgba(255,255,255,.7))' : 'drop-shadow(0 3px 10px rgba(0,0,0,.45))',
  };

  if (!animar) return <h2 style={estilo}>{texto}</h2>;

  if (design.entrada === 'maquina') {
    const letras = Array.from(texto);
    const passo = Math.min(0.06, 1.2 / Math.max(letras.length, 1));
    return (
      <h2 style={estilo} aria-label={texto}>
        {letras.map((l, i) => (
          <motion.span key={i} aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.25 + i * passo, duration: 0.01 }}>
            {l}
          </motion.span>
        ))}
      </h2>
    );
  }

  if (design.entrada === 'impacto') {
    return (
      <motion.h2 style={estilo}
        initial={{ opacity: 0, scale: 0.35 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.2 }}>
        {texto}
      </motion.h2>
    );
  }

  if (letreiro) {
    return (
      <motion.h2 style={estilo}
        initial={{ opacity: 0, backgroundPosition: '180% 0, 0 0' }}
        animate={{ opacity: 1, backgroundPosition: ['180% 0, 0 0', '-80% 0, 0 0'] }}
        transition={{
          opacity: { duration: 0.4, delay: 0.15 },
          backgroundPosition: { duration: 1.6, delay: 0.5, repeat: 2, repeatDelay: 1.2, ease: 'easeInOut' },
        }}>
        {texto}
      </motion.h2>
    );
  }

  return (
    <motion.h2 style={estilo}
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      {texto}
    </motion.h2>
  );
}

function Midia({ design, papel }: { design: DesignCard; papel: PapelDeParede }) {
  const [falhou, setFalhou] = useState(false);
  const gif = design.gif;
  useEffect(() => { setFalhou(false); }, [gif?.url]);

  if (gif && !falhou) {
    // Altura fixa e largura pela proporção do GIF, com teto: GIF largo não
    // invade o texto, GIF alto não estoura o card.
    const altura = 150;
    const largura = Math.min(270, Math.max(110, (gif.largura / Math.max(gif.altura, 1)) * altura));
    return (
      <img
        src={gif.url}
        alt={gif.titulo || 'GIF da comemoração'}
        draggable={false}
        onError={() => setFalhou(true)}
        style={{
          width: largura, height: altura, objectFit: 'cover', borderRadius: 18,
          boxShadow: `0 0 0 3px ${papel.destaque}55, 0 12px 30px rgba(0,0,0,.35)`,
        }}
      />
    );
  }
  // Sem GIF, ou o GIPHY não respondeu: o troféu segura o card.
  return <TrofeuIlustracao className="h-[156px] w-[156px] drop-shadow-[0_10px_24px_rgba(0,0,0,.35)]" />;
}

function Pessoas({
  pessoas, papel, modo, animar,
}: { pessoas: PessoaComemoracao[]; papel: PapelDeParede; modo: ModoCard; animar: boolean }) {
  if (pessoas.length === 0) {
    if (modo !== 'editor') return null;
    // No editor o lugar das fotos continua visível para dar para posicioná-lo.
    return (
      <div className="flex items-center gap-2 rounded-full border-2 border-dashed px-4 py-2 text-sm font-semibold"
        style={{ borderColor: `${papel.tinta}55`, color: `${papel.tinta}aa` }}>
        <Users className="h-4 w-4" /> Fotos de quem bateu
      </div>
    );
  }

  const visiveis = pessoas.slice(0, 5);
  const resto = pessoas.length - visiveis.length;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center">
        {visiveis.map((p, i) => (
          <motion.div key={p.id}
            className="relative -ml-2.5 first:ml-0 overflow-hidden rounded-full"
            style={{
              width: 46, height: 46,
              boxShadow: `0 0 0 3px ${papel.destaque}, 0 6px 16px rgba(0,0,0,.35)`,
              background: papel.claro ? '#ffffff' : 'rgba(255,255,255,.12)',
              zIndex: visiveis.length - i,
            }}
            initial={animar ? { opacity: 0, scale: 0.4 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.65 + i * 0.08 }}>
            {p.foto_url ? (
              <img src={p.foto_url} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-bold"
                style={{ color: papel.tinta }}>
                {primeiroNome(p.nome).charAt(0).toUpperCase()}
              </span>
            )}
          </motion.div>
        ))}
        {resto > 0 && (
          <div className="-ml-2.5 flex items-center justify-center rounded-full text-sm font-bold"
            style={{ width: 46, height: 46, background: papel.destaque, color: papel.claro ? '#fff' : '#16110A' }}>
            +{resto}
          </div>
        )}
      </div>
      <p className="max-w-[420px] truncate text-[15px] font-semibold"
        style={{ color: papel.tinta, textShadow: papel.sombra, fontFamily: '"Inter", sans-serif' }}>
        {nomesDoCard(pessoas)}
      </p>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function CardV2({
  titulo, mensagem, homenageados, design,
  modo = 'exibicao', tempoTotalS, animar: animarProp,
  selecionado = null, onSelecionar, onMudarDesign, className,
}: CardV2Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixaRef);
  const escala = escalaDoCard(largura);
  const calmo = useReducedMotion();
  const papel = papelDeParede(design.papel);

  useEffect(() => { carregarFontesDoCard(); }, []);

  const animar = !calmo && (modo === 'exibicao' || (modo === 'editor' && !!animarProp));

  // Arrasto: o design mais novo numa ref, para o `pointermove` não usar um
  // design velho e "desfazer" o que outro controle mudou no meio.
  const designRef = useRef(design);
  designRef.current = design;

  function aoApertar(e: ReactPointerEvent, elemento: ElementoCard) {
    if (modo !== 'editor' || !onMudarDesign) return;
    e.preventDefault();
    e.stopPropagation();
    onSelecionar?.(elemento);

    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!caixa) return;
    const inicio: Posicao = { ...designRef.current.posicoes[elemento] };
    const x0 = e.clientX;
    const y0 = e.clientY;

    const mover = (ev: PointerEvent) => {
      onMudarDesign(arrastar(designRef.current, elemento, inicio, ev.clientX - x0, ev.clientY - y0, caixa.width, caixa.height));
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  function bloco(elemento: ElementoCard, conteudo: ReactNode, larguraPct?: number) {
    const p = design.posicoes[elemento];
    const editavel = modo === 'editor';
    const ativo = editavel && selecionado === elemento;
    return (
      <div
        key={elemento}
        data-elemento={elemento}
        onPointerDown={editavel ? (e) => aoApertar(e, elemento) : undefined}
        className={cn(
          'absolute flex justify-center',
          editavel && 'cursor-grab touch-none select-none active:cursor-grabbing',
        )}
        style={{
          left: `${p.x}%`, top: `${p.y}%`,
          width: larguraPct ? `${larguraPct}%` : undefined,
          transform: `translate(-50%, -50%) scale(${p.escala})`,
          outline: ativo ? `2px dashed ${papel.destaque}` : undefined,
          outlineOffset: 6,
          borderRadius: 10,
        }}
      >
        {conteudo}
      </div>
    );
  }

  const tempoS = modo === 'exibicao' ? tempoTotalS : undefined;

  const corpo = (
    <div
      className="absolute left-0 top-0 overflow-hidden"
      style={{
        width: LARGURA_CARD, height: ALTURA_CARD,
        transform: `scale(${escala})`, transformOrigin: 'top left',
        background: papel.fundo,
        borderRadius: 28,
        fontFamily: '"Inter", sans-serif',
      }}
      onPointerDown={modo === 'editor' ? () => onSelecionar?.(null) : undefined}
    >
      {/* Moldura fina por dentro: dá acabamento sem disputar com o fundo. */}
      <div className="pointer-events-none absolute inset-[10px] rounded-[20px]"
        style={{ boxShadow: `inset 0 0 0 1px ${papel.claro ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.16)'}` }} />

      {design.selo.trim() && bloco('selo', (
        <motion.span
          className="whitespace-nowrap rounded-full px-3.5 py-1 text-[12px] font-bold uppercase tracking-[0.2em]"
          style={{ background: papel.destaque, color: papel.claro ? '#FFFFFF' : '#16110A' }}
          initial={animar ? { opacity: 0, y: -10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}>
          {design.selo.trim()}
        </motion.span>
      ))}

      {design.comMidia && bloco('midia', (
        <motion.div
          initial={animar ? { opacity: 0, scale: 0.6, rotate: -6 } : false}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}>
          <Midia design={design} papel={papel} />
        </motion.div>
      ))}

      {bloco('titulo', (
        <div className="text-center">
          <Titulo texto={titulo} design={design} papel={papel} animar={animar} />
        </div>
      ), larguraDoTexto(design.posicoes.titulo.x))}

      {mensagem?.trim() && bloco('mensagem', (
        <motion.p
          className="text-center text-[18px] font-medium leading-snug"
          style={{ color: papel.tinta, textShadow: papel.sombra, textWrap: 'pretty' }}
          initial={animar ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 0.95, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}>
          {mensagem.trim()}
        </motion.p>
      ), larguraDoTexto(design.posicoes.mensagem.x, 80))}

      {bloco('pessoas', <Pessoas pessoas={homenageados} papel={papel} modo={modo} animar={animar} />)}

      {/* O brilho que atravessa o card na chegada — o "flash" do troféu. */}
      {animar && (
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-[45%]"
          style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.32) 50%, rgba(255,255,255,0) 100%)' }}
          initial={{ left: '-50%' }} animate={{ left: '110%' }}
          transition={{ duration: 1.1, delay: 0.35, ease: 'easeInOut' }} />
      )}

      {tempoS && tempoS > 0 && (
        <div className="absolute inset-x-[22px] bottom-[14px] h-[3px] overflow-hidden rounded-full"
          style={{ background: papel.claro ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.16)' }}>
          <motion.div className="h-full origin-left rounded-full" style={{ background: papel.destaque }}
            initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
            transition={{ duration: tempoS, ease: 'linear' }} />
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={caixaRef}
      className={cn('relative w-full', modo === 'miniatura' && 'pointer-events-none', className)}
      style={{ aspectRatio: `${LARGURA_CARD} / ${ALTURA_CARD}` }}
    >
      {corpo}
    </div>
  );
}
