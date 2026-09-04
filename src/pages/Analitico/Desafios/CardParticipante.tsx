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
 * `layout` respeita `prefers-reduced-motion` por conta do Framer; e o card só
 * anima quando a campanha tem `animarUltrapassagem` ligado.
 */
import { motion } from 'framer-motion';
import { ArrowUp, Check } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { percentualCurto, percentualCheio } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { ProgressoDesafio } from './ProgressoDesafio';

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
   * Muda três coisas no card. O número grande da direita passa a ser a
   * projeção, e o dinheiro desce para uma linha discreta — as equipes têm
   * metas de R$ 20.000 e de R$ 210.000, e o caixa delas não ordena nada. O
   * percentual deixa de ser cortado em «100%+»: acima de 100 é justamente o
   * que separa o primeiro do segundo. E somem o selo «concluído» e o «faltam
   * R$ X»: o alvo se move todo dia útil, e ninguém conclui antes do último.
   */
  corridaDeProjecao?: boolean;
}

export function CardParticipante({
  item, tema, mostrarFotos, animar, ehVoce, subiu = 0, ocultarEquipe,
  corridaDeProjecao,
}: CardParticipanteProps) {
  const { pessoa } = item;

  return (
    <motion.li
      layout={animar}
      layoutId={animar ? `desafio-participante-${pessoa.id}` : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors',
        ehVoce ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40',
      )}
    >
      {/* Posição */}
      <span className={cn(
        'w-7 shrink-0 text-center text-sm font-bold tabular-nums',
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
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{pessoa.nome}</span>
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
              initial={{ opacity: 0, y: 4 }}
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

        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {!ocultarEquipe && <>{pessoa.equipeNome}</>}
          {corridaDeProjecao ? (
            /* Sem «faltam» e sem «concluído»: o alvo se move todo dia útil, e
               ninguém conclui antes do último. O dinheiro fica aqui, pequeno —
               ele explica o percentual, não disputa com ele. */
            item.meta ? (
              <> · {formatBRL(item.recebido)} de {formatBRL(item.meta)} previstos até hoje</>
            ) : <> · Equipe sem meta no mês</>
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
          <p className="text-[10px] text-muted-foreground">da projeção</p>
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
    </motion.li>
  );
}

export default CardParticipante;
