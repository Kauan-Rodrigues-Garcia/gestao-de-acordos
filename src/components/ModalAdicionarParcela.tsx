/**
 * ModalAdicionarParcela.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Modal único das duas portas de "adicionar parcela ao mesmo NR":
 *  • Porta A — tabulação bloqueada porque o NR já é do próprio operador
 *    (AcordoNovoInline): campos chegam preenchidos com o que foi digitado.
 *  • Porta B — botão "Adicionar parcela" no detalhe do acordo
 *    (AcordoDetalheInline): campos abrem com sugestões do acordo.
 *
 * Mostra o acordo existente + parcelas do grupo e deixa o operador revisar
 * vencimento, valor, forma e status antes de confirmar.
 */
import { useEffect, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { supabase, type Acordo } from '@/lib/supabase';
import type { NovaParcelaInput } from '@/services/parcelas.service';
import {
  formatCurrency, formatDate, parseCurrencyInput,
  STATUS_LABELS, STATUS_LABELS_PAGUEPLAY, STATUS_COLORS,
  TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
} from '@/lib/index';
import { TIPOS_PAGUEPLAY, TIPOS_BOOKPLAY, STATUS_OPTIONS } from '@/components/AcordoNovoInline/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ModalAdicionarParcelaProps {
  aberto:      boolean;
  /** Acordo existente que receberá a nova parcela (qualquer parcela do grupo). */
  acordo:      Acordo | null;
  isPaguePlay: boolean;
  /** Valores iniciais dos campos (porta A: o que o operador digitou na tabulação). */
  inicial?:    Partial<NovaParcelaInput>;
  /** Texto de contexto no topo (porta A explica o bloqueio do NR). */
  descricao?:  string;
  salvando:    boolean;
  onConfirm:   (input: NovaParcelaInput) => void | Promise<void>;
  onClose:     () => void;
}

/** No form PaguePlay boleto/pix são exibidos como a opção única 'boleto_pix'. */
function tipoParaOpcao(tipo: string | undefined, isPP: boolean): string {
  if (!tipo) return isPP ? 'boleto_pix' : 'boleto';
  if (isPP && (tipo === 'boleto' || tipo === 'pix')) return 'boleto_pix';
  return tipo;
}

type ParcelaResumo = Pick<Acordo, 'id' | 'numero_parcela' | 'vencimento' | 'valor' | 'status'>;

export function ModalAdicionarParcela({
  aberto, acordo, isPaguePlay, inicial, descricao, salvando, onConfirm, onClose,
}: ModalAdicionarParcelaProps) {
  const tipos        = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoLabels   = isPaguePlay ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS;
  const statusLabels = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const nrLabel      = isPaguePlay ? 'Código' : 'NR';
  const nrValor      = (isPaguePlay ? acordo?.instituicao : acordo?.nr_cliente) ?? '—';

  const [vencimento, setVencimento] = useState('');
  const [valorStr,   setValorStr]   = useState('');
  const [tipoSel,    setTipoSel]    = useState('boleto');
  const [statusSel,  setStatusSel]  = useState('verificar_pendente');
  const [parcelas,   setParcelas]   = useState<ParcelaResumo[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  // (Re)inicializa os campos toda vez que o modal abre para um acordo.
  useEffect(() => {
    if (!aberto || !acordo) return;
    setVencimento(inicial?.vencimento ?? '');
    setValorStr(
      inicial?.valor != null && inicial.valor > 0
        ? inicial.valor.toFixed(2).replace('.', ',')
        : '',
    );
    setTipoSel(tipoParaOpcao(inicial?.tipo ?? acordo.tipo, isPaguePlay));
    setStatusSel(inicial?.status ?? 'verificar_pendente');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, acordo?.id]);

  // Parcelas já registradas do grupo (para o operador ver o que existe).
  useEffect(() => {
    if (!aberto || !acordo) return;
    if (!acordo.acordo_grupo_id) { setParcelas([acordo]); return; }
    setLoadingParcelas(true);
    supabase
      .from('acordos')
      .select('id, numero_parcela, vencimento, valor, status')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data }) => {
        const linhas = (data ?? []) as ParcelaResumo[];
        setParcelas(linhas.length > 0 ? linhas : [acordo]);
        setLoadingParcelas(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, acordo?.id, acordo?.acordo_grupo_id]);

  function confirmar() {
    const valor = parseCurrencyInput(valorStr);
    if (isNaN(valor) || valor <= 0) { toast.error('Informe um valor válido para a nova parcela'); return; }
    if (!vencimento)                { toast.error('Informe o vencimento da nova parcela'); return; }
    void onConfirm({
      vencimento,
      valor,
      tipo:   tipoSel === 'boleto_pix' ? 'boleto' : tipoSel,
      status: statusSel,
    });
  }

  if (!acordo) return null;

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="modal-adicionar-parcela-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary text-sm">
            <Layers className="w-4 h-4" />
            Adicionar parcela ao acordo
          </DialogTitle>
          <DialogDescription id="modal-adicionar-parcela-desc" className="text-xs">
            {descricao ?? `A nova parcela ficará vinculada ao ${nrLabel} "${nrValor}".`}
          </DialogDescription>
        </DialogHeader>

        {/* Acordo existente */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-foreground">{nrLabel} {nrValor}</span>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[acordo.status])}>
              {statusLabels[acordo.status] ?? acordo.status}
            </span>
          </div>
          {acordo.nome_cliente && (
            <p className="text-muted-foreground truncate">{acordo.nome_cliente}</p>
          )}
          <p className="text-muted-foreground">
            Forma atual: <strong className="text-foreground">{tipoLabels[acordo.tipo] ?? acordo.tipo}</strong>
            {' · '}Operador: <strong className="text-foreground">{(acordo.perfis as { nome?: string } | undefined)?.nome ?? '—'}</strong>
          </p>
        </div>

        {/* Parcelas já registradas */}
        <div className="text-xs">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">
            Parcelas registradas
          </p>
          {loadingParcelas ? (
            <div className="h-6 rounded bg-muted animate-pulse" />
          ) : (
            <ul className="space-y-1 max-h-28 overflow-y-auto pr-1">
              {parcelas.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 font-mono">
                  <span className="text-primary font-bold">#{p.numero_parcela ?? 1}</span>
                  <span>{formatDate(p.vencimento)}</span>
                  <span className="font-semibold">{formatCurrency(p.valor)}</span>
                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border font-sans', STATUS_COLORS[p.status])}>
                    {statusLabels[p.status] ?? p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Nova parcela */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
            Nova parcela
          </p>
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField label="Vencimento" required value={vencimento} onChange={setVencimento} />
            <div className="space-y-1">
              <Label className="text-xs">Valor *</Label>
              <Input
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                placeholder="0,00"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={tipoSel} onValueChange={setTipoSel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusSel} onValueChange={setStatusSel}>
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={confirmar} disabled={salvando}>
            <Plus className="w-3.5 h-3.5" />
            {salvando ? 'Adicionando...' : 'Adicionar parcela'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
