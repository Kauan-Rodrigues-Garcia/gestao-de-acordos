/**
 * equipeDoLider.test.ts — a regra pura de qual equipe o líder credita.
 *
 * A ligação com o banco (a composição realmente lê `equipe_lideres`) é coberta
 * em `analitico/composicaoLiderEquipe.test.ts`. Aqui só a decisão.
 */
import { describe, it, expect } from 'vitest';
import { equipeUnicaPorLider } from './equipeDoLider';

const MATHEUS = 'lider-matheus';
const AMAURI  = 'lider-amauri';
const EQ_A    = 'eq-a';
const EQ_B    = 'eq-b';

describe('equipeUnicaPorLider', () => {
  it('mapeia quem lidera exatamente UMA equipe', () => {
    expect(equipeUnicaPorLider([{ equipe_id: EQ_A, lider_id: MATHEUS }]))
      .toEqual({ [MATHEUS]: EQ_A });
  });

  it('deixa de FORA quem lidera mais de uma', () => {
    // Creditar as duas contaria o mesmo recebimento duas vezes no setor, e
    // escolher uma seria inventar. O caso segue contando só no setor.
    const mapa = equipeUnicaPorLider([
      { equipe_id: EQ_A, lider_id: AMAURI },
      { equipe_id: EQ_B, lider_id: AMAURI },
    ]);
    expect(mapa[AMAURI]).toBeUndefined();
  });

  it('vínculo repetido para a MESMA equipe não conta como duas', () => {
    const mapa = equipeUnicaPorLider([
      { equipe_id: EQ_A, lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: MATHEUS },
    ]);
    expect(mapa).toEqual({ [MATHEUS]: EQ_A });
  });

  it('lista vazia devolve mapa vazio', () => {
    expect(equipeUnicaPorLider([])).toEqual({});
  });

  it('ignora linha sem equipe ou sem líder', () => {
    const sujo = [
      { equipe_id: '', lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: '' },
    ] as { equipe_id: string; lider_id: string }[];
    expect(equipeUnicaPorLider(sujo)).toEqual({});
  });
});
