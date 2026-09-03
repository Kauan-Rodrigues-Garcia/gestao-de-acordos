/**
 * ArteDesafio — o cartaz da campanha, do tamanho que ele é.
 *
 * ## Por que ela tem um bloco só dela
 *
 * Porque é uma peça de comunicação, não um enfeite de cabeçalho. A arte que o
 * designer fez tem texto, prêmio e regra desenhados nela; espremê-la atrás do
 * nome da campanha — que foi o que aconteceu quando havia uma imagem só —
 * apaga justamente o que ela veio dizer.
 *
 * Aqui ela aparece inteira por padrão (`conter`), com o fundo neutro cobrindo
 * a margem que sobra. Quem preferir o corte troca na configuração.
 *
 * ## Some quando não existe
 *
 * A arte é opcional. Sem ela, a tela do desafio é a de sempre: Hero,
 * indicadores, pódio, ranking.
 */
import { cn } from '@/lib/utils';
import type { Desafio } from '@/services/desafios/types';

export interface ArteDesafioProps {
  desafio: Desafio;
}

export function ArteDesafio({ desafio }: ArteDesafioProps) {
  if (!desafio.arteUrl) return null;

  const inteira = desafio.visual.ajusteArte !== 'cobrir';

  return (
    <figure className={cn(
      'overflow-hidden rounded-xl border border-border',
      // Com a arte inteira sobra margem dos lados de um cartaz vertical, e ela
      // não pode ser um buraco transparente no meio da página.
      inteira && 'bg-muted/40',
    )}>
      <img
        src={desafio.arteUrl}
        alt={`Arte de divulgação — ${desafio.nome}`}
        // Teto de altura para que um cartaz muito vertical não empurre o
        // ranking para fora da primeira tela.
        className={cn(
          'max-h-[28rem] w-full',
          inteira ? 'object-contain' : 'object-cover',
        )}
        loading="lazy"
      />
    </figure>
  );
}
