/**
 * ResumoFila — os recortes do topo, que também são o filtro.
 *
 * ## Por que contador e filtro são a mesma coisa
 *
 * Um painel que mostra "Sem dono: 3" e não deixa clicar obriga a pessoa a
 * reproduzir o recorte à mão — e ela vai errar, porque "sem dono" não é valor
 * de campo nenhum, é combinação. Aqui o número é o botão: ver e ir são o mesmo
 * gesto.
 *
 * ## Abas, não caixas
 *
 * Eram seis caixas de 60 px de altura com rótulo em caixa alta — a faixa mais
 * alta da tela antes do primeiro ticket. Viraram abas de uma linha: o número
 * continua do lado do nome, e a altura que sobrou foi para a fila. Os quatro
 * recortes de trabalho vêm primeiro; «Encerrados» e «Todos», que são consulta,
 * ficam depois de um respiro.
 *
 * ## Os números andam, e dois têm marca
 *
 * `ValorAnimado` avisa quando um contador muda sem a tela piscar. «Sem dono» e
 * «Parados» ganham marca de cor quando têm alguém dentro: são os dois em que
 * ninguém está sendo avisado por fora — o sem dono não notifica ninguém, e o
 * parado já notificou e não adiantou.
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

/** Onde começa a parte de consulta (o respiro antes dela). */
const PRIMEIRO_DE_CONSULTA: Segmento = 'encerrados';

function inteiro(v: number): string {
  return String(Math.round(v));
}

function ResumoFilaBase({ contagem, segmento, onEscolher, carregando }: ResumoFilaProps) {
  return (
    <div
      role="tablist"
      aria-label="Recortes da fila"
      className="flex items-end gap-1 overflow-x-auto border-b border-border -mb-px"
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
              'group relative shrink-0 inline-flex items-center gap-2 px-3 pt-1.5 pb-2.5 text-sm',
              'transition-colors duration-150 rounded-t-md focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              s.chave === PRIMEIRO_DE_CONSULTA && 'ml-3',
              ativo ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {marca && total > 0 && (
              <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', marca)} />
            )}
            {s.label}
            <ValorAnimado
              valor={total}
              formatar={inteiro}
              carregando={carregando}
              className={cn(
                'min-w-[1.5rem] rounded-full px-1.5 py-px text-center font-mono text-[11px] leading-4 tabular-nums',
                ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
              classeSubindo="ring-2 ring-primary/40"
              classeDescendo="opacity-70"
              aria-label={`${s.label}: ${total}`}
            />
            {/* O sublinhado da aba ativa senta na borda de baixo da faixa. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-colors',
                ativo ? 'bg-primary' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export const ResumoFila = memo(ResumoFilaBase);

export default ResumoFila;
