/**
 * AcordoDetalheInline.tsx
 *
 * LÓGICA DE PARCELAS (definitiva):
 *  - Ao salvar, apenas 1 registro é criado no banco (numero_parcela=1, acordo_grupo_id=UUID).
 *  - A sub-tabela mostra SEMPRE N linhas (N = acordo.parcelas):
 *      · Linhas com registro real no banco → dados e status reais
 *      · Linhas sem registro (futuras) → data calculada, status "A vencer"
 *  - Botão "Pago": aparece em linhas reais com status != 'pago'. Faz UPDATE no banco.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Hash, Calendar, DollarSign, Smartphone, Building2,
  FileText, User, Layers, MapPin, Link2, CheckCircle2, RefreshCw, Clock, Edit, Save,
} from 'lucide-react';
import { DatePickerField } from '@/components/DatePickerField';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  formatCurrency, formatDate, parseCurrencyInput,
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  TIPO_COLORS, STATUS_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, isAtrasado,
} from '@/lib/index';

// ── Labels locais (evita TDZ em bundles concatenados) ────────────────────────
const _TIPO_LABELS_PP: Record<string, string> = {
  boleto: 'Boleto / PIX',
  cartao: 'Cartão de Crédito',
  pix: 'Boleto / PIX',
};
const _TIPO_LABELS_BK: Record<string, string> = {
  boleto: 'Boleto',
  cartao_recorrente: 'Cartão Recorrente',
  pix_automatico: 'Pix automático',
  cartao: 'Cartão',
  pix: 'Pix',
};
const _STATUS_LABELS_PP: Record<string, string> = {
  verificar_pendente: 'Pendente',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};
const _STATUS_LABELS_BK: Record<string, string> = {
  verificar_pendente: 'Verificar',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};

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
  /** Callback após edição bem-sucedida (recebe o acordo principal atualizado) */
  onSaved?: (atualizado: Acordo) => void;
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

// ─── Modal de Edição de Acordo Parcelado ────────────────────────────────────
/**
 * Modal com duas abas:
 *   "Geral"    → edita campos comuns a TODAS as parcelas (nome, nr, whatsapp, tipo, obs)
 *   "Parcelas" → lista de parcelas reais com data e valor editáveis individualmente
 */
interface ModalEditarParceladoProps {
  acordo: Acordo;
  isPaguePlay: boolean;
  registrosReais: Acordo[];
  open: boolean;
  onClose: () => void;
  onSaved: (principal: Acordo, todasAtualizadas: Acordo[]) => void;
}

export function ModalEditarAcordoParcelado({
  acordo, isPaguePlay, registrosReais, open, onClose, onSaved,
}: ModalEditarParceladoProps) {
  const [aba,          setAba]          = useState<'geral' | 'parcelas'>('geral');
  const [saving,       setSaving]       = useState(false);

  // ── Campos gerais (aplicados a TODAS as parcelas do grupo) ──────────────
  const [nomeCliente, setNomeCliente] = useState(acordo.nome_cliente);
  const [nrCliente,   setNrCliente]   = useState(acordo.nr_cliente);
  const [whatsapp,    setWhatsapp]    = useState(acordo.whatsapp || '');
  const [tipo,        setTipo]        = useState<Acordo['tipo']>(acordo.tipo);
  const [observacoes, setObservacoes] = useState(acordo.observacoes || '');
  const [instituicao, setInstituicao] = useState(acordo.instituicao || '');

  // ── Campos individuais por parcela ──────────────────────────────────────
  type ParcRow = { id: string; numero: number; vencimento: string; valor: string; };
  const [parcRows, setParcRows] = useState<ParcRow[]>([]);

  // Reset quando o modal abre
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
      })).sort((a, b) => a.numero - b.numero)
    );
  }, [open, acordo.id, registrosReais.length]);

  function updateRow(id: string, field: 'vencimento' | 'valor', value: string) {
    setParcRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  async function handleSave() {
    if (!nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      // 1. Atualizar campos gerais em TODAS as parcelas do grupo
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

      // 2. Atualizar data/valor individual de cada parcela
      for (const row of parcRows) {
        const valorNum = parseCurrencyInput(row.valor);
        if (isNaN(valorNum) || valorNum <= 0) { toast.error(`Valor inválido na parcela ${row.numero}`); return; }
        const { error: errP } = await supabase
          .from('acordos')
          .update({ vencimento: row.vencimento, valor: valorNum })
          .eq('id', row.id);
        if (errP) { toast.error(`Erro parcela ${row.numero}: ${errP.message}`); return; }
      }

      // 3. Buscar o acordo principal atualizado para passar ao pai
      const { data: principal } = await supabase
        .from('acordos')
        .select('*, perfis(id, nome, email, perfil, setor_id)')
        .eq('id', acordo.id)
        .single();

      // 4. Montar lista atualizada para o estado local
      const todasAtualizadas: Acordo[] = parcRows.map(row => {
        const real = registrosReais.find(r => r.id === row.id)!;
        const valorNum = parseCurrencyInput(row.valor);
        return {
          ...real,
          ...camposGerais,
          vencimento: row.vencimento,
          valor: isNaN(valorNum) ? real.valor : valorNum,
        } as Acordo;
      });

      toast.success('Acordo atualizado com sucesso!');
      onSaved((principal ?? acordo) as Acordo, todasAtualizadas);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const STATUS_LABELS_ALL = isPaguePlay ? _STATUS_LABELS_PP : _STATUS_LABELS_BK;
  const TIPO_LABELS_ALL   = isPaguePlay ? _TIPO_LABELS_PP   : _TIPO_LABELS_BK;

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

        {/* ── Abas ── */}
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
              {tab === 'geral' ? '📋 Geral (todas as parcelas)' : `🗂️ Parcelas (${parcRows.length})`}
            </button>
          ))}
        </div>

        {/* ── Aba Geral ── */}
        {aba === 'geral' && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">{isPaguePlay ? 'Nome do Profissional' : 'Nome do Cliente'} *</Label>
              <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isPaguePlay ? 'CPF' : 'NR'}</Label>
              <Input value={nrCliente} onChange={e => setNrCliente(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isPaguePlay ? 'Inscrição' : 'Instituição'}</Label>
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
              <Label className="text-xs">{isPaguePlay ? 'Link / Observações' : 'Observações'}</Label>
              <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}

        {/* ── Aba Parcelas ── */}
        {aba === 'parcelas' && (
          <div className="py-2 space-y-2 max-h-72 overflow-y-auto pr-1">
            <p className="text-[11px] text-muted-foreground">Edite data e valor individualmente para cada parcela já criada no banco.</p>
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
                <div className="w-28 space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    value={row.valor}
                    onChange={e => updateRow(row.id, 'valor', e.target.value)}
                    className="h-7 text-xs font-mono"
                  />
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

// ─── Componente principal ─────────────────────────────────────────────────────
export function AcordoDetalheInline({
  acordo, isPaguePlay, colSpan, onClose, onSaved,
}: AcordoDetalheInlineProps) {
  const statusLabels  = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const tipoLabels    = isPaguePlay ? TIPO_LABELS_PAGUEPLAY   : TIPO_LABELS;

  // ── ESTADO LOCAL (deve vir ANTES de qualquer cálculo derivado) ────────────
  // Registros reais buscados do banco (mesmo grupo)
  const [registrosReais,   setRegistrosReais]   = useState<Acordo[]>([]);
  const [loadingParc,      setLoadingParc]       = useState(false);
  const [marcandoPago,     setMarcandoPago]      = useState<string | null>(null);
  // Modal Editar Parcelado
  const [modalEditParcOpen, setModalEditParcOpen] = useState(false);
  // Acordo local (para reflectir edições sem fechar o detalhe)
  const [acordoLocal, setAcordoLocal] = useState<Acordo>(acordo);

  // ── Derivados (usam acordoLocal — sempre após o useState acima) ──────────
  const atrasado      = isAtrasado(acordoLocal.vencimento, acordoLocal.status);
  const totalParcelas = acordoLocal.parcelas ?? 1;
  // Mostrar sub-tabela quando: tipo parcelado E parcelas > 1
  const deveExibirParcelas =
    isTipoParcelado(acordoLocal.tipo, isPaguePlay) && totalParcelas > 1;
  // Acordo simples = não parcelado
  const isAcordoSimples = !deveExibirParcelas;

  const link   = extractLinkAcordo(acordoLocal.observacoes);
  const estado = extractEstado(acordoLocal.observacoes);
  const nomeOp = (acordoLocal.perfis as { nome?: string } | undefined)?.nome ?? '—';

  // ── Buscar registros reais do grupo ──────────────────────────────────────
  useEffect(() => {
    if (!deveExibirParcelas || !acordoLocal.acordo_grupo_id) return;
    setLoadingParc(true);
    supabase
      .from('acordos')
      .select('*')
      .eq('acordo_grupo_id', acordoLocal.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao buscar parcelas');
        else setRegistrosReais((data ?? []) as Acordo[]);
        setLoadingParc(false);
      });
  }, [deveExibirParcelas, acordoLocal.acordo_grupo_id]);

  // ── Marcar como pago ──────────────────────────────────────────────────────
  async function marcarPago(p: Acordo) {
    setMarcandoPago(p.id);
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', p.id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
    } else {
      toast.success('Parcela marcada como paga!');
      setRegistrosReais(prev => prev.map(x => x.id === p.id ? { ...x, status: 'pago' } : x));
    }
    setMarcandoPago(null);
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
                    {isPaguePlay ? (acordoLocal.instituicao || acordoLocal.nr_cliente || '—') : acordoLocal.nome_cliente}
                  </h3>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[acordoLocal.status])}>
                    {statusLabels[acordoLocal.status] ?? acordoLocal.status}
                  </span>
                  {atrasado && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
                  {deveExibirParcelas && (
                    <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                      Parcela {acordoLocal.numero_parcela ?? 1}/{totalParcelas}
                    </span>
                  )}
                </div>
                {/* Botões de ação no cabeçalho */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Botão Editar: parcelado → abre ModalEditarAcordoParcelado; simples → usa o inline edit do pai */}
                  {deveExibirParcelas && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => setModalEditParcOpen(true)}
                    >
                      <Edit className="w-3 h-3" />
                      Editar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* ─── Grid de campos ─── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                {isPaguePlay && acordoLocal.instituicao && (
                  <Campo icon={Building2} label="Inscrição" value={acordoLocal.instituicao} />
                )}
                {acordoLocal.nr_cliente && (
                  <Campo icon={Hash} label={isPaguePlay ? 'CPF' : 'NR'} value={acordoLocal.nr_cliente} mono />
                )}
                {isPaguePlay && acordoLocal.nome_cliente && (
                  <Campo icon={User} label="Nome do Profissional" value={acordoLocal.nome_cliente} />
                )}
                {isPaguePlay && estado && (
                  <Campo icon={MapPin} label="Estado" value={estado} />
                )}
                <Campo icon={Calendar} label="Vencimento" value={
                  <span className={cn(atrasado && 'text-destructive font-semibold')}>
                    {formatDate(acordoLocal.vencimento)}
                  </span>
                } />
                <Campo icon={DollarSign} label="Valor" value={formatCurrency(acordoLocal.valor)} mono />
                <Campo label="Forma de Pagamento">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5', TIPO_COLORS[acordoLocal.tipo])}>
                    {tipoLabels[acordoLocal.tipo] ?? acordoLocal.tipo}
                  </span>
                </Campo>
                {deveExibirParcelas && (
                  <Campo icon={Layers} label="Total de Parcelas" value={String(totalParcelas)} mono />
                )}
                {!isPaguePlay && acordoLocal.whatsapp && (
                  <Campo icon={Smartphone} label="WhatsApp" value={acordoLocal.whatsapp} mono />
                )}
                {!isPaguePlay && acordoLocal.instituicao && (
                  <Campo icon={Building2} label="Instituição" value={acordoLocal.instituicao} />
                )}
                <Campo icon={User} label="Operador" value={nomeOp} />
              </div>

              {/* ─── Observações ─── */}
              {!isPaguePlay && acordoLocal.observacoes && (
                <>
                  <Separator className="my-4" />
                  <Campo icon={FileText} label="Observações" full>
                    <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 mt-0.5">
                      {acordoLocal.observacoes}
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
                                    {real && real.status !== 'pago' ? (
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

      {/* Modal editar parcelado */}
      {deveExibirParcelas && (
        <ModalEditarAcordoParcelado
          acordo={acordoLocal}
          isPaguePlay={isPaguePlay}
          registrosReais={registrosReais}
          open={modalEditParcOpen}
          onClose={() => setModalEditParcOpen(false)}
          onSaved={(principal, todasAtualizadas) => {
            setAcordoLocal(principal);
            setRegistrosReais(todasAtualizadas);
            onSaved?.(principal);
          }}
        />
      )}
    </>
  );
}