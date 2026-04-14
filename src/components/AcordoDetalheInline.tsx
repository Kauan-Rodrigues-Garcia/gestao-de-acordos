/**
 * AcordoDetalheInline.tsx
 *
 * LÓGICA DE PARCELAS (definitiva):
 *  - Ao salvar, apenas 1 registro é criado no banco (numero_parcela=1, acordo_grupo_id=UUID).
 *  - A sub-tabela mostra SEMPRE N linhas (N = acordo.parcelas):
 *      · Linhas com registro real no banco → dados e status reais
 *      · Linhas sem registro (futuras) → data calculada, status "A vencer"
 *  - Botão "Pago": aparece em linhas reais com status != 'pago'. Faz UPDATE no banco.
 *  - Botão "Reagendar": aparece na última linha real que está paga e NÃO é a última parcela.
 *    Ao confirmar no modal, cria o próximo registro no banco (numero_parcela + 1).
 *  - Badge "Agendado": linha paga com próxima linha real já existindo no banco.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Hash, Calendar, DollarSign, Smartphone, Building2,
  FileText, User, Layers, MapPin, Link2, CheckCircle2, RefreshCw, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  formatCurrency, formatDate,
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  TIPO_COLORS, STATUS_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, isAtrasado,
} from '@/lib/index';

const TIPOS_PARCELADOS_BOOKPLAY  = ['boleto', 'pix_automatico', 'cartao_recorrente'];
const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];

function isTipoParcelado(tipo: string, isPP: boolean): boolean {
  return isPP
    ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo)
    : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
}

/** Somar N meses a uma data YYYY-MM-DD */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = m - 1 + months;
  return `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface AcordoDetalheInlineProps {
  acordo: Acordo;
  isPaguePlay: boolean;
  colSpan: number;
  onClose: () => void;
  onReagendar?: () => void;
}

// ─── Campo somente-leitura ────────────────────────────────────────────────────
function Campo({
  icon: Icon, label, value, mono = false, full = false, children,
}: {
  icon?: React.ElementType;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-2', full && 'col-span-full')}>
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {children ?? (
          <p className={cn('text-sm font-medium text-foreground', mono && 'font-mono')}>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Modal de Reagendamento (exportado) ──────────────────────────────────────
export function ModalReagendar({
  parcela, open, onClose, onConfirm,
}: {
  parcela: Acordo | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: string, valor: number) => Promise<void>;
}) {
  const [novaData,  setNovaData]  = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [salvando,  setSalvando]  = useState(false);

  useEffect(() => {
    if (!parcela) return;
    setNovaData(addMonths(parcela.vencimento, 1));
    setNovoValor(String(parcela.valor));
  }, [parcela?.id]);

  async function handleConfirm() {
    if (!novaData) { toast.error('Data obrigatória'); return; }
    const v = parseFloat(novoValor);
    if (isNaN(v) || v <= 0) { toast.error('Valor inválido'); return; }
    setSalvando(true);
    try { await onConfirm(novaData, v); } finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <CheckCircle2 className="w-4 h-4" />
            Reagendar Próximo Pagamento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Confirme data e valor para o próximo pagamento de{' '}
            <span className="font-semibold text-foreground">
              {parcela?.instituicao || parcela?.nome_cliente || parcela?.nr_cliente}
            </span>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data de vencimento</label>
              <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)}
                className="w-full h-9 text-sm bg-background border border-input rounded-md px-3 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
              <input type="number" step="0.01" value={novoValor} onChange={e => setNovoValor(e.target.value)}
                className="w-full h-9 text-sm bg-background border border-input rounded-md px-3 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        </div>
        <DialogDescription className="sr-only">Confirme os dados do próximo pagamento</DialogDescription>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            variant="default"
            className="gap-2 font-semibold"
            style={{ backgroundColor: '#16a34a', color: '#ffffff', border: '1px solid #15803d' }}
            onClick={handleConfirm}
            disabled={salvando}
          >
            {salvando ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Reagendando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Reagendamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function AcordoDetalheInline({
  acordo, isPaguePlay, colSpan, onClose, onReagendar,
}: AcordoDetalheInlineProps) {
  const statusLabels  = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const tipoLabels    = isPaguePlay ? TIPO_LABELS_PAGUEPLAY   : TIPO_LABELS;
  const atrasado      = isAtrasado(acordo.vencimento, acordo.status);
  const totalParcelas = acordo.parcelas ?? 1;

  // Mostrar sub-tabela quando: tipo parcelado E parcelas > 1
  const deveExibirParcelas =
    isTipoParcelado(acordo.tipo, isPaguePlay) && totalParcelas > 1;

  // Registros reais buscados do banco (mesmo grupo)
  const [registrosReais,   setRegistrosReais]   = useState<Acordo[]>([]);
  const [loadingParc,      setLoadingParc]       = useState(false);
  const [marcandoPago,     setMarcandoPago]      = useState<string | null>(null);

  // Modal
  const [parcelaModal, setParcelaModal] = useState<Acordo | null>(null);
  const [modalAberto,  setModalAberto]  = useState(false);

  const link   = extractLinkAcordo(acordo.observacoes);
  const estado = extractEstado(acordo.observacoes);
  const nomeOp = (acordo.perfis as { nome?: string } | undefined)?.nome ?? '—';

  // ── Buscar registros reais do grupo ──────────────────────────────────────
  useEffect(() => {
    if (!deveExibirParcelas || !acordo.acordo_grupo_id) return;
    setLoadingParc(true);
    supabase
      .from('acordos')
      .select('*')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao buscar parcelas');
        else setRegistrosReais((data ?? []) as Acordo[]);
        setLoadingParc(false);
      });
  }, [deveExibirParcelas, acordo.acordo_grupo_id]);

  // ── Marcar como pago ──────────────────────────────────────────────────────
  async function marcarPago(p: Acordo) {
    setMarcandoPago(p.id);
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', p.id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
    } else {
      toast.success('Parcela marcada como paga!');
      setRegistrosReais(prev => prev.map(x => x.id === p.id ? { ...x, status: 'pago' } : x));
      onReagendar?.();
    }
    setMarcandoPago(null);
  }

  // ── Confirmar reagendamento: cria 1 novo registro ─────────────────────────
  async function confirmarReagendamento(novaData: string, novoValor: number) {
    if (!parcelaModal) return;
    const p = parcelaModal;
    const novaParcela = {
      nome_cliente:    p.nome_cliente,
      nr_cliente:      p.nr_cliente,
      vencimento:      novaData,
      valor:           novoValor,
      tipo:            p.tipo,
      parcelas:        p.parcelas,
      whatsapp:        p.whatsapp,
      status:          'verificar_pendente' as const,
      observacoes:     p.observacoes,
      instituicao:     p.instituicao,
      operador_id:     p.operador_id,
      empresa_id:      p.empresa_id,
      acordo_grupo_id: p.acordo_grupo_id,
      numero_parcela:  (p.numero_parcela ?? 1) + 1,
      data_cadastro:   new Date().toISOString().split('T')[0],
    };
    const { data: inserido, error } = await supabase
      .from('acordos')
      .insert(novaParcela)
      .select('*')
      .single();

    if (error) { toast.error(`Erro ao reagendar: ${error.message}`); return; }

    // 1. Adicionar a nova parcela REAL ao estado local IMEDIATAMENTE
    //    → proximaReal passa a existir → foiAgendada=true → botão Reagendar some na hora
    if (inserido) {
      setRegistrosReais(prev => {
        // Substituir se já existir pelo numero_parcela, caso contrário adicionar
        const existe = prev.some(x => x.numero_parcela === inserido.numero_parcela);
        if (existe) {
          return prev.map(x => x.numero_parcela === inserido.numero_parcela ? inserido as Acordo : x);
        }
        return [...prev, inserido as Acordo].sort((a, b) => (a.numero_parcela ?? 1) - (b.numero_parcela ?? 1));
      });
    }

    // 2. Fechar modal e limpar estado
    setModalAberto(false);
    setParcelaModal(null);

    toast.success('Reagendamento confirmado!', { description: 'Próximo pagamento agendado na nova data.' });

    // 3. Pai faz refetch → nova parcela aparece na lista na nova data
    onReagendar?.();
  }

  // ── Montar lista mista: real ou virtual para cada índice 1..N ────────────
  type LinhaTabela = {
    index: number;           // 1-based
    real: Acordo | null;     // registro do banco, se existir
    dataCalc: string;        // data calculada (usada se real=null)
  };

  const linhas: LinhaTabela[] = Array.from({ length: totalParcelas }, (_, i) => {
    const index = i + 1;
    const real  = registrosReais.find(r => (r.numero_parcela ?? 1) === index) ?? null;
    const dataCalc = addMonths(
      // data base = a do primeiro registro real ou do acordo atual
      registrosReais[0]?.vencimento ?? acordo.vencimento,
      i
    );
    return { index, real, dataCalc };
  });

  // Última linha real paga (candidata ao botão Reagendar)
  const ultimaRealPagaIdx = (() => {
    let last = -1;
    linhas.forEach(l => { if (l.real && l.real.status === 'pago') last = l.index; });
    return last;
  })();

  return (
    <>
      <tr>
        <td colSpan={colSpan} className="p-0">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="p-5 bg-accent/30 border-t-2 border-b border-primary/20 shadow-inner">

              {/* ─── Header ─── */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-foreground tracking-tight">
                    {isPaguePlay ? (acordo.instituicao || acordo.nr_cliente || '—') : acordo.nome_cliente}
                  </h3>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[acordo.status])}>
                    {statusLabels[acordo.status] ?? acordo.status}
                  </span>
                  {atrasado && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
                  {deveExibirParcelas && (
                    <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                      Parcela {acordo.numero_parcela ?? 1}/{totalParcelas}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* ─── Grid de campos ─── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                {isPaguePlay && acordo.instituicao && (
                  <Campo icon={Building2} label="Inscrição" value={acordo.instituicao} />
                )}
                {acordo.nr_cliente && (
                  <Campo icon={Hash} label={isPaguePlay ? 'CPF' : 'NR'} value={acordo.nr_cliente} mono />
                )}
                {isPaguePlay && acordo.nome_cliente && (
                  <Campo icon={User} label="Nome do Profissional" value={acordo.nome_cliente} />
                )}
                {isPaguePlay && estado && (
                  <Campo icon={MapPin} label="Estado" value={estado} />
                )}
                <Campo icon={Calendar} label="Vencimento" value={
                  <span className={cn(atrasado && 'text-destructive font-semibold')}>
                    {formatDate(acordo.vencimento)}
                  </span>
                } />
                <Campo icon={DollarSign} label="Valor" value={formatCurrency(acordo.valor)} mono />
                <Campo label="Forma de Pagamento">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5', TIPO_COLORS[acordo.tipo])}>
                    {tipoLabels[acordo.tipo] ?? acordo.tipo}
                  </span>
                </Campo>
                {deveExibirParcelas && (
                  <Campo icon={Layers} label="Total de Parcelas" value={String(totalParcelas)} mono />
                )}
                {!isPaguePlay && acordo.whatsapp && (
                  <Campo icon={Smartphone} label="WhatsApp" value={acordo.whatsapp} mono />
                )}
                {!isPaguePlay && acordo.instituicao && (
                  <Campo icon={Building2} label="Instituição" value={acordo.instituicao} />
                )}
                <Campo icon={User} label="Operador" value={nomeOp} />
              </div>

              {/* ─── Observações ─── */}
              {!isPaguePlay && acordo.observacoes && (
                <>
                  <Separator className="my-4" />
                  <Campo icon={FileText} label="Observações" full>
                    <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 mt-0.5">
                      {acordo.observacoes}
                    </p>
                  </Campo>
                </>
              )}

              {/* ─── Link ─── */}
              {link && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-start gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Link do Acordo</p>
                      <a href={link.startsWith('http') ? link : `https://${link}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all">
                        {link}
                      </a>
                    </div>
                  </div>
                </>
              )}

              {/* ─── Sub-tabela de Parcelas ─── */}
              {deveExibirParcelas && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Parcelas</span>
                      <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">{totalParcelas}x</span>
                    </div>

                    {loadingParc ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/60 border-b border-border">
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">#</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Vencimento</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Valor</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Status</th>
                              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linhas.map(({ index, real, dataCalc }) => {
                              // Verificar se a próxima parcela já tem registro real
                              const proximaReal = linhas.find(l => l.index === index + 1)?.real;
                              const foiAgendada = real?.status === 'pago' && !!proximaReal;
                              // Reagendar: última paga, sem próxima real, não é a última parcela
                              const podeReagendar =
                                real?.status === 'pago' &&
                                !proximaReal &&
                                index === ultimaRealPagaIdx &&
                                index < totalParcelas;

                              const isAtualAcordo = real?.id === acordo.id;

                              return (
                                <tr key={index}
                                  className={cn(
                                    'border-b border-border/40 hover:bg-primary/5 transition-colors duration-100',
                                    isAtualAcordo && 'bg-primary/8'
                                  )}
                                >
                                  {/* # */}
                                  <td className="px-3 py-2.5 font-mono font-bold text-primary text-xs">{index}</td>

                                  {/* Vencimento */}
                                  <td className="px-3 py-2.5 font-mono text-xs">
                                    {real ? formatDate(real.vencimento) : (
                                      <span className="text-muted-foreground/50 italic">{formatDate(dataCalc)}</span>
                                    )}
                                  </td>

                                  {/* Valor */}
                                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-xs">
                                    {real ? formatCurrency(real.valor) : (
                                      <span className="text-muted-foreground/50">{formatCurrency(acordo.valor)}</span>
                                    )}
                                  </td>

                                  {/* Status */}
                                  <td className="px-3 py-2.5">
                                    {real ? (
                                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm', STATUS_COLORS[real.status])}>
                                        {statusLabels[real.status] ?? real.status}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/40 px-2 py-0.5 rounded-full border border-dashed border-border">
                                        <Clock className="w-2.5 h-2.5" /> A vencer
                                      </span>
                                    )}
                                  </td>

                                  {/* Ação */}
                                  <td className="px-3 py-2.5 text-center">
                                    {foiAgendada ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/15 text-success border border-success/30 shadow-sm">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> Agendado
                                      </span>
                                    ) : podeReagendar ? (
                                      <Button size="sm"
                                        className="h-6 text-[10px] px-2.5 bg-success hover:bg-success/90 text-success-foreground gap-1 font-semibold shadow-sm"
                                        onClick={() => { setParcelaModal(real); setModalAberto(true); }}>
                                        <RefreshCw className="w-2.5 h-2.5" /> Reagendar
                                      </Button>
                                    ) : real && real.status !== 'pago' ? (
                                      <Button variant="ghost" size="sm"
                                        className="h-6 text-[10px] px-2.5 text-success hover:bg-success/15 hover:text-success border border-success/20 font-semibold"
                                        disabled={marcandoPago === real.id}
                                        onClick={() => marcarPago(real)}>
                                        {marcandoPago === real.id ? (
                                          <span className="flex items-center gap-1"><RefreshCw className="w-2 h-2 animate-spin" /> Aguarde</span>
                                        ) : (
                                          <span className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Pago</span>
                                        )}
                                      </Button>
                                    ) : (
                                      <span className="text-muted-foreground/30 text-[10px] font-mono">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </motion.div>
        </td>
      </tr>

      <ModalReagendar
        parcela={parcelaModal}
        open={modalAberto}
        onClose={() => { setModalAberto(false); setParcelaModal(null); }}
        onConfirm={confirmarReagendamento}
      />
    </>
  );
}