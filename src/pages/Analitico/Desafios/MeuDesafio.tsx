/**
 * MeuDesafio — "Sua corrida".
 *
 * O bloco pessoal: onde a pessoa está, quanto já recebeu, quanto falta para a
 * meta e quanto falta para alcançar quem está logo acima. É a resposta às
 * perguntas 5, 6 e 7 do pedido, e ela precisa estar acima da dobra para quem
 * disputa.
 *
 * Só aparece quando a pessoa logada está no ranking. Quem não disputa — um
 * gerente que não recebe, por exemplo — não vê um card vazio dizendo que está
 * em 0º com R$ 0,00: vê a disputa, que é o que interessa a ele.
 */
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { percentualCurto } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { ProgressoDesafio } from './ProgressoDesafio';

interface Props {
  item: ResultadoParticipante;
  tema: EstiloTema;
  mostrarFotos: boolean;
  totalParticipantes: number;
}

export function MeuDesafio({ item, tema, mostrarFotos, totalParticipantes }: Props) {
  const { pessoa } = item;

  return (
    <section className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sua corrida
      </h3>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <AvatarParticipante
          nome={pessoa.nome}
          fotoUrl={pessoa.fotoUrl}
          mostrarFoto={mostrarFotos}
          className="h-16 w-16 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="truncate text-lg font-bold text-foreground">{pessoa.nome}</p>
            <span className={cn('text-sm font-semibold', tema.destaque)}>
              #{item.posicao} de {totalParticipantes}
            </span>
            <span className="text-xs text-muted-foreground">{pessoa.equipeNome}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <ValorAnimado
              valor={item.recebido}
              formatar={formatBRL}
              className="text-2xl font-bold text-foreground"
              classeSubindo="text-emerald-500"
            />
            {item.meta ? (
              <span className="text-sm text-muted-foreground">
                {percentualCurto(item.progresso)} do seu desafio de {formatBRL(item.meta)}
              </span>
            ) : null}
          </div>

          <ProgressoDesafio
            progresso={item.progresso}
            cor={tema.barra}
            className="mt-2"
            aria-label="Seu progresso no desafio"
          />

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {item.meta ? (
              item.falta > 0 ? (
                <span className="text-muted-foreground">
                  Faltam <strong className="text-foreground">{formatBRL(item.falta)}</strong> para concluir
                </span>
              ) : (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Desafio concluído
                </span>
              )
            ) : null}

            {item.paraUltrapassar !== null && item.paraUltrapassar > 0 ? (
              <span className="text-muted-foreground">
                ↑ <strong className="text-foreground">{formatBRL(item.paraUltrapassar)}</strong> para
                alcançar {item.nomeAcima ? <>{item.nomeAcima} </> : null}
                no {item.posicao - 1}º
              </span>
            ) : item.posicao === 1 ? (
              <span className={cn('font-medium', tema.destaque)}>Você está na liderança</span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default MeuDesafio;
