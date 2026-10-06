/**
 * O botão do Calendário no topo do app, ao lado do menu.
 *
 * Diz, sem abrir, o que interessa no dia: o mês e o que está marcado para hoje
 * no setor («Hoje: Banco de horas · até às 19:00»). O clique abre o painel por
 * cima da tela — não há aba nem rota.
 *
 * ## Quando há algo hoje (pedido de 06/10/2026)
 *
 * «Quando tiver na data, exemplo banco de horas dia 12, o Outubro fica
 * piscando e desce um lembrete do lado.» O botão pisca e o lembrete desce
 * colado a ele (`LembreteDoDia`). Os dois param quando a pessoa abre o
 * calendário ou dispensa o lembrete, e não voltam no mesmo dia — piscar o
 * expediente inteiro deixaria de ser aviso. No modo leve o botão fica aceso,
 * sem animar.
 *
 * Para quem monta o calendário, um ponto âmbar avisa que o mês corrente está
 * em rascunho, com coisa lançada, esperando ir para a operação.
 *
 * Fica fora do pacote do painel: o que este arquivo importa é leve, e o painel
 * só baixa no primeiro clique (`PainelSobDemanda`, no Layout).
 */
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayISO } from '@/lib/index';
import { useModoLeve } from '@/lib/modoLeve';
import { rotuloDoMesLongo } from '@/lib/calendarioSetor';
import { lembreteVisto, marcarLembreteVisto } from '@/lib/calendarioLembrete';
import { useCalendarioHoje } from '@/hooks/useCalendarioHoje';
import { LembreteDoDia } from './LembreteDoDia';
import './botaoCalendario.css';

interface Props {
  empresaId: string | null | undefined;
  perfilId: string | null | undefined;
  meuSetorId: string | null;
  /** A pessoa tem a chave `ver_calendario` neste produto. */
  ativo: boolean;
  onAbrir: () => void;
}

export function BotaoCalendario({ empresaId, perfilId, meuSetorId, ativo, onAbrir }: Props) {
  const { temSetor, eventosHoje, rascunhoParaPublicar } = useCalendarioHoje(empresaId, meuSetorId, ativo);
  const leve = useModoLeve();
  const hojeISO = getTodayISO();
  // Lido do navegador uma vez por dia e pessoa; depois, o estado manda.
  const [visto, setVisto] = useState<{ chave: string; sim: boolean } | null>(null);
  const chave = `${perfilId ?? ''}:${hojeISO}`;
  const jaViu = visto?.chave === chave ? visto.sim : lembreteVisto(perfilId, hojeISO);

  if (!ativo || !temSetor) return null;

  const marcarVisto = () => {
    marcarLembreteVisto(perfilId, hojeISO);
    setVisto({ chave, sim: true });
  };

  const temHoje = eventosHoje.length > 0;
  const chamando = temHoje && !jaViu;

  const nomeDoMes = rotuloDoMesLongo(hojeISO.slice(0, 7)).split(' ')[0];
  const primeiro = eventosHoje[0];
  const hoje = primeiro
    ? `${primeiro.tipo === 'aniversario' && primeiro.pessoa_nome ? `🎂 ${primeiro.pessoa_nome}` : primeiro.titulo}`
      + `${primeiro.detalhe ? ` · ${primeiro.detalhe}` : ''}`
      + `${eventosHoje.length > 1 ? ` +${eventosHoje.length - 1}` : ''}`
    : null;

  const titulo = [
    `Calendário de ${nomeDoMes.toLowerCase()}`,
    hoje ? `Hoje: ${hoje}` : null,
    rascunhoParaPublicar ? 'O mês está em rascunho: a operação ainda não vê' : null,
  ].filter(Boolean).join(' — ');

  return (
    <div className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => { marcarVisto(); onAbrir(); }}
        title={titulo}
        aria-label={titulo}
        className={cn(
          'relative flex h-8 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-2.5',
          'text-xs text-foreground transition-colors hover:bg-muted',
          chamando && 'cal-botao-aceso',
          chamando && !leve && 'cal-botao-piscando',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <span className={cn('hidden font-semibold sm:inline', chamando && 'text-primary')}>{nomeDoMes}</span>
        {hoje && (
          <span className="hidden min-w-0 items-center gap-1.5 text-muted-foreground lg:flex">
            <span className="h-3 w-px shrink-0 bg-border" />
            <span className="shrink-0">Hoje:</span>
            <span className="max-w-[16rem] truncate font-medium text-foreground">{hoje}</span>
          </span>
        )}
        {/* Âmbar: rascunho a lançar (sempre). Azul: há algo hoje — só onde o
            texto «Hoje:» não cabe. */}
        {(rascunhoParaPublicar || hoje) && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full',
              rascunhoParaPublicar ? 'bg-amber-500' : 'bg-primary lg:hidden',
            )}
            aria-hidden
          />
        )}
      </button>

      <LembreteDoDia
        aberto={chamando}
        hojeISO={hojeISO}
        eventos={eventosHoje}
        onVer={() => { marcarVisto(); onAbrir(); }}
        onDispensar={marcarVisto}
      />
    </div>
  );
}
