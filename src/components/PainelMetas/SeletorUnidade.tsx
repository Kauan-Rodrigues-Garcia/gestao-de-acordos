/**
 * SeletorUnidade — H.O. ⇄ Bruto, na faixa "Dados Analíticos".
 *
 * Fica ao lado do seletor de mês de propósito: os dois recortam o MESMO painel,
 * e separá-los faria o usuário procurar em dois cantos da tela por controles da
 * mesma coisa.
 *
 * Substitui o alternador que existia só para a linha verde do `ChartsSection`.
 * Aquele governava um gráfico enquanto os cards ao lado seguiam em outra
 * unidade — dois "H.O." na mesma tela querendo dizer coisas diferentes.
 *
 * Só faz sentido na PaguePlay: a BookPlay tem `total_ho` zerado em toda linha
 * do analítico, e alternar entre um número e zero não é uma escolha.
 */

import { rotuloUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import { cn } from '@/lib/utils';
import { useHoPercentual, rotuloHoPercentual } from '@/lib/hoPercentual';

const OPCOES: UnidadeValor[] = ['ho', 'bruto'];

/** O percentual do H.O. é configurável (aba Metas) — o título acompanha. */
function titulo(op: UnidadeValor, ho: number): string {
  return op === 'ho'
    ? `H.O. — a parte que fica na Pague Play (${rotuloHoPercentual(ho)} do recebido)`
    : 'Bruto — o valor cheio recebido, antes do repasse';
}

interface SeletorUnidadeProps {
  valor: UnidadeValor;
  onChange: (u: UnidadeValor) => void;
}

export function SeletorUnidade({ valor, onChange }: SeletorUnidadeProps) {
  const ho = useHoPercentual();
  return (
    <div
      role="group"
      aria-label="Unidade dos valores"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
    >
      {OPCOES.map(op => {
        const ativo = valor === op;
        return (
          <button
            key={op}
            type="button"
            onClick={() => onChange(op)}
            aria-pressed={ativo}
            title={titulo(op, ho)}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
              ativo
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {rotuloUnidade(op)}
          </button>
        );
      })}
    </div>
  );
}

export default SeletorUnidade;
