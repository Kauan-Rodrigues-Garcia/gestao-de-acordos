/**
 * A régua do menu, agora usada por duas telas.
 *
 * `abasDoMenu` pinta a barra lateral de quem está logado E a prévia por cargo
 * do editor de ordem. Antes da separação (24/08/2026) o filtro morava dentro do
 * `Layout` e só respondia pela pessoa logada; o editor mostrava as abas de quem
 * estava editando — super_admin — e a ordem montada ali valia para o operador,
 * que vê seis abas e não catorze.
 *
 * Os testes abaixo travam o que a prévia precisa acertar: a resposta muda com o
 * CARGO, com a operação e com os dois gates que não são permissão.
 */
import { describe, it, expect } from 'vitest';
import { abasDoMenu, ticketsVisivelParaCargo, NAV_ITEMS, type ContextoMenu } from './menuLateral';
import { ordemDoCargo, CARGO_GERAL } from '@/services/menuLateral.service';

/** Contexto de um cargo que pode tudo, para o teste dizer o que ele nega. */
function ctx(over: Partial<ContextoMenu> = {}): ContextoMenu {
  return {
    cargo: 'super_admin',
    isPaguePlay: false,
    isBookplay: true,
    temPermissao: () => true,
    acessoOuvidoria: false,
    acessoTickets: true,
    ...over,
  };
}

const rotulos = (itens: { label: string }[]) => itens.map(i => i.label);

describe('abasDoMenu', () => {
  it('a permissão desligada tira o item, mesmo quando o cargo está na lista', () => {
    const semAcordos = abasDoMenu(ctx({
      cargo: 'operador',
      temPermissao: chave => chave !== 'ver_acordos',
    }));
    expect(rotulos(semAcordos)).not.toContain('Acordos');
  });

  it('o cargo decide os itens que não declaram permissão', () => {
    // Dashboard não tem `permissaoKey`: quem responde é a lista de cargos, e
    // `rh` não está nela.
    const rh = abasDoMenu(ctx({ cargo: 'rh' }));
    expect(rotulos(rh)).not.toContain('Dashboard');
    expect(rotulos(abasDoMenu(ctx({ cargo: 'operador' })))).toContain('Dashboard');
  });

  it('PaguePlay não tem Acordos, Novo Acordo nem Campanha Fácil', () => {
    const pp = rotulos(abasDoMenu(ctx({ isPaguePlay: true, isBookplay: false })));
    expect(pp).not.toContain('Acordos');
    expect(pp).not.toContain('Novo Acordo');
    expect(pp).not.toContain('Campanha Fácil');
  });

  it('Ouvidoria e Solicitar Atendimento só existem na PaguePlay', () => {
    const bp = rotulos(abasDoMenu(ctx({ cargo: 'ouvidoria' })));
    expect(bp).not.toContain('Ouvidoria');
    expect(bp).not.toContain('Solicitar Atendimento');

    const pp = rotulos(abasDoMenu(ctx({
      cargo: 'ouvidoria', isPaguePlay: true, isBookplay: false,
    })));
    expect(pp).toContain('Ouvidoria');
    expect(pp).toContain('Solicitar Atendimento');
  });

  /*
   * ⚠️ Comportamento ATUAL, e provavelmente não o pretendido.
   *
   * O comentário do item promete que a concessão em `ouvidoria_acessos` vale
   * «por cima» da permissão, como caminho extra. Não vale: a checagem genérica
   * de `permissaoKey` roda ANTES e já descarta o item, então o `||` do caso
   * especial só é alcançado quando `ver_ouvidoria` já é verdadeiro — o segundo
   * operando nunca decide nada.
   *
   * O teste trava o que o código FAZ, e não o que o comentário diz, para a
   * mudança ser uma decisão explícita de quem for corrigir. Comportamento
   * herdado do `Layout`; a extração para cá não mexeu nele.
   */
  it('hoje a concessão individual da Ouvidoria NÃO substitui a permissão', () => {
    const so = rotulos(abasDoMenu(ctx({
      cargo: 'operador', isPaguePlay: true, isBookplay: false,
      temPermissao: chave => chave !== 'ver_ouvidoria',
      acessoOuvidoria: true,
    })));
    expect(so).not.toContain('Ouvidoria');
  });

  it('Tickets depende do interruptor da empresa, e não só da permissão', () => {
    const fechado = rotulos(abasDoMenu(ctx({ cargo: 'lider', acessoTickets: false })));
    expect(fechado).not.toContain('Tickets');
    expect(rotulos(abasDoMenu(ctx({ cargo: 'lider', acessoTickets: true })))).toContain('Tickets');
  });

  it('a ordem devolvida é a do código — quem reordena é `ordenarMenu`', () => {
    const todas = abasDoMenu(ctx());
    const posicoes = todas.map(i => NAV_ITEMS.findIndex(n => n.to === i.to));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });
});

/*
 * `ticketsVisivelParaCargo` recebe `temPermissao`, e não `cargo`, desde
 * 24/08/2026. Tickets era o único módulo cujo acesso vivia inteiramente fora do
 * painel; agora as duas portas são chaves — `tickets_administrar` e
 * `tickets_abrir` —, e a prévia por cargo do editor pergunta as mesmas.
 */
describe('ticketsVisivelParaCargo', () => {
  /** Um `temPermissao` que concede só as chaves listadas. */
  const com = (...chaves: string[]) => (c: string) => chaves.includes(c);

  it('quem administra a fila vê com a chave da empresa fechada', () => {
    expect(ticketsVisivelParaCargo(com('tickets_administrar'), false)).toBe(true);
    // Acesso total responde `true` para as duas — e a primeira já basta.
    expect(ticketsVisivelParaCargo(com('tickets_administrar', 'tickets_abrir'), false))
      .toBe(true);
  });

  it('quem só abre chamado entra quando a chave da empresa é virada', () => {
    expect(ticketsVisivelParaCargo(com('tickets_abrir'), false)).toBe(false);
    expect(ticketsVisivelParaCargo(com('tickets_abrir'), true)).toBe(true);
  });

  it('sem nenhuma das duas não vê, nem com a chave aberta', () => {
    expect(ticketsVisivelParaCargo(com(), true)).toBe(false);
  });
});

describe('ordemDoCargo', () => {
  it('a ordem própria do cargo vence a geral', () => {
    const ordens = { [CARGO_GERAL]: ['/a', '/b'], operador: ['/b', '/a'] };
    expect(ordemDoCargo(ordens, 'operador')).toEqual(['/b', '/a']);
  });

  it('sem ordem própria, o cargo herda a geral', () => {
    expect(ordemDoCargo({ [CARGO_GERAL]: ['/a', '/b'] }, 'lider')).toEqual(['/a', '/b']);
  });

  it('array vazio conta como AUSÊNCIA, e devolve o cargo à geral', () => {
    // Não há policy de DELETE nesta tabela: «desfazer» é gravar `[]`. Se vazio
    // valesse como ordem, desfazer deixaria o cargo com um menu sem abas.
    const ordens = { [CARGO_GERAL]: ['/a', '/b'], operador: [] };
    expect(ordemDoCargo(ordens, 'operador')).toEqual(['/a', '/b']);
  });

  it('sem nada salvo, devolve vazio — que é a ordem do código', () => {
    expect(ordemDoCargo({}, 'operador')).toEqual([]);
    expect(ordemDoCargo({ [CARGO_GERAL]: [] }, 'operador')).toEqual([]);
  });
});
