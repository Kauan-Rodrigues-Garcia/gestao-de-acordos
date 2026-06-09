import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText, Hash, Save, User, X } from 'lucide-react';
import { INSTITUICOES_OPTIONS } from '@/lib/index';
import { TIPOS_BOOKPLAY, STATUS_OPTIONS, DatePickerField } from './constants';
import { ModalAutorizacaoNR } from './ModalAutorizacaoNR';
import { ModalAvisoDiretoExtra } from './ModalAvisoDiretoExtra';
import type { SharedFormState } from './types';

export function FormBP({ state }: { state: SharedFormState }) {
  const {
    colSpan, cancelar, salvar, salvando,
    nomeCliente, setNomeCliente,
    nrCliente, setNrCliente,
    vencimento, setVencimento,
    valorStr, setValorStr,
    whatsapp, setWhatsapp,
    instituicao, setInstituicao,
    tipo, handleChangeTipo,
    parcelasStr, setParcelasStr,
    temParcelas,
    status, setStatus,
    observacoes, setObservacoes,
    conflito, liderEmail, setLiderEmail, liderSenha, setLiderSenha,
    autorizando, autorizarTransferencia, cancelarConflito,
    avisoDiretoExtra, confirmandoDiretoExtra, confirmarDiretoExtra, cancelarAvisoDiretoExtra,
  } = state;

  return (
    <>
      <tr className="bg-primary/5 border-b-2 border-primary/30">
        <td colSpan={colSpan} className="px-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary flex items-center gap-2">
                <Save className="w-4 h-4" /> Novo Acordo — Bookplay
              </p>
              <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-destructive/10 hover:text-destructive" onClick={cancelar} disabled={salvando}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Dados Principais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <DatePickerField label="Vencimento" required value={vencimento} onChange={setVencimento} />
                <div className="space-y-1">
                  <Label className="text-xs">Valor *</Label>
                  <Input value={valorStr} onChange={(e) => setValorStr(e.target.value)} placeholder="0,00" className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Dados do Cliente
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Nome do Cliente</Label>
                  <Input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Nome completo" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp</Label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instituição</Label>
                  <Select value={instituicao} onValueChange={setInstituicao}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {INSTITUICOES_OPTIONS.map((inst) => (
                        <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Tipo e Status
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={handleChangeTipo}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_BOOKPLAY.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {temParcelas && (
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Input
                      type="number" min={1} max={60}
                      value={parcelasStr} onChange={(e) => setParcelasStr(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Observações
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações opcionais..." className="text-xs resize-none" rows={2} />
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-primary/20">
              <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80 shadow-sm" onClick={salvar} disabled={salvando}>
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando...' : 'Salvar Acordo'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 border-border hover:bg-muted" onClick={cancelar} disabled={salvando}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        </td>
      </tr>

      <ModalAutorizacaoNR
        conflito={conflito} liderEmail={liderEmail} liderSenha={liderSenha} autorizando={autorizando}
        onEmailChange={setLiderEmail} onSenhaChange={setLiderSenha}
        onAutorizar={autorizarTransferencia} onCancel={cancelarConflito}
      />
      <ModalAvisoDiretoExtra
        aberto={!!avisoDiretoExtra}
        operadorNome={avisoDiretoExtra?.operadorAntNome ?? ''}
        operadorSetor={avisoDiretoExtra?.operadorAntSetor}
        nrLabel={avisoDiretoExtra?.nrLabel ?? ''}
        labelCampo={avisoDiretoExtra?.labelCampo ?? ''}
        confirmando={confirmandoDiretoExtra}
        onConfirmar={confirmarDiretoExtra}
        onCancel={cancelarAvisoDiretoExtra}
      />
    </>
  );
}
