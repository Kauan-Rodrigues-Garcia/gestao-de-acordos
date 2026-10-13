/**
 * BotaoSomAmbiente — o fone ao lado do sino, que vira o visor da música.
 *
 * Parte do tema de Halloween: o `Layout` só o monta quando o tema está
 * liberado para a pessoa (`useHalloween().disponivel`). Desmontado, o motor
 * para a música sozinho (`soltarSessao`). `completo` (super_admin) decide o
 * player inteiro ou a versão enxuta — ver `motor.ts`.
 *
 * Fica no pacote de entrada só o botão e o motor (pequenos). O painel desce
 * quando alguém abre, e cada música só quando toca — ver
 * `pacoteDeEntrada.test.ts`.
 *
 * ## O visor (13/10/2026)
 *
 * Sem música, é o fone de sempre. Tocando, ele se expande numa pílula na cor
 * da capa: a capa vira um disco que gira enquanto toca (e para quando pausa),
 * com o nome, o autor e anterior / pausar / próxima sempre à mostra. Clicar em
 * qualquer outro ponto abre o painel.
 *
 * Pausou, o visor NÃO some: fica `PAUSA_MS` à espera. Passado o prazo sem
 * voltar a tocar, ele se recolhe de volta no fone. O prazo não corre enquanto o
 * mouse está em cima ou o painel está aberto — ninguém quer ver o botão
 * encolher debaixo do cursor.
 *
 * Substitui o card «Tocando agora» que descia do fone quando a música mudava:
 * o visor já diz o que está tocando, o tempo todo.
 */
import { lazy, useEffect, useRef, useState } from 'react';
import { Headphones, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PainelSobDemanda } from '@/components/PainelSobDemanda';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { cn } from '@/lib/utils';
import { alternar, dentroDoPalco, iniciarSessao, pular, soltarSessao, useSomAmbiente } from './motor';
import { estiloDaFaixa, infoDaFaixa } from './faixas';
import { CapaFaixa } from './CapaFaixa';
import { Equalizador } from './Equalizador';
import './somAmbiente.css';

const carregarPainel = comNovaTentativa(() => import('./PainelSomAmbiente'));
const PainelSomAmbiente = lazy(() => carregarPainel().then(m => ({ default: m.PainelSomAmbiente })));

/** Quanto o visor espera, pausado, antes de voltar a ser o fone. */
export const PAUSA_MS = 8000;

export function BotaoSomAmbiente({ perfilId, completo = false }: {
  perfilId: string | null | undefined;
  /** Player inteiro (super_admin). Os demais ficam com a versão enxuta. */
  completo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [sobre, setSobre] = useState(false);
  const { estado, silenciado, noAr, prefs } = useSomAmbiente();

  useEffect(() => {
    if (!perfilId) return;
    iniciarSessao(perfilId, completo);
    return () => soltarSessao(perfilId);
  }, [perfilId, completo]);

  const tocando = estado === 'tocando' && !silenciado;
  const esperando = estado === 'aguardando';
  // Carregando conta como «no ar»: o visor abre junto do clique no play, e não
  // meio segundo depois, quando o som começa.
  const noArAgora = tocando || estado === 'carregando';
  // Pausa de verdade, ou pausa da mensagem de outubro: o visor espera as duas.
  const pausado = estado === 'pausado' || (silenciado && estado === 'tocando');

  // ── Quando o visor está aberto ──
  const [expandido, setExpandido] = useState(noArAgora);
  const segurar = aberto || sobre;
  useEffect(() => {
    if (noArAgora) { setExpandido(true); return; }
    if (!expandido) return;
    // Parou ou deu erro: recolhe já. Pausou: espera o prazo.
    if (!pausado) { setExpandido(false); return; }
    if (segurar) return;
    const t = setTimeout(() => setExpandido(false), PAUSA_MS);
    return () => clearTimeout(t);
  }, [noArAgora, pausado, segurar, expandido]);

  const faixa = noAr ?? prefs.faixa;
  const info = infoDaFaixa(faixa, prefs.playlists);
  const aparece = expandido && !!info;

  const rotulo = aparece
    ? `Som ambiente, ${tocando ? 'tocando' : 'pausado'}: ${info.nome}, ${info.descricao}. Abrir o painel`
    : tocando ? 'Som ambiente, tocando' : 'Som ambiente';

  const caixa = useRef<HTMLDivElement>(null);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <div
        ref={caixa}
        role="group"
        aria-label="Som ambiente"
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        className={cn(
          'som-cores som-visor relative shrink-0 overflow-hidden rounded-full',
          aparece ? 'som-visor-aberto h-10 w-[248px] max-w-[calc(100vw-8.5rem)]' : 'h-8 w-8',
        )}
        style={aparece && info ? estiloDaFaixa(info) as React.CSSProperties : undefined}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'absolute inset-0 flex items-center rounded-full text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              aparece ? 'text-white' : (tocando ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'),
            )}
            title={aparece ? undefined : (tocando ? 'Som ambiente — tocando' : 'Som ambiente')}
            aria-label={rotulo}
            data-som-ambiente-botao
          >
            {/* O fone: centrado nos 32 px, some quando o visor abre. */}
            <span
              className={cn(
                'som-visor-fone absolute left-0 top-0 flex h-8 w-8 items-center justify-center',
                aparece && 'opacity-0',
              )}
              aria-hidden
            >
              {tocando ? <Equalizador /> : <Headphones className="h-4 w-4" />}
              {esperando && !aparece && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-primary" />
              )}
            </span>

            {/* O visor: o disco, o nome e o autor. A direita fica livre para
                os controles, que moram por cima. */}
            {info && (
              <span
                className={cn(
                  'som-visor-info flex min-w-0 flex-1 items-center gap-2.5 pl-1 pr-[92px]',
                  aparece ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
                aria-hidden
              >
                <span className="som-disco" data-pausado={noArAgora ? undefined : ''}>
                  <CapaFaixa info={info} className="h-8 w-8 rounded-full" icone="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[12.5px] font-semibold leading-none">{info.nome}</span>
                  <span className="truncate text-[10.5px] leading-none text-white/65">{info.descricao}</span>
                </span>
              </span>
            )}
          </button>
        </PopoverTrigger>

        {/* Os controles ficam POR CIMA do botão, não dentro: botão dentro de
            botão não é HTML válido. Só existem com o visor aberto. */}
        {aparece && (
          <span
            className="absolute inset-y-0 right-2 flex items-center gap-0.5"
          >
            <button
              type="button" className="som-visor-botao h-6 w-6"
              onClick={() => pular(-1)} aria-label="Faixa anterior" title="Faixa anterior"
            >
              <SkipBack className="h-3.5 w-3.5 fill-current" />
            </button>
            <button
              type="button" className="som-visor-botao som-visor-play h-7 w-7"
              onClick={alternar}
              aria-label={tocando || estado === 'carregando' ? 'Pausar' : 'Tocar'}
              title={tocando || estado === 'carregando' ? 'Pausar' : 'Tocar'}
            >
              {tocando || estado === 'carregando'
                ? <Pause className="h-3.5 w-3.5 fill-current" />
                : <Play className="h-3.5 w-3.5 translate-x-px fill-current" />}
            </button>
            <button
              type="button" className="som-visor-botao h-6 w-6"
              onClick={() => pular(1)} aria-label="Próxima faixa" title="Próxima faixa"
            >
              <SkipForward className="h-3.5 w-3.5 fill-current" />
            </button>
          </span>
        )}
      </div>

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
  );
}
