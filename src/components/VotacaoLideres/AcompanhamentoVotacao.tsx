/**
 * AcompanhamentoVotacao — acompanhar a votação enquanto ela corre (10/11/2026).
 *
 * Abre do painel «Votações valendo» (Configurações › Votação da Liderança),
 * em tela cheia, em duas abas:
 *
 *   Participação  quanto já votou, por setor (o mais atrasado primeiro), cada
 *                 pessoa com o horário e o tempo que levou, filtros e «Copiar
 *                 quem falta» para cobrar no chat.
 *   Parcial       quem está na frente em cada pergunta, os empates de agora e
 *                 os mais votados no geral. Fica tampada até clicar «Mostrar a
 *                 parcial» — a tela pode estar aberta numa reunião.
 *
 * As contas moram em `acompanhamento.ts`; o banco, em `lerAcompanhamento`.
 * Lê ao abrir, no «Atualizar» e a cada minuto com a aba à vista.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  BarChart3, CheckCircle2, Clock, Copy, Eye, EyeOff, Loader2, RefreshCw, Search, Trophy, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { nomeCurto, type ResultadoDaPergunta } from './cedula';
import { lerAcompanhamento, mensagemDoErro, type ApuracaoDaVotacao, type EstadoDaVotacao } from './banco';
import {
  montarAcompanhamento, passaNoFiltro, textoDeQuemFalta, type FiltroDeStatus,
} from './acompanhamento';
import { FotoLider } from './FotoLider';

const A_CADA_MS = 60_000;

const hora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '');
const minutosEmTexto = (m: number) => (m < 1 ? 'menos de 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

interface Props {
  votacaoId: string;
  titulo: string;
  estado: EstadoDaVotacao;
  onFechar: () => void;
}

type Aba = 'participacao' | 'parcial';

export function AcompanhamentoVotacao({ votacaoId, titulo, estado, onFechar }: Props) {
  const [dados, setDados] = useState<{ retrato: ApuracaoDaVotacao; comParcial: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [lidoEm, setLidoEm] = useState<Date | null>(null);
  const [aba, setAba] = useState<Aba>('participacao');
  const [status, setStatus] = useState<FiltroDeStatus>('todos');
  const [setor, setSetor] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [parcialVisivel, setParcialVisivel] = useState(false);
  const [soEmpates, setSoEmpates] = useState(false);

  const carregar = useCallback(async () => {
    setLendo(true);
    try {
      setDados(await lerAcompanhamento(votacaoId));
      setErro(null);
      setLidoEm(new Date());
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setLendo(false);
    }
  }, [votacaoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Só a votação aberta muda sozinha; e só com a aba à vista.
  useEffect(() => {
    if (estado !== 'aberta') return undefined;
    const relogio = window.setInterval(() => { if (document.visibilityState === 'visible') void carregar(); }, A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar, estado]);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla); };
  }, [onFechar]);

  const a = useMemo(() => (dados ? montarAcompanhamento(dados.retrato) : null), [dados]);
  const lista = useMemo(
    () => (a ? a.pessoas.filter(p => passaNoFiltro(p, { status, setor, busca })) : []),
    [a, status, setor, busca],
  );

  const copiarQuemFalta = async () => {
    if (!a) return;
    try {
      await navigator.clipboard.writeText(textoDeQuemFalta(titulo, a.pessoas));
      toast.success(a.resumo.faltam ? `Copiado: ${a.resumo.faltam} que faltam` : 'Copiado: todos já votaram');
    } catch {
      toast.error('Não deu para copiar', { description: 'O navegador não deixou usar a área de transferência.' });
    }
  };

  const cartao = (valor: FiltroDeStatus, rotulo: string, numero: number, cor: string) => (
    <button
      type="button"
      aria-pressed={status === valor}
      onClick={() => { setAba('participacao'); setStatus(s => (s === valor && valor !== 'todos' ? 'todos' : valor)); }}
      className={cn('rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50',
        status === valor && aba === 'participacao' && 'border-primary ring-1 ring-primary/40')}
    >
      <p className={cn('text-2xl font-bold tabular-nums', cor)}>{numero}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={`Acompanhamento: ${titulo}`}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><BarChart3 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Votação da Liderança · acompanhamento</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {titulo}{lidoEm ? ` · atualizado às ${lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              {estado === 'aberta' ? ' · atualiza sozinho a cada minuto' : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={lendo} onClick={() => void carregar()}>
            <RefreshCw className={cn('h-3.5 w-3.5', lendo && 'animate-spin')} /> <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar o acompanhamento"><X className="h-5 w-5" /></Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {erro && !a && (
          <div className="mx-auto mt-10 max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p>Não deu para abrir o acompanhamento: {erro}</p>
            <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
          </div>
        )}
        {!erro && !a && (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</p>
        )}

        {a && (
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-16 pt-5 sm:px-6">
            {/* Resumo: os três primeiros filtram a lista. */}
            <section aria-label="Resumo" className="space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cartao('todos', 'Participantes', a.resumo.participantes, '')}
                {cartao('votaram', 'Já votaram', a.resumo.votaram, 'text-success')}
                {cartao('faltam', 'Faltam', a.resumo.faltam, a.resumo.faltam ? 'text-warning' : 'text-success')}
                <div className="rounded-lg border bg-card px-3 py-2">
                  <p className="text-2xl font-bold tabular-nums">{a.resumo.tempoTipico === null ? '—' : minutosEmTexto(a.resumo.tempoTipico)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tempo típico para votar</p>
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">
                    {a.resumo.ultimoVoto ? `Último voto: ${hora(a.resumo.ultimoVoto)}` : 'Ninguém votou ainda'}
                  </span>
                  <span className="font-semibold tabular-nums">{a.resumo.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${a.resumo.pct}%` }} />
                </div>
              </div>
            </section>

            <div role="tablist" aria-label="Acompanhar" className="flex w-fit overflow-hidden rounded-md border text-xs">
              {([['participacao', 'Participação', Users], ['parcial', 'Parcial dos votos', Trophy]] as const).map(([v, t, Icone]) => (
                <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 font-medium', aba === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  <Icone className="h-3.5 w-3.5" /> {t}
                </button>
              ))}
            </div>

            {aba === 'participacao' && (
              <>
                <section aria-label="Por setor" className="space-y-1.5 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Por setor</h3>
                    {setor && (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setSetor(null)}>Todos os setores</button>
                    )}
                  </div>
                  <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {a.setores.map(s => (
                      <li key={s.setor}>
                        <button type="button" aria-pressed={setor === s.setor} onClick={() => setSetor(x => (x === s.setor ? null : s.setor))}
                          className={cn('w-full rounded-md px-1.5 py-1 text-left hover:bg-muted', setor === s.setor && 'bg-primary/10')}>
                          <span className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate font-medium">{s.setor}</span>
                            <span className={cn('shrink-0 tabular-nums', s.votaram === s.total ? 'text-success' : 'text-muted-foreground')}>
                              {s.votaram} de {s.total}
                            </span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <span className={cn('block h-full rounded-full', s.votaram === s.total ? 'bg-success' : 'bg-primary')} style={{ width: `${s.pct}%` }} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section aria-label="Pessoas" className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar pelo nome" className="h-8 pl-8 text-xs" aria-label="Procurar pelo nome" />
                    </div>
                    <div role="radiogroup" aria-label="Mostrar" className="flex overflow-hidden rounded-md border text-xs">
                      {([['todos', 'Todos'], ['votaram', 'Votaram'], ['faltam', 'Faltam']] as const).map(([v, t]) => (
                        <button key={v} type="button" role="radio" aria-checked={status === v} onClick={() => setStatus(v)}
                          className={cn('px-2.5 py-1.5', status === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void copiarQuemFalta()}>
                      <Copy className="h-3.5 w-3.5" /> Copiar quem falta
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {lista.length} {lista.length === 1 ? 'pessoa' : 'pessoas'}{setor ? ` · ${setor}` : ''}
                  </p>
                  {lista.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Ninguém neste filtro.</p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {lista.map(p => (
                        <li key={p.id} className={cn('flex items-center gap-2.5 rounded-lg border bg-card p-2', !p.votou && 'border-warning/40')}>
                          <FotoLider lider={p.lider} className="h-9 w-9 shrink-0 text-xs" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.lider.nome}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{p.lider.setor}</p>
                          </div>
                          {p.votou ? (
                            <span className="shrink-0 text-right text-[11px] leading-tight text-success">
                              <span className="flex items-center justify-end gap-1 font-semibold"><CheckCircle2 className="h-3 w-3" /> Votou</span>
                              <span className="text-muted-foreground">{hora(p.enviadoEm)}</span>
                              {p.minutos !== null && <span className="block text-muted-foreground"><Clock className="mr-0.5 inline h-2.5 w-2.5" />{minutosEmTexto(p.minutos)}</span>}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">Falta</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {aba === 'parcial' && (
              <Parcial
                comParcial={dados?.comParcial ?? false}
                visivel={parcialVisivel}
                onMostrar={setParcialVisivel}
                parcial={a.parcial}
                destaques={a.destaques}
                pessoas={a.pessoasPorId}
                soEmpates={soEmpates}
                onSoEmpates={setSoEmpates}
                aberta={estado === 'aberta'}
              />
            )}
          </div>
        )}
      </main>
    </div>,
    document.body,
  );
}

interface PropsParcial {
  comParcial: boolean;
  visivel: boolean;
  onMostrar: (v: boolean) => void;
  parcial: ResultadoDaPergunta[] | null;
  destaques: ReturnType<typeof montarAcompanhamento>['destaques'];
  pessoas: ReturnType<typeof montarAcompanhamento>['pessoasPorId'];
  soEmpates: boolean;
  onSoEmpates: (v: boolean) => void;
  aberta: boolean;
}

function Parcial({ comParcial, visivel, onMostrar, parcial, destaques, pessoas, soEmpates, onSoEmpates, aberta }: PropsParcial) {
  if (!comParcial || !parcial) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        A parcial com a votação aberta só aparece para o super_admin. Encerrada a votação, a contagem aparece aqui.
      </p>
    );
  }
  if (!visivel) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <EyeOff className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-md text-sm text-muted-foreground">
          A parcial mostra quem está na frente em cada pergunta{aberta ? ' enquanto a votação ainda corre' : ''}. Confira se ninguém mais está vendo a tela.
        </p>
        <Button size="sm" className="gap-1" onClick={() => onMostrar(true)}><Eye className="h-3.5 w-3.5" /> Mostrar a parcial</Button>
      </div>
    );
  }

  const empatadas = parcial.filter(r => r.vencedores.length > 1);
  const semVoto = parcial.filter(r => r.total === 0).length;
  const lista = soEmpates ? empatadas : parcial;
  const nome = (id: string) => pessoas.get(id)?.nome ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {aberta ? 'Parcial: ainda pode mudar até encerrar. ' : ''}
          {empatadas.length ? `${empatadas.length} ${empatadas.length === 1 ? 'pergunta empatada' : 'perguntas empatadas'} no 1º lugar agora. ` : 'Nenhum empate no 1º lugar agora. '}
          {semVoto ? `${semVoto} sem voto ainda.` : ''}
        </p>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onMostrar(false)}><EyeOff className="h-3.5 w-3.5" /> Esconder</Button>
      </div>

      {destaques.length > 0 && (
        <section aria-label="Mais votados no geral" className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">Mais votados no geral</h3>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {destaques.slice(0, 5).map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
                <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <FotoLider lider={pessoas.get(d.id)} className="h-8 w-8 shrink-0 text-[10px]" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{nomeCurto(nome(d.id))}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.votos} {d.votos === 1 ? 'voto' : 'votos'}{d.naFrente ? ` · 1º em ${d.naFrente}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div role="radiogroup" aria-label="Perguntas" className="flex w-fit overflow-hidden rounded-md border text-xs">
        {([[false, `Todas (${parcial.length})`], [true, `Só empatadas (${empatadas.length})`]] as const).map(([v, t]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={soEmpates === v} onClick={() => onSoEmpates(v)}
            className={cn('px-2.5 py-1.5', soEmpates === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
        ))}
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {lista.map(r => {
          const empate = r.vencedores.length > 1;
          return (
            <li key={r.pergunta.id} className={cn('rounded-lg border bg-card p-3', empate && 'border-warning/50')}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold"><span className="mr-1">{r.pergunta.emoji}</span>{r.pergunta.texto}</p>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.total} {r.total === 1 ? 'voto' : 'votos'}</span>
              </div>
              {empate && <p className="mb-1.5 text-[11px] font-semibold text-warning">Empate no 1º: {r.vencedores.map(nome).map(nomeCurto).join(', ')}</p>}
              {r.total === 0 ? (
                <p className="text-xs text-muted-foreground">Sem voto ainda.</p>
              ) : (
                <ol className="space-y-1.5">
                  {r.linhas.filter(l => l.votos > 0).slice(0, 3).map(l => (
                    <li key={l.id} className="flex items-center gap-2">
                      <FotoLider lider={pessoas.get(l.id)} className="h-6 w-6 shrink-0 text-[9px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className={cn('truncate', r.vencedores.includes(l.id) && 'font-semibold')}>{nome(l.id)}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{l.votos} · {l.pct.toLocaleString('pt-BR')}%</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className={cn('h-full rounded-full', r.vencedores.includes(l.id) ? 'bg-primary' : 'bg-muted-foreground/40')} style={{ width: `${l.pct}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
