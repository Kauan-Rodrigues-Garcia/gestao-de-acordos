/**
 * PixAbaPremiacao — a sub-aba «Premiação dobrada», só de quem vê o Pix dos
 * outros (o operador vê a dobra dele em Registros). Em cima, a dobra de quem
 * está olhando, se ele também fecha acordo; embaixo, quem dobrou e quanto
 * falta pagar.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { marcarPremiacaoPaga } from '@/services/pix_automatico.service';
import { PixComissaoDobrada } from './PixComissaoDobrada';
import { PixPainelPremiacoes } from './PixPainelPremiacoes';
import type { PixTela } from './usePixAutomatico';

export function PixAbaPremiacao({ pix }: { pix: PixTela }) {
  const {
    empresa, mes, loading, dobra, bonusMeta, visiveis, pctPorSetor, metaPorOperador,
    metaPorSetor, pagamentosPremiacao, setPagamentosPremiacao, podeMarcarPremiacaoPaga,
    fotoPorOperador, chaveAba,
  } = pix;
  const [alterandoPremiacaoId, setAlterandoPremiacaoId] = useState<string | null>(null);

  /**
   * Marca a premiação do mês como paga — e grava QUANTO saiu.
   *
   * O valor vem do painel: é o "falta pagar" daquela pessoa no instante do
   * clique. Antes só o booleano era gravado, e a linha continuava mostrando
   * "falta R$ X" ao lado de "Pago".
   */
  async function alternarPremiacaoPaga(
    operadorId: string, pago: boolean, valorPago: number,
  ) {
    if (!empresa?.id || !podeMarcarPremiacaoPaga) return;
    setAlterandoPremiacaoId(operadorId);
    try {
      const resultado = await marcarPremiacaoPaga({
        empresaId: empresa.id,
        operadorId,
        mes,
        pago,
        valorPago: pago ? valorPago : null,
      });
      if (!resultado.ok || !resultado.pagamento) {
        toast.error(resultado.error ?? 'Não foi possível alterar o pagamento da premiação.');
        return;
      }
      setPagamentosPremiacao(atual => [
        ...atual.filter(x => x.operador_id !== operadorId),
        resultado.pagamento!,
      ]);
      toast.success(pago
        ? `Premiação marcada como paga${valorPago > 0 ? ` — ${formatCurrency(valorPago)}` : ''}.`
        : 'Pagamento da premiação desmarcado.');
    } finally {
      setAlterandoPremiacaoId(null);
    }
  }

  return (
    loading ? (
      <div className="space-y-2.5">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
      </div>
    ) : (
    <div className="space-y-4">
      {dobra.feitos > 0 && (
        <PixComissaoDobrada dobra={dobra} projecao={bonusMeta?.projecao ?? null} />
      )}
      <PixPainelPremiacoes
        itens={visiveis}
        pctPorSetor={pctPorSetor}
        mes={mes}
        metaPorOperador={metaPorOperador}
        metaPorSetor={metaPorSetor}
        pagamentos={pagamentosPremiacao}
        podeMarcarPago={podeMarcarPremiacaoPaga}
        alterandoOperadorId={alterandoPremiacaoId}
        fotoPorOperador={fotoPorOperador}
        rotuloMes={rotuloDoMes(mes)}
        // Busca e recorte sobrevivem a sair da aba e voltar.
        chaveEstado={`${chaveAba}|premiacoes`}
        onMarcarPago={alternarPremiacaoPaga}
      />
    </div>
    )
  );
}
