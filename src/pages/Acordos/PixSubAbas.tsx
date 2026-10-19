/**
 * PixSubAbas — as quatro perguntas da tela do Pix Automático.
 *
 * ## Por que sub-abas (16/10/2026)
 *
 * A tela era uma rolagem só: registro, totais, meta, NRs em disputa, premiação,
 * correção de valor, comissão dobrada, ranking, filtros e a tabela, um embaixo
 * do outro. Quem abria para registrar passava por cima da fila de NR; quem
 * abria para pagar a premiação rolava por cima do ranking. E a fila de NR em
 * disputa — a única coisa ali que espera decisão de alguém — ficava no meio de
 * painéis de acompanhamento e passava batida. «Tudo na mesma estava dando
 * muita divergência.»
 *
 * Agora cada pergunta tem a sua:
 *
 *   Registros ........ registrar, conferir, aprovar e pagar linha a linha
 *   NRs divergentes .. o que espera decisão ou registro — e PISCA até resolver
 *   Premiação dobrada  quem dobrou a comissão e quanto falta pagar
 *   Ranking .......... o pódio do setor
 *
 * Premiação e Ranking são só de quem vê o Pix dos outros. O operador fica com
 * duas: a comissão dobrada dele mora em Registros (16/10/2026).
 *
 * ## O pisca não sai quando a aba é aberta
 *
 * Ele sai quando a divergência é RESOLVIDA. Um aviso que se apaga por ter sido
 * visto vira «já vi, depois eu faço», e é exatamente o NR que fica parado.
 *
 * Mesmo motivo da `role="group"` de `AbasSegmentadas`: o componente não
 * implementa o teclado do padrão ARIA de abas, então não anuncia `tablist`.
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SubAbaPix } from './subAbasPix';
import './pixSubAbas.css';

export interface OpcaoSubAbaPix {
  key: SubAbaPix;
  label: string;
  Icon: LucideIcon;
  /** A linha de baixo: o que há nesta aba agora, em poucas palavras. */
  resumo: string;
  /** Número no canto. Zero não desenha. */
  contador?: number;
  /** Divergência aberta: a aba pisca até ela ser resolvida. */
  alerta?: boolean;
}

interface Props {
  abas: readonly OpcaoSubAbaPix[];
  ativa: SubAbaPix;
  onTrocar: (aba: SubAbaPix) => void;
}

export function PixSubAbas({ abas, ativa, onTrocar }: Props) {
  // As colunas contam pela largura do BLOCO (`@container`), não da tela: com
  // zoom de 125% a tela ainda é «larga» (lg), mas o conteúdo tem ~690 px, e as
  // quatro abas lado a lado viravam «NRs diverge…» (19/10/2026).
  return (
    <div className="@container">
    <div
      role="group"
      aria-label="Seções do Pix Automático"
      className={cn(
        'grid gap-1.5 rounded-xl border border-border bg-muted/40 p-1',
        abas.length >= 4 ? 'grid-cols-2 @[52rem]:grid-cols-4'
          : abas.length === 3 ? 'grid-cols-1 @[40rem]:grid-cols-3'
          : 'grid-cols-1 @[26rem]:grid-cols-2',
      )}
    >
      {abas.map(({ key, label, Icon, resumo, contador, alerta }) => {
        const ativo = ativa === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={ativo}
            onClick={() => onTrocar(key)}
            className={cn(
              'group relative flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
              ativo
                ? 'border-border bg-background shadow-sm'
                : 'border-transparent hover:bg-background/70',
              alerta && 'pix-aba-alerta',
            )}
          >
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
              alerta
                ? 'bg-warning/15 text-warning'
                : ativo
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground group-hover:text-foreground',
            )}>
              <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className={cn(
                'block truncate text-[13px] font-semibold leading-tight',
                ativo || alerta ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
              )}>
                {label}
              </span>
              <span className={cn(
                'mt-0.5 block truncate text-[11px] leading-tight',
                alerta ? 'font-medium text-warning' : 'text-muted-foreground',
              )}>
                {resumo}
              </span>
            </span>

            {!!contador && (
              <span className={cn(
                'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums',
                alerta
                  ? 'bg-warning text-warning-foreground'
                  : ativo
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
              )}>
                {contador}
              </span>
            )}

            {/* O ponto do canto: o que se vê de longe, mesmo com a aba aberta. */}
            {alerta && (
              <span className="pix-aba-ponto absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-background" />
            )}

            {ativo && (
              <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
    </div>
  );
}
