/**
 * ModalEditarAcordoParcelado.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Edita SÓ o que é parcela: vencimento, valor e forma de pagamento de cada uma.
 *
 * Nome, NR, instituição e observações saíram daqui (06/08/2026). Eram os mesmos
 * campos da área de editar acordo, e duas telas gravando os mesmos dados é como
 * se cria divergência: a última a salvar ganha, sem ninguém saber que a outra
 * estava aberta. Quem edita cadastro é a área de edição; aqui é parcela.
 *
 * Abre pelo botão ao lado do campo Parcelas, dentro da área de editar acordo.
 */
import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { Save, Wallet, Layers } from 'lucide-react';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { parseCurrencyInput } from '@/lib/index';
import {
  formatBRL, temEntrada, valorDemaisParcelas, calcularParcelasComEntrada,
} from '@/lib/money';
import { camposDeEntradaAposEdicao } from '@/services/entradaSincronizada';
import { montarLinhasEditaveis } from '@/services/linhasParcelas';
import { criarParcelasNumeradas } from '@/services/parcelas.service';
import { _TIPO_LABELS_BK } from './helpers';

interface ModalEditarParceladoProps {
  acordo: Acordo;
  /**
   * Parcelas já carregadas pelo chamador. Quando não vêm, o modal busca —
   * a área de editar acordo conhece só a linha que está sendo editada.
   */
  registrosReais?: Acordo[];
  open: boolean;
  onClose: () => void;
  /** Recebe as linhas gravadas, para o chamador atualizar o que mostra. */
  onSaved: (parcelasAtualizadas: Acordo[]) => void;
}

type ParcRow = {
  /** Chave estável da linha: o id, ou a posição quando ainda não existe. */
  chave:      string;
  /** `null` enquanto a parcela não existe como registro no banco. */
  id:         string | null;
  numero:     number;
  vencimento: string;
  valor:      string;
  tipo:       Acordo['tipo'];
  /** Virtual que foi editada: vira registro ao salvar. */
  criar:      boolean;
};

export function ModalEditarAcordoParcelado({
  acordo, registrosReais, open, onClose, onSaved,
}: ModalEditarParceladoProps) {
  const [saving, setSaving]   = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [parcRows, setParcRows] = useState<ParcRow[]>([]);
  const [registros, setRegistros] = useState<Acordo[]>([]);

  // Edição em conjunto: marcar várias parcelas e aplicar data, valor ou forma
  // a todas de uma vez. Um acordo de 12 parcelas em que o cliente mudou o dia
  // de pagamento eram 12 edições iguais, uma a uma.
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [loteData,  setLoteData]  = useState('');
  const [loteValor, setLoteValor] = useState('');
  const [loteTipo,  setLoteTipo]  = useState('');

  /**
   * Monta as N linhas do acordo a partir do que existe no banco.
   *
   * O acordo declara `parcelas` mas pode ter menos linhas: um acordo de 17 com
   * duas registradas mostrava duas para editar. As que faltam entram na lista
   * com data e valor calculados e viram registro se a pessoa mexer nelas.
   */
  function preencher(registrosDoGrupo: Acordo[]) {
    const valoresComEntrada = temEntrada(acordo) && acordo.parcelas
      ? calcularParcelasComEntrada(
          Number(acordo.valor_entrada), valorDemaisParcelas(acordo) ?? 0, acordo.parcelas,
        )
      : null;
    const ultima = registrosDoGrupo[registrosDoGrupo.length - 1];

    const linhas = montarLinhasEditaveis({
      registros: registrosDoGrupo.map(r => ({
        id:             r.id,
        numero_parcela: r.numero_parcela ?? 1,
        vencimento:     r.vencimento,
        valor:          Number(r.valor),
        tipo:           r.tipo,
        status:         r.status,
      })),
      totalDeclarado:    acordo.parcelas ?? registrosDoGrupo.length,
      valoresCalculados: valoresComEntrada,
      valorPadrao:       Number(ultima?.valor ?? acordo.valor),
      tipoPadrao:        acordo.tipo,
      isPaguePlay:       false,
    });

    setRegistros(registrosDoGrupo);
    setParcRows(linhas.map(l => ({
      chave:      l.id ?? `nova-${l.numero}`,
      id:         l.id,
      numero:     l.numero,
      vencimento: l.vencimento,
      valor:      l.valor.toFixed(2).replace('.', ','),
      tipo:       l.tipo as Acordo['tipo'],
      criar:      false,
    })));
  }

  useEffect(() => {
    if (!open) return;
    setSelecionadas([]);
    setLoteData(''); setLoteValor(''); setLoteTipo('');

    if (registrosReais?.length) { preencher(registrosReais); return; }

    // Sem lista pronta: busca o grupo. Acordo sem grupo é uma parcela só.
    if (!acordo.acordo_grupo_id) { preencher([acordo]); return; }

    setCarregando(true);
    supabase
      .from('acordos')
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        const linhas = (error ? [] : (data ?? [])) as Acordo[];
        if (error) toast.error(`Erro ao buscar parcelas: ${error.message}`);
        preencher(linhas.length ? linhas : [acordo]);
        setCarregando(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, acordo.id, acordo.acordo_grupo_id, registrosReais?.length]);

  /** Editar uma linha que ainda não existe é o mesmo que pedir para criá-la. */
  function updateRow(
    chave: string, field: 'vencimento' | 'valor' | 'tipo', value: string,
  ) {
    setParcRows(prev => prev.map(r => r.chave === chave
      ? { ...r, [field]: value, criar: r.id === null ? true : r.criar }
      : r));
  }

  const editaveis = parcRows.filter(r => r.id !== null || r.vencimento);
  const todasMarcadas = editaveis.length > 0 && selecionadas.length === editaveis.length;

  function alternarSelecao(chave: string) {
    setSelecionadas(prev => prev.includes(chave) ? prev.filter(x => x !== chave) : [...prev, chave]);
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
    setParcRows(prev => prev.map(r => selecionadas.includes(r.chave)
      ? {
          ...r,
          vencimento: loteData || r.vencimento,
          valor:      loteValor.trim() || r.valor,
          tipo:       (loteTipo || r.tipo) as Acordo['tipo'],
          criar:      r.id === null ? true : r.criar,
        }
      : r));
    toast.success(`Aplicado a ${selecionadas.length} parcela(s). Salve para gravar.`);
    setLoteData(''); setLoteValor(''); setLoteTipo('');
  }

  // ── Entrada ───────────────────────────────────────────────────────────────
  // Num acordo com entrada a parcela 1 vale outro número, e `valor_entrada` /
  // `valor_total` precisam continuar batendo com o que está na lista depois de
  // salvar — senão a tela do acordo passa a mostrar um total que não é a soma
  // de nada.
  const entradaAtiva   = temEntrada(acordo);
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
    if (!parcRows.length) { toast.error('Nenhuma parcela para salvar.'); return; }
    // Só o que vai ao banco é conferido: linha virtual intocada continua
    // virtual, e cobrar vencimento dela travaria o salvamento à toa.
    const paraGravar = parcRows.filter(r => r.id !== null || r.criar);
    for (const row of paraGravar) {
      const valorNum = parseCurrencyInput(row.valor);
      if (isNaN(valorNum) || valorNum <= 0) { toast.error(`Valor inválido na parcela ${row.numero}`); return; }
      if (!row.vencimento) { toast.error(`Informe o vencimento da parcela ${row.numero}`); return; }
    }

    setSaving(true);
    try {
      // Entrada primeiro: são campos do GRUPO (valor_entrada, valor_total) e
      // não podem sobrescrever o valor individual gravado logo abaixo.
      const camposGrupo = camposDaEntrada(parcRows);
      if (Object.keys(camposGrupo).length && acordo.acordo_grupo_id) {
        const { error: errGrupo } = await supabase
          .from('acordos')
          .update(camposGrupo)
          .eq('acordo_grupo_id', acordo.acordo_grupo_id);
        if (errGrupo) { toast.error(`Erro ao atualizar o total do acordo: ${errGrupo.message}`); return; }
      }

      for (const row of paraGravar.filter(r => r.id !== null)) {
        const { error: errP } = await supabase
          .from('acordos')
          .update({
            vencimento: row.vencimento,
            valor:      parseCurrencyInput(row.valor),
            tipo:       row.tipo,
          })
          .eq('id', row.id!);
        if (errP) { toast.error(`Erro parcela ${row.numero}: ${errP.message}`); return; }
      }

      // Parcelas que a pessoa editou e que ainda não existiam: nascem agora,
      // na posição certa (a 9ª grava 9, não "a próxima da fila").
      const novas = paraGravar.filter(r => r.id === null);
      let criadas: Acordo[] = [];
      if (novas.length) {
        const r = await criarParcelasNumeradas(
          acordo,
          novas.map(n => ({
            numero:     n.numero,
            vencimento: n.vencimento,
            valor:      parseCurrencyInput(n.valor),
            tipo:       n.tipo,
            status:     'verificar_pendente',
          })),
          { camposExtras: camposGrupo },
        );
        if ('erro' in r) { toast.error(r.erro); return; }
        criadas = r.criadas;
      }

      const atualizadas: Acordo[] = paraGravar.map(row => {
        const real = registros.find(r => r.id === row.id)
          ?? criadas.find(c => (c.numero_parcela ?? 1) === row.numero);
        return {
          ...(real ?? acordo),
          ...camposGrupo,
          vencimento: row.vencimento,
          valor:      parseCurrencyInput(row.valor),
          tipo:       row.tipo,
        } as Acordo;
      });

      // Espelha no par Direto↔Extra, como o resto das telas de parcela faz.
      if ((acordo.tipo_vinculo === 'extra' || acordo.vinculo_operador_id) && paraGravar.length) {
        const primeira = paraGravar[0];
        await supabase.rpc('fn_sync_par_vinculo', {
          p_acordo_id:    acordo.id,
          p_valor:        parseCurrencyInput(primeira.valor),
          p_vencimento:   primeira.vencimento,
          p_nome_cliente: acordo.nome_cliente,
          p_tipo:         primeira.tipo,
          p_whatsapp:     acordo.whatsapp ?? null,
          p_parcelas:     acordo.parcelas,
          p_status:       acordo.status,
        });
      }

      toast.success(criadas.length
        ? `Parcelas atualizadas — ${criadas.length} criada(s).`
        : 'Parcelas atualizadas!');
      onSaved(atualizadas);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* Teto de altura e miolo rolável: com muitas parcelas o diálogo cresceria
          além da tela e levaria o botão de salvar junto. */}
      <DialogContent
        className="max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
        aria-describedby="modal-edit-parc-desc"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-primary" />
            Editar parcelas
          </DialogTitle>
          <DialogDescription id="modal-edit-parc-desc" className="text-xs">
            Vencimento, valor e forma de pagamento de cada parcela.
            Nome, NR e observações continuam na área de editar acordo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 -mr-3 pr-3 py-1">
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

          {parcRows.some(r => r.id === null) && (
            <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-2.5 py-1.5">
              Este acordo tem <strong>{parcRows.length}</strong> parcelas, mas{' '}
              <strong>{parcRows.filter(r => r.id === null).length}</strong> ainda não existem como
              registro. Elas aparecem com data e valor calculados: editar uma delas cria a parcela
              ao salvar. As que você não mexer continuam como estão.
            </p>
          )}

          {carregando && <div className="h-8 rounded bg-muted animate-pulse" />}
          {!carregando && parcRows.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma parcela encontrada.</p>
          )}

          {parcRows.length > 1 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={(e) => setSelecionadas(e.target.checked ? editaveis.map(r => r.chave) : [])}
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
              key={row.chave}
              className={cn(
                'flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 border transition-colors',
                selecionadas.includes(row.chave) ? 'border-primary/60 bg-primary/5' : 'border-border/40',
                row.id === null && !row.criar && 'opacity-70 border-dashed',
                !row.vencimento && row.id === null && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={selecionadas.includes(row.chave)}
                onChange={() => alternarSelecao(row.chave)}
                disabled={row.id === null && !row.vencimento}
                aria-label={`Selecionar parcela ${row.numero}`}
                className="h-3.5 w-3.5 accent-primary cursor-pointer shrink-0"
              />
              <span className="text-xs font-mono font-bold text-primary w-6 text-center">{row.numero}</span>
              {entradaAtiva && row.numero === 1 && (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1 py-0.5 shrink-0">
                  entrada
                </span>
              )}
              {row.id === null && (
                <span
                  title={row.criar
                    ? 'Vai ser criada ao salvar'
                    : 'Ainda não existe como registro — editar cria ao salvar'}
                  className={cn(
                    'text-[9px] font-semibold uppercase tracking-wide rounded px-1 py-0.5 shrink-0 border',
                    row.criar
                      ? 'text-primary bg-primary/15 border-primary/30'
                      : 'text-muted-foreground bg-muted border-border',
                  )}
                >
                  {row.criar ? 'criar' : 'não registrada'}
                </span>
              )}
              <div className="flex-1 space-y-0.5">
                <DatePickerField
                  value={row.vencimento}
                  onChange={(v) => updateRow(row.chave, 'vencimento', v)}
                  label="Vencimento"
                  size="sm"
                  placeholder="Paga antes da tabulação"
                />
              </div>
              <div className="w-24 space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                <Input
                  value={row.valor}
                  onChange={e => updateRow(row.chave, 'valor', e.target.value)}
                  inputMode="decimal"
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div className="w-32 space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Forma</Label>
                <Select
                  value={row.tipo}
                  onValueChange={v => updateRow(row.chave, 'tipo', v)}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(_TIPO_LABELS_BK).map(([valor, label]) => (
                      <SelectItem key={valor} value={valor}>{label as string}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving} size="sm">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || carregando} size="sm" className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar parcelas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
