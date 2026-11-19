import { describe, expect, it } from 'vitest';
import { montarSetorNoDesafio } from './equipeNoDesafio';

// Novembro/2026 com Finados e a Consciência Negra: 19 dias úteis.
const FERIADOS = ['2026-11-02', '2026-11-20'];
const regras = { dias: ['2026-11-16', '2026-11-17', '2026-11-18'], regra_medias: 4.5, regra_medias_maior: 5 };
// Meta de 19.000 = média de 1.000 por dia: 4,5 médias = 4.500; 5 = 5.000.
const META = 19_000;

function montar(recebido: Record<string, number>, extra: Partial<Parameters<typeof montarSetorNoDesafio>[0]> = {}) {
  return montarSetorNoDesafio({
    regras,
    pessoas: [
      { id: 'ana', nome: 'Ana', equipe_id: 'e1' },
      { id: 'bia', nome: 'Bia', equipe_id: 'e1' },
      { id: 'caio', nome: 'Caio', equipe_id: 'e2' },
      { id: 'duda', nome: 'Duda', equipe_id: null },
      { id: 'edu', nome: 'Edu', equipe_id: 'e2' },
    ],
    equipes: [{ id: 'e2', nome: 'Zeta' }, { id: 'e1', nome: 'Alfa' }],
    metaDoMes: new Map([['ana', META], ['bia', META], ['caio', META], ['duda', META]]),
    recebido: new Map(Object.entries(recebido).map(([id, v]) => [id, { '2026-11-17': v }])),
    feriados: () => FERIADOS,
    hoje: 2,
    ...extra,
  });
}

describe('montarSetorNoDesafio', () => {
  it('separa por equipe, em ordem de nome, com «Sem equipe» no fim', () => {
    const s = montar({ ana: 5000, bia: 4500, caio: 100, duda: 0 });
    expect(s.equipes.map(e => e.nome)).toEqual(['Alfa', 'Zeta', 'Sem equipe']);
  });

  it('conta quem bateu cada nível, igual à gaveta do operador', () => {
    const s = montar({ ana: 5000, bia: 4500, caio: 4499.99, duda: 0 });
    const alfa = s.equipes[0];
    expect(alfa.bateram).toBe(2);
    expect(alfa.bateramMaior).toBe(1);
    expect(s.bateram).toBe(2);
    expect(s.bateramMaior).toBe(1);
    expect(s.equipes[1].pessoas[0].meta.bateu).toBe(false);
  });

  it('dentro da equipe, quem fez mais médias vem primeiro', () => {
    const s = montar({ ana: 1000, bia: 4000 });
    expect(s.equipes[0].pessoas.map(p => p.nome)).toEqual(['Bia', 'Ana']);
  });

  it('quem não tem meta no mês fica fora da lista e entra na contagem à parte', () => {
    const s = montar({});
    expect(s.semMeta).toBe(1);
    expect(s.total).toBe(4);
    expect(s.equipes.flatMap(e => e.pessoas).some(p => p.id === 'edu')).toBe(false);
  });

  it('equipe que não é do setor vira «Sem equipe», não um id solto', () => {
    const s = montar({}, { pessoas: [{ id: 'ana', nome: 'Ana', equipe_id: 'de-outro-setor' }] });
    expect(s.equipes.map(e => e.nome)).toEqual(['Sem equipe']);
  });

  it('a média é a da régua de cada pessoa', () => {
    // Com 15 dias úteis (dias próprios), a média de 19.000 sobe para 1.266,67.
    const s = montar({ ana: 5000 }, {
      pessoas: [{ id: 'ana', nome: 'Ana', equipe_id: 'e1' }],
      feriados: () => [...FERIADOS, '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    });
    const ana = s.equipes[0].pessoas[0].meta;
    expect(ana.diasUteisMes).toBe(15);
    expect(ana.bateu).toBe(false);
  });
});
