/**
 * BoasVindasHalloween — a mensagem que abre outubro, uma vez por pessoa.
 *
 * Fecha o mês que passou com um agradecimento, deseja um bom mês e, no fim,
 * apresenta o tema de Halloween. Surge no meio da tela com o fundo borrado; o
 * tema carrega por trás enquanto a pessoa lê, e quando ela fecha já está tudo
 * no lugar. O botão espera o tema ficar pronto — com um teto, para uma rede
 * lenta não prender ninguém aqui.
 *
 * Quem decide se aparece é o `Layout`, por `useHalloween().boasVindasPendentes`.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AboboraChat } from './Desenhos';
import { carregarFonte } from './fonte';
import { mesQuePassou, primeiroNome } from './textosBoasVindas';

/** O máximo que o botão espera o tema antes de liberar mesmo assim. */
const ESPERA_MAXIMA_MS = 4000;

const FONTE_ASSUSTADORA = "'Creepster', Georgia, serif";

export default function BoasVindasHalloween({
  nome, preparar, aoFechar,
}: {
  nome: string | null | undefined;
  /** Baixa as camadas do tema. Resolve quando estão prontas. */
  preparar: () => Promise<unknown>;
  aoFechar: () => void;
}) {
  const [pronto, setPronto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const mes = mesQuePassou();
  const quem = primeiroNome(nome);

  useEffect(() => {
    carregarFonte();
    let vivo = true;
    const liberar = () => { if (vivo) setPronto(true); };
    const teto = setTimeout(liberar, ESPERA_MAXIMA_MS);
    preparar().then(liberar, liberar);
    return () => { vivo = false; clearTimeout(teto); };
  }, [preparar]);

  useEffect(() => { if (pronto) botao.current?.focus(); }, [pronto]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && pronto) aoFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [pronto, aoFechar]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
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
        className="relative w-full max-w-[460px] overflow-hidden rounded-3xl px-7 pb-7 pt-6 text-left shadow-2xl"
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
        {/* Lua cheia ao fundo, só clima. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 40%, oklch(0.95 0.06 90 / .5), oklch(0.9 0.08 85 / .12) 55%, transparent 70%)' }}
        />

        <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'oklch(0.8 0.12 60)' }}>
          Outubro chegou
        </p>
        <h2 id="hw-bv-titulo" className="relative mt-1.5 text-2xl font-bold leading-tight">
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
          onClick={aoFechar}
          disabled={!pronto}
          className="relative mt-6 w-full rounded-xl px-4 py-3 text-[15px] font-semibold transition-[transform,opacity] enabled:hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          style={{ background: 'oklch(0.72 0.18 52)', color: 'oklch(0.2 0.04 40)' }}
        >
          {pronto ? 'Entrar no Halloween 🎃' : 'Preparando as teias…'}
        </button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
