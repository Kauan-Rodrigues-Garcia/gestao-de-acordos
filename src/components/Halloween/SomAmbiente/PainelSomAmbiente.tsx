/**
 * PainelSomAmbiente — o que abre ao clicar no fone do header.
 *
 * De cima para baixo: o que está tocando e os controles, o volume, o seletor
 * de faixas (`SeletorFaixas`: abas «Temas» e «Músicas», em páginas) e o
 * «Tocar ao entrar».
 *
 * Duas versões, decididas pelo motor (`completo`):
 *   - super_admin: tudo acima, mais a aba «YouTube»: busca qualquer música no
 *     YouTube (`youtube.ts`), toca e guarda na lista da pessoa; volume de 0 a 100;
 *   - os demais: enxuta — só as de fábrica, sem a aba «YouTube» (não dá para
 *     buscar nem adicionar música) e volume de 0 a 50.
 *
 * Mora com o tema de Halloween e só aparece quando o tema está liberado para
 * a pessoa (`useHalloween().disponivel`, no `Layout`). Tudo que muda aqui vai
 * para o motor; o painel não guarda estado de som — fechar e abrir de novo
 * mostra o mesmo que está tocando.
 *
 * Baixa sob demanda (ver `BotaoSomAmbiente`).
 */
import { Fragment, useEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Volume, Volume1, Volume2, VolumeX, X, Loader2,
  Ghost, ListEnd, ListPlus, Music, Pin, PinOff, Radio, Search, Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { chaveDoLink, lerLink } from './links';
import { ErroBusca, buscaConfigurada, buscarMusicas, urlDoVideo, type ResultadoYoutube } from './youtube';
import {
  ALTURA_PALCO, adicionarNaFila, alternar, ancorarPalco, buscar, definirRepetir, definirTocarAoEntrar, definirVideoFixo, definirVolume,
  escolher, limparFila, progresso, pular, salvarPlaylists, useSomAmbiente,
} from './motor';
import {
  GENEROS, GENERO_DA_MUSICA, LIMITE_PLAYLISTS, MUSICAS, RADIO, TEMAS_DE_TERROR, VOLUME_PADRAO, ehEmbutida,
  type Genero, type Musica, type PlaylistSalva,
} from './preferencias';
import { EMBUTIDAS, estiloDaFaixa, infoDaFaixa, infoDaPlaylist, type InfoFaixa } from './faixas';
import { posicao } from './radio/conta';
import { agoraBanco, useRadio } from './radio/radio';
import { PainelRadio } from './radio/PainelRadio';
import { CapaFaixa } from './CapaFaixa';
import { Equalizador } from './Equalizador';
import { marcarPontas } from '@/lib/rolagemLateral';
import './somAmbiente.css';

const mmss = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function PainelSomAmbiente() {
  const { estado, prefs, silenciado, noAr, playerAberto, completo, volumeMax, erro, fila = [] } = useSomAmbiente();
  const escolhida = prefs.faixa;
  const radio = useRadio();
  const naRadio = escolhida === RADIO;
  const info = infoDaFaixa(escolhida, prefs.playlists, radio.estado?.atual) ?? EMBUTIDAS.halloween;
  const tocando = estado === 'tocando' && !silenciado;
  const carregando = estado === 'carregando';
  const externa = !ehEmbutida(escolhida);
  const spotify = externa && escolhida.startsWith('spotify:');

  // O espaço do player externo. O iframe não mora aqui (ver `motor.ts`): o
  // motor o encaixa por cima deste retângulo enquanto o painel está aberto.
  const palco = useRef<HTMLDivElement>(null);
  // YouTube e Spotify mostram o player com o painel aberto — o vídeo voltou a
  // aparecer a pedido do Cleber (30/10/2026); de 13/10 até então ele ficava
  // escondido, tocando só o som. A rádio segue só com o som: o vídeo dela só
  // aparece se o navegador recusar o autoplay, para a pessoa apertar o play.
  const mostrarPalco = externa && noAr === escolhida && playerAberto
    && (!naRadio || estado === 'aguardando');
  useEffect(() => {
    ancorarPalco(mostrarPalco ? palco.current : null);
    return () => ancorarPalco(null);
  }, [mostrarPalco]);

  // Volume antes de silenciar, para o botão de mudo devolver.
  const antesDoMudo = useRef(prefs.volume || VOLUME_PADRAO);
  const alternarMudo = () => {
    if (prefs.volume > 0) {
      antesDoMudo.current = prefs.volume;
      definirVolume(0);
    } else {
      definirVolume(antesDoMudo.current || VOLUME_PADRAO);
    }
  };
  const fracao = prefs.volume / volumeMax;
  const IconeVolume = prefs.volume === 0 ? VolumeX : fracao < 0.34 ? Volume : fracao < 0.67 ? Volume1 : Volume2;

  // Tocando, a linha de estado só confirma: o nome e o artista já estão acima.
  const legenda = silenciado
    ? 'Pausado enquanto a mensagem de outubro toca'
    : estado === 'erro' && erro ? erro
    : naRadio && radio.fase === 'desligada' ? 'Rádio desligada · começa sozinha quando ligarem'
    : carregando ? (naRadio ? 'Sintonizando a rádio…' : externa ? 'Abrindo o player…' : 'Carregando a música…')
    : estado === 'aguardando' ? (mostrarPalco ? 'Aperte o play no player abaixo' : 'Começa no seu próximo clique na tela')
    : tocando ? (naRadio ? 'Ao vivo' : 'Tocando')
    : estado === 'pausado' ? (naRadio ? 'Pausado · ao voltar, entra no ponto de todo mundo' : 'Pausado')
    : 'Aperte o play para começar';

  const tipo = naRadio ? (radio.fase === 'desligada' ? 'Rádio · desligada' : 'Rádio ao vivo')
    : externa ? (spotify ? 'Playlist do Spotify' : 'Do YouTube')
    : (TEMAS_DE_TERROR as readonly string[]).includes(escolhida) ? 'Tema de terror' : 'Música';

  /*
   * A altura é a que o Popover diz que cabe (`--radix-popover-content-available-
   * height`), não `100vh − 80px`: com zoom alto no navegador a tela útil fica
   * com 200–300 px, e o painel cortava embaixo — o volume sumia sem jeito de
   * alcançar (14/10/2026). Quando nem o «Tocando agora» cabe, o painel INTEIRO
   * rola (`data-som-rolagem`, que o motor usa para recortar o player externo).
   *
   * Uma rolagem só (Cleber, 14/10/2026: eram duas, a do meio e a da lista): o
   * meio não rola, quem encolhe e rola é a lista de músicas. Os resultados da
   * busca do YouTube entram nessa mesma lista. O painel inteiro só rola quando
   * nem a lista no mínimo cabe (zoom alto).
   */
  return (
    <div
      data-som-rolagem
      className="flex max-h-[min(660px,var(--radix-popover-content-available-height,calc(100vh-80px)))] flex-col overflow-y-auto overscroll-contain"
    >
      {/* ── Tocando agora: a capa do disco, na cor dela ── */}
      <section
        aria-label="Tocando agora"
        className="som-cores som-heroi relative shrink-0 px-4 pb-4 pt-3.5"
        style={estiloDaFaixa(info) as CSSProperties}
      >
        {info.capa && (
          <img key={info.capa} src={info.capa} alt="" aria-hidden decoding="async" className="som-heroi-aura" />
        )}

        <p className="som-heroi-fraco text-[10px] font-semibold uppercase tracking-[0.16em]">{tipo}</p>

        <div className="mt-2.5 flex items-center gap-3.5">
          <CapaFaixa info={info} className="som-capa-grande h-[72px] w-[72px] rounded-lg" icone="h-7 w-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug tracking-[-0.01em]">{info.nome}</p>
            <p className="som-heroi-suave truncate text-[12.5px] leading-snug">{info.descricao}</p>
            <p
              className={cn(
                'mt-1.5 flex items-center gap-1.5 truncate text-[11px]',
                estado === 'erro' ? 'text-red-300' : 'som-heroi-fraco',
              )}
              aria-live="polite"
            >
              {tocando && <Equalizador className="shrink-0 text-[color:var(--som-destaque)]" />}
              <span className="truncate">{legenda}</span>
            </p>
          </div>
        </div>

        {!externa && <BarraProgresso ativa={noAr === escolhida && estado !== 'parado'} />}
        {naRadio && <BarraRadio />}

        {/* O play fica no centro: «Repetir» de um lado, a mesma largura vazia do outro. */}
        <div className={cn('grid grid-cols-[36px_1fr_36px] items-center', externa && !naRadio ? 'mt-3' : 'mt-1.5')}>
          <button
            type="button"
            className="som-heroi-botao h-9 w-9"
            onClick={() => definirRepetir(!prefs.repetir)}
            disabled={externa}
            aria-pressed={prefs.repetir}
            aria-label={prefs.repetir ? 'Repetindo esta música' : 'Tocando em sequência'}
            title={prefs.repetir ? 'Repetindo esta música — clique para tocar em sequência' : 'Tocando em sequência — clique para repetir esta música'}
          >
            {prefs.repetir ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button" className="som-heroi-botao h-10 w-10 disabled:opacity-40" onClick={() => pular(-1)}
              aria-label="Faixa anterior" title={naRadio ? 'A rádio não volta' : 'Faixa anterior'} disabled={naRadio}
            >
              <SkipBack className="h-[18px] w-[18px] fill-current" />
            </button>
            <button
              type="button"
              className="som-play h-12 w-12"
              onClick={alternar}
              aria-label={tocando || carregando ? 'Pausar' : 'Tocar'}
              title={tocando || carregando ? 'Pausar' : 'Tocar'}
            >
              {carregando ? <Loader2 className="h-5 w-5 animate-spin" />
                : tocando ? <Pause className="h-5 w-5 fill-current" />
                : <Play className="h-5 w-5 translate-x-px fill-current" />}
            </button>
            <button
              type="button" className="som-heroi-botao h-10 w-10 disabled:opacity-40" onClick={() => pular(1)}
              aria-label={naRadio ? 'Pular a música da rádio' : 'Próxima faixa'}
              title={naRadio ? (radio.controla ? 'Pular — sorteia outra para todo mundo' : 'Só o super admin pula') : 'Próxima faixa'}
              disabled={naRadio && (!radio.controla || radio.ocupada || radio.fase === 'desligada')}
            >
              <SkipForward className="h-[18px] w-[18px] fill-current" />
            </button>
          </div>
          <span aria-hidden />
        </div>

        <div className="mt-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={alternarMudo}
            className="som-heroi-botao h-7 w-7"
            aria-label={prefs.volume === 0 ? 'Tirar do mudo' : 'Deixar mudo'}
            title={prefs.volume === 0 ? 'Tirar do mudo' : 'Deixar mudo'}
          >
            <IconeVolume className="h-4 w-4" />
          </button>
          <BarraSom
            value={[prefs.volume]}
            min={0}
            max={volumeMax}
            step={1}
            onValueChange={([v]) => definirVolume(v)}
            rotulo={volumeMax < 100 ? `Volume, até ${volumeMax}%` : 'Volume'}
            className="flex-1"
          />
          <span
            className="som-heroi-fraco w-8 text-right text-[11px] tabular-nums"
            title={volumeMax < 100 ? `Máximo de ${volumeMax}%` : undefined}
          >
            {prefs.volume}%
          </span>
        </div>
        {spotify && (
          <p className="som-heroi-fraco mt-1.5 text-[11px]">
            O Spotify não deixa outro site mexer no volume: use o do computador.
          </p>
        )}
      </section>

      {mostrarPalco && (
        <div className="shrink-0 px-4 pb-3">
          <div
            ref={palco}
            className="rounded-xl bg-muted"
            style={{ height: ALTURA_PALCO }}
            aria-hidden
          />
          {/* Fixo, o vídeo continua num quadrinho no canto ao fechar o painel. */}
          <button
            type="button"
            onClick={() => definirVideoFixo(!prefs.videoFixo)}
            aria-pressed={prefs.videoFixo}
            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={prefs.videoFixo
              ? 'O vídeo fica no canto da tela ao fechar o player — clique para soltar'
              : 'Deixar o vídeo no canto da tela mesmo com o player fechado'}
          >
            {prefs.videoFixo ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {prefs.videoFixo ? 'Vídeo fixo na tela — soltar' : 'Fixar vídeo na tela'}
          </button>
        </div>
      )}

      {/* O meio não rola: a lista dentro dele é que encolhe e rola. */}
      <SeletorFaixas
        escolhida={escolhida}
        fila={fila}
        noAr={tocando ? noAr : null}
        playlists={completo ? prefs.playlists : null}
        comRadio={completo}
      />

      <label
        className="flex shrink-0 cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-2.5"
        title="Começa sozinho, com a última música e volume escolhidos"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium leading-tight">Tocar ao entrar no sistema</span>
          <span className="block truncate text-[11px] text-muted-foreground">Com a última música e volume escolhidos</span>
        </span>
        <Switch checked={prefs.tocarAoEntrar} onCheckedChange={definirTocarAoEntrar} aria-label="Tocar ao entrar no sistema" />
      </label>
    </div>
  );
}

/**
 * Onde a música está, e o arraste para pular. Lê o motor a cada meio segundo
 * só enquanto o painel está aberto — fechado, nada roda.
 */
function BarraProgresso({ ativa }: { ativa: boolean }) {
  const [p, setP] = useState(() => progresso());
  const [arrastando, setArrastando] = useState<number | null>(null);
  useEffect(() => {
    setP(progresso());
    if (!ativa) return;
    const id = setInterval(() => setP(progresso()), 500);
    return () => clearInterval(id);
  }, [ativa]);
  const duracao = p?.duracao ?? 0;
  const atual = arrastando ?? p?.atual ?? 0;
  return (
    <div className="mt-3.5">
      <BarraSom
        value={[duracao ? Math.min(atual, duracao) : 0]}
        min={0}
        max={duracao || 1}
        step={1}
        disabled={!ativa || !duracao}
        onValueChange={([v]) => setArrastando(v)}
        onValueCommit={([v]) => { buscar(v); setArrastando(null); setP(progresso()); }}
        rotulo="Posição na música"
      />
      <div className="som-heroi-fraco mt-0.5 flex justify-between text-[10.5px] tabular-nums">
        <span>{mmss(atual)}</span>
        <span>{duracao ? mmss(duracao) : '–:––'}</span>
      </div>
    </div>
  );
}

/**
 * Onde a música da rádio está. Não arrasta: a rádio é ao vivo, todo mundo no
 * mesmo ponto. Anda de segundo em segundo só com o painel aberto.
 */
function BarraRadio() {
  const { estado } = useRadio();
  const [agora, setAgora] = useState(agoraBanco);
  useEffect(() => {
    const id = setInterval(() => setAgora(agoraBanco()), 1000);
    return () => clearInterval(id);
  }, []);
  const duracao = estado?.atual?.duracao_s ?? 0;
  const atual = posicao(estado, agora);
  return (
    <div className="mt-3.5">
      <BarraSom
        value={[duracao ? Math.min(atual, duracao) : 0]}
        min={0}
        max={duracao || 1}
        step={1}
        disabled
        rotulo="Posição na música da rádio"
      />
      <div className="som-heroi-fraco mt-0.5 flex justify-between text-[10.5px] tabular-nums">
        <span>{mmss(atual)}</span>
        <span>{duracao ? mmss(duracao) : '–:––'}</span>
      </div>
    </div>
  );
}

/**
 * A barra do «Tocando agora» (posição e volume): fina e branca, como num
 * player; o pino aparece ao passar o mouse e o cheio ganha a cor da capa.
 * O `Slider` do sistema é grosso e na cor do tema — destoaria sobre a capa.
 */
function BarraSom({ rotulo, className, ...props }: ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { rotulo: string }) {
  return (
    <SliderPrimitive.Root className={cn('som-barra', className)} {...props}>
      <SliderPrimitive.Track className="som-barra-trilho">
        <SliderPrimitive.Range className="som-barra-cheio" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="som-barra-pino" aria-label={rotulo} />
    </SliderPrimitive.Root>
  );
}

type Aba = 'temas' | 'musicas' | 'playlists' | 'radio';

/**
 * Faixas que aparecem de uma vez; passando disso, a própria lista rola, com a
 * barra dela (14/10/2026 — antes eram páginas de 5, e com 12 músicas eram três).
 */
export const LINHAS_VISIVEIS = 5;

/**
 * Altura da lista com `LINHAS_VISIVEIS` linhas: cada `LinhaFaixa` tem 52 px
 * (capa de 40 px + respiro) e 2 px entre elas (`space-y-0.5`). Meia linha a
 * mais aparece cortada embaixo, para ficar claro que há mais para rolar. Tela
 * baixa: encolhe até duas linhas e meia, nunca some.
 */
const ALTURA_LISTA = 'max-h-[294px] min-h-[134px]';

/**
 * O mínimo do meio (abas, buscas e a lista no mínimo), em px. O meio encolhe
 * até aqui; abaixo disso quem rola é o painel inteiro. Em CSS puro não sai: a
 * coluna flex mede o mínimo pelo conteúdo inteiro da lista, não pelo
 * `min-h` dela. Arredondado para cima — sobrar é melhor que a lista invadir
 * o rodapé.
 */
function minimoDoMeio(temBusca: boolean, youtube: boolean, fila: number, generos = false): number {
  const base = 12 + 36 + 8 + 134 + 8; // respiro, abas, respiro, lista, respiro
  const busca = temBusca ? 40 : 0;
  const yt = youtube ? 40 + 24 + (fila > 0 ? 40 : 0) : 0; // campo, aviso, «Na fila»
  const chips = generos ? 34 : 0; // a fileira dos gêneros
  return base + busca + yt + chips;
}

/** O gênero de uma faixa da aba «Músicas»; `null` para as demais. */
function generoDe(id: string): Genero | null {
  return (MUSICAS as readonly string[]).includes(id) ? GENERO_DA_MUSICA[id as Musica] : null;
}
const ROTULO_GENERO = Object.fromEntries(GENEROS.map((g) => [g.id, g.rotulo])) as Record<Genero, string>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function abaDaFaixa(id: string): Aba {
  if (id === RADIO) return 'radio';
  if ((TEMAS_DE_TERROR as readonly string[]).includes(id)) return 'temas';
  if ((MUSICAS as readonly string[]).includes(id)) return 'musicas';
  return 'playlists';
}

interface ItemDaLista {
  id: string;
  info: InfoFaixa;
  onRemover?: () => void;
}

/**
 * Temas de terror e músicas em abas separadas (e «Playlists», no completo).
 * Na aba «Músicas», as faixas vêm agrupadas pelo gênero, com o título de cada
 * um, e uma fileira de gêneros filtra a lista (16/10/2026).
 * A lista mostra `LINHAS_VISIVEIS` e rola por dentro; passando disso aparece
 * também a busca, por nome ou artista, sem acento. Abre — e volta, a cada
 * troca pelo anterior/próxima — na aba da faixa escolhida, rolada até ela.
 *
 * `playlists`: as da pessoa; `null` na versão enxuta, que não tem a aba.
 */
function SeletorFaixas({ escolhida, noAr, playlists, fila, comRadio = false }: {
  escolhida: string;
  /** Ids na fila, na ordem em que tocam. */
  fila: string[];
  /** O que está tocando de fato (`null` se nada). */
  noAr: string | null;
  playlists: PlaylistSalva[] | null;
  /** A aba «Rádio» (29/10/2026: só o super_admin, para testar). */
  comRadio?: boolean;
}) {
  const listas: Record<Aba, ItemDaLista[]> = {
    temas: TEMAS_DE_TERROR.map(id => ({ id, info: EMBUTIDAS[id] })),
    musicas: MUSICAS.map(id => ({ id, info: EMBUTIDAS[id] })),
    playlists: (playlists ?? []).map(p => ({
      id: p.id,
      info: infoDaPlaylist(p),
      onRemover: () => salvarPlaylists(playlists!.filter(x => x.id !== p.id)),
    })),
    radio: [],
  };
  const abas: { id: Aba; rotulo: string; Icone: typeof Ghost }[] = [
    { id: 'temas', rotulo: 'Temas', Icone: Ghost },
    { id: 'musicas', rotulo: 'Músicas', Icone: Music },
    ...(playlists ? [{ id: 'playlists' as const, rotulo: 'YouTube', Icone: Youtube }] : []),
    ...(comRadio ? [{ id: 'radio' as const, rotulo: 'Rádio', Icone: Radio }] : []),
  ];

  const abaInicial = () => {
    const a = abaDaFaixa(escolhida);
    return (a === 'playlists' && !playlists) || (a === 'radio' && !comRadio) ? 'temas' : a;
  };
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [busca, setBusca] = useState('');
  // O gênero na aba «Músicas» (16/10/2026); `todos` mostra cada gênero com o
  // seu título na lista.
  const [genero, setGenero] = useState<Genero | 'todos'>('todos');
  const lista = useRef<HTMLDivElement>(null);
  // A fileira de gêneros rola arrastando com o mouse e com a roda, como toda
  // fileira do app (`lib/rolagemLateral.ts`); aqui só se marca a ponta apagada
  // ao abrir (depois, a rolagem marca sozinha).
  const fileiraGeneros = useRef<HTMLDivElement>(null);

  // Trocou a faixa (anterior/próxima, ou a sequência andou): vai até ela —
  // e o filtro de gênero solta, se ela é de outro.
  const ultima = useRef(escolhida);
  useEffect(() => {
    if (ultima.current === escolhida) return;
    ultima.current = escolhida;
    setAba(abaInicial());
    setBusca('');
    setGenero((g) => (g === 'todos' || generoDe(escolhida) === g ? g : 'todos'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhida]);

  /*
   * Rola a lista — só ela — até a escolhida, ao abrir, ao trocar de aba ou de
   * faixa e ao limpar a busca. `scrollIntoView` não serve: rolaria também o
   * painel e a página.
   */
  const buscando = busca !== '';
  useEffect(() => {
    const caixa = lista.current;
    if (buscando) return;
    const linha = caixa?.querySelector<HTMLElement>(`[data-faixa="${CSS.escape(escolhida)}"]`);
    if (!caixa || !linha) return;
    const topo = linha.getBoundingClientRect().top - caixa.getBoundingClientRect().top + caixa.scrollTop;
    if (topo < caixa.scrollTop || topo + linha.offsetHeight > caixa.scrollTop + caixa.clientHeight) {
      caixa.scrollTop = Math.max(0, topo - (caixa.clientHeight - linha.offsetHeight) / 2);
    }
  }, [aba, escolhida, buscando, genero]);

  const trocarAba = (a: Aba) => {
    setAba(a);
    setBusca('');
    setGenero('todos');
  };

  const naAbaMusicas = aba === 'musicas';
  useEffect(() => {
    if (naAbaMusicas && fileiraGeneros.current) marcarPontas(fileiraGeneros.current);
  }, [naAbaMusicas]);
  const todos = naAbaMusicas && genero !== 'todos'
    ? listas.musicas.filter(x => generoDe(x.id) === genero)
    : listas[aba];
  const termo = semAcento(busca);
  // A busca também acha pelo gênero («funk», «sertanejo»).
  const filtrados = termo
    ? todos.filter(x => semAcento(`${x.info.nome} ${x.info.descricao} ${ROTULO_GENERO[generoDe(x.id) as Genero] ?? ''}`).includes(termo))
    : todos;
  const temBusca = listas[aba].length > LINHAS_VISIVEIS;
  // Títulos de gênero dentro da lista: só com todos os gêneros à vista.
  const comTitulos = naAbaMusicas && genero === 'todos';

  // A única caixa que rola. Na aba do YouTube, os resultados da busca vêm
  // dentro dela, em cima da lista guardada.
  const caixaDaLista = (topo?: ReactNode) => (
    <div
      ref={lista}
      role="tabpanel"
      className={cn('som-lista mt-2 space-y-0.5 overflow-y-auto overscroll-contain', ALTURA_LISTA)}
    >
      {topo}
      {topo && listas[aba].length > 0 && (
        <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sua lista</p>
      )}
      {filtrados.map((x, i) => {
        const g = comTitulos ? generoDe(x.id) : null;
        const abreGenero = g !== null && (i === 0 || generoDe(filtrados[i - 1].id) !== g);
        return (
          <Fragment key={x.id}>
            {abreGenero && (
              <p className={cn(
                'px-1.5 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
                i === 0 ? 'pt-0.5' : 'pt-2.5',
              )}>
                {ROTULO_GENERO[g]}
              </p>
            )}
            <LinhaFaixa
              id={x.id}
              info={x.info}
              escolhida={escolhida === x.id}
              tocando={noAr === x.id}
              onRemover={x.onRemover}
            />
          </Fragment>
        );
      })}
      {filtrados.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {termo ? <>Nada com «{busca.trim()}».</> : 'Sua lista está vazia. Busque uma música acima.'}
        </p>
      )}
    </div>
  );
  const naAbaYoutube = aba === 'playlists' && !!playlists;
  const naAbaRadio = aba === 'radio' && comRadio;

  return (
    <div
      className="flex min-h-0 flex-col px-3 pb-2 pt-3"
      style={{ minHeight: minimoDoMeio(temBusca && !naAbaRadio, naAbaYoutube, fila.length, naAbaMusicas) }}
    >
      <div role="tablist" aria-label="Tipo de som" className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
        {abas.map(a => {
          const ativa = a.id === aba;
          const temEscolhida = abaDaFaixa(escolhida) === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.id)}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium transition-colors',
                // Com a «Rádio», são quatro abas em 340 px: aperta o respiro.
                abas.length > 3 ? 'gap-1 px-1' : 'gap-1.5 px-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativa ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <a.Icone className="h-3.5 w-3.5" />
              {a.rotulo}
              {a.id !== 'radio' && <span className="tabular-nums opacity-60">{listas[a.id].length}</span>}
              {temEscolhida && !ativa && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" title="A faixa escolhida está aqui" />
              )}
            </button>
          );
        })}
      </div>

      {naAbaMusicas && (
        <div ref={fileiraGeneros} role="radiogroup" aria-label="Gênero" className="som-generos mt-2 flex shrink-0 gap-1 overflow-x-auto pb-0.5">
          {[{ id: 'todos' as const, rotulo: 'Todos' }, ...GENEROS].map(g => {
            const ativo = genero === g.id;
            const qtd = g.id === 'todos' ? listas.musicas.length : listas.musicas.filter(x => generoDe(x.id) === g.id).length;
            const temEscolhida = g.id !== 'todos' && generoDe(escolhida) === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={e => {
                  setGenero(g.id);
                  if (lista.current) lista.current.scrollTop = 0;
                  // O chip escolhido inteiro à vista, sem rolar o painel.
                  e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ativo
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                {g.rotulo}
                <span className="tabular-nums opacity-60">{qtd}</span>
                {temEscolhida && !ativo && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" title="A faixa escolhida está aqui" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {naAbaYoutube && (
        <BuscaYoutube playlists={playlists} escolhida={escolhida} fila={fila} lista={caixaDaLista} />
      )}

      {temBusca && (
        <div className="relative mt-2 shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => { setBusca(e.target.value); if (lista.current) lista.current.scrollTop = 0; }}
            placeholder={aba === 'temas' ? 'Buscar tema' : aba === 'musicas' ? 'Buscar música, artista ou gênero' : 'Filtrar a sua lista'}
            aria-label="Buscar na lista"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {naAbaRadio && (
        <div role="tabpanel" className="som-lista mt-2 max-h-[460px] min-h-[134px] overflow-y-auto overscroll-contain">
          <PainelRadio naRadio={escolhida === RADIO} completo={comRadio} />
        </div>
      )}

      {!naAbaYoutube && !naAbaRadio && caixaDaLista()}
    </div>
  );
}

interface PropsFaixa {
  id: string;
  info: InfoFaixa;
  escolhida: boolean;
  tocando: boolean;
}

/**
 * Uma faixa: a capa, o nome e o artista. A escolhida ganha um véu na cor da
 * capa e o nome nessa cor; a que toca, o equalizador; passar o mouse mostra
 * o play sobre a capa.
 */
function LinhaFaixa({ id, info, escolhida, tocando, onRemover }: PropsFaixa & { onRemover?: () => void }) {
  return (
    <div
      data-faixa={id}
      className={cn(
        'som-cores group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        escolhida ? 'som-linha-escolhida' : 'hover:bg-muted/70',
      )}
      style={estiloDaFaixa(info) as CSSProperties}
    >
      <button
        type="button"
        onClick={() => escolher(id)}
        aria-pressed={escolhida}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative shrink-0">
          <CapaFaixa info={info} className="h-10 w-10 rounded-md" />
          {!tocando && (
            <span
              aria-hidden
              className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 text-white group-hover:flex"
            >
              <Play className="h-4 w-4 translate-x-px fill-current" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="som-linha-nome block truncate text-[13px] font-medium leading-tight">{info.nome}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{info.descricao}</span>
        </span>
        {tocando && <Equalizador className="som-tinta mr-1.5 shrink-0" />}
      </button>
      {onRemover && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onRemover}
          aria-label={`Tirar «${info.nome}» da lista`}
          title="Tirar da lista"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/**
 * A busca de músicas do YouTube. Só dispara no Enter / botão (cada busca gasta
 * 1% da cota do dia de todo mundo — ver `youtube.ts`). Clicar num resultado
 * guarda a música na lista da pessoa e toca.
 */
/**
 * `lista`: monta a caixa que rola (a do `SeletorFaixas`) com os resultados em
 * cima — a busca não tem rolagem própria.
 */
function BuscaYoutube({ playlists, escolhida, fila, lista }: {
  playlists: PlaylistSalva[];
  escolhida: string;
  fila: string[];
  lista: (topo?: ReactNode) => ReactNode;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ResultadoYoutube[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const configurada = buscaConfigurada();
  const cheia = playlists.length >= LIMITE_PLAYLISTS;

  useEffect(() => () => abortar.current?.abort(), []);

  const buscarAgora = async (e: FormEvent) => {
    e.preventDefault();
    const termo = texto.trim();
    if (termo.length < 2) return;
    abortar.current?.abort();
    const ctrl = new AbortController();
    abortar.current = ctrl;
    setBuscando(true);
    setAviso(null);
    try {
      const itens = await buscarMusicas(termo, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResultados(itens);
      if (itens.length === 0) setAviso(`Nada encontrado para «${termo}».`);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setResultados(null);
      setAviso(err instanceof ErroBusca ? err.message : 'Não deu para buscar agora. Tente de novo.');
    } finally {
      if (!ctrl.signal.aborted) setBuscando(false);
    }
  };

  const limpar = () => {
    abortar.current?.abort();
    setTexto('');
    setResultados(null);
    setAviso(null);
    setBuscando(false);
  };

  /** Garante a música na lista salva e devolve o id; `null` se a lista está cheia. */
  const guardar = (r: ResultadoYoutube): string | null => {
    const url = urlDoVideo(r.video);
    const lido = lerLink(url);
    if (!lido) return null;
    const id = chaveDoLink(lido);
    if (!playlists.some(p => p.id === id)) {
      if (cheia) {
        setAviso(`Sua lista está cheia (${LIMITE_PLAYLISTS}). Tire uma música para guardar outra.`);
        return null;
      }
      const nova: PlaylistSalva = {
        id, url, nome: r.titulo.slice(0, 60), capa: r.capa, ...(r.canal ? { descricao: r.canal } : {}),
      };
      salvarPlaylists([...playlists, nova]);
    }
    setAviso(null);
    return id;
  };
  const tocarAgora = (r: ResultadoYoutube) => {
    const id = guardar(r);
    if (id) escolher(id);
  };
  const naFila = (r: ResultadoYoutube) => {
    const id = guardar(r);
    if (id) adicionarNaFila(id);
  };

  return (
    <>
      <div className="mt-2 shrink-0">
        <form onSubmit={buscarAgora} className="flex gap-1.5">
          <div className="relative flex-1">
            <Youtube className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={texto}
              onChange={e => { setTexto(e.target.value); if (!e.target.value) limpar(); }}
              placeholder="Buscar música ou artista no YouTube"
              aria-label="Buscar música no YouTube"
              className="h-8 pl-8 text-xs"
              maxLength={100}
              disabled={!configurada}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2.5"
            disabled={!configurada || buscando || texto.trim().length < 2}
          >
            {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Buscar
          </Button>
        </form>

        {!configurada && (
          <p className="mt-1.5 text-xs text-muted-foreground" role="status">
            A busca do YouTube ainda não foi configurada neste ambiente (falta a chave da API).
          </p>
        )}
        {aviso && <p className="mt-1.5 text-xs text-destructive" role="alert">{aviso}</p>}

        {fila.length > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <ListEnd className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                Na fila: <span className="font-medium tabular-nums">{fila.length}</span>{' '}
                {fila.length === 1 ? 'música' : 'músicas'}
              </span>
            </span>
            <button type="button" onClick={limparFila} className="text-muted-foreground hover:text-foreground">
              Limpar fila
            </button>
          </div>
        )}
      </div>

      {lista(resultados && resultados.length > 0 && (
        <section aria-label="Resultados da busca">
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultados</p>
            <button type="button" onClick={limpar} className="text-[11px] text-muted-foreground hover:text-foreground">
              Limpar
            </button>
          </div>
          <div className="space-y-0.5">
            {resultados.map(r => {
              const id = `youtube:video:${r.video}`;
              const info = infoDaPlaylist({ id, url: urlDoVideo(r.video), nome: r.titulo, capa: r.capa, descricao: r.canal || 'YouTube' });
              return (
                <LinhaResultado
                  key={r.video}
                  info={info}
                  tocandoAgora={escolhida === id}
                  naFila={fila.includes(id)}
                  aoTocar={() => tocarAgora(r)}
                  aoEnfileirar={() => naFila(r)}
                />
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            A música que você usar fica guardada na sua lista abaixo.
          </p>
        </section>
      ))}
    </>
  );
}

/**
 * Um resultado da busca: a capa, o nome e dois botões discretos — «Tocar agora»
 * e «Adicionar à fila». Os botões ficam sempre à vista (no celular não há hover).
 */
function LinhaResultado({ info, tocandoAgora, naFila, aoTocar, aoEnfileirar }: {
  info: InfoFaixa;
  tocandoAgora: boolean;
  naFila: boolean;
  aoTocar: () => void;
  aoEnfileirar: () => void;
}) {
  return (
    <div
      className={cn(
        'som-cores flex items-center gap-2.5 rounded-lg p-1.5 pr-1.5 transition-colors',
        tocandoAgora ? 'som-linha-escolhida' : 'hover:bg-muted/70',
      )}
      style={estiloDaFaixa(info) as CSSProperties}
    >
      <CapaFaixa info={info} className="h-10 w-10 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="som-linha-nome block truncate text-[13px] font-medium leading-tight">{info.nome}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{info.descricao}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={aoEnfileirar}
          disabled={naFila}
          aria-label={naFila ? `«${info.nome}» já está na fila` : `Adicionar «${info.nome}» à fila`}
          title={naFila ? 'Já está na fila' : 'Adicionar à fila'}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors',
            'hover:border-foreground/30 hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:bg-transparent',
            naFila && 'som-tinta border-transparent',
          )}
        >
          <ListPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={aoTocar}
          aria-label={`Tocar «${info.nome}» agora`}
          title="Tocar agora"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-transform',
            'hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Play className="h-4 w-4 translate-x-px fill-current" />
        </button>
      </span>
    </div>
  );
}
