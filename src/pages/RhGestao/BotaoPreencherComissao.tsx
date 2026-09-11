/**
 * BotaoPreencherComissao — «Preencher com a comissão», no cabeçalho da equipe.
 *
 * Só aparece quando há o que escrever: linha de comissão, ainda editável, com a
 * comissão calculada diferente do valor lançado. Um botão que não faria nada é
 * um controle que promete e não entrega.
 */
import { useMemo } from 'react';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  planoDePreenchimento, type LinhaRh, type PlanoPreenchimento, type SugestaoComissao,
} from '@/services/rh/rhComissao';

interface BotaoPreencherComissaoProps {
  linhas: readonly LinhaRh[];
  comissoes: Readonly<Record<string, SugestaoComissao>>;
  disabled: boolean;
  onPreencher: (plano: PlanoPreenchimento) => void;
}

export default function BotaoPreencherComissao({
  linhas, comissoes, disabled, onPreencher,
}: BotaoPreencherComissaoProps) {
  const plano = useMemo(() => planoDePreenchimento(linhas, comissoes), [linhas, comissoes]);
  const n = plano.preencher.length;
  if (n === 0) return null;

  return (
    <Button
      size="sm" variant="outline" className="h-7 text-[11px] gap-1"
      disabled={disabled}
      onClick={() => onPreencher(plano)}
      title={`${n} linha${n !== 1 ? 's' : ''} com a comissão calculada do mês de apuração`}
    >
      <Coins className="w-3 h-3" /> Preencher com a comissão
    </Button>
  );
}
