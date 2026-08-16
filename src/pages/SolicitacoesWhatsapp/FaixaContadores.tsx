/**
 * FaixaContadores — os quatro números da aba, sempre visíveis.
 *
 * Existe para que os blocos possam SUMIR quando vazios sem que a informação
 * suma junto: "Na fila: 0" é notícia boa e precisa aparecer em algum lugar,
 * mas não merece uma seção inteira dizendo que não tem nada.
 *
 * "Atrasados" é o único número que ganha cor, e some quando é zero. Em
 * 16/08/2026 eram 32 de 59 em andamento — quando quase tudo está atrasado, uma
 * cor espalhada por toda a tela não aponta mais nada, então ela fica reservada
 * a este contador.
 */
import { AlertTriangle, Inbox, PlayCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

function Numero({
  rotulo, valor, icone, alerta = false,
}: {
  rotulo: string;
  valor:  number;
  icone:  React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-w-0',
      alerta
        ? 'border-destructive/40 bg-destructive/10'
        : 'border-border bg-card',
    )}>
      <span className={cn('shrink-0', alerta ? 'text-destructive' : 'text-muted-foreground')}>
        {icone}
      </span>
      <div className="min-w-0">
        <p className={cn(
          'text-base font-bold leading-none tabular-nums',
          alerta && 'text-destructive',
        )}>
          {valor}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate mt-0.5">
          {rotulo}
        </p>
      </div>
    </div>
  );
}

export function FaixaContadores({
  comigo, fila, outros, atrasados, mostrarComigo,
}: {
  comigo:     number;
  fila:       number;
  outros:     number;
  atrasados:  number;
  /**
   * Quem só enxerga os próprios pedidos nunca atende nada — para essa pessoa
   * "Comigo" seria um zero permanente, que é ruído e não informação.
   */
  mostrarComigo: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {mostrarComigo && (
        <Numero rotulo="Comigo" valor={comigo} icone={<PlayCircle className="w-4 h-4" />} />
      )}
      <Numero rotulo="Na fila" valor={fila} icone={<Inbox className="w-4 h-4" />} />
      <Numero
        rotulo={mostrarComigo ? 'Com outros' : 'Em atendimento'}
        valor={outros}
        icone={<Users className="w-4 h-4" />}
      />
      {atrasados > 0 && (
        <Numero
          rotulo="Atrasados"
          valor={atrasados}
          icone={<AlertTriangle className="w-4 h-4" />}
          alerta
        />
      )}
    </div>
  );
}
