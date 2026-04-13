/**
 * AcordoEditInline.tsx
 * Inline expandable row editor for agreements in the Acordos list.
 * Only shown for PaguePlay tenant.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X, Hash, Calendar, DollarSign, Smartphone, MapPin, Link2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  parseCurrencyInput, formatCurrency,
  ESTADOS_BRASIL, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, buildObservacoesComEstado,
} from '@/lib/index';
import { springPresets } from '@/lib/motion';

interface AcordoEditInlineProps {
  acordo: Acordo;
  onSaved: () => void;
  onCancel: () => void;
}

export function AcordoEditInline({ acordo, onSaved, onCancel }: AcordoEditInlineProps) {
  const [saving, setSaving] = useState(false);

  // Form state initialised from acordo
  const initialEstado = extractEstado(acordo.observacoes);
  const initialLink   = extractLinkAcordo(acordo.observacoes);

  const [nomeCliente, setNomeCliente] = useState(acordo.nome_cliente);
  const [nrCliente,   setNrCliente]   = useState(acordo.nr_cliente);
  const [vencimento,  setVencimento]  = useState(acordo.vencimento);
  const [valor,       setValor]       = useState(String(acordo.valor));
  const [tipo,        setTipo]        = useState<Acordo['tipo']>(acordo.tipo);
  const [parcelas,    setParcelas]    = useState(String(acordo.parcelas || 1));
  const [whatsapp,    setWhatsapp]    = useState(acordo.whatsapp || '');
  const [instituicao, setInstituicao] = useState(acordo.instituicao || '');
  const [estado,      setEstado]      = useState(initialEstado);
  const [link,        setLink]        = useState(initialLink);
  const [status,      setStatus]      = useState<Acordo['status']>(acordo.status);

  async function handleSave() {
    if (!nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!nrCliente.trim())   { toast.error('CPF é obrigatório'); return; }
    if (!vencimento)         { toast.error('Vencimento é obrigatório'); return; }

    const valorNum = parseCurrencyInput(valor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome_cliente: nomeCliente.trim(),
        nr_cliente:   nrCliente.trim(),
        vencimento,
        valor:        valorNum,
        tipo,
        parcelas:     ['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo) ? parseInt(parcelas || '1', 10) : 1,
        whatsapp:     whatsapp.trim() || null,
        status,
        observacoes:  buildObservacoesComEstado(estado, link),
      };

      if (instituicao.trim() !== undefined) payload.instituicao = instituicao.trim() || null;

      const { error } = await supabase.from('acordos').update(payload).eq('id', acordo.id);
      if (error) {
        toast.error(`Erro ao salvar: ${error.message}`);
        return;
      }

      toast.success('Acordo atualizado!');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={10} className="p-0">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springPresets.gentle}
          className="overflow-hidden"
        >
            <div className="p-4 bg-primary/3 border-t border-b border-primary/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">

                {/* Nome */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label className="text-xs font-medium">Nome do Profissional *</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>

                {/* CPF */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">CPF *</Label>
                  <div className="relative">
                    <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={nrCliente}
                      onChange={e => setNrCliente(e.target.value)}
                      placeholder="000.000.000-00"
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* Vencimento */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Vencimento *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      type="date"
                      value={vencimento}
                      onChange={e => setVencimento(e.target.value)}
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* Valor */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Valor *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={valor}
                      onChange={e => setValor(e.target.value)}
                      placeholder="0,00"
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* Tipo de pagamento */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v as Acordo['tipo'])}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_LABELS_PAGUEPLAY).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parcelas — sempre visível para todos os tipos PP, usando Select */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Parcelas</Label>
                  <Select value={parcelas} onValueChange={setParcelas}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(n => (
                        <SelectItem key={n} value={n} className="text-xs">{n}x</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* WhatsApp — oculto visualmente, mantém estado e lógica */}
                <div className="hidden">
                  <Label className="text-xs font-medium">WhatsApp</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* Inscrição */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Inscrição</Label>
                  <div className="relative">
                    <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={instituicao}
                      onChange={e => setInstituicao(e.target.value)}
                      placeholder="Nº de inscrição"
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* Estado */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Estado</Label>
                  <Select value={estado || ''} onValueChange={v => setEstado(v || null)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">— Nenhum —</SelectItem>
                      {ESTADOS_BRASIL.map(uf => (
                        <SelectItem key={uf} value={uf} className="text-xs">{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={status} onValueChange={v => setStatus(v as Acordo['status'])}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS_PAGUEPLAY).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Link — edição via Textarea, preview como <a> clicável */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-2 xl:col-span-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Link do Acordo
                  </Label>
                  <Textarea
                    value={link || ''}
                    onChange={e => setLink(e.target.value || null)}
                    placeholder="https://..."
                    rows={2}
                    className="text-xs resize-none"
                  />
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 truncate max-w-full"
                      title={link}
                    >
                      <Link2 className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{link}</span>
                    </a>
                  )}
                </div>

              </div>

              {/* Botões de ação */}
              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-primary/10">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={onCancel}
                  disabled={saving}
                >
                  <X className="w-3 h-3" /> Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
        </motion.div>
      </td>
    </tr>
  );
}
