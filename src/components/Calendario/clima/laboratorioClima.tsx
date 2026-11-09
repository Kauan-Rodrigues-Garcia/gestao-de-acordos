/**
 * O tempo no laboratório do Calendário (`lab-calendario.html`), sem rede: uma
 * previsão de exemplo e a galeria com todos os desenhos, para conferir cada
 * personagem e cada cenário por print.
 *
 *   ?clima=chuva&noite=1&estacao=inverno&chao=cidade&temp=31&galeria=1
 */
import type { CondicaoClima, Estacao, Previsao } from '@/lib/clima';
import { rotuloDaCondicao } from '@/lib/clima';
import { CHAOS, CenarioDoTempo, type Chao } from './cenarios';
import { PersonagemDoTempo, type CoresClima } from './personagens';

export const CONDICOES: readonly CondicaoClima[] = [
  'limpo', 'poucas_nuvens', 'nublado', 'neblina', 'garoa', 'chuva', 'chuva_forte', 'tempestade',
];
export const ESTACOES: readonly Estacao[] = ['verao', 'outono', 'inverno', 'primavera'];
export { CHAOS };
export type { Chao };

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Hoje com a condição escolhida e os dias seguintes passando por todas as outras. */
export function previsaoDeExemplo(condicao: CondicaoClima, noite: boolean, temp: number, hojeISO: string): Previsao {
  const ordem = CONDICOES.filter(c => c !== condicao);
  return {
    agora: { temp, sensacao: temp + 2, condicao, noite, umidade: 58, vento: 11 },
    dias: [
      { data: hojeISO, condicao, max: temp + 3, min: temp - 9, chuvaMm: condicao.includes('chuva') || condicao === 'tempestade' ? 12.4 : 0 },
      ...[1, 2, 3, 4, 5].map(i => ({
        data: somarDias(hojeISO, i), condicao: ordem[(i - 1) % ordem.length], max: temp + 3 - i, min: temp - 10 + (i % 2), chuvaMm: 0,
      })),
    ],
  };
}

/** Todos os personagens (dia e noite) e todos os cenários de uma estação. */
export function GaleriaDoTempo({ cores, estacao, variante }: { cores: CoresClima; estacao: Estacao; variante: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
        {CONDICOES.flatMap(c => [false, true].map(noite => (
          <figure key={`${c}-${noite}`} style={{ margin: 0, textAlign: 'center', fontSize: 12 }}>
            <PersonagemDoTempo condicao={c} noite={noite} estacao={estacao} variante={variante} temp={33} cores={cores} />
            <figcaption>{rotuloDaCondicao(c, noite)}{noite ? ' · noite' : ''}</figcaption>
          </figure>
        )))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {CHAOS.flatMap(chao => CONDICOES.map(c => (
          <figure key={`${chao}-${c}`} style={{ margin: 0, fontSize: 12 }}>
            <div style={{ aspectRatio: '2 / 1', border: `2.5px solid ${cores.ol}`, borderRadius: 10, overflow: 'hidden' }}>
              <CenarioDoTempo condicao={c} noite={c === 'limpo' && chao === 'cidade'} estacao={estacao} chao={chao} variante={variante} temp={30} cores={cores} className="block h-full w-full" />
            </div>
            <figcaption>{chao} · {rotuloDaCondicao(c, false)}</figcaption>
          </figure>
        )))}
      </div>
    </div>
  );
}
