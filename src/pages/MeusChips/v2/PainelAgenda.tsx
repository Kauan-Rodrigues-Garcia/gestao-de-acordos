/**
 * PainelAgenda — «Próximos avisos» / «Precisa de atenção agora».
 *
 * Tempos de status e lembretes em ordem de fim (vencidos primeiro), e, na
 * visão de gestão, quem está sem nenhum chip ativo e quem não tem chip.
 */
import { useState } from 'react';
import { AlarmClock, BellRing, Hourglass, UserX, ZapOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { formatarRestante } from '@/services/numeros/numerosRegras';
import {
  montarAgenda, type LinhaPessoa, type PessoaDoPainel,
} from '@/services/chipsFisicos/chipsPainel';
import type { ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function AvatarPessoa({ nome, foto, className }: { nome: string; foto: string | null; className?: string }) {
  return (
    <Avatar className={cn('h-9 w-9', className)}>
      {foto && <AvatarImage src={foto} alt="" />}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

export function PainelAgenda({
  chips, nomeDe, semAtivo = [], semChip = [], titulo, onAbrirChip, mostrarDono,
}: {
  chips: readonly ChipFisicoRow[];
  nomeDe: (id: string) => string;
  semAtivo?: readonly LinhaPessoa<ChipFisicoRow>[];
  semChip?: readonly PessoaDoPainel[];
  titulo: string;
  onAbrirChip?: (c: ChipFisicoRow) => void;
  mostrarDono: boolean;
}) {
  const agora = useAgora();
  const [todos, setTodos] = useState(false);
  const itens = montarAgenda(chips, agora);
  const limite = todos ? itens.length : 6;
  const vazio = itens.length === 0 && semAtivo.length === 0 && semChip.length === 0;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <BellRing className="h-5 w-5 text-primary" aria-hidden /> {titulo}
      </h2>

      {vazio && (
        <p className="py-6 text-center text-base text-muted-foreground">
          Tudo em dia. Nenhum tempo correndo, nenhum lembrete.
        </p>
      )}

      {itens.length > 0 && (
        <ul className={cn('grid gap-2', mostrarDono && 'md:grid-cols-2')}>
          {itens.slice(0, limite).map(i => (
            <li key={i.chave}>
              <button
                type="button"
                onClick={() => onAbrirChip?.(i.chip)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                  i.vencido && (i.tipo === 'lembrete' ? 'border-violet-500/40 bg-violet-500/8' : 'border-sky-500/40 bg-sky-500/8'),
                )}
              >
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  i.tipo === 'lembrete' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-orange-500/15 text-orange-600 dark:text-orange-300',
                )}>
                  {i.tipo === 'lembrete' ? <AlarmClock className="h-4 w-4" aria-hidden /> : <Hourglass className="h-4 w-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">
                    {i.tipo === 'lembrete' ? i.texto : `Tempo de ${i.chip.status === 'restricao' ? 'restrição' : i.chip.status}`}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {mascararNumero(i.chip.numero)}{mostrarDono && nomeDe(i.chip.operador_id) ? ` · ${nomeDe(i.chip.operador_id)}` : ''}
                  </span>
                </span>
                <span className={cn(
                  'shrink-0 font-mono text-base font-semibold tabular-nums',
                  i.vencido && 'animate-pulse text-sky-700 dark:text-sky-300',
                )}>
                  {i.vencido ? 'acabou' : formatarRestante(i.fim - agora)}
                </span>
              </button>
            </li>
          ))}
          {itens.length > 6 && (
            <li className={cn('text-center', mostrarDono && 'md:col-span-2')}>
              <button type="button" onClick={() => setTodos(t => !t)}
                      className="rounded-lg px-3 py-1.5 text-base font-medium text-primary hover:bg-primary/10">
                {todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}
              </button>
            </li>
          )}
        </ul>
      )}

      {semAtivo.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-red-600 dark:text-red-400">
            <ZapOff className="h-4 w-4" aria-hidden /> Sem nenhum chip ativo ({semAtivo.length})
          </h3>
          <ul className="flex flex-wrap gap-2">
            {semAtivo.slice(0, 20).map(l => (
              <li key={l.pessoa.id} className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/5 py-1 pl-1 pr-3 text-sm">
                <AvatarPessoa nome={l.pessoa.nome} foto={l.pessoa.foto_url} className="h-6 w-6" />
                {l.pessoa.nome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {semChip.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <UserX className="h-4 w-4" aria-hidden /> Sem chip cadastrado ({semChip.length})
          </h3>
          <ul className="flex flex-wrap gap-2">
            {semChip.slice(0, 20).map(p => (
              <li key={p.id} className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm">
                <AvatarPessoa nome={p.nome} foto={p.foto_url} className="h-6 w-6" />
                {p.nome}
              </li>
            ))}
            {semChip.length > 20 && <li className="self-center text-sm text-muted-foreground">e mais {semChip.length - 20}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
