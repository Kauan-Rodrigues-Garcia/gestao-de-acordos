/**
 * Ao lado da grade: o mês em números, o expediente, os aniversariantes e a
 * agenda. No celular este painel desce para baixo da grade, e a agenda vira a
 * leitura principal — a casa da grade lá só tem pontos.
 */
import { Cake, Clock } from 'lucide-react';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { cn } from '@/lib/utils';
import {
  SEMANA_CURTA, diaDaSemana, type EventoCalendario, type ResumoDoMes,
} from '@/lib/calendarioSetor';
import type { CapaDoMes } from '@/services/calendario/calendario.service';
import { IconeTipo } from './tipos';

interface Props {
  resumo: ResumoDoMes;
  capa: CapaDoMes | null;
  aniversarios: EventoCalendario[];
  agenda: EventoCalendario[];
  ehMesCorrente: boolean;
  hojeISO: string;
  onAbrirDia: (iso: string) => void;
}

export function PainelLateral({ resumo, capa, aniversarios, agenda, ehMesCorrente, hojeISO, onAbrirDia }: Props) {
  const temExpediente = !!(capa?.expediente_semana || capa?.expediente_sabado);
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4" aria-label="O mês em números">
        <div className="grid grid-cols-2 gap-3">
          <Numero rotulo="Dias úteis" valor={resumo.diasUteis} sub={`de ${resumo.diasNoMes} dias`} forte />
          {ehMesCorrente && resumo.diasUteisRestantes !== null
            ? <Numero rotulo="Úteis restantes" valor={resumo.diasUteisRestantes} sub="contando hoje" />
            : <Numero rotulo="Feriados" valor={resumo.feriados} />}
          <Numero rotulo="Banco de horas" valor={resumo.diasComBancoDeHoras} sub={resumo.diasComBancoDeHoras === 1 ? 'dia' : 'dias'} />
          {ehMesCorrente
            ? <Numero rotulo="Feriados" valor={resumo.feriados} />
            : <Numero rotulo="Aniversariantes" valor={resumo.aniversariantes} />}
        </div>
      </section>

      {temExpediente && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" /> Expediente
          </h3>
          <dl className="space-y-1 text-sm">
            {capa?.expediente_semana && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Segunda a sexta</dt><dd className="font-medium tabular-nums text-foreground">{capa.expediente_semana}</dd></div>
            )}
            {capa?.expediente_sabado && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Sábado</dt><dd className="font-medium tabular-nums text-foreground">{capa.expediente_sabado}</dd></div>
            )}
          </dl>
        </section>
      )}

      {aniversarios.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cake className="h-4 w-4 text-muted-foreground" /> Aniversariantes do mês
          </h3>
          <ul className="space-y-2">
            {aniversarios.map(a => (
              <li key={a.id}>
                <button type="button" onClick={() => onAbrirDia(a.dia)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-1.5 py-1 text-left hover:bg-muted', a.dia === hojeISO && 'cal-opcao')}
                  data-ligado={a.dia === hojeISO}>
                  <AvatarParticipante nome={a.pessoa_nome ?? a.titulo} fotoUrl={a.pessoa_foto} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{a.pessoa_nome ?? a.titulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.dia === hojeISO ? 'Hoje! 🎉' : `Dia ${Number(a.dia.slice(8, 10))}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{ehMesCorrente ? 'Próximos dias' : 'Agenda do mês'}</h3>
        {agenda.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ehMesCorrente ? 'Nada marcado daqui até o fim do mês.' : 'Nada marcado neste mês.'}</p>
        ) : (
          <ol className="space-y-1">
            {agenda.map(e => (
              <li key={e.id}>
                <button type="button" onClick={() => onAbrirDia(e.dia)} className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left hover:bg-muted">
                  <span className={cn(
                    'w-9 shrink-0 text-center leading-none',
                    e.dia === hojeISO ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    <span className="block text-base font-semibold tabular-nums">{Number(e.dia.slice(8, 10))}</span>
                    <span className="block text-[10px] uppercase">{e.dia === hojeISO ? 'hoje' : SEMANA_CURTA[diaDaSemana(e.dia)]}</span>
                  </span>
                  <IconeTipo tipo={e.tipo} className="h-7 w-7 rounded-lg" tamanho="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {e.titulo}{e.tipo === 'aniversario' && e.pessoa_nome ? ` · ${e.pessoa_nome}` : ''}
                    </span>
                    {e.detalhe && <span className="block truncate text-xs text-muted-foreground">{e.detalhe}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function Numero({ rotulo, valor, sub, forte = false }: { rotulo: string; valor: number; sub?: string; forte?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums tracking-tight', forte ? 'cal-capa-titulo' : 'text-foreground')}>{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

