import { describe, expect, it } from 'vitest';
import { separarPorCargo } from '../cargos-ordem';

const p = (nome: string, perfil: string) => ({ nome, perfil });

describe('separarPorCargo', () => {
  it('gerência primeiro, depois líderes, elite, e a operação por último', () => {
    const blocos = separarPorCargo([
      p('Zeca', 'operador'), p('Ana', 'elite'), p('Bia', 'lider'),
      p('Caio', 'gerencia'), p('Duda', 'operador'),
    ]);
    expect(blocos.map(b => b.rotulo)).toEqual(['Gerência', 'Líderes', 'Elite', 'Operação']);
    expect(blocos.at(-1)?.pessoas.map(x => x.nome)).toEqual(['Duda', 'Zeca']);
  });

  it('bloco vazio não aparece', () => {
    expect(separarPorCargo([p('Ana', 'operador')]).map(b => b.chave)).toEqual(['operador']);
  });

  it('administrador e super admin dividem o bloco do topo', () => {
    const blocos = separarPorCargo([p('B', 'administrador'), p('A', 'super_admin'), p('C', 'gerencia')]);
    expect(blocos[0].rotulo).toBe('Administração');
    expect(blocos[0].pessoas.map(x => x.nome)).toEqual(['A', 'B']);
  });

  it('cargo desconhecido não some: entra antes da operação', () => {
    const blocos = separarPorCargo([p('Op', 'operador'), p('Novo', 'cargo_novo'), p('Li', 'lider')]);
    expect(blocos.map(b => b.chave)).toEqual(['lider', 'cargo_novo', 'operador']);
  });

  it('ordem alfabética dentro do bloco respeita acento', () => {
    const blocos = separarPorCargo([p('Érica', 'operador'), p('Eduardo', 'operador'), p('Fábio', 'operador')]);
    expect(blocos[0].pessoas.map(x => x.nome)).toEqual(['Eduardo', 'Érica', 'Fábio']);
  });
});
