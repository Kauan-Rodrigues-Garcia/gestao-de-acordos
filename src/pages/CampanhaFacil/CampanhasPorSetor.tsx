/**
 * «Por setor» — o que cada setor lançou no dia e quanto já foi encaminhado
 * (super admin, 16/11/2026). Ver `setoresDoDia.ts`.
 *
 * Só acompanhar: clicar numa campanha abre a mesma janela do histórico, em
 * leitura (as ações continuam com quem lançou). O andamento vem pela função
 * que devolve só números — nenhum dado de cliente passa por aqui.
 */
import { useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, Send, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { situacaoDoLote, type LoteCampanha } from './campanhaFacilEnvios.service';
import {
  agruparPorSetor, faltam, pctEnviado, setoresSemCampanha, totalDoDia, totalValido,
  type Andamento, type CampanhaDoDia, type LiderDoDia, type SetorDoDia,
} from './setoresDoDia';
import type { useCampanhasDoDia } from './useCampanhasDoDia';

const n = (x: number) => x.toLocaleString('pt-BR');
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

type DoDia = ReturnType<typeof useCampanhasDoDia>;

export function CampanhasPorSetor({ doDia, setores, onAbrir }: {
  doDia: DoDia;
  /** Todos os setores da empresa (o seletor da nova campanha), para nomes e «sem campanha». */
  setores: { id: string; nome: string }[];
  onAbrir: (l: LoteCampanha) => void;
}) {
  const { dia, setDia, hoje, campanhas, carregando, erro, atualizadoEm, recarregar } = doDia;
  const nomes = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);
  const porSetor = useMemo(() => agruparPorSetor(campanhas, nomes), [campanhas, nomes]);
  const semCampanha = useMemo(() => setoresSemCampanha(setores, porSetor), [setores, porSetor]);
  const total = totalDoDia(porSetor);

  function andarDia(passo: number) {
    const d = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + passo);
    if (d > new Date()) return;
    setDia(d);
  }

  const rotuloDia = dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const primeiraCarga = carregando && !atualizadoEm;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => andarDia(-1)} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] px-1 text-center text-xs font-medium tabular-nums">
            {hoje ? `Hoje · ${rotuloDia}` : rotuloDia}
          </span>
          <Button
            variant="ghost" size="icon" className="h-8 w-8" onClick={() => andarDia(1)}
            disabled={hoje} aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!hoje && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDia(new Date())}>Voltar para hoje</Button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {atualizadoEm && `Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void recarregar()} disabled={carregando}>
          <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} /> Atualizar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Quais líderes lançaram campanha {hoje ? 'hoje' : 'neste dia'} e quantas cada um fez, por setor. Clique no líder
        para ver as campanhas dele, e numa campanha para ver quem encaminhou — só para acompanhar.
      </p>

      {erro && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as campanhas do dia. Tente Atualizar.
        </p>
      )}

      {primeiraCarga ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as campanhas dos setores…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Bloco rotulo={total.campanhas === 1 ? 'campanha lançada' : 'campanhas lançadas'} valor={n(total.campanhas)} />
            <Bloco rotulo={total.lideres === 1 ? 'líder lançou' : 'líderes lançaram'} valor={n(total.lideres)} />
            <Bloco
              rotulo={setores.length > 0 ? `de ${n(setores.length)} setores lançaram` : 'setores lançaram'}
              valor={n(porSetor.length)}
            />
            <Bloco
              rotulo={`de ${n(totalValido(total))} mensagens enviadas · ${pctEnviado(total)}%${total.nao > 0 ? ` · ${n(total.nao)} não deu` : ''}`} valor={n(total.enviados)}
              tom={total.total > 0 && faltam(total) === 0 ? 'ok' : undefined}
            />
          </div>

          {porSetor.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Send className="mx-auto mb-3 h-7 w-7 text-primary opacity-60" />
                <p className="text-sm font-semibold">Nenhum setor lançou campanha {hoje ? 'hoje' : 'neste dia'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Assim que um líder liberar uma campanha, o setor aparece aqui.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {porSetor.map((s) => <CartaoSetor key={s.setorId} s={s} onAbrir={onAbrir} />)}
            </div>
          )}

          {semCampanha.length > 0 && porSetor.length > 0 && (
            <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sem campanha {hoje ? 'hoje' : 'neste dia'} · {n(semCampanha.length)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {semCampanha.map((s) => (
                  <span key={s.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.nome}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Um setor ─────────────────────────────────────────────────────────────────

function situacaoDoSetor(a: Andamento): { rotulo: string; tom: 'ok' | 'parado' | 'andando' } {
  if (a.total > 0 && faltam(a) === 0) return { rotulo: 'Tudo encaminhado', tom: 'ok' };
  if (a.enviados + a.nao === 0) return { rotulo: 'Ainda não começou', tom: 'parado' };
  return { rotulo: 'Encaminhando', tom: 'andando' };
}

/**
 * O setor pelos líderes: quem lançou e quantas campanhas fez, com o
 * andamento de cada um. Tudo vem recolhido (16/11/2026): clicar no setor
 * mostra os líderes; clicar no líder, as campanhas dele.
 */
function CartaoSetor({ s, onAbrir }: { s: SetorDoDia; onAbrir: (l: LoteCampanha) => void }) {
  const [verLideres, setVerLideres] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const sit = situacaoDoSetor(s.andamento);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <button
          type="button" onClick={() => setVerLideres((v) => !v)} aria-expanded={verLideres}
          className="-m-1 flex w-[calc(100%+0.5rem)] items-start gap-2 rounded-md p-1 text-left transition-colors hover:bg-accent/40"
          title={verLideres ? 'Recolher os líderes' : 'Ver os líderes'}
        >
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold" title={s.nome}>{s.nome}</span>
            <span className="block text-[11px] text-muted-foreground">
              <strong className="text-foreground tabular-nums">{n(s.campanhas.length)}</strong>{' '}
              {s.campanhas.length === 1 ? 'campanha' : 'campanhas'} ·{' '}
              <strong className="text-foreground tabular-nums">{n(s.lideres.length)}</strong>{' '}
              {s.lideres.length === 1 ? 'líder' : 'líderes'} · última às {hora(s.ultima)}
            </span>
          </span>
          <span className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            sit.tom === 'ok' && 'bg-success/10 text-success',
            sit.tom === 'parado' && 'bg-warning/15 text-warning',
            sit.tom === 'andando' && 'bg-primary/10 text-primary',
          )}>
            {sit.tom === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : sit.tom === 'parado' && <Clock className="h-3 w-3" />}
            {sit.rotulo}
          </span>
          <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', verLideres && 'rotate-180')} />
        </button>

        {verLideres && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {s.lideres.map((l) => (
              <LinhaLider
                key={l.id} l={l} aberto={aberto === l.id}
                onAlternar={() => setAberto((x) => (x === l.id ? null : l.id))}
                onAbrir={onAbrir}
              />
            ))}
          </ul>
        )}

        <div className="space-y-1">
          <BarraAndamento a={s.andamento} />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{pctEnviado(s.andamento)}% do setor enviado</span>
            <span className="inline-flex items-center gap-1"><Ponto className="bg-success" /> {n(s.andamento.enviados)} enviadas</span>
            {s.andamento.nao > 0 && (
              <span className="inline-flex items-center gap-1"><Ponto className="bg-warning" /> {n(s.andamento.nao)} não deu</span>
            )}
            <span className="inline-flex items-center gap-1"><Ponto className="bg-muted-foreground/30" /> {n(faltam(s.andamento))} faltam</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {n(s.concluiram)}/{n(s.operadores)} operadores concluíram
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Um líder do setor: quantas campanhas fez no dia; aberto, as campanhas dele. */
function LinhaLider({ l, aberto, onAlternar, onAbrir }: {
  l: LiderDoDia; aberto: boolean; onAlternar: () => void; onAbrir: (l: LoteCampanha) => void;
}) {
  const qtd = l.campanhas.length;
  const inicial = l.nome.trim().charAt(0).toUpperCase() || '?';
  return (
    <li>
      <button
        type="button" onClick={onAlternar} aria-expanded={aberto}
        className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50', aberto && 'bg-accent/30')}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
          {inicial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={l.nome}>{l.nome}</span>
          <span className="block text-[11px] text-muted-foreground">
            última às {hora(l.ultima)} · {n(l.andamento.total)} msgs · {pctEnviado(l.andamento)}% enviado
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums leading-none">{n(qtd)}</span>
          <span className="block text-[10px] text-muted-foreground">{qtd === 1 ? 'campanha' : 'campanhas'}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <ul className="space-y-1.5 bg-muted/20 px-3 pb-3 pt-1">
          {l.campanhas.map((c) => (
            <li key={c.lote.id}><LinhaCampanha c={c} onClick={() => onAbrir(c.lote)} /></li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LinhaCampanha({ c, onClick }: { c: CampanhaDoDia; onClick: () => void }) {
  const l = c.lote;
  const situacao = situacaoDoLote(l);
  return (
    <button
      type="button" onClick={onClick}
      className="w-full space-y-1.5 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={l.titulo}>{l.titulo}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <strong className="text-foreground">{n(c.andamento.enviados)}</strong>/{n(c.andamento.total)}
        </span>
      </div>
      <BarraAndamento a={c.andamento} fina />
      <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
        <span>lançada às {hora(l.lancada_em ?? l.criado_em)}</span>
        {c.placar && <span>· {n(c.concluiram)}/{n(c.operadores)} concluíram</span>}
        {!c.placar && <span>· andamento indisponível</span>}
        {situacao !== 'ativa' && (
          <span className={cn(situacao === 'desativada' && 'text-warning')}>
            · {situacao === 'desativada' ? 'desativada' : 'encerrada'}
          </span>
        )}
      </p>
    </button>
  );
}

/**
 * Enviadas (verde) sobre o total SEM os «Não deu» (17/11/2026); o fundo é o
 * que falta. O «Não deu» não entra na barra — aparece contado ao lado.
 */
function BarraAndamento({ a, fina = false }: { a: Andamento; fina?: boolean }) {
  return (
    <div
      className={cn('flex overflow-hidden rounded-full bg-muted', fina ? 'h-1' : 'h-2')}
      role="img" aria-label={`${pctEnviado(a)}% enviadas, ${n(a.nao)} não deu, ${n(faltam(a))} faltam`}
    >
      <div className="bg-success transition-[width] duration-500" style={{ width: `${pctEnviado(a)}%` }} />
    </div>
  );
}

function Ponto({ className }: { className: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', className)} aria-hidden />;
}

function Bloco({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: 'ok' }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className={cn('text-lg font-bold tabular-nums leading-tight', tom === 'ok' && 'text-success')}>{valor}</p>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}
