/**
 * Os clientes do mês que estão com mais de uma pessoa (10/11/2026).
 *
 * Pedido do Kauan: no Suporte são 4 pessoas; a Camila atende um cliente e uma
 * semana depois o Léo atende o mesmo — os dois lançam, e o cliente fica
 * marcado para saber que está com duas pessoas. A lista vem do banco
 * (`compartilhados` do painel): a liderança vê os do grupo; o operador, só os
 * que são dele.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { NrCompartilhado } from '@/services/jornada/jornada.service';
import { diaMes } from './jornada';

export function DialogCompartilhados({
  aberto, aoFechar, lista, nomeDoMes, euId, aoAbrirDia,
}: {
  aberto: boolean;
  aoFechar: () => void;
  lista: NrCompartilhado[];
  /** «novembro». */
  nomeDoMes: string;
  /** Quem está vendo: o nome dele aparece como «você». */
  euId: string | null;
  /** Clicar num dia leva a tela para ele. */
  aoAbrirDia: (dia: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const filtrada = useMemo(() => (busca ? lista.filter(c => c.nr.includes(busca)) : lista), [lista, busca]);

  function copiar() {
    void navigator.clipboard?.writeText(filtrada.map(c => c.nr).join('\n'));
    toast.success(`${filtrada.length} NR(s) copiado(s).`);
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-warning" /> Clientes com mais de uma pessoa
          </DialogTitle>
          <DialogDescription>
            NRs de <span className="capitalize">{nomeDoMes}</span> lançados por pessoas diferentes nesta aba.
            Cada um conta para quem lançou; a mesma pessoa não lança o mesmo NR duas vezes no mês.
          </DialogDescription>
        </DialogHeader>

        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente com mais de uma pessoa neste mês.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="flex items-center gap-2 px-3 h-10 border-b">
              <div className="relative w-36">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="Buscar NR"
                  aria-label="Buscar NR"
                  className="h-7 pl-7 text-sm"
                />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{filtrada.length} de {lista.length}</span>
            </div>
            <ul className="max-h-[360px] overflow-y-auto divide-y">
              {filtrada.map(c => (
                <li key={c.nr} className="flex items-start gap-3 px-3 py-2">
                  <span className="font-mono text-sm font-medium pt-0.5 shrink-0">{c.nr}</span>
                  <span className="ml-auto flex flex-wrap justify-end gap-1">
                    {c.pessoas.map(p => (
                      <button
                        key={p.perfil_id}
                        type="button"
                        className="rounded px-1.5 h-6 text-[11px] font-medium bg-warning/15 text-warning hover:bg-warning/25"
                        title={`Abrir o dia ${diaMes(p.data)}`}
                        onClick={() => { aoAbrirDia(p.data); aoFechar(); }}
                      >
                        {p.perfil_id === euId ? 'Você' : (p.nome?.trim() || 'Sem nome')} · {diaMes(p.data)}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>
          {filtrada.length > 0 && (
            <Button type="button" onClick={copiar}>
              <Copy className="h-4 w-4" /> Copiar NRs ({filtrada.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
