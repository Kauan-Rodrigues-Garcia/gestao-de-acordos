/**
 * IndicadoresDesafio — a linha de números do desafio.
 *
 * Quatro cartões curtos entre o Hero e o ranking: quanto entrou, quantos já
 * bateram a meta, quanto falta no total e a média por participante. Servem para
 * ler a campanha inteira sem percorrer o ranking.
 *
 * Nenhum deles é conta nova: todos saem do `ResultadoDesafio`, que por sua vez
 * saiu de `analitico_recebimentos`.
 */
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoDesafio } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';

interface Props {
  resultado: ResultadoDesafio;
  tema: EstiloTema;
  carregando?: boolean;
}

export function IndicadoresDesafio({ resultado, tema, carregando }: Props) {
  const bateram = resultado.individual.filter(i => i.bateuMeta).length;
  const faltaTotal = resultado.individual.reduce((s, i) => s + i.falta, 0);
  const media = resultado.totalParticipantes
    ? resultado.totalRecebido / resultado.totalParticipantes
    : 0;

  const cartoes = [
    { rotulo: 'Recebido no período', valor: resultado.totalRecebido, destacar: true },
    { rotulo: 'Falta para os desafios', valor: faltaTotal, destacar: false },
    { rotulo: 'Média por participante', valor: media, destacar: false },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map(c => (
        <div key={c.rotulo} className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {c.rotulo}
          </p>
          <ValorAnimado
            valor={c.valor}
            formatar={formatBRL}
            carregando={carregando}
            className={cn('mt-1 block text-lg font-bold', c.destacar ? tema.destaque : 'text-foreground')}
            classeSubindo="text-emerald-500"
          />
        </div>
      ))}

      {/* O quarto não é dinheiro: é contagem, e por isso não passa pelo
          `ValorAnimado`, que formata em reais. */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Concluíram o desafio
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
          {bateram}
          <span className="text-sm font-medium text-muted-foreground">
            {' '}de {resultado.totalParticipantes}
          </span>
        </p>
      </div>
    </div>
  );
}

export default IndicadoresDesafio;
