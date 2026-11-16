/**
 * O cartão que explica uma linha do Analítico cujo acordo está com outra pessoa.
 *
 * Três casos, um desenho só (16/11/2026 — antes eram dois `AlertDialog` de
 * texto corrido, e o operador tinha de ler o parágrafo inteiro para saber quem
 * perdia o quê):
 *
 *   transferencia  Divergente de verdade: o acordo sai de um e vai para o outro.
 *   par            O relatório mostra o colega como Extra: ele fica Extra, o
 *                  dono da linha entra como Direto. Ninguém perde.
 *   extra          A linha é Extra e já está tabulada no Direto do colega.
 *
 * O cartão só desenha. Quem decide o caso é o servidor
 * (`fn_analitico_status_tabulacao`), e quem executa é `TabulacaoCell`.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Link2, type LucideIcon } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';

export type TomDoCartao = 'transferencia' | 'par' | 'extra';

interface PessoaDoCartao {
  nome: string;
  /** O que a pessoa é nesta história: «tem o acordo», «Direto», «Extra»… */
  papel: string;
}

interface CartaoDecisaoTabulacaoProps {
  aberto: boolean;
  onAberto: (aberto: boolean) => void;
  tom: TomDoCartao;
  titulo: string;
  codigo: string;
  cliente?: string | null;
  /** Lado esquerdo: quem tem (ou tinha) o acordo. */
  de: PessoaDoCartao;
  /** Lado direito: o dono da linha — em nome de quem o pagamento entrou. */
  para: PessoaDoCartao;
  valor: number;
  forma: string;
  /** 'yyyy-MM-dd' */
  dataPagamento?: string | null;
  /** O que acontece ao confirmar (ou o que já aconteceu), em frases curtas. */
  passos: ReactNode[];
  /** Sem `confirmar`, o cartão é só informativo: um botão «Fechar». */
  confirmar?: { rotulo: string; onClick: () => void };
}

const TONS: Record<TomDoCartao, {
  Icone: LucideIcon; selo: string; texto: string; seta: string; botao: string;
}> = {
  transferencia: {
    Icone: AlertTriangle,
    selo:  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    texto: 'text-amber-600 dark:text-amber-400',
    seta:  'text-amber-500',
    botao: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  par: {
    Icone: Link2,
    selo:  'bg-primary/15 text-primary',
    texto: 'text-primary',
    seta:  'text-primary',
    botao: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
  extra: {
    Icone: CheckCircle2,
    selo:  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    texto: 'text-emerald-600 dark:text-emerald-400',
    seta:  'text-emerald-500',
    botao: '',
  },
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

function Pessoa({ pessoa, destaque }: { pessoa: PessoaDoCartao; destaque?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          destaque ?? 'bg-muted text-muted-foreground',
        )}
      >
        {iniciais(pessoa.nome)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{pessoa.nome}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{pessoa.papel}</span>
      </span>
    </div>
  );
}

export function CartaoDecisaoTabulacao({
  aberto, onAberto, tom, titulo, codigo, cliente, de, para, valor, forma,
  dataPagamento, passos, confirmar,
}: CartaoDecisaoTabulacaoProps) {
  const t = TONS[tom];
  const data = dataPagamento
    ? new Date(dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <AlertDialog open={aberto} onOpenChange={onAberto}>
      <AlertDialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <AlertDialogHeader className="space-y-0 p-5 pb-4 text-left">
          <div className="flex items-start gap-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t.selo)}>
              <t.Icone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-base leading-snug">{titulo}</AlertDialogTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Código <span className="font-mono font-semibold text-foreground">{codigo}</span>
                {cliente && <> · {cliente}</>}
              </p>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription asChild className="text-foreground">
          <div className="space-y-3 px-5 pb-5">
            {/* Quem tem o acordo → em nome de quem o pagamento entrou. */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
              <Pessoa pessoa={de} />
              <ArrowRight className={cn('h-4 w-4 shrink-0', t.seta)} aria-hidden="true" />
              <Pessoa pessoa={para} destaque={t.selo} />
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Recebido</dt>
                <dd className="truncate font-mono text-xs font-semibold tabular-nums">{formatBRL(valor)}</dd>
              </div>
              <div className="rounded-lg border border-border px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Forma</dt>
                <dd className="truncate text-xs font-semibold">{forma}</dd>
              </div>
              <div className="rounded-lg border border-border px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Pago em</dt>
                <dd className="truncate font-mono text-xs font-semibold tabular-nums">{data ?? '—'}</dd>
              </div>
            </dl>

            <div>
              <p className={cn('text-[11px] font-semibold uppercase tracking-wide', t.texto)}>
                {confirmar ? 'Ao confirmar' : 'Como ficou'}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {passos.map((passo, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug text-foreground/90">
                    <span aria-hidden="true" className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current', t.texto)} />
                    <span>{passo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="border-t border-border bg-muted/20 px-5 py-3">
          <AlertDialogCancel className="mt-0">{confirmar ? 'Cancelar' : 'Fechar'}</AlertDialogCancel>
          {confirmar && (
            <AlertDialogAction onClick={confirmar.onClick} className={t.botao}>
              {confirmar.rotulo}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
