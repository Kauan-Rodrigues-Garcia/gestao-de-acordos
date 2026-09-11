/**
 * VerComissao — a comissão de uma pessoa, num Dialog.
 *
 * É a consulta da liderança, aberta pela linha do operador na aba Comissão da
 * tela de Metas. O corpo é `ConteudoComissao`, o mesmo do painel lateral do
 * operador: as duas telas não podem contar a comissão de jeitos diferentes.
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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
