/**
 * A lixeira: o que foi apagado nos últimos 30 dias, para devolver (04/11/2026).
 * O operador vê só o que é dele; a liderança, o do grupo.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ItemLixeira } from '@/services/jornada/jornada.service';
import { horaSaoPaulo } from './jornada';

/** «04/11 14:32». */
function quando(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m} ${horaSaoPaulo(iso)}`;
}

export function DialogLixeira({
  aberto, aoFechar, carregar, aoRestaurar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  carregar: () => Promise<ItemLixeira[]>;
  aoRestaurar: (ids: string[]) => Promise<{ restaurados: number; repetidos: number }>;
}) {
  const [itens, setItens] = useState<ItemLixeira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [restaurando, setRestaurando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setItens(null);
    setErro(null);
    setMarcados(new Set());
    carregar().then(setItens).catch(e => setErro((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);

  const todos = !!itens && itens.length > 0 && itens.every(i => marcados.has(i.id));

  function alternar(id: string) {
    setMarcados(m => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function restaurar(ids: string[]) {
    setRestaurando(true);
    try {
      const r = await aoRestaurar(ids);
      if (r.restaurados) toast.success(`${r.restaurados} NR(s) restaurado(s).`);
      if (r.repetidos) toast.warning(`${r.repetidos} NR(s) ficaram na lixeira: já foram lançados de novo neste mês.`);
      setMarcados(new Set());
      setItens(await carregar());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !restaurando) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lixeira</DialogTitle>
          <DialogDescription>
            O que foi apagado nos últimos 30 dias. Restaurar devolve o NR para o dia em que foi lançado.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-destructive py-4">{erro}</p>
        ) : itens === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">A lixeira está vazia.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="flex items-center gap-2 px-3 h-9 border-b text-xs text-muted-foreground">
              <Checkbox
                checked={todos}
                onCheckedChange={() => setMarcados(todos ? new Set() : new Set(itens.map(i => i.id)))}
                aria-label="Marcar todos"
              />
              {marcados.size ? `${marcados.size} marcado(s)` : `${itens.length} na lixeira`}
              <span className="ml-auto">apagado em</span>
            </div>
            <ul className="max-h-[320px] overflow-y-auto divide-y">
              {itens.map(i => (
                <li
                  key={i.id}
                  className={cn('flex items-center gap-2 px-3 h-9 cursor-pointer', marcados.has(i.id) ? 'bg-primary/10' : 'hover:bg-muted/50')}
                  onClick={() => alternar(i.id)}
                >
                  <Checkbox checked={marcados.has(i.id)} onClick={e => { e.stopPropagation(); alternar(i.id); }} aria-label={`Marcar NR ${i.nr}`} />
                  <span className="font-mono text-sm font-medium">{i.nr}</span>
                  <span className="text-xs text-muted-foreground">de {i.data.split('-').reverse().join('/')}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{quando(i.apagado_em)}</span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Restaurar"
                    aria-label={`Restaurar NR ${i.nr}`}
                    disabled={restaurando}
                    onClick={e => { e.stopPropagation(); void restaurar([i.id]); }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={aoFechar} disabled={restaurando}>Fechar</Button>
          <Button type="button" onClick={() => restaurar([...marcados])} disabled={restaurando || marcados.size === 0}>
            {restaurando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
            Restaurar {marcados.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
