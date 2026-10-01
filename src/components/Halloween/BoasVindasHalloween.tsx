/**
 * BoasVindasHalloween — a mensagem que abre outubro, uma vez por pessoa.
 *
 * ## Chega fechada
 *
 * Abrir sozinha, no meio da tela e com música, assustava — a pessoa estava
 * trabalhando (às vezes em ligação) e a tela «explodia». Agora ela chega como
 * um envelope pequeno no rodapé, sem cobrir nada e sem som (`EnvelopeFechado`).
 * Só o «Ler agora» abre a carta — e é aí que a música começa. «Ver a
 * mensagem», em Configurações, já é um clique: abre direto (`abrirDireto`).
 *
 * ## A carta
 *
 * Fecha o mês que passou com um agradecimento, deseja um bom mês e, no fim,
 * apresenta o tema de Halloween. Surge no meio da tela com o fundo borrado; o
 * tema carrega por trás enquanto a pessoa lê, e quando ela fecha já está tudo
 * no lugar. O botão fica parado por `ESPERA_MINIMA_MS`, com a contagem à
 * mostra, e espera também o tema ficar pronto — com um teto, para uma rede
 * lenta não prender ninguém aqui.
 *
 * Enquanto ela está aberta, toca a trilha (ver `trilha.ts`): começa baixinho,
 * sobe devagar e para quando a mensagem fecha. O alto-falante no canto desliga.
 *
 * Quem decide se aparece é o `Layout`, por `useHalloween().boasVindasPendentes`.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { AboboraChat } from './Desenhos';
import { carregarFonte } from './fonte';
import { mesQuePassou, primeiroNome } from './textosBoasVindas';
import { tocarTrilhaHalloween, type EstadoTrilha, type Trilha } from './trilha';
import { liberarSilencio as liberarSomAmbiente, silenciar as silenciarSomAmbiente } from './SomAmbiente/motor';

/** O máximo que o botão espera o tema antes de liberar mesmo assim. */
const ESPERA_MAXIMA_MS = 4000;
/** O mínimo que o botão fica parado: tempo de a mensagem ser vista. */
export const ESPERA_MINIMA_MS = 3000;

const FONTE_ASSUSTADORA = "'Creepster', Georgia, serif";

interface PropsBoasVindas {
  nome: string | null | undefined;
  /** Baixa as camadas do tema. Resolve quando estão prontas. */
  preparar: () => Promise<unknown>;
  aoFechar: () => void;
}

export default function BoasVindasHalloween({
  abrirDireto = false, ...props
}: PropsBoasVindas & {
  /** Pula o envelope — quem pediu a mensagem já clicou para isso. */
  abrirDireto?: boolean;
}) {
  const [lendo, setLendo] = useState(abrirDireto);
  return lendo ? <CartaAberta {...props} /> : <EnvelopeFechado aoLer={() => setLendo(true)} />;
}

/**
 * O envelope: pequeno, no rodapé, sem fundo borrado e sem som. Não prende a
 * tela — dá para continuar trabalhando e abrir quando der.
 */
function EnvelopeFechado({ aoLer }: { aoLer: () => void }) {
  return createPortal(
    // Casca só para centralizar: o `transform` do framer-motion não briga com ela.
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[150] flex justify-center px-4">
    <motion.section
      aria-label="Mensagem de outubro"
      className="pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-2xl shadow-2xl"
      style={{
        background: 'radial-gradient(140% 120% at 0% 0%, oklch(0.32 0.08 300) 0%, oklch(0.2 0.05 295) 60%, oklch(0.16 0.04 290) 100%)',
        color: 'oklch(0.95 0.015 80)',
        border: '1px solid oklch(0.5 0.1 300 / .45)',
        ['--ring' as string]: 'oklch(0.85 0.15 70)',
        ['--background' as string]: 'oklch(0.17 0.04 292)',
      }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* A aba do envelope, fechada. */}
      <svg aria-hidden="true" viewBox="0 0 420 34" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[34px] w-full">
        <path d="M0 0 L210 30 L420 0" fill="none" stroke="oklch(0.6 0.1 300 / .45)" strokeWidth="1.2" />
      </svg>
      <div className="relative flex items-center gap-3 px-4 pb-4 pt-6">
        <div className="shrink-0 [&_.hw-abobora]:h-[48px] [&_.hw-abobora]:w-[48px]">
          <AboboraChat acesa={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'oklch(0.8 0.12 60)' }}>
            Outubro chegou
          </p>
          <p className="text-[15px] font-semibold leading-tight">Você tem uma mensagem</p>
          <p className="mt-0.5 text-xs" style={{ color: 'oklch(0.82 0.03 80)' }}>
            Ela vem com música. Abra quando puder.
          </p>
        </div>
        <button
          type="button"
          onClick={aoLer}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          style={{ background: 'oklch(0.72 0.18 52)', color: 'oklch(0.2 0.04 40)' }}
        >
          Ler agora
        </button>
      </div>
    </motion.section>
    </div>,
    document.body,
  );
}

/** A carta aberta, com a trilha tocando. */
function CartaAberta({ nome, preparar, aoFechar }: PropsBoasVindas) {
  const [temaPronto, setTemaPronto] = useState(false);
  const [restante, setRestante] = useState(Math.ceil(ESPERA_MINIMA_MS / 1000));
  const pronto = temaPronto && restante === 0;
  const botao = useRef<HTMLButtonElement>(null);
  const trilha = useRef<Trilha | null>(null);
  const [som, setSom] = useState<EstadoTrilha>('carregando');
  const mes = mesQuePassou();
  const quem = primeiroNome(nome);

  useEffect(() => {
    carregarFonte();
    let vivo = true;
    const liberar = () => { if (vivo) setTemaPronto(true); };
    const teto = setTimeout(liberar, ESPERA_MAXIMA_MS);
    preparar().then(liberar, liberar);
    return () => { vivo = false; clearTimeout(teto); };
  }, [preparar]);

  // Conta pelo relógio, não por tique: aba em segundo plano atrasa timers.
  useEffect(() => {
    const fim = Date.now() + ESPERA_MINIMA_MS;
    const tique = setInterval(() => {
      const falta = Math.max(0, Math.ceil((fim - Date.now()) / 1000));
      setRestante(falta);
      if (falta === 0) clearInterval(tique);
    }, 200);
    return () => clearInterval(tique);
  }, []);

  // A trilha nasce e morre com a carta aberta — e o Som ambiente espera ela
  // acabar. Como a carta só abre no «Ler agora», o clique já liberou o som.
  useEffect(() => {
    silenciarSomAmbiente('halloween');
    const t = tocarTrilhaHalloween(setSom);
    trilha.current = t;
    return () => { t.parar(); trilha.current = null; liberarSomAmbiente('halloween'); };
  }, []);

  useEffect(() => { if (pronto) botao.current?.focus(); }, [pronto]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && pronto) aoFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [pronto, aoFechar]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex overflow-y-auto p-4"
      style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'oklch(0.14 0.03 300 / .38)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hw-bv-titulo"
        // `m-auto` centraliza sem cortar o topo quando a tela é mais baixa que a carta.
        className="relative m-auto w-full max-w-[460px] overflow-hidden rounded-3xl px-7 pb-7 pt-6 text-left shadow-2xl"
        style={{
          // Cor de objeto, como a abóbora: a carta é a mesma em qualquer tema.
          background: 'radial-gradient(120% 80% at 50% 0%, oklch(0.32 0.08 300) 0%, oklch(0.2 0.05 295) 55%, oklch(0.15 0.035 290) 100%)',
          color: 'oklch(0.95 0.015 80)',
          border: '1px solid oklch(0.5 0.1 300 / .45)',
          // O anel de foco global usa estas duas: aqui, âmbar sobre a noite.
          ['--ring' as string]: 'oklch(0.85 0.15 70)',
          ['--background' as string]: 'oklch(0.17 0.04 292)',
        }}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {som !== 'indisponivel' && som !== 'carregando' && (
          <button
            type="button"
            data-hw-sem-destravar=""
            onClick={() => trilha.current?.alternarSom()}
            aria-label={som === 'tocando' ? 'Desligar a música' : 'Ligar a música'}
            title={som === 'tocando' ? 'Desligar a música' : 'Ligar a música'}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: 'oklch(0.9 0.03 80)' }}
          >
            {som === 'tocando' ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
        )}

        {/* Lua cheia ao fundo, só clima. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 40%, oklch(0.95 0.06 90 / .5), oklch(0.9 0.08 85 / .12) 55%, transparent 70%)' }}
        />

        <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'oklch(0.8 0.12 60)' }}>
          Outubro chegou
        </p>
        <h2 id="hw-bv-titulo" className="relative mt-1.5 pr-8 text-2xl font-bold leading-tight">
          {quem ? `Obrigado por ${mes.toLowerCase()}, ${quem}!` : `Obrigado por ${mes.toLowerCase()}!`}
        </h2>

        <div className="relative mt-3 space-y-3 text-[15px] leading-relaxed" style={{ color: 'oklch(0.9 0.02 80)' }}>
          <p>
            {mes} terminou, e cada acordo fechado, cada ligação feita com paciência e cada
            cliente que você ajudou a sair do aperto fizeram diferença. Obrigado pelo
            carinho e pela dedicação de todos os dias — o mês foi bom porque você estava nele.
          </p>
          <p>
            Que outubro chegue leve: com metas batidas, café quentinho e uma equipe que
            segura a mão uma da outra. Estamos juntos em cada dia dele.
          </p>
        </div>

        <div className="relative my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1" style={{ background: 'oklch(0.6 0.1 300 / .4)' }} />
          <span className="text-sm">🦇</span>
          <span className="h-px flex-1" style={{ background: 'oklch(0.6 0.1 300 / .4)' }} />
        </div>

        <div className="relative flex items-center gap-4">
          <div className="shrink-0 [&_.hw-abobora]:h-[68px] [&_.hw-abobora]:w-[68px]">
            <AboboraChat acesa />
          </div>
          <div>
            <p className="text-sm" style={{ color: 'oklch(0.85 0.03 80)' }}>E por falar em outubro… boas-vindas ao</p>
            <p
              className="leading-none"
              style={{
                fontFamily: FONTE_ASSUSTADORA, fontSize: 40, letterSpacing: '0.03em',
                color: 'oklch(0.74 0.19 52)', textShadow: '0 2px 0 oklch(0.3 0.1 35 / .7), 0 0 18px oklch(0.7 0.19 48 / .35)',
              }}
            >
              Halloween
            </p>
          </div>
        </div>

        <p className="relative mt-3 text-[14px] leading-relaxed" style={{ color: 'oklch(0.86 0.025 80)' }}>
          O sistema se vestiu para a data: teias nos cantos, morcegos passando de vez em
          quando, uma abóbora no lugar do chat e chapéu de bruxa nas fotos. É só enfeite —
          nada muda no seu trabalho. Se preferir sem, é só desligar no botão de tema, lá em cima.
        </p>

        <button
          ref={botao}
          type="button"
          data-hw-sem-destravar=""
          onClick={aoFechar}
          disabled={!pronto}
          className="relative mt-6 w-full overflow-hidden rounded-xl px-4 py-3 text-[15px] font-semibold transition-[transform,opacity] enabled:hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          style={{ background: 'oklch(0.72 0.18 52)', color: 'oklch(0.2 0.04 40)' }}
        >
          {/* A contagem enche o botão da esquerda para a direita. */}
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left"
            style={{ background: 'oklch(0.82 0.15 70 / .55)' }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: pronto ? 0 : 1 }}
            transition={{ scaleX: { duration: ESPERA_MINIMA_MS / 1000, ease: 'linear' }, opacity: { duration: 0.3 } }}
          />
          <span className="relative">
            {restante > 0
              ? `Entrar no Halloween em ${restante}…`
              : pronto ? 'Entrar no Halloween 🎃' : 'Preparando as teias…'}
          </span>
        </button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
