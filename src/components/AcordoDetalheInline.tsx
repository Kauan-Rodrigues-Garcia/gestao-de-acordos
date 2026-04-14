/**
 * AcordoDetalheInline.tsx
 * Linha de tabela expansível (somente leitura) para exibir todos os detalhes
 * de um acordo. Suporta visualização de parcelas e reagendamento.
 *
 * SQL necessário (executar no Supabase SQL editor):
 *   ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS acordo_grupo_id UUID DEFAULT NULL;
 *   ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS numero_parcela INTEGER DEFAULT 1;
 *   CREATE INDEX IF NOT EXISTS idx_acordos_grupo ON public.acordos(acordo_grupo_id) WHERE acordo_grupo_id IS NOT NULL;
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Hash, Calendar, DollarSign, Smartphone, Building2,
  FileText, User, Layers, RefreshCw, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  formatCurrency, formatDate,
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  TIPO_COLORS, STATUS_LABELS_PAGUEPLAY,
} from '@/lib/index';
import { springPresets } from '@/lib/motion';

// ─── Tipos parcelados por empresa ───────────────────────────────────────────
const TIPOS_PARCELADOS_BOOKPLAY = ['boleto', 'pix_automatico', 'cartao_recorrente'];
const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];

function isTipoParcelado(tipo: string, isPP: boolean): boolean {
  return isPP
    ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo)
    : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
}

// ─── Props ───────────────────────────────────────────────────────────────────
export interface AcordoDetalheInlineProps {
  acordo: Acordo;
  isPaguePlay: boolean;
  colSpan: number;
  onClose: () => void;
  onReagendar?: (acordo: Acordo) => void;
}

// ─── Mini-componente: campo de detalhe ───────────────────────────────────────
function Campo({
  icon: Icon,
  label,
  value,
  mono = false,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className={cn('flex items-center gap-1 text-xs text-foreground', mono && 'font-mono')}>
        {Icon && <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
        <span>{value || '—'}</span>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export function AcordoDetalheInline({
  acordo,
  isPaguePlay,
  colSpan,
  onClose,
  onReagendar,
}: AcordoDetalheInlineProps) {
  const statusLabels  = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const tipoLabels    = isPaguePlay ? TIPO_LABELS_PAGUEPLAY   : TIPO_LABELS;
  const temParcelas   = isTipoParcelado(acordo.tipo, isPaguePlay) && (acordo.parcelas ?? 1) > 1;
  const temGrupo      = temParcelas && !!acordo.acordo_grupo_id;

  // Parcelas do grupo
  const [parcelas, setParcelas]           = useState<Acordo[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  // Reagendamento
  const [reagendandoId, setReagendandoId] = useState<string | null>(null);
  const [novaData, setNovaData]           = useState('');
  const [novoValor, setNovoValor]         = useState('');
  const [salvandoReag, setSalvandoReag]   = useState(false);

  // Edição de parcela individual (data/valor)
  const [editandoId, setEditandoId]       = useState<string | null>(null);
  const [editData, setEditData]           = useState('');
  const [editValor, setEditValor]         = useState('');
  const [salvandoEdit, setSalvandoEdit]   = useState(false);

  // Buscar parcelas do grupo ao montar (apenas se tiver grupo)
  useEffect(() => {
    if (!temGrupo) return;
    setLoadingParcelas(true);
    supabase
      .from('acordos')
      .select('*')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id!)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao buscar parcelas'); }
        else { setParcelas((data ?? []) as Acordo[]); }
        setLoadingParcelas(false);
      });
  }, [temGrupo, acordo.acordo_grupo_id]);

  // ── Abrir form de reagendamento ──────────────────────────────────────────
  function abrirReagendamento(parcela: Acordo) {
    // Calcular data +1 mês a partir do vencimento da parcela
    const [y, m, d] = parcela.vencimento.split('-').map(Number);
    const novoMes = m + 1 > 12 ? 1 : m + 1;
    const novoAno = m + 1 > 12 ? y + 1 : y;
    const novaDataCalc = `${novoAno}-${String(novoMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    setNovaData(novaDataCalc);
    setNovoValor(String(parcela.valor));
    setReagendandoId(parcela.id);
  }

  // ── Confirmar reagendamento ──────────────────────────────────────────────
  async function confirmarReagendamento(parcela: Acordo) {
    if (!novaData) { toast.error('Data obrigatória'); return; }
    const valorNum = parseFloat(novoValor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }

    setSalvandoReag(true);
    try {
      const novaParcela = {
        nome_cliente:    parcela.nome_cliente,
        nr_cliente:      parcela.nr_cliente,
        vencimento:      novaData,
        valor:           valorNum,
        tipo:            parcela.tipo,
        parcelas:        parcela.parcelas,
        whatsapp:        parcela.whatsapp,
        status:          'verificar_pendente' as const,
        observacoes:     parcela.observacoes,
        instituicao:     parcela.instituicao,
        operador_id:     parcela.operador_id,
        setor_id:        parcela.setor_id,
        empresa_id:      parcela.empresa_id,
        acordo_grupo_id: parcela.acordo_grupo_id,
        numero_parcela:  (parcela.numero_parcela ?? 1) + 1,
        data_cadastro:   new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase.from('acordos').insert(novaParcela);
      if (error) { toast.error(`Erro: ${error.message}`); return; }

      toast.success('Próximo pagamento agendado!');
      setReagendandoId(null);
      onReagendar?.(acordo);

      // Recarregar parcelas do grupo
      if (acordo.acordo_grupo_id) {
        const { data } = await supabase
          .from('acordos')
          .select('*')
          .eq('acordo_grupo_id', acordo.acordo_grupo_id)
          .order('numero_parcela', { ascending: true });
        setParcelas((data ?? []) as Acordo[]);
      }
    } finally {
      setSalvandoReag(false);
    }
  }

  // ── Abrir edição de parcela ──────────────────────────────────────────────
  function abrirEdicaoParcela(parcela: Acordo) {
    setEditandoId(parcela.id);
    setEditData(parcela.vencimento);
    setEditValor(String(parcela.valor));
  }

  // ── Salvar edição de parcela ─────────────────────────────────────────────
  async function salvarEdicaoParcela(parcela: Acordo) {
    if (!editData) { toast.error('Data obrigatória'); return; }
    const valorNum = parseFloat(editValor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }

    setSalvandoEdit(true);
    try {
      const { error } = await supabase
        .from('acordos')
        .update({ vencimento: editData, valor: valorNum })
        .eq('id', parcela.id);
      if (error) { toast.error(`Erro: ${error.message}`); return; }

      toast.success('Parcela atualizada!');
      setEditandoId(null);

      // Atualizar lista local
      setParcelas(prev => prev.map(p =>
        p.id === parcela.id ? { ...p, vencimento: editData, valor: valorNum } : p
      ));
    } finally {
      setSalvandoEdit(false);
    }
  }

  const nomeOperador = (acordo.perfis as { nome?: string } | undefined)?.nome ?? '—';

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
          <div className="p-4 bg-accent/30 border-t border-b border-primary/20">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Detalhe do Acordo
                </span>
                {!!(acordo.acordo_grupo_id && acordo.numero_parcela && acordo.parcelas && acordo.parcelas > 1) && (
                  <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                    Parcela {acordo.numero_parcela ?? 1}/{acordo.parcelas}
                  </span>
                )}
              </div>
              <Button
                variant="ghost" size="icon" className="w-6 h-6"
                onClick={onClose}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Campos principais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <Campo
                icon={User}
                label={isPaguePlay ? 'Profissional' : 'Cliente'}
                value={acordo.nome_cliente}
                className="sm:col-span-2"
              />
              <Campo
                icon={Hash}
                label={isPaguePlay ? 'CPF' : 'NR'}
                value={acordo.nr_cliente}
                mono
              />
              <Campo
                icon={Calendar}
                label="Vencimento"
                value={formatDate(acordo.vencimento)}
                mono
              />
              <Campo
                icon={DollarSign}
                label="Valor"
                value={formatCurrency(acordo.valor)}
                mono
              />
              <Campo
                label="Tipo"
                value={
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[acordo.tipo])}>
                    {tipoLabels[acordo.tipo] ?? acordo.tipo}
                  </span>
                }
              />
              {!isPaguePlay && isTipoParcelado(acordo.tipo, false) && (
                <Campo
                  icon={Layers}
                  label="Parcelas"
                  value={`${acordo.numero_parcela ?? 1} / ${acordo.parcelas}`}
                  mono
                />
              )}
              {isPaguePlay && isTipoParcelado(acordo.tipo, true) && (
                <Campo
                  icon={Layers}
                  label="Parcelas"
                  value={`${acordo.numero_parcela ?? 1} / ${acordo.parcelas}`}
                  mono
                />
              )}
              <Campo
                label="Status"
                value={
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[acordo.status])}>
                    {statusLabels[acordo.status] ?? acordo.status}
                  </span>
                }
              />
              {acordo.whatsapp && (
                <Campo
                  icon={Smartphone}
                  label="WhatsApp"
                  value={acordo.whatsapp}
                  mono
                />
              )}
              {acordo.instituicao && (
                <Campo
                  icon={Building2}
                  label={isPaguePlay ? 'Inscrição' : 'Instituição'}
                  value={acordo.instituicao}
                />
              )}
              <Campo
                icon={User}
                label="Operador"
                value={nomeOperador}
              />
              {acordo.observacoes && (
                <Campo
                  icon={FileText}
                  label={isPaguePlay ? 'Link / Obs.' : 'Observações'}
                  value={acordo.observacoes}
                  className="sm:col-span-2 lg:col-span-3"
                />
              )}
            </div>

            {/* Seção de Parcelas (somente Bookplay com acordo_grupo_id) */}
            {temGrupo && (
              <div className="mt-4 pt-3 border-t border-primary/15">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Parcelas do Grupo</span>
                </div>
                {loadingParcelas ? (
                  <p className="text-xs text-muted-foreground">Carregando parcelas...</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">#</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Vencimento</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Valor</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map(p => (
                          <>
                          <tr
                            key={p.id}
                            className={cn(
                              'border-b border-border/50 hover:bg-accent/30 transition-colors',
                              p.id === acordo.id && 'bg-primary/5'
                            )}
                          >
                            <td className="px-3 py-1.5 font-mono font-bold text-primary">
                              {p.numero_parcela ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 font-mono">{formatDate(p.vencimento)}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-semibold">
                              {formatCurrency(p.valor)}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[p.status])}>
                                {statusLabels[p.status] ?? p.status}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => editandoId === p.id ? setEditandoId(null) : abrirEdicaoParcela(p)}
                                >
                                  {editandoId === p.id ? 'Cancelar' : 'Editar'}
                                </Button>
                                {p.status !== 'pago' && (
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 text-[10px] px-2 text-success hover:bg-success/10"
                                    onClick={async () => {
                                      const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', p.id);
                                      if (error) { toast.error(`Erro: ${error.message}`); return; }
                                      toast.success('Parcela marcada como paga!');
                                      setParcelas(prev => prev.map(x => x.id === p.id ? { ...x, status: 'pago' } : x));
                                    }}
                                  >
                                    Pago
                                  </Button>
                                )}
                                {p.status === 'pago' && (
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10"
                                    onClick={() => reagendandoId === p.id ? setReagendandoId(null) : abrirReagendamento(p)}
                                  >
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    {reagendandoId === p.id ? 'Cancelar' : 'Reagendar'}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Form edição parcela */}
                          {editandoId === p.id && (
                            <tr key={`edit-${p.id}`} className="bg-muted/20 border-b border-border/50">
                              <td colSpan={5} className="px-3 py-2">
                                <div className="flex items-end gap-2 flex-wrap">
                                  <div className="space-y-0.5">
                                    <label className="text-[10px] text-muted-foreground">Nova data</label>
                                    <input
                                      type="date"
                                      value={editData}
                                      onChange={e => setEditData(e.target.value)}
                                      className="h-7 text-xs bg-background border border-input rounded px-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[10px] text-muted-foreground">Novo valor</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editValor}
                                      onChange={e => setEditValor(e.target.value)}
                                      className="h-7 text-xs bg-background border border-input rounded px-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-28"
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => salvarEdicaoParcela(p)}
                                    disabled={salvandoEdit}
                                  >
                                    {salvandoEdit ? 'Salvando...' : 'Salvar'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {/* Form reagendamento */}
                          {reagendandoId === p.id && (
                            <tr key={`reag-${p.id}`} className="bg-primary/5 border-b border-primary/20">
                              <td colSpan={5} className="px-3 py-2">
                                <div className="flex items-end gap-2 flex-wrap">
                                  <ChevronRight className="w-3 h-3 text-primary flex-shrink-0 self-center" />
                                  <div className="space-y-0.5">
                                    <label className="text-[10px] text-muted-foreground">Próximo pagamento</label>
                                    <input
                                      type="date"
                                      value={novaData}
                                      onChange={e => setNovaData(e.target.value)}
                                      className="h-7 text-xs bg-background border border-input rounded px-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[10px] text-muted-foreground">Valor</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={novoValor}
                                      onChange={e => setNovoValor(e.target.value)}
                                      className="h-7 text-xs bg-background border border-input rounded px-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-28"
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => confirmarReagendamento(p)}
                                    disabled={salvandoReag}
                                  >
                                    {salvandoReag ? 'Agendando...' : 'Confirmar'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </td>
    </tr>
  );
}

// Helper: verificar se o acordo tem numero_parcela relevante para exibir badge
function accord_numero_parcela(acordo: Acordo): boolean {
  return !!(acordo.acordo_grupo_id && acordo.numero_parcela && acordo.parcelas && acordo.parcelas > 1);
}
