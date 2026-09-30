/**
 * ModalEditarParcelasPP.tsx — editar as parcelas que JÁ EXISTEM de um acordo
 * parcelado da PaguePlay: situação, valor e data.
 *
 * Pedido de 30/09/2026. A PaguePlay não tem o editor da BookPlay (adicionar
 * parcela, trocar forma, entrada) e continua sem ter — o parcelamento dela
 * nasce da regra dos 40 % e não se remonta por aqui. O que faltava era
 * CORRIGIR o que já foi registrado:
 *
 *   • a situação de cada parcela: Pendente, Não Pago ou Pago;
 *   • o valor, quando o cliente pagou diferente do previsto;
 *   • o DIA DO PAGAMENTO da parcela paga.
 *
 * ## O dia do pagamento vale para o registro inteiro
 *
 * Na PaguePlay o recebimento é atribuído ao vencimento: marcar pago grava a
 * data escolhida em `data_pagamento` E em `vencimento` (`executarMarcarPago`).
 * Mudar o dia aqui faz o mesmo, para a parcela contar no dia (e no mês) certo
 * em todo lugar que lê. Duas parcelas pagas no mesmo dia são aceitas: é o que
 * acontece quando o cliente quita duas de uma vez.
 *
 * Parcela ainda não registrada (a que só existe como previsão) não aparece:
 * ela nasce pelo reagendamento, depois que a anterior é quitada.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { Layers, Save } from 'lucide-react';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { parseCurrencyInput, STATUS_LABELS_PAGUEPLAY, STATUS_COLORS } from '@/lib/index';
import {
  dataDaParcela, mudancasDaParcela, paraLinha, type LinhaParcelaPP,
} from '@/services/parcelasPP';
import { estadoFechamentoDaData, mensagemFechamento, mesDaData } from '@/lib/fechamentoMes';

interface Props {
  acordo: Acordo;
  open: boolean;
  onClose: () => void;
  /** Recebe as linhas gravadas, para o chamador atualizar o que mostra. */
  onSaved: (linhas: Acordo[]) => void;
}

const STATUS_ORDEM: Acordo['status'][] = ['verificar_pendente', 'nao_pago', 'pago'];

export function ModalEditarParcelasPP({ acordo, open, onClose, onSaved }: Props) {
  const { perfil } = useAuth();
  const [linhas, setLinhas] = useState<LinhaParcelaPP[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!acordo.acordo_grupo_id) { setLinhas([paraLinha(acordo)]); return; }
    setCarregando(true);
    supabase
      .from('acordos')
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(`Erro ao buscar parcelas: ${error.message}`);
        const regs = (error ? [] : (data ?? [])) as Acordo[];
        setLinhas((regs.length ? regs : [acordo]).map(paraLinha));
        setCarregando(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, acordo.id, acordo.acordo_grupo_id]);

  function alterar(id: string, campo: 'status' | 'valor' | 'data', valor: string) {
    setLinhas(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (campo !== 'status') return { ...l, [campo]: valor };
      const status = valor as Acordo['status'];
      // Virou pago agora: o dia sugerido é o do vencimento que estava ali;
      // deixou de ser pago: volta ao vencimento original, se havia um.
      const data = status === 'pago' || l.original.status !== 'pago'
        ? l.data
        : (l.original.vencimento ?? l.data);
      return { ...l, status, data };
    }));
  }

  async function salvar() {
    const alteradas = linhas
      .map(l => ({ l, upd: mudancasDaParcela(l) }))
      .filter(x => Object.keys(x.upd).length > 0);
    if (!alteradas.length) { onClose(); return; }

    for (const { l } of alteradas) {
      const v = parseCurrencyInput(l.valor);
      if (isNaN(v) || v <= 0) { toast.error(`Valor inválido na parcela ${l.numero}.`); return; }
      if (!l.data) {
        toast.error(l.status === 'pago'
          ? `Informe o dia do pagamento da parcela ${l.numero}.`
          : `Informe o vencimento da parcela ${l.numero}.`);
        return;
      }
      // Mesma trava da edição: o mês que perde e o que ganha precisam estar
      // abertos.
      for (const data of [dataDaParcela(l.original), l.data]) {
        if (estadoFechamentoDaData({ data, cargo: perfil?.perfil }).bloqueado) {
          toast.error(mensagemFechamento(mesDaData(data)));
          return;
        }
      }
    }

    setSalvando(true);
    try {
      const gravadas: Acordo[] = [];
      for (const { l, upd } of alteradas) {
        const { data, error } = await supabase
          .from('acordos')
          .update(upd)
          .eq('id', l.id)
          .select('*, perfis(id, nome, email, perfil, setor_id)')
          .single();
        if (error) {
          toast.error(`Erro na parcela ${l.numero}: ${error.message}`);
          if (gravadas.length) onSaved(gravadas);
          return;
        }
        const salva = (data ?? { ...l.original, ...upd }) as Acordo;
        gravadas.push(salva);

        // Espelha no par Direto↔Extra, como o resto das telas de parcela faz.
        if (salva.tipo_vinculo === 'extra' || salva.vinculo_operador_id) {
          await supabase.rpc('fn_sync_par_vinculo', {
            p_acordo_id:    salva.id,
            p_valor:        salva.valor,
            p_vencimento:   salva.vencimento,
            p_nome_cliente: salva.nome_cliente,
            p_tipo:         salva.tipo,
            p_whatsapp:     salva.whatsapp ?? null,
            p_parcelas:     salva.parcelas,
            p_status:       salva.status,
          });
        }
      }
      toast.success(`${gravadas.length} parcela(s) atualizada(s).`);
      onSaved(gravadas);
      onClose();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !salvando) onClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
        aria-describedby="modal-edit-parc-pp-desc"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-primary" />
            Editar parcelas
          </DialogTitle>
          <DialogDescription id="modal-edit-parc-pp-desc" className="text-xs">
            Situação, valor e data de cada parcela registrada. Na parcela paga, a data é o
            dia do pagamento — e vale para o acordo inteiro (recebimento, mês e relatórios).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 -mr-3 pr-3 py-1">
          {carregando && <div className="h-8 rounded bg-muted animate-pulse" />}
          {!carregando && linhas.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma parcela registrada.</p>
          )}

          {linhas.map(l => {
            const alterada = Object.keys(mudancasDaParcela(l)).length > 0;
            return (
              <div
                key={l.id}
                className={cn(
                  'grid grid-cols-[auto_1fr_1fr] sm:grid-cols-[auto_8.5rem_6.5rem_1fr] gap-2 items-end rounded-lg px-3 py-2 border bg-muted/30',
                  alterada ? 'border-primary/60 bg-primary/5' : 'border-border/40',
                )}
              >
                <span className="text-xs font-mono font-bold text-primary w-6 text-center self-center">{l.numero}</span>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Situação</Label>
                  <Select value={l.status} onValueChange={v => alterar(l.id, 'status', v)}>
                    <SelectTrigger className={cn('h-7 text-xs', STATUS_COLORS[l.status])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDEM.map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS_PAGUEPLAY[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    value={l.valor}
                    onChange={e => alterar(l.id, 'valor', e.target.value)}
                    inputMode="decimal"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <DatePickerField
                    value={l.data}
                    onChange={v => alterar(l.id, 'data', v)}
                    label={l.status === 'pago' ? 'Pago em' : 'Vencimento'}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={salvando} size="sm">Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || carregando} size="sm" className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {salvando ? 'Salvando...' : 'Salvar parcelas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
