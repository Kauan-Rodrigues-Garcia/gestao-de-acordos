/**
 * PainelSomAmbiente — o que abre ao clicar no fone do header.
 *
 * De cima para baixo: o que está tocando e os controles, o volume, o seletor
 * de faixas (`SeletorFaixas`: abas «Temas» e «Músicas», em páginas) e o
 * «Tocar ao entrar».
 *
 * Duas versões, decididas pelo motor (`completo`):
 *   - super_admin: tudo acima, mais a aba «Playlists» (as da pessoa), volume
 *     de 0 a 100;
 *   - os demais: enxuta — só as de fábrica, sem a aba «Playlists» (não dá
 *     para adicionar música) e volume de 0 a 50.
 *
 * Mora com o tema de Halloween e só aparece quando o tema está liberado para
 * a pessoa (`useHalloween().disponivel`, no `Layout`). Tudo que muda aqui vai
 * para o motor; o painel não guarda estado de som — fechar e abrir de novo
 * mostra o mesmo que está tocando.
 *
 * Baixa sob demanda (ver `BotaoSomAmbiente`).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Volume, Volume1, Volume2, VolumeX, Plus, X, Loader2,
  ChevronLeft, ChevronRight, Ghost, ListMusic, Music, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { chaveDoLink, lerLink } from './links';
import {
  ALTURA_PALCO, alternar, ancorarPalco, buscar, definirRepetir, definirTocarAoEntrar, definirVolume,
  escolher, progresso, pular, salvarPlaylists, useSomAmbiente,
} from './motor';
import {
  LIMITE_PLAYLISTS, MUSICAS, TEMAS_DE_TERROR, VOLUME_PADRAO, ehEmbutida, type PlaylistSalva,
} from './preferencias';
import { EMBUTIDAS, infoDaFaixa, infoDaPlaylist, type InfoFaixa } from './faixas';
import { Equalizador } from './Equalizador';
import './somAmbiente.css';

const mmss = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function PainelSomAmbiente() {
  const { estado, prefs, silenciado, noAr, playerAberto, completo, volumeMax, erro } = useSomAmbiente();
  const escolhida = prefs.faixa;
  const info = infoDaFaixa(escolhida, prefs.playlists) ?? EMBUTIDAS.halloween;
  const tocando = estado === 'tocando' && !silenciado;
  const carregando = estado === 'carregando';
  const externa = !ehEmbutida(escolhida);
  const spotify = externa && escolhida.startsWith('spotify:');

  // O espaço do player externo. O iframe não mora aqui (ver `motor.ts`): o
  // motor o encaixa por cima deste retângulo enquanto o painel está aberto.
  const palco = useRef<HTMLDivElement>(null);
  const mostrarPalco = externa && noAr === escolhida && playerAberto;
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

  const legenda = silenciado
    ? 'Pausado enquanto a mensagem de outubro toca'
    : estado === 'erro' && erro ? erro
    : carregando ? (externa ? 'Abrindo o player…' : 'Carregando a música…')
    : estado === 'aguardando' ? (mostrarPalco ? 'Aperte o play no player abaixo' : 'Começa no seu próximo clique na tela')
    : tocando ? info.descricao
    : estado === 'pausado' ? 'Pausado'
    : 'Escolha um som e aperte o play';

  return (
    <div className="flex max-h-[min(640px,calc(100vh-80px))] flex-col">
      {/* ── Agora tocando ── */}
      <div className={cn('som-palco-topo relative px-4 pb-3 pt-4', info.tom)}>
        <div className="flex items-center gap-3">
          <div className="som-icone flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            {tocando ? <Equalizador className="som-eq-grande" /> : <info.Icone className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Som ambiente</p>
            <p className="truncate text-sm font-semibold leading-tight">{info.nome}</p>
            <p
              className={cn('truncate text-xs', estado === 'erro' ? 'text-destructive' : 'text-muted-foreground')}
              aria-live="polite"
            >
              {legenda}
            </p>
          </div>
        </div>

        {!externa && <BarraProgresso ativa={noAr === escolhida && estado !== 'parado'} />}

        <div className="mt-2 flex items-center justify-center gap-2">
          {/* Mesma largura do «Repetir», para o play ficar no centro. */}
          <span className="h-9 w-9" aria-hidden />
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => pular(-1)} aria-label="Faixa anterior" title="Faixa anterior">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="som-play h-11 w-11 rounded-full shadow-sm"
            onClick={alternar}
            aria-label={tocando || carregando ? 'Pausar' : 'Tocar'}
            title={tocando || carregando ? 'Pausar' : 'Tocar'}
          >
            {carregando ? <Loader2 className="h-5 w-5 animate-spin" />
              : tocando ? <Pause className="h-5 w-5" />
              : <Play className="h-5 w-5 translate-x-px" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => pular(1)} aria-label="Próxima faixa" title="Próxima faixa">
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-9 w-9 rounded-full', prefs.repetir ? 'text-primary' : 'text-muted-foreground')}
            onClick={() => definirRepetir(!prefs.repetir)}
            disabled={externa}
            aria-pressed={prefs.repetir}
            aria-label={prefs.repetir ? 'Repetindo esta música' : 'Tocando em sequência'}
            title={prefs.repetir ? 'Repetindo esta música — clique para tocar em sequência' : 'Tocando em sequência — clique para repetir esta música'}
          >
            {prefs.repetir ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={alternarMudo}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={prefs.volume === 0 ? 'Tirar do mudo' : 'Deixar mudo'}
            title={prefs.volume === 0 ? 'Tirar do mudo' : 'Deixar mudo'}
          >
            <IconeVolume className="h-4 w-4" />
          </button>
          <Slider
            value={[prefs.volume]}
            min={0}
            max={volumeMax}
            step={1}
            onValueChange={([v]) => definirVolume(v)}
            aria-label={volumeMax < 100 ? `Volume, até ${volumeMax}%` : 'Volume'}
            className="flex-1"
          />
          <span
            className="w-9 text-right text-xs tabular-nums text-muted-foreground"
            title={volumeMax < 100 ? `Máximo de ${volumeMax}%` : undefined}
          >
            {prefs.volume}%
          </span>
        </div>
        {spotify && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            O Spotify não deixa outro site mexer no volume: use o do computador.
          </p>
        )}
      </div>

      {mostrarPalco && (
        <div className="px-4 pb-3">
          <div
            ref={palco}
            className="rounded-xl bg-muted"
            style={{ height: ALTURA_PALCO }}
            aria-hidden
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-3">
        <SeletorFaixas
          escolhida={escolhida}
          noAr={tocando ? noAr : null}
          playlists={completo ? prefs.playlists : null}
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Tocar ao entrar no sistema</span>
          <span className="block text-xs text-muted-foreground">Começa sozinho, com a última música e volume escolhidos</span>
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
    <div className="mt-3 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
      <span className="w-8 text-right">{mmss(atual)}</span>
      <Slider
        value={[duracao ? Math.min(atual, duracao) : 0]}
        min={0}
        max={duracao || 1}
        step={1}
        disabled={!ativa || !duracao}
        onValueChange={([v]) => setArrastando(v)}
        onValueCommit={([v]) => { buscar(v); setArrastando(null); setP(progresso()); }}
        aria-label="Posição na música"
        className="flex-1"
      />
      <span className="w-8">{duracao ? mmss(duracao) : '–:––'}</span>
    </div>
  );
}

type Aba = 'temas' | 'musicas' | 'playlists';

/** Faixas por página. Lista que cresce vira mais páginas, nunca uma rolagem sem fim. */
export const POR_PAGINA = 5;

/** Altura de uma `LinhaFaixa` (ícone de 32px + respiro + borda): as vagas vazias da última página. */
const ALTURA_LINHA = 'h-[50px]';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function abaDaFaixa(id: string): Aba {
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
 * Temas de terror e músicas em abas separadas (e «Playlists», no completo),
 * cada uma em páginas de `POR_PAGINA`. Com mais de uma página aparece a busca,
 * por nome ou artista, sem acento. Abre — e volta, a cada troca pelo
 * anterior/próxima — na aba e na página da faixa escolhida.
 *
 * `playlists`: as da pessoa; `null` na versão enxuta, que não tem a aba.
 */
function SeletorFaixas({ escolhida, noAr, playlists }: {
  escolhida: string;
  /** O que está tocando de fato (`null` se nada). */
  noAr: string | null;
  playlists: PlaylistSalva[] | null;
}) {
  const listas: Record<Aba, ItemDaLista[]> = {
    temas: TEMAS_DE_TERROR.map(id => ({ id, info: EMBUTIDAS[id] })),
    musicas: MUSICAS.map(id => ({ id, info: EMBUTIDAS[id] })),
    playlists: (playlists ?? []).map(p => ({
      id: p.id,
      info: infoDaPlaylist(p),
      onRemover: () => salvarPlaylists(playlists!.filter(x => x.id !== p.id)),
    })),
  };
  const abas: { id: Aba; rotulo: string; Icone: typeof Ghost }[] = [
    { id: 'temas', rotulo: 'Temas', Icone: Ghost },
    { id: 'musicas', rotulo: 'Músicas', Icone: Music },
    ...(playlists ? [{ id: 'playlists' as const, rotulo: 'Playlists', Icone: ListMusic }] : []),
  ];

  const paginaDe = (aba: Aba, id: string) =>
    Math.max(0, Math.floor(listas[aba].findIndex(x => x.id === id) / POR_PAGINA));

  const abaInicial = () => {
    const a = abaDaFaixa(escolhida);
    return a === 'playlists' && !playlists ? 'temas' : a;
  };
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [pagina, setPagina] = useState(() => paginaDe(abaInicial(), escolhida));
  const [busca, setBusca] = useState('');

  // Trocou a faixa (anterior/próxima, ou a sequência andou): vai até ela.
  const ultima = useRef(escolhida);
  useEffect(() => {
    if (ultima.current === escolhida) return;
    ultima.current = escolhida;
    const a = abaInicial();
    setAba(a);
    setBusca('');
    setPagina(paginaDe(a, escolhida));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhida]);

  const trocarAba = (a: Aba) => {
    setAba(a);
    setBusca('');
    setPagina(paginaDe(a, escolhida));
  };

  const todos = listas[aba];
  const termo = semAcento(busca);
  const filtrados = termo
    ? todos.filter(x => semAcento(`${x.info.nome} ${x.info.descricao}`).includes(termo))
    : todos;
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const daPagina = filtrados.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);
  const temBusca = todos.length > POR_PAGINA;
  // Com páginas, a lista guarda sempre a mesma altura: virar a página não pula o painel.
  const vagas = paginas > 1 ? POR_PAGINA - daPagina.length : 0;

  return (
    <div>
      <div role="tablist" aria-label="Tipo de som" className="flex gap-1 rounded-lg bg-muted p-1">
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
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativa ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <a.Icone className="h-3.5 w-3.5" />
              {a.rotulo}
              <span className="tabular-nums opacity-60">{listas[a.id].length}</span>
              {temEscolhida && !ativa && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" title="A faixa escolhida está aqui" />
              )}
            </button>
          );
        })}
      </div>

      {temBusca && (
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(0); }}
            placeholder={aba === 'temas' ? 'Buscar tema' : aba === 'musicas' ? 'Buscar música ou artista' : 'Buscar playlist'}
            aria-label="Buscar na lista"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {busca && (
            <button
              type="button"
              onClick={() => { setBusca(''); setPagina(paginaDe(aba, escolhida)); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div role="tabpanel" className="mt-2 space-y-1.5">
        {daPagina.map(x => (
          <LinhaFaixa
            key={x.id}
            id={x.id}
            info={x.info}
            escolhida={escolhida === x.id}
            tocando={noAr === x.id}
            onRemover={x.onRemover}
          />
        ))}
        {filtrados.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {termo ? <>Nada com «{busca.trim()}».</> : 'Nenhuma playlist ainda. Cole um link abaixo.'}
          </p>
        )}
        {Array.from({ length: vagas }, (_, i) => <div key={`vaga-${i}`} className={ALTURA_LINHA} aria-hidden />)}
      </div>

      {paginas > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPagina(atual - 1)}
            disabled={atual === 0}
            aria-label="Página anterior"
            title="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            {paginas <= 8 ? Array.from({ length: paginas }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPagina(i)}
                aria-label={`Página ${i + 1}`}
                aria-current={i === atual ? 'page' : undefined}
                className={cn(
                  'h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  i === atual ? 'w-4 bg-foreground/70' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
                )}
              />
            )) : null}
            <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">{atual + 1} de {paginas}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPagina(atual + 1)}
            disabled={atual === paginas - 1}
            aria-label="Próxima página"
            title="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {aba === 'playlists' && playlists && <NovaPlaylist playlists={playlists} />}
    </div>
  );
}

interface PropsFaixa {
  id: string;
  info: InfoFaixa;
  escolhida: boolean;
  tocando: boolean;
}

/** Uma faixa: o ícone na cor dela, o nome e a descrição. */
function LinhaFaixa({ id, info, escolhida, tocando, onRemover }: PropsFaixa & { onRemover?: () => void }) {
  return (
    <div
      className={cn(
        'som-bloco group flex items-center gap-2 rounded-xl border pr-1 transition-colors',
        info.tom,
        escolhida ? 'som-bloco-escolhido' : 'border-border hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        onClick={() => escolher(id)}
        aria-pressed={escolhida}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="som-icone flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          {tocando ? <Equalizador /> : <info.Icone className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight">{info.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">{info.descricao}</span>
        </span>
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

function NovaPlaylist({ playlists }: { playlists: PlaylistSalva[] }) {
  const [link, setLink] = useState('');
  const [nome, setNome] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const cheia = playlists.length >= LIMITE_PLAYLISTS;

  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    const lido = lerLink(link);
    if (!lido) {
      setAviso('Cole o link de uma playlist, álbum ou música do Spotify, ou de uma playlist ou vídeo do YouTube.');
      return;
    }
    const id = chaveDoLink(lido);
    if (playlists.some(p => p.id === id)) {
      setAviso('Essa já está na sua lista.');
      escolher(id);
      return;
    }
    const nova: PlaylistSalva = { id, url: link.trim(), nome: nome.trim().slice(0, 60) || lido.rotulo };
    salvarPlaylists([...playlists, nova]);
    escolher(id);
    setLink('');
    setNome('');
    setAviso(null);
  };

  if (cheia) {
    return <p className="mt-2 text-xs text-muted-foreground">Lista cheia ({LIMITE_PLAYLISTS}). Tire uma para adicionar outra.</p>;
  }

  return (
    <form onSubmit={adicionar} className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={link}
          onChange={e => { setLink(e.target.value); setAviso(null); }}
          placeholder="Link do Spotify ou YouTube"
          aria-label="Link da playlist"
          className="h-8 text-xs"
          inputMode="url"
        />
        <Button type="submit" size="sm" className="h-8 shrink-0 gap-1 px-2.5" disabled={!link.trim()}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>
      {link.trim() && (
        <Input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Nome na lista (opcional)"
          aria-label="Nome da playlist"
          className="h-8 text-xs"
          maxLength={60}
        />
      )}
      {aviso && <p className="text-xs text-destructive" role="alert">{aviso}</p>}
    </form>
  );
}
