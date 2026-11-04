/**
 * PixBarraLote — a barra de ação sobre os registros marcados na tabela
 * (líder+): copiar para pagar, aprovar, desaprovar, pagar e excluir.
 */
import { useState } from 'react';
import { Banknote, Check, Copy, Trash2, Undo2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/index';
import { copiarTexto } from '@/lib/clipboard';
import {
  PIX_AUTO_PCT_PADRAO, avaliarAcordoPix, excluirAcordoPix, formatarCopiaPix,
  formatarCopiaPixPorOperador, marcarComissaoPaga, separarParaCopiaPix, valorAPagarDe,
} from '@/services/pix_automatico.service';
import type { PixTela } from './usePixAutomatico';

export function PixBarraLote({ pix }: { pix: PixTela }) {
  const {
    perfil, podeAgirSobreOutros, podeAprovar, visiveis, selecionados, setSelecionados,
    pctPorSetor, quemExclui, carregar,
  } = pix;
  const [loteProcessando, setLoteProcessando] = useState(false);

  async function marcarPagosSelecionados(pago: boolean) {
    if (!perfil?.id) return;
    // Ao PAGAR, só faz sentido o que está aprovado — é o que o banco aceita.
    const alvos = visiveis.filter(i => selecionados.has(i.id)
      && (pago ? i.status === 'aprovado' && !i.pago : i.pago));
    if (alvos.length === 0) {
      toast.error(pago
        ? 'Nenhum acordo aprovado e não pago entre os selecionados.'
        : 'Nenhum acordo pago entre os selecionados.');
      return;
    }
    setLoteProcessando(true);
    try {
      const { ok, count, error } = await marcarComissaoPaga({
        ids: alvos.map(a => a.id),
        pago,
        responsavelId: perfil.id,
        responsavelNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao marcar pagamento: ' + error); return; }
      const deFora = alvos.length - count;
      toast.success(`${count} comissão(ões) ${pago ? 'marcada(s) como paga(s)' : 'desmarcada(s)'}.`
        + (deFora > 0
          ? ` ${deFora} já tinha(m) sido ${pago ? 'paga(s)' : 'desmarcada(s)'} por outra pessoa e ficou(aram) como estava(m).`
          : ''));
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  async function copiarSelecionados() {
    // `valorAPagarDe`, e não `comissaoDe`: quem recebe este texto vai PAGAR o
    // total. Deixar a correção de fora aqui seria mandar o Pix errado de novo,
    // que é exatamente o que ela existe para consertar.
    const marcados = visiveis.filter(i => selecionados.has(i.id));
    if (marcados.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }
    // Já pago não entra no texto — ver `separarParaCopiaPix`.
    const { copiar, porOperador, jaPagos, foraDosAprovados } = separarParaCopiaPix(marcados);
    if (copiar.length === 0) {
      toast.error('Todos os selecionados já foram pagos — nada a copiar.');
      return;
    }
    const alvos = copiar.map(i => ({
      acordo: i,
      comissao: valorAPagarDe(i, pctPorSetor),
      ajuste: i.ajuste_valor,
    }));
    // Só NR e comissão, com o TOTAL somado no fim quando há mais de um — ver
    // `formatarCopiaPix`. Somar isso à mão no WhatsApp é onde o erro entrava.
    // Aprovado a pagar é o que vai ser pago, e o Pix sai por operador: aí o
    // texto vem agrupado, com o nome e o total de cada um.
    const total = alvos.reduce((s, a) => s + a.comissao, 0);
    const deFora = [
      jaPagos > 0 && `${jaPagos} já pago${jaPagos !== 1 ? 's' : ''}`,
      foraDosAprovados > 0 && `${foraDosAprovados} não aprovado${foraDosAprovados !== 1 ? 's' : ''}`,
    ].filter(Boolean).join(' e ');
    await copiarTexto(
      porOperador ? formatarCopiaPixPorOperador(alvos) : formatarCopiaPix(alvos),
      (alvos.length === 1
        ? 'Acordo copiado para encaminhar.'
        : `${alvos.length} acordos copiados · total ${formatCurrency(total)}.`)
        + (deFora ? ` Ficaram de fora: ${deFora}.` : ''),
    );
  }

  // Avalia (aprova/desaprova) em lote — só pendentes selecionados.
  async function avaliarSelecionados(aprovar: boolean) {
    if (!perfil?.id) return;
    const alvos = visiveis.filter(i => selecionados.has(i.id) && i.status === 'pendente');
    if (alvos.length === 0) { toast.error('Nenhum acordo pendente selecionado.'); return; }
    setLoteProcessando(true);
    try {
      // Conta o que de fato gravou: a linha que outro líder decidiu enquanto a
      // seleção estava aberta volta zero linhas e não pode entrar no total.
      let feitos = 0, jaDecididos = 0, falhas = 0;
      for (const item of alvos) {
        const pctDaLinha = item.setor_id != null
          ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO)
          : PIX_AUTO_PCT_PADRAO;
        const r = await avaliarAcordoPix({
          id: item.id, aprovar, pctAtual: pctDaLinha,
          avaliadorId: perfil.id, avaliadorNome: perfil.nome ?? perfil.email ?? '—',
        });
        if (r.ok) feitos += 1;
        else if (r.jaDecidido) jaDecididos += 1;
        else falhas += 1;
      }
      const resto = [
        jaDecididos > 0 ? `${jaDecididos} já tinha(m) sido avaliado(s) por outra pessoa` : '',
        falhas > 0 ? `${falhas} com erro` : '',
      ].filter(Boolean).join(', ');
      const msg = `${feitos} acordo(s) ${aprovar ? 'aprovado(s)' : 'desaprovado(s)'}.`
        + (resto ? ` ${resto}.` : '');
      if (feitos === 0) toast.error(msg); else toast.success(msg);
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  /**
   * Exclui (lixeira) em lote os selecionados.
   *
   * As linhas já pagas ficam de fora — o banco as recusa uma a uma
   * (`trg_pix_a_impede_pago`) e o laço seguiria em frente sem contar direito.
   * O aviso diz quantas ficaram e por quê, senão o líder vê "3 excluídos" numa
   * seleção de 5 e não sabe o que aconteceu com as outras duas.
   */
  async function excluirSelecionados() {
    const marcados = visiveis.filter(i => selecionados.has(i.id));
    if (marcados.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }

    const alvos = marcados.filter(i => !i.pago);
    const pagos = marcados.length - alvos.length;
    if (alvos.length === 0) {
      toast.error(`${pagos} acordo(s) já pago(s) — desfaça o pagamento antes de excluir.`);
      return;
    }

    setLoteProcessando(true);
    try {
      let excluidos = 0;
      for (const item of alvos) {
        const { ok } = await excluirAcordoPix(item.id, quemExclui);
        if (ok) excluidos++;
      }
      toast.success(
        `${excluidos} registro(s) na lixeira.`
        + (pagos > 0 ? ` ${pagos} já pago(s) foram mantidos.` : ''),
      );
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  if (!podeAgirSobreOutros || selecionados.size === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
      <span className="text-xs font-medium text-primary mr-1">{selecionados.size} selecionado(s)</span>
      <Button size="sm" onClick={copiarSelecionados} disabled={loteProcessando} className="h-7 gap-1.5 text-xs">
        <Copy className="w-3.5 h-3.5" /> Copiar
      </Button>
      {podeAprovar && (
        <>
          <button onClick={() => avaliarSelecionados(true)} disabled={loteProcessando}
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" /> Aprovar
          </button>
          <button onClick={() => avaliarSelecionados(false)} disabled={loteProcessando}
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
            <XCircle className="w-3.5 h-3.5" /> Desaprovar
          </button>
        </>
      )}
      <button onClick={() => marcarPagosSelecionados(true)} disabled={loteProcessando}
        title="Marcar a comissão dos aprovados como paga"
        className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-50">
        <Banknote className="w-3.5 h-3.5" /> Marcar pago
      </button>
      <button onClick={() => marcarPagosSelecionados(false)} disabled={loteProcessando}
        title="Desfazer o pagamento dos selecionados"
        className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-muted-foreground border border-border hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
        <Undo2 className="w-3.5 h-3.5" /> Desfazer pago
      </button>
      <button onClick={excluirSelecionados} disabled={loteProcessando}
        className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-muted-foreground border border-border hover:text-destructive hover:bg-destructive/10 disabled:opacity-50">
        <Trash2 className="w-3.5 h-3.5" /> Excluir
      </button>
      <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())} disabled={loteProcessando}
        className="h-7 gap-1.5 text-xs text-muted-foreground ml-auto">
        <X className="w-3.5 h-3.5" /> Limpar
      </Button>
    </div>
  );
}
