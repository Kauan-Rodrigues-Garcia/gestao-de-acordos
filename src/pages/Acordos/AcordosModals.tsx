import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, MessageSquare, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ModalFilaWhatsApp, type ItemFila } from '@/components/ModalFilaWhatsApp';
import { formatCurrency, formatDate } from '@/lib/index';
import type { Acordo } from '@/lib/supabase';

export interface AcordosModalsProps {
  confirmandoExclusao: Acordo | null;
  setConfirmandoExclusao: (a: Acordo | null) => void;
  excluirAcordo: (a: Acordo) => Promise<void>;
  confirmandoExclusaoLote: boolean;
  setConfirmandoExclusaoLote: (v: boolean) => void;
  excluirSelecionados: () => Promise<void>;
  selecionados: string[];
  setSelecionados: (ids: string[]) => void;
  filaAberta: boolean;
  setFilaAberta: (v: boolean) => void;
  filaWhatsApp: ItemFila[];
  usuarioId: string | undefined;
  empresaId: string | undefined;
  temPermissao: (p: string) => boolean;
  prepararFila: (acordos: Acordo[]) => void;
  acordos: Acordo[];
  /**
   * Mês em somente-leitura. A barra flutuante de seleção perde as ações de
   * escrita e passa a dizer o porquê — os handlers já barram sozinhos, mas
   * oferecer "Excluir Selecionados" para depois recusar é pior que não oferecer.
   */
  mesBloqueado?: boolean;
  mensagemFechamento?: string;
}

export function AcordosModals({
  confirmandoExclusao, setConfirmandoExclusao, excluirAcordo,
  confirmandoExclusaoLote, setConfirmandoExclusaoLote, excluirSelecionados,
  selecionados, setSelecionados,
  filaAberta, setFilaAberta, filaWhatsApp,
  usuarioId, empresaId,
  temPermissao, prepararFila, acordos,
  mesBloqueado = false, mensagemFechamento,
}: AcordosModalsProps) {
  return (
    <>
      {confirmandoExclusao && (
        <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
          <DialogContent className="max-w-md" aria-describedby="dlg-excl-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Confirmar exclusão
              </DialogTitle>
              <DialogDescription id="dlg-excl-desc" className="sr-only">Confirmar exclusão do acordo selecionado</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="text-sm text-foreground">
                <p>Tem certeza que deseja excluir o acordo abaixo?</p>
                <p>Esta ação não pode ser desfeita.</p>
              </div>
              <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">NR: <span className="text-primary font-mono font-bold">#{confirmandoExclusao.nr_cliente}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cliente: <span className="text-foreground font-bold">{confirmandoExclusao.nome_cliente.toUpperCase()}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor: <span className="text-foreground font-bold">{formatCurrency(confirmandoExclusao.valor)}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vencimento: <span className="text-foreground">{formatDate(confirmandoExclusao.vencimento)}</span></span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmandoExclusao(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                className="bg-destructive hover:bg-destructive/90 text-white gap-2"
                onClick={() => excluirAcordo(confirmandoExclusao)}
              >
                <Trash2 className="w-4 h-4" /> Excluir definitivamente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {confirmandoExclusaoLote && (
        <Dialog open onOpenChange={() => setConfirmandoExclusaoLote(false)}>
          <DialogContent className="max-w-sm" aria-describedby="dlg-excl-lote-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Excluir {selecionados.length} acordos
              </DialogTitle>
              <DialogDescription id="dlg-excl-lote-desc" className="sr-only">Confirmar exclusão em lote dos acordos selecionados</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm text-foreground">
                Tem certeza que deseja excluir os <strong>{selecionados.length}</strong> acordos selecionados? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusaoLote(false)}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={excluirSelecionados}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir Tudo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {filaAberta && (
        <ModalFilaWhatsApp
          fila={filaWhatsApp}
          usuarioId={usuarioId}
          empresaId={empresaId}
          modo="lote"
          onClose={() => { setFilaAberta(false); setSelecionados([]); }}
        />
      )}

      <AnimatePresence>
        {selecionados.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-white/10 bg-gray-900/95 backdrop-blur-md text-white">
              <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {selecionados.length} selecionado(s)
              </span>
              <div className="w-px h-5 bg-white/20" />
              {mesBloqueado ? (
                <span
                  className="flex items-center gap-1.5 text-xs text-white/70 max-w-[22rem]"
                  title={mensagemFechamento}
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Mês fechado — seleção serve para consulta e para o relatório de
                  fechamento.
                </span>
              ) : (
                <>
                  <Button
                    size="sm" variant="ghost"
                    className="gap-1.5 text-green-400 hover:text-green-300 hover:bg-white/10 text-xs h-8 px-3"
                    onClick={() => {
                      const lista = acordos.filter(a => selecionados.includes(a.id));
                      prepararFila(lista);
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Enviar Lembretes
                  </Button>
                  {temPermissao('excluir_em_lote') && (
                    <Button
                      size="sm" variant="ghost"
                      className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-white/10 text-xs h-8 px-3"
                      onClick={() => setConfirmandoExclusaoLote(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Selecionados
                    </Button>
                  )}
                </>
              )}
              <Button
                size="sm" variant="ghost"
                className="gap-1 text-white/60 hover:text-white hover:bg-white/10 text-xs h-8 px-2"
                onClick={() => setSelecionados([])}
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
