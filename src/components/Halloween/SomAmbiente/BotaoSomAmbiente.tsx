/**
 * BotaoSomAmbiente — o fone ao lado do sino.
 *
 * Parte do tema de Halloween: o `Layout` só o monta quando o tema está
 * liberado para a pessoa (`useHalloween().disponivel`). Desmontado, o motor
 * para a música sozinho (`soltarSessao`). `completo` (super_admin) decide o
 * player inteiro ou a versão enxuta — ver `motor.ts`.
 *
 * Fica no pacote de entrada só o botão, o card e o motor (pequenos). O painel
 * desce quando alguém abre, e cada música só quando toca — ver
 * `pacoteDeEntrada.test.ts`.
 *
 * Tocando, o ícone vira três barrinhas de equalizador: dá para saber de longe
 * que o som é daqui, e não de outra aba. E quando a música muda com o painel
 * fechado (acabou e veio a próxima, ou começou sozinha ao entrar), um card
 * «Tocando agora» aparece logo abaixo do botão por alguns segundos.
 *
 * Só quando começa uma música NOVA. Cada tela do sistema monta o `Layout` de
 * novo, e este botão junto — por isso a memória do que já foi anunciado mora
 * em `anuncio.ts`, e não aqui.
 */
import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PainelSobDemanda } from '@/components/PainelSobDemanda';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { cn } from '@/lib/utils';
import { dentroDoPalco, iniciarSessao, soltarSessao, useSomAmbiente } from './motor';
import { infoDaFaixa } from './faixas';
import { Equalizador } from './Equalizador';
import { anunciarSeNova } from './anuncio';

const carregarPainel = comNovaTentativa(() => import('./PainelSomAmbiente'));
const PainelSomAmbiente = lazy(() => carregarPainel().then(m => ({ default: m.PainelSomAmbiente })));

/** Quanto o card «Tocando agora» fica na tela. */
export const DURACAO_CARD_MS = 5000;

export function BotaoSomAmbiente({ perfilId, completo = false }: {
  perfilId: string | null | undefined;
  /** Player inteiro (super_admin). Os demais ficam com a versão enxuta. */
  completo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { estado, silenciado, noAr, prefs } = useSomAmbiente();
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!perfilId) return;
    iniciarSessao(perfilId, completo);
    return () => soltarSessao(perfilId);
  }, [perfilId, completo]);

  const tocando = estado === 'tocando' && !silenciado;
  const esperando = estado === 'aguardando';

  // ── «Tocando agora» ──
  // Anuncia cada música uma vez, quando ela de fato começa. Com o painel
  // aberto a troca já está à vista: só marca como anunciada.
  const [anuncio, setAnuncio] = useState<string | null>(null);
  useEffect(() => {
    if (anunciarSeNova(noAr, tocando) && !aberto) setAnuncio(noAr);
  }, [tocando, noAr, aberto]);
  useEffect(() => { if (aberto) setAnuncio(null); }, [aberto]);
  const sumir = useCallback(() => setAnuncio(null), []);
  const abrirPainel = useCallback(() => { setAnuncio(null); setAberto(true); }, []);

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            ref={botao}
            variant="ghost"
            size="icon"
            className={cn(
              'w-8 h-8 relative',
              tocando ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            title={tocando ? 'Som ambiente — tocando' : 'Som ambiente'}
            aria-label={tocando ? 'Som ambiente, tocando' : 'Som ambiente'}
            data-som-ambiente-botao
          >
            {tocando ? <Equalizador /> : <Headphones className="w-4 h-4" />}
            {esperando && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn('max-w-[calc(100vw-16px)] p-0 overflow-hidden', completo ? 'w-[340px]' : 'w-[300px]')}
          // O player do Spotify/YouTube mora fora do painel (ver `motor.ts`):
          // clicar nele não pode fechar o painel.
          onInteractOutside={e => { if (dentroDoPalco(e.target)) e.preventDefault(); }}
        >
          <PainelSobDemanda aberto={aberto} nome="Som ambiente">
            <PainelSomAmbiente />
          </PainelSobDemanda>
        </PopoverContent>
      </Popover>
      <CardTocandoAgora
        faixa={anuncio}
        playlists={prefs.playlists}
        ancora={botao}
        aoAbrir={abrirPainel}
        aoSumir={sumir}
      />
    </>
  );
}

/**
 * O card logo abaixo do fone. Mora num portal com posição fixa, calculada pelo
 * botão: o header corta o que sai dele. Parar o mouse em cima segura o card.
 */
function CardTocandoAgora({ faixa, playlists, ancora, aoAbrir, aoSumir }: {
  faixa: string | null;
  playlists: Parameters<typeof infoDaFaixa>[1];
  ancora: React.RefObject<HTMLButtonElement>;
  aoAbrir: () => void;
  aoSumir: () => void;
}) {
  const reduzir = useReducedMotion();
  const [segurando, setSegurando] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!faixa) return;
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 10, right: Math.max(8, window.innerWidth - r.right - 8) });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [faixa, ancora]);

  useEffect(() => {
    if (!faixa || segurando) return;
    const t = setTimeout(aoSumir, DURACAO_CARD_MS);
    return () => clearTimeout(t);
  }, [faixa, segurando, aoSumir]);

  const info = faixa ? infoDaFaixa(faixa, playlists) : null;

  return createPortal(
    <AnimatePresence>
      {info && pos && (
        <motion.button
          key={faixa}
          type="button"
          onClick={aoAbrir}
          onMouseEnter={() => setSegurando(true)}
          onMouseLeave={() => setSegurando(false)}
          onFocus={() => setSegurando(true)}
          onBlur={() => setSegurando(false)}
          data-som-tocando-agora
          className={cn(
            'fixed z-[70] flex w-[280px] max-w-[calc(100vw-16px)] items-center gap-3 rounded-2xl border border-border',
            'bg-popover p-3 pr-4 text-left text-popover-foreground shadow-lg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            info.tom,
          )}
          style={{ top: pos.top, right: pos.right }}
          initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
          animate={reduzir ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          aria-label={`Tocando agora: ${info.nome}, ${info.descricao}. Abrir o Som ambiente`}
        >
          {/* A ponta que aponta para o fone. */}
          <span
            aria-hidden
            className="absolute -top-[6px] right-[18px] h-3 w-3 rotate-45 border-l border-t border-border bg-popover"
          />
          <span className="som-icone flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Equalizador />
          </span>
          <span className="min-w-0" role="status" aria-live="polite">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tocando agora</span>
            <span className="block truncate text-sm font-semibold leading-tight">{info.nome}</span>
            <span className="block truncate text-xs text-muted-foreground">{info.descricao}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}
