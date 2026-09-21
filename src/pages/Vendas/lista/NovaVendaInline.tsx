/**
 * NovaVendaInline — lançar (ou corrigir) uma venda sem sair da lista.
 *
 * ## Dois campos obrigatórios, e o resto é do relatório
 *
 * Até 21/09/2026 lançar venda era um diálogo com sete campos. O pedido da
 * operação foi direto: «o jeito que a venda é cadastrada é muito arcaico e
 * complicado». E não precisava ser — quando o NR aparece na importação do
 * relatório geral, `fn_vendas_projetar` casa pelo NR e escreve situação,
 * assinatura, estado, forma de pagamento, valor e recebido por cima do que foi
 * digitado. O que o operador precisa dar é o que só ele sabe na hora: **NR e
 * valor**. Cliente e data ajudam a reconhecer a linha; estado, forma e entrada
 * ficam atrás de «mais detalhes», para quem quiser.
 *
 * ## Lançar várias seguidas
 *
 * O desenho é o da linha de «Novo Acordo» da BookPlay: abre no topo da
 * tabela. Com «continuar lançando» ligado, salvar limpa NR, valor e cliente,
 * mantém data e vendedor, e devolve o cursor ao NR — o operador que fechou
 * cinco vendas lança as cinco sem tirar a mão do teclado. Enter salva.
 *
 * ## O que NÃO se digita aqui
 *
 * Situação e assinatura: são o ato do líder (`fn_venda_confirmar`) ou do
 * relatório. Setor e equipe: saem do cadastro de quem vendeu, no banco.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ClipboardPaste, Info, Save, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ESTADOS_BRASIL, getTodayISO } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { lerValorDigitado } from '@/lib/vendasLista';
import type { EntradaVenda, Venda } from '@/services/vendas/vendas.service';

/** O `Select` do shadcn recusa `value=""`. */
const NENHUM = '__nenhum__';

export const FORMAS_DE_PAGAMENTO = [
  'Cartão padrão', 'Cartão recorrente', 'PIX', 'PIX automático',
  'Boleto bancário', 'Cartão + boleto', 'Carteira',
] as const;

export interface OpcaoDeVendedor {
  id: string;
  nome: string;
  equipe: string | null;
}

interface Props {
  colSpan: number;
  /** Preenchida = correção; ausente = lançamento novo. */
  venda?: Venda | null;
  /** Quem vende por padrão — quem está logado. */
  operadorPadrao: string;
  /** Vazia = sem seletor «em nome de» (o operador lança só para si). */
  vendedores: readonly OpcaoDeVendedor[];
  /** NR → quem já tem. Para avisar antes de o banco recusar. */
  nrsConhecidos: ReadonlyMap<string, string>;
  onSalvar: (entrada: Omit<EntradaVenda, 'empresaId'>) => Promise<{ ok: boolean; erro: string | null }>;
  onFechar: () => void;
  onColar?: () => void;
  /** Chamado a cada venda NOVA lançada — a tela comemora. */
  onLancou?: () => void;
}

export function NovaVendaInline({
  colSpan, venda, operadorPadrao, vendedores, nrsConhecidos,
  onSalvar, onFechar, onColar, onLancou,
}: Props) {
  const editando = Boolean(venda);
  const [nr, setNr] = useState(venda?.nr_documento ?? '');
  const [valor, setValor] = useState(venda ? String(venda.valor_total).replace('.', ',') : '');
  const [cliente, setCliente] = useState(venda?.cliente ?? '');
  const [data, setData] = useState(venda?.data_venda?.slice(0, 10) ?? getTodayISO());
  const [operador, setOperador] = useState(venda?.operador_id ?? operadorPadrao);
  const [uf, setUf] = useState(venda?.uf?.trim() || NENHUM);
  const [forma, setForma] = useState(venda?.forma_pagamento || NENHUM);
  const [entrada, setEntrada] = useState(
    venda?.valor_entrada != null ? String(venda.valor_entrada).replace('.', ',') : '',
  );
  const [maisAberto, setMaisAberto] = useState(
    Boolean(venda?.uf || venda?.forma_pagamento || venda?.valor_entrada),
  );
  const [continuar, setContinuar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [lancadasAgora, setLancadasAgora] = useState(0);
  const nrRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nrRef.current?.focus(); }, []);

  const valorNum = lerValorDigitado(valor);
  const entradaNum = entrada.trim() ? lerValorDigitado(entrada) : null;
  const nrLimpo = nr.trim();
  const donoDoNr = !editando || nrLimpo !== venda?.nr_documento
    ? nrsConhecidos.get(nrLimpo) ?? null
    : null;
  const entradaMaior = entradaNum !== null && valorNum !== null && entradaNum > valorNum;

  const opcoes = useMemo(() => {
    // Quem está sendo editado pode não estar mais na lista (desligado): entra
    // para o seletor não mostrar vazio.
    if (!venda || vendedores.some(v => v.id === venda.operador_id)) return vendedores;
    return [{ id: venda.operador_id, nome: venda.perfis?.nome ?? 'Vendedor atual', equipe: null }, ...vendedores];
  }, [vendedores, venda]);

  async function salvar() {
    if (!nrLimpo) { toast.error('Informe o NR do documento.'); nrRef.current?.focus(); return; }
    if (valorNum === null || valorNum <= 0) { toast.error('Informe o valor da venda.'); return; }
    if (entradaMaior) { toast.error('A entrada não pode ser maior que o valor total.'); return; }
    if (donoDoNr) { toast.error(`O NR ${nrLimpo} já está lançado (${donoDoNr}).`); return; }

    setSalvando(true);
    const r = await onSalvar({
      id: venda?.id ?? null,
      operadorId: operador,
      nrDocumento: nrLimpo,
      cliente: cliente.trim() || null,
      uf: uf === NENHUM ? null : uf,
      valorTotal: valorNum,
      valorEntrada: entradaNum,
      formaPagamento: forma === NENHUM ? null : forma,
      dataVenda: data || getTodayISO(),
    });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a venda.'); return; }

    if (editando) {
      toast.success('Venda corrigida.');
      onFechar();
      return;
    }

    onLancou?.();
    setLancadasAgora(n => n + 1);
    toast.success(`Venda ${nrLimpo} lançada — ${formatBRL(valorNum)}.`, {
      description: 'Quando o NR aparecer no relatório, ela é validada sozinha.',
    });
    if (!continuar) { onFechar(); return; }
    setNr(''); setValor(''); setCliente(''); setEntrada('');
    nrRef.current?.focus();
  }

  return (
    <tr className="border-b-2 border-primary/30 bg-primary/5">
      <td colSpan={colSpan} className="px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); void salvar(); }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              {editando ? <Save className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
              {editando ? `Corrigir a venda ${venda?.nr_documento}` : 'Nova venda'}
              {lancadasAgora > 0 && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                  {lancadasAgora} lançada{lancadasAgora > 1 ? 's' : ''} agora
                </span>
              )}
            </p>
            <div className="flex items-center gap-1">
              {!editando && onColar && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                  onClick={onColar} disabled={salvando}>
                  <ClipboardPaste className="h-3.5 w-3.5" /> Colar várias
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar"
                className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                onClick={onFechar} disabled={salvando}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className={cn(
            'grid grid-cols-2 gap-3',
            opcoes.length > 1 ? 'md:grid-cols-[150px_150px_minmax(0,1fr)_150px_200px]'
                              : 'md:grid-cols-[150px_150px_minmax(0,1fr)_150px]',
          )}>
            <div className="space-y-1">
              <Label htmlFor="venda-nr" className="text-xs">NR *</Label>
              <Input
                id="venda-nr" ref={nrRef} value={nr} inputMode="numeric" autoComplete="off"
                onChange={e => setNr(e.target.value.replace(/\s/g, ''))}
                placeholder="13073323"
                aria-invalid={Boolean(donoDoNr)}
                className={cn('h-8 font-mono text-xs', donoDoNr && 'border-destructive')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="venda-valor" className="text-xs">Valor *</Label>
              <Input
                id="venda-valor" value={valor} inputMode="decimal" autoComplete="off"
                onChange={e => setValor(e.target.value)}
                placeholder="5.572,00"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="col-span-2 space-y-1 md:col-span-1">
              <Label htmlFor="venda-cliente" className="text-xs">
                Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="venda-cliente" value={cliente} autoComplete="off"
                onChange={e => setCliente(e.target.value)}
                placeholder="Nome de quem comprou"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="venda-data" className="text-xs">Data da venda</Label>
              <Input
                id="venda-data" type="date" value={data} max={getTodayISO()}
                onChange={e => setData(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            {opcoes.length > 1 && (
              <div className="space-y-1">
                <Label htmlFor="venda-operador" className="text-xs">Vendedor</Label>
                <Select value={operador} onValueChange={setOperador}>
                  <SelectTrigger id="venda-operador" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opcoes.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}{o.equipe ? <span className="text-muted-foreground"> · {o.equipe}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {donoDoNr && (
            <p className="text-[11px] text-destructive">
              O NR {nrLimpo} já está na lista — {donoDoNr}. Cada NR entra uma vez só.
            </p>
          )}

          <button
            type="button" onClick={() => setMaisAberto(v => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={maisAberto}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', maisAberto && 'rotate-180')} />
            Estado, forma de pagamento e entrada <span className="font-normal">(opcional — o relatório preenche)</span>
          </button>

          {maisAberto && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-[150px_220px_150px]">
              <div className="space-y-1">
                <Label htmlFor="venda-uf" className="text-xs">Estado</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger id="venda-uf" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Não informado</SelectItem>
                    {ESTADOS_BRASIL.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="venda-forma" className="text-xs">Forma de pagamento</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger id="venda-forma" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Não informada</SelectItem>
                    {FORMAS_DE_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    {forma !== NENHUM && !FORMAS_DE_PAGAMENTO.includes(forma as typeof FORMAS_DE_PAGAMENTO[number]) && (
                      <SelectItem value={forma}>{forma}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="venda-entrada" className="text-xs">Entrada</Label>
                <Input
                  id="venda-entrada" value={entrada} inputMode="decimal" autoComplete="off"
                  onChange={e => setEntrada(e.target.value)}
                  placeholder="0,00" aria-invalid={entradaMaior}
                  className={cn('h-8 font-mono text-xs', entradaMaior && 'border-destructive')}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-primary/20 pt-3">
            <Button type="submit" size="sm" className="gap-2 shadow-sm" disabled={salvando || Boolean(donoDoNr) || entradaMaior}>
              <Save className="h-3.5 w-3.5" />
              {salvando ? 'Salvando…' : editando ? 'Salvar correção' : 'Lançar venda'}
              {!salvando && <kbd className="hidden rounded bg-primary-foreground/20 px-1 text-[10px] sm:inline">Enter</kbd>}
            </Button>
            {!editando && (
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox" checked={continuar}
                  onChange={e => setContinuar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Continuar lançando
              </label>
            )}
            {valorNum !== null && valorNum > 0 && (
              <span className="text-[11px] text-muted-foreground">
                Vale <strong className="font-mono text-foreground">{formatBRL(valorNum)}</strong> na meta
                {entradaNum ? <> — a entrada de {formatBRL(entradaNum)} não muda isso</> : null}
                {' '}quando for confirmada e assinada.
              </span>
            )}
          </div>

          {!editando && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Só <strong className="text-foreground">NR e valor</strong> são obrigatórios. Quando o NR
                aparecer no relatório importado, a venda é <strong className="text-foreground">validada
                sozinha</strong> — situação, assinatura, estado e pagamento chegam de lá.
              </span>
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
