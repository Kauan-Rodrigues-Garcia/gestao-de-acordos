/**
 * CardParticipante — uma linha do ranking.
 *
 * Traz o que o pedido §12 lista: posição, foto, nome, equipe, recebido,
 * faltante, percentual, barra e a distância para quem está logo acima.
 *
 * ## A animação de ultrapassagem mora aqui
 *
 * O card é um `motion.li` com `layout`. Quando a lista é reordenada, o Framer
 * Motion mede a posição antiga e a nova e desliza o elemento entre as duas, em
 * vez de redesenhar a lista instantaneamente. É o suficiente: nenhum estado de
 * animação para guardar, nada que possa ficar preso.
 *
 * A duração fica em ~380 ms (a mola abaixo assenta nessa faixa) — dentro dos
 * 350–500 ms pedidos, e curta o bastante para não atrapalhar quem está lendo.
 *
 * `useReducedMotion` desliga os deslocamentos; o card só anima quando a
 * campanha tem `animarUltrapassagem` ligado.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Check } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { PremioPorPosicao } from '@/services/desafios/types';
import type { EstiloTema } from './tema';
import { percentualCurto, percentualCheio } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { ProgressoDesafio } from './ProgressoDesafio';
import { PremioParticipante } from './PremioParticipante';

export interface CardParticipanteProps {
  item: ResultadoParticipante;
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  /** Destaca a linha de quem está olhando. */
  ehVoce?: boolean;
  /** Quantas posições subiu na última atualização. `0` = não subiu. */
  subiu?: number;
  /** Some com o nome da equipe (dentro do card de uma equipe, seria redundante). */
  ocultarEquipe?: boolean;
  /**
   * Corrida de PROJEÇÃO: o destaque é o percentual, e não há conclusão.
   *
   * O número grande da direita é o percentual, inclusive acima de 100%.
   * Os valores recebido/previsto saem do card. Não há selo de conclusão nem
   * valor faltante: o alvo se move todo dia útil até o encerramento.
   */
  corridaDeProjecao?: boolean;
  premio?: PremioPorPosicao;
}

export function CardParticipante({
  item, tema, mostrarFotos, animar, ehVoce, subiu = 0, ocultarEquipe,
  corridaDeProjecao, premio,
}: CardParticipanteProps) {
  const { pessoa } = item;
  const reduzirMovimento = useReducedMotion();

  return (
    <motion.li
      layout={animar && !reduzirMovimento}
      layoutId={animar && !reduzirMovimento ? `desafio-participante-${pessoa.id}` : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-3 transition-colors',
        ehVoce ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40',
      )}
    >
      {/* Posição */}
      <span className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-center text-xs font-bold tabular-nums',
        item.posicao <= 3 ? tema.destaque : 'text-muted-foreground',
      )}>
        {item.posicao}º
      </span>

      <AvatarParticipante
        nome={pessoa.nome}
        fotoUrl={pessoa.fotoUrl}
        mostrarFoto={mostrarFotos}
        className="h-9 w-9 shrink-0"
      />

      {/* Nome, equipe e barra */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words text-sm font-medium text-foreground">{pessoa.nome}</span>
          {ehVoce && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              você
            </span>
          )}
          {item.bateuMeta && !corridaDeProjecao && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
              title="Desafio concluído"
            >
              <Check className="h-2.5 w-2.5" /> concluído
            </span>
          )}
          {/* Aviso discreto e temporário — some na atualização seguinte. */}
          {subiu > 0 && (
            <motion.span
              initial={reduzirMovimento ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
            >
              <ArrowUp className="h-2.5 w-2.5" />
              Subiu {subiu} posição{subiu === 1 ? '' : 's'}
            </motion.span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <ProgressoDesafio
            progresso={item.progresso}
            cor={tema.barra}
            className="h-1.5 max-w-[240px]"
            aria-label={`Progresso de ${pessoa.nome}`}
          />
          {/* Na corrida de projeção o percentual é o número GRANDE da direita.
              Repeti-lo aqui, pequeno, seria dizer duas vezes a mesma coisa. */}
          {item.meta && !corridaDeProjecao ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {percentualCurto(item.progresso)}
            </span>
          ) : null}
        </div>

        <p className="mt-1 break-words text-[11px] text-muted-foreground">
          {!ocultarEquipe && <>{pessoa.equipeNome}</>}
          {corridaDeProjecao ? (
            !item.meta && <>{!ocultarEquipe && pessoa.equipeNome ? ' · ' : ''}Equipe sem meta no mês</>
          ) : (
            <>
              {!ocultarEquipe && <> · </>}
              {item.falta > 0
                ? <>Faltam {formatBRL(item.falta)} do desafio de {formatBRL(item.meta ?? 0)}</>
                : item.meta ? <>Desafio concluído</> : <>Sem desafio definido</>}
              {item.paraUltrapassar !== null && item.paraUltrapassar > 0 && (
                <> · ↑ {formatBRL(item.paraUltrapassar)} para alcançar o {item.posicao - 1}º</>
              )}
            </>
          )}
        </p>
      </div>

      {/* O número que decide a disputa. */}
      {corridaDeProjecao ? (
        <div className="shrink-0 text-right">
          <span className={cn('block text-base font-bold tabular-nums',
            item.posicao <= 3 ? tema.destaque : 'text-foreground')}>
            {item.meta ? percentualCheio(item.progresso) : '—'}
          </span>
        </div>
      ) : (
        <div className="shrink-0 text-right">
          <ValorAnimado
            valor={item.recebido}
            formatar={formatBRL}
            className="text-sm font-semibold text-foreground"
            classeSubindo="text-emerald-500"
          />
          <p className="text-[10px] text-muted-foreground">
            {item.qtd} pagamento{item.qtd === 1 ? '' : 's'}
          </p>
        </div>
      )}
      {premio && <div className="w-full"><PremioParticipante key={premio.posicao} premio={premio} /></div>}
    </motion.li>
  );
}

export default CardParticipante;
