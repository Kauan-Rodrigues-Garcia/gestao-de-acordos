/**
 * visual.tsx — as peças pequenas da aba Ouvidoria: selo de status, ícone do
 * canal, selo de retorno e o rótulo de seção dos formulários.
 */
import {
  AlarmClock, CheckCircle2, Clock3, FileWarning, Layers, Mail, MessageCircle, Phone, Send, Building2,
  CircleDot, MoreHorizontal, Ticket, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  anosComEtiqueta, dataBr, quandoBr, rotuloCanal, rotuloStatus, situacaoEncaminhamento, temRetornoAgendado,
  urgenciaRetorno, type Canal, type Etiqueta, type Grupo, type Manifestacao, type SituacaoEncaminhamento, type Status,
} from './ouvidoria';
import { COR_ETIQUETA } from './estilo';

const COR_STATUS: Record<Status, string> = {
  aberto: 'bg-info/10 text-info border-info/30',
  em_andamento: 'bg-primary/10 text-primary border-primary/30',
  pendente_documentos: 'bg-warning/15 text-warning border-warning/40',
  encaminhado_coren: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
  concluido: 'bg-success/10 text-success border-success/30',
};

const ICONE_STATUS: Record<Status, LucideIcon> = {
  aberto: CircleDot,
  em_andamento: Clock3,
  pendente_documentos: FileWarning,
  encaminhado_coren: Send,
  concluido: CheckCircle2,
};

export function SeloStatus({ status, className }: { status: Status; className?: string }) {
  const Icone = ICONE_STATUS[status];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
      COR_STATUS[status], className,
    )}>
      <Icone className="h-3 w-3" />
      {rotuloStatus(status)}
    </span>
  );
}

const ICONE_CANAL: Record<Canal, LucideIcon> = {
  telefone: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  ouvidoria: Building2,
  outro: MoreHorizontal,
};

export function IconeCanal({ canal, className }: { canal: Canal; className?: string }) {
  const Icone = ICONE_CANAL[canal];
  return (
    <span title={rotuloCanal(canal)} className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}>
      <Icone className="h-3.5 w-3.5" />
    </span>
  );
}

/** «Retorno 06/11» ou «Sem retorno». */
export function SeloRetorno({ data, className }: { data: string | null; className?: string }) {
  return data ? (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium text-success whitespace-nowrap', className)}>
      <CheckCircle2 className="h-3 w-3" /> Retorno {dataBr(data).slice(0, 5)}
    </span>
  ) : (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium text-warning whitespace-nowrap', className)}>
      <Clock3 className="h-3 w-3" /> Sem retorno
    </span>
  );
}

/** O ano da anuidade, pintado com a cor da etiqueta (ou neutro). */
export function ChipAno({ ano, etiqueta, className }: { ano: number; etiqueta: Etiqueta | null; className?: string }) {
  return (
    <span
      title={etiqueta ? etiqueta.nome : undefined}
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-mono font-semibold tabular-nums',
        etiqueta ? COR_ETIQUETA[etiqueta.cor].chip : 'bg-muted text-muted-foreground border-transparent',
        className,
      )}
    >
      {ano}
    </span>
  );
}

/** Os anos de uma manifestação, coloridos. */
export function AnosColoridos({ m, etiquetas, className }: {
  m: Pick<Manifestacao, 'anuidades' | 'anuidades_etiquetas'>; etiquetas: readonly Etiqueta[]; className?: string;
}) {
  const anos = anosComEtiqueta(m, etiquetas);
  if (!anos.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {anos.map(a => <ChipAno key={a.ano} ano={a.ano} etiqueta={a.etiqueta} />)}
    </span>
  );
}

/** «● Alegou ter pago   ● Alegou ter cancelado» — a legenda das cores em uso. */
export function LegendaEtiquetas({ etiquetas, className }: { etiquetas: readonly Etiqueta[]; className?: string }) {
  if (!etiquetas.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
      {etiquetas.map(e => (
        <span key={e.id} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', COR_ETIQUETA[e.cor].ponto)} />
          {e.nome}
        </span>
      ))}
    </div>
  );
}

const ROTULO_ENCAMINHAMENTO: Record<Exclude<SituacaoEncaminhamento, 'sem'>, { texto: string; classe: string }> = {
  aguardando: { texto: 'Aguardando ciência', classe: 'bg-warning/15 text-warning border-warning/40' },
  ciente: { texto: 'Ciente · analisando', classe: 'bg-info/10 text-info border-info/30' },
  respondida: { texto: 'Respondeu', classe: 'bg-success/10 text-success border-success/30' },
};

/** Onde está o encaminhamento: esperando ciência, em análise ou respondido. */
export function SeloEncaminhamento({ m, className }: { m: Manifestacao; className?: string }) {
  const s = situacaoEncaminhamento(m);
  if (s === 'sem') return null;
  const r = ROTULO_ENCAMINHAMENTO[s];
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', r.classe, className)}>
      {r.texto}
    </span>
  );
}

/** Pequenos selos da linha: grupo, ticket, retorno agendado. */
export function SelosLinha({ m, grupo, agoraMs }: { m: Manifestacao; grupo: Grupo | null; agoraMs: number }) {
  const agendado = temRetornoAgendado(m) ? m.retorno_agendado_em : null;
  const urg = agendado ? urgenciaRetorno(agendado, agoraMs) : null;
  if (!grupo && !m.ticket_status && !agendado) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {grupo && (
        <span title={grupo.titulo} className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 px-1.5 py-px text-[10px] font-semibold">
          <Layers className="h-2.5 w-2.5" /> {grupo.codigo}
        </span>
      )}
      {m.ticket_status === 'pendente' && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-500/15 text-orange-700 dark:text-orange-300 px-1.5 py-px text-[10px] font-semibold">
          <Ticket className="h-2.5 w-2.5" /> Ticket pendente
        </span>
      )}
      {m.ticket_status === 'aberto' && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-muted text-muted-foreground px-1.5 py-px text-[10px] font-medium">
          <Ticket className="h-2.5 w-2.5" /> {m.ticket_numero ? `Ticket ${m.ticket_numero}` : 'Ticket aberto'}
        </span>
      )}
      {agendado && (
        <span className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-px text-[10px] font-semibold',
          urg === 'atrasado' || urg === 'agora' ? 'bg-destructive/15 text-destructive' : 'bg-info/10 text-info',
        )}>
          <AlarmClock className="h-2.5 w-2.5" /> {quandoBr(agendado, agoraMs)}
        </span>
      )}
    </span>
  );
}

export function TituloSecao({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icone className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}
