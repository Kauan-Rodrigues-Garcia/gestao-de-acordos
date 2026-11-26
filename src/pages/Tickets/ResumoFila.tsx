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
 * ## Uma faixa, dois modos (2.0)
 *
 * A lista e o quadro têm recortes diferentes — a lista corta por estado e por
 * pessoa (`abasDoPapel`), o quadro só por pessoa (`abasDoQuadro`), porque lá as
 * colunas já dizem o estado. Por isso a faixa recebe as abas prontas, com
 * rótulo, total e marca, e só desenha: quem decide o que é aba é `fila.ts`.
 *
 * ## Os números andam, e dois têm marca
 *
 * `ValorAnimado` avisa quando um contador muda sem a tela piscar. «Sem dono» e
 * «Parados» ganham marca de cor quando têm alguém dentro: são os dois em que
 * ninguém está sendo avisado por fora.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';

export interface AbaResumo {
  chave: string;
  label: string;
  /** A frase do `title`: o que a aba mostra. */
  ajuda: string;
  total: number;
  /** Classe do ponto de alerta, quando a aba tem alguém dentro e pede olho. */
  alerta?: string;
  /** Um respiro antes desta aba (onde começa a parte de consulta). */
  respiro?: boolean;
}

export interface ResumoFilaProps {
  abas: AbaResumo[];
  ativa: string;
  onEscolher: (chave: string) => void;
  /** Ainda não houve nenhuma resposta do servidor — os números são desconhecidos. */
  carregando?: boolean;
  /** Nome do grupo, para leitor de tela. */
  rotulo?: string;
}

function inteiro(v: number): string {
  return String(Math.round(v));
}

function ResumoFilaBase({ abas, ativa, onEscolher, carregando, rotulo = 'Recortes da fila' }: ResumoFilaProps) {
  return (
    <div className="overflow-x-auto">
      <div
        role="tablist"
        aria-label={rotulo}
        className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1"
      >
        {abas.map(a => {
          const ehAtiva = a.chave === ativa;
          return (
            <div key={a.chave} className="flex items-center">
              {a.respiro && <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-border" />}
              <button
                role="tab"
                aria-selected={ehAtiva}
                title={a.ajuda}
                onClick={() => onEscolher(a.chave)}
                className={cn(
                  'relative shrink-0 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
                  'transition-[background-color,color,box-shadow] duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ehAtiva
                    ? 'bg-background text-foreground font-semibold shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                {a.alerta && a.total > 0 && (
                  <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', a.alerta)} />
                )}
                {a.label}
                <ValorAnimado
                  valor={a.total}
                  formatar={inteiro}
                  carregando={carregando}
                  className={cn(
                    'min-w-[1.5rem] rounded-full px-1.5 py-px text-center font-mono text-[11px] leading-4 tabular-nums',
                    ehAtiva ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.07] text-muted-foreground',
                  )}
                  classeSubindo="ring-2 ring-primary/40"
                  classeDescendo="opacity-70"
                  aria-label={`${a.label}: ${a.total}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ResumoFila = memo(ResumoFilaBase);

export default ResumoFila;
