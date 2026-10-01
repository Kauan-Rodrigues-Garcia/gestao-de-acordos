import { describe, expect, it } from 'vitest';
import {
  nomeNoMes, passaNoFiltro, pessoaDaLinha, pessoasDoMes, type PessoaDoRetrato,
} from './pessoasDoMes';

const CARGOS = ['operador', 'elite'] as const;

function pessoa(p: Partial<PessoaDoRetrato> & { id: string }): PessoaDoRetrato {
  return {
    nome: p.id, perfil: 'operador', foto_url: null, setor_id: 's1', equipe_id: 'e1',
    situacao: 'ativo', ativo: true, desligado_em: null, ...p,
  };
}

function retrato(...ps: PessoaDoRetrato[]) {
  return new Map(ps.map(p => [p.id, p]));
}

describe('pessoasDoMes — a lista do mês fechado sai do retrato', () => {
  it('sem retrato devolve a lista de hoje como veio', () => {
    const vivos = [{ id: 'a', nome: 'Ana' }];
    expect(pessoasDoMes(vivos, null, { cargos: CARGOS, situacao: 'ativos' })).toEqual(vivos);
  });

  it('renomeado depois aparece com o nome do mês', () => {
    const vivos = [{ id: 'a', nome: 'Ana Nova', foto_url: 'hoje.png' }];
    const [a] = pessoasDoMes(vivos, retrato(pessoa({ id: 'a', nome: 'Ana', foto_url: 'antiga.png' })),
      { cargos: CARGOS, situacao: 'ativos' });
    expect(a.nome).toBe('Ana');
    // A foto é a de hoje: é a mesma pessoa.
    expect(a.foto_url).toBe('hoje.png');
  });

  it('excluído depois continua no mês, com o que o retrato guardou', () => {
    const lista = pessoasDoMes([], retrato(pessoa({ id: 'x', nome: 'Xavier', foto_url: 'x.png' })),
      { cargos: CARGOS, situacao: 'ou_desligado' });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: 'x', nome: 'Xavier', foto_url: 'x.png', arquivado: false });
  });

  it('criado depois do mês não aparece no mês', () => {
    const vivos = [{ id: 'novo', nome: 'Novato' }, { id: 'a', nome: 'Ana' }];
    const lista = pessoasDoMes(vivos, retrato(pessoa({ id: 'a', nome: 'Ana' })),
      { cargos: CARGOS, situacao: 'ou_desligado' });
    expect(lista.map(p => p.id)).toEqual(['a']);
  });

  it('férias ou desligamento de HOJE não tiram ninguém do mês passado', () => {
    // Hoje a lista viva já não traz a pessoa (filtro de situação de hoje).
    const lista = pessoasDoMes([], retrato(pessoa({ id: 'a' })), { cargos: CARGOS, situacao: 'ativos' });
    expect(lista.map(p => p.id)).toEqual(['a']);
  });

  it('a situação DO MÊS continua valendo', () => {
    const r = retrato(
      pessoa({ id: 'ferias', situacao: 'ferias' }),
      pessoa({ id: 'saiu', situacao: 'desligado', ativo: false }),
      pessoa({ id: 'ok' }),
    );
    expect(pessoasDoMes([], r, { cargos: CARGOS, situacao: 'ativos' }).map(p => p.id)).toEqual(['ok']);
    expect(pessoasDoMes([], r, { cargos: CARGOS, situacao: 'ou_desligado' }).map(p => p.id).sort())
      .toEqual(['ferias', 'ok', 'saiu']);
  });

  it('equipe e setor são os do mês, não os de hoje', () => {
    const vivos = [{ id: 'a', nome: 'Ana', equipe_id: 'nova', setor_id: 's2' }];
    const [a] = pessoasDoMes(vivos, retrato(pessoa({ id: 'a', equipe_id: 'e1', setor_id: 's1' })),
      { cargos: CARGOS, situacao: 'ativos' });
    expect(a).toMatchObject({ equipe_id: 'e1', setor_id: 's1' });
  });

  it('o cargo filtrado é o do mês: quem virou líder depois conta como operador', () => {
    const r = retrato(pessoa({ id: 'virou', perfil: 'operador' }), pessoa({ id: 'adm', perfil: 'administrador' }));
    expect(pessoasDoMes([], r, { cargos: CARGOS, situacao: 'ativos' }).map(p => p.id)).toEqual(['virou']);
  });

  it('ordena por nome', () => {
    const r = retrato(pessoa({ id: '1', nome: 'Zé' }), pessoa({ id: '2', nome: 'Ana' }));
    expect(pessoasDoMes([], r, { cargos: CARGOS, situacao: 'ativos' }).map(p => p.nome)).toEqual(['Ana', 'Zé']);
  });
});

describe('passaNoFiltro', () => {
  it('ativo puro recusa desativado à mão', () => {
    expect(passaNoFiltro(pessoa({ id: 'a', ativo: false }), { cargos: CARGOS, situacao: 'ativo' })).toBe(false);
    expect(passaNoFiltro(pessoa({ id: 'a', ativo: false }), { cargos: CARGOS, situacao: 'ou_desligado' })).toBe(false);
  });
});

describe('pessoaDaLinha', () => {
  it('linha sem nome usa o login', () => {
    const p = pessoaDaLinha({
      operador_id: 'a', nome: null, usuario: 'ana.s', cargo: 'operador', foto_url: null,
      setor_id: null, equipe_id: null, situacao: null, ativo: null, desligado_em: null,
    });
    expect(p).toMatchObject({ nome: 'ana.s', situacao: 'ativo', ativo: true });
  });
});

describe('nomeNoMes', () => {
  it('troca pelo nome do mês só quando a pessoa está no retrato', () => {
    const r = retrato(pessoa({ id: 'a', nome: 'Ana' }));
    expect(nomeNoMes(r, 'a', 'Ana Nova')).toBe('Ana');
    expect(nomeNoMes(r, 'b', 'Bia')).toBe('Bia');
    expect(nomeNoMes(null, 'a', 'Ana Nova')).toBe('Ana Nova');
  });
});
