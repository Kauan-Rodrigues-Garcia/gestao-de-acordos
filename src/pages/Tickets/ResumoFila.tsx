/**
 * ResumoFila — os contadores do topo, que também são o filtro.
 *
 * ## Por que contador e filtro são a mesma coisa
 *
 * Um painel que mostra "Sem dono: 3" e não deixa clicar obriga a pessoa a
 * reproduzir o recorte à mão nos seletores abaixo — e ela vai errar, porque
 * "sem dono" não é um valor de nenhum campo, é uma combinação. Aqui o número é
 * o botão: ver e ir são o mesmo gesto.
 *
 * ## Os números andam
 *
 * `ValorAnimado` existe justamente para isto. Depois que a tela deixou de
 * piscar a cada evento, um contador que sobe de 7 para 8 sem movimento nenhum
 * passa despercebido — a animação é o aviso que o piscar dava antes, sem o
 * custo que ele tinha.
 *
 * ## O ponto vermelho
 *
 * Só "Sem dono" e "Parados" ganham marca, e só quando são maiores que zero.
 * São os dois segmentos em que ninguém está sendo avisado por fora: o ticket
 * sem responsável não notifica ninguém, e o parado já notificou e não adiantou.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import { SEGMENTOS, type Segmento } from './fila';

export interface ResumoFilaProps {
  contagem: Record<Segmento, number>;
  segmento: Segmento;
  onEscolher: (s: Segmento) => void;
  /** Ainda não houve nenhuma resposta do servidor — os números são desconhecidos. */
  carregando?: boolean;
}

/** Segmentos que merecem marca quando têm alguém dentro. */
const ALERTA: Partial<Record<Segmento, string>> = {
  sem_dono: 'bg-amber-500',
  parados:  'bg-destructive',
};

function inteiro(v: number): string {
  return String(Math.round(v));
}

function ResumoFilaBase({ contagem, segmento, onEscolher, carregando }: ResumoFilaProps) {
  return (
    <div
      role="tablist"
      aria-label="Recortes da fila"
      className="flex items-stretch gap-2 overflow-x-auto pb-0.5"
    >
      {SEGMENTOS.map(s => {
        const ativo = s.chave === segmento;
        const total = contagem[s.chave] ?? 0;
        const marca = ALERTA[s.chave];

        return (
          <button
            key={s.chave}
            role="tab"
            aria-selected={ativo}
            title={s.ajuda}
            onClick={() => onEscolher(s.chave)}
            className={cn(
              'group relative shrink-0 rounded-lg border px-3 py-2 text-left',
              'transition-colors duration-150 focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              ativo
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/40',
            )}
          >
            <span className="flex items-center gap-1.5">
              {marca && total > 0 && (
                <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', marca)} />
              )}
              <span className={cn(
                'text-[11px] font-medium uppercase tracking-wide',
                ativo ? 'text-primary' : 'text-muted-foreground',
              )}>
                {s.label}
              </span>
            </span>

            <ValorAnimado
              valor={total}
              formatar={inteiro}
              carregando={carregando}
              className={cn(
                'block text-xl font-semibold font-mono leading-tight mt-0.5',
                ativo ? 'text-foreground' : 'text-foreground/80',
              )}
              classeSubindo="text-primary"
              classeDescendo="text-muted-foreground"
              aria-label={`${s.label}: ${total}`}
            />
          </button>
        );
      })}
    </div>
  );
}

export const ResumoFila = memo(ResumoFilaBase);

export default ResumoFila;
