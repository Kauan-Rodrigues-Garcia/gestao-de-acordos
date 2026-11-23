/**
 * A campanha dos Cupons do Pix dentro da aba Pix Automático (23/11/2026):
 * o aviso em cima da tabela e o destaque das linhas do período.
 *
 * A cor é a laranja do cupom — a mesma da gaveta e da arte —, para o líder
 * bater o olho e saber que aquele Pix é da campanha especial e precisa de
 * aprovação para virar cupom. Só aparece com o desafio visível para a pessoa
 * (liberado e setor participando; o super_admin vê em prévia).
 */
import { Filter, Megaphone, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCampanhaCupom } from './campanhaCupom';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import { contarCupons, cupons, periodo, pixNoPeriodoDoCupom } from '@/services/desafioVale/regras';

export function EtiquetaCupom() {
  return (
    <span
      title="Pix da campanha especial: aprovado, conta para o cupom do operador"
      className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide bg-orange-400 text-orange-950"
    >
      <Ticket className="h-2.5 w-2.5" /> cupom
    </span>
  );
}

export function AvisoCupomNoPix({ itens, podeAprovar, onVerPendentes }: {
  itens: readonly PixAutoAcordo[];
  podeAprovar: boolean;
  /** Filtra a tabela: só pendentes, só o período da campanha. */
  onVerPendentes?: (de: string, ate: string) => void;
}) {
  const d = useCampanhaCupom();
  if (!d) return null;
  const doPeriodo = itens.filter(i => pixNoPeriodoDoCupom(i.criado_em, d));
  const c = contarCupons(doPeriodo, d.cupom_pix);
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-orange-400/60 bg-orange-400/[0.08] p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-400 text-orange-950">
        <Ticket className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">
          Campanha especial · Cupons do Pix de {periodo(d.cupom_inicio!, d.cupom_fim!)}
        </p>
        <p className="text-muted-foreground">
          A cada <strong className="text-foreground">{d.cupom_pix} Pix aprovados</strong>, 1 cupom. Os Pix do período estão
          {' '}<span className="font-semibold text-orange-700 dark:text-orange-300">destacados em laranja</span> com a etiqueta <EtiquetaCupom />.
        </p>
        {c.pendentes > 0 && (
          <p className="mt-1 inline-flex items-center gap-1.5 font-semibold text-orange-700 dark:text-orange-300">
            <Megaphone className="h-4 w-4" aria-hidden />
            {podeAprovar
              ? `${c.pendentes} Pix da campanha esperando a sua aprovação.`
              : `${c.pendentes} Pix esperando o líder — cobre a aprovação para virar cupom!`}
          </p>
        )}
      </div>
      {podeAprovar && c.pendentes > 0 && onVerPendentes && (
        <Button size="sm" className="shrink-0 self-center bg-orange-500 text-white hover:bg-orange-600"
          onClick={() => onVerPendentes(d.cupom_inicio!, d.cupom_fim!)}>
          <Filter className="mr-1.5 h-4 w-4" aria-hidden /> Ver só os {c.pendentes} pendentes
        </Button>
      )}
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <span className="block text-lg font-bold leading-tight text-foreground tabular-nums">{c.aprovados}</span>
        aprovados no período{!podeAprovar && <span className="block font-semibold text-orange-700 dark:text-orange-300">{cupons(c.cupons)}</span>}
      </div>
    </div>
  );
}
