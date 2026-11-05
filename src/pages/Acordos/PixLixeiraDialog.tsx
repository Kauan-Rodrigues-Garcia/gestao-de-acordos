/**
 * PixLixeiraDialog — a lixeira do Pix automático (3 dias de retenção).
 *
 * Existe porque o excluir apagava de vez: sem log, sem auditoria, sem volta.
 * Um registro se perdeu assim em 10/08/2026 e o valor não pôde ser
 * recuperado — ele só existia na tabela do Pix. A leitura e as ações moram
 * em `PixCabecalho`, que abre o diálogo.
 */
import { RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/index';
import type { PixLixeiraItem } from '@/services/pix_automatico.service';

interface Props {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  carregando: boolean;
  itens: PixLixeiraItem[];
  /** Restaurar e apagar são de quem age sobre registro alheio. */
  podeAgirSobreOutros: boolean;
  restaurandoId: string | null;
  onRestaurar: (item: PixLixeiraItem) => void;
  onApagar: (item: PixLixeiraItem) => void;
}

export function PixLixeiraDialog({
  aberto, onAbertoChange, carregando, itens, podeAgirSobreOutros, restaurandoId,
  onRestaurar, onApagar,
}: Props) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-3xl" aria-describedby="dlg-lixeira-pix">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            Lixeira do Pix automático
          </DialogTitle>
          <DialogDescription id="dlg-lixeira-pix">
            Registros excluídos ficam aqui por 3 dias e depois somem de vez.
            {!podeAgirSobreOutros && ' Restaurar é com o líder.'}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="space-y-2 py-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Trash2 className="w-7 h-7 opacity-20" />
            <p className="text-sm">A lixeira está vazia.</p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">NR</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Excluído por</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Quando</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="px-2 py-2 font-mono">{item.nr_cliente}</td>
                    <td className="px-2 py-2">{item.operador_nome ?? '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(Number(item.valor))}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {item.excluido_por_nome ?? '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-muted-foreground">
                      {new Date(item.excluido_em).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* Restaurar é líder+ — a RPC confere no servidor, o
                            botão só evita o clique que ia falhar. */}
                        {/* Transferência não volta: o NR já é de outra
                            pessoa (20260928220000). */}
                        {item.motivo === 'transferencia' && (
                          <span className="text-[10px] text-muted-foreground" title="Transferência não se restaura pela lixeira">
                            Transferido{item.transferido_para_nome ? ` para ${item.transferido_para_nome}` : ''}
                          </span>
                        )}
                        {podeAgirSobreOutros && item.motivo !== 'transferencia' && (
                          <button
                            title="Restaurar este registro"
                            disabled={restaurandoId === item.id}
                            onClick={() => onRestaurar(item)}
                            className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {restaurandoId === item.id
                              ? <RefreshCw className="w-3 h-3 animate-spin" />
                              : <Undo2 className="w-3 h-3" />}
                            Restaurar
                          </button>
                        )}
                        {podeAgirSobreOutros && (
                          <button
                            title="Apagar em definitivo"
                            onClick={() => onApagar(item)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
