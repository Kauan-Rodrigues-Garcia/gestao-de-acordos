/**
 * AcordoEditInline.tsx
 * Inline expandable row editor for agreements in the Acordos list.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X, DollarSign, Smartphone, Link2, Building2, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAuth } from '@/hooks/useAuth';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import type { Perfil } from '@/lib/supabase';
import { verificarNrRegistro, registrarNr } from '@/services/nr_registros.service';
import {
  parseCurrencyInput,
  ESTADOS_BRASIL, STATUS_LABELS, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  getEstadoFromAcordo, extractLinkAcordo, buildObservacoesComEstado, formatarTelefonePP,
} from '@/lib/index';
import { abrirChatplay } from '@/lib/chatplay';
import { springPresets } from '@/lib/motion';
import { DatePickerField } from '@/components/DatePickerField';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { TagsSelector } from '@/components/TagsSelector';

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
  const { perfil }  = useAuth();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const usuarioTemLogicaDiretoExtra = isPaguePlay && isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );
  const [saving, setSaving] = useState(false);

  // Form state initialised from acordo
  const initialEstado = getEstadoFromAcordo(acordo);
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
  const [isExtra,     setIsExtra]     = useState(acordo.tipo_vinculo === 'extra');
  const [tagIds,      setTagIds]      = useState<string[]>(acordo.tag_ids ?? []);
  const { tags: empresaTags }         = useEmpresaTags();

  async function handleSave() {
    if (!isPaguePlay && !nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
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
            const label = isPaguePlay ? 'Código' : 'NR';
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
          toast.warning('Não foi possível validar duplicidade de NR/Código. Salvando mesmo assim.');
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
        whatsapp:     isPaguePlay ? formatarTelefonePP(whatsapp) : (whatsapp.trim() || null),
        status,
        observacoes:  isPaguePlay
          ? buildObservacoesComEstado(estado, observacoes)
          : (observacoes.trim() || null),
        ...(isPaguePlay ? { tipo_vinculo: isExtra ? 'extra' : 'direto' } : {}),
        tag_ids: tagIds.length > 0 ? tagIds : null,
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
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Nome do Profissional' : 'Nome do Cliente'}{!isPaguePlay && ' *'}</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
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
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Código' : 'Instituição'}</Label>
                  <div className="relative">
                    <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={instituicao}
                      onChange={e => setInstituicao(e.target.value)}
                      placeholder={isPaguePlay ? 'Código (opcional)' : 'Instituição (opcional)'}
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>

                {/* WhatsApp / Número */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Número' : 'WhatsApp'}</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Smartphone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        placeholder="(89) 99999-9999"
                        className="h-8 text-xs pl-6 font-mono"
                      />
                    </div>
                    {isPaguePlay && whatsapp.replace(/\D/g, '').length >= 10 && (
                      <button
                        type="button"
                        title={perfil?.tampermonkey_configured ? 'Abrir no Chatplay' : 'Configure o Chatplay no topo da página'}
                        disabled={!perfil?.tampermonkey_configured}
                        className={cn(
                          'h-8 w-8 flex items-center justify-center rounded-md border text-xs flex-shrink-0 transition-colors',
                          perfil?.tampermonkey_configured
                            ? 'border-violet-500/40 text-violet-500 hover:bg-violet-500/10 cursor-pointer'
                            : 'border-muted text-muted-foreground opacity-50 cursor-not-allowed',
                        )}
                        onClick={() => abrirChatplay(whatsapp)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                        <SelectValue placeholder="Selecione" />
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

                {/* Parcelas */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Parcelas{!['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo) && (
                      <span className="text-muted-foreground/50 font-normal"> (não se aplica)</span>
                    )}
                  </Label>
                  <Select
                    value={parcelas}
                    onValueChange={setParcelas}
                    disabled={!['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

              {/* Tags visuais */}
              {empresaTags.length > 0 && (
                <div className="space-y-1 mt-3">
                  <Label className="text-xs font-medium">Tags</Label>
                  <TagsSelector
                    tags={empresaTags}
                    selectedIds={tagIds}
                    onChange={setTagIds}
                    disabled={saving}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary/15">
                {usuarioTemLogicaDiretoExtra && (
                  <button
                    type="button"
                    onClick={() => setIsExtra(v => !v)}
                    disabled={saving}
                    title={isExtra ? 'Clique para marcar como Direto' : 'Clique para marcar como Extra'}
                    className={cn(
                      'h-8 flex items-center gap-2 px-3 rounded-md border text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                      isExtra
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/25 dark:text-amber-400'
                        : 'bg-background text-foreground border-input hover:bg-accent/50',
                    )}
                  >
                    <Link2 className="w-3 h-3 shrink-0" />
                    {isExtra ? 'Extra' : 'Direto'}
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
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
            </div>
          </motion.div>
        </td>
      </tr>
    );
}
