/**
 * Gente de mentira para testar os quebra-nozes sem o banco: rostos desenhados
 * e uma lista de destaques. Usa o laboratório (`laboratorio.tsx`) e a chamada
 * de teste da prévia (`sistema.tsx`), enquanto os destaques de verdade não vêm.
 */
import type { Destaque } from './diretor';
import type { Cidade } from './elenco';

/** Um rosto de exemplo, desenhado, para ver a foto no lugar sem precisar do banco. */
export function rostoDeExemplo(pele: string, cabelo: string, fundo: string, comprido = false): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${fundo}"/>`
    + `<path d="M12 100 Q14 74 50 72 Q86 74 88 100Z" fill="#3A4A63"/>`
    + (comprido ? `<path d="M22 44 Q20 16 50 14 Q80 16 78 44 L82 84 Q66 78 64 60 H36 Q34 78 18 84Z" fill="${cabelo}"/>` : '')
    + `<rect x="42" y="62" width="16" height="16" rx="6" fill="${pele}"/><ellipse cx="50" cy="44" rx="23" ry="27" fill="${pele}"/>`
    + `<path d="M27 40 Q26 16 50 15 Q74 16 73 40 Q66 26 50 27 Q34 26 27 40Z" fill="${cabelo}"/>`
    + `<circle cx="40.5" cy="45" r="2.8" fill="#23262E"/><circle cx="59.5" cy="45" r="2.8" fill="#23262E"/>`
    + `<path d="M34.5 38.5 q6 -3.6 11 0 M54.5 38.5 q6 -3.6 11 0" stroke="${cabelo}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    + `<path d="M40 56.5 Q50 65 60 56.5" stroke="#8A3A32" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    + `<path d="M49 47 q-2.4 5 1.6 6" stroke="#B5805C" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ROSTOS_DE_EXEMPLO = {
  a: rostoDeExemplo('#E8B990', '#3B2B22', '#CFE0F2'),
  jessica: rostoDeExemplo('#F0C7A6', '#5A3524', '#F2DCE2', true),
  robson: rostoDeExemplo('#C9946A', '#1F1A18', '#D9EBDD'),
};

const SETORES: Record<Cidade, readonly string[]> = {
  marilia: ['Play Mix Marília', 'Play Night', 'Marília Digital', 'Play 4'],
  birigui: ['Play 1', 'Play 2', 'Play 5', 'Playmix', 'Conecta Play', 'Receptivo'],
};
const NOMES = ['Camila Souza', 'João Pedro', 'Larissa Lima', 'Rafael Costa', 'Bianca Alves', 'Thiago Rocha', 'Marina Dias', 'Felipe Nunes'];
const PELES = ['#E8B990', '#C9946A', '#F0C7A6', '#A9744C'];
const CABELOS = ['#3B2B22', '#1F1A18', '#7A4A22', '#B98522'];

export function destaquesDeExemplo(cidade: Cidade): Destaque[] {
  return SETORES[cidade].map((setor, i) => ({
    setor,
    nome: NOMES[(i * 3 + (cidade === 'marilia' ? 1 : 0)) % NOMES.length],
    foto: i === 2 ? null : rostoDeExemplo(PELES[i % 4], CABELOS[(i + 1) % 4], '#E3E9F1', i % 2 === 0),
    feito: `${14 - i} acordos`,
    meu: i === 1,
  }));
}
