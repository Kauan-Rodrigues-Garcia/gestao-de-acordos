/**
 * PainelParabens — o convite para parabenizar e o mural de quem já parabenizou.
 *
 * Refeito a pedido do Cleber (15/10/2026). Antes: um botão pequeno embaixo do
 * card e balões que subiam e sumiam em 4 s. Agora:
 *
 *   • o CONVITE fica colado na base do card, grande, pulsando, com uma chamada
 *     que se reveza e fala diferente para pessoa, grupo, equipe e setor;
 *   • o clique estoura confete no próprio botão, que vira "Você parabenizou…";
 *   • as FILAS, uma de cada lado do card, mostram para todo mundo quem já
 *     parabenizou e FICAM até a festa acabar — cada um entra deslizando
 *     devagar, alternando os lados, com o aro acendendo e apagando;
 *   • quem é festejado não ganha botão: vê que está sendo aplaudido.
 *
 * Sem contador: o que importa é quem parabenizou, não quantos.
 *
 * Mesma regra de convivência do resto da festa: só o botão recebe clique, o
 * mural não bloqueia quem está trabalhando embaixo.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  chamadasDoConvite, textoDoBotao, textoDoHomenageado, textoEnviado, type ContextoParabens,
} from '@/pages/Comemoracoes/parabens';

export interface ItemParabens {
  /** Estável por pessoa: quem parabenizou só aparece uma vez. */
  chave: string;
  nome:  string;
  foto:  string | null;
  frase: string;
  /** O meu próprio parabéns. */
  meu?:  boolean;
}

export interface PainelParabensProps {
  ctx:            ContextoParabens;
  /** Quem está vendo é um dos festejados. */
  souHomenageado: boolean;
  /** Pode parabenizar (logado, não é o festejado). */
  pode:           boolean;
  jaDei:          boolean;
  enviando:       boolean;
  onDar:          () => void;
  /** Mais novo primeiro. */
  itens:          ItemParabens[];
  /** Cor de destaque do card. */
  cor:            string;
  /** Texto sobre `cor`. */
  corTexto:       string;
}

/** De quanto em quanto tempo a chamada do convite troca. */
const TROCA_CHAMADA_MS = 3_200;

const CORES_ESTOURO = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#B388FF', '#FFFFFF'];

function Rosto({ nome, foto, tamanho, cor }: { nome: string; foto: string | null; tamanho: number; cor: string }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{ width: tamanho, height: tamanho, background: cor, fontSize: tamanho * 0.42, boxShadow: '0 0 0 2px rgba(255,255,255,.85)' }}>
      {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : nome.charAt(0).toUpperCase()}
    </span>
  );
}

/** Confete que sai do botão no clique. Some sozinho. */
function Estouro({ cor }: { cor: string }) {
  const pedacos = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const angulo = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const alcance = 70 + Math.random() * 70;
    return {
      dx: Math.cos(angulo) * alcance * 1.6,
      dy: Math.sin(angulo) * alcance - 20,
      giro: Math.random() * 540 - 270,
      cor: i % 4 === 0 ? cor : CORES_ESTOURO[i % CORES_ESTOURO.length],
    };
  }), [cor]);
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
      {pedacos.map((p, i) => (
        <motion.span key={i} className="absolute h-2.5 w-1.5 rounded-[2px]" style={{ background: p.cor }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.dx, y: p.dy + 40, opacity: 0, rotate: p.giro, scale: 0.6 }}
          transition={{ duration: 1.1, ease: 'easeOut' }} />
      ))}
    </span>
  );
}

function Convite({
  ctx, jaDei, enviando, onDar, cor, corTexto,
}: Pick<PainelParabensProps, 'ctx' | 'jaDei' | 'enviando' | 'onDar' | 'cor' | 'corTexto'>) {
  const chamadas = useMemo(() => chamadasDoConvite(ctx), [ctx]);
  const [i, setI] = useState(0);
  const [estouros, setEstouros] = useState(0);

  useEffect(() => {
    if (jaDei) return;
    const id = setInterval(() => setI((n) => (n + 1) % chamadas.length), TROCA_CHAMADA_MS);
    return () => clearInterval(id);
  }, [chamadas.length, jaDei]);

  function clicar() {
    if (jaDei || enviando) return;
    setEstouros((n) => n + 1);
    onDar();
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* A chamada que se reveza, num balão acima do botão. */}
      {!jaDei && (
        <div className="relative h-7 min-w-[220px] overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={i}
              className="whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-center text-[13px] font-semibold text-white shadow-lg backdrop-blur"
              initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.28 }}>
              {chamadas[i % chamadas.length]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      <div className="relative">
        {/* Anel que pulsa enquanto ninguém clicou: é o "me aperta". */}
        {!jaDei && (
          <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: `0 0 0 3px ${cor}` }}
            animate={{ scale: [1, 1.18, 1.3], opacity: [0.75, 0.25, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
        )}
        {estouros > 0 && <Estouro key={estouros} cor={cor} />}

        <motion.button
          type="button"
          aria-label={jaDei ? textoEnviado(ctx) : textoDoBotao(ctx)}
          disabled={jaDei || enviando}
          onClick={clicar}
          className="pointer-events-auto relative inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[15px] font-extrabold tracking-tight shadow-[0_12px_30px_-6px_rgba(0,0,0,.55)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
          style={jaDei
            ? { background: 'linear-gradient(135deg,#34D399 0%,#059669 100%)', color: '#fff' }
            : { background: `linear-gradient(135deg, ${cor} 0%, color-mix(in oklch, ${cor} 70%, #000) 100%)`, color: corTexto }}
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={jaDei ? { opacity: 1, y: 0, scale: [1.12, 1] } : { opacity: 1, y: 0, scale: 1 }}
          whileHover={jaDei ? undefined : { scale: 1.06 }}
          whileTap={jaDei ? undefined : { scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18, delay: jaDei ? 0 : 0.7 }}
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : jaDei ? (
            <Check className="h-5 w-5" />
          ) : (
            <motion.span className="inline-flex"
              animate={{ rotate: [0, -16, 14, -10, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.4 }}>
              <PartyPopper className="h-5 w-5" />
            </motion.span>
          )}
          {jaDei ? textoEnviado(ctx) : textoDoBotao(ctx)}
        </motion.button>
      </div>
    </div>
  );
}

/** De que lado cada um entra: alterna pela ordem de chegada, e nunca troca de lado. */
function porLado(itens: ItemParabens[]): { esquerda: ItemParabens[]; direita: ItemParabens[] } {
  const esquerda: ItemParabens[] = [];
  const direita: ItemParabens[] = [];
  // `itens` vem do mais novo para o mais antigo; a ordem de chegada é a inversa.
  itens.forEach((p, i) => ((itens.length - 1 - i) % 2 === 0 ? esquerda : direita).push(p));
  return { esquerda, direita };
}

/**
 * Quem já estava aqui quando a tela abriu entra sem animação: quem chega no
 * meio da festa vê as filas prontas, não uma enxurrada.
 */
function useJaEstavam(itens: ItemParabens[]): ReadonlySet<string> {
  const [iniciais] = useState(() => new Set(itens.map((p) => p.chave)));
  return iniciais;
}

function Pessoa({
  p, lado, cor, jaEstava, compacta = false,
}: { p: ItemParabens; lado: 'esquerda' | 'direita'; cor: string; jaEstava: boolean; compacta?: boolean }) {
  return (
    <motion.li layout
      className={cn(
        'flex items-center gap-2 rounded-full bg-black/60 py-1 shadow-lg backdrop-blur-sm',
        compacta ? 'max-w-[220px] pl-1 pr-3' : 'w-full',
        !compacta && (lado === 'esquerda' ? 'flex-row-reverse pl-3 pr-1 text-right' : 'pl-1 pr-3'),
      )}
      initial={jaEstava ? false : { opacity: 0, x: lado === 'esquerda' ? 18 : -18, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.45, ease: 'easeOut' } }}>
      {/* O aro acende na chegada e apaga devagar — o "olha quem chegou". */}
      <motion.span className="shrink-0 rounded-full"
        initial={jaEstava ? false : { boxShadow: `0 0 0 3px ${cor}, 0 0 14px ${cor}` }}
        animate={{ boxShadow: `0 0 0 0px ${cor}00, 0 0 0px ${cor}00` }}
        transition={{ duration: 2.4, ease: 'easeOut' }}>
        <Rosto nome={p.nome} foto={p.foto} tamanho={28} cor={cor} />
      </motion.span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[12px] font-bold text-white">{p.meu ? 'Você' : p.nome}</span>
        <span className="block truncate text-[11px] text-white/80">{p.frase}</span>
      </span>
    </motion.li>
  );
}

/** Quantos cabem em cada fila ao lado do card; quem passa disso sai pelo fim, devagar. */
const POR_FILA = 7;

/**
 * As duas filas ao lado do card (Cleber, 15/10/2026: "duas filas, uma de cada
 * lado"). Quem parabeniza entra no alto de uma delas, alternando os lados, e
 * fica até a festa acabar. Só aparecem em tela larga — em tela estreita não
 * há lado, e quem mostra é `FilaCompacta`, embaixo do botão.
 *
 * Vai DENTRO da caixa do card (`relative`): as filas se penduram nas bordas.
 */
export function FilasParabens({ itens, cor }: { itens: ItemParabens[]; cor: string }) {
  const jaEstavam = useJaEstavam(itens);
  const { esquerda, direita } = porLado(itens);
  if (itens.length === 0) return null;

  const fila = (lista: ItemParabens[], lado: 'esquerda' | 'direita') => (
    <ul className={cn(
      'pointer-events-none absolute top-3 hidden w-[210px] flex-col gap-1.5 min-[1120px]:flex',
      lado === 'esquerda' ? 'right-full mr-4 items-end' : 'left-full ml-4 items-start',
    )}>
      <AnimatePresence initial={false}>
        {lista.slice(0, POR_FILA).map((p) => (
          <Pessoa key={p.chave} p={p} lado={lado} cor={cor} jaEstava={jaEstavam.has(p.chave)} />
        ))}
      </AnimatePresence>
    </ul>
  );

  return (
    <div role="group" aria-label="Quem já parabenizou">
      {fila(esquerda, 'esquerda')}
      {fila(direita, 'direita')}
    </div>
  );
}

/** Em tela estreita: uma fileira enxuta embaixo do botão, os mais novos primeiro. */
function FilaCompacta({ itens, cor }: { itens: ItemParabens[]; cor: string }) {
  const jaEstavam = useJaEstavam(itens);
  if (itens.length === 0) return null;
  return (
    <ul aria-label="Parabéns recebidos"
      className="pointer-events-none flex max-w-[600px] flex-wrap justify-center gap-1.5 min-[1120px]:hidden">
      <AnimatePresence initial={false}>
        {itens.slice(0, 6).map((p) => (
          <Pessoa key={p.chave} p={p} lado="direita" cor={cor} jaEstava={jaEstavam.has(p.chave)} compacta />
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function PainelParabens(props: PainelParabensProps) {
  const { ctx, souHomenageado, pode, itens, cor } = props;
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      {souHomenageado ? (
        <motion.p
          className="rounded-full px-5 py-2.5 text-[15px] font-extrabold shadow-[0_12px_30px_-6px_rgba(0,0,0,.55)]"
          style={{ background: `linear-gradient(135deg, ${cor} 0%, color-mix(in oklch, ${cor} 70%, #000) 100%)`, color: props.corTexto }}
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: [0.8, 1.08, 1] }}
          transition={{ duration: 0.6, delay: 0.7 }}>
          {textoDoHomenageado(ctx.alvo)}
        </motion.p>
      ) : pode ? (
        <Convite {...props} />
      ) : null}
      <FilaCompacta itens={itens} cor={cor} />
    </div>
  );
}
