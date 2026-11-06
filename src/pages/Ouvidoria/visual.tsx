/**
 * visual.tsx — as peças pequenas da aba Ouvidoria: selo de status, ícone do
 * canal, selo de retorno e o rótulo de seção dos formulários.
 */
import {
  CheckCircle2, Clock3, FileWarning, Mail, MessageCircle, Phone, Send, Building2,
  CircleDot, MoreHorizontal, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataBr, rotuloCanal, rotuloStatus, type Canal, type Status } from './ouvidoria';

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

export function TituloSecao({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icone className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}
