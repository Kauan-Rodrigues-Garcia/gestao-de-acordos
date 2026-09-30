/**
 * ModalExtraParaDireto — confirmar que um acordo EXTRA vira DIRETO.
 *
 * A janela pergunta ao servidor ANTES o que vai acontecer
 * (`fn_tornar_direto_previa`), porque a resposta muda o que a pessoa precisa
 * saber para confirmar — e a RLS dela não deixa ver o DIRETO do colega:
 *
 *   • EXTRA manual     → «tem certeza?» e vira DIRETO na hora;
 *   • EXTRA vinculado  → o acordo de outra pessoa vai para a lixeira. Quem já
 *                        pode decidir executa; os demais mandam um pedido para
 *                        a gaveta de autorizações e seguem trabalhando.
 *
 * Usado pelo detalhe do acordo e pela área de editar acordo.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeftRight, Clock, Loader2, Shield } from 'lucide-react';
import {
  previaTornarDireto, tornarDireto,
  type PreviaTornarDireto, type ResultadoTornarDireto,
} from '@/services/tornarDireto.service';

export interface ModalExtraParaDiretoProps {
  open:     boolean;
  acordoId: string;
  /** "NR 123" / "Código 456" — mostrado enquanto a prévia não chega. */
  nrLabel:  string;
  onClose:  () => void;
  /** Chamado com o resultado de sucesso; a janela já fechou. */
  onConcluido: (r: Extract<ResultadoTornarDireto, { ok: true }>) => void;
  /** Texto do botão quando a janela abre a partir da edição. */
  rotuloConfirmar?: string;
}

export function ModalExtraParaDireto({
  open, acordoId, nrLabel, onClose, onConcluido, rotuloConfirmar,
}: ModalExtraParaDiretoProps) {
  const [previa, setPrevia] = useState<PreviaTornarDireto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  useEffect(() => {
    if (!open) { setPrevia(null); setErro(null); return; }
    let vivo = true;
    void previaTornarDireto(acordoId).then(r => {
      if (!vivo) return;
      if ('erro' in r) setErro(r.erro);
      else setPrevia(r);
    });
    return () => { vivo = false; };
  }, [open, acordoId]);

  async function confirmar() {
    setExecutando(true);
    const r = await tornarDireto(acordoId);
    setExecutando(false);
    if ('erro' in r) { setErro(r.erro); return; }
    onConcluido(r);
  }

  const rotuloNr = previa?.nrValor ? `${previa.nrLabel} ${previa.nrValor}` : nrLabel;
  const vaiPedir = !!previa && previa.vinculado && !previa.souAutorizador;
  const jaPediu  = !!previa?.pedidoPendenteId && vaiPedir;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !executando) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-extra-para-direto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ArrowLeftRight className="w-5 h-5 shrink-0" />
            Tornar este acordo DIRETO
          </DialogTitle>
          <DialogDescription id="dlg-extra-para-direto" asChild>
            <div className="space-y-3 pt-1 text-sm text-foreground/80">
              {!previa && !erro && (
                <p className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Conferindo o vínculo do {rotuloNr}…
                </p>
              )}

              {previa && !previa.vinculado && (
                <p>
                  O acordo ({rotuloNr}) está como <strong>Extra</strong> sem vínculo com outra
                  pessoa. Tem certeza? Ele passa a ser <strong>Direto</strong> — e conta como
                  recebimento direto a partir de agora.
                </p>
              )}

              {previa?.vinculado && (
                <>
                  <p>
                    O {rotuloNr} é hoje <strong>Direto</strong> de{' '}
                    <strong className="text-foreground">{previa.donoNome}</strong>. Para ele passar a
                    ser Direto aqui, o acordo de {previa.donoNome} sai.
                  </p>
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        O acordo de <strong>{previa.donoNome}</strong> vai para a lixeira como
                        transferência e ele é notificado. Não tem como desfazer.
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {previa?.vinculado && previa.souAutorizador && (
          <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-xs text-primary flex items-start gap-1.5">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Você pode autorizar esta mudança — ao confirmar, ela é feita agora, em seu nome.
          </div>
        )}

        {vaiPedir && !jaPediu && (
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs flex items-start gap-1.5">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
            <span>
              Precisa da autorização do líder. Ao confirmar, o pedido vai para a gaveta de
              autorizações; você recebe a resposta por notificação e pode seguir trabalhando.
            </span>
          </div>
        )}

        {jaPediu && (
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs flex items-start gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" />
            Já existe um pedido seu em análise para este acordo. A resposta chega por notificação.
          </div>
        )}

        {erro && (
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {erro}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={executando}>
            {jaPediu ? 'Fechar' : 'Cancelar'}
          </Button>
          {!jaPediu && (
            <Button
              className="flex-1 gap-2"
              onClick={() => void confirmar()}
              disabled={executando || !previa || !!erro}
            >
              {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
              {executando ? 'Processando...'
                : vaiPedir ? 'Solicitar autorização'
                : (rotuloConfirmar ?? 'Tornar Direto')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
