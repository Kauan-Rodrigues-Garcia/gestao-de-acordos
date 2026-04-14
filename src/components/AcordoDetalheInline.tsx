/**
 * AcordoDetalheInline.tsx
 * Painel expansível somente-leitura.
 *
 * LÓGICA DE PARCELAS:
 *  - São lidas do banco via acordo_grupo_id (visuais, sem criação).
 *  - "Pago" → apenas UPDATE status na parcela. Não cria novos registros.
 *  - onReagendar() é chamado após marcar pago para o pai exibir "Reagendar".
 *  - Ação: pendente → "Pago" | pago + próxima parcela existe → "Agendado" | pago sem próxima → "—"
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Hash, Calendar, DollarSign, Smartphone, Building2,
  FileText, User, Layers, MapPin, Link2, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
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
  return isPP ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo) : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
}

export interface AcordoDetalheInlineProps {
  acordo: Acordo;
  isPaguePlay: boolean;
  colSpan: number;
  onClose: () => void;
  /** Chamado após marcar uma parcela como paga, para o pai exibir o botão Reagendar */
  onReagendar?: () => void;
}

// ─── Campo somente-leitura ────────────────────────────────────────────────
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

// ─── Modal de Reagendamento (exportado para uso no pai) ──────────────────────
export function ModalReagendar({
  parcela, open, onClose, onConfirm,
}: {
  parcela: Acordo | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: string, valor: number) => Promise<void>;
}) {
  const [novaData,    setNovaData]    = useState('');
  const [novoValor,   setNovoValor]   = useState('');
  const [salvando,    setSalvando]    = useState(false);

  useEffect(() => {
    if (!parcela) return;
    const [y, m, d] = parcela.vencimento.split('-').map(Number);
    const nm = m + 1 > 12 ? 1 : m + 1;
    const na = m + 1 > 12 ? y + 1 : y;
    setNovaData(`${na}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
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
            Confirme a data e o valor para o próximo pagamento de{' '}
            <span className="font-semibold text-foreground">
              {parcela?.instituicao || parcela?.nome_cliente || parcela?.nr_cliente}
            </span>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data de vencimento</label>
              <input
                type="date"
                value={novaData}
                onChange={e => setNovaData(e.target.value)}
                className="w-full h-9 text-sm bg-background border border-input rounded-md px-3 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={novoValor}
                onChange={e => setNovoValor(e.target.value)}
                className="w-full h-9 text-sm bg-background border border-input rounded-md px-3 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            className="bg-success hover:bg-success/90 text-white border border-success gap-2"
            onClick={handleConfirm}
            disabled={salvando}
          >
            <CheckCircle2 className="w-4 h-4" />
            {salvando ? 'Reagendando...' : 'Confirmar Reagendamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export function AcordoDetalheInline({
  acordo, isPaguePlay, colSpan, onClose, onReagendar,
}: AcordoDetalheInlineProps) {
  const statusLabels = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const tipoLabels   = isPaguePlay ? TIPO_LABELS_PAGUEPLAY   : TIPO_LABELS;
  const atrasado     = isAtrasado(acordo.vencimento, acordo.status);

  // Exibir sub-tabela de parcelas se: tipo parcelado + grupo definido + >1 parcela
  const temGrupo = isTipoParcelado(acordo.tipo, isPaguePlay)
    && (acordo.parcelas ?? 1) > 1
    && !!acordo.acordo_grupo_id;

  // Parcelas carregadas do banco (apenas leitura — nenhuma inserção aqui)
  const [parcelas,      setParcelas]      = useState<Acordo[]>([]);
  const [loadingParc,   setLoadingParc]   = useState(false);
  const [marcandoPago,  setMarcandoPago]  = useState<string | null>(null);

  const link           = extractLinkAcordo(acordo.observacoes);
  const estado         = extractEstado(acordo.observacoes);
  const nomeOp         = (acordo.perfis as { nome?: string } | undefined)?.nome ?? '—';
  const nomeProfissional = acordo.nome_cliente;

  // Carregar parcelas do grupo (visuais — sem criar nada)
  useEffect(() => {
    if (!temGrupo) return;
    setLoadingParc(true);
    supabase
      .from('acordos')
      .select('*')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id!)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao buscar parcelas');
        else setParcelas((data ?? []) as Acordo[]);
        setLoadingParc(false);
      });
  }, [temGrupo, acordo.acordo_grupo_id]);

  /**
   * Marcar parcela como paga.
   * Faz apenas UPDATE status='pago' na parcela — NÃO cria nenhum novo registro.
   * Chama onReagendar() para o pai exibir o botão "Reagendar" na linha da tabela.
   */
  async function marcarPago(p: Acordo) {
    setMarcandoPago(p.id);
    const { error } = await supabase
      .from('acordos')
      .update({ status: 'pago' })
      .eq('id', p.id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
    } else {
      toast.success('Parcela marcada como paga!');
      // Atualizar lista local
      setParcelas(prev => prev.map(x => x.id === p.id ? { ...x, status: 'pago' } : x));
      // Avisar o pai (para mostrar botão Reagendar na tabela)
      onReagendar?.();
    }
    setMarcandoPago(null);
  }

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="overflow-hidden"
        >
          <div className="p-5 bg-accent/20 border-t border-b border-primary/15">

            {/* ─── Header ─── */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-foreground">
                  {isPaguePlay
                    ? (acordo.instituicao || acordo.nr_cliente || '—')
                    : acordo.nome_cliente}
                </h3>
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[acordo.status])}>
                  {statusLabels[acordo.status] ?? acordo.status}
                </span>
                {atrasado && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
                {!!(acordo.acordo_grupo_id && (acordo.parcelas ?? 1) > 1) && (
                  <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                    Parcela {acordo.numero_parcela ?? 1}/{acordo.parcelas}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* ─── Grid de campos ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">

              {/* Inscrição (PaguePay) */}
              {isPaguePlay && acordo.instituicao && (
                <Campo icon={Building2} label="Inscrição" value={acordo.instituicao} />
              )}

              {/* CPF / NR */}
              {acordo.nr_cliente && (
                <Campo icon={Hash} label={isPaguePlay ? 'CPF' : 'NR'} value={acordo.nr_cliente} mono />
              )}

              {/* Nome do Profissional (PaguePay — se preenchido) */}
              {isPaguePlay && nomeProfissional && (
                <Campo icon={User} label="Nome do Profissional" value={nomeProfissional} />
              )}

              {/* Estado (PaguePay) */}
              {isPaguePlay && estado && (
                <Campo icon={MapPin} label="Estado" value={estado} />
              )}

              {/* Vencimento */}
              <Campo
                icon={Calendar}
                label="Vencimento"
                value={
                  <span className={cn(atrasado && 'text-destructive font-semibold')}>
                    {formatDate(acordo.vencimento)}
                  </span>
                }
              />

              {/* Valor */}
              <Campo icon={DollarSign} label="Valor" value={formatCurrency(acordo.valor)} mono />

              {/* Tipo */}
              <Campo label="Forma de Pagamento">
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5', TIPO_COLORS[acordo.tipo])}>
                  {tipoLabels[acordo.tipo] ?? acordo.tipo}
                </span>
              </Campo>

              {/* Parcelas totais */}
              {isTipoParcelado(acordo.tipo, isPaguePlay) && (acordo.parcelas ?? 1) > 1 && (
                <Campo icon={Layers} label="Parcelas" value={`${acordo.numero_parcela ?? 1} de ${acordo.parcelas}`} mono />
              )}

              {/* WhatsApp (Bookplay) */}
              {!isPaguePlay && acordo.whatsapp && (
                <Campo icon={Smartphone} label="WhatsApp" value={acordo.whatsapp} mono />
              )}

              {/* Instituição (Bookplay) */}
              {!isPaguePlay && acordo.instituicao && (
                <Campo icon={Building2} label="Instituição" value={acordo.instituicao} />
              )}

              {/* Operador */}
              <Campo icon={User} label="Operador" value={nomeOp} />

            </div>

            {/* ─── Observações (Bookplay) ─── */}
            {!isPaguePlay && acordo.observacoes && (
              <>
                <Separator className="my-4" />
                <Campo icon={FileText} label="Observações">
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 mt-0.5">
                    {acordo.observacoes}
                  </p>
                </Campo>
              </>
            )}

            {/* ─── Link do Acordo ─── */}
            {link && (
              <>
                <Separator className="my-4" />
                <div className="flex items-start gap-2">
                  <Link2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Link do Acordo</p>
                    <a
                      href={link.startsWith('http') ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                    >
                      {link}
                    </a>
                  </div>
                </div>
              </>
            )}

            {/* ─── Sub-tabela de Parcelas (visual, sem ações de criar) ─── */}
            {temGrupo && (
              <>
                <Separator className="my-4" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Parcelas do Grupo</span>
                  </div>
                  {loadingParc ? (
                    <p className="text-xs text-muted-foreground">Carregando parcelas...</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vencimento</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Valor</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parcelas.map(p => {
                            const numP = p.numero_parcela ?? 1;
                            /**
                             * "Agendado" = esta parcela está PAGA E existe uma parcela
                             * com numero_parcela = numP + 1 no mesmo grupo.
                             * Isso significa que o reagendamento foi confirmado.
                             */
                            const proximaExiste = parcelas.some(x => (x.numero_parcela ?? 1) === numP + 1);
                            const foiAgendada   = p.status === 'pago' && proximaExiste;

                            return (
                              <tr
                                key={p.id}
                                className={cn(
                                  'border-b border-border/50 hover:bg-accent/30 transition-colors',
                                  p.id === acordo.id && 'bg-primary/5'
                                )}
                              >
                                <td className="px-3 py-2 font-mono font-bold text-primary">
                                  {numP}
                                </td>
                                <td className="px-3 py-2 font-mono">{formatDate(p.vencimento)}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold">
                                  {formatCurrency(p.valor)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[p.status])}>
                                    {statusLabels[p.status] ?? p.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {p.status !== 'pago' ? (
                                    /* Pendente → botão Pago (apenas para a 1ª parcela não paga) */
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-6 text-[10px] px-2 text-success hover:bg-success/10"
                                      disabled={marcandoPago === p.id}
                                      onClick={() => marcarPago(p)}
                                    >
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      {marcandoPago === p.id ? '...' : 'Pago'}
                                    </Button>
                                  ) : foiAgendada ? (
                                    /* Pago + próxima parcela existe → Agendado */
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success border border-success/30">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Agendado
                                    </span>
                                  ) : (
                                    /* Pago sem próxima → vazio (aguardando Reagendar via tabela) */
                                    <span className="text-muted-foreground/40 text-[10px]">—</span>
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
  );
}
