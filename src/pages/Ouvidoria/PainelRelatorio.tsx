/**
 * PainelRelatorio — a aba «Relatório» da Ouvidoria: os números do período e
 * onde as reclamações se concentram.
 *
 * Cada gráfico é UMA série (quantas manifestações por mês, assunto, canal…):
 * uma cor só, sem legenda, o número escrito ao lado da barra e o detalhe no
 * passar do mouse. As contas estão em `relatorio.ts` (testadas).
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarRange, CheckCircle2, Clock3, Inbox, ListChecks, MessageSquareReply, Ticket,
  type LucideIcon,
} from 'lucide-react';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { CampoLista } from './campos';
import { useOuvidoria } from './contexto';
import { DIAS_ALERTA } from './ouvidoria';
import { PERIODOS, relatorio, type Fatia, type Periodo } from './relatorio';

function Numero({ icone: Icone, rotulo, valor, detalhe }: {
  icone: LucideIcon; rotulo: string; valor: string; detalhe?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums mt-1">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
    </div>
  );
}

/** Barras horizontais de uma série só, com o número à direita. */
function Barras({ titulo, fatias, vazio, total }: { titulo: string; fatias: readonly Fatia[]; vazio: string; total?: number }) {
  const max = Math.max(1, ...fatias.map(f => f.valor));
  const soma = total ?? fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {fatias.every(f => f.valor === 0) ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {fatias.map(f => {
            const pct = soma ? Math.round((f.valor / soma) * 100) : 0;
            return (
              <li key={f.chave} className="group" title={`${f.rotulo}: ${f.valor} (${pct}%)`}>
                <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                  <span className="truncate text-foreground">{f.rotulo}</span>
                  <span className="tabular-nums font-semibold text-foreground shrink-0">
                    {f.valor} <span className="font-normal text-muted-foreground">· {pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/80 group-hover:bg-primary transition-colors"
                       style={{ width: `${(f.valor / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Colunas por mês (uma série), com o número em cima de cada uma. */
function Meses({ fatias }: { fatias: readonly Fatia[] }) {
  const max = Math.max(1, ...fatias.map(f => f.valor));
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Registradas por mês <span className="font-normal text-muted-foreground">· últimos 6 meses</span></h3>
      <div className="flex items-end gap-2 sm:gap-3 h-40 pt-4" role="list">
        {fatias.map(f => (
          <div key={f.chave} role="listitem" className="group flex-1 h-full flex flex-col items-center justify-end gap-1"
               title={`${f.rotulo}: ${f.valor} manifestaç${f.valor === 1 ? 'ão' : 'ões'}`}>
            <span className="text-xs font-semibold tabular-nums text-foreground">{f.valor}</span>
            <div className="w-full max-w-[44px] rounded-t-[4px] bg-primary/80 group-hover:bg-primary transition-colors"
                 style={{ height: `${Math.max(f.valor ? 4 : 0, (f.valor / max) * 100)}%` }} />
            <span className="text-[11px] text-muted-foreground">{f.rotulo}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PainelRelatorio() {
  const { todas } = useOuvidoria();
  const hoje = getTodayISO();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const r = useMemo(() => relatorio(todas, periodo, hoje), [todas, periodo, hoje]);
  const nomePeriodo = PERIODOS.find(p => p.valor === periodo)?.rotulo.toLowerCase() ?? '';

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          O período conta pela data da manifestação. «Abertas agora», «em alerta» e tickets são o retrato de hoje.
        </p>
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <CampoLista compacto rotulo="Período" valor={periodo} aoMudar={v => setPeriodo(v as Periodo)}
                      opcoes={PERIODOS.map(p => ({ valor: p.valor, rotulo: p.rotulo }))} />
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Numero icone={ListChecks} rotulo="Registradas" valor={String(r.registradas)}
                detalhe={`${nomePeriodo} · ${r.acompanhadas} com acompanhamento`} />
        <Numero icone={CheckCircle2} rotulo="Concluídas" valor={String(r.concluidas)} detalhe={`das registradas ${nomePeriodo}`} />
        <Numero icone={MessageSquareReply} rotulo="Tiveram retorno" valor={r.taxaRetorno === null ? '—' : `${r.taxaRetorno}%`}
                detalhe={r.comRetorno === 1 ? '1 profissional teve retorno' : `${r.comRetorno} profissionais tiveram retorno`} />
        <Numero icone={Clock3} rotulo="Tempo até o retorno"
                valor={r.mediaDiasRetorno === null ? '—' : `${String(r.mediaDiasRetorno).replace('.', ',')} d`}
                detalhe="média em dias úteis" />
        <Numero icone={Inbox} rotulo="Abertas agora" valor={String(r.abertasAgora)} detalhe="em acompanhamento" />
        <Numero icone={AlertTriangle} rotulo="Em alerta agora" valor={String(r.emAlertaAgora)} detalhe={`abertas há ${DIAS_ALERTA}+ dias úteis`} />
        <Numero icone={Ticket} rotulo="Tickets pendentes" valor={String(r.ticketsPendentes)} detalhe="falta abrir no Mundial" />
        <Numero icone={MessageSquareReply} rotulo="Encaminhadas" valor={String(r.porEncaminhado.reduce((s, f) => s + f.valor, 0))}
                detalhe={`para análise acima · ${nomePeriodo}`} />
      </div>

      <Meses fatias={r.porMes} />

      <div className={cn('grid gap-3 md:grid-cols-2')}>
        <Barras titulo="Por assunto" fatias={r.porAssunto} vazio="Nada no período." />
        <Barras titulo="Por canal" fatias={r.porCanal} vazio="Nada no período." />
        <Barras titulo="Abertas agora, por status" fatias={r.porStatusAbertas} vazio="Nenhuma aberta." />
        <Barras titulo="Quem registrou" fatias={r.porQuemRegistrou.slice(0, 8)} total={r.registradas} vazio="Nada no período." />
        <Barras titulo="Encaminhadas para (análise)" fatias={r.porEncaminhado.slice(0, 8)} vazio="Nenhuma encaminhada no período." />
      </div>
    </div>
  );
}
