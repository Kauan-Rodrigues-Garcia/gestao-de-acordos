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
import { useEffect, useMemo, useState } from 'react';
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
  planejarParcelas, validarPlano, MAX_PARCELAS_LOTE, type AjustePersonalizado,
} from '@/services/parcelasLote';
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
  /** Recebe SEMPRE uma lista — com quantidade 1 ela tem um item só. */
  onConfirm:   (inputs: NovaParcelaInput[]) => void | Promise<void>;
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

  /**
   * Formas da lista personalizada. A lista trabalha com o valor que vai para o
   * banco, e a PaguePlay grava 'boleto' para a opção 'boleto_pix' — sem essa
   * troca o select ficava vazio, porque 'boleto' não existia entre as opções.
   */
  const tiposDaParcela = tipos.map(t => ({
    value: t.value === 'boleto_pix' ? 'boleto' : t.value,
    label: t.label,
  }));

  const [vencimento, setVencimento] = useState('');
  const [valorStr,   setValorStr]   = useState('');
  const [tipoSel,    setTipoSel]    = useState('boleto');
  const [statusSel,  setStatusSel]  = useState('verificar_pendente');
  const [parcelas,   setParcelas]   = useState<ParcelaResumo[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  // Quantas parcelas adicionar de uma vez. Padrão 1: quem só quer uma parcela
  // não percebe que o campo existe.
  const [qtdStr, setQtdStr] = useState('1');
  const quantidade = Math.min(Math.max(1, parseInt(qtdStr) || 1), MAX_PARCELAS_LOTE);

  // Personalização por parcela. `Record` por índice, e não array, para uma
  // linha em branco continuar em branco quando a quantidade muda.
  //
  // O valor fica como TEXTO, exatamente o que a pessoa digitou. Guardar o número
  // já convertido quebrava a digitação: "150," virava 150 e o campo reescrevia
  // "150" na mesma tecla, apagando a vírgula — nunca dava para chegar aos
  // centavos. A conversão acontece só na hora de montar o plano.
  type AjusteDigitado = {
    valorStr?:   string;
    vencimento?: string | null;
    tipo?:       string | null;
  };
  const [personalizar, setPersonalizar] = useState(false);
  const [ajustes, setAjustes] = useState<Record<number, AjusteDigitado>>({});
  const setAjuste = (i: number, patch: AjusteDigitado) =>
    setAjustes(prev => ({ ...prev, [i]: { ...prev[i], ...patch } }));

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
    setQtdStr('1');
    setPersonalizar(false);
    setAjustes({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, acordo?.id]);

  /**
   * O lote que será gravado. Recalculado a cada tecla para a lista de
   * personalização e o total na tela mostrarem exatamente o que vai ser salvo.
   */
  const plano = useMemo(() => planejarParcelas({
    quantidade,
    vencimentoBase: vencimento,
    valorBase:      parseCurrencyInput(valorStr),
    tipoBase:       tipoSel === 'boleto_pix' ? 'boleto' : tipoSel,
    statusBase:     statusSel,
    isPaguePlay,
    personalizadas: personalizar
      ? Array.from({ length: quantidade }, (_, i): AjustePersonalizado => {
          const a = ajustes[i];
          const digitado = (a?.valorStr ?? '').trim();
          return {
            // Campo em branco devolve null de propósito: `planejarParcelas`
            // trata null como "usa o valor do lote".
            valor:      digitado === '' ? null : parseCurrencyInput(digitado),
            vencimento: a?.vencimento,
            tipo:       a?.tipo,
          };
        })
      : undefined,
  }), [quantidade, vencimento, valorStr, tipoSel, statusSel, isPaguePlay, personalizar, ajustes]);

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
    // A conferência roda sobre o PLANO, não sobre os campos soltos: é o plano
    // que vai para o banco, e é nele que uma linha personalizada em branco
    // apareceria.
    const erro = validarPlano(plano);
    if (erro) { toast.error(erro); return; }
    void onConfirm(plano.parcelas.map(p => ({
      vencimento: p.vencimento,
      valor:      p.valor,
      tipo:       p.tipo,
      status:     p.status,
    })));
  }

  if (!acordo) return null;

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
      {/*
        Teto de altura + miolo rolável. Sem isso o diálogo cresce com a
        quantidade de parcelas e, como ele é centralizado por translate,
        estoura para cima E para baixo — o footer sai da tela e o botão de
        salvar fica inalcançável (10 parcelas personalizadas já bastam).
      */}
      <DialogContent
        className={cn(
          'max-w-md max-h-[90dvh] flex flex-col overflow-hidden',
          // A lista personalizada tem quatro colunas; em max-w-md o campo de
          // data nativo não cabe e fica cortado.
          personalizar && quantidade > 1 && 'max-w-lg',
        )}
        aria-describedby="modal-adicionar-parcela-desc"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-primary text-sm">
            <Layers className="w-4 h-4" />
            Adicionar parcela ao acordo
          </DialogTitle>
          <DialogDescription id="modal-adicionar-parcela-desc" className="text-xs">
            {descricao ?? `A nova parcela ficará vinculada ao ${nrLabel} "${nrValor}".`}
          </DialogDescription>
        </DialogHeader>

        {/* `min-h-0` é o que deixa este bloco encolher dentro do flex e rolar. */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 -mr-3 pr-3">
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
              <div className="space-y-1">
                <Label className="text-xs">Quantidade de parcelas</Label>
                <Input
                  type="number" min={1} max={MAX_PARCELAS_LOTE} inputMode="numeric"
                  value={qtdStr}
                  onChange={(e) => setQtdStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Parcelas personalizadas — só faz sentido com mais de uma. */}
            {quantidade > 1 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={personalizar}
                  onChange={(e) => setPersonalizar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary cursor-pointer"
                />
                <span className="text-xs font-medium">Parcelas personalizadas</span>
                <span className="text-[10px] text-muted-foreground">
                  valor, data e forma de cada uma
                </span>
              </label>
            )}

            {/* A lista não tem rolagem própria: quem rola é o miolo do diálogo,
                para não ficarem duas barras uma dentro da outra. */}
            {personalizar && quantidade > 1 && (
              <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5">
                <div className="grid grid-cols-[22px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Vencimento</span>
                  <span>Valor (R$)</span>
                  <span>Forma</span>
                </div>
                {plano.parcelas.map((p, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[22px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 items-center"
                  >
                    <span className="text-[10px] font-mono font-bold text-primary text-center">
                      {i + 1}
                    </span>
                    <Input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => setAjuste(i, { vencimento: e.target.value })}
                      className="h-7 text-[11px] font-mono px-1.5"
                    />
                    <Input
                      // Vazio mostra o valor do lote como placeholder: fica claro
                      // que não preencher mantém o padrão, em vez de zerar.
                      value={ajustes[i]?.valorStr ?? ''}
                      onChange={(e) => setAjuste(i, { valorStr: e.target.value })}
                      placeholder={formatCurrency(p.valor)}
                      inputMode="decimal"
                      className="h-7 text-[11px] font-mono px-1.5"
                    />
                    <Select
                      value={p.tipo}
                      onValueChange={(v) => setAjuste(i, { tipo: v })}
                    >
                      <SelectTrigger className="h-7 text-[11px] px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tiposDaParcela.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {/* Resumo: o operador confere o total antes de confirmar. */}
            {quantidade > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Serão criadas <strong className="text-foreground">{quantidade}</strong> parcelas,
                de {formatDate(plano.parcelas[0]?.vencimento ?? '')} a{' '}
                {formatDate(plano.parcelas[plano.parcelas.length - 1]?.vencimento ?? '')} — total{' '}
                <strong className="text-foreground">{formatCurrency(plano.total)}</strong>.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t border-border pt-3">
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
