/**
 * HistoricoDesafios — as campanhas encerradas.
 *
 * Campanha encerrada não é apagada: ela vira histórico, com o período, o
 * vencedor e o ranking final. Um desafio com prêmio é um fato da operação, e
 * apagá-lo tira a única prova de quem ganhou.
 *
 * ## Por que o resultado só é buscado ao expandir
 *
 * Cada campanha custa uma chamada a `fn_desafio_dados`, que varre o período
 * inteiro. Buscar as doze de uma vez, para mostrar doze linhas fechadas, seria
 * doze varreduras que ninguém pediu. O item busca quando abre — e o React Query
 * guarda, então reabrir é instantâneo.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, History, Trophy } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useResultadoDesafio } from '@/hooks/useDesafios';
import type { Desafio } from '@/services/desafios/types';
import { dataBR, estiloDoTema } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { RankingDesafio } from './RankingDesafio';

function ItemHistorico({ desafio, voceId }: { desafio: Desafio; voceId?: string | null }) {
  const [aberto, setAberto] = useState(false);
  // `null` enquanto fechado: o hook não busca nada.
  const { resultado, carregando } = useResultadoDesafio(aberto ? desafio : null);
  const tema = estiloDoTema(desafio.visual.tema);
  const campeao = resultado?.individual[0] ?? null;

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <tema.Icone className={cn('h-4 w-4 shrink-0', tema.destaque)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{desafio.nome}</p>
          <p className="text-[11px] text-muted-foreground">
            {dataBR(desafio.dataInicio)} — {dataBR(desafio.dataFim)}
            {desafio.premio && <> · {desafio.premio}</>}
          </p>
        </div>
        {campeao && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <Trophy className="h-3.5 w-3.5 text-yellow-500" />
            <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
              {campeao.pessoa.nome}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatBRL(campeao.recebido)}
            </span>
          </div>
        )}
        <ChevronDown className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
          aberto && 'rotate-180',
        )} />
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="border-t border-border bg-muted/20"
          >
            <div className="space-y-3 p-3">
              {carregando && (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {!carregando && campeao && (
                <div className={cn(
                  'flex items-center gap-3 rounded-xl border bg-card p-3',
                  tema.borda,
                )}>
                  <AvatarParticipante
                    nome={campeao.pessoa.nome}
                    fotoUrl={campeao.pessoa.fotoUrl}
                    mostrarFoto={desafio.visual.mostrarFotos}
                    className="h-12 w-12"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Vencedor
                    </p>
                    <p className="truncate text-sm font-bold text-foreground">
                      {campeao.pessoa.nome}
                    </p>
                    <p className={cn('text-lg font-bold tabular-nums', tema.destaque)}>
                      {formatBRL(campeao.recebido)}
                    </p>
                  </div>
                </div>
              )}

              {!carregando && resultado && resultado.individual.length > 0 && (
                <RankingDesafio
                  lista={resultado.individual}
                  tema={tema}
                  mostrarFotos={desafio.visual.mostrarFotos}
                  // Campanha encerrada não muda mais de posição.
                  animar={false}
                  voceId={voceId}
                />
              )}

              {!carregando && resultado && resultado.individual.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Esta campanha encerrou sem participantes com recebimento no período.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

interface Props {
  encerrados: Desafio[];
  voceId?: string | null;
}

export function HistoricoDesafios({ encerrados, voceId }: Props) {
  if (!encerrados.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="h-4 w-4 text-muted-foreground" /> Encerrados
      </h3>
      <ul className="space-y-2">
        {encerrados.map(d => (
          <ItemHistorico key={d.id} desafio={d} voceId={voceId} />
        ))}
      </ul>
    </section>
  );
}

export default HistoricoDesafios;
