/**
 * CardResultadoVotacao — o resultado de uma votação encerrada (16/11/2026).
 *
 * Abre sozinho, uma vez por pessoa, para quem foi chamado a votar
 * (`fn_votacao_opcoes_resultados`, migration 20261116210000). A opção que
 * venceu em destaque, com o «como funciona» dela, e as barras de cada opção
 * com votos e %. Sai só a contagem: em quem cada um votou não aparece.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, PartyPopper, Trophy, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apurar, type OpcaoDaVotacao } from './opcoes';

interface Props {
  titulo: string;
  pergunta: string;
  opcoes: readonly OpcaoDaVotacao[];
  contagem: Record<string, number>;
  votaram: number;
  eleitores: number;
  onFechar: () => void;
}

const fmtPct = (n: number) => `${Math.round(n)}%`;

export function CardResultadoVotacao({ titulo, pergunta, opcoes, contagem, votaram, eleitores, onFechar }: Props) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFechar]);

  const linhas = apurar(opcoes, contagem).sort((a, b) => b.votos - a.votos);
  const maior = linhas[0]?.votos ?? 0;
  const vencedoras = linhas.filter(l => l.votos === maior && maior > 0);
  const empate = vencedoras.length > 1;
  const vencedora = !empate ? vencedoras[0] ?? null : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="resultado-votacao-titulo"
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm print:hidden sm:items-center"
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <motion.article
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-2xl">

        <button type="button" onClick={onFechar} aria-label="Fechar"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/80 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        {/* Cabeça: a vencedora. */}
        <header className="relative bg-primary/10 px-6 pb-6 pt-7 text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Trophy className="h-4 w-4" /> Resultado · {titulo}
          </p>

          {vencedora ? (
            <>
              <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 12 }}
                className="mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full bg-card text-[4.5rem] leading-none shadow-lg ring-4 ring-primary/30"
                aria-hidden="true">
                {vencedora.opcao.emoji || '⭐'}
              </motion.div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">A escolha da galera foi</p>
              <h2 id="resultado-votacao-titulo" className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl">
                {vencedora.opcao.titulo}
              </h2>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                <PartyPopper className="h-4 w-4" /> {vencedora.votos} votos · {fmtPct(vencedora.pct)}
              </p>
            </>
          ) : (
            <>
              <h2 id="resultado-votacao-titulo" className="mt-4 text-3xl font-extrabold leading-tight">
                {empate ? 'Deu empate!' : 'Sem votos'}
              </h2>
              {pergunta && <p className="mt-2 text-[15px] text-muted-foreground">{pergunta}</p>}
            </>
          )}
        </header>

        <div className="space-y-6 px-6 py-6">
          {vencedora && vencedora.opcao.detalhes.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como vai ser</p>
              <ul className="space-y-2">
                {vencedora.opcao.detalhes.map((d, j) => (
                  <li key={`${j}-${d}`} className="flex items-start gap-2.5 text-[15px] leading-snug">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placar</p>
            <ul className="space-y-3">
              {linhas.map((l, i) => {
                const ganhou = l.votos === maior && maior > 0;
                return (
                  <li key={l.opcao.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-[15px]">
                      <span className={cn('min-w-0 truncate', ganhou ? 'font-bold' : 'text-muted-foreground')}>
                        <span aria-hidden="true">{l.opcao.emoji} </span>{l.opcao.titulo}
                      </span>
                      <span className={cn('shrink-0 tabular-nums', ganhou ? 'font-bold' : 'text-muted-foreground')}>
                        {l.votos} · {fmtPct(l.pct)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${l.pct}%` }}
                        transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                        className={cn('h-full rounded-full', ganhou ? 'bg-primary' : 'bg-muted-foreground/40')} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {votaram} de {eleitores} pessoas votaram. Obrigado a todos!
            </p>
          </section>

          <Button size="lg" className="h-12 w-full text-base" onClick={onFechar}>
            {vencedora ? 'Bora! 🎉' : 'Fechar'}
          </Button>
        </div>
      </motion.article>
    </div>,
    document.body,
  );
}
