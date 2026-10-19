import { describe, expect, it } from 'vitest';
import {
  andamentoDoDia, duracaoCurta, ehDesafioDoDia, entradasNovas, metaDiariaDoMes, metaEfetiva,
  minutoAgoraSaoPaulo, minutosRestantes, normalizarDiario, paraGravacao, rotuloJanela,
  situacaoDoDia, type DiarioDesafio,
} from './desafioDoDia';
import { normalizarRegra } from './desafios.service';

const BASE: DiarioDesafio = {
  versao: 1, publico: 'setor', alvoId: 'setor-play1', alvoNome: 'Play 1',
  medida: 'valor', meta: 10_000, horaInicio: null, horaFim: null,
};

describe('normalizarDiario', () => {
  it('sem alvo não é desafio do dia', () => {
    expect(normalizarDiario({ meta: 10 })).toBeNull();
    expect(normalizarDiario(null)).toBeNull();
    expect(normalizarDiario([])).toBeNull();
  });

  it('horário torto vira o dia inteiro, como no banco', () => {
    expect(normalizarDiario({ ...BASE, horaInicio: 17, horaFim: 14 })).toMatchObject({ horaInicio: null, horaFim: null });
    expect(normalizarDiario({ ...BASE, horaInicio: 14, horaFim: 30 })).toMatchObject({ horaInicio: null, horaFim: null });
    expect(normalizarDiario({ ...BASE, horaInicio: 14, horaFim: 17 })).toMatchObject({ horaInicio: 14, horaFim: 17 });
  });

  it('público e medida desconhecidos caem no padrão', () => {
    expect(normalizarDiario({ ...BASE, publico: 'empresa', medida: 'xyz' }))
      .toMatchObject({ publico: 'setor', medida: 'valor' });
  });

  it('a regra da campanha leva o campo, e campanha comum fica sem ele', () => {
    expect(normalizarRegra({ diario: BASE }, 'meta_coletiva').diario).toMatchObject({ alvoId: 'setor-play1' });
    expect(normalizarRegra({}, 'bater_meta').diario).toBeNull();
    expect(ehDesafioDoDia({ regra: normalizarRegra({}, 'bater_meta') })).toBe(false);
  });
});

describe('a meta', () => {
  it('meta diária = meta do mês ÷ dias úteis (out/2026 tem 22 úteis sem feriado)', () => {
    expect(metaDiariaDoMes(220_000, '2026-10-19')).toBeCloseTo(10_000, 2);
    expect(metaDiariaDoMes(220_000, '2026-10-19', ['2026-10-12'])).toBeCloseTo(220_000 / 21, 2);
    expect(metaDiariaDoMes(null, '2026-10-19')).toBeNull();
  });

  it('% da meta diária vira R$; sem meta do mês, sem alvo', () => {
    expect(metaEfetiva({ medida: 'meta_diaria', meta: 120 }, 10_000)).toBe(12_000);
    expect(metaEfetiva({ medida: 'meta_diaria', meta: 120 }, null)).toBeNull();
    expect(metaEfetiva({ medida: 'valor', meta: 5_000 }, null)).toBe(5_000);
  });

  it('andamento por valor e por quantidade', () => {
    const placar = { total: 7_500, qtd: 12, metaMes: null, feriados: [] };
    expect(andamentoDoDia(BASE, placar, '2026-10-19')).toMatchObject({ realizado: 7_500, falta: 2_500, progresso: 75, bateu: false });
    expect(andamentoDoDia({ ...BASE, medida: 'quantidade', meta: 10 }, placar, '2026-10-19'))
      .toMatchObject({ realizado: 12, falta: 0, bateu: true, porQuantidade: true });
  });
});

describe('o tempo', () => {
  const janela = { horaInicio: 14, horaFim: 17 };
  const sit = (minutoAgora: number, extra: Partial<Parameters<typeof situacaoDoDia>[0]> = {}) => situacaoDoDia({
    status: 'ativo', diaISO: '2026-10-19', hojeISO: '2026-10-19', minutoAgora, diario: janela, ...extra,
  });

  it('agendado → valendo → apurando (a última hora do robô) → encerrado', () => {
    expect(sit(13 * 60 + 59)).toBe('agendado');
    expect(sit(14 * 60)).toBe('valendo');
    expect(sit(16 * 60 + 59)).toBe('valendo');
    expect(sit(17 * 60 + 30)).toBe('apurando');
    expect(sit(18 * 60)).toBe('encerrado');
  });

  it('o dia, o status e o dia inteiro mandam antes do relógio', () => {
    expect(sit(10, { diaISO: '2026-10-18' })).toBe('encerrado');
    expect(sit(10, { diaISO: '2026-10-20' })).toBe('agendado');
    expect(sit(10, { status: 'rascunho' })).toBe('rascunho');
    expect(sit(23 * 60, { diario: { horaInicio: null, horaFim: null } })).toBe('valendo');
  });

  it('rótulos', () => {
    expect(rotuloJanela(janela)).toBe('das 14h às 17h');
    expect(rotuloJanela({ horaInicio: null, horaFim: null })).toBe('o dia inteiro');
    expect(minutosRestantes(janela, 15 * 60 + 25)).toBe(95);
    expect(duracaoCurta(95)).toBe('1h35');
    expect(duracaoCurta(40)).toBe('40 min');
    expect(duracaoCurta(120)).toBe('2h');
  });

  it('o relógio é o de São Paulo, não o da máquina', () => {
    // 19/10/2026 17:30 UTC = 14:30 em São Paulo (UTC−3).
    expect(minutoAgoraSaoPaulo(new Date('2026-10-19T17:30:00Z'))).toBe(14 * 60 + 30);
  });
});

describe('entradasNovas', () => {
  const c = (id: string, total: number, qtd: number) => ({ id, nome: id, fotoUrl: null, equipe: null, total, qtd, ultima: null });

  it('só o que subiu, do maior para o menor', () => {
    const antes = [c('ana', 100, 1), c('bia', 50, 1)];
    const depois = [c('ana', 450, 2), c('bia', 30, 1), c('cris', 80, 1)];
    expect(entradasNovas(antes, depois).map(e => [e.id, e.valor])).toEqual([['ana', 350], ['cris', 80]]);
  });
});

describe('paraGravacao', () => {
  const form = {
    nome: ' Desafio do dia · Play 1 ', premio: '', recado: 'Bora!', dia: '2026-10-19',
    setorId: 'setor-play1', acento: null, status: 'ativo' as const, metaCalculada: null,
  };

  it('vira uma meta coletiva de um dia, fora do menu lateral', () => {
    const d = paraGravacao({ ...form, diario: BASE });
    expect(d).toMatchObject({ tipo: 'meta_coletiva', dataInicio: '2026-10-19', dataFim: '2026-10-19', setorId: 'setor-play1', nome: 'Desafio do dia · Play 1', premio: null, descricao: 'Bora!' });
    expect(d.regra.metaColetiva).toBe(10_000);
    expect(d.visual.fixarNoMenu).toBe(false);
  });

  it('o recorte leva SEMPRE o setor, e a equipe/operador estreitam por cima', () => {
    expect(paraGravacao({ ...form, diario: BASE }).regra.participantes).toMatchObject({ setores: ['setor-play1'], equipes: [], operadores: [] });
    expect(paraGravacao({ ...form, diario: { ...BASE, publico: 'equipe', alvoId: 'eq1' } }).regra.participantes)
      .toMatchObject({ setores: ['setor-play1'], equipes: ['eq1'], operadores: [] });
    expect(paraGravacao({ ...form, diario: { ...BASE, publico: 'operador', alvoId: 'op1' } }).regra.participantes)
      .toMatchObject({ setores: ['setor-play1'], equipes: [], operadores: ['op1'] });
  });

  it('quantidade grava a métrica; meta diária grava o R$ calculado', () => {
    expect(paraGravacao({ ...form, diario: { ...BASE, medida: 'quantidade', meta: 30 } }).regra.metrica).toBe('quantidade');
    expect(paraGravacao({ ...form, metaCalculada: 12_000, diario: { ...BASE, medida: 'meta_diaria', meta: 120 } }).regra.metaColetiva).toBe(12_000);
  });
});
