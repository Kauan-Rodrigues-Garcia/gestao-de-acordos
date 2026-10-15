/**
 * rascunho.test.ts — "dá para enviar?" e "quem vai ver?".
 *
 * O que se perde se isto quebrar: o botão liberando uma festa sem ninguém, ou
 * o estúdio dizendo "8 pessoas" para uma festa que vai para a empresa inteira.
 */
import { describe, it, expect } from 'vitest';
import type { Comemoracao } from '@/services/comemoracoes.service';
import { designPadrao } from '@/components/comemoracao2/design';
import {
  contarPlateia, paraInputLocal, pendencias, rascunhoDeComemoracao, rascunhoInicial,
  rascunhoMetaBatida, type PessoaDaPlateia,
} from './rascunho';

const AGORA = new Date('2026-10-15T12:00:00');

const pessoas: PessoaDaPlateia[] = [
  { id: 'ana',   setor_id: 'rec', equipe_id: 'alfa' },
  { id: 'joao',  setor_id: 'rec', equipe_id: 'alfa' },
  { id: 'bia',   setor_id: 'rec', equipe_id: 'beta' },
  { id: 'edu',   setor_id: 'ati', equipe_id: 'gama' },
  { id: 'caio',  setor_id: null,  equipe_id: null },
];
const equipes = [
  { id: 'alfa', setor_id: 'rec' },
  { id: 'beta', setor_id: 'rec' },
  { id: 'gama', setor_id: 'ati' },
];
const pessoa = (id: string) => ({ id, nome: id, foto_url: null });

describe('pendencias', () => {
  it('rascunho novo pede quem bateu a meta', () => {
    expect(pendencias(rascunhoInicial(AGORA), null)).toEqual(['Escolha quem bateu a meta.']);
  });

  it('sem título não sai', () => {
    const r = { ...rascunhoInicial(AGORA), titulo: '   ', escolhidos: [pessoa('ana')] };
    expect(pendencias(r, null)).toEqual(['Escreva o título.']);
  });

  it('equipe e setor precisam ser escolhidos', () => {
    expect(pendencias({ ...rascunhoInicial(AGORA), alvoTipo: 'equipe' }, null)).toEqual(['Escolha a equipe.']);
    expect(pendencias({ ...rascunhoInicial(AGORA), alvoTipo: 'setor' }, null)).toEqual(['Escolha o setor.']);
  });

  it('erro de agendamento só conta quando está agendando', () => {
    const r = { ...rascunhoInicial(AGORA), escolhidos: [pessoa('ana')] };
    expect(pendencias(r, 'Data no passado.')).toEqual([]);
    expect(pendencias({ ...r, agendar: true }, 'Data no passado.')).toEqual(['Data no passado.']);
  });
});

describe('contarPlateia', () => {
  const base = { alvoTipo: 'operadores' as const, escolhidos: [], equipeId: '', setorId: '', somenteEquipe: false };

  it('setor = empresa inteira', () => {
    expect(contarPlateia({ ...base, alvoTipo: 'setor', setorId: 'rec' }, pessoas, equipes)).toBe(5);
    expect(contarPlateia({ ...base, alvoTipo: 'setor' }, pessoas, equipes)).toBe(0);
  });

  it('equipe = o setor da equipe, ou só a equipe', () => {
    expect(contarPlateia({ ...base, alvoTipo: 'equipe', equipeId: 'alfa' }, pessoas, equipes)).toBe(3);
    expect(contarPlateia({ ...base, alvoTipo: 'equipe', equipeId: 'alfa', somenteEquipe: true }, pessoas, equipes)).toBe(2);
  });

  it('pessoas = o setor de cada uma, sem contar ninguém duas vezes', () => {
    const r = { ...base, escolhidos: [pessoa('ana'), pessoa('joao'), pessoa('edu')] };
    expect(contarPlateia(r, pessoas, equipes)).toBe(4);
  });

  it('pessoas + "só a equipe" = a equipe de cada uma', () => {
    const r = { ...base, escolhidos: [pessoa('bia')], somenteEquipe: true };
    expect(contarPlateia(r, pessoas, equipes)).toBe(1);
  });

  it('pessoa sem setor ainda conta ela mesma', () => {
    expect(contarPlateia({ ...base, escolhidos: [pessoa('caio')] }, pessoas, equipes)).toBe(1);
  });
});

describe('rascunhoDeComemoracao (Duplicar)', () => {
  const c = {
    id: 'c1', titulo: 'RECORDE!', mensagem: 'Muito bem', efeito: 'confete', som: 'sino',
    gif_midia_id: null, som_midia_id: 'm1', alvo_tipo: 'operadores', equipe_id: null, setor_id: null,
    somente_equipe: true, volume: 40, duracao_s: 22, design: null,
    homenageados: [pessoa('ana')],
  } as unknown as Comemoracao;
  const musica = { id: 'm1', nome: 'Hino', url: 'https://x/hino.mp3' } as never;

  it('volta com texto, pessoas, som e volume; sem data', () => {
    const r = rascunhoDeComemoracao(c, [musica], AGORA);
    expect(r.titulo).toBe('RECORDE!');
    expect(r.escolhidos).toEqual([pessoa('ana')]);
    expect(r.som).toBe('sino');
    expect(r.musica).toBe(musica);
    expect(r.volume).toBe(40);
    expect(r.duracaoS).toBe(22);
    expect(r.somenteEquipe).toBe(true);
    expect(r.agendar).toBe(false);
  });

  it('comemoração da 1.0 ganha o card 2.0 de fábrica', () => {
    expect(rascunhoDeComemoracao(c, [], AGORA).design).toEqual(designPadrao());
  });
});

describe('rascunhoMetaBatida', () => {
  it('monta o card dourado com a pessoa e o mês', () => {
    const r = rascunhoMetaBatida(rascunhoInicial(AGORA), { ...pessoa('Ana Souza'), nome: 'Ana Souza', pct: 118 }, 'Outubro');
    expect(r.escolhidos).toEqual([{ id: 'Ana Souza', nome: 'Ana Souza', foto_url: null }]);
    expect(r.mensagem).toContain('Ana bateu 118% da meta');
    expect(r.design.papel).toBe('ouro-real');
    expect(r.design.selo).toBe('META DE OUTUBRO');
  });

  it('100% vira "a meta", sem o número', () => {
    const r = rascunhoMetaBatida(rascunhoInicial(AGORA), { ...pessoa('Bia'), pct: 100 }, 'Outubro');
    expect(r.mensagem).toContain('Bia bateu a meta!');
  });
});

describe('paraInputLocal', () => {
  it('formata no fuso local para o datetime-local', () => {
    expect(paraInputLocal(new Date(2026, 9, 5, 8, 7))).toBe('2026-10-05T08:07');
  });
});
