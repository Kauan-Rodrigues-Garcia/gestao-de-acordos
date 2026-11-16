/**
 * TelaVotacaoOpcoes — a tela de votar (16/11/2026): a pergunta e as opções
 * lado a lado, cada uma com a foto (ou o emoji, enquanto não há foto), o
 * resumo, «como funciona» e os itens (os prêmios).
 *
 * Toque em uma opção → a barra de baixo pede para confirmar → voto registrado.
 * Depois de confirmado o voto não muda (o banco recusa o segundo).
 *
 * `onVotar` ausente = demonstração: nada vai para o banco.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Clock, Loader2, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OpcaoDaVotacao } from './opcoes';

interface Props {
  titulo: string;
  pergunta: string;
  opcoes: readonly OpcaoDaVotacao[];
  /** Já votou: abre direto no «voto registrado». */
  meuVoto?: string | null;
  onVotar?: (opcaoId: string) => Promise<void>;
  onFechar: () => void;
  /** Rótulo do botão de fechar antes de votar. */
  rotuloFechar?: string;
  demo?: boolean;
}

/** Cor de fundo do espaço da foto, por posição (tokens do tema, sem degradê). */
const FUNDOS = ['bg-primary/10', 'bg-warning/15', 'bg-success/10', 'bg-info/10', 'bg-muted', 'bg-primary/5'];

function CartaoOpcao({ opcao, indice, escolhida, travada, onEscolher }: {
  opcao: OpcaoDaVotacao; indice: number; escolhida: boolean; travada: boolean; onEscolher: () => void;
}) {
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-sm transition-[border-color,box-shadow,transform]',
        escolhida ? 'border-primary shadow-lg ring-4 ring-primary/15' : 'border-border',
        !travada && !escolhida && 'hover:border-primary/50',
      )}
    >
      <button type="button" onClick={onEscolher} disabled={travada} aria-pressed={escolhida}
        aria-label={`Escolher ${opcao.titulo}`}
        className="relative block w-full text-left disabled:cursor-default">
        <div className={cn('relative aspect-[16/9] w-full overflow-hidden', FUNDOS[indice % FUNDOS.length])}>
          {opcao.foto ? (
            <img src={opcao.foto} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[5.5rem] leading-none sm:text-[7rem]" aria-hidden="true">
              {opcao.emoji || '⭐'}
            </span>
          )}
          {escolhida && (
            <span className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Opção {indice + 1}</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold leading-tight sm:text-[1.7rem]">
            {opcao.foto && opcao.emoji && <span aria-hidden="true">{opcao.emoji}</span>}
            {opcao.titulo}
          </h2>
          {opcao.resumo && <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{opcao.resumo}</p>}
        </div>

        {opcao.detalhes.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como funciona</p>
            <ul className="space-y-2">
              {opcao.detalhes.map((d, j) => (
                <li key={`${j}-${d}`} className="flex items-start gap-2.5 text-[15px] leading-snug">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {opcao.itens.length > 0 && (
          <div>
            {opcao.rotuloItens && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{opcao.rotuloItens}</p>}
            <ul className="flex flex-wrap gap-1.5">
              {opcao.itens.map((i, j) => (
                <li key={`${j}-${i}`} className="rounded-full border bg-muted/40 px-2.5 py-1 text-[13px]">{i}</li>
              ))}
            </ul>
          </div>
        )}

        <Button size="lg" variant={escolhida ? 'default' : 'outline'} disabled={travada} onClick={onEscolher}
          className="mt-auto h-12 w-full gap-2 text-base">
          {escolhida ? <><Check className="h-5 w-5" /> Escolhida</> : 'Quero esta'}
        </Button>
      </div>
    </article>
  );
}

export function TelaVotacaoOpcoes({ titulo, pergunta, opcoes, meuVoto, onVotar, onFechar, rotuloFechar = 'Votar mais tarde', demo }: Props) {
  const [escolhida, setEscolhida] = useState<string | null>(meuVoto ?? null);
  const [enviando, setEnviando] = useState(false);
  const [votada, setVotada] = useState<string | null>(meuVoto ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);

  // Esc fecha; a página de trás não rola enquanto a tela está aberta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onFechar(); };
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [onFechar, enviando]);

  const confirmar = async () => {
    if (!escolhida) return;
    setEnviando(true);
    setErro(null);
    try {
      if (onVotar) await onVotar(escolhida);
      setVotada(escolhida);
      rolagem.current?.scrollTo({ top: 0 });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para registrar o voto. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const opcaoVotada = opcoes.find(o => o.id === votada);
  const opcaoEscolhida = opcoes.find(o => o.id === escolhida);
  const colunas = opcoes.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2';

  return createPortal(
    <div ref={rolagem} role="dialog" aria-modal="true" aria-labelledby="vo-pergunta"
      className="fixed inset-0 z-[95] overflow-y-auto bg-background print:hidden">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className={cn('mx-auto w-full max-w-5xl px-4 pt-5 sm:px-8 sm:pt-8', votada ? 'pb-10' : 'pb-32')}>

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Vote className="h-4 w-4" /> {titulo}{demo ? ' · demonstração' : ''}
            </p>
            <h1 id="vo-pergunta" className="mt-2 text-2xl font-bold leading-tight sm:text-4xl">{pergunta || titulo}</h1>
            {!votada && (
              <p className="mt-2 text-[15px] text-muted-foreground">
                Toque na opção que você prefere e confirme. O voto é secreto e vale uma vez só.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onFechar} disabled={enviando} className="shrink-0 gap-1.5">
            {votada ? <><X className="h-4 w-4" /> Fechar</> : <><Clock className="h-4 w-4" /> <span className="hidden sm:inline">{rotuloFechar}</span><span className="sm:hidden">Depois</span></>}
          </Button>
        </header>

        <AnimatePresence>
          {votada && opcaoVotada && (
            <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-success/40 bg-success/10 px-5 py-8 text-center">
              <CheckCircle2 className="h-14 w-14 text-success" />
              <h2 className="text-2xl font-bold">Voto registrado!</h2>
              <p className="max-w-md text-[15px] text-muted-foreground">
                Você escolheu <strong className="text-foreground">{opcaoVotada.emoji} {opcaoVotada.titulo}</strong>. Obrigado por participar!
              </p>
              <Button size="lg" className="mt-2 h-12 min-w-[12rem] text-base" onClick={onFechar}>Fechar</Button>
            </motion.section>
          )}
        </AnimatePresence>

        <div className={cn('mt-6 grid gap-5 sm:gap-6', colunas)}>
          {opcoes.map((o, i) => (
            <CartaoOpcao key={o.id} opcao={o} indice={i} escolhida={escolhida === o.id} travada={!!votada || enviando}
              onEscolher={() => { setEscolhida(o.id); setErro(null); }} />
          ))}
        </div>
      </motion.div>

      {/* Confirmar: presa no pé enquanto não votou. */}
      {!votada && (
        <div className="fixed inset-x-0 bottom-0 z-[96] border-t bg-card px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] sm:px-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-[15px]" aria-live="polite">
              {erro ? <span className="font-medium text-destructive">{erro}</span>
                : opcaoEscolhida ? <>Você escolheu <strong>{opcaoEscolhida.emoji} {opcaoEscolhida.titulo}</strong></>
                : <span className="text-muted-foreground">Escolha uma das opções acima.</span>}
            </p>
            <Button size="lg" className="h-12 min-w-[12rem] gap-2 text-base" disabled={!escolhida || enviando} onClick={() => { void confirmar(); }}>
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Vote className="h-5 w-5" />}
              Confirmar voto
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
