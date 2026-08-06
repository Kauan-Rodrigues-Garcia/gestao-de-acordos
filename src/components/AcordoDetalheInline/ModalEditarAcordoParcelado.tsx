import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { Edit, Save, Wallet, Layers } from 'lucide-react';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { parseCurrencyInput, formatarTelefonePP } from '@/lib/index';
import { formatBRL, temEntrada, valorDemaisParcelas } from '@/lib/money';
import { camposDeEntradaAposEdicao } from '@/services/entradaSincronizada';
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

  // Edição em conjunto: marcar várias parcelas e aplicar data, valor ou forma
  // a todas de uma vez. Um acordo de 12 parcelas em que o cliente mudou o dia
  // de pagamento eram 12 edições iguais, uma a uma.
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [loteData,  setLoteData]  = useState('');
  const [loteValor, setLoteValor] = useState('');
  const [loteTipo,  setLoteTipo]  = useState('');

  useEffect(() => {
    if (!open) return;
    setAba('geral');
    setSelecionadas([]);
    setLoteData(''); setLoteValor(''); setLoteTipo('');
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

  const todasMarcadas = parcRows.length > 0 && selecionadas.length === parcRows.length;

  function alternarSelecao(id: string) {
    setSelecionadas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  /**
   * Aplica às parcelas marcadas só os campos PREENCHIDOS do bloco em lote.
   * Campo vazio não é "apagar": é "não mexer nesse". Sem essa regra, aplicar
   * uma data nova zeraria o valor de todas as parcelas selecionadas.
   */
  function aplicarEmLote() {
    if (!selecionadas.length) { toast.error('Marque ao menos uma parcela.'); return; }
    if (!loteData && !loteValor.trim() && !loteTipo) {
      toast.error('Preencha data, valor ou forma para aplicar.');
      return;
    }
    if (loteValor.trim()) {
      const v = parseCurrencyInput(loteValor);
      if (isNaN(v) || v <= 0) { toast.error('Valor do lote inválido.'); return; }
    }
    setParcRows(prev => prev.map(r => selecionadas.includes(r.id)
      ? {
          ...r,
          vencimento: loteData || r.vencimento,
          valor:      loteValor.trim() || r.valor,
          tipo:       (loteTipo || r.tipo) as Acordo['tipo'],
        }
      : r));
    toast.success(`Aplicado a ${selecionadas.length} parcela(s). Salve para gravar.`);
    setLoteData(''); setLoteValor(''); setLoteTipo('');
  }

  // ── Entrada ───────────────────────────────────────────────────────────────
  // Num acordo com entrada a parcela 1 vale outro número, e `valor_entrada` /
  // `valor_total` precisam continuar batendo com o que está na lista depois de
  // salvar — senão a tela do acordo passa a mostrar um total que não existe.
  const entradaAtiva = temEntrada(acordo);
  const demaisDoAcordo = valorDemaisParcelas(acordo);

  /** Campos do grupo que a entrada obriga a regravar junto (ver o serviço). */
  function camposDaEntrada(rows: ParcRow[]): Record<string, unknown> {
    return camposDeEntradaAposEdicao({
      temEntrada:     entradaAtiva,
      totalDeclarado: acordo.parcelas ?? rows.length,
      demaisFallback: demaisDoAcordo,
      parcelas:       rows.map(r => ({ numero: r.numero, valor: parseCurrencyInput(r.valor) })),
    }) ?? {};
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
        ...camposDaEntrada(parcRows),
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

            {entradaAtiva && demaisDoAcordo != null && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
                <Wallet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Acordo <strong>com entrada</strong>: a parcela 1 é a entrada de{' '}
                  <strong>{formatBRL(acordo.valor_entrada ?? 0)}</strong> e as demais{' '}
                  <strong>{formatBRL(demaisDoAcordo)}</strong>. Mudar esses valores aqui
                  atualiza o total do acordo ao salvar.
                </span>
              </p>
            )}

            {parcRows.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhuma parcela encontrada.</p>
            )}

            {parcRows.length > 1 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={(e) => setSelecionadas(e.target.checked ? parcRows.map(r => r.id) : [])}
                    className="h-3.5 w-3.5 accent-primary cursor-pointer"
                  />
                  <span className="text-xs font-medium">Selecionar todas</span>
                  <span className="text-[10px] text-muted-foreground">
                    {selecionadas.length > 0
                      ? `${selecionadas.length} marcada(s) — edite abaixo e aplique`
                      : 'marque parcelas para editar em conjunto'}
                  </span>
                </label>

                {selecionadas.length > 0 && (
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-end">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Vencimento</Label>
                      <Input
                        type="date" value={loteData}
                        onChange={e => setLoteData(e.target.value)}
                        className="h-7 text-[11px] font-mono px-1.5"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                      <Input
                        value={loteValor} onChange={e => setLoteValor(e.target.value)}
                        placeholder="não alterar" inputMode="decimal"
                        className="h-7 text-[11px] font-mono px-1.5"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Forma</Label>
                      <Select value={loteTipo} onValueChange={setLoteTipo}>
                        <SelectTrigger className="h-7 text-[11px] px-1.5">
                          <SelectValue placeholder="não alterar" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(_TIPO_LABELS_BK).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l as string}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={aplicarEmLote}
                    >
                      <Layers className="w-3 h-3" />
                      Aplicar a {selecionadas.length}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {parcRows.map(row => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 border transition-colors',
                  selecionadas.includes(row.id) ? 'border-primary/60 bg-primary/5' : 'border-border/40',
                )}
              >
                <input
                  type="checkbox"
                  checked={selecionadas.includes(row.id)}
                  onChange={() => alternarSelecao(row.id)}
                  aria-label={`Selecionar parcela ${row.numero}`}
                  className="h-3.5 w-3.5 accent-primary cursor-pointer shrink-0"
                />
                <span className="text-xs font-mono font-bold text-primary w-6 text-center">{row.numero}</span>
                {entradaAtiva && row.numero === 1 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1 py-0.5 shrink-0">
                    entrada
                  </span>
                )}
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
