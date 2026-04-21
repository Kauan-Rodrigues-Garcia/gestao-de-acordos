/**
 * AcordoEditInline.tsx
 * Inline expandable row editor for agreements in the Acordos list.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X, Hash, DollarSign, Smartphone, MapPin, Link2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { verificarNrRegistro, registrarNr } from '@/services/nr_registros.service';
import {
  parseCurrencyInput,
  ESTADOS_BRASIL, STATUS_LABELS, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, buildObservacoesComEstado,
} from '@/lib/index';
import { springPresets } from '@/lib/motion';
import { DatePickerField } from '@/components/DatePickerField';

interface AcordoEditInlineProps {
  acordo: Acordo;
  isPaguePlay?: boolean;
  colSpan?: number;
  /** Recebe o acordo atualizado para optimistic update no pai */
  onSaved: (atualizado: Acordo) => void;
  onCancel: () => void;
}

const SEM_ESTADO_VALUE = '__sem_estado__';

export function AcordoEditInline({ acordo, isPaguePlay = false, colSpan = 10, onSaved, onCancel }: AcordoEditInlineProps) {
  const { empresa } = useEmpresa();
  const [saving, setSaving] = useState(false);

  // Form state initialised from acordo
  const initialEstado = extractEstado(acordo.observacoes);
  const initialLink   = extractLinkAcordo(acordo.observacoes);
  const initialObservacoes = isPaguePlay ? initialLink : (acordo.observacoes || '');

  const [nomeCliente, setNomeCliente] = useState(acordo.nome_cliente);
  const [nrCliente,   setNrCliente]   = useState(acordo.nr_cliente);
  const [vencimento,  setVencimento]  = useState(acordo.vencimento);
  const [valor,       setValor]       = useState(String(acordo.valor));
  const [tipo,        setTipo]        = useState<Acordo['tipo']>(acordo.tipo);
  const [parcelas,    setParcelas]    = useState(String(acordo.parcelas || 1));
  const [whatsapp,    setWhatsapp]    = useState(acordo.whatsapp || '');
  const [instituicao, setInstituicao] = useState(acordo.instituicao || '');
  const [estado,      setEstado]      = useState(initialEstado);
  const [observacoes, setObservacoes] = useState(initialObservacoes);
  const [status,      setStatus]      = useState<Acordo['status']>(acordo.status);

  async function handleSave() {
    if (!nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!isPaguePlay && !nrCliente.trim()) { toast.error('NR é obrigatório'); return; }
    if (!vencimento)         { toast.error('Vencimento é obrigatório'); return; }

    const valorNum = parseCurrencyInput(valor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }
    const parcelasNum = parseInt(parcelas || '1', 10);

    // ─── Bloqueio de NR/Inscrição duplicado (edição) ──────────────────────
    // Mesma validação feita no AcordoNovoInline/AcordoForm: quando o usuário
    // ALTERA a chave (NR no Bookplay, Inscrição no PaguePlay) para um valor
    // que já está registrado em outro acordo ativo, bloquear o salvamento.
    //
    // Chaves:
    //   • PaguePlay → `instituicao` (Inscrição do profissional)
    //   • Bookplay  → `nr_cliente`   (NR do cliente)
    //
    // O bloqueio ignora o próprio acordo (via `acordoIdExcluir`) e acordos
    // com tipo_vinculo === 'extra' não deveriam existir como titulares no
    // nr_registros (só Direto é titular lá), portanto a checagem é segura.
    if (empresa?.id) {
      const campoChave: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const valorNovo = isPaguePlay ? instituicao.trim() : nrCliente.trim();
      const valorAntigo = isPaguePlay ? (acordo.instituicao ?? '').trim() : (acordo.nr_cliente ?? '').trim();

      if (valorNovo && valorNovo !== valorAntigo) {
        try {
          const conflito = await verificarNrRegistro(
            valorNovo,
            empresa.id,
            campoChave,
            acordo.id, // ignora o próprio acordo
          );
          if (conflito) {
            const label = isPaguePlay ? 'Inscrição' : 'NR';
            toast.error(
              `${label} ${valorNovo} já está vinculado ao operador ${conflito.operadorNome}. ` +
              `Não é possível duplicar a tabulação pela edição.`,
              { duration: 6000 },
            );
            return;
          }
        } catch (e) {
          console.warn('[AcordoEditInline] falha ao verificar nr_registros', e);
          // Em caso de falha na verificação, NÃO bloqueia — mas avisa.
          toast.warning('Não foi possível validar duplicidade de NR/Inscrição. Salvando mesmo assim.');
        }
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome_cliente: nomeCliente.trim(),
        nr_cliente:   nrCliente.trim(),
        vencimento,
        valor:        valorNum,
        tipo,
        parcelas:     ['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo) && !Number.isNaN(parcelasNum) ? parcelasNum : 1,
        whatsapp:     whatsapp.trim() || null,
        status,
        observacoes:  isPaguePlay
          ? buildObservacoesComEstado(estado, observacoes)
          : (observacoes.trim() || null),
      };

      if (instituicao.trim() !== undefined) payload.instituicao = instituicao.trim() || null;

      const { data: updated, error } = await supabase
        .from('acordos')
        .update(payload)
        .eq('id', acordo.id)
        .select('*, perfis(id, nome, email, perfil, setor_id)')
        .single();
      if (error) {
        toast.error(`Erro ao salvar: ${error.message}`);
        return;
      }

      // Sincroniza nr_registros quando a chave NR/Inscrição mudou.
      // Só sincroniza se este acordo for DIRETO — Extras não possuem titularidade
      // no nr_registros (o Direto do par é que é titular).
      if (empresa?.id && (acordo.tipo_vinculo ?? 'direto') === 'direto') {
        const campoChave: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
        const valorNovo = isPaguePlay ? instituicao.trim() : nrCliente.trim();
        const valorAntigo = isPaguePlay ? (acordo.instituicao ?? '').trim() : (acordo.nr_cliente ?? '').trim();
        if (valorNovo && valorNovo !== valorAntigo) {
          try {
            await registrarNr({
              empresaId:    empresa.id,
              nrValue:      valorNovo,
              campo:        campoChave,
              operadorId:   acordo.operador_id,
              operadorNome: (updated as Acordo)?.perfis?.nome ?? '',
              acordoId:     acordo.id,
            });
          } catch (e) {
            console.warn('[AcordoEditInline] falha ao sincronizar nr_registros', e);
          }
        }
      }

      toast.success('Acordo atualizado!');
      onSaved((updated ?? { ...acordo, ...payload }) as Acordo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
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
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Nome do Profissional' : 'Nome do Cliente'} *</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>

                {/* CPF */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'CPF' : 'NR'} {!isPaguePlay && '*'}</Label>
                  <div className="relative">
                    <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={nrCliente}
                      onChange={e => setNrCliente(e.target.value)}
                      placeholder="000.000.000-00"
                      className="h-8 text-xs pl-6 font-mono"
                    />
                  </div>
                </div>

                {/* Vencimento */}
                <DatePickerField
                  value={vencimento}
                  onChange={setVencimento}
                  label="Vencimento"
                  required
                  size="sm"
                />

                {/* Valor */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Valor *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={valor}
                      onChange={e => setValor(e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-xs pl-6 font-mono"
                    />
                  </div>
                </div>

                {/* Inscrição */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Inscrição' : 'Instituição'}</Label>
                  <div className="relative">
                    <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={instituicao}
                      onChange={e => setInstituicao(e.target.value)}
                      placeholder={isPaguePlay ? 'Número de inscrição (opcional)' : 'Instituição (opcional)'}
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">WhatsApp</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="h-8 text-xs pl-6 font-mono"
                    />
                  </div>
                </div>

                {isPaguePlay && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Estado</Label>
                    <Select
                      value={estado || SEM_ESTADO_VALUE}
                      onValueChange={value => setEstado(value === SEM_ESTADO_VALUE ? '' : value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <SelectValue placeholder="Selecione" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_ESTADO_VALUE}>Nenhum</SelectItem>
                        {ESTADOS_BRASIL.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Forma de Pagamento */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v as Acordo['tipo'])}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(isPaguePlay ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parcelas — only for boleto, cartao_recorrente, pix_automatico */}
                {['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo) && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Parcelas</Label>
                    <Input
                      type="number" min="1" max="12"
                      value={parcelas}
                      onChange={e => setParcelas(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}

                {/* Status */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={status} onValueChange={v => setStatus(v as Acordo['status'])}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Link do acordo */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-3 xl:col-span-2">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Link do Acordo' : 'Observações'}</Label>
                  <div className="relative">
                    <Link2 className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
                    <Textarea
                      value={observacoes}
                      onChange={e => setObservacoes(e.target.value)}
                      placeholder={isPaguePlay ? 'Cole aqui o link do acordo...' : 'Observações do acordo...'}
                      className={cn('text-xs resize-none pl-6 pt-1.5', 'min-h-[2rem]')}
                      rows={1}
                    />
                  </div>
                </div>

              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-primary/15">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={onCancel}
                  disabled={saving}
                >
                  <X className="w-3 h-3" /> Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
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
