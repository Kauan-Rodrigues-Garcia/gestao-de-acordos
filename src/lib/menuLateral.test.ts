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
    produto: 'cobranca',
    isPaguePlay: false,
    isBookplay: true,
    temPermissao: () => true,
    acessoTickets: true,
    // O padrao e alguem de FORA do Nucleo: e a esmagadora maioria, e e o
    // comportamento que os testes anteriores a 10/09/2026 assumiam.
    souDoNucleo: false,
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

  it('a permissão do Dashboard decide a tela inicial em qualquer cargo', () => {
    const semDashboard = abasDoMenu(ctx({
      cargo: 'rh',
      temPermissao: chave => chave !== 'ver_dashboard',
    }));
    expect(rotulos(semDashboard)).not.toContain('Dashboard');
    expect(rotulos(abasDoMenu(ctx({ cargo: 'rh' })))).toContain('Dashboard');
  });

  it('PaguePlay não tem Acordos, Novo Acordo nem Campanha Fácil', () => {
    const pp = rotulos(abasDoMenu(ctx({ isPaguePlay: true, isBookplay: false })));
    expect(pp).not.toContain('Acordos');
    expect(pp).not.toContain('Novo Acordo');
    expect(pp).not.toContain('Campanha Fácil');
  });

  it('Solicitar Atendimento só existe na PaguePlay', () => {
    const bp = rotulos(abasDoMenu(ctx({ cargo: 'ouvidoria' })));
    expect(bp).not.toContain('Solicitar Atendimento');

    const pp = rotulos(abasDoMenu(ctx({
      cargo: 'ouvidoria', isPaguePlay: true, isBookplay: false,
    })));
    expect(pp).toContain('Solicitar Atendimento');
  });

  /*
   * A aba Ouvidoria saiu do produto em 05/09/2026 — o código foi para
   * `arquivo-morto/ouvidoria/`. O CARGO `ouvidoria` continua existindo, e é
   * por isso que o teste acima ainda o usa como contexto: quem tinha esse cargo
   * continua trabalhando, só não tem mais essa aba.
   *
   * Nenhum produto, nenhum cargo, nenhuma permissão traz a aba de volta.
   */
  it('a aba Ouvidoria não existe mais para ninguém', () => {
    for (const contexto of [
      ctx({ cargo: 'ouvidoria' }),
      ctx({ cargo: 'ouvidoria', isPaguePlay: true, isBookplay: false }),
      ctx({ cargo: 'super_admin', isPaguePlay: true, isBookplay: false }),
    ]) {
      expect(rotulos(abasDoMenu(contexto))).not.toContain('Ouvidoria');
    }
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

/**
 * A régua de PRODUTO, que é de outra ordem que cargo e permissão.
 *
 * Cargo e permissão respondem «esta pessoa pode ver?». Produto responde «isto
 * sequer existe aqui?». O teste do super_admin do Comercial é o que importa:
 * ele pode tudo, e mesmo assim não vê Acordos — porque acordo não é coisa do
 * Comercial, e nenhuma permissão faz virar.
 */
describe('abasDoMenu — por produto', () => {
  it('o Comercial não vê nenhuma tela de cobrança, nem com super_admin', () => {
    const abas = rotulos(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    for (const daCobranca of [
      'Acordos', 'Novo Acordo', 'Painel Líder', 'Painel Diretoria',
      'Analítico', 'Campanha Fácil', 'Importar Excel', 'Metas',
      'Tickets', 'RH Gestão', 'Solicitar Atendimento',
    ]) {
      expect(abas).not.toContain(daCobranca);
    }
  });

  it('o Comercial vê o que toda operação precisa', () => {
    const abas = rotulos(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    expect(abas).toEqual(expect.arrayContaining(['Dashboard', 'Usuários', 'Configurações']));
    // Lixeira NÃO: ela lista acordos excluídos, não «coisas apagadas» em geral.
    expect(abas).not.toContain('Lixeira');
  });

  it('o RH se comporta igual ao Comercial — nenhum privilégio sobre a cobrança', () => {
    const abas = rotulos(abasDoMenu(ctx({ produto: 'rh', isBookplay: false })));
    expect(abas).not.toContain('Acordos');
    // `RH Gestão` é a gestão de pessoal DA cobrança, não a tela do produto RH.
    expect(abas).not.toContain('RH Gestão');
    expect(abas).toContain('Usuários');
  });

  it('produto desconhecido não mostra NADA', () => {
    // Empresa nova sem produto declarado. Vazio é o comportamento certo: o erro
    // fica visível, em vez de vazar a cobrança para uma operação qualquer.
    expect(rotulos(abasDoMenu(ctx({ produto: null })))).toEqual([]);
  });

  it('a cobrança continua exatamente como era', () => {
    const abas = rotulos(abasDoMenu(ctx({ produto: 'cobranca', isBookplay: true, isPaguePlay: false })));
    expect(abas).toEqual(expect.arrayContaining([
      'Dashboard', 'Acordos', 'Novo Acordo', 'Painel Líder', 'Analítico', 'Usuários',
    ]));
  });

  it('toda aba declara em que produto vive', () => {
    // A trava contra o esquecimento: aba nova sem `produtos` some do menu, e é
    // melhor descobrir isso aqui do que num relato de que «a aba não apareceu».
    for (const item of NAV_ITEMS) {
      expect(item.produtos, `«${item.label}» não declara produtos`).toBeDefined();
      expect(item.produtos!.length, `«${item.label}» declara lista vazia`).toBeGreaterThan(0);
    }
  });
});

/**
 * O terceiro eixo do menu: o SETOR.
 *
 * O Núcleo de Inteligência e Gestão é `cobranca` — mesma empresa, mesmo deploy —
 * e tem os mesmos cargos do Play 3. Nem o eixo de produto nem o de permissão o
 * separavam, e o resultado era ele abrindo a operação de cobrança inteira.
 *
 * Os testes abaixo travam os três estados de `souDoNucleo`, inclusive o `null`
 * da prévia por cargo — que não é um detalhe: sem ele, Controle de Números
 * sumiria do editor de ordem, e o que não aparece lá não pode ser reordenado.
 */
describe('abasDoMenu — o recorte por setor (Núcleo)', () => {
  const doNucleo   = () => rotulos(abasDoMenu(ctx({ souDoNucleo: true })));
  const daCobranca = () => rotulos(abasDoMenu(ctx({ souDoNucleo: false })));

  it('o Núcleo não recebe a operação de acordos', () => {
    const abas = doNucleo();
    for (const proibida of [
      'Acordos', 'Novo Acordo', 'Analítico', 'Lixeira',
      'Importar Excel', 'Campanha Fácil', 'Painel Líder', 'Painel Diretoria',
    ]) {
      expect(abas, `${proibida} não é do Núcleo`).not.toContain(proibida);
    }
  });

  it('o Núcleo recebe a aba dele', () => {
    expect(doNucleo()).toContain('Controle de Números');
  });

  it('Meus Chips é de quem RECEBE número, e não do Núcleo', () => {
    expect(doNucleo()).not.toContain('Meus Chips');
    expect(daCobranca()).toContain('Meus Chips');
  });

  it('a cobrança não perde nada, e não ganha a aba do Núcleo', () => {
    const abas = daCobranca();
    expect(abas).toContain('Acordos');
    expect(abas).toContain('Novo Acordo');
    expect(abas).toContain('Analítico');
    expect(abas).toContain('Lixeira');
    expect(abas).not.toContain('Controle de Números');
  });

  it('as abas de todo mundo ficam nos dois lados', () => {
    for (const comum of ['Dashboard', 'Usuários', 'Configurações']) {
      expect(doNucleo(), `${comum} existe para o Núcleo`).toContain(comum);
      expect(daCobranca(), `${comum} existe para a cobrança`).toContain(comum);
    }
  });

  it('`null` não filtra por setor — é a prévia por cargo do editor', () => {
    const previa = rotulos(abasDoMenu(ctx({ souDoNucleo: null })));
    expect(previa).toContain('Controle de Números');
    expect(previa).toContain('Acordos');
    expect(previa).toContain('Meus Chips');
  });

  it('o eixo do setor não é permissão: a chave desligada continua mandando', () => {
    const semAba = rotulos(abasDoMenu(ctx({
      souDoNucleo: true,
      temPermissao: chave => chave !== 'ver_controle_numeros',
    })));
    expect(semAba).not.toContain('Controle de Números');
  });

  it('a marca `nucleo` só aparece com um dos dois valores previstos', () => {
    for (const item of NAV_ITEMS) {
      if (item.nucleo !== undefined) {
        expect(['so', 'fora'], `${item.label} tem nucleo inválido`).toContain(item.nucleo);
      }
    }
  });
});
