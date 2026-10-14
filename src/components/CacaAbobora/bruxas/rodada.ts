/**
 * rodada.ts — da rodada do banco (`../caca.ts`) para o que a faixa das bruxas
 * diz (`faixa.ts`). Puro: testado em `bruxas.test.ts`.
 */
import { nomeCurto, type RodadaAbobora } from '../caca';
import { bruxaDaRodada } from './arte';
import type { DadosFaixa } from './faixa';

export function dadosDaRodada(r: RodadaAbobora): DadosFaixa {
  return {
    nome: nomeCurto(r.achada_por_nome),
    foto: r.achada_por_foto,
    bruxa: bruxaDaRodada(r),
    morte: r.tiro ?? (r.headshot ? 'cabeca' : 'corpo'),
    ms: r.ms,
    rapida: r.mais_rapida_do_dia,
    hsRapido: r.headshot_mais_rapido_do_dia,
    dobrado: r.dobrado,
  };
}
