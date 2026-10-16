/**
 * PixDivergencias — as peças da sub-aba «NRs divergentes».
 *
 * ## O desenho (16/10/2026, segunda rodada)
 *
 * A primeira versão abria com dois cartões de número em degradê (âmbar e azul),
 * e embaixo cada lista vinha na própria moldura colorida, com título próprio.
 * Muita cor para uma tela de conferência, e o mesmo assunto dito duas vezes —
 * no cartão de número e de novo no cabeçalho da lista.
 *
 * Agora é uma linha de status e três seções numeradas, sempre na mesma ordem:
 *
 *   1  NRs em disputa ........ espera decisão de líder
 *   2  Sem registro no Pix ... espera a pessoa registrar
 *   3  Correção de valor ..... anotação de quem pode (não faz piscar)
 *
 * Cada seção diz o que é numa frase e mostra o contador; a cor só aparece onde
 * há pendência (o `warning` do tema), e o vazio de cada seção é uma linha cinza
 * — o líder lê de cima a baixo e sabe, sem procurar, o que falta e o que não.
 */
import type { ReactNode } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A linha do topo: tudo certo, ou quantas pendências e de quê. */
export function ResumoDivergencias({ pendencias, partes }: {
  pendencias: number;
  /** «1 NR em disputa», «2 acordos sem registro» — só as que existem. */
  partes: string[];
}) {
  const ok = pendencias === 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        ok ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning',
      )}>
        {ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {ok
            ? 'Nenhuma divergência aberta'
            : `${pendencias} ${pendencias === 1 ? 'pendência' : 'pendências'} para resolver`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {ok
            ? 'Quando aparecer um NR em disputa ou um acordo sem registro, esta aba pisca até ser resolvida.'
            : `${partes.join(' · ')}. A aba para de piscar quando tudo for resolvido.`}
        </p>
      </div>
    </div>
  );
}

/** Uma seção numerada: título, uma frase, contador — e o conteúdo embaixo. */
export function SecaoDivergencia({
  numero, titulo, descricao, contador, alerta = true, vazio, children,
}: {
  numero: number;
  titulo: string;
  descricao: string;
  /** `null` não desenha contador (a seção não é uma fila). */
  contador: number | null;
  /** Contador acima de zero pinta de alerta? A correção de valor não pinta. */
  alerta?: boolean;
  /** A frase do vazio. Só usada quando `contador` é zero. */
  vazio?: string;
  children?: ReactNode;
}) {
  const pendente = alerta && (contador ?? 0) > 0;
  return (
    <section className="space-y-2.5">
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
          pendente ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground',
        )}>
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
            {contador != null && (
              <span className={cn(
                'rounded-full px-1.5 text-[10.5px] font-bold tabular-nums',
                pendente ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
              )}>
                {contador}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{descricao}</p>
        </div>
      </div>
      <div className="pl-9">
        {contador === 0 && vazio
          ? <p className="rounded-lg border border-dashed border-border px-4 py-3 text-[11px] text-muted-foreground">{vazio}</p>
          : children}
      </div>
    </section>
  );
}
