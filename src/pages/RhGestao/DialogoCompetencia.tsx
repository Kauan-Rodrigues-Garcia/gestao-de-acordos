/**
 * DialogoCompetencia — abrir o mês, e definir ou prorrogar o prazo.
 *
 * Dois modos no mesmo componente porque os campos são quase os mesmos e a
 * regra do prazo é idêntica nos dois. Separá-los criaria duas telas que
 * precisariam mudar juntas.
 *
 * ## O mês de apuração
 *
 * A competência é o rótulo da folha; o desempenho conferido nela é, por padrão,
 * o do mês anterior — é o que o exemplo do pedido implica (competência
 * Setembro/2026, prazo 02/09). O campo fica visível e editável: quando o
 * combinado for outro, o RH corrige na hora de abrir, e não descobre depois que
 * os percentuais saíram do mês errado.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { mesAtual, deslocarMes } from '@/lib/mesReferencia';
import { abrirCompetencia, definirPrazo, type RhFechamentoRow } from '@/services/rh/rhGestao.service';
import { rotuloCompetencia } from '@/services/rh/rhExportacao';

export interface DialogoCompetenciaProps {
  aberto: boolean;
  modo: 'nova' | 'prazo';
  empresaId: string;
  /** A competência em edição, no modo «prazo». */
  fechamento: RhFechamentoRow | null;
  onFechar: () => void;
  /** Recebe o id quando uma competência nova foi criada. */
  onSalvo: (id?: string) => void | Promise<void>;
}

export function DialogoCompetencia({
  aberto, modo, empresaId, fechamento, onFechar, onSalvo,
}: DialogoCompetenciaProps) {
  const [competencia, setCompetencia] = useState(mesAtual());
  const [apuracao, setApuracao]       = useState(deslocarMes(mesAtual(), -1));
  const [prazo, setPrazo]             = useState('');
  const [motivo, setMotivo]           = useState('');
  const [salvando, setSalvando]       = useState(false);

  // Reabrir o diálogo com o rascunho anterior faria alguém abrir a competência
  // errada por não ter reparado no campo já preenchido.
  useEffect(() => {
    if (!aberto) return;
    if (modo === 'prazo' && fechamento) {
      setPrazo(fechamento.prazo ? String(fechamento.prazo).slice(0, 10) : '');
      setMotivo('');
      return;
    }
    const m = mesAtual();
    setCompetencia(m);
    setApuracao(deslocarMes(m, -1));
    setPrazo('');
    setMotivo('');
  }, [aberto, modo, fechamento]);

  // O mês de apuração acompanha a competência até alguém mexer nele à mão.
  function trocarCompetencia(valor: string) {
    setCompetencia(valor);
    if (valor) setApuracao(deslocarMes(valor, -1));
  }

  const prazoJaPublicado = modo === 'prazo' && !!fechamento?.prazo;
  const mudouPrazo = prazoJaPublicado
    && String(fechamento?.prazo ?? '').slice(0, 10) !== prazo;
  const faltaMotivo = mudouPrazo && motivo.trim().length === 0;

  async function salvar() {
    setSalvando(true);
    try {
      if (modo === 'prazo') {
        if (!fechamento) return;
        const r = await definirPrazo({
          fechamentoId: fechamento.id,
          prazo: prazo || null,
          motivo: motivo.trim() || null,
        });
        if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o prazo.'); return; }
        toast.success('Prazo atualizado.');
        await onSalvo();
        return;
      }

      const r = await abrirCompetencia({
        empresaId,
        competencia,
        mesApuracao: apuracao,
        prazo: prazo || null,
      });
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível abrir a competência.'); return; }
      toast.success(
        `Competência ${rotuloCompetencia(`${competencia}-01`)} aberta. `
        + 'As pessoas do escopo já aparecem para preenchimento.',
      );
      await onSalvo(r.dados?.id);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {modo === 'prazo' ? 'Prazo dos gestores' : 'Abrir competência'}
          </DialogTitle>
          <DialogDescription>
            {modo === 'prazo'
              ? 'Até quando a gerência pode enviar o fechamento ao RH.'
              : 'Cria a competência e traz para ela todas as pessoas dos setores configurados. '
                + 'Repetir em uma competência que já existe apenas acrescenta quem entrou depois.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {modo === 'nova' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rh-comp" className="text-xs">Competência</Label>
                <Input
                  id="rh-comp" type="month" value={competencia}
                  onChange={e => trocarCompetencia(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rh-apur" className="text-xs">Desempenho conferido</Label>
                <Input
                  id="rh-apur" type="month" value={apuracao}
                  onChange={e => setApuracao(e.target.value)}
                  className="h-8 text-xs"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  O mês de onde saem meta, recebimento e percentual. Por padrão, o
                  mês anterior à competência.
                </p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rh-prazo" className="text-xs">
              Prazo para envio {modo === 'nova' && <span className="text-muted-foreground">(opcional)</span>}
            </Label>
            <Input
              id="rh-prazo" type="date" value={prazo}
              onChange={e => setPrazo(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* O motivo só aparece quando há um prazo publicado sendo mudado:
              definir pela primeira vez não tem o que justificar. */}
          {mudouPrazo && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-prazo-motivo" className="text-xs">
                Motivo da alteração <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rh-prazo-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}
                rows={2} className="text-sm"
                placeholder="Os gestores se organizaram pela data anterior — explique a mudança."
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando || faltaMotivo}>
            {salvando ? 'Salvando…' : modo === 'prazo' ? 'Salvar prazo' : 'Abrir competência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogoCompetencia;
