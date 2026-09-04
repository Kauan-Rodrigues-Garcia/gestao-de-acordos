/**
 * IndicadoresDesafio — a linha de números do desafio.
 *
 * Quatro cartões curtos entre o Hero e o ranking, para ler a campanha inteira
 * sem percorrer o ranking. Nenhum deles é conta nova: todos saem do
 * `ResultadoDesafio`, que por sua vez saiu de `analitico_recebimentos`.
 *
 * ## Duas campanhas diferentes pedem quatro números diferentes
 *
 * Numa campanha de BATER META, a pergunta é «quanto entrou e quantos já
 * chegaram»: dinheiro, falta, média e concluíram.
 *
 * Numa corrida de PROJEÇÃO, os quatro mentem. «Concluíram» conta gente que não
 * concluiu nada — passar de 100% hoje não garante o mês, porque o esperado
 * sobe todo dia útil. «Falta para os desafios» soma faltas de metas que vão
 * mudar amanhã. E a «média por participante» em reais junta equipe de R$ 20.000
 * com equipe de R$ 210.000 num número que não descreve ninguém.
 *
 * Então a corrida de projeção mostra o que ela de fato disputa: a melhor
 * projeção, a média DAS PROJEÇÕES e quantas equipes estão no ritmo. O dinheiro
 * fica num cartão só, e sem destaque.
 */
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import type { ResultadoDesafio } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { percentualCheio } from './tema';

interface Props {
  resultado: ResultadoDesafio;
  tema: EstiloTema;
  carregando?: boolean;
  /** Ver o cabeçalho: a corrida de projeção mostra outros quatro números. */
  corridaDeProjecao?: boolean;
}

export function IndicadoresDesafio({ resultado, tema, carregando, corridaDeProjecao }: Props) {
  if (corridaDeProjecao) return <IndicadoresProjecao resultado={resultado} tema={tema} />;

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

/** Os quatro números de uma corrida de projeção. */
function IndicadoresProjecao({ resultado, tema }: { resultado: ResultadoDesafio; tema: EstiloTema }) {
  // Só quem tem meta entra: quem não tem não está em 0% da projeção — está sem
  // projeção, e misturar os dois puxaria a média para baixo com uma ausência.
  const comMeta = resultado.individual.filter(i => i.meta !== null && i.meta > 0);
  const melhor  = comMeta[0] ?? null;   // a lista já vem ordenada pelo critério
  const media   = comMeta.length
    ? comMeta.reduce((s, i) => s + i.progresso, 0) / comMeta.length
    : 0;
  const noRitmo = comMeta.filter(i => i.progresso >= 100).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Melhor projeção
        </p>
        <p className={cn('mt-1 text-lg font-bold tabular-nums', tema.destaque)}>
          {melhor ? percentualCheio(melhor.progresso) : '—'}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {melhor ? melhor.pessoa.nome : 'sem participante com meta'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Projeção média
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
          {comMeta.length ? percentualCheio(media) : '—'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {comMeta.length} de {resultado.totalParticipantes} com meta
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          No ritmo hoje
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
          {noRitmo}
          <span className="text-sm font-medium text-muted-foreground"> de {comMeta.length}</span>
        </p>
        {/* «No ritmo», e não «concluíram»: é uma foto de hoje, e amanhã o
            esperado sobe. Ninguém conclui uma corrida antes da linha. */}
        <p className="text-[11px] text-muted-foreground">acima de 100% da projeção</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Recebido no período
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
          {formatBRL(resultado.totalRecebido)}
        </p>
        <p className="text-[11px] text-muted-foreground">não decide a disputa</p>
      </div>
    </div>
  );
}

export default IndicadoresDesafio;
