/**
 * PainelRadio — a aba «Rádio» do Som ambiente.
 *
 * O que todo ouvinte vê:
 *   - fora da rádio, o convite para entrar;
 *   - dentro, a votação da próxima (abre 1 min antes do fim, fecha 5 s
 *     antes). O voto é escondido; a tela diz o tempo todo que é SORTEIO e que
 *     votar só aumenta a chance;
 *   - o resultado da rodada que acabou, com os votos e a chance de cada uma,
 *     no começo da música seguinte.
 *
 * O super_admin tem o painel LARGO (`definirPainelLargo`): uma segunda coluna
 * com o controle — ligar e desligar a rádio, pular, tirar a música, tocar uma
 * escolhida, ver as próximas candidatas a qualquer hora e trocá-las — e os
 * estilos. Ele lê a rádio mesmo sem estar ouvindo, para controlar de fora.
 *
 * O relógio de segundo em segundo (contagem regressiva) só roda com o painel
 * aberto nesta aba. Baixa junto do painel, sob demanda.
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  Check, ChevronDown, Dices, Loader2, Play, Power, Radio, RefreshCw, Replace, Search, SkipForward, Trash2, Vote, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { escolher } from '../motor';
import { RADIO } from '../preferencias';
import { CapaFaixa } from '../CapaFaixa';
import { estiloDaFaixa, infoDaRadio } from '../faixas';
import { ErroBusca, buscaConfigurada } from '../youtube';
import { ABRE_S, RESULTADO_S, chances, inicioMs, janela, type MusicaRadio, type ResultadoRodada } from './conta';
import { idDaPlaylist, lerPlaylist } from './importar';
import {
  agoraBanco, apagarEstilo, buscarNoCatalogo, definirPainelLargo, desligarRadio, importarMusicas, lerCatalogo, ligarNoAr,
  ligarRadio, pularRadio, salvarEstilo, sortearCandidatas, textoDoErro, tirarDaRadio, tocarNaRadio, trocarCandidata,
  useRadio, votar,
  type EstiloRadio, type MusicaDoCatalogo,
} from './radio';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

/** O relógio do banco, de segundo em segundo, enquanto o componente vive. */
function useAgora(ligado: boolean): number {
  const [agora, setAgora] = useState(agoraBanco);
  useEffect(() => {
    if (!ligado) return;
    setAgora(agoraBanco());
    const id = setInterval(() => setAgora(agoraBanco()), 1000);
    return () => clearInterval(id);
  }, [ligado]);
  return agora;
}

/** Um botão que pede um segundo clique em 4 s (ações que todo mundo sente). */
function useConfirmar(): [boolean, () => boolean] {
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    if (!confirmar) return;
    const t = setTimeout(() => setConfirmar(false), 4000);
    return () => clearTimeout(t);
  }, [confirmar]);
  return [confirmar, () => {
    if (!confirmar) { setConfirmar(true); return false; }
    setConfirmar(false);
    return true;
  }];
}

export function PainelRadio({ naRadio, completo }: { naRadio: boolean; completo: boolean }) {
  const radio = useRadio();
  const agora = useAgora(naRadio || completo);

  // O super_admin lê (e assina) a rádio mesmo sem estar ouvindo, e o painel
  // fica largo. Saindo da aba sem estar ouvindo, solta a assinatura.
  const ouvindo = useRef(naRadio);
  ouvindo.current = naRadio;
  useEffect(() => {
    if (!completo) return;
    definirPainelLargo(true);
    ligarRadio();
    return () => {
      definirPainelLargo(false);
      if (!ouvindo.current) desligarRadio();
    };
  }, [completo]);

  const ouvinte = <Ouvinte naRadio={naRadio} agora={agora} />;
  if (!completo) return <div className="py-1">{ouvinte}</div>;

  return (
    <div className="grid gap-3 py-1 min-[700px]:grid-cols-2">
      <div className="min-w-0">{ouvinte}</div>
      <div className="min-w-0 space-y-3">
        {radio.controla ? <Controle agora={agora} /> : radio.carregando && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a rádio…</p>
        )}
        <Estilos />
      </div>
    </div>
  );
}

// ── O que todo ouvinte vê ────────────────────────────────────────────────────

function Ouvinte({ naRadio, agora }: { naRadio: boolean; agora: number }) {
  const radio = useRadio();
  const e = radio.estado;
  const desligada = radio.fase === 'desligada';

  if (!naRadio) {
    return (
      <div className="som-cores rounded-xl p-3 text-white" style={{ ...estiloDaFaixa(infoDaRadio(null)), background: 'var(--som-fundo)' } as CSSProperties}>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Radio className="h-4 w-4" /> Rádio ao vivo</p>
        <p className="mt-1 text-xs leading-relaxed text-white/75">
          Todo mundo que entra ouve a mesma música, no mesmo ponto. Perto do fim de cada uma, aparecem três
          candidatas para a próxima: vote na sua para aumentar a chance dela.
        </p>
        {desligada && <p className="mt-2 text-xs font-medium text-amber-300">A rádio está desligada agora. Entrando, ela começa sozinha quando ligarem.</p>}
        <Button size="sm" className="mt-3 h-8 w-full gap-1.5" onClick={() => escolher(RADIO)}>
          <Radio className="h-3.5 w-3.5" /> Entrar na rádio
        </Button>
      </div>
    );
  }

  const j = janela(e);
  const ini = inicioMs(e);
  const votando = radio.fase === 'votando';
  const mostraResultado = !!e?.anterior && ini !== null && agora - ini < RESULTADO_S * 1000 && radio.fase === 'tocando';

  return (
    <div className="space-y-3">
      {/* Quem controla vê o erro no controle, ao lado. */}
      {radio.erro && !radio.controla && <p className="text-xs text-destructive" role="alert">{radio.erro}</p>}

      {desligada && (
        <p className="flex items-start gap-1.5 rounded-lg bg-muted/70 px-2.5 py-2 text-xs text-muted-foreground">
          <Power className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>A rádio está desligada. Fique aqui: quando ligarem, ela começa sozinha.</span>
        </p>
      )}

      {mostraResultado && e?.anterior && <Resultado r={e.anterior} />}

      {e?.atual && radio.fase === 'tocando' && j && (
        <p className="flex items-center gap-1.5 rounded-lg bg-muted/70 px-2.5 py-2 text-xs text-muted-foreground">
          <Vote className="h-3.5 w-3.5 shrink-0" />
          {e.candidatas.length
            ? <span>A votação da próxima abre {ABRE_S === 60 ? '1 min' : `${ABRE_S} s`} antes do fim — em <b className="tabular-nums text-foreground">{mmss(j.abre - agora)}</b>.</span>
            : <span>Cadastre mais músicas para ter votação.</span>}
        </p>
      )}

      {(votando || radio.fase === 'encerrada') && e && j && (
        <section aria-label="Votação da próxima música" className="rounded-xl border border-border p-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <p className="text-[13px] font-semibold">Qual vem agora?</p>
            <p className={cn('text-[11px] tabular-nums', votando ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-live="polite">
              {votando ? `fecha em ${mmss(j.fecha - agora)}` : 'Votação encerrada · sorteando…'}
            </p>
          </div>
          <div className="mt-2 space-y-1">
            {e.candidatas.map(c => (
              <Candidata
                key={c.video}
                m={c}
                minha={radio.meuVoto === c.video}
                aberta={votando}
                aoVotar={() => void votar(c.video)}
              />
            ))}
          </div>
          <p className="mt-2 px-0.5 text-[11px] leading-snug text-muted-foreground">
            A próxima é <b>sorteada</b> entre as três. Votar aumenta a chance da sua, mas não garante. Os votos ficam escondidos até o sorteio.
          </p>
        </section>
      )}
    </div>
  );
}

function Candidata({ m, minha, aberta, aoVotar }: { m: MusicaRadio; minha: boolean; aberta: boolean; aoVotar: () => void }) {
  const info = infoDaRadio(m);
  return (
    <button
      type="button"
      onClick={aoVotar}
      disabled={!aberta}
      aria-pressed={minha}
      className={cn(
        'som-cores flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        minha ? 'som-linha-escolhida border-[color:var(--som-tinta)]' : 'border-transparent hover:bg-muted/70',
        !aberta && !minha && 'opacity-60',
      )}
      style={estiloDaFaixa(info) as CSSProperties}
    >
      <CapaFaixa info={info} className="h-10 w-10 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="som-linha-nome block truncate text-[13px] font-medium leading-tight">{m.titulo}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.canal || 'YouTube'}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">{m.estilo}</span>
        {minha && <span className="som-tinta flex items-center gap-0.5 text-[10.5px] font-semibold"><Check className="h-3 w-3" /> seu voto</span>}
      </span>
    </button>
  );
}

const TITULO_DO_MOTIVO: Record<ResultadoRodada['motivo'], string> = {
  fim: 'Resultado do sorteio',
  pular: 'Pulada · sorteio na hora',
  erro: 'A anterior não tocou · sorteio na hora',
  trocar: 'O super admin escolheu esta',
};

/** A rodada que acabou: quem caiu, os votos e a chance que cada uma tinha. */
function Resultado({ r }: { r: ResultadoRodada }) {
  const ch = chances(r.candidatas.map(c => c.votos));
  const sorteada = r.candidatas.find(c => c.video === r.sorteada);
  return (
    <section aria-label="Resultado do sorteio" className="rounded-xl bg-muted/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{TITULO_DO_MOTIVO[r.motivo]}</p>
      <p className="mt-0.5 text-xs">
        {r.votos === 0
          ? 'Ninguém votou: as três tinham a mesma chance.'
          : <>{r.votos} {r.votos === 1 ? 'voto' : 'votos'} no total.{sorteada ? <> Caiu <b>{sorteada.titulo}</b>.</> : null}</>}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {r.candidatas.map((c, i) => (
          <li key={c.video} className={cn('flex items-center gap-2 text-xs', c.video === r.sorteada ? 'font-semibold' : 'text-muted-foreground')}>
            <span className="w-3 shrink-0">{c.video === r.sorteada ? <Check className="h-3 w-3" /> : null}</span>
            <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
            <span className="shrink-0 tabular-nums">{c.votos} {c.votos === 1 ? 'voto' : 'votos'} · {pct(ch[i])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── O controle (super_admin) ─────────────────────────────────────────────────

type Escolha = { tipo: 'tocar' } | { tipo: 'trocar'; posicao: number };

function Controle({ agora }: { agora: number }) {
  const radio = useRadio();
  const e = radio.estado;
  const [confirmarDesligar, pedirDesligar] = useConfirmar();
  const [confirmarTirar, pedirTirar] = useConfirmar();
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const noAr = !!e?.no_ar;
  const j = janela(e);
  const votacaoMexe = noAr && !!e?.atual && !!j && agora < j.fecha;

  // Virou a música: a escolha aberta era da rodada que passou.
  const rodada = e?.rodada;
  useEffect(() => { setEscolha(c => (c?.tipo === 'trocar' ? null : c)); }, [rodada]);

  return (
    <section aria-label="Controle da rádio" className="space-y-2.5 rounded-xl border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', noAr ? 'animate-pulse bg-red-500' : 'bg-muted-foreground/40')} />
          <span className="truncate">{noAr ? `No ar${e?.no_ar_desde ? ` desde ${hora(e.no_ar_desde)}` : ''}` : 'Desligada'}</span>
        </p>
        {noAr ? (
          <Button
            variant={confirmarDesligar ? 'destructive' : 'outline'} size="sm" className="h-7 gap-1 px-2 text-xs"
            disabled={radio.ocupada}
            onClick={() => { if (pedirDesligar()) void ligarNoAr(false); }}
            title="Para a rádio para todo mundo"
          >
            <Power className="h-3.5 w-3.5" /> {confirmarDesligar ? 'Confirmar' : 'Desligar'}
          </Button>
        ) : (
          <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" disabled={radio.ocupada} onClick={() => void ligarNoAr(true)}>
            {radio.ocupada ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} Ligar a rádio
          </Button>
        )}
      </div>

      {!noAr && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Desligada, ninguém ouve nem vota. Ligando, começa já com uma música sorteada para todo mundo que estiver na rádio.
        </p>
      )}

      {noAr && e?.atual && (
        <>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 flex-1 gap-1 px-2 text-xs" disabled={radio.ocupada} onClick={pularRadio}
              title="Sorteia a próxima agora, com os votos que já houver">
              <SkipForward className="h-3.5 w-3.5" /> Pular
            </Button>
            <Button variant="outline" size="sm" className="h-8 flex-1 gap-1 px-2 text-xs" disabled={radio.ocupada}
              onClick={() => setEscolha(c => (c?.tipo === 'tocar' ? null : { tipo: 'tocar' }))}
              aria-pressed={escolha?.tipo === 'tocar'} title="Escolha no catálogo a música que entra agora">
              <Play className="h-3.5 w-3.5" /> Escolher
            </Button>
            <Button
              variant={confirmarTirar ? 'destructive' : 'outline'} size="sm" className="h-8 flex-1 gap-1 px-2 text-xs"
              disabled={radio.ocupada}
              onClick={() => { if (pedirTirar()) void tirarDaRadio(); }}
              title="Tira esta música da rádio para sempre e sorteia outra"
            >
              <Trash2 className="h-3.5 w-3.5" /> {confirmarTirar ? 'Confirmar' : 'Tirar'}
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Próxima votação</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {!j ? '' : agora < j.abre ? `abre em ${mmss(j.abre - agora)}` : agora < j.fecha ? `aberta · fecha em ${mmss(j.fecha - agora)}` : 'fechada'}
              </p>
            </div>
            <ul className="mt-1 space-y-0.5">
              {e.candidatas.map((c, i) => (
                <li key={c.video} className={cn('flex items-center gap-2 rounded-lg px-1 py-0.5', escolha?.tipo === 'trocar' && escolha.posicao === i && 'bg-muted')}>
                  <span className="w-3 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                  <CapaFaixa info={infoDaRadio(c)} className="h-7 w-7 rounded" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium leading-tight">{c.titulo}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{c.estilo}</span>
                  </span>
                  <button
                    type="button" disabled={!votacaoMexe || radio.ocupada}
                    onClick={() => setEscolha(x => (x?.tipo === 'trocar' && x.posicao === i ? null : { tipo: 'trocar', posicao: i }))}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label={`Trocar a candidata ${i + 1}, ${c.titulo}`} title="Trocar esta candidata (os votos nela caem)"
                  >
                    <Replace className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost" size="sm" className="mt-1 h-7 w-full gap-1 text-xs text-muted-foreground"
              disabled={!votacaoMexe || radio.ocupada}
              onClick={() => void sortearCandidatas()}
              title="Sorteia outras três (os votos da rodada caem)"
            >
              <Dices className="h-3.5 w-3.5" /> Sortear outras três
            </Button>
            <p className="px-0.5 text-[10.5px] leading-snug text-muted-foreground">
              Só você vê as candidatas antes de a votação abrir. Dá para mexer até ela fechar.
            </p>
          </div>
        </>
      )}

      {noAr && !e?.atual && !radio.carregando && (
        <p className="text-xs text-muted-foreground">No ar, mas sem música: cadastre um estilo abaixo e pule para começar.</p>
      )}

      {escolha && noAr && e?.atual && (
        <EscolherMusica
          escolha={escolha}
          noAr={e.atual.video}
          candidatas={e.candidatas.map(c => c.video)}
          aoFechar={() => setEscolha(null)}
        />
      )}

      {radio.erro && <p className="text-xs text-destructive" role="alert">{radio.erro}</p>}
    </section>
  );
}

/** Busca no catálogo para tocar agora ou pôr na votação. */
function EscolherMusica({ escolha, noAr, candidatas, aoFechar }: {
  escolha: Escolha;
  noAr: string;
  candidatas: string[];
  aoFechar: () => void;
}) {
  const radio = useRadio();
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState<MusicaDoCatalogo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef(0);

  const buscar = async (t: string) => {
    const meu = ++pedido.current;
    setBuscando(true);
    setErro(null);
    try {
      const r = await buscarNoCatalogo(t);
      if (meu === pedido.current) setLista(r);
    } catch (e) {
      if (meu === pedido.current) setErro(textoDoErro(e));
    } finally {
      if (meu === pedido.current) setBuscando(false);
    }
  };
  useEffect(() => { void buscar(''); }, []);

  const enviar = (ev: FormEvent) => { ev.preventDefault(); void buscar(termo); };

  const usar = async (m: MusicaDoCatalogo) => {
    const ok = escolha.tipo === 'tocar' ? await tocarNaRadio(m.video) : await trocarCandidata(escolha.posicao, m.video);
    if (ok) aoFechar();
  };

  const rotulo = escolha.tipo === 'tocar' ? 'Tocar agora' : `No lugar da ${escolha.posicao + 1}`;

  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {escolha.tipo === 'tocar' ? 'Escolher a que toca agora' : `Trocar a candidata ${escolha.posicao + 1}`}
        </p>
        <button type="button" onClick={aoFechar} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar a escolha">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <form onSubmit={enviar} className="mt-1.5 flex gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={termo} onChange={ev => setTermo(ev.target.value)} placeholder="Música, artista ou estilo" className="h-8 pl-8 text-xs" aria-label="Buscar no catálogo da rádio" />
        </div>
        <Button type="submit" size="sm" className="h-8 px-2.5 text-xs" disabled={buscando}>
          {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
        </Button>
      </form>
      {erro && <p className="mt-1.5 text-xs text-destructive">{erro}</p>}
      <ul className="mt-1.5 max-h-[220px] space-y-0.5 overflow-y-auto overscroll-contain">
        {lista?.map(m => {
          const ocupada = m.video === noAr ? 'no ar' : candidatas.includes(m.video) ? 'na votação' : null;
          return (
            <li key={m.video} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-background/70">
              <CapaFaixa info={infoDaRadio(m)} className="h-7 w-7 rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium leading-tight">{m.titulo}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{[m.canal, m.estilo].filter(Boolean).join(' · ')}</span>
              </span>
              {ocupada ? (
                <span className="shrink-0 text-[10.5px] text-muted-foreground">{ocupada}</span>
              ) : (
                <Button size="sm" variant="secondary" className="h-6 shrink-0 px-2 text-[11px]" disabled={radio.ocupada} onClick={() => void usar(m)}>
                  {rotulo}
                </Button>
              )}
            </li>
          );
        })}
        {lista && lista.length === 0 && <li className="py-2 text-center text-xs text-muted-foreground">Nada no catálogo com «{termo.trim()}».</li>}
      </ul>
    </div>
  );
}

// ── Estilos (super_admin) ────────────────────────────────────────────────────

function Estilos() {
  const [aberto, setAberto] = useState(false);
  const [estilos, setEstilos] = useState<EstiloRadio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Id do estilo importando agora. */
  const [importando, setImportando] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [link, setLink] = useState('');

  const recarregar = async () => {
    try { setEstilos(await lerCatalogo()); setErro(null); } catch (e) { setErro(textoDoErro(e)); }
  };
  useEffect(() => { if (aberto && !estilos) void recarregar(); }, [aberto, estilos]);

  const importar = async (id: number, playlist: string, rotulo: string) => {
    setImportando(id);
    setErro(null);
    setAviso(null);
    try {
      const lida = await lerPlaylist(playlist);
      if (!lida.musicas.length) throw new Error('Nenhuma música da playlist pode tocar na rádio (privadas, longas demais ou bloqueadas fora do YouTube).');
      const r = await importarMusicas(id, lida.musicas);
      setAviso(`${rotulo}: ${r.musicas} ${r.musicas === 1 ? 'música' : 'músicas'} na rádio`
        + (lida.fora ? `, ${lida.fora} de fora (privadas, longas ou bloqueadas)` : '')
        + (r.sairam ? `, ${r.sairam} saíram` : '') + '.');
    } catch (e) {
      setErro(e instanceof ErroBusca ? e.message : textoDoErro(e));
    } finally {
      setImportando(null);
      void recarregar();
    }
  };

  const adicionar = async (ev: FormEvent) => {
    ev.preventDefault();
    const playlist = idDaPlaylist(link);
    if (!nome.trim()) { setErro('Dê um nome ao estilo.'); return; }
    if (!playlist) { setErro('Cole o link de uma PLAYLIST do YouTube (tem «list=» no endereço).'); return; }
    setErro(null);
    let id: number;
    try {
      id = await salvarEstilo(null, nome.trim(), playlist, true);
    } catch (e) {
      setErro(textoDoErro(e));
      return;
    }
    const rotulo = nome.trim();
    setNome('');
    setLink('');
    await importar(id, playlist, rotulo);
  };

  return (
    <section className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium"
      >
        Estilos e músicas da rádio
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="space-y-2.5 border-t border-border px-3 pb-3 pt-2.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Cada estilo é uma playlist do YouTube (pública ou não listada). A cada música, a rádio sorteia 3 estilos e uma
            música de cada para a votação.
          </p>

          {!buscaConfigurada() && (
            <p className="text-xs text-destructive">Falta a chave do YouTube neste ambiente: não dá para ler playlists.</p>
          )}

          {estilos === null && !erro && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>}

          {estilos && estilos.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum estilo ainda. Cadastre o primeiro abaixo.</p>
          )}

          {estilos && estilos.length > 0 && (
            <ul className="space-y-1">
              {estilos.map(s => (
                <LinhaEstilo
                  key={s.id}
                  s={s}
                  importando={importando === s.id}
                  ocupado={importando !== null}
                  aoReimportar={() => { if (s.playlist) void importar(s.id, s.playlist, s.nome); }}
                  aoAtivar={async ativo => {
                    try { await salvarEstilo(s.id, s.nome, s.playlist, ativo); } catch (e) { setErro(textoDoErro(e)); }
                    void recarregar();
                  }}
                  aoApagar={async () => {
                    try { await apagarEstilo(s.id); } catch (e) { setErro(textoDoErro(e)); }
                    void recarregar();
                  }}
                />
              ))}
            </ul>
          )}

          <form onSubmit={adicionar} className="space-y-1.5 rounded-lg bg-muted/60 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Novo estilo</p>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (ex.: Funk, Trap, Internacional)" maxLength={40} className="h-8 text-xs" aria-label="Nome do estilo" />
            <Input value={link} onChange={e => setLink(e.target.value)} placeholder="Link da playlist do YouTube" className="h-8 text-xs" aria-label="Link da playlist do YouTube" />
            <Button type="submit" size="sm" className="h-8 w-full gap-1.5 text-xs" disabled={importando !== null || !buscaConfigurada()}>
              {importando !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Adicionar e importar
            </Button>
          </form>

          {aviso && <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">{aviso}</p>}
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>
      )}
    </section>
  );
}

function LinhaEstilo({ s, importando, ocupado, aoReimportar, aoAtivar, aoApagar }: {
  s: EstiloRadio;
  importando: boolean;
  ocupado: boolean;
  aoReimportar: () => void;
  aoAtivar: (ativo: boolean) => void;
  aoApagar: () => void;
}) {
  const [confirmar, pedir] = useConfirmar();
  return (
    <li className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-muted/60">
      <Switch checked={s.ativo} onCheckedChange={aoAtivar} aria-label={`${s.nome} na rádio`} className="scale-75" />
      <span className={cn('min-w-0 flex-1', !s.ativo && 'opacity-50')}>
        <span className="block truncate text-[13px] font-medium leading-tight">{s.nome}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {s.musicas} {s.musicas === 1 ? 'música' : 'músicas'}{s.fora ? ` · ${s.fora} não tocaram` : ''}
        </span>
      </span>
      {s.playlist && (
        <button
          type="button" onClick={aoReimportar} disabled={ocupado}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label={`Reimportar ${s.nome} da playlist`} title="Ler a playlist de novo (entra o que foi adicionado, sai o que foi tirado)"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', importando && 'animate-spin')} />
        </button>
      )}
      <button
        type="button" disabled={ocupado}
        onClick={() => { if (pedir()) aoApagar(); }}
        className={cn('rounded p-1.5 disabled:opacity-40', confirmar ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted hover:text-destructive')}
        aria-label={confirmar ? `Confirmar: apagar ${s.nome}` : `Apagar ${s.nome}`}
        title={confirmar ? 'Clique de novo para apagar' : 'Apagar o estilo e as músicas dele'}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
