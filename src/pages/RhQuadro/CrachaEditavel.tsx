/**
 * CrachaEditavel — o crachá de uma pessoa na tabela do setor, com edição.
 *
 * O Quadro de Pessoal é o lugar OFICIAL do crachá (pedido do Cleber,
 * 13/11/2026): o que está aqui é o que vale. O número mora em
 * `rh_dados_operadores` — o mesmo que a pessoa informou no próprio pedido e
 * que o RH Gestão usa na folha. Gravar é `fn_rh_salvar_cracha`, que exige a
 * chave `rh_editar_cracha` e acompanha o snapshot das competências ABERTAS.
 * Competência finalizada não muda.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, IdCard, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { salvarCracha } from '@/services/rh/rhGestao.service';
import type { Pessoa } from '@/services/rh/quadroPessoal';

/** O mesmo formato que a pessoa usa ao informar o próprio crachá: até 8 números. */
export const FORMATO_CRACHA = /^[0-9]{1,8}$/;

export function CrachaEditavel({
  pessoa, podeEditar, onSalvo,
}: {
  pessoa: Pessoa;
  podeEditar: boolean;
  onSalvo: (pessoaId: string, cracha: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(pessoa.cracha ?? '');
  const [salvando, setSalvando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { if (aberto) setValor(pessoa.cracha ?? ''); }, [aberto, pessoa.cracha]);

  const limpo = valor.trim();
  const invalido = limpo !== '' && !FORMATO_CRACHA.test(limpo);
  const igual = limpo === (pessoa.cracha ?? '');

  async function salvar() {
    if (invalido || igual || !pessoa.empresaId) return;
    setSalvando(true);
    try {
      const r = await salvarCracha({ empresaId: pessoa.empresaId, operadorId: pessoa.id, cracha: limpo || null });
      if (!r.ok) {
        const duplicado = /duplicate key|idx_rh_cracha_unico/i.test(r.erro ?? '');
        toast.error(duplicado
          ? `O crachá ${limpo} já está cadastrado para outra pessoa.`
          : (r.erro ?? 'Não foi possível salvar o crachá.'));
        return;
      }
      toast.success(limpo ? `Crachá de ${pessoa.nome.split(' ')[0]}: ${limpo}.` : `Crachá de ${pessoa.nome.split(' ')[0]} apagado.`);
      onSalvo(pessoa.id, limpo || null);
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  const rotulo = pessoa.cracha
    ? <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{pessoa.cracha}</span>
    : <span className="text-xs font-medium italic text-warning">Sem crachá</span>;

  if (!podeEditar) return <span className="inline-flex items-center gap-1.5">{rotulo}</span>;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-muted"
          title="Editar crachá"
        >
          {rotulo}
          <Pencil className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={e => { e.preventDefault(); campo.current?.focus(); campo.current?.select(); }}
      >
        <form onSubmit={e => { e.preventDefault(); void salvar(); }}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <IdCard className="size-4 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Crachá de {pessoa.nome}</p>
              <p className="text-[11px] text-muted-foreground">O que está aqui é o crachá oficial.</p>
            </div>
          </div>
          <div className="space-y-1.5 px-4 py-3">
            <Input
              ref={campo}
              value={valor}
              onChange={e => setValor(e.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              placeholder="Número do crachá"
              maxLength={8}
              className={cn('h-10 font-mono text-base tabular-nums', invalido && 'border-destructive focus-visible:ring-destructive')}
              aria-invalid={invalido}
            />
            <p className={cn('text-[11px]', invalido ? 'text-destructive' : 'text-muted-foreground')}>
              {invalido ? 'Só números, até 8 dígitos.' : 'Até 8 números. Deixe vazio para apagar.'}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={invalido || igual || salvando} className="gap-1.5">
              {salvando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Salvar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
