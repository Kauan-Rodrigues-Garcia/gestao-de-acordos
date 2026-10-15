/**
 * alcance.test.ts — líder e elite só fazem festa para o próprio setor.
 *
 * O que se perde se isto quebrar: a festa de um setor aparecendo em outro, ou
 * a música que um líder enviou tocando na festa do setor vizinho.
 */
import { describe, it, expect } from 'vitest';
import type { Comemoracao } from '@/services/comemoracoes.service';
import type { MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import {
  ALCANCE_TOTAL, alcanceDoCriador, comemoracoesNoAlcance, dadosNoAlcance, foraDoAlcance,
  musicasNoAlcance, setoresNoAlcance,
} from './alcance';
import type { DadosEstudio } from './tipos';

const equipes = [
  { id: 'eqA', nome: 'Time A', setor_id: 'A' },
  { id: 'eqB', nome: 'Time B', setor_id: 'B' },
];

const dados: DadosEstudio = {
  pessoas: [
    { id: 'ana',   nome: 'Ana Souza', foto_url: null, setor_id: 'A', equipe_id: 'eqA' },
    { id: 'bia',   nome: 'Bia Lima',  foto_url: null, setor_id: 'B', equipe_id: 'eqB' },
    // Clone: cadastro no B, trabalha também no time A.
    { id: 'caio',  nome: 'Caio Reis', foto_url: null, setor_id: 'B', equipe_id: 'eqB' },
  ],
  equipes,
  setores: [{ id: 'A', nome: 'Setor A' }, { id: 'B', nome: 'Setor B' }],
  clones: [{ operador_id: 'caio', equipe_id: 'eqA' }],
  musicas: null,
};

describe('alcanceDoCriador', () => {
  it('líder fica no próprio setor', () => {
    const a = alcanceDoCriador({ cargo: 'lider', setorId: 'A', equipesLideradas: [], equipes });
    expect(a.restrito).toBe(true);
    expect([...a.setores]).toEqual(['A']);
  });

  it('líder de um time em outro setor ganha esse setor também', () => {
    const a = alcanceDoCriador({ cargo: 'lider', setorId: 'A', equipesLideradas: ['eqB'], equipes });
    expect([...a.setores].sort()).toEqual(['A', 'B']);
  });

  it('gerência, diretoria e acima veem a empresa inteira', () => {
    for (const cargo of ['gerencia', 'diretoria', 'administrador', 'super_admin']) {
      expect(alcanceDoCriador({ cargo, setorId: 'A', equipesLideradas: [], equipes }).restrito).toBe(false);
    }
  });
});

describe('dadosNoAlcance', () => {
  const liderA = alcanceDoCriador({ cargo: 'lider', setorId: 'A', equipesLideradas: [], equipes });

  it('tira pessoas, equipes e setores de fora', () => {
    const d = dadosNoAlcance(dados, liderA);
    expect(d.pessoas.map((p) => p.id)).toEqual(['ana', 'caio']);
    expect(d.equipes.map((e) => e.id)).toEqual(['eqA']);
    expect(d.setores.map((s) => s.id)).toEqual(['A']);
  });

  it('sem restrição devolve tudo', () => {
    expect(dadosNoAlcance(dados, ALCANCE_TOTAL)).toBe(dados);
  });

  it('o clone é comemorado só no setor de quem montou', () => {
    expect(setoresNoAlcance(['B', 'A'], liderA)).toEqual(['A']);
    expect(setoresNoAlcance(['B', 'A'], ALCANCE_TOTAL)).toEqual(['B', 'A']);
  });
});

describe('foraDoAlcance', () => {
  const liderA = alcanceDoCriador({ cargo: 'lider', setorId: 'A', equipesLideradas: [], equipes });
  const noA = dadosNoAlcance(dados, liderA);
  const base = { alvoTipo: 'operadores', escolhidos: [], equipeId: '', setorId: '' };

  it('barra pessoa de outro setor (ex.: vinda de um Duplicar)', () => {
    const r = { ...base, escolhidos: [{ id: 'bia', nome: 'Bia Lima' }] };
    expect(foraDoAlcance(r, noA, liderA)).toMatch(/Bia não é do seu setor/);
  });

  it('barra equipe e setor de fora', () => {
    expect(foraDoAlcance({ ...base, alvoTipo: 'equipe', equipeId: 'eqB' }, noA, liderA)).toBeTruthy();
    expect(foraDoAlcance({ ...base, alvoTipo: 'setor', setorId: 'B' }, noA, liderA)).toBeTruthy();
  });

  it('deixa passar o que é do setor', () => {
    const r = { ...base, escolhidos: [{ id: 'ana', nome: 'Ana Souza' }] };
    expect(foraDoAlcance(r, noA, liderA)).toBeNull();
  });
});

describe('comemoracoesNoAlcance', () => {
  const liderA = alcanceDoCriador({ cargo: 'lider', setorId: 'A', equipesLideradas: [], equipes });
  const c = (id: string, parte: Partial<Comemoracao>) =>
    ({ id, empresa_inteira: false, criado_por: 'outro', setores_alvo: [], ...parte }) as Comemoracao;

  it('fica com as do setor, as minhas e as de meta de setor', () => {
    const lista = [
      c('doA', { setores_alvo: ['A'] }),
      c('doB', { setores_alvo: ['B'] }),
      c('minha', { criado_por: 'eu', setores_alvo: ['B'] }),
      c('setor', { empresa_inteira: true, setores_alvo: ['B'] }),
    ];
    expect(comemoracoesNoAlcance(lista, liderA, 'eu').map((x) => x.id)).toEqual(['doA', 'minha', 'setor']);
  });
});

describe('musicasNoAlcance', () => {
  const m = (id: string, setor_id: string | null, criado_por = 'outro') =>
    ({ id, setor_id, criado_por }) as MidiaComemoracao;
  const lista = [m('a', 'A'), m('b', 'B'), m('minha', 'B', 'eu'), m('sem', null)];

  it('quem tem setor vê as do setor e as que enviou', () => {
    expect(musicasNoAlcance(lista, new Set(['A']), 'eu')?.map((x) => x.id)).toEqual(['a', 'minha']);
  });

  it('quem não tem setor vê todas', () => {
    expect(musicasNoAlcance(lista, new Set(), 'eu')).toBe(lista);
  });

  it('biblioteca indisponível continua null', () => {
    expect(musicasNoAlcance(null, new Set(['A']), 'eu')).toBeNull();
  });
});
