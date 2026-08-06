import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { Edit, Save } from 'lucide-react';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { parseCurrencyInput, formatarTelefonePP } from '@/lib/index';
import { _TIPO_LABELS_PP, _TIPO_LABELS_BK, _STATUS_LABELS_PP, _STATUS_LABELS_BK } from './helpers';

interface ModalEditarParceladoProps {
  acordo: Acordo;
  registrosReais: Acordo[];
  open: boolean;
  onClose: () => void;
  onSaved: (principal: Acordo, todasAtualizadas: Acordo[]) => void;
}

export function ModalEditarAcordoParcelado({
  acordo, registrosReais, open, onClose, onSaved,
}: ModalEditarParceladoProps) {
  const [aba,    setAba]    = useState<'geral' | 'parcelas'>('geral');
  const [saving, setSaving] = useState(false);

  const [nomeCliente, setNomeCliente] = useState(acordo.nome_cliente);
  const [nrCliente,   setNrCliente]   = useState(acordo.nr_cliente);
  const [whatsapp,    setWhatsapp]    = useState(acordo.whatsapp || '');
  const [tipo,        setTipo]        = useState<Acordo['tipo']>(acordo.tipo);
  const [observacoes, setObservacoes] = useState(acordo.observacoes || '');
  const [instituicao, setInstituicao] = useState(acordo.instituicao || '');

  // `tipo` por parcela: um acordo de boleto pode ter uma parcela paga no Pix.
  // A aba "Geral" continua aplicando a forma a TODAS; esta é a exceção.
  type ParcRow = {
    id: string; numero: number; vencimento: string; valor: string; tipo: Acordo['tipo'];
  };
  const [parcRows, setParcRows] = useState<ParcRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setAba('geral');
    setNomeCliente(acordo.nome_cliente);
    setNrCliente(acordo.nr_cliente);
    setWhatsapp(acordo.whatsapp || '');
    setTipo(acordo.tipo);
    setObservacoes(acordo.observacoes || '');
    setInstituicao(acordo.instituicao || '');
    setParcRows(
      registrosReais.map(r => ({
        id: r.id,
        numero: r.numero_parcela ?? 1,
        vencimento: r.vencimento,
        valor: r.valor.toFixed(2).replace('.', ','),
        tipo: r.tipo,
      })).sort((a, b) => a.numero - b.numero)
    );
  }, [open, acordo.id, registrosReais.length]);

  function updateRow(
    id: string, field: 'vencimento' | 'valor' | 'tipo', value: string,
  ) {
    setParcRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  async function handleSave() {
    if (!nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const camposGerais: Record<string, unknown> = {
        nome_cliente: nomeCliente.trim(),
        nr_cliente:   nrCliente.trim(),
        whatsapp:     whatsapp.trim() || null,
        tipo,
        observacoes:  observacoes.trim() || null,
        instituicao:  instituicao.trim() || null,
      };
      const { error: errGeral } = await supabase
        .from('acordos')
        .update(camposGerais)
        .eq('acordo_grupo_id', acordo.acordo_grupo_id!);
      if (errGeral) { toast.error(`Erro geral: ${errGeral.message}`); return; }

      for (const row of parcRows) {
        const valorNum = parseCurrencyInput(row.valor);
        if (isNaN(valorNum) || valorNum <= 0) { toast.error(`Valor inválido na parcela ${row.numero}`); return; }
        // Roda DEPOIS do update geral de propósito: a forma escolhida na
        // parcela precisa sobrescrever a que a aba "Geral" acabou de aplicar
        // ao grupo inteiro. Invertendo a ordem, o geral apagaria a exceção.
        const { error: errP } = await supabase
          .from('acordos')
          .update({ vencimento: row.vencimento, valor: valorNum, tipo: row.tipo })
          .eq('id', row.id);
        if (errP) { toast.error(`Erro parcela ${row.numero}: ${errP.message}`); return; }
      }

      const { data: principal } = await supabase
        .from('acordos')
        .select('*, perfis(id, nome, email, perfil, setor_id)')
        .eq('id', acordo.id)
        .single();

      const todasAtualizadas: Acordo[] = parcRows.map(row => {
        const real = registrosReais.find(r => r.id === row.id)!;
        const valorNum = parseCurrencyInput(row.valor);
        return {
          ...real,
          ...camposGerais,
          vencimento: row.vencimento,
          valor: isNaN(valorNum) ? real.valor : valorNum,
          // Depois de `camposGerais`, pela mesma razão da ordem dos UPDATEs:
          // a forma da parcela vence a do grupo, e a tela tem de mostrar o que
          // foi realmente gravado.
          tipo: row.tipo,
        } as Acordo;
      });

      if (acordo.tipo_vinculo === 'extra' || acordo.vinculo_operador_id) {
        const valorSync = parseCurrencyInput(parcRows[0]?.valor ?? acordo.valor.toFixed(2).replace('.', ','));
        await supabase.rpc('fn_sync_par_vinculo', {
          p_acordo_id:    acordo.id,
          p_valor:        isNaN(valorSync) ? acordo.valor : valorSync,
          p_vencimento:   parcRows[0]?.vencimento ?? acordo.vencimento,
          p_nome_cliente: nomeCliente.trim(),
          p_tipo:         tipo,
          p_whatsapp:     whatsapp.trim() || null,
          p_parcelas:     acordo.parcelas,
          p_status:       acordo.status,
        });
      }

      toast.success('Acordo atualizado com sucesso!');
      onSaved((principal ?? acordo) as Acordo, todasAtualizadas);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const TIPO_LABELS_ALL = _TIPO_LABELS_BK;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="modal-edit-parc-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Edit className="w-4 h-4 text-primary" />
            Editar Acordo Parcelado
          </DialogTitle>
          <DialogDescription id="modal-edit-parc-desc" className="sr-only">
            Editar campos gerais ou parcelas individuais do acordo parcelado
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 mb-1">
          {(['geral', 'parcelas'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setAba(tab)}
              className={cn(
                'flex-1 text-xs py-1.5 rounded-md font-medium transition-colors',
                aba === tab
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'geral' ? 'Geral (todas as parcelas)' : `Parcelas (${parcRows.length})`}
            </button>
          ))}
        </div>

        {/* Aba Geral */}
        {aba === 'geral' && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nome do Cliente *</Label>
              <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">NR</Label>
              <Input value={nrCliente} onChange={e => setNrCliente(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(89) 99999-9999" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instituição</Label>
              <Input value={instituicao} onChange={e => setInstituicao(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as Acordo['tipo'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS_ALL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Observações</Label>
              <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}

        {/* Aba Parcelas */}
        {aba === 'parcelas' && (
          <div className="py-2 space-y-2 max-h-72 overflow-y-auto pr-1">
            <p className="text-[11px] text-muted-foreground">
              Edite data, valor e forma de pagamento de cada parcela já criada no banco.
              A forma escolhida aqui vale só para aquela parcela — a da aba “Geral” vale
              para todas.
            </p>
            {parcRows.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhuma parcela encontrada.</p>
            )}
            {parcRows.map(row => (
              <div key={row.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 border border-border/40">
                <span className="text-xs font-mono font-bold text-primary w-6 text-center">{row.numero}</span>
                <div className="flex-1 space-y-0.5">
                  <DatePickerField
                    value={row.vencimento}
                    onChange={(v) => updateRow(row.id, 'vencimento', v)}
                    label="Vencimento"
                    size="sm"
                  />
                </div>
                <div className="w-24 space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    value={row.valor}
                    onChange={e => updateRow(row.id, 'valor', e.target.value)}
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="w-32 space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Forma</Label>
                  <Select
                    value={row.tipo}
                    onValueChange={v => updateRow(row.id, 'tipo', v)}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_LABELS_ALL).map(([valor, label]) => (
                        <SelectItem key={valor} value={valor}>{label as string}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving} size="sm">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar tudo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
