/**
 * HistoricoPlantaoElite.tsx — sub-aba «Histórico» do Plantão Elite
 * (05/11/2026): todos os meses desde o início do plantão, dia a dia.
 *
 * Feita para ler de relance, não para conferir planilha (pedido do mesmo dia:
 * «mais simplificado, não só números»). Um mês por vez, escolhido nos botões
 * do topo; de cima para baixo:
 *
 *   1. o destaque do mês — quanto as duplas receberam, uma frase dizendo se o
 *      mês está à frente ou atrás do anterior, e o duelo das duplas;
 *   1b. as metas individuais (11/11/2026) — cada um com a foto, o que fechou
 *      no mês inteiro, a 1ª meta e as extras, quais bateu e quanto faltou;
 *   2. dia a dia — uma barra por dia, na cor da dupla que estava de plantão;
 *   3. comparativo — uma linha por mês, somando do dia 1 em diante: a linha do
 *      mês escolhido contra as dos outros mostra quem estava à frente em cada
 *      dia;
 *   4. mês a mês e quem mais recebeu;
 *   5. os números de cada dia, recolhidos, para quem quiser conferir.
 *
 * Cores das duplas: azul e laranja do tema (chart-1/chart-3), conferidas para
 * daltonismo no claro e no escuro. Texto nunca na cor da dupla — a cor fica no
 * ponto, na barra e na linha; o nome vai junto.
 */
import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Check, ChevronDown, Circle, Loader2, RefreshCw, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarPctDaMeta } from '@/lib/projecaoMetas';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import {
  acumuladoPorDia, barrasDoMes, compararMedia, pessoasDoMes, ritmoDoMes, rotuloMesCurto, rotuloMesLongo,
  type BarraDoDia, type DiaHistorico, type DuplaHistorico, type HistoricoElite, type MesHistorico,
  type MetaPessoaMes, type RespostaHistoricoElite,
} from '@/services/plantaoElite/historicoElite';
import { useHistoricoElite } from './useHistoricoElite';

// ── Formatos ────────────────────────────────────────────────────────────────

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaRedonda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (v: number | null, casas = 0) =>
  v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/** «qua, 04/11». */
function diaCurto(data: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${data}T12:00:00Z`)).replace('.', '');
  return `${s}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}
const dataBr = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const nomeDoMes = (mes: string) => rotuloMesLongo(mes).split(' ')[0].toLowerCase();

// ── Cores ───────────────────────────────────────────────────────────────────

/*
 * Azul e laranja: os dois tons do tema que mais se separam, também para quem
 * não distingue vermelho/verde. No escuro, os passos mais claros dos mesmos
 * tons (conferidos contra o fundo escuro). O tema escuro do app é classe no
 * <html> (`.dark`, `.dark-grey`, `.deep-blue`).
 */
const CSS_CORES = `
.hist-elite { --dupla-0: oklch(0.50 0.18 220); --dupla-1: oklch(0.62 0.18 45); --dupla-2: oklch(0.52 0.14 160); }
.dark .hist-elite, .dark-grey .hist-elite, .deep-blue .hist-elite {
  --dupla-0: oklch(0.62 0.16 220); --dupla-1: oklch(0.66 0.18 45); --dupla-2: oklch(0.64 0.14 160);
}`;
const corDaDupla = (d: DuplaHistorico | null | undefined) => `var(--dupla-${(d?.indice ?? 0) % 3})`;

const EIXO = { fontSize: 10, fill: 'var(--muted-foreground)' };

// ── A sub-aba ───────────────────────────────────────────────────────────────

export function HistoricoPlantaoElite({ empresaId }: { empresaId: string }) {
  const { resposta, historico, carregando, erro, carregar } = useHistoricoElite(empresaId);
  return (
    <PainelHistoricoElite
      historico={historico} resposta={resposta} carregando={carregando} erro={erro}
      onAtualizar={() => void carregar()}
    />
  );
}

/**
 * O desenho, sem banco: recebe o histórico pronto. Separado para o
 * laboratório (`lab-historico-elite.html`) mostrar a tela com dados fictícios.
 */
export function PainelHistoricoElite({ historico, resposta, carregando, erro, onAtualizar }: {
  historico: HistoricoElite | null;
  resposta: Pick<RespostaHistoricoElite, 'hoje' | 'sou_da_dupla'> | null;
  carregando: boolean;
  erro: string | null;
  onAtualizar: () => void;
}) {
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const carregar = onAtualizar;

  const mes = historico
    ? historico.meses.find(m => m.mes === mesEscolhido) ?? historico.meses[historico.meses.length - 1]
    : undefined;

  return (
    <div className="hist-elite space-y-4">
      <style>{CSS_CORES}</style>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Histórico do plantão</h3>
          <p className="text-xs text-muted-foreground">
            {historico ? `Desde ${dataBr(historico.inicio)}` : 'Desde o início'}, cada dia com a dupla que estava de plantão
            {resposta?.sou_da_dupla && ' · você vê os dias em que esteve de plantão'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={carregar} disabled={carregando}>
          <RefreshCw className={cn('w-3.5 h-3.5', carregando && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {erro && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center justify-between gap-3">
          <span>{erro}</span>
          <Button size="sm" variant="link" className="text-destructive h-auto p-0" onClick={carregar}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!historico && carregando && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo o histórico…
        </div>
      )}

      {historico && historico.meses.length === 0 && (
        <div className="p-6 rounded-xl border border-dashed border-border text-sm text-muted-foreground text-center">
          Ainda não há dias de plantão para mostrar.
        </div>
      )}

      {historico && mes && (
        <div className={cn('space-y-4 transition-opacity', carregando && 'opacity-60')}>
          <EscolhaDoMes h={historico} mes={mes.mes} onEscolher={setMesEscolhido} />
          <Destaque h={historico} m={mes} hoje={resposta?.hoje ?? ''} />
          <MetasIndividuais m={mes} souDaDupla={!!resposta?.sou_da_dupla} />
          <DiaADia h={historico} m={mes} />
          <Comparativo h={historico} m={mes} />
          <div className="grid gap-4 lg:grid-cols-2">
            <MesAMes h={historico} mes={mes.mes} onEscolher={setMesEscolhido} />
            <Pessoas h={historico} m={mes} />
          </div>
          <NumerosDoMes h={historico} m={mes} />
        </div>
      )}
    </div>
  );
}

// ── Peças comuns ────────────────────────────────────────────────────────────

function Bloco({ titulo, subtitulo, direita, children, className }: {
  titulo: string; subtitulo?: string; direita?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{titulo}</h4>
          {subtitulo && <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        {direita}
      </div>
      {children}
    </section>
  );
}

function PontoDupla({ dupla, className }: { dupla: DuplaHistorico | null | undefined; className?: string }) {
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', className)} style={{ background: corDaDupla(dupla) }} />;
}

/** A foto (ou as iniciais), com um anel na cor da dupla. */
function Foto({ nome, foto, dupla, className }: {
  nome: string; foto: string | null | undefined; dupla: DuplaHistorico | null | undefined; className?: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 rounded-full"
      style={{ boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${corDaDupla(dupla)}` }}
    >
      <AvatarParticipante nome={nome} fotoUrl={foto} className={cn('border-0', className)} />
    </span>
  );
}

function Legenda({ duplas }: { duplas: DuplaHistorico[] }) {
  if (duplas.length < 2) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
      {duplas.map(d => (
        <span key={d.chave} className="inline-flex items-center gap-1.5">
          <PontoDupla dupla={d} />
          {d.nome}
        </span>
      ))}
    </div>
  );
}

function CaixaDica({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-md px-3 py-2 text-xs min-w-[190px]">
      {children}
    </div>
  );
}

// ── 0. Escolha do mês ───────────────────────────────────────────────────────

function EscolhaDoMes({ h, mes, onEscolher }: { h: HistoricoElite; mes: string; onEscolher: (m: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Mês">
      {h.meses.map(m => {
        const ativo = m.mes === mes;
        return (
          <button
            key={m.mes} type="button" role="tab" aria-selected={ativo}
            onClick={() => onEscolher(m.mes)}
            className={cn(
              'shrink-0 rounded-lg border px-3.5 py-2 text-left transition-colors',
              ativo ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <div className={cn('text-xs font-semibold flex items-center gap-1.5', ativo ? 'text-primary' : 'text-foreground')}>
              {rotuloMesLongo(m.mes)}
              {m.emAndamento && <span className="w-1.5 h-1.5 rounded-full bg-success" title="Em andamento" />}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">{moedaRedonda.format(m.total)}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── 1. Destaque do mês ──────────────────────────────────────────────────────

function Destaque({ h, m, hoje }: { h: HistoricoElite; m: MesHistorico; hoje: string }) {
  const ritmo = m.emAndamento ? ritmoDoMes(h.meses, hoje) : null;
  const media = compararMedia(h.meses, m.mes);
  const duplaDoMelhor = m.melhor ? h.duplas.find(d => d.chave === m.melhor?.dupla) : undefined;

  // A frase do mês: o ritmo (mês em andamento) ou a média contra o anterior.
  let frase: { sobe: boolean; texto: string } | null = null;
  if (ritmo && ritmo.variacao != null) {
    const sobe = ritmo.variacao >= 0;
    frase = {
      sobe,
      texto: `${pct(Math.abs(ritmo.variacao))} ${sobe ? 'à frente' : 'atrás'} de ${nomeDoMes(ritmo.mesAnterior)} no mesmo ponto do mês (até o dia ${ritmo.ateODia})`,
    };
  } else if (media && media.variacao != null) {
    const sobe = media.variacao >= 0;
    frase = {
      sobe,
      texto: `Média por plantão ${pct(Math.abs(media.variacao))} ${sobe ? 'acima' : 'abaixo'} de ${nomeDoMes(media.mesAnterior)}`,
    };
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {rotuloMesLongo(m.mes)}{m.emAndamento && ' · em andamento'}
        </div>
        <div className="mt-1 text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">{moeda.format(m.total)}</div>
        <div className="text-sm text-muted-foreground">
          recebidos pelas duplas em {m.diasComMovimento} dia{m.diasComMovimento === 1 ? '' : 's'} de plantão
        </div>

        {frase && (
          <div className={cn(
            'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            frase.sobe ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
          )}>
            {frase.sobe ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {frase.texto}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border pt-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">Média por plantão</dt>
            <dd className="text-sm font-semibold tabular-nums">{moeda.format(m.media)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Fatia do {h.setorNome}</dt>
            <dd className="text-sm font-semibold tabular-nums">{pct(m.participacao, 1)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-[11px] text-muted-foreground">Melhor dia</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {m.melhor ? (
                <span className="inline-flex items-center gap-1.5">
                  <PontoDupla dupla={duplaDoMelhor} className="w-2 h-2" />
                  {diaCurto(m.melhor.data)} · {moedaRedonda.format(m.melhor.total)}
                </span>
              ) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <Duelo h={h} m={m} />
    </div>
  );
}

function Duelo({ h, m }: { h: HistoricoElite; m: MesHistorico }) {
  const linhas = m.porDupla
    .map(pd => ({ ...pd, dupla: h.duplas.find(d => d.chave === pd.chave) }))
    .sort((a, b) => b.total - a.total);
  const soma = linhas.reduce((s, l) => s + l.total, 0);
  const lider = linhas.length > 1 && linhas[0].total > linhas[1].total ? linhas[0].chave : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold">{linhas.length > 1 ? 'As duplas no mês' : 'Sua dupla no mês'}</h4>
      <p className="text-xs text-muted-foreground mt-0.5">Quanto cada dupla trouxe nos próprios dias de plantão</p>

      {/* A barra dividida: a fatia de cada dupla no mês. */}
      {soma > 0 && linhas.length > 1 && (
        <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {linhas.map(l => (
            <div key={l.chave} style={{ width: `${(l.total / soma) * 100}%`, background: corDaDupla(l.dupla) }} />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {linhas.map(l => (
          <div key={l.chave} className="flex items-center gap-3">
            <div className="flex shrink-0 gap-1.5">
              {(l.dupla?.ids ?? []).map(id => (
                <Foto
                  key={id} nome={nomeDaPessoa(m, id)} foto={h.fotos.get(id)} dupla={l.dupla}
                  className="w-8 h-8 text-[10px]"
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{l.dupla?.nome}</span>
                {lider === l.chave && (
                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-foreground">
                    <Trophy className="w-3 h-3" /> na frente
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {l.dias} plantã{l.dias === 1 ? 'o' : 'os'} · média {moedaRedonda.format(l.media)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">{moedaRedonda.format(l.total)}</div>
              {linhas.length > 1 && <div className="text-[11px] text-muted-foreground tabular-nums">{pct(soma > 0 ? l.total / soma : null)}</div>}
            </div>
          </div>
        ))}
        {linhas.length === 0 && <p className="text-sm text-muted-foreground">Sem plantão neste mês.</p>}
      </div>
    </section>
  );
}

/** O nome de quem esteve de plantão no mês (a dupla guarda só os ids). */
function nomeDaPessoa(m: MesHistorico, id: string): string {
  for (const d of m.dias) {
    const p = d?.porMembro.find(x => x.id === id);
    if (p) return p.nome;
  }
  return '—';
}

// ── 1b. Metas individuais ───────────────────────────────────────────────────

const ordinal = (n: number) => `${n}ª`;

function MetasIndividuais({ m, souDaDupla }: { m: MesHistorico; souDaDupla: boolean }) {
  if (!m.metas || m.metas.length === 0) return null;
  const comMeta = m.metas.filter(p => p.degraus.length > 0);
  const bateram = comMeta.filter(p => (p.batidas ?? 0) >= 1).length;

  return (
    <Bloco
      titulo={souDaDupla ? `Sua meta em ${nomeDoMes(m.mes)}` : `Metas individuais de ${nomeDoMes(m.mes)}`}
      subtitulo={`O que ${souDaDupla ? 'você fechou' : 'cada um fechou'} no mês inteiro (todos os dias, não só os de plantão) contra a meta individual e as metas extras.${m.emAndamento ? ' O mês ainda está em andamento.' : ''}`}
      direita={comMeta.length > 1 ? (
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
          bateram > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
        )}>
          <Target className="w-3.5 h-3.5" />
          {bateram} de {comMeta.length} {m.emAndamento ? 'já bateram' : 'bateram'} a 1ª meta
        </span>
      ) : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {m.metas.map(p => <CartaoMeta key={p.id} p={p} emAndamento={m.emAndamento} />)}
      </div>
    </Bloco>
  );
}

function CartaoMeta({ p, emAndamento }: { p: MetaPessoaMes; emAndamento: boolean }) {
  const semMeta = p.degraus.length === 0;
  const batidas = p.batidas ?? 0;
  const todas = !semMeta && batidas === p.degraus.length;
  // A régua vai até a última meta, ou até o fechado se passou dela.
  const teto = Math.max(p.fechado, ...p.degraus, 1);
  const largura = (v: number) => `${Math.min(100, (v / teto) * 100)}%`;
  const fatiaPlantao = p.fechado > 0 ? p.noPlantao / p.fechado : null;

  let selo: { texto: string; classe: string };
  if (semMeta) selo = { texto: 'Sem meta no mês', classe: 'bg-muted text-muted-foreground' };
  else if (todas) selo = { texto: p.degraus.length > 1 ? 'Bateu todas as metas' : 'Bateu a meta', classe: 'bg-success/10 text-success' };
  else if (batidas >= 1) selo = { texto: `Bateu a ${ordinal(batidas)} meta`, classe: 'bg-success/10 text-success' };
  else if (emAndamento) selo = { texto: 'A caminho da 1ª meta', classe: 'bg-warning/10 text-warning' };
  else selo = { texto: 'Não bateu', classe: 'bg-destructive/10 text-destructive' };

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-3',
        batidas >= 1 ? 'border-success/40 bg-success/[0.03]' : 'border-border',
      )}
      aria-label={`Meta de ${p.nome}`}
    >
      <div className="flex items-center gap-3">
        <Foto nome={p.nome} foto={p.foto} dupla={p.dupla} className="w-11 h-11 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{p.nome}</div>
          <span className={cn('mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', selo.classe)}>
            {batidas >= 1 && <Trophy className="w-3 h-3" />}
            {selo.texto}
          </span>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground">Fechou no mês</div>
        <div className="text-xl font-bold tabular-nums tracking-tight">{moeda.format(p.fechado)}</div>
        {!semMeta && p.alcance != null && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {formatarPctDaMeta(p.alcance * 100)} da 1ª meta
          </div>
        )}
      </div>

      {!semMeta && (
        <>
          {/* A régua: o fechado, com um risco em cada meta. */}
          <div className="relative h-2.5 w-full rounded-full bg-muted" aria-hidden>
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', batidas >= 1 ? 'bg-success' : 'bg-primary')}
              style={{ width: largura(p.fechado) }}
            />
            {p.degraus.map((v, i) => (
              <span
                key={i}
                className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-foreground/60"
                style={{ left: `calc(${largura(v)} - 1px)` }}
              />
            ))}
          </div>

          <ul className="space-y-1">
            {p.degraus.map((v, i) => {
              const bateu = i < batidas;
              const proxima = p.proxima?.nivel === i + 1;
              return (
                <li key={i} className="flex items-center gap-2 text-xs tabular-nums">
                  {bateu
                    ? <Check className="w-3.5 h-3.5 text-success shrink-0" aria-label="batida" />
                    : <Circle className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-label="não batida" />}
                  <span className={cn('w-14 shrink-0', bateu ? 'font-medium' : 'text-muted-foreground')}>{ordinal(i + 1)} meta</span>
                  <span className={cn('flex-1', bateu ? 'font-medium' : 'text-muted-foreground')}>{moedaRedonda.format(v)}</span>
                  {proxima && p.proxima && (
                    <span className="text-[11px] text-muted-foreground">
                      {emAndamento ? 'faltam' : 'faltou'} {moedaRedonda.format(p.proxima.falta)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground tabular-nums">
        No plantão: <span className="font-medium text-foreground">{moedaRedonda.format(p.noPlantao)}</span>
        {fatiaPlantao != null && ` · ${formatarPctDaMeta(fatiaPlantao * 100)} do que fechou`}
      </div>
    </div>
  );
}

// ── 2. Dia a dia ────────────────────────────────────────────────────────────

function DiaADia({ h, m }: { h: HistoricoElite; m: MesHistorico }) {
  const dados = useMemo(() => barrasDoMes(m), [m]);
  const duplas = useMemo(() => new Map(h.duplas.map(d => [d.chave, d])), [h.duplas]);
  const faltam = m.emAndamento ? dados.filter(d => d.info == null).length : 0;

  return (
    <Bloco
      titulo={`Dia a dia de ${nomeDoMes(m.mes)}`}
      subtitulo={faltam > 0
        ? `Cada barra é um dia, na cor da dupla de plantão. Faltam ${faltam} dia${faltam === 1 ? '' : 's'} para fechar o mês.`
        : 'Cada barra é um dia, na cor da dupla de plantão. A linha tracejada é a média por plantão.'}
      direita={<Legenda duplas={h.duplas} />}
    >
      <div className="h-[220px]" aria-label={`Recebido por dia em ${nomeDoMes(m.mes)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 16, right: 8, left: -6, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="dia" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={6} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={v => compacto.format(Number(v))} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const b = active ? (payload?.[0]?.payload as BarraDoDia | undefined) : undefined;
                return b?.info ? <DicaDoDia d={b.info} dupla={duplas.get(b.info.dupla ?? '')} setorNome={h.setorNome} /> : null;
              }}
            />
            {m.media > 0 && (
              <ReferenceLine
                y={m.media} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: `média ${compacto.format(m.media)}`, position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
            )}
            <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
              {dados.map(d => (
                <Cell
                  key={d.dia}
                  fill={corDaDupla(duplas.get(d.dupla ?? ''))}
                  stroke={d.info?.hoje ? 'var(--foreground)' : undefined}
                  strokeWidth={d.info?.hoje ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Bloco>
  );
}

function DicaDoDia({ d, dupla, setorNome }: { d: DiaHistorico; dupla: DuplaHistorico | undefined; setorNome: string }) {
  return (
    <CaixaDica>
      <div className="font-semibold capitalize">{diaCurto(d.data)}{d.hoje && ' · hoje'}</div>
      <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <PontoDupla dupla={dupla} className="w-2 h-2" /> {dupla?.nome ?? '—'}
      </div>
      <div className="mt-1.5 space-y-0.5 tabular-nums">
        {d.porMembro.map(p => (
          <div key={p.id} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{p.nome.split(' ')[0]}</span>
            <span>{moeda.format(p.valor)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-0.5 font-semibold">
          <span>Dupla</span><span>{moeda.format(d.total)}</span>
        </div>
      </div>
      <div className="mt-1 text-muted-foreground">
        {pct(d.participacao, 1)} do {setorNome} ({moedaRedonda.format(d.setorTotal)})
      </div>
    </CaixaDica>
  );
}

// ── 3. Comparativo entre meses ──────────────────────────────────────────────

function Comparativo({ h, m }: { h: HistoricoElite; m: MesHistorico }) {
  const dados = useMemo(() => acumuladoPorDia(h.meses), [h.meses]);
  if (h.meses.length < 2) return null;
  const outros = h.meses.filter(x => x.mes !== m.mes);

  return (
    <Bloco
      titulo="Comparativo com os outros meses"
      subtitulo={`Quanto cada mês já tinha somado até cada dia. Linha de ${nomeDoMes(m.mes)} acima das outras = mês à frente.`}
      direita={
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-[3px] rounded-full bg-primary" /> {rotuloMesCurto(m.mes)}
          </span>
          {outros.map(o => (
            <span key={o.mes} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-[2px] rounded-full bg-muted-foreground/50" /> {rotuloMesCurto(o.mes)}
            </span>
          ))}
        </div>
      }
    >
      <div className="h-[240px]" aria-label="Acumulado do mês, dia a dia, em cada mês">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 12, right: 40, left: -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="dia" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={6} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={v => compacto.format(Number(v))} />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const itens = payload
                  .filter(p => p.value != null)
                  .map(p => ({ mes: String(p.dataKey), valor: Number(p.value) }))
                  .sort((a, b) => b.valor - a.valor);
                if (!itens.length) return null;
                return (
                  <CaixaDica>
                    <div className="font-semibold">Até o dia {label}</div>
                    <div className="mt-1 space-y-0.5 tabular-nums">
                      {itens.map(i => (
                        <div key={i.mes} className={cn('flex justify-between gap-4', i.mes === m.mes ? 'font-semibold' : 'text-muted-foreground')}>
                          <span>{rotuloMesCurto(i.mes)}</span><span>{moedaRedonda.format(i.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </CaixaDica>
                );
              }}
            />
            {outros.map(o => (
              <Line
                key={o.mes} type="monotone" dataKey={o.mes} stroke="var(--muted-foreground)" strokeOpacity={0.45}
                strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false}
                label={<RotuloDoFim mes={o.mes} ultimo={ultimoDia(o)} destaque={false} />}
              />
            ))}
            <Line
              type="monotone" dataKey={m.mes} stroke="var(--primary)" strokeWidth={2.5} dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false}
              label={<RotuloDoFim mes={m.mes} ultimo={ultimoDia(m)} destaque />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Bloco>
  );
}

/** O último dia do mês que já tem dado: onde a linha para e ganha o rótulo. */
function ultimoDia(m: MesHistorico): number {
  for (let i = m.dias.length - 1; i >= 0; i -= 1) if (m.dias[i]) return i + 1;
  return 0;
}

/** Rótulo direto no fim da linha: o nome do mês, sem precisar da legenda. */
function RotuloDoFim(props: { mes: string; ultimo: number; destaque: boolean; x?: number; y?: number; index?: number }) {
  const { x, y, index, mes, ultimo, destaque } = props;
  if (x == null || y == null || index !== ultimo - 1) return null;
  return (
    <text x={x + 6} y={y} dy={3} fontSize={10} fontWeight={destaque ? 600 : 400}
      fill={destaque ? 'var(--foreground)' : 'var(--muted-foreground)'}>
      {rotuloMesCurto(mes)}
    </text>
  );
}

// ── 4. Mês a mês e pessoas ──────────────────────────────────────────────────

function MesAMes({ h, mes, onEscolher }: { h: HistoricoElite; mes: string; onEscolher: (m: string) => void }) {
  // Média por plantão, não total: o primeiro mês começou no dia 19 e o de hoje
  // não acabou — a média compara os meses de igual para igual.
  const dados = h.meses.map(m => ({ mes: m.mes, rotulo: rotuloMesCurto(m.mes), media: m.media, dias: m.diasComMovimento }));
  return (
    <Bloco titulo="Média por plantão, mês a mês" subtitulo="Compara os meses de igual para igual, mesmo os que não estão completos. Clique para abrir o mês.">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 18, right: 8, left: -6, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={v => compacto.format(Number(v))} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as (typeof dados)[number] | undefined) : undefined;
                return d ? (
                  <CaixaDica>
                    <div className="font-semibold">{rotuloMesLongo(d.mes)}</div>
                    <div className="tabular-nums">{moeda.format(d.media)} por plantão</div>
                    <div className="text-muted-foreground">{d.dias} dias de plantão</div>
                  </CaixaDica>
                ) : null;
              }}
            />
            <Bar
              dataKey="media" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} cursor="pointer"
              onClick={(d: { mes?: string }) => { if (d?.mes) onEscolher(d.mes); }}
              label={{ position: 'top', fontSize: 10, fill: 'var(--muted-foreground)', formatter: (v: number) => compacto.format(v) }}
            >
              {dados.map(d => (
                // Cor clareada, não opacidade: a opacidade apagaria o rótulo junto.
                <Cell key={d.mes} fill={d.mes === mes ? 'var(--primary)' : 'color-mix(in oklch, var(--primary) 35%, var(--card))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Bloco>
  );
}

function Pessoas({ h, m }: { h: HistoricoElite; m: MesHistorico }) {
  const lista = useMemo(() => pessoasDoMes(m, h.duplas), [m, h.duplas]);
  const maior = Math.max(1, ...lista.map(p => p.total));
  return (
    <Bloco
      titulo={`Quem mais recebeu em ${nomeDoMes(m.mes)}`}
      subtitulo={m.metas
        ? 'No mês inteiro, o mesmo valor das metas individuais'
        : 'Nos dias de plantão da própria dupla'}
    >
      <ol className="space-y-3">
        {lista.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="w-4 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</span>
            <Foto nome={p.nome} foto={h.fotos.get(p.id)} dupla={p.dupla} className="w-9 h-9 text-[11px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium truncate">{p.nome}</span>
                <span className="text-sm font-semibold tabular-nums">{moedaRedonda.format(p.total)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(p.total / maior) * 100}%`, background: corDaDupla(p.dupla) }} />
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {m.metas
                  ? <>No plantão: {moedaRedonda.format(p.noPlantao)} em {p.dias} plantã{p.dias === 1 ? 'o' : 'os'}</>
                  : <>{p.dias} plantã{p.dias === 1 ? 'o' : 'os'} · média {moedaRedonda.format(p.media)}</>}
              </div>
            </div>
          </li>
        ))}
        {lista.length === 0 && <li className="text-sm text-muted-foreground">Sem plantão neste mês.</li>}
      </ol>
    </Bloco>
  );
}

// ── 5. Os números de cada dia ───────────────────────────────────────────────

function NumerosDoMes({ h, m }: { h: HistoricoElite; m: MesHistorico }) {
  const [aberto, setAberto] = useState(false);
  const duplas = new Map(h.duplas.map(d => [d.chave, d]));
  const dias = m.dias.filter((d): d is DiaHistorico => d != null);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/40 rounded-xl"
      >
        Ver os números de cada dia de {nomeDoMes(m.mes)}
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                <th className="text-left font-semibold py-2 pl-4">Dia</th>
                <th className="text-left font-semibold py-2 px-2">Dupla</th>
                <th className="text-right font-semibold py-2 px-2">Recebido</th>
                <th className="text-right font-semibold py-2 px-2">Acumulado</th>
                <th className="text-right font-semibold py-2 pr-4">Fatia do {h.setorNome}</th>
              </tr>
            </thead>
            <tbody>
              {dias.map(d => {
                const dupla = duplas.get(d.dupla ?? '');
                return (
                  <tr key={d.data} className={cn('border-t border-border', !d.comMovimento && 'text-muted-foreground')}>
                    <td className="py-1.5 pl-4 capitalize">{diaCurto(d.data)}</td>
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-1.5"><PontoDupla dupla={dupla} className="w-2 h-2" />{dupla?.nome ?? '—'}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right">{moeda.format(d.total)}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">{moeda.format(d.acumuladoMes)}</td>
                    <td className="py-1.5 pr-4 text-right">{pct(d.participacao, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
