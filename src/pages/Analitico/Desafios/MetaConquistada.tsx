/**
 * MetaConquistada — a comemoração de bater a meta.
 *
 * ## Uma vez, e não a cada render
 *
 * O gatilho é a TRANSIÇÃO de "não bateu" para "bateu", guardada num `ref`, mais
 * uma marca em `sessionStorage` por (desafio, pessoa). Sem as duas travas, a
 * comemoração voltaria a cada re-render, a cada atualização do realtime e a
 * cada volta para a aba — que é exatamente o que o pedido §29 proíbe.
 *
 * `sessionStorage` e não `localStorage` de propósito: a marca vale para a
 * sessão do navegador. Bater a meta de novo numa campanha nova comemora de
 * novo; recarregar a página no mesmo dia, não.
 *
 * ## O que reaproveita
 *
 * `EfeitoComemoracao`, o fundo de partículas que a tela de Comemorações já usa.
 * É o sistema de comemoração que o projeto tem, e ele resolve isto sem um
 * arquivo novo. O card por cima é curto — 2,6 s — e `pointer-events-none`, para
 * não roubar um clique de quem está trabalhando.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { EfeitoComemoracao } from '@/components/comemoracao/EfeitoComemoracao';
import type { EstiloTema } from './tema';

/** Curto de propósito: comemoração, não interrupção. */
const DURACAO_MS = 2_600;

interface Props {
  /** `null` = ninguém a comemorar (a pessoa não disputa ou não bateu). */
  nome: string | null;
  valor: number;
  bateu: boolean;
  /** Nome da campanha, para a linha de baixo do card. */
  campanha: string;
  premio: string | null;
  tema: EstiloTema;
  /** Chave da marca de "já comemorou": `<desafioId>::<pessoaId>`. */
  chave: string;
  /** Desligado na configuração da campanha. */
  habilitado: boolean;
}

export function MetaConquistada({
  nome, valor, bateu, campanha, premio, tema, chave, habilitado,
}: Props) {
  const [visivel, setVisivel] = useState(false);
  const bateuAntes = useRef<boolean | null>(null);

  useEffect(() => {
    if (!habilitado || !nome) return;

    const antes = bateuAntes.current;
    bateuAntes.current = bateu;

    // `null` é a primeira leitura: quem já abriu a aba com a meta batida não
    // recebe uma comemoração retroativa.
    if (antes !== false || !bateu) return;

    const marca = `desafio-meta::${chave}`;
    try {
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, '1');
    } catch { /* navegador sem storage: comemora, e pronto */ }

    setVisivel(true);
    const t = setTimeout(() => setVisivel(false), DURACAO_MS);
    return () => clearTimeout(t);
  }, [bateu, habilitado, nome, chave]);

  return (
    <AnimatePresence>
      {visivel && nome && (
        <>
          <EfeitoComemoracao efeito="confete" id={chave} />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="pointer-events-none fixed inset-x-0 top-24 z-[100] flex justify-center px-4"
            role="status"
          >
            <div className={cn(
              'rounded-xl border bg-card px-6 py-4 text-center shadow-lg',
              tema.borda,
            )}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Meta conquistada
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">{nome}</p>
              <p className={cn('text-2xl font-bold tabular-nums', tema.destaque)}>
                {formatBRL(valor)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {campanha}{premio ? ` · ${premio}` : ''}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default MetaConquistada;
