/**
 * VerComissao — a comissão de uma pessoa, num Dialog.
 *
 * Abre pela linha do operador na aba Comissão da tela de Metas (a consulta da
 * liderança) e pelo «Ver comissão» do card do Dashboard (a própria pessoa). O
 * corpo é `ConteudoComissao` nos dois: as telas não podem contar a comissão de
 * jeitos diferentes.
 */
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatBRL } from '@/lib/money';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { ConteudoComissao } from './ConteudoComissao';

interface VerComissaoProps {
  aberto: boolean;
  onFechar: () => void;
  nome: string;
  /** `yyyy-MM`. */
  mes: string;
  isPaguePlay: boolean;
  /** Mês que já passou: «faltou», e não «faltam». */
  mesFechado: boolean;
  resultado: ResultadoComissao;
}

export function VerComissao({
  aberto, onFechar, nome, mes, isPaguePlay, mesFechado, resultado,
}: VerComissaoProps) {
  return (
    <Dialog open={aberto} onOpenChange={abrir => { if (!abrir) onFechar(); }}>
      {/* `max-w-4xl`: quatro faixas lado a lado com «A partir de R$ 1.974,70»
          numa linha só. Em `3xl` o valor não cabia e o rótulo quebrava. */}
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`Comissão — ${nome}`}</DialogTitle>
          <DialogDescription>
            {`${mesPorExtenso(mes)}${isPaguePlay ? ' · valores em H.O.' : ''} · realizado ${formatBRL(resultado.recebido)}`}
          </DialogDescription>
        </DialogHeader>
        <ConteudoComissao resultado={resultado} mesFechado={mesFechado} />
      </DialogContent>
    </Dialog>
  );
}
