/**
 * As campanhas que o líder lançou — o histórico e o controle de cada uma
 * (Cleber, 07/10/2026; migration 20261007190000).
 *
 * «O líder acompanha quantas campanhas enviou por mês; clicando numa, vê a
 *  mensagem usada e tudo mais. Para cada campanha, quem encaminhou, quantas,
 *  se faltou alguma — com um botão de atualizar. Excluir. E desativar o
 *  acesso: some na hora para todo mundo, ele edita e relança.»
 *
 * Campanha aberta mostra o andamento ao vivo (botão Atualizar); encerrada
 * mostra o placar que a faxina congelou. O repasse de quem faltou (29/09) mora
 * aqui também.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft, CalendarDays, CheckCircle2, Clock, History, Loader2, Pencil, Power, PowerOff,
  RefreshCw, Send, ThumbsDown, ThumbsUp, Trash2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  enviosDoLote, listarOperadoresParaCampanha, mensagensDoLote, placarDosEnvios, situacaoDoLote,
  type EnvioResumo, type LoteCampanha, type PlacarOperador, type SituacaoLote,
} from './campanhaFacilEnvios.service';
import { redistribuir, type MensagemDaCampanha, type OperadorCampanha } from './envios';
import { mensagemUsaValores } from './regras-mensagem';
import { VariableChips, insertVariable } from './VariaveisMensagem';
import type { useEnviosCampanha } from './useEnviosCampanha';

type Envios = ReturnType<typeof useEnviosCampanha>;

// ── Utilitários ──────────────────────────────────────────────────────────────

function quando(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const n = (x: number) => x.toLocaleString('pt-BR');

/** «2026-10» do lançamento (fuso local). */
function chaveMes(l: LoteCampanha): string {
  const d = new Date(l.lancada_em ?? l.criado_em);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nomeMes(chave: string): string {
  const [a, m] = chave.split('-').map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ROTULO: Record<SituacaoLote, string> = { ativa: 'Ativa', desativada: 'Desativada', encerrada: 'Encerrada' };

function SeloSituacao({ s }: { s: SituacaoLote }) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      s === 'ativa' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      s === 'desativada' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      s === 'encerrada' && 'bg-muted text-muted-foreground',
    )}>
      {ROTULO[s]}
    </span>
  );
}

// ── O cartão da lateral ──────────────────────────────────────────────────────

export function HistoricoCampanhas({ envios }: { envios: Envios }) {
  const { historico } = envios;
  const [aberto, setAberto] = useState<LoteCampanha | null>(null);
  const [verTudo, setVerTudo] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const mesAtual = chaveMes({ lancada_em: new Date().toISOString() } as LoteCampanha);
  const doMes = historico.filter((l) => chaveMes(l) === mesAtual);
  const abertas = historico.filter((l) => !l.encerrada_em);
  // A campanha aberta no diálogo acompanha o histórico recarregado.
  const loteAberto = aberto ? (historico.find((l) => l.id === aberto.id) ?? null) : null;

  async function atualizar() {
    setAtualizando(true);
    try { await envios.recarregarHistorico(); } finally { setAtualizando(false); }
  }

  if (envios.carregandoHistorico && historico.length === 0) return null;
  if (historico.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Minhas campanhas</span>
          <Button
            variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => void atualizar()}
            title="Atualizar" aria-label="Atualizar campanhas" disabled={atualizando}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', atualizando && 'animate-spin')} />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-lg font-bold tabular-nums leading-tight">{n(doMes.length)}</p>
            <p className="text-[11px] text-muted-foreground">{doMes.length === 1 ? 'campanha' : 'campanhas'} este mês</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-lg font-bold tabular-nums leading-tight">{n(doMes.reduce((s, l) => s + l.total, 0))}</p>
            <p className="text-[11px] text-muted-foreground">mensagens este mês</p>
          </div>
        </div>

        {abertas.length > 0 ? (
          <ul className="space-y-1.5">
            {abertas.map((l) => (
              <li key={l.id}>
                <LinhaLote l={l} onClick={() => setAberto(l)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma campanha aberta agora.</p>
        )}

        <Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={() => setVerTudo(true)}>
          <History className="h-3.5 w-3.5" /> Histórico completo ({n(historico.length)})
        </Button>
      </CardContent>

      {verTudo && (
        <DialogoHistorico
          historico={historico}
          onFechar={() => setVerTudo(false)}
          onAbrir={(l) => setAberto(l)}
        />
      )}

      {loteAberto && (
        <DialogoCampanha
          key={loteAberto.id}
          lote={loteAberto}
          envios={envios}
          onFechar={() => setAberto(null)}
        />
      )}
    </Card>
  );
}

function LinhaLote({ l, onClick }: { l: LoteCampanha; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={l.titulo}>{l.titulo}</p>
        <p className="text-[11px] text-muted-foreground">
          {quando(l.lancada_em ?? l.criado_em)} · {n(l.total)} {l.total === 1 ? 'mensagem' : 'mensagens'}
          {l.setor_nome ? ` · ${l.setor_nome}` : ''}
        </p>
      </div>
      {(l.votos_bom > 0 || l.votos_ruim > 0) && (
        <span
          className="inline-flex shrink-0 items-center gap-2 text-[11px] font-medium tabular-nums"
          title={`${n(l.votos_bom)} bom retorno · ${n(l.votos_ruim)} sem retorno`}
        >
          <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
            <ThumbsUp className="h-3 w-3" />{n(l.votos_bom)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-red-700 dark:text-red-400">
            <ThumbsDown className="h-3 w-3" />{n(l.votos_ruim)}
          </span>
        </span>
      )}
      <SeloSituacao s={situacaoDoLote(l)} />
    </button>
  );
}

/**
 * O que a operação achou do retorno: cada operador vota uma vez, joinha ou
 * mãozinha para baixo (20261009150000). O líder vê só os números.
 */
function RetornoDaOperacao({ lote, operadores }: { lote: LoteCampanha; operadores: number }) {
  const votos = lote.votos_bom + lote.votos_ruim;
  const pctBom = votos > 0 ? Math.round((lote.votos_bom / votos) * 100) : 0;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">Retorno segundo a operação</h3>
        <span className="text-xs text-muted-foreground">
          {votos === 0
            ? 'ninguém avaliou ainda'
            : `${n(votos)} ${votos === 1 ? 'avaliou' : 'avaliaram'}${operadores > 0 ? ` de ${n(operadores)}` : ''}`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <ThumbsUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-lg font-bold tabular-nums leading-tight text-emerald-700 dark:text-emerald-400">{n(lote.votos_bom)}</p>
            <p className="text-[11px] text-muted-foreground">bom retorno</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
          <ThumbsDown className="h-5 w-5 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-lg font-bold tabular-nums leading-tight text-red-700 dark:text-red-400">{n(lote.votos_ruim)}</p>
            <p className="text-[11px] text-muted-foreground">sem retorno</p>
          </div>
        </div>
      </div>
      {votos > 0 && (
        <div
          className="flex h-1.5 overflow-hidden rounded-full bg-red-500/70"
          role="img" aria-label={`${pctBom}% avaliou bom retorno`}
        >
          <div className="bg-emerald-500" style={{ width: `${pctBom}%` }} />
        </div>
      )}
    </section>
  );
}

// ── Histórico por mês ────────────────────────────────────────────────────────

function DialogoHistorico({ historico, onFechar, onAbrir }: {
  historico: LoteCampanha[]; onFechar: () => void; onAbrir: (l: LoteCampanha) => void;
}) {
  const meses = useMemo(() => {
    const m = new Map<string, LoteCampanha[]>();
    for (const l of historico) {
      const k = chaveMes(l);
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [historico]);
  const [mes, setMes] = useState(() => meses[0]?.[0] ?? '');
  const lista = meses.find(([k]) => k === mes)?.[1] ?? [];
  const totalMsgs = lista.reduce((s, l) => s + l.total, 0);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de campanhas</DialogTitle>
          <DialogDescription>As campanhas que você lançou. Clique numa para ver a mensagem e quem encaminhou.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-9 w-56"><CalendarDays className="mr-2 h-4 w-4 opacity-60" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(([k, ls]) => (
                <SelectItem key={k} value={k}>{nomeMes(k)} ({ls.length})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{n(lista.length)}</strong> {lista.length === 1 ? 'campanha' : 'campanhas'} ·{' '}
            <strong className="text-foreground">{n(totalMsgs)}</strong> mensagens
          </p>
        </div>

        <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {lista.map((l) => (
            <li key={l.id}><LinhaLote l={l} onClick={() => onAbrir(l)} /></li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ── Uma campanha ─────────────────────────────────────────────────────────────

type Placar = PlacarOperador & { repasse?: boolean };

function DialogoCampanha({ lote, envios, onFechar }: { lote: LoteCampanha; envios: Envios; onFechar: () => void }) {
  const situacao = situacaoDoLote(lote);
  const aberta = situacao !== 'encerrada';
  const [enviosLote, setEnviosLote] = useState<EnvioResumo[]>([]);
  const [carregando, setCarregando] = useState(aberta);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [operadoresSetor, setOperadoresSetor] = useState<OperadorCampanha[]>([]);
  const [acao, setAcao] = useState<null | 'repasse' | 'editar' | 'excluir' | 'desativar'>(null);
  const [ocupado, setOcupado] = useState(false);

  const { recarregarHistorico } = envios;
  const carregar = useCallback(async (comHistorico = false) => {
    if (!aberta) return;
    setCarregando(true);
    try {
      // O histórico traz a contagem de votos da campanha.
      if (comHistorico) void recarregarHistorico();
      setEnviosLote(await enviosDoLote(lote.id));
      setAtualizadoEm(new Date());
    } catch (err) {
      console.error('[CampanhaFacil] placar:', err);
    } finally {
      setCarregando(false);
    }
  }, [aberta, lote.id, recarregarHistorico]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Os operadores do setor da campanha: para editar e repassar.
  useEffect(() => {
    if (!aberta || !lote.setor_id) return;
    let vivo = true;
    listarOperadoresParaCampanha(lote.empresa_id, lote.setor_id)
      .then((l) => { if (vivo) setOperadoresSetor(l); })
      .catch((err) => console.warn('[CampanhaFacil] operadores do setor:', err));
    return () => { vivo = false; };
  }, [aberta, lote.empresa_id, lote.setor_id]);

  const placar: Placar[] = aberta ? placarDosEnvios(enviosLote) : (lote.placar ?? []);
  const soma = placar.reduce(
    (s, o) => ({ total: s.total + o.total, enviados: s.enviados + o.enviados, nao: s.nao + o.nao_enviados }),
    { total: 0, enviados: 0, nao: 0 },
  );
  const pendentes = soma.total - soma.enviados - soma.nao;
  const concluiram = placar.filter((o) => o.total > 0 && o.enviados + o.nao_enviados >= o.total).length;

  async function executar(f: () => Promise<boolean>, fechar = false) {
    setOcupado(true);
    try {
      const ok = await f();
      if (ok && fechar) onFechar();
      else if (ok) { setAcao(null); await carregar(); }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-2 pr-6">
            <DialogTitle className="min-w-0 flex-1 leading-snug">{lote.titulo}</DialogTitle>
            <SeloSituacao s={situacao} />
          </div>
          <DialogDescription>
            Lançada {quando(lote.lancada_em ?? lote.criado_em)}
            {lote.setor_nome ? ` · ${lote.setor_nome}` : ''}
            {lote.relancada_em ? ` · relançada ${quando(lote.relancada_em)}` : ''}
            {lote.editada_em ? ` · editada ${quando(lote.editada_em)}` : ''}
            {situacao === 'ativa' && ` · disponível até ${quando(lote.expira_em)}`}
            {situacao === 'desativada' && ` · desativada ${quando(lote.desativada_em)}`}
            {situacao === 'encerrada' && ` · encerrada ${quando(lote.encerrada_em)}`}
          </DialogDescription>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="mensagens" valor={soma.total || lote.total} />
          <Numero rotulo="enviadas" valor={soma.enviados} tom="ok" />
          <Numero rotulo="não deu" valor={soma.nao} tom="alerta" />
          <Numero rotulo="faltam" valor={Math.max(pendentes, 0)} />
        </div>

        <RetornoDaOperacao lote={lote} operadores={placar.length} />

        {/* Quem encaminhou */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Quem encaminhou</h3>
            <span className="text-xs text-muted-foreground">
              {n(concluiram)} de {n(placar.length)} {placar.length === 1 ? 'concluiu' : 'concluíram'}
            </span>
            {aberta && (
              <Button
                variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs"
                onClick={() => void carregar(true)} disabled={carregando}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} /> Atualizar
              </Button>
            )}
          </div>
          {aberta && atualizadoEm && (
            <p className="text-[11px] text-muted-foreground">Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR')}</p>
          )}
          {carregando && placar.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : placar.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Sem registro por operador.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {placar.map((o) => <LinhaPlacar key={o.operador_id} o={o} />)}
            </ul>
          )}
        </section>

        {/* A mensagem */}
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Mensagem usada</h3>
          {lote.modelo ? (
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2.5 text-sm leading-relaxed">
              {lote.modelo}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Esta campanha é de antes do histórico guardar a mensagem.</p>
          )}
          {lote.arquivo_nome && <p className="text-[11px] text-muted-foreground">Arquivo: {lote.arquivo_nome}</p>}
        </section>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="ghost" className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setAcao('excluir')} disabled={ocupado}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <div className="flex flex-wrap gap-2">
            {situacao === 'ativa' && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => setAcao('repasse')} disabled={ocupado || carregando}>
                  <ArrowRightLeft className="h-4 w-4" /> Repassar
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={() => setAcao('desativar')} disabled={ocupado}>
                  <PowerOff className="h-4 w-4" /> Desativar
                </Button>
              </>
            )}
            {situacao === 'desativada' && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => setAcao('editar')} disabled={ocupado || carregando}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button className="gap-1.5" onClick={() => void executar(() => envios.ativar(lote, true))} disabled={ocupado}>
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Liberar de novo
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={acao === 'desativar'} onOpenChange={(v) => { if (!v) setAcao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar esta campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela some na hora da aba Campanhas de WhatsApp de todos os operadores. O que já foi enviado fica registrado.
              Depois você pode editar a mensagem ou quem recebe e liberar de novo. Desativada por mais de 2 dias, ela encerra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executar(() => envios.ativar(lote, false))}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={acao === 'excluir'} onOpenChange={(v) => { if (!v) setAcao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              “{lote.titulo}” some da aba dos operadores e do seu histórico. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executar(() => envios.excluir(lote), true)}
            >Excluir campanha</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {acao === 'repasse' && (
        <DialogoRepasse
          envios={enviosLote}
          operadoresDoSetor={operadoresSetor}
          onFechar={() => setAcao(null)}
          onConfirmar={(faltaram, recebedores) => executar(() => envios.repassar(faltaram, recebedores))}
        />
      )}

      {acao === 'editar' && (
        <DialogoEditarCampanha
          lote={lote}
          envios={enviosLote}
          operadoresDoSetor={operadoresSetor}
          onFechar={() => setAcao(null)}
          onSalvar={async (dados, liberar) => {
            await executar(async () => {
              const ok = await envios.editar({ lote, ...dados });
              if (ok && liberar) await envios.ativar(lote, true);
              return ok;
            });
          }}
        />
      )}
    </Dialog>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: 'ok' | 'alerta' }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className={cn(
        'text-lg font-bold tabular-nums leading-tight',
        tom === 'ok' && 'text-emerald-600 dark:text-emerald-400',
        tom === 'alerta' && valor > 0 && 'text-amber-600 dark:text-amber-400',
      )}>{n(valor)}</p>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function LinhaPlacar({ o }: { o: Placar }) {
  const faltam = Math.max(o.total - o.enviados - o.nao_enviados, 0);
  const pct = o.total > 0 ? Math.round((o.enviados / o.total) * 100) : 0;
  const completo = o.total > 0 && faltam === 0;
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        {completo
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Concluiu" />
          : <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Faltando" />}
        <span className="min-w-0 flex-1 truncate font-medium">{o.nome}</span>
        {o.repasse && <Badge variant="secondary" className="h-4 px-1 text-[10px]">repasse</Badge>}
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <strong className="text-foreground">{n(o.enviados)}</strong>/{n(o.total)}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span>{faltam > 0 ? `faltam ${n(faltam)}` : 'nada pendente'}</span>
        {o.nao_enviados > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <XCircle className="h-3 w-3" /> {n(o.nao_enviados)} não deu
          </span>
        )}
      </p>
    </li>
  );
}

// ── Repasse ──────────────────────────────────────────────────────────────────

/**
 * «Líder fez campanha com todos, três não foram: ele pode escolher um para
 * receber os três, ou separar.» (29/09/2026) — um marcado leva tudo, vários
 * dividem em rodízio. Vai só o que ainda não foi enviado.
 */
function DialogoRepasse({ envios, operadoresDoSetor, onFechar, onConfirmar }: {
  envios: EnvioResumo[];
  operadoresDoSetor: OperadorCampanha[];
  onFechar: () => void;
  onConfirmar: (faltaram: EnvioResumo[], recebedores: OperadorCampanha[]) => Promise<void>;
}) {
  const porOperador = useMemo(() => placarDosEnvios(envios), [envios]);
  const [faltaram, setFaltaram] = useState<Set<string>>(new Set());
  const [recebem, setRecebem] = useState<Set<string>>(() => new Set(porOperador.map((o) => o.operador_id)));
  const [salvando, setSalvando] = useState(false);

  /** Recebedor pode ser qualquer operador do setor, não só quem está na campanha. */
  const candidatos = useMemo(() => {
    const m = new Map<string, OperadorCampanha>();
    for (const o of porOperador) m.set(o.operador_id, { id: o.operador_id, nome: o.nome });
    for (const o of operadoresDoSetor) if (!m.has(o.id)) m.set(o.id, o);
    return [...m.values()].filter((o) => !faltaram.has(o.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [porOperador, operadoresDoSetor, faltaram]);

  const qtdRepasse = porOperador.filter((o) => faltaram.has(o.operador_id)).reduce((s, o) => s + o.total - o.enviados, 0);
  const recebedores = candidatos.filter((o) => recebem.has(o.id));

  function alternar(set: Set<string>, id: string): Set<string> {
    const s = new Set(set);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  }

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar(envios.filter((e) => faltaram.has(e.operador_id)), recebedores);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Repassar contatos de quem faltou</DialogTitle>
          <DialogDescription>
            Marque quem faltou e quem vai receber. Vai só o que ainda não foi enviado. Um recebedor leva tudo; vários dividem em rodízio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <ListaMarcavel
            titulo="Quem faltou"
            itens={porOperador.map((o) => ({ id: o.operador_id, nome: o.nome, extra: n(o.total - o.enviados) }))}
            marcados={faltaram} onAlternar={(id) => setFaltaram((s) => alternar(s, id))}
          />
          <ListaMarcavel
            titulo="Quem recebe"
            itens={candidatos.map((o) => ({ id: o.id, nome: o.nome }))}
            marcados={recebem} onAlternar={(id) => setRecebem((s) => alternar(s, id))}
          />
        </div>

        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">
          {faltaram.size === 0
            ? 'Marque ao menos uma pessoa que faltou.'
            : recebedores.length === 0
              ? 'Marque ao menos uma pessoa para receber.'
              : recebedores.length === 1
                ? <><strong>{n(qtdRepasse)}</strong> mensagens vão para <strong>{recebedores[0].nome}</strong>.</>
                : <><strong>{n(qtdRepasse)}</strong> mensagens divididas entre <strong>{recebedores.length}</strong> operadores.</>}
          {' '}Quem recebe ganha uma notificação e acha as mensagens em Campanhas de WhatsApp.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button className="gap-2" disabled={salvando || faltaram.size === 0 || recebedores.length === 0} onClick={confirmar}>
            <ArrowRightLeft className="h-4 w-4" /> {salvando ? 'Repassando…' : 'Repassar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListaMarcavel({ titulo, itens, marcados, onAlternar }: {
  titulo: string;
  itens: { id: string; nome: string; extra?: string }[];
  marcados: Set<string>;
  onAlternar: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{titulo}</p>
      <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
        {itens.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={marcados.has(o.id)} onCheckedChange={() => onAlternar(o.id)} />
              <span className="flex-1 truncate">{o.nome}</span>
              {o.extra && <span className="text-xs text-muted-foreground">{o.extra}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Editar ───────────────────────────────────────────────────────────────────

/**
 * A campanha desativada: título, mensagem e quem recebe.
 *
 * O que já foi enviado (ou copiado) e o «não deu» ficam com quem tem; os
 * pendentes são redivididos para nivelar — ver `redistribuir`.
 */
function DialogoEditarCampanha({ lote, envios, operadoresDoSetor, onFechar, onSalvar }: {
  lote: LoteCampanha;
  envios: EnvioResumo[];
  operadoresDoSetor: OperadorCampanha[];
  onFechar: () => void;
  onSalvar: (
    dados: { titulo: string; modelo: string | null; partes: ReturnType<typeof redistribuir> },
    liberar: boolean,
  ) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(lote.titulo);
  const [modelo, setModelo] = useState(lote.modelo ?? '');
  const modeloRef = useRef<HTMLTextAreaElement>(null);
  const [mensagens, setMensagens] = useState<MensagemDaCampanha[] | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const daCampanha = useMemo(() => placarDosEnvios(envios), [envios]);
  const candidatos = useMemo(() => {
    const m = new Map<string, OperadorCampanha>();
    for (const o of daCampanha) m.set(o.operador_id, { id: o.operador_id, nome: o.nome });
    for (const o of operadoresDoSetor) if (!m.has(o.id)) m.set(o.id, o);
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [daCampanha, operadoresDoSetor]);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(daCampanha.map((o) => o.operador_id)));

  useEffect(() => {
    let vivo = true;
    mensagensDoLote(envios.map((e) => e.id))
      .then((l) => { if (vivo) setMensagens(l); })
      .catch((err) => { console.error('[CampanhaFacil] mensagens da campanha:', err); if (vivo) setErroCarga(true); });
    return () => { vivo = false; };
  }, [envios]);

  const escolhidos = useMemo(() => candidatos.filter((o) => marcados.has(o.id)), [candidatos, marcados]);
  const partes = useMemo(() => {
    if (!mensagens || escolhidos.length === 0) return null;
    return redistribuir(mensagens, escolhidos);
  }, [mensagens, escolhidos]);
  const pendentes = mensagens?.filter((m) => m.status === 'pendente').length ?? 0;
  /** Quem saiu da lista mas tem mensagem presa — ela fica com ele. */
  const saindoComPresas = daCampanha
    .filter((o) => !marcados.has(o.operador_id))
    .map((o) => ({ nome: o.nome, presas: mensagens?.filter((m) => m.operador_id === o.operador_id && m.status !== 'pendente').length ?? 0 }))
    .filter((o) => o.presas > 0);

  const modeloMudou = !!lote.modelo && modelo !== lote.modelo;
  const problemaModelo = !lote.modelo ? null
    : !modelo.trim() ? 'A mensagem não pode ficar vazia.'
    : lote.sem_valores && mensagemUsaValores(modelo) ? 'O relatório desta campanha não tem valores: a mensagem não pode usar parcela, quitação, junção, anual ou cartão.'
    : /{{\s*cpf\s*}}/i.test(modelo) ? 'O CPF não fica guardado na campanha: tire o {{cpf}} da mensagem.'
    : null;
  const podeSalvar = !!partes && !problemaModelo && !!titulo.trim() && (pendentes === 0 || escolhidos.length > 0);

  async function salvar(liberar: boolean) {
    if (!partes) return;
    setSalvando(true);
    try {
      await onSalvar({ titulo: titulo.trim(), modelo: modeloMudou ? modelo : null, partes }, liberar);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar campanha</DialogTitle>
          <DialogDescription>
            O que já foi enviado ou copiado fica com quem enviou. As {n(pendentes)} pendentes são divididas de novo
            para todos ficarem com quantidades parecidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="cf-editar-titulo">Título</label>
          <Input id="cf-editar-titulo" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="cf-editar-modelo">Mensagem</label>
          {lote.modelo ? (
            <>
              <Textarea
                id="cf-editar-modelo" ref={modeloRef} value={modelo} onChange={(e) => setModelo(e.target.value)}
                rows={8} className="resize-y text-sm leading-relaxed"
              />
              <VariableChips
                ocultar={['cpf']}
                onInsert={(v) => insertVariable(modeloRef, modelo, setModelo, v)}
              />
              {modeloMudou && !problemaModelo && (
                <p className="text-[11px] text-muted-foreground">
                  O texto das mensagens pendentes será refeito com esta mensagem. As já enviadas não mudam.
                </p>
              )}
              {problemaModelo && <p className="text-xs text-destructive">{problemaModelo}</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Esta campanha é de antes do histórico guardar a mensagem: dá para mudar só o título e quem recebe.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">Quem recebe</p>
          {erroCarga ? (
            <p className="text-xs text-destructive">Não foi possível carregar as mensagens da campanha. Feche e tente de novo.</p>
          ) : !mensagens ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {candidatos.map((o) => {
                const parte = partes?.find((p) => p.operador.id === o.id);
                return (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                      <Checkbox
                        checked={marcados.has(o.id)}
                        onCheckedChange={() => setMarcados((s) => {
                          const x = new Set(s);
                          if (x.has(o.id)) x.delete(o.id); else x.add(o.id);
                          return x;
                        })}
                      />
                      <span className="flex-1 truncate">{o.nome}</span>
                      {parte && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Já enviadas + novas = total">
                          {n(parte.presas)} + {n(parte.contatos.length)} = <strong className="text-foreground">{n(parte.presas + parte.contatos.length)}</strong>
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {saindoComPresas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Fora da lista, mas com o que já enviaram: {saindoComPresas.map((o) => `${o.nome} (${n(o.presas)})`).join(', ')}.
            </p>
          )}
          {mensagens && pendentes > 0 && escolhidos.length === 0 && (
            <p className="text-xs text-destructive">Marque ao menos um operador para receber as pendentes.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="outline" onClick={() => void salvar(false)} disabled={!podeSalvar || salvando}>Salvar</Button>
          <Button className="gap-1.5" onClick={() => void salvar(true)} disabled={!podeSalvar || salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Salvar e liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
