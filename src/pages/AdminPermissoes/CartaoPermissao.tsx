/**
 * CartaoPermissao — uma permissão, num cartão de largura de leitura.
 *
 * ## O que estava errado antes
 *
 * Cada permissão era uma LINHA da largura da tela. Num monitor grande isso
 * punha o rótulo na coluna esquerda e o interruptor a mil e seiscentos pixels
 * dele: para saber o que estava ligando, o olho tinha que atravessar a tela e
 * voltar. Em lista longa, é onde se erra o clique.
 *
 * O cartão resolve por geometria, não por decoração: o controle fica no canto
 * superior direito de uma caixa estreita, sempre a poucos centímetros do texto
 * que ele governa. A lista vira grade, e a grade acompanha a largura
 * disponível — uma coluna no notebook, três no monitor.
 */
import { cn } from '@/lib/utils';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';

interface Props {
  permissao: PermissaoMeta;
  /** O interruptor — quem chama decide se é de dois ou de três estados. */
  controle: React.ReactNode;
  ligada: boolean;
  alterada?: boolean;
  /** Aviso de "ligada e sem efeito", com o atalho que resolve. */
  aviso?: React.ReactNode;
  esmaecido?: boolean;
}

export function CartaoPermissao({
  permissao, controle, ligada, alterada, aviso, esmaecido,
}: Props) {
  return (
    <div
      className={cn(
        'group relative flex flex-col gap-1 rounded-lg border p-3 transition-all',
        ligada
          ? 'border-primary/30 bg-primary/[0.04]'
          : 'border-border bg-background hover:border-border/80',
        alterada && 'ring-2 ring-amber-500/50 border-amber-500/50',
        esmaecido && 'opacity-50',
      )}
    >
      {/* `flex-wrap`: o controle da aba «Por pessoa» tem tres estados e uma
          legenda, e nao cabe ao lado do rotulo em coluna estreita. Deixar
          quebrar e melhor do que espremer o texto. */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <p className={cn(
          'flex-1 text-[13px] font-medium leading-snug',
          ligada ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {permissao.label}
        </p>
        <div className="ml-auto shrink-0 -mt-0.5">{controle}</div>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground/80">
        {permissao.descricao}
      </p>

      {permissao.tenants && (
        <span className="self-start text-[9px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px">
          {permissao.tenants.join(' · ')}
        </span>
      )}

      {aviso}
    </div>
  );
}

/**
 * A grade que embala os cartões. Uma coluna no estreito, três no largo.
 *
 * `largas` para quando o controle ocupa espaço — o seletor de três estados da
 * aba «Por pessoa» não cabe em coluna de um terço.
 */
export function GradeDeCartoes({
  children, largas,
}: { children: React.ReactNode; largas?: boolean }) {
  return (
    <div className={cn(
      'grid gap-2 p-3 sm:grid-cols-2',
      !largas && 'xl:grid-cols-3',
    )}>
      {children}
    </div>
  );
}
