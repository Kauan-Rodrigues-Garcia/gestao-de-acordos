/**
 * Central.tsx — a Central de jogos do Modo TV: o Bingo, do lado do líder.
 *
 * Escolhe a TV (o painel), abre a partida, sorteia (no botão ou no
 * automático), acompanha quem está perto e comemora quem completou.
 *
 * Os quatro grupos (`gruposDoLider`) são contados NESTE navegador: as cartelas
 * vêm uma vez, e cada pedra que chega pelo aviso só refaz a conta. A régua é a
 * das pedras sorteadas, a mesma da comemoração no banco.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Crown, Dices, Gift, History, Loader2, Megaphone, Pause, Play, Search, Sparkles, Square, UserPlus, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { assinarTabela } from '@/lib/realtime';
import { useOnlineUsers } from '@/providers/PresenceProvider';
import type { Painel } from '../tipos';
import { Cartela } from './Cartela';
import {
  TOTAL_PEDRAS, elegiveis, encaixa, gruposDoLider, lerAviso, letraDe, nomeDaVitoria, padrao,
  type PessoaNoGrupo,
} from './regras';
import {
  comemorar, criarPartida, encerrarPartida, incluirParticipantes, lerControle, listarCandidatos,
  mudarAutomatico, partidaDoPainel, sortearPedra,
} from './servico';
import { TEMAS_BINGO, useTemaBingo } from './temas';
import type { TemaBingo } from './temas/contrato';
import type { CandidatoBingo, CartelaNoControle, ControleBingo, ResumoDoPainel, TemaBingoId, TipoVitoria } from './tipos';

export interface GrupoDePaineis { setorId: string; nome: string; paineis: Painel[] }

export interface TvsDoPainel { total: number; ligadas: number }

/** O selo «Bingo no ar» do card do painel, nas duas abas do Modo TV. */
export function SeloBingoNoAr({ pedras, jogando }: { pedras: number; jogando: number }) {
  return (
    <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
      <PontoAoVivo />
      <span className="truncate">Bingo no ar · {pedras}/{TOTAL_PEDRAS} · {jogando} jogando</span>
    </div>
  );
}

function PontoAoVivo({ cor = 'bg-emerald-500' }: { cor?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${cor}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cor}`} />
    </span>
  );
}

/**
 * A mesma divisão da aba Painéis: cada setor com as TVs dele, e em cada TV o
 * jogo no ar e os anteriores. Quem enxerga o quê é o banco
 * (`fn_bingo_resumo` só devolve os painéis do meu alcance): o líder vê o
 * setor dele; a cúpula e o super admin, todos, sem misturar.
 *
 * O resumo e o painel escolhido moram na página (`ModoTV/index.tsx`): a aba
 * Painéis mostra o mesmo «Bingo no ar», e trocar de aba não perde a TV.
 */
export function CentralDeJogos({ grupos, rotulo, painelId, aoEscolher, resumo, aoMudar, tvs }: {
  grupos: GrupoDePaineis[];
  /** «Setor inteiro» / «Equipe Rosa». */
  rotulo: (p: Painel) => string;
  painelId: string | null;
  aoEscolher: (id: string) => void;
  resumo: Map<string, ResumoDoPainel>;
  /** Relê o resumo (abriu, encerrou ou incluiu). */
  aoMudar: () => void;
  tvs: (p: Painel) => TvsDoPainel;
}) {
  const todos = useMemo(() => grupos.flatMap(g => g.paineis), [grupos]);

  if (!todos.length) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Crie um painel de TV primeiro: o jogo passa na TV dele.</p>;
  }

  const painel = todos.find(p => p.id === painelId) ?? todos[0];
  const doPainel = resumo.get(painel.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <nav className="space-y-5">
        {grupos.map(g => (
          <div key={g.setorId} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.nome}</div>
            {g.paineis.map(p => {
              const r = resumo.get(p.id);
              return (
                <button key={p.id} type="button" onClick={() => aoEscolher(p.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${p.id === painel.id ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                  <div className="font-semibold truncate">{p.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">{rotulo(p)}</div>
                  {r?.aberta
                    ? <SeloBingoNoAr pedras={r.aberta.pedras} jogando={r.aberta.participantes} />
                    : (
                      <div className="text-xs mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                        Sem jogo agora{r?.anteriores.length ? ` · ${r.anteriores.length} anterior${r.anteriores.length > 1 ? 'es' : ''}` : ''}
                      </div>
                    )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-5 min-w-0">
        <div>
          <h2 className="text-lg font-semibold">{painel.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {grupos.find(g => g.paineis.includes(painel))?.nome} · {rotulo(painel)}. Só jogam pessoas daqui, e só quem você escolher.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CardJogo icone={<Dices className="h-5 w-5" />} nome="Bingo" texto="Cartela na tela de cada um, sorteio na TV." ativo />
          <CardJogo icone={<Sparkles className="h-5 w-5" />} nome="Roleta" texto="Em breve." />
          <CardJogo icone={<Users className="h-5 w-5" />} nome="Sorteio de pessoa" texto="Em breve." />
        </div>

        <BingoDoPainel key={painel.id} painelId={painel.id} tvs={tvs(painel)} aoMudar={aoMudar} />

        <JogosAnteriores anteriores={doPainel?.anteriores ?? []} />
      </div>
    </div>
  );
}

function JogosAnteriores({ anteriores }: { anteriores: ResumoDoPainel['anteriores'] }) {
  if (!anteriores.length) return null;
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <h3 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" />Jogos anteriores desta TV</h3>
      <div className="divide-y">
        {anteriores.map(a => (
          <div key={a.id} className="py-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-medium">Bingo · {TEMAS_BINGO.find(t => t.id === a.tema)?.nome ?? a.tema}</span>
            <span className="text-muted-foreground">{quando(a.criada_em)}{a.criada_por ? ` · por ${a.criada_por}` : ''}</span>
            <span className="text-muted-foreground">{a.participantes} jogaram · {a.pedras} pedras</span>
            <span className="basis-full text-xs">
              {a.ganhadores.length ? <>Ganharam: <b>{a.ganhadores.join(', ')}</b></> : <span className="text-muted-foreground">Ninguém foi comemorado.</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardJogo({ icone, nome, texto, ativo }: { icone: React.ReactNode; nome: string; texto: string; ativo?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${ativo ? 'border-primary bg-primary/5' : 'opacity-60'}`}>
      <span className={`rounded-lg p-2 ${ativo ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{icone}</span>
      <div><div className="font-semibold">{nome}</div><div className="text-xs text-muted-foreground">{texto}</div></div>
    </div>
  );
}

// ── O bingo de um painel ─────────────────────────────────────────────────────

function BingoDoPainel({ painelId, tvs, aoMudar }: { painelId: string; tvs: TvsDoPainel; aoMudar: () => void }) {
  const [controle, setControle] = useState<ControleBingo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [faltaMigration, setFaltaMigration] = useState(false);

  const ler = useCallback(async () => {
    try {
      setControle(await partidaDoPainel(painelId));
      setFaltaMigration(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (/does not exist|schema cache|PGRST20[25]|42883/i.test(m)) setFaltaMigration(true);
      else toast.error(m || 'Não deu para carregar o bingo.');
    } finally {
      setCarregando(false);
    }
  }, [painelId]);

  useEffect(() => { void ler(); }, [ler]);

  if (carregando) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
  if (faltaMigration) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
        <p className="font-semibold">O Bingo ainda não está no banco.</p>
        <p className="text-muted-foreground mt-1">Falta aplicar a migration <code>20261030200000_modo_tv_bingo.sql</code>. A demonstração já funciona: <a className="underline" href="#/tv?demo=1&bingo=1" target="_blank" rel="noreferrer">ver na TV</a>.</p>
      </div>
    );
  }
  if (!controle) return <NovaPartida painelId={painelId} aoCriar={() => { void ler(); aoMudar(); }} />;
  return <PartidaEmJogo inicial={controle} tvs={tvs} aoEncerrar={() => { setControle(null); aoMudar(); }} aoMudar={aoMudar} />;
}

/** A faixa de cima da partida: a TV está mostrando o jogo — ou não há TV ligada para mostrar. */
function FaixaAoVivo({ tvs }: { tvs: TvsDoPainel }) {
  if (!tvs.ligadas) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
        <PontoAoVivo cor="bg-amber-500" />
        <span>
          <b>Nenhuma TV deste painel está ligada.</b>{' '}
          <span className="text-muted-foreground">
            {tvs.total ? 'As cartelas funcionam, mas ninguém vê o sorteio na parede.' : 'Conecte uma TV na aba Painéis para o sorteio aparecer na parede.'}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wider text-white">
        <PontoAoVivo cor="bg-white" />AO VIVO
      </span>
      <span>
        <b>A TV está transmitindo este bingo.</b>{' '}
        <span className="text-muted-foreground">
          {tvs.total > 1 ? `${tvs.ligadas} de ${tvs.total} TVs ligadas. ` : ''}O rodízio de telas volta quando você encerrar.
        </span>
      </span>
    </div>
  );
}

// ── Criar ────────────────────────────────────────────────────────────────────

function NovaPartida({ painelId, aoCriar }: { painelId: string; aoCriar: () => void }) {
  const [tema, setTema] = useState<TemaBingoId>('chiclete');
  const [candidatos, setCandidatos] = useState<CandidatoBingo[]>([]);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [autoMarcar, setAutoMarcar] = useState(120);
  const [premioQuina, setPremioQuina] = useState('');
  const [premioBingo, setPremioBingo] = useState('');
  const [som, setSom] = useState(true);
  const [criando, setCriando] = useState(false);
  const { onlineIds } = useOnlineUsers();

  useEffect(() => {
    listarCandidatos(painelId).then(setCandidatos, e => toast.error(e instanceof Error ? e.message : 'Não deu para listar as pessoas.'));
  }, [painelId]);

  const equipes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidatos) if (c.equipe_id && c.equipe_nome) m.set(c.equipe_id, c.equipe_nome);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [candidatos]);

  const visiveis = candidatos.filter(c => !busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const alternar = (ids: string[], ligar: boolean) => setEscolhidos(s => {
    const n = new Set(s);
    for (const id of ids) { if (ligar) n.add(id); else n.delete(id); }
    return n;
  });

  const criar = async () => {
    setCriando(true);
    try {
      await criarPartida({ painelId, tema, participantes: [...escolhidos], autoMarcarS: autoMarcar, premioQuina, premioBingo, somNaTv: som });
      toast.success('Partida aberta! A TV e as cartelas já estão chegando.');
      aoCriar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para abrir a partida.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="font-semibold">Tema</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TEMAS_BINGO.map(t => (
              <button key={t.id} type="button" disabled={!t.pronto} onClick={() => setTema(t.id)}
                className={`rounded-xl border p-3 text-left transition ${tema === t.id ? 'border-primary ring-2 ring-primary' : 'hover:bg-accent'} ${t.pronto ? '' : 'opacity-50 cursor-not-allowed'}`}>
                <div className="font-medium text-sm">{t.nome}</div>
                <div className="text-xs text-muted-foreground">{t.pronto ? t.descricao : 'Em breve'}</div>
              </button>
            ))}
          </div>
          <PreviaDoTema id={tema} />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold mr-auto">Quem joga <span className="text-muted-foreground font-normal">({escolhidos.size} de {candidatos.length})</span></h3>
            <Button size="sm" variant="outline" onClick={() => alternar(candidatos.map(c => c.id), true)}>Todos</Button>
            <Button size="sm" variant="outline" onClick={() => alternar(candidatos.filter(c => onlineIds.has(c.id)).map(c => c.id), true)}>Quem está online</Button>
            <Button size="sm" variant="ghost" onClick={() => setEscolhidos(new Set())}>Limpar</Button>
          </div>
          {equipes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {equipes.map(([id, nome]) => (
                <button key={id} type="button" className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                  onClick={() => alternar(candidatos.filter(c => c.equipe_id === id).map(c => c.id), true)}>
                  + Equipe {nome}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar pelo nome" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded-xl border divide-y">
            {visiveis.map(c => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-accent">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={escolhidos.has(c.id)} onChange={e => alternar([c.id], e.target.checked)} />
                <span className={`h-2 w-2 rounded-full ${onlineIds.has(c.id) ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} title={onlineIds.has(c.id) ? 'Online agora' : 'Fora do sistema'} />
                <span className="flex-1 truncate">{c.nome}</span>
                {c.equipe_nome && <span className="text-xs text-muted-foreground truncate">{c.equipe_nome}</span>}
              </label>
            ))}
            {!visiveis.length && <p className="p-4 text-sm text-muted-foreground">Ninguém com esse nome.</p>}
          </div>
        </section>
      </div>

      <div className="space-y-4 rounded-xl border p-4 self-start">
        <h3 className="font-semibold">Regras da partida</h3>
        <div className="space-y-1.5">
          <Label>Quem não marcar, a cartela marca sozinha depois de</Label>
          <div className="flex rounded-md border overflow-hidden">
            {[60, 120, 180, 300].map(s => (
              <button key={s} type="button" onClick={() => setAutoMarcar(s)}
                className={`flex-1 h-9 text-sm ${autoMarcar === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{s / 60} min</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Prêmio da quina (opcional)</Label>
          <Input maxLength={60} value={premioQuina} onChange={e => setPremioQuina(e.target.value)} placeholder="Ex.: Caixa de bombom" />
        </div>
        <div className="space-y-1.5">
          <Label>Prêmio do bingo (opcional)</Label>
          <Input maxLength={60} value={premioBingo} onChange={e => setPremioBingo(e.target.value)} placeholder="Ex.: Vale-folga" />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          Som na TV <Switch checked={som} onCheckedChange={setSom} />
        </label>
        <p className="text-xs text-muted-foreground">
          Bingo de 75 bolas, cartela 5×5 com estrela no meio. Cartelas e pedras são sorteadas pelo banco.
          Abrir a partida põe a TV no bingo até você encerrar.
        </p>
        <Button className="w-full" size="lg" disabled={!escolhidos.size || criando} onClick={criar}>
          {criando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Abrir partida com {escolhidos.size} {escolhidos.size === 1 ? 'pessoa' : 'pessoas'}
        </Button>
      </div>
    </div>
  );
}

function PreviaDoTema({ id }: { id: TemaBingoId }) {
  const tema = useTemaBingo(id);
  if (!tema) return null;
  const exemplo = [3, 22, 41, 50, 67, 11, 17, 38, 59, 72, 7, 29, 0, 46, 64, 14, 25, 33, 55, 61, 1, 19, 44, 52, 75];
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-xl p-4" style={{ background: tema.fundoTv, color: tema.texto, fontFamily: tema.familia }}>
      <tema.Maquina girando={false} tamanho={120} />
      <tema.Bola numero={41} tamanho={96} />
      <Cartela tema={tema} numeros={exemplo} marcadas={new Set([3, 22, 41, 50])} auto={new Set([17])} celula={30} />
    </div>
  );
}

// ── Em jogo ──────────────────────────────────────────────────────────────────

function PartidaEmJogo({ inicial, tvs, aoEncerrar, aoMudar }: {
  inicial: ControleBingo; tvs: TvsDoPainel; aoEncerrar: () => void; aoMudar: () => void;
}) {
  const [c, setC] = useState(inicial);
  const cRef = useRef(c);
  cRef.current = c;
  const id = c.partida.id;
  const tema = useTemaBingo(c.partida.tema);
  const [sorteando, setSorteando] = useState(false);
  const [aberta, setAberta] = useState<PessoaNoGrupo | null>(null);
  const [comemorando, setComemorando] = useState(false);
  const [incluindo, setIncluindo] = useState(false);
  const diferenca = useRef(0);

  const reler = useCallback(async () => {
    try {
      const novo = await lerControle(id);
      if (novo.agora) diferenca.current = Date.parse(novo.agora) - Date.now();
      if (novo.partida.estado !== 'aberta') { aoEncerrar(); return; }
      setC(novo);
    } catch { /* segura o que tem */ }
  }, [id, aoEncerrar]);

  useEffect(() => assinarTabela(
    { topico: `bingo:${id}`, escutas: [{ sinal: 'bingo' }] },
    {
      onSinal: (payload) => {
        const aviso = lerAviso(payload);
        if (!aviso || aviso.partida !== id) return;
        if (aviso.tipo === 'pedra') {
          const como = encaixa(cRef.current.pedras, aviso);
          if (como === 'nova') { setC(x => ({ ...x, pedras: [...x.pedras, aviso.numero] })); return; }
          if (como === 'repetida') return;
        }
        if (aviso.tipo === 'grito') toast(`Alguém gritou ${nomeDaVitoria(aviso.grito)}!`, { icon: '📣' });
        void reler();
      },
      onReconectado: () => { void reler(); },
    },
  ), [id, reler]);

  // O automático também roda daqui (a TV faz o mesmo; o banco sorteia uma vez só).
  const p = c.partida;
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!p.auto_intervalo_s || p.auto_pausado || !p.proxima_pedra_em || c.pedras.length >= TOTAL_PEDRAS) return;
    const falta = Date.parse(p.proxima_pedra_em) - (Date.now() + diferenca.current);
    const t = setTimeout(() => {
      // A resposta traz a hora da próxima (saiu ou «ainda não»): recalibra
      // sem reler a partida. A pedra em si chega pelo aviso.
      void sortearPedra(id, true)
        .then((r): void => {
          if (r.proxima_pedra_em !== undefined) {
            setC(x => ({ ...x, partida: { ...x.partida, proxima_pedra_em: r.proxima_pedra_em ?? null } }));
          }
        }, (): void => undefined)
        .finally(() => setTentativa(n => n + 1));
    }, Math.max(300, falta + 200 + Math.random() * 600));
    return () => clearTimeout(t);
  }, [id, p.auto_intervalo_s, p.auto_pausado, p.proxima_pedra_em, c.pedras.length, tentativa, reler]);

  const grupos = useMemo(() => gruposDoLider(c.cartelas, c.pedras), [c.cartelas, c.pedras]);
  const ultima = c.pedras[c.pedras.length - 1];

  const sortear = async () => {
    setSorteando(true);
    try {
      const r = await sortearPedra(id);
      if (!r.ok) toast.error(r.motivo ?? 'Não deu para sortear.');
      else if (r.numero != null) setC(x => (x.pedras.length + 1 === r.ordem ? { ...x, pedras: [...x.pedras, r.numero!] } : x));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para sortear.');
    } finally {
      // A TV leva ~5 s para mostrar a pedra: o botão segura esse tempo para ninguém atropelar a animação.
      setTimeout(() => setSorteando(false), 4500);
    }
  };

  const automatico = async (intervalo: number | null, pausado: boolean) => {
    try { await mudarAutomatico(id, intervalo, pausado); await reler(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não deu para mudar o automático.'); }
  };

  const encerrar = async () => {
    if (!window.confirm('Encerrar a partida? A TV volta ao rodízio e as cartelas somem da tela de todos.')) return;
    try { await encerrarPartida(id); toast.success('Partida encerrada.'); aoEncerrar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não deu para encerrar.'); }
  };

  if (!tema) return null;
  const nomeTema = TEMAS_BINGO.find(t => t.id === c.partida.tema)?.nome;

  return (
    <div className="space-y-5">
      <FaixaAoVivo tvs={tvs} />

      {/* O sorteio */}
      <div className="rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-5" style={{ background: tema.fundoTv, color: tema.texto, fontFamily: tema.familia }}>
        <div className="flex items-center gap-4">
          {ultima != null ? <tema.Bola numero={ultima} tamanho={110} brilho /> : <tema.Maquina girando={false} tamanho={110} />}
          <div>
            <div className="text-sm" style={{ color: tema.suave }}>{nomeTema} · {c.partida.participantes} jogando</div>
            <div className="text-2xl font-bold">{ultima != null ? `${letraDe(ultima)} ${ultima}` : 'Nenhuma pedra ainda'}</div>
            <div className="text-sm" style={{ color: tema.suave }}>Pedra {c.pedras.length} de {TOTAL_PEDRAS}</div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="lg" className="text-lg h-14 px-8" disabled={sorteando || c.pedras.length >= TOTAL_PEDRAS} onClick={sortear}>
            {sorteando ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Dices className="h-5 w-5 mr-2" />}
            Sortear pedra
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
        <span className="font-medium mr-1">Automático</span>
        {[null, 20, 30, 60].map(s => (
          <button key={String(s)} type="button" onClick={() => void automatico(s, false)}
            className={`h-8 rounded-full border px-3 ${c.partida.auto_intervalo_s === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}>
            {s == null ? 'Desligado' : `a cada ${s} s`}
          </button>
        ))}
        {c.partida.auto_intervalo_s != null && (
          <Button size="sm" variant={c.partida.auto_pausado ? 'default' : 'outline'} onClick={() => void automatico(c.partida.auto_intervalo_s, !c.partida.auto_pausado)}>
            {c.partida.auto_pausado ? <><Play className="h-4 w-4 mr-1" />Continuar</> : <><Pause className="h-4 w-4 mr-1" />Pausar</>}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setIncluindo(true)}><UserPlus className="h-4 w-4 mr-1" />Incluir pessoas</Button>
          <Button size="sm" onClick={() => setComemorando(true)}><Crown className="h-4 w-4 mr-1" />Comemorar ganhador</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={encerrar}><Square className="h-4 w-4 mr-1" />Encerrar</Button>
        </div>
      </div>

      {/* Os gritos */}
      {c.cartelas.some(x => x.gritou_em) && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 space-y-1.5">
          <div className="text-sm font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4" />Gritaram</div>
          <div className="flex flex-wrap gap-2">
            {[...c.cartelas].filter(x => x.gritou_em).sort((a, b) => (b.gritou_em ?? '').localeCompare(a.gritou_em ?? '')).map(x => (
              <button key={x.perfil_id} type="button" onClick={() => setAberta({ cartela: x, sorte: [] })}
                className="rounded-full bg-background border px-3 py-1 text-sm hover:bg-accent">
                <b>{x.nome.split(' ')[0]}</b> · {nomeDaVitoria(x.gritou_tipo ?? 'quina')} · {new Date(x.gritou_em!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Os quatro grupos */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Grupo titulo="Perto da quina" dica="Falta 1 pedra numa linha, coluna ou diagonal" pessoas={grupos.pertoDaQuina} aoAbrir={setAberta} />
        <Grupo titulo="Já fizeram quina" pessoas={grupos.fezQuina} aoAbrir={setAberta} />
        <Grupo titulo="Perto da cartela cheia" dica="Faltam até 3 pedras" pessoas={grupos.pertoDaCheia} aoAbrir={setAberta} />
        <Grupo titulo="BINGO" dica="Cartela completa" pessoas={grupos.bingo} aoAbrir={setAberta} destaque />
      </div>

      {/* As pedras que saíram */}
      <div className="rounded-xl border p-3">
        <div className="text-sm font-medium mb-2">Pedras que saíram</div>
        <div className="flex flex-wrap gap-1.5">
          {c.pedras.map((n, i) => (
            <span key={n} className={`rounded-md px-2 py-1 text-sm font-semibold tabular-nums ${i === c.pedras.length - 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {letraDe(n)}{n}
            </span>
          ))}
          {!c.pedras.length && <span className="text-sm text-muted-foreground">Nenhuma ainda.</span>}
        </div>
      </div>

      <Dialog open={!!aberta} onOpenChange={o => { if (!o) setAberta(null); }}>
        <DialogContent className="max-w-md" aria-describedby="bingo-cartela-descricao">
          {aberta && <CartelaDoParticipante pessoa={aberta} pedras={c.pedras} tema={tema} />}
        </DialogContent>
      </Dialog>

      <DialogComemorar aberto={comemorando} controle={c} tema={tema} aoFechar={() => setComemorando(false)} aoComemorar={reler} />
      <DialogIncluir aberto={incluindo} controle={c} aoFechar={() => setIncluindo(false)} aoIncluir={() => { void reler(); aoMudar(); }} />
    </div>
  );
}

function Grupo({ titulo, dica, pessoas, aoAbrir, destaque }: {
  titulo: string; dica?: string; pessoas: PessoaNoGrupo[]; aoAbrir: (p: PessoaNoGrupo) => void; destaque?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${destaque && pessoas.length ? 'border-emerald-500 bg-emerald-500/10' : ''}`}>
      <div>
        <div className="font-semibold">{titulo} <span className="text-muted-foreground font-normal">({pessoas.length})</span></div>
        {dica && <div className="text-xs text-muted-foreground">{dica}</div>}
      </div>
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
        {pessoas.map(p => (
          <button key={p.cartela.perfil_id} type="button" onClick={() => aoAbrir(p)}
            className="w-full rounded-lg border bg-background px-2.5 py-2 text-left hover:bg-accent">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium truncate flex-1">{p.cartela.nome}</span>
              {p.cartela.gritou_em && <Megaphone className="h-3.5 w-3.5 text-amber-600" />}
            </div>
            {!!p.sorte.length && (
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="text-[11px] text-muted-foreground mr-0.5">pedras da sorte:</span>
                {p.sorte.map(n => <span key={n} className="rounded bg-amber-500/20 px-1.5 text-[11px] font-semibold tabular-nums">{letraDe(n)}{n}</span>)}
              </div>
            )}
          </button>
        ))}
        {!pessoas.length && <p className="text-xs text-muted-foreground">Ninguém ainda.</p>}
      </div>
    </div>
  );
}

function CartelaDoParticipante({ pessoa, pedras, tema }: { pessoa: PessoaNoGrupo; pedras: number[]; tema: TemaBingo }) {
  const sorteadas = new Set(pedras);
  const n = pessoa.cartela.numeros;
  const linha = padrao(n, sorteadas, 'cheia') ?? padrao(n, sorteadas, 'quina') ?? [];
  return (
    <>
      <DialogHeader>
        <DialogTitle>{pessoa.cartela.nome}</DialogTitle>
        <DialogDescription id="bingo-cartela-descricao">
          {pessoa.cartela.equipe_nome ? `Equipe ${pessoa.cartela.equipe_nome} · ` : ''}
          Marcado = pedra que já saiu.{pessoa.sorte.length ? ' Em destaque, as pedras da sorte.' : ''}
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center rounded-xl p-4" style={{ background: tema.fundoTv }}>
        <Cartela tema={tema} numeros={n} marcadas={sorteadas} vence={linha} sorte={pessoa.sorte} celula={54} />
      </div>
    </>
  );
}

function DialogComemorar({ aberto, controle, tema, aoFechar, aoComemorar }: {
  aberto: boolean; controle: ControleBingo; tema: TemaBingo; aoFechar: () => void; aoComemorar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoVitoria>('quina');
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const lista = useMemo(() => elegiveis(controle.cartelas, controle.pedras, tipo), [controle, tipo]);
  const jaComemorados = useMemo(() => new Set(controle.vitorias.filter(v => v.tipo === tipo).flatMap(v => v.ganhadores ?? [])), [controle.vitorias, tipo]);

  useEffect(() => { if (aberto) setEscolhidos(new Set()); }, [aberto, tipo]);

  const soltar = async () => {
    setEnviando(true);
    try {
      await comemorar(controle.partida.id, tipo, [...escolhidos]);
      toast.success('Comemoração no ar!');
      aoFechar();
      aoComemorar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para comemorar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5" />Comemorar ganhador</DialogTitle>
          <DialogDescription>Só aparece quem completou de verdade, pelas pedras que saíram. A TV e todos os jogadores veem a cartela de cada um.</DialogDescription>
        </DialogHeader>
        <div className="flex rounded-md border overflow-hidden">
          {(['quina', 'cheia'] as TipoVitoria[]).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`flex-1 h-10 text-sm font-medium ${tipo === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {t === 'quina' ? 'Quina' : 'Cartela cheia (BINGO)'}
            </button>
          ))}
        </div>
        <div className="max-h-[320px] overflow-y-auto space-y-1.5">
          {lista.map(x => (
            <label key={x.perfil_id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-accent">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={escolhidos.has(x.perfil_id)}
                onChange={e => setEscolhidos(s => { const n = new Set(s); if (e.target.checked) n.add(x.perfil_id); else n.delete(x.perfil_id); return n; })} />
              <span className="flex-1 truncate">{x.nome}</span>
              {x.gritou_em && <span className="text-xs text-amber-600 flex items-center gap-1"><Megaphone className="h-3 w-3" />gritou</span>}
              {jaComemorados.has(x.perfil_id) && <span className="text-xs text-muted-foreground">já comemorado</span>}
            </label>
          ))}
          {!lista.length && <p className="text-sm text-muted-foreground p-2">Ninguém completou {tipo === 'quina' ? 'uma quina' : 'a cartela'} ainda.</p>}
        </div>
        {escolhidos.size > 0 && (
          <div className="rounded-xl p-3 flex justify-center" style={{ background: tema.fundoTv }}>
            {(() => {
              const x = controle.cartelas.find(k => escolhidos.has(k.perfil_id));
              if (!x) return null;
              const s = new Set(controle.pedras);
              return <Cartela tema={tema} numeros={x.numeros} marcadas={s} vence={padrao(x.numeros, s, tipo) ?? []} celula={34} rotulo={`Cartela de ${x.nome}`} />;
            })()}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={!escolhidos.size || enviando} onClick={soltar}>
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />}
            Soltar a comemoração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogIncluir({ aberto, controle, aoFechar, aoIncluir }: {
  aberto: boolean; controle: ControleBingo; aoFechar: () => void; aoIncluir: () => void;
}) {
  const [candidatos, setCandidatos] = useState<CandidatoBingo[]>([]);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const jogando = useMemo(() => new Set(controle.cartelas.map((x: CartelaNoControle) => x.perfil_id)), [controle.cartelas]);

  useEffect(() => {
    if (!aberto) return;
    setEscolhidos(new Set());
    listarCandidatos(controle.partida.painel_id).then(setCandidatos, () => {});
  }, [aberto, controle.partida.painel_id]);

  const fora = candidatos.filter(x => !jogando.has(x.id));

  const incluir = async () => {
    setEnviando(true);
    try {
      const n = await incluirParticipantes(controle.partida.id, [...escolhidos]);
      toast.success(n === 1 ? '1 pessoa entrou na partida.' : `${n} pessoas entraram na partida.`);
      aoFechar();
      aoIncluir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para incluir.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Incluir pessoas</DialogTitle>
          <DialogDescription>Quem entra agora ganha uma cartela; as pedras que já saíram ficam para marcar.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[360px] overflow-y-auto rounded-xl border divide-y">
          {fora.map(x => (
            <label key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-accent">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={escolhidos.has(x.id)}
                onChange={e => setEscolhidos(s => { const n = new Set(s); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} />
              <span className="flex-1 truncate">{x.nome}</span>
            </label>
          ))}
          {!fora.length && <p className="p-4 text-sm text-muted-foreground">Todo mundo do painel já está jogando.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={!escolhidos.size || enviando} onClick={incluir}>Incluir {escolhidos.size || ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
