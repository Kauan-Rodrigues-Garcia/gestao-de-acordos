import { describe, it, expect } from 'vitest';
import {
  TEMPO_MAXIMO_MINUTOS, agruparPorPessoa, aceitaTempo, erroDoTempo, estadoDoTempo,
  filtrarChips, formatarDuracao, resumir, type ChipParaConta, type PessoaDoChip,
} from '../chipsFisicosRegras';

const AGORA = Date.parse('2026-09-21T15:00:00Z');
const daqui = (min: number) => new Date(AGORA + min * 60_000).toISOString();

function chip(p: Partial<ChipParaConta> & { id: string }): ChipParaConta {
  return { operador_id: 'ana', numero: '18999990000', status: 'ativo', prazo_ate: null, ...p };
}

describe('tempo', () => {
  it('só Banido e Recuperar levam tempo', () => {
    expect(aceitaTempo('ativo')).toBe(false);
    expect(aceitaTempo('banido')).toBe(true);
    expect(aceitaTempo('recuperar')).toBe(true);
  });

  it('o teto é 12 horas, o mesmo do banco', () => {
    expect(TEMPO_MAXIMO_MINUTOS).toBe(720);
    expect(erroDoTempo('banido', 720)).toBeNull();
    expect(erroDoTempo('banido', 721)).toMatch(/12 horas/);
  });

  it('sem tempo é válido; ativo com tempo não; zero não', () => {
    expect(erroDoTempo('recuperar', null)).toBeNull();
    expect(erroDoTempo('ativo', null)).toBeNull();
    expect(erroDoTempo('ativo', 60)).not.toBeNull();
    expect(erroDoTempo('banido', 0)).not.toBeNull();
    expect(erroDoTempo('banido', 1.5)).not.toBeNull();
  });

  it('formata a duração como a pessoa fala', () => {
    expect(formatarDuracao(45)).toBe('45 min');
    expect(formatarDuracao(60)).toBe('1 h');
    expect(formatarDuracao(90)).toBe('1 h 30 min');
    expect(formatarDuracao(720)).toBe('12 h');
  });

  it('o fim do tempo vira «encerrado», sem mexer no status', () => {
    const c = chip({ id: '1', status: 'banido', prazo_ate: daqui(-1) });
    expect(estadoDoTempo(c, AGORA)).toEqual({ tipo: 'encerrado' });
    expect(c.status).toBe('banido');
  });

  it('correndo devolve quanto falta', () => {
    const c = chip({ id: '1', status: 'recuperar', prazo_ate: daqui(30) });
    expect(estadoDoTempo(c, AGORA)).toEqual({ tipo: 'correndo', restanteMs: 30 * 60_000 });
  });

  it('ativo nunca mostra tempo, mesmo com prazo sobrando', () => {
    const c = chip({ id: '1', status: 'ativo', prazo_ate: daqui(30) });
    expect(estadoDoTempo(c, AGORA)).toEqual({ tipo: 'sem_tempo' });
  });
});

describe('resumo e filtro', () => {
  const chips = [
    chip({ id: 'a', status: 'ativo', numero: '18911110000', operador_id: 'ana' }),
    chip({ id: 'b', status: 'banido', numero: '18922220000', operador_id: 'bruno', prazo_ate: daqui(-5) }),
    chip({ id: 'c', status: 'recuperar', numero: '18933330000', operador_id: 'bruno', prazo_ate: daqui(60) }),
    chip({ id: 'd', status: 'banido', numero: '11944440000', operador_id: 'ana' }),
  ];
  const nomes: Record<string, string> = { ana: 'Ana Júlia', bruno: 'Bruno Souza' };
  const nomeDe = (id: string) => nomes[id] ?? '';
  const encerrado = (c: ChipParaConta) => estadoDoTempo(c, AGORA).tipo === 'encerrado';

  it('conta cada status e o tempo encerrado', () => {
    expect(resumir(chips, AGORA)).toEqual({
      total: 4, ativo: 1, banido: 2, recuperar: 1, tempoEncerrado: 1,
    });
  });

  it('filtra por status e por tempo encerrado', () => {
    const ids = (s: Parameters<typeof filtrarChips>[1]['status']) =>
      filtrarChips(chips, { status: s, busca: '' }, nomeDe, encerrado).map(c => c.id);
    expect(ids('todos')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('banido')).toEqual(['b', 'd']);
    expect(ids('tempo_encerrado')).toEqual(['b']);
  });

  it('busca pelo número em qualquer formatação e pelo nome sem acento', () => {
    const busca = (b: string) =>
      filtrarChips(chips, { status: 'todos', busca: b }, nomeDe, encerrado).map(c => c.id);
    expect(busca('(18) 92222')).toEqual(['b']);
    expect(busca('julia')).toEqual(['a', 'd']);
    expect(busca('BRUNO')).toEqual(['b', 'c']);
  });
});

describe('agrupamento por pessoa', () => {
  const pessoas = new Map<string, PessoaDoChip>([
    ['bruno', { id: 'bruno', nome: 'Bruno', foto_url: null, setor_id: 's1' }],
    ['ana', { id: 'ana', nome: 'Ana', foto_url: null, setor_id: 's1' }],
  ]);

  it('um bloco por pessoa, em ordem alfabética, com os que pedem atenção primeiro', () => {
    const blocos = agruparPorPessoa([
      chip({ id: '1', operador_id: 'bruno', status: 'ativo', numero: '18911110000' }),
      chip({ id: '2', operador_id: 'ana', status: 'ativo', numero: '18900000000' }),
      chip({ id: '3', operador_id: 'bruno', status: 'banido', numero: '18999990000' }),
      chip({ id: '4', operador_id: 'bruno', status: 'recuperar', numero: '18955550000' }),
    ], pessoas);

    expect(blocos.map(b => b.pessoa.nome)).toEqual(['Ana', 'Bruno']);
    expect(blocos[1].chips.map(c => c.id)).toEqual(['3', '4', '1']);
  });

  it('chip de pessoa desconhecida não some', () => {
    const blocos = agruparPorPessoa([chip({ id: '1', operador_id: 'fantasma' })], pessoas);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].pessoa.nome).toBe('Pessoa não encontrada');
  });
});
