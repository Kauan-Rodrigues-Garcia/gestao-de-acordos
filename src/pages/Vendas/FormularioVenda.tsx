/**
 * FormularioVenda — lançar ou corrigir uma venda.
 *
 * ## O que NÃO se digita aqui
 *
 * Situação e assinatura. Elas são o ato do líder (`fn_venda_confirmar`), e
 * deixá-las neste formulário faria `editar_vendas` no operador valer, na
 * prática, o direito de dar a própria venda como confirmada.
 *
 * Setor e equipe também não: saem do cadastro do operador, no banco. Pedi-los
 * aqui criaria uma segunda verdade sobre onde a pessoa trabalha.
 *
 * ## A entrada não muda o valor
 *
 * Venda de R$ 5.000,00 com R$ 2.000,00 pagos vale **5.000 na meta**. A entrada
 * é registro de quanto entrou na hora, e o formulário diz isso em voz alta —
 * porque é a dúvida que a planilha antiga deixava em aberto.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ESTADOS_BRASIL, getTodayISO } from '@/lib/index';
import { parseBRL, formatBRL } from '@/lib/money';
import type { Venda } from '@/services/vendas/vendas.service';
import type { EntradaVenda } from '@/services/vendas/vendas.service';

/** O `Select` do shadcn recusa `value=""`; «sem estado» precisa de um valor. */
const SEM_UF = '__sem_uf__';

const FORMAS = [
  'Cartão padrão', 'Cartão recorrente', 'PIX', 'PIX automático',
  'Boleto bancário', 'Cartão + boleto', 'Carteira',
] as const;

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Preenchida = correção; ausente = lançamento novo. */
  venda?: Venda | null;
  /** Quem vende. Hoje é sempre quem está logado — o líder lança pelo operador na Fase 4. */
  operadorId: string;
  onSalvar: (entrada: Omit<EntradaVenda, 'empresaId'>) => Promise<{ ok: boolean; erro: string | null }>;
}

export function FormularioVenda({ aberto, onFechar, venda, operadorId, onSalvar }: Props) {
  const [nr, setNr] = useState('');
  const [cliente, setCliente] = useState('');
  const [uf, setUf] = useState<string>(SEM_UF);
  const [valor, setValor] = useState('');
  const [entrada, setEntrada] = useState('');
  const [forma, setForma] = useState<string>(SEM_UF);
  const [data, setData] = useState(getTodayISO());
  const [salvando, setSalvando] = useState(false);

  // Reabrir o diálogo tem de trazer o estado certo: em branco para lançar, com
  // os valores da venda para corrigir. Sem isto, o formulário guarda o que foi
  // digitado da última vez e o operador lança a venda de outro cliente.
  useEffect(() => {
    if (!aberto) return;
    setNr(venda?.nr_documento ?? '');
    setCliente(venda?.cliente ?? '');
    setUf(venda?.uf?.trim() || SEM_UF);
    setValor(venda ? String(venda.valor_total) : '');
    setEntrada(venda?.valor_entrada != null ? String(venda.valor_entrada) : '');
    setForma(venda?.forma_pagamento || SEM_UF);
    setData(venda?.data_venda?.slice(0, 10) ?? getTodayISO());
  }, [aberto, venda]);

  const valorNum = parseBRL(valor);
  const entradaNum = entrada.trim() === '' ? null : parseBRL(entrada);
  const entradaMaior = entradaNum !== null && entradaNum > valorNum;

  async function salvar() {
    if (!nr.trim()) { toast.error('Informe o NR do documento.'); return; }
    if (!(valorNum > 0)) { toast.error('Informe o valor total da venda.'); return; }
    if (entradaMaior) { toast.error('A entrada não pode ser maior que o valor total.'); return; }

    setSalvando(true);
    const r = await onSalvar({
      id: venda?.id ?? null,
      operadorId,
      nrDocumento: nr.trim(),
      cliente: cliente.trim() || null,
      uf: uf === SEM_UF ? null : uf,
      valorTotal: valorNum,
      valorEntrada: entradaNum,
      formaPagamento: forma === SEM_UF ? null : forma,
      dataVenda: data,
    });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a venda.'); return; }
    toast.success(venda ? 'Venda corrigida.' : 'Venda lançada. Agora ela espera o líder.');
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{venda ? 'Corrigir venda' : 'Lançar venda'}</DialogTitle>
          <DialogDescription>
            {venda
              ? 'Situação e assinatura não se corrigem aqui — quem decide isso é o líder.'
              : 'A venda entra como «em aberto» e espera o líder confirmar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="venda-nr">NR do documento</Label>
            <Input
              id="venda-nr" value={nr} inputMode="numeric"
              onChange={e => setNr(e.target.value)}
              placeholder="13073323"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="venda-cliente">Cliente</Label>
            <Input
              id="venda-cliente" value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Nome de quem comprou"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-valor">Valor total</Label>
            <Input
              id="venda-valor" value={valor} inputMode="decimal"
              onChange={e => setValor(e.target.value)}
              placeholder="5.572,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-entrada">Entrada</Label>
            <Input
              id="venda-entrada" value={entrada} inputMode="decimal"
              onChange={e => setEntrada(e.target.value)}
              placeholder="opcional"
              aria-invalid={entradaMaior}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-data">Data da venda</Label>
            <Input
              id="venda-data" type="date" value={data}
              onChange={e => setData(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-uf">Estado</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger id="venda-uf"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_UF}>Sem estado</SelectItem>
                {ESTADOS_BRASIL.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="venda-forma">Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger id="venda-forma"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_UF}>Não informada</SelectItem>
                {FORMAS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {valorNum > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {entradaMaior
              ? 'A entrada não pode ser maior que o valor total.'
              : <>Conta <strong className="text-foreground">{formatBRL(valorNum)}</strong> para
                 a meta{entradaNum ? <> — a entrada de {formatBRL(entradaNum)} não muda esse
                 valor</> : null}.</>}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || entradaMaior}>
            {salvando ? 'Salvando…' : venda ? 'Salvar correção' : 'Lançar venda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
