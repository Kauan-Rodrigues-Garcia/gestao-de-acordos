/**
 * SetoresDoDesafio — o interruptor da aba, setor a setor.
 *
 * ## Por que existe, se já há uma permissão
 *
 * `analitico_sub_desafios` decide por CARGO. Isso não responde à pergunta que a
 * operação faz: o Play 1 participa da gincana e o Digital não — e os dois têm
 * operadores com o mesmo cargo. Desligar por cargo tiraria a aba dos dois.
 *
 * As duas regras se somam: precisa da chave do cargo E do setor ligado.
 *
 * ## Quem mexe
 *
 * Administração (`administrar_sistema`), com o super_admin garantido na própria
 * política do banco. Esconder este painel é conveniência — quem recusa a
 * gravação é a RLS de `desafios_setores`.
 *
 * ## Setor ausente participa
 *
 * A tabela guarda a exceção, não o cadastro. Um setor criado amanhã já nasce
 * participando, sem ninguém precisar lembrar de ligá-lo — que é o erro que uma
 * lista de "quem participa" produziria no primeiro mês.
 */
import { useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface SetorSimples { id: string; nome: string }

interface Props {
  setores: SetorSimples[];
  porSetor: Record<string, boolean>;
  dbAtiva: boolean;
  onDefinir: (setorId: string, ativo: boolean) => Promise<{ error: string | null }>;
}

export function SetoresDoDesafio({ setores, porSetor, dbAtiva, onDefinir }: Props) {
  const [salvando, setSalvando] = useState<string | null>(null);

  if (!dbAtiva) {
    return (
      <section className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        O controle por setor precisa da migration <code>20260823190000</code>.
      </section>
    );
  }

  if (!setores.length) return null;

  async function alternar(setorId: string, ativo: boolean) {
    setSalvando(setorId);
    const { error } = await onDefinir(setorId, ativo);
    setSalvando(null);
    if (error) { toast.error(error); return; }
    toast.success(ativo ? 'Setor participando dos Desafios.' : 'Setor fora dos Desafios.');
  }

  const desligados = setores.filter(s => porSetor[s.id] === false).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          Setores que participam dos Desafios
        </h3>
        {desligados > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {desligados} setor{desligados === 1 ? '' : 'es'} fora
          </span>
        )}
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Desligar tira a aba Desafios de quem é daquele setor. Some com a
        permissão de cargo: é preciso ter as duas.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {setores.map(s => {
          // Ausente do mapa = participa. É o padrão, e é por isso que a
          // comparação é com `=== false` e não com o valor puro.
          const ativo = porSetor[s.id] !== false;
          const ocupado = salvando === s.id;
          return (
            <li key={s.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
                ativo ? 'border-border' : 'border-dashed border-border bg-muted/30',
              )}
            >
              <span className={cn(
                'min-w-0 truncate text-xs font-medium',
                ativo ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {s.nome}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {ocupado && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <Switch
                  checked={ativo}
                  disabled={ocupado}
                  onCheckedChange={v => { void alternar(s.id, v); }}
                  aria-label={`Desafios no setor ${s.nome}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default SetoresDoDesafio;
