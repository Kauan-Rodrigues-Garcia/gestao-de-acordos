import { describe, expect, it } from 'vitest';
import { estiloDoNatal, natalEmPrevia, podeVerNatal, presenteAberto } from './previa';
import { VIDEOS, videoDaCidade } from './abertura';
import { guardadaVale } from './liberacao';
import {
  SEM_SETOR, chaveDoSetor, comoEntrou, passaNoFiltro, grupoDaCidade, resumirGrupo, separarPorGrupo, setoresDasPessoas, situacaoDoNatal,
  type PessoaDoNatal,
} from './acompanhamento';

describe('quem vê o Natal (liberação, 09/11/2026)', () => {
  it('antes da liberação, só o super_admin e o dev', () => {
    expect(podeVerNatal({ dev: false, cargo: 'operador', liberado: false })).toBe(false);
    expect(podeVerNatal({ dev: false, cargo: 'lider', liberado: false })).toBe(false);
    expect(podeVerNatal({ dev: false, cargo: 'super_admin', liberado: false })).toBe(true);
    expect(podeVerNatal({ dev: true, cargo: 'operador', liberado: false })).toBe(true);
  });
  it('depois da liberação, todo mundo — e sem cargo também', () => {
    for (const cargo of ['operador', 'lider', 'elite', 'gerencia', 'diretoria', 'super_admin', null, undefined]) {
      expect(podeVerNatal({ dev: false, cargo, liberado: true })).toBe(true);
    }
  });
  it('a prévia (seletor e botões de teste) é só do npm run dev, nem o super_admin a tem', () => {
    expect(natalEmPrevia(false)).toBe(false);
    expect(natalEmPrevia(true)).toBe(true);
  });
});

describe('o estilo', () => {
  it('fora da prévia é sempre o detalhado, mesmo com «off» gravado no navegador', () => {
    expect(estiloDoNatal(null, false)).toBe('detalhado');
    expect(estiloDoNatal('off', false)).toBe('detalhado');
    expect(estiloDoNatal('simples', false)).toBe('detalhado');
  });
  it('na prévia vale o que ela gravou; nada gravado é o detalhado', () => {
    expect(estiloDoNatal(null, true)).toBe('detalhado');
    expect(estiloDoNatal('simples', true)).toBe('simples');
    expect(estiloDoNatal('off', true)).toBeNull();
  });
});

describe('o presente aberto', () => {
  it('abriu neste navegador, ou em outro computador (banco)', () => {
    expect(presenteAberto('1', false)).toBe(true);
    expect(presenteAberto(null, true)).toBe(true);
    expect(presenteAberto(null, false)).toBe(false);
  });
  it('«0» (a prévia devolveu o presente) vale mais que o banco', () => {
    expect(presenteAberto('0', true)).toBe(false);
  });
});

describe('o vídeo da cidade', () => {
  it('Marília vê o de Marília, com ou sem acento', () => {
    expect(videoDaCidade('Marília')).toBe('marilia');
    expect(videoDaCidade('marilia')).toBe('marilia');
    expect(videoDaCidade(' MARÍLIA ')).toBe('marilia');
  });
  it('Birigui, outra cidade ou nenhuma: o de Birigui', () => {
    expect(videoDaCidade('Birigui')).toBe('birigui');
    expect(videoDaCidade('Araçatuba')).toBe('birigui');
    expect(videoDaCidade(null)).toBe('birigui');
    expect(videoDaCidade(undefined)).toBe('birigui');
    expect(videoDaCidade('')).toBe('birigui');
  });
  it('cada um tem o seu arquivo', () => {
    expect(VIDEOS.birigui).toBe('/video/natal/abertura.mp4');
    expect(VIDEOS.marilia).toBe('/video/natal/abertura-marilia.mp4');
  });
});

describe('a liberação guardada no navegador', () => {
  const agora = 10_000_000;
  it('«liberado» vale 30 min; «ainda não», 5 min', () => {
    expect(guardadaVale({ liberadoEm: '2026-11-10T10:00:00Z', em: agora - 29 * 60_000 }, agora)).toBe(true);
    expect(guardadaVale({ liberadoEm: '2026-11-10T10:00:00Z', em: agora - 31 * 60_000 }, agora)).toBe(false);
    expect(guardadaVale({ liberadoEm: null, em: agora - 4 * 60_000 }, agora)).toBe(true);
    expect(guardadaVale({ liberadoEm: null, em: agora - 6 * 60_000 }, agora)).toBe(false);
    expect(guardadaVale(null, agora)).toBe(false);
  });
});

describe('o acompanhamento', () => {
  const pessoa = (x: Partial<PessoaDoNatal>): PessoaDoNatal => ({
    usuario_id: Math.random().toString(36), nome: 'X', cargo: null, empresa_nome: null, setor_nome: null,
    cidade: null, video: null, assistiu_em: null, pulou_em: null, liberou_em: null, adiou_vezes: 0, ...x,
  });

  it('separa por cidade; outra cidade e sem cidade ficam juntas (veem o de Birigui)', () => {
    expect(grupoDaCidade('birigui')).toBe('birigui');
    expect(grupoDaCidade('marilia')).toBe('marilia');
    expect(grupoDaCidade('aracatuba')).toBe('sem');
    expect(grupoDaCidade(null)).toBe('sem');
    const g = separarPorGrupo([pessoa({ cidade: 'birigui' }), pessoa({ cidade: 'marilia' }), pessoa({ cidade: null }), pessoa({ cidade: 'aracatuba' })]);
    expect([g.birigui.length, g.marilia.length, g.sem.length]).toEqual([1, 1, 2]);
  });

  it('situação: entrou > deixou para depois > ainda não abriu', () => {
    expect(situacaoDoNatal({ liberou_em: 'x', adiou_vezes: 3 })).toBe('entrou');
    expect(situacaoDoNatal({ liberou_em: null, adiou_vezes: 1 })).toBe('adiou');
    expect(situacaoDoNatal({ liberou_em: null, adiou_vezes: 0 })).toBe('pendente');
  });

  it('como entrou: o primeiro que aconteceu', () => {
    expect(comoEntrou({ liberou_em: 'b', assistiu_em: '2026-11-10T10:00', pulou_em: null })).toBe('assistiu');
    expect(comoEntrou({ liberou_em: 'b', assistiu_em: null, pulou_em: '2026-11-10T10:00' })).toBe('pulou');
    expect(comoEntrou({ liberou_em: 'b', assistiu_em: '2026-11-10T11:00', pulou_em: '2026-11-10T10:00' })).toBe('pulou');
    expect(comoEntrou({ liberou_em: null, assistiu_em: '2026-11-10T10:00', pulou_em: null })).toBeNull();
  });

  it('o resumo fecha com o total', () => {
    const r = resumirGrupo([
      pessoa({ liberou_em: 'x', assistiu_em: '1' }),
      pessoa({ liberou_em: 'x', pulou_em: '1' }),
      pessoa({ adiou_vezes: 2 }),
      pessoa({}),
    ]);
    expect(r).toEqual({ total: 4, entrou: 2, assistiu: 1, pulou: 1, adiou: 1, pendente: 1 });
    expect(r.entrou + r.adiou + r.pendente).toBe(r.total);
  });
});

describe('o filtro de setor do acompanhamento', () => {
  const p = (empresa_nome: string | null, setor_nome: string | null): PessoaDoNatal => ({
    usuario_id: Math.random().toString(36), nome: 'X', cargo: null, empresa_nome, setor_nome, cidade: 'birigui',
    video: null, assistiu_em: null, pulou_em: null, liberou_em: null, adiou_vezes: 0,
  });

  it('agrupa por setor, em ordem, com «Sem setor» por último', () => {
    const s = setoresDasPessoas([p('BookPlay', 'Play 3'), p(null, null), p('BookPlay', 'Elite'), p('BookPlay', 'Play 3')]);
    expect(s).toEqual([
      { chave: 'BookPlay|Elite', rotulo: 'Elite', total: 1 },
      { chave: 'BookPlay|Play 3', rotulo: 'Play 3', total: 2 },
      { chave: SEM_SETOR, rotulo: 'Sem setor', total: 1 },
    ]);
  });

  it('o mesmo nome em duas empresas são dois setores, com a empresa no rótulo', () => {
    const s = setoresDasPessoas([p('BookPlay', 'Receptivo'), p('PaguePlay', 'Receptivo')]);
    expect(s.map(x => x.rotulo)).toEqual(['Receptivo · BookPlay', 'Receptivo · PaguePlay']);
    expect(chaveDoSetor(p('BookPlay', 'Receptivo'))).not.toBe(chaveDoSetor(p('PaguePlay', 'Receptivo')));
  });
});

describe('o filtro da lista do acompanhamento', () => {
  const p = (extra: Partial<PessoaDoNatal>): PessoaDoNatal => ({
    usuario_id: Math.random().toString(36), nome: 'X', cargo: null, empresa_nome: null, setor_nome: null,
    cidade: 'birigui', video: null, assistiu_em: null, pulou_em: null, liberou_em: null, adiou_vezes: 0, ...extra,
  });
  const assistiu = p({ liberou_em: '2026-11-10T13:00:00Z', assistiu_em: '2026-11-10T12:58:00Z' });
  const pulou = p({ liberou_em: '2026-11-10T13:00:00Z', pulou_em: '2026-11-10T12:59:00Z' });
  const adiou = p({ adiou_vezes: 1 });
  const pendente = p({});

  it('«pulou» e «assistiu» separam quem entrou; «entrou» junta os dois', () => {
    expect([assistiu, pulou, adiou, pendente].map(x => passaNoFiltro(x, 'pulou'))).toEqual([false, true, false, false]);
    expect([assistiu, pulou, adiou, pendente].map(x => passaNoFiltro(x, 'assistiu'))).toEqual([true, false, false, false]);
    expect([assistiu, pulou, adiou, pendente].map(x => passaNoFiltro(x, 'entrou'))).toEqual([true, true, false, false]);
    expect([assistiu, pulou, adiou, pendente].map(x => passaNoFiltro(x, 'todas'))).toEqual([true, true, true, true]);
  });
});
