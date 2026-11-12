/**
 * CardDaVotacao — o aviso no canto inferior esquerdo (pedido de 04/11/2026),
 * no jeito de pesquisa: um cartão pequeno com o convite e o botão.
 *
 *   votar      a votação abriu e a pessoa ainda não votou → «Votar agora»
 *   resultado  a diretoria liberou o resultado → «Ver resultado»
 *   apurar     (só a diretoria, 09/11/2026) a votação encerrou e falta decidir
 *              os empates e liberar → «Abrir a apuração»
 *
 * Minimiza numa pílula (fica no canto até votar). O de resultado dá para
 * dispensar. Só apresentação: quem decide quando aparece é `AvisoVotacao`.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Scale, Trophy, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { textosDo, type TipoDaVotacao } from './textos';

export type TipoDoCard = 'votar' | 'resultado' | 'apurar';

const TEXTOS: Record<TipoDoCard, { pilula: string; titulo: string; texto: string; botao: string; emoji: string }> = {
  votar: { pilula: 'Votação da Liderança', titulo: 'Sua vez de votar!', emoji: '🗳️', botao: 'Votar agora',
    texto: ': escolha o líder que mais combina com cada categoria. Leva poucos minutos e o voto é secreto.' },
  resultado: { pilula: 'Saiu o resultado', titulo: 'Saiu o resultado!', emoji: '🏆', botao: 'Ver resultado',
    texto: ': veja quem levou cada categoria.' },
  apurar: { pilula: 'Apuração pendente', titulo: 'Falta liberar o resultado', emoji: '⚖️', botao: 'Abrir a apuração',
    texto: ': a votação encerrou. Decida os empates e libere o resultado para os líderes.' },
};

interface Props {
  tipo: TipoDoCard;
  titulo: string;
  minimizado: boolean;
  onAbrir: () => void;
  onMinimizar: () => void;
  onExpandir: () => void;
  /** Só no de resultado: some até sair outro. */
  onDispensar?: () => void;
  /** Recuo do menu lateral (px), como o dock de autorizações. */
  recuoEsquerda?: number;
  /**
   * App do celular (11/11/2026): quanto subir o card, em px, acima de uma barra
   * fixa embaixo (as abas da equipe/setor). Presente = conta também a margem
   * segura do iPhone, como a bolha do chat.
   */
  acimaDoRodape?: number;
  demo?: boolean;
  /** 12/11/2026: liderança (padrão) ou gerentes. */
  tipoDaVotacao?: TipoDaVotacao;
}

export function CardDaVotacao({ tipo, titulo, minimizado, onAbrir, onMinimizar, onExpandir, onDispensar, recuoEsquerda = 16, acimaDoRodape, demo, tipoDaVotacao = 'lideranca' }: Props) {
  const votar = tipo === 'votar';
  const tv = textosDo(tipoDaVotacao);
  const base = TEXTOS[tipo];
  // Os textos foram escritos para a liderança; na dos gerentes trocam as palavras.
  const t = tipoDaVotacao === 'lideranca' ? base : {
    ...base,
    pilula: tipo === 'votar' ? tv.nome : base.pilula,
    texto: base.texto.replace('o líder', `o ${tv.pessoa}`).replace('para os líderes', 'para todos'),
  };
  const Icone = tipo === 'votar' ? Vote : tipo === 'apurar' ? Scale : Trophy;
  return (
    <div className="fixed bottom-4 left-4 z-[45] print:hidden md:left-[var(--recuo-votacao)]"
      style={{
        '--recuo-votacao': `${recuoEsquerda}px`,
        ...(acimaDoRodape !== undefined ? { bottom: `calc(env(safe-area-inset-bottom) + ${16 + acimaDoRodape}px)` } : {}),
      } as React.CSSProperties}>
      <AnimatePresence mode="wait">
        {minimizado ? (
          <motion.button key="pilula" type="button" onClick={onExpandir}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="flex items-center gap-2.5 rounded-full border border-primary/40 bg-card py-2.5 pl-3 pr-4 text-[15px] font-semibold shadow-xl hover:border-primary">
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
              <Icone className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden="true" />
            </span>
            {t.pilula}
          </motion.button>
        ) : (
          <motion.section key="card" role="dialog" aria-labelledby="vl-card-titulo"
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            // Tela estreita: sobra o canto direito para a bolha do chat (bottom-6 right-6, 56 px).
            className="w-[min(calc(100vw-7rem),390px)] overflow-hidden rounded-2xl border bg-card shadow-2xl md:w-[390px]">
            <div className={cn('h-2', tipo === 'resultado' ? 'bg-warning' : 'bg-primary')} aria-hidden="true" />
            <div className="relative p-5">
              <div className="absolute right-2.5 top-2.5 flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMinimizar} aria-label="Minimizar"><ChevronDown className="h-5 w-5" /></Button>
                {!votar && onDispensar && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDispensar} aria-label="Dispensar"><X className="h-5 w-5" /></Button>
                )}
              </div>
              <div className="flex items-start gap-3.5 pr-14">
                {/* Pulsa três vezes e para: o card fica em todas as telas enquanto a
                    votação está aberta, e animação infinita pesa no PC fraco (09/11/2026). */}
                <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: 2, duration: 2.4 }}
                  className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl', tipo === 'resultado' ? 'bg-warning/15' : 'bg-primary/15')} aria-hidden="true">
                  {t.emoji}
                </motion.span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {tv.nome}{demo ? ' · demonstração' : ''}
                  </p>
                  <h3 id="vl-card-titulo" className="mt-0.5 text-xl font-bold leading-tight">{t.titulo}</h3>
                </div>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{titulo}</strong>
                {t.texto}
              </p>
              <Button size="lg" className="mt-4 h-12 w-full gap-2 text-base" onClick={onAbrir}>
                <Icone className="h-5 w-5" /> {t.botao}
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
