/**
 * Quais equipes a pessoa lidera — a regra do Painel (`lideresDaEquipe`)
 * invertida. Os casos reais são os do teste de lá.
 */
import { describe, it, expect } from 'vitest';
import { equipesQueLidero, equipesDaVisao } from './equipesQueLidero';
import type { PerfilLider } from '@/pages/Dashboard/Analitico/lideresDaEquipe';

const bryan: PerfilLider = { id: 'l-bryan', nome: 'Bryan Queiroz',   foto_url: null, equipe_id: null };
const kauan: PerfilLider = { id: 'l-kauan', nome: 'Kauan Rodrigues', foto_url: null, equipe_id: 'eq-bryan' };
const maria: PerfilLider = { id: 'l-maria', nome: 'Maria Oliveira',  foto_url: null, equipe_id: 'eq-digital-bruno' };

describe('líder', () => {
  it('pelo cadastro, quando a equipe não tem vínculo explícito', () => {
    expect(equipesQueLidero({ id: 'l-kauan' }, {
      lideres: [kauan], explicitos: [], clones: [],
    })).toEqual(['eq-bryan']);
  });

  /** Receptivo / equipe "Bryan", 18/08/2026. */
  it('não lidera a equipe onde o explícito escolheu outra pessoa', () => {
    const entrada = {
      lideres: [bryan, kauan],
      explicitos: [{ equipe_id: 'eq-bryan', lider_id: 'l-bryan' }],
      clones: [],
    };
    expect(equipesQueLidero({ id: 'l-kauan' }, entrada)).toEqual([]);
    expect(equipesQueLidero({ id: 'l-bryan' }, entrada)).toEqual(['eq-bryan']);
  });

  /** Play 4, 02/09/2026: Maria lidera «Maria - Capitã» e o cadastro a prende em «Digital Bruno». */
  it('quem já lidera algo explicitamente não entra pela reserva', () => {
    expect(equipesQueLidero({ id: 'l-maria' }, {
      lideres: [maria],
      explicitos: [{ equipe_id: 'eq-capita', lider_id: 'l-maria' }],
      clones: [],
    })).toEqual(['eq-capita']);
  });

  it('clone de líder lidera também a equipe clonada', () => {
    expect(equipesQueLidero({ id: 'l-kauan' }, {
      lideres: [kauan], explicitos: [],
      clones: [{ equipe_id: 'eq-outra', operador_id: 'l-kauan' }],
    }).sort()).toEqual(['eq-bryan', 'eq-outra']);
  });

  it('sem equipe nenhuma devolve vazio', () => {
    expect(equipesQueLidero({ id: 'l-bryan' }, {
      lideres: [bryan], explicitos: [], clones: [],
    })).toEqual([]);
  });
});

describe('quem não está entre os líderes (elite)', () => {
  it('lidera só pelo vínculo explícito', () => {
    expect(equipesQueLidero({ id: 'e-ana' }, {
      lideres: [bryan],
      explicitos: [{ equipe_id: 'eq-plantao', lider_id: 'e-ana' }],
      clones: [],
    })).toEqual(['eq-plantao']);
  });

  it('a equipe onde o elite trabalha não conta como liderada', () => {
    // O elite não está em `lideres` (o Painel só passa `lider`), então o
    // cadastro dele nunca vira reserva.
    expect(equipesQueLidero({ id: 'e-ana' }, {
      lideres: [bryan], explicitos: [], clones: [{ equipe_id: 'eq-x', operador_id: 'e-ana' }],
    })).toEqual([]);
  });
});

describe('equipesDaVisao', () => {
  const composicao = {
    operadorEquipeMap: { 'e-ana': { equipe_id: 'eq-receptivo' } },
    equipesExtrasPorOperador: { 'e-ana': ['eq-plantao'] },
  };
  it('elite vê a equipe de que faz parte, sem precisar liderar', () => {
    expect(equipesDaVisao({ id: 'e-ana' }, { lideres: [], explicitos: [], clones: [] }, composicao))
      .toEqual(['eq-receptivo', 'eq-plantao']);
  });
  it('soma as que lidera sem repetir', () => {
    expect(equipesDaVisao({ id: 'e-ana' }, {
      lideres: [], explicitos: [{ equipe_id: 'eq-plantao', lider_id: 'e-ana' }, { equipe_id: 'eq-x', lider_id: 'e-ana' }], clones: [],
    }, composicao)).toEqual(['eq-plantao', 'eq-x', 'eq-receptivo']);
  });
  it('líder sem equipe própria no mapa fica só com as que lidera', () => {
    expect(equipesDaVisao({ id: 'l-kauan' }, { lideres: [kauan], explicitos: [], clones: [] }, composicao))
      .toEqual(['eq-bryan']);
  });
});
