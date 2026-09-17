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

/*
 * O escopo desta tela saiu do CARGO e foi para as chaves da aba. Antes,
 * `diretoria` recebia "todos os setores" por estar numa lista dentro do
 * codigo; agora recebe porque a permissao esta ligada — e por isso da para
 * desliga-la sem mexer no codigo, que era o pedido.
 *
 * Os cargos continuam nos casos abaixo por legibilidade: eles dizem QUEM esta
 * olhando. Quem decide o alcance e o `temPermissao`.
 */
const SEM_PERMISSAO = () => false;

/** Tem a aba e enxerga o proprio setor. O caso do lider. */
const SO_SETOR = (c: string) => c === 'ver_painel_lider' || c === 'painel_lider_escopo_setor';

/** Tem a aba e enxerga todos os setores. O caso da diretoria. */
const VE_TUDO = (c: string) =>
  c === 'ver_painel_lider' || c === 'painel_lider_escopo_setor'
  || c === 'painel_lider_escopo_todos_setores';

function escopo(over: Partial<Parameters<typeof resolverEscopoPainel>[0]> = {}) {
  return resolverEscopoPainel({
    cargo: 'lider',
    temPermissao: SO_SETOR,
    setorDoPerfil: 'setorA',
    setoresEscolhidos: [],
    equipesEscolhidas: [],
    equipes: EQUIPES,
    ...over,
  });
}

describe('quem enxerga a empresa toda', () => {
  /**
   * O defeito principal: a diretoria via UM setor. O pai dizia "todos" com
   * `null` e o filho completava com o setor do perfil.
   */
  it('diretoria sem escolha vê TODOS os setores, não o setor do próprio perfil', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setorDoPerfil: 'setorA',      // era o valor de preenchimento que vazava
      setoresEscolhidos: [],
    });
    expect(r.setorIds).toEqual([]);
    expect(r.podeFiltrarSetor).toBe(true);
  });

  it('super_admin e administrador também', () => {
    for (const cargo of ['super_admin', 'administrador']) {
      expect(escopo({ cargo, temPermissao: VE_TUDO, setoresEscolhidos: [] }).setorIds).toEqual([]);
    }
  });

  it('escolher um setor estreita de verdade', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, setoresEscolhidos: ['setorB'] });
    expect(r.setorIds).toEqual(['setorB']);
  });

  /**
   * `QuartisOperadores` decidia por lista de cargo escrita à mão. Gerência com
   * alcance amplo recebia `null` do pai — vendo tudo — e não ganhava filtro:
   * via a empresa inteira sem poder estreitar. Agora quem abre é a chave da
   * própria aba.
   */
  it('gerência com a chave da aba ganha o filtro', () => {
    const r = escopo({ cargo: 'gerencia', temPermissao: VE_TUDO });
    expect(r.podeFiltrarSetor).toBe(true);
  });

  /*
   * O contrato da reestruturação, do lado de dentro desta tela: as chaves
   * GLOBAIS pararam de mandar aqui. Enquanto elas existirem no catálogo — e
   * elas ainda decidem Dashboard, Analítico e Recebimento — este teste é o que
   * garante que não voltaram a decidir o Painel Líder pelas costas.
   */
  it('as chaves globais antigas NÃO abrem mais o filtro', () => {
    for (const global of ['ver_todos_setores', 'ver_analiticos_global', 'ver_acordos_gerais']) {
      const r = escopo({
        cargo: 'gerencia',
        temPermissao: (c) => c === 'ver_painel_lider' || c === global,
      });
      expect(r.podeFiltrarSetor, global).toBe(false);
    }
  });

  /* Escopo amplo em OUTRA aba não abre nada aqui. */
  it('escopo amplo em outra aba não vaza para o Painel Líder', () => {
    const r = escopo({
      cargo: 'gerencia',
      temPermissao: (c) => c === 'ver_painel_lider'
        || c === 'lixeira_escopo_todos_setores'
        || c === 'acordos_escopo_todos_setores',
    });
    expect(r.podeFiltrarSetor).toBe(false);
  });
});

describe('quem só enxerga o próprio setor', () => {
  it('fica travado no setor do perfil e não vê o seletor', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA' });
    expect(r.setorIds).toEqual(['setorA']);
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
      temPermissao: SEM_PERMISSAO,   // a chave da aba caiu junto
      setorDoPerfil: 'setorA',
      setoresEscolhidos: ['setorB'],     // escolhido quando ainda podia
    });
    expect(r.setorIds).toEqual(['setorA']);
  });

  it('o próprio setor não conta como "filtro ativo"', () => {
    // Para quem nunca teve a opção, "limpar filtros" não deve oferecer remover
    // o próprio escopo — não há o que limpar.
    expect(escopo({ cargo: 'lider' }).temFiltroAtivo).toBe(false);
  });
});

describe('filtro de equipe', () => {
  it('lista só as equipes do setor em foco', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, setoresEscolhidos: ['setorA'] });
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqA1', 'eqA2']);
  });

  it('sem setor em foco, lista as equipes de todos os setores', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, setoresEscolhidos: [] });
    expect(r.equipesDisponiveis).toHaveLength(3);
  });

  /**
   * Trocar o setor deixava uma equipe do setor anterior selecionada. O
   * cruzamento devolvia lista vazia, e a tela dizia "nenhum operador
   * encontrado" — parecendo dado, sendo filtro impossível.
   */
  it('equipe de outro setor é descartada ao trocar o setor', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setoresEscolhidos: ['setorB'],
      equipesEscolhidas: ['eqA1'],      // ficou do setor anterior
    });
    expect(r.equipeIds).toEqual([]);
  });

  it('equipe do setor em foco sobrevive', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO, setoresEscolhidos: ['setorA'], equipesEscolhidas: ['eqA2'],
    });
    expect(r.equipeIds).toEqual(['eqA2']);
    expect(r.temFiltroAtivo).toBe(true);
  });

  it('equipe inexistente é descartada', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, equipesEscolhidas: ['eqFantasma'] });
    expect(r.equipeIds).toEqual([]);
  });

  it('líder travado no setor pode filtrar equipe do setor dele', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA', equipesEscolhidas: ['eqA1'] });
    expect(r.equipeIds).toEqual(['eqA1']);
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqA1', 'eqA2']);
  });

  it('líder não consegue filtrar equipe de outro setor', () => {
    const r = escopo({ cargo: 'lider', setorDoPerfil: 'setorA', equipesEscolhidas: ['eqB1'] });
    expect(r.equipeIds).toEqual([]);
  });
});

describe('cúpula sem setor no perfil', () => {
  /**
   * Depois da migration 20260817160000 o `setorDoPerfil` da cúpula é nulo. O
   * escopo tem de continuar valendo "todos" — e não virar um `undefined` que
   * algum filho complete de novo.
   */
  it('setor nulo no perfil continua significando todos os setores', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, setorDoPerfil: null, setoresEscolhidos: [] });
    expect(r.setorIds).toEqual([]);
    expect(r.equipesDisponiveis).toHaveLength(3);
  });

  it('e ainda pode escolher um setor específico', () => {
    const r = escopo({ cargo: 'super_admin', temPermissao: VE_TUDO, setorDoPerfil: null, setoresEscolhidos: ['setorB'] });
    expect(r.setorIds).toEqual(['setorB']);
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqB1']);
  });
});

/*
 * Marcação múltipla (17/09/2026). O filtro deixou de escolher um item de cada
 * vez: marcar três setores tem de mostrar exatamente esses três, e não o
 * primeiro nem todos.
 */
describe('marcação múltipla', () => {
  it('vários setores marcados sobrevivem inteiros', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setoresEscolhidos: ['setorA', 'setorB'],
    });
    expect(r.setorIds).toEqual(['setorA', 'setorB']);
    expect(r.setorUnico).toBeNull();
    expect(r.temFiltroAtivo).toBe(true);
  });

  it('as equipes oferecidas são a união das dos setores marcados', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setoresEscolhidos: ['setorA', 'setorB'],
    });
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqA1', 'eqA2', 'eqB1']);
  });

  it('só a equipe fora dos setores marcados é descartada — as outras ficam', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setoresEscolhidos: ['setorA'],
      equipesEscolhidas: ['eqA1', 'eqB1', 'eqA2'],
    });
    expect(r.equipeIds).toEqual(['eqA1', 'eqA2']);
  });

  it('id repetido não entra duas vezes', () => {
    const r = escopo({
      cargo: 'diretoria', temPermissao: VE_TUDO,
      setoresEscolhidos: ['setorA', 'setorA'],
    });
    expect(r.setorIds).toEqual(['setorA']);
  });

  it('um setor marcado ainda é o caso de sempre', () => {
    const r = escopo({ cargo: 'diretoria', temPermissao: VE_TUDO, setoresEscolhidos: ['setorB'] });
    expect(r.setorUnico).toBe('setorB');
    expect(r.equipesDisponiveis.map(e => e.id)).toEqual(['eqB1']);
  });

  it('líder travado não ganha os setores que marcou por fora', () => {
    const r = escopo({
      cargo: 'lider', setorDoPerfil: 'setorA',
      setoresEscolhidos: ['setorA', 'setorB'],
    });
    expect(r.setorIds).toEqual(['setorA']);
  });
});
