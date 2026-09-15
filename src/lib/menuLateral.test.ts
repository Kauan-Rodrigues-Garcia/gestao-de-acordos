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
import { ROUTE_PATHS } from './index';
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
  /*
   * A identidade de uma aba é a ROTA, e não o rótulo.
   *
   * Até a Fase 9 dava para conferir por rótulo, porque cada nome existia num
   * produto só. Desde então há «Painel Líder» e «Lixeira» nos dois — telas
   * diferentes, em endereços diferentes, com o mesmo nome na barra, porque a
   * pergunta que elas respondem é a mesma em cada operação.
   *
   * Conferir por rótulo agora daria um teste que passa quando o Comercial
   * ganha o painel DA COBRANÇA — exatamente o vazamento que este bloco existe
   * para impedir.
   */
  const rotas = (itens: { to: string }[]) => itens.map(i => i.to);

  it('o Comercial não alcança nenhuma ROTA de cobrança, nem com super_admin', () => {
    const daCobranca = NAV_ITEMS
      .filter(i => i.produtos?.includes('cobranca') && !i.produtos?.includes('comercial'))
      .map(i => i.to);
    // A lista não é escrita à mão: ela sai de `NAV_ITEMS`, e por isso uma aba
    // de cobrança criada amanhã já nasce coberta por este teste.
    expect(daCobranca.length).toBeGreaterThan(5);

    const noComercial = rotas(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    for (const rota of daCobranca) {
      expect(noComercial, `${rota} vazou para o Comercial`).not.toContain(rota);
    }
  });

  it('o Comercial vê o que toda operação precisa', () => {
    const abas = rotulos(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    expect(abas).toEqual(expect.arrayContaining(['Dashboard', 'Usuários', 'Configurações']));
  });

  /*
   * As quatro heranças da Fase 9.
   *
   * Painel Líder, Painel Diretoria, Lixeira e Desafios existem nas duas
   * operações com CHAVE compartilhada e ROTA própria. O teste fixa as duas
   * metades: a rota é a do Comercial, e a de cobrança continua fora.
   */
  it('a herança da Fase 9 chega pelo endereço do Comercial, não pelo da cobrança', () => {
    const abas = abasDoMenu(ctx({ produto: 'comercial', isBookplay: false }));
    const porRotulo = (label: string) => abas.filter(i => i.label === label).map(i => i.to);

    expect(porRotulo('Painel Líder')).toEqual([ROUTE_PATHS.VENDAS_PAINEL_LIDER]);
    expect(porRotulo('Painel Diretoria')).toEqual([ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA]);
    expect(porRotulo('Lixeira')).toEqual([ROUTE_PATHS.VENDAS_LIXEIRA]);
    expect(porRotulo('Desafios')).toEqual([ROUTE_PATHS.VENDAS_DESAFIOS]);

    // E a cobrança não ganhou as do Comercial de volta.
    const naCobranca = abasDoMenu(ctx({ produto: 'cobranca', isBookplay: true }));
    for (const rota of [
      ROUTE_PATHS.VENDAS_PAINEL_LIDER, ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA,
      ROUTE_PATHS.VENDAS_LIXEIRA, ROUTE_PATHS.VENDAS_DESAFIOS, ROUTE_PATHS.VENDAS,
    ]) {
      expect(naCobranca.map(i => i.to)).not.toContain(rota);
    }
  });

  /*
   * Tickets é a única aba de tela ÚNICA compartilhada pelas duas operações.
   *
   * Uma rota só, um componente só — porque chamado, fila, atendente e chat não
   * têm vocabulário de produto. O que tinha eram duas categorias do
   * formulário, e elas passaram a declarar produto em `Tickets/categorias.ts`.
   */
  it('Tickets é a mesma rota nas duas operações, e some no RH', () => {
    const noComercial = rotas(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    const naCobranca  = rotas(abasDoMenu(ctx({ produto: 'cobranca', isBookplay: true })));
    expect(noComercial).toContain(ROUTE_PATHS.TICKETS);
    expect(naCobranca).toContain(ROUTE_PATHS.TICKETS);

    // O RH não tem tela nenhuma ainda: uma aba que apareça lá é uma aba que
    // ninguém revisou, aparecendo para ninguém.
    expect(rotas(abasDoMenu(ctx({ produto: 'rh', isBookplay: false }))))
      .not.toContain(ROUTE_PATHS.TICKETS);
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
 * O Núcleo de Inteligência e Gestão, depois do cargo próprio.
 *
 * Não há mais eixo de setor no menu: o Assistente ADM enxerga o que o cargo dele
 * libera, como qualquer outro. Estes testes travam o que o padrão do catálogo
 * produz para ele — e o que continua valendo para a cobrança.
 */
describe('abasDoMenu — o cargo do Núcleo', () => {
  /** O que o Assistente ADM nasce podendo, direto do catálogo. */
  const doAssistenteAdm = (chave: string) => [
    'ver_dashboard_adm', 'ver_controle_numeros', 'numeros_administrar',
    'numeros_liberar_ao_setor', 'ver_meus_chips', 'chips_escopo_setor',
  ].includes(chave);

  it('o Assistente ADM recebe o Núcleo, e não a cobrança', () => {
    const abas = rotulos(abasDoMenu(ctx({ cargo: 'assistente_adm', temPermissao: doAssistenteAdm })));
    // O painel dele é a aba própria desde 11/09/2026; o Dashboard da cobrança saiu.
    expect(abas).toContain('Dashboard – ADM');
    expect(abas).toContain('Controle de Números');
    expect(abas).toContain('Meus Chips');
    for (const proibida of [
      'Dashboard', 'Acordos', 'Novo Acordo', 'Analítico', 'Lixeira',
      'Importar Excel', 'Campanha Fácil', 'Painel Líder', 'Painel Diretoria',
    ]) {
      expect(abas, `${proibida} não é do Núcleo`).not.toContain(proibida);
    }
  });

  it('a chave desligada continua mandando', () => {
    const semAba = rotulos(abasDoMenu(ctx({ temPermissao: chave => chave !== 'ver_controle_numeros' })));
    expect(semAba).not.toContain('Controle de Números');
  });
});
