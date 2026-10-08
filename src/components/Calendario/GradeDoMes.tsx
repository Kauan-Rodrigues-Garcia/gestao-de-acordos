/**
 * A grade do mês, de domingo a sábado — o desenho dos calendários que a
 * liderança já monta à mão.
 *
 * Cada casa diz, sem precisar abrir: o número, se é dia útil, se é hoje, e o
 * que acontece nela. A cor da casa segue uma ordem só, do mais forte ao mais
 * fraco: destaque (a cor cheia do tema) › feriado › banco de horas (o tom
 * suave do tema) › dia não útil › dia comum.
 *
 * Feriado é o das Metas e só ele (`feriadosDoMes`): o dia em que a operação não
 * trabalha fica vermelho. O feriado nacional em que as Metas contam o dia
 * aparece escrito, com «expediente normal», sem pintar a casa.
 *
 * No celular a casa mostra só pontos coloridos — o texto não cabe em 1/7 da
 * tela —, e o toque abre o dia. A leitura por extenso fica na agenda, ao lado.
 */
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import {
  SEMANA_CURTA, semanasDoMes, type EventoCalendario, type FeriadoDoDia,
} from '@/lib/calendarioSetor';
import { estiloDoTipo } from './estiloTipo';

interface Props {
  mes: string;
  porDia: Map<string, EventoCalendario[]>;
  ehDiaUtil: (iso: string) => boolean;
  feriados: ReadonlyMap<string, FeriadoDoDia>;
  hojeISO: string;
  onAbrirDia: (iso: string) => void;
}

/** Quantos eventos cabem por extenso numa casa (do `sm` para cima). */
const VISIVEIS = 3;

const COR_FERIADO = '#DC2626';
/** O feriado em que se trabalha: azul, de informação, e não o vermelho de folga. */
const COR_FERIADO_TRABALHADO = '#0284C7';

export function GradeDoMes({ mes, porDia, ehDiaUtil, feriados, hojeISO, onAbrirDia }: Props) {
  const semanas = semanasDoMes(mes);
  return (
    <div role="grid" aria-label="Dias do mês" className="overflow-hidden">
      <div role="row" className="cal-semana grid grid-cols-7 border-b border-border">
        {SEMANA_CURTA.map(d => (
          <div key={d} role="columnheader" className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide sm:text-xs">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {semanas.flat().map((iso, i) => iso
          ? (
            <Casa
              key={iso}
              iso={iso}
              eventos={porDia.get(iso) ?? []}
              util={ehDiaUtil(iso)}
              feriado={feriados.get(iso) ?? null}
              hoje={iso === hojeISO}
              onAbrir={() => onAbrirDia(iso)}
            />
          )
          : <div key={`fora-${i}`} role="gridcell" aria-hidden className="cal-fora min-h-[58px] sm:min-h-[112px]" />,
        )}
      </div>
    </div>
  );
}

function Casa({ iso, eventos, util, feriado, hoje, onAbrir }: {
  iso: string;
  eventos: EventoCalendario[];
  util: boolean;
  feriado: FeriadoDoDia | null;
  hoje: boolean;
  onAbrir: () => void;
}) {
  const dia = Number(iso.slice(8, 10));
  const forte = eventos.some(e => e.destaque);
  const folga = feriado?.folga === true;
  const banco = eventos.some(e => e.tipo === 'banco_horas');
  const corFeriado = folga ? COR_FERIADO : COR_FERIADO_TRABALHADO;

  const descricao = [
    `Dia ${dia}`,
    hoje ? 'hoje' : null,
    util ? 'dia útil' : 'não é dia útil',
    feriado ? (folga ? `feriado: ${feriado.nome}` : `${feriado.nome}, expediente normal`) : null,
    ...eventos.map(e => [e.titulo, e.detalhe, e.pessoa_nome].filter(Boolean).join(' ')),
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      role="gridcell"
      onClick={onAbrir}
      aria-label={descricao}
      className={cn(
        'cal-dia min-h-[58px] p-1.5 sm:min-h-[112px] sm:p-2',
        forte ? 'cal-forte' : folga ? 'cal-feriado' : banco ? 'cal-tinta' : !util && 'cal-nao-util',
        hoje && 'cal-hoje',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn('cal-numero text-xs font-semibold sm:text-sm', !util && !forte && 'font-medium')}>
          {String(dia).padStart(2, '0')}
        </span>
        {hoje && <span className="cal-selo-hoje hidden sm:inline">Hoje</span>}
      </div>

      {/* Celular: um ponto por evento. */}
      {(eventos.length > 0 || feriado) && (
        <div className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
          {feriado && <span className="cal-ponto" style={{ '--tipo': corFeriado } as CSSProperties} />}
          {eventos.slice(0, 5).map(e => <span key={e.id} className="cal-ponto" style={estiloDoTipo(e.tipo)} />)}
        </div>
      )}

      {/* Do `sm` para cima: o evento por extenso. */}
      <div className="hidden min-w-0 flex-1 flex-col justify-center gap-1 sm:flex" aria-hidden>
        {feriado && <Linha titulo={feriado.nome} detalhe={folga ? null : 'expediente normal'} tipoCor={corFeriado} />}
        {eventos.slice(0, VISIVEIS).map(e => (
          <Linha
            key={e.id}
            titulo={e.tipo === 'aniversario' && e.pessoa_nome ? `🎂 ${primeiroNome(e.pessoa_nome)}` : e.titulo}
            detalhe={e.detalhe}
            estilo={estiloDoTipo(e.tipo)}
          />
        ))}
        {eventos.length > VISIVEIS && (
          <span className="text-[10px] font-medium opacity-75">+{eventos.length - VISIVEIS} mais</span>
        )}
      </div>
    </button>
  );
}

function Linha({ titulo, detalhe, estilo, tipoCor }: {
  titulo: string; detalhe: string | null; estilo?: CSSProperties; tipoCor?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" style={tipoCor ? { '--tipo': tipoCor } as CSSProperties : estilo}>
      <span className="cal-ponto mt-[0.3rem]" />
      <div className="min-w-0 leading-tight">
        <p className="cal-chip-titulo truncate text-[11px] font-semibold lg:text-xs">{titulo}</p>
        {detalhe && <p className="cal-chip-detalhe truncate text-[10px] text-muted-foreground lg:text-[11px]">{detalhe}</p>}
      </div>
    </div>
  );
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
