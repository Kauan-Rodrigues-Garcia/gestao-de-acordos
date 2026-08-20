/**
 * escopoDoPainel.test.ts
 *
 * Estes testes trancam os quatro defeitos que existiam de verdade em 17/08/2026,
 * todos na mesma pergunta respondida em quatro lugares diferentes. Cada `it`
 * abaixo falharia no código anterior.
 */
import { describe, it, expect } from 'vitest';
import { resolverEscopoPainel } from './escopoDoPainel';
import type { EquipeAnalitico } from '@/services/analitico/analitico.service';

const EQUIPES = [
  { id: 'eqA1', nome: 'Play 4',  setor_id: 'setorA' },
  { id: 'eqA2', nome: 'Play 5',  setor_id: 'setorA' },
  { id: 'eqB1', nome: 'Digital', setor_id: 'setorB' },
] as unknown as EquipeAnalitico[];

const SEM_PERMISSAO = () => false;
const COM_VISAO_GLOBAL = (chave: string) =>
  chave === 'painel_lider_todos_setores';

function escopo(over: Partial<Parameters<typeof resolverEscopoPainel>[0]> = {}) {
  return resolverEscopoPainel({
    cargo: 'lider',
    temPermissao: SEM_PERMISSAO,
    setorDoPerfil: 'setorA',
    setorEscolhido: null,
    equipeEscolhida: null,
    equipes: EQUIPES,
    ...over,
  });
}

describe('quem enxerga a empresa toda', () => {
  /**
   * O defeito principal: a diretoria via UM setor. O pai dizia "todos" com
   * `null` e o filho completava com o setor do perfil.
   */
  it('diretoria autorizada sem escolha vê TODOS os setores', () => {
    const r = escopo({
      cargo: 'diretoria',
      temPermissao: COM_VISAO_GLOBAL,
      setorDoPerfil: 'setorA',      // era o valor de preenchimento que vazava
      setorEscolhido: null,
    });
    expect(r.setorId).toBeNull();
    expect(r.podeFiltrarSetor).toBe(true);
  });

  it('super_admin e administrador também dependem da matriz', () => {
    for (const cargo of ['super_admin', 'administrador']) {
      expect(escopo({ cargo, temPermissao: COM_VISAO_GLOBAL, setorEscolhido: null }).setorId).toBeNull();
      expect(escopo({ cargo, temPermissao: SEM_PERMISSAO }).podeFiltrarSetor).toBe(false);
    }
  });

  it('escolher um setor estreita de verdade', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL, setorEscolhido: 'setorB' });
    expect(r.setorId).toBe('setorB');
  });

  /**
   * `QuartisOperadores` decidia por lista de cargo escrita à mão. Gerência com
   * `ver_todos_setores` recebia `null` do pai — vendo tudo — e não ganhava
   * filtro: via a empresa inteira sem poder estreitar.
   */
  it('gerência COM escopo total do Painel Líder ganha o filtro', () => {
    const r = escopo({
      cargo: 'gerencia',
      temPermissao: (c) => c === 'painel_lider_todos_setores',
    });
    expect(r.podeFiltrarSetor).toBe(true);
  });

  it('uma permissão global legada não abre o Painel Líder', () => {
    const r = escopo({
      cargo: 'gerencia',
      temPermissao: (c) => c === 'ver_analiticos_global',
    });
    expect(r.podeFiltrarSetor).toBe(false);
  });
});

describe('quem só enxerga o próprio setor', () => {
  it('fica travado no setor do perfil e não vê o seletor', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA' });
    expect(r.setorId).toBe('setorA');
    expect(r.podeFiltrarSetor).toBe(false);
  });

  /**
   * Se a permissão cair enquanto a tela está aberta, o valor escolhido antes não
   * pode continuar valendo — seria um escopo mais amplo do que a pessoa tem
   * direito, sobrevivendo à revogação.
   */
  it('escolha anterior não sobrevive à perda da permissão', () => {
    const r = escopo({
      cargo: 'lider',
      temPermissao: SEM_PERMISSAO,
      setorDoPerfil: 'setorA',
      setorEscolhido: 'setorB',     // escolhido quando ainda podia
    });
    expect(r.setorId).toBe('setorA');
  });

  it('o próprio setor não conta como "filtro ativo"', () => {
    // Para quem nunca teve a opção, "limpar filtros" não deve oferecer remover
    // o próprio escopo — não há o que limpar.
    expect(escopo({ cargo: 'lider' }).temFiltroAtivo).toBe(false);
  });
});

describe('filtro de equipe', () => {
  it('lista só as equipes do setor em foco', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL, setorEscolhido: 'setorA' });
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqA1', 'eqA2']);
  });

  it('sem setor em foco, lista as equipes de todos os setores', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL, setorEscolhido: null });
    expect(r.equipesDisponiveis).toHaveLength(3);
  });

  /**
   * Trocar o setor deixava uma equipe do setor anterior selecionada. O
   * cruzamento devolvia lista vazia, e a tela dizia "nenhum operador
   * encontrado" — parecendo dado, sendo filtro impossível.
   */
  it('equipe de outro setor é descartada ao trocar o setor', () => {
    const r = escopo({
      cargo: 'diretoria',
      temPermissao: COM_VISAO_GLOBAL,
      setorEscolhido: 'setorB',
      equipeEscolhida: 'eqA1',      // ficou do setor anterior
    });
    expect(r.equipeId).toBeNull();
  });

  it('equipe do setor em foco sobrevive', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL,
      setorEscolhido: 'setorA', equipeEscolhida: 'eqA2',
    });
    expect(r.equipeId).toBe('eqA2');
    expect(r.temFiltroAtivo).toBe(true);
  });

  it('equipe inexistente é descartada', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL, equipeEscolhida: 'eqFantasma' });
    expect(r.equipeId).toBeNull();
  });

  it('líder travado no setor pode filtrar equipe do setor dele', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA', equipeEscolhida: 'eqA1' });
    expect(r.equipeId).toBe('eqA1');
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqA1', 'eqA2']);
  });

  it('líder não consegue filtrar equipe de outro setor', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA', equipeEscolhida: 'eqB1' });
    expect(r.equipeId).toBeNull();
  });
});

describe('cúpula sem setor no perfil', () => {
  /**
   * Depois da migration 20260817160000 o `setorDoPerfil` da cúpula é nulo. O
   * escopo tem de continuar valendo "todos" — e não virar um `undefined` que
   * algum filho complete de novo.
   */
  it('setor nulo no perfil continua significando todos os setores', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: COM_VISAO_GLOBAL, setorDoPerfil: null, setorEscolhido: null });
    expect(r.setorId).toBeNull();
    expect(r.equipesDisponiveis).toHaveLength(3);
  });

  it('e ainda pode escolher um setor específico', () => {
    const r = escopo({ cargo: 'super_admin', temPermissao: COM_VISAO_GLOBAL, setorDoPerfil: null, setorEscolhido: 'setorB' });
    expect(r.setorId).toBe('setorB');
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqB1']);
  });
});
