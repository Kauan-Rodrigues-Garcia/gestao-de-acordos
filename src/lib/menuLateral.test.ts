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
import {
  abasDoMenu, agruparPorSecao, mostrarNovoAcordo, destinoNovoAcordo, ticketsVisivelParaCargo,
  NAV_ITEMS, SECOES_MENU, type ContextoMenu,
} from './menuLateral';
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

  it('a permissão do Início decide a tela inicial em qualquer cargo', () => {
    const semInicio = abasDoMenu(ctx({
      cargo: 'rh',
      temPermissao: chave => chave !== 'ver_dashboard',
    }));
    expect(rotulos(semInicio)).not.toContain('Início');
    expect(rotulos(abasDoMenu(ctx({ cargo: 'rh' })))).toContain('Início');
  });

  /*
   * Mapa de Abas (29/09/2026): a lista da PaguePlay morava dentro do
   * Dashboard e abria com `ver_dashboard`. Virou o item Acordos, com a mesma
   * chave — quem via a lista continua vendo, e quem não via continua sem.
   */
  it('PaguePlay tem Acordos pela chave do antigo Dashboard, e não tem Campanha Fácil nem Pix', () => {
    const pp = abasDoMenu(ctx({
      isPaguePlay: true, isBookplay: false,
      temPermissao: chave => chave !== 'ver_acordos',
    }));
    expect(pp.filter(i => i.label === 'Acordos')).toHaveLength(1);
    expect(pp.find(i => i.label === 'Acordos')?.permissaoKey).toBe('ver_dashboard');
    expect(rotulos(pp)).not.toContain('Campanha Fácil');
    expect(rotulos(pp)).not.toContain('Pix Automático');

    const bp = abasDoMenu(ctx());
    expect(bp.filter(i => i.label === 'Acordos')).toHaveLength(1);
    expect(bp.find(i => i.label === 'Acordos')?.permissaoKey).toBe('ver_acordos');
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
    expect(abas).toEqual(expect.arrayContaining(['Início', 'Pessoas', 'Configurações']));
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
    // Desafios deixou de ser item de menu em 16/09/2026: é aba do Painel Líder.
    expect(porRotulo('Desafios')).toEqual([]);

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
   * O menu do Comercial no desenho da BookPlay (16/09/2026).
   *
   * Quatro telas viraram abas de outra: Metas e Acompanhamento em Usuários,
   * Fechamento em Importar Vendas, Desafios no Painel Líder. Se uma delas
   * voltar a ganhar item próprio, o menu volta a ter duas portas para a mesma
   * tela — que é o que o pedido mandou desfazer.
   */
  it('o Comercial não tem item próprio para o que virou aba interna', () => {
    const noComercial = rotas(abasDoMenu(ctx({ produto: 'comercial', isBookplay: false })));
    for (const rota of [
      ROUTE_PATHS.VENDAS_METAS, ROUTE_PATHS.VENDAS_ACOMPANHAMENTO,
      ROUTE_PATHS.VENDAS_FECHAMENTO, ROUTE_PATHS.VENDAS_DESAFIOS,
      // 21/09/2026: «tira a aba Importar Vendas e joga o que tem dentro, de
      // forma estruturada, lá no painel diretoria». O relatório virou abas do
      // Painel Diretoria — uma por pergunta —, e `/vendas/importar` passou a
      // redirecionar para lá.
      ROUTE_PATHS.VENDAS_IMPORTAR,
    ]) {
      expect(noComercial, `${rota} voltou a ser item de menu`).not.toContain(rota);
    }
    expect(noComercial).toEqual(expect.arrayContaining([
      ROUTE_PATHS.VENDAS, ROUTE_PATHS.VENDAS_INDICACOES, ROUTE_PATHS.ADMIN_USUARIOS,
    ]));
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
    // `Fechamento do mês` (que trouxe o RH Gestão) é a gestão de pessoal DA
    // cobrança, não a tela do produto RH.
    expect(abas).not.toContain('Fechamento do mês');
    expect(abas).toContain('Pessoas');
  });

  it('produto desconhecido não mostra NADA', () => {
    // Empresa nova sem produto declarado. Vazio é o comportamento certo: o erro
    // fica visível, em vez de vazar a cobrança para uma operação qualquer.
    expect(rotulos(abasDoMenu(ctx({ produto: null })))).toEqual([]);
  });

  /*
   * O menu da cobrança depois do Mapa de Abas: 18 itens viraram 15, em cinco
   * seções, para quem pode tudo na BookPlay. Solicitar Atendimento é da
   * PaguePlay, e por isso não conta aqui.
   */
  it('a cobrança tem os 15 itens do Mapa de Abas, nas cinco seções', () => {
    const abas = abasDoMenu(ctx({ produto: 'cobranca', isBookplay: true, isPaguePlay: false }));
    expect(agruparPorSecao(abas).map(s => [s.rotulo, s.itens.map(i => i.label)])).toEqual([
      ['Operação', ['Início', 'Acordos', 'Pix Automático', 'Analítico', 'Desempenho']],
      ['Gestão', ['Pessoas', 'Fechamento do mês']],
      ['Ferramentas', ['Campanha Fácil', 'Meus Chips', 'Tickets', 'Modo TV']],
      ['Núcleo ADM', ['Núcleo']],
      ['Administração', ['Configurações', 'Dados e importações', 'Auditoria']],
    ]);
  });

  it('o que virou aba, botão ou redirecionamento não é mais item de menu', () => {
    const rotas = abasDoMenu(ctx()).map(i => i.to);
    for (const rota of [
      ROUTE_PATHS.ACORDO_NOVO, ROUTE_PATHS.IMPORTAR_EXCEL, ROUTE_PATHS.ADMIN_LIXEIRA,
      ROUTE_PATHS.PAINEL_LIDER, ROUTE_PATHS.PAINEL_DIRETORIA, ROUTE_PATHS.RH_GESTAO,
      ROUTE_PATHS.DASHBOARD_ADM, ROUTE_PATHS.CONTROLE_NUMEROS, ROUTE_PATHS.ADMIN_METAS,
    ]) {
      expect(rotas, `${rota} voltou a ser item de menu`).not.toContain(rota);
    }
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
    const contexto = ctx({ cargo: 'assistente_adm', temPermissao: doAssistenteAdm });
    const abas = rotulos(abasDoMenu(contexto));
    // Dashboard – ADM e Controle de Números viraram um item só (Mapa de Abas).
    expect(abas).toEqual(['Meus Chips', 'Núcleo']);
    expect(mostrarNovoAcordo(contexto)).toBe(false);
  });

  it('o Núcleo aparece com qualquer uma das duas chaves, e some sem as duas', () => {
    const so = (chave: string) => rotulos(abasDoMenu(ctx({ temPermissao: c => c === chave })));
    expect(so('ver_dashboard_adm')).toContain('Núcleo');
    expect(so('ver_controle_numeros')).toContain('Núcleo');
    const semAsDuas = rotulos(abasDoMenu(ctx({
      temPermissao: c => c !== 'ver_dashboard_adm' && c !== 'ver_controle_numeros',
    })));
    expect(semAsDuas).not.toContain('Núcleo');
  });

  it('o Núcleo não existe na PaguePlay', () => {
    expect(rotulos(abasDoMenu(ctx({ isPaguePlay: true, isBookplay: false })))).not.toContain('Núcleo');
  });
});

/**
 * As telas que o Mapa de Abas juntou aparecem quando sobra UMA aba — a mesma
 * régua que a tela usa (`lib/mapaAbas.ts`). O que se trava aqui é que cada
 * chave antiga continua abrindo o que abria, sem ninguém reconfigurar cargo.
 */
describe('abasDoMenu — as telas do Mapa de Abas', () => {
  const com = (...chaves: string[]) => (c: string) => chaves.includes(c);
  const menu = (...chaves: string[]) => rotulos(abasDoMenu(ctx({ cargo: 'operador', temPermissao: com(...chaves) })));

  it('o operador chega a Desempenho pelo Ranking do Analítico', () => {
    expect(menu('ver_analitico', 'analitico_sub_ranking')).toContain('Desempenho');
    expect(menu('ver_analitico', 'analitico_sub_desafios')).toContain('Desempenho');
    // O Analítico sozinho não tem nada de desempenho para mostrar.
    expect(menu('ver_analitico')).not.toContain('Desempenho');
  });

  it('o líder chega a Desempenho pelas abas do Painel Líder', () => {
    expect(menu('ver_painel_lider', 'painel_lider_sub_quartis')).toContain('Desempenho');
    expect(menu('ver_painel_lider', 'painel_lider_sub_desempenho_equipes')).toContain('Desempenho');
    expect(menu('ver_painel_lider')).not.toContain('Desempenho');
  });

  it('a diretoria da BookPlay chega a Desempenho pelo Painel Diretoria', () => {
    expect(menu('ver_painel_diretoria')).toContain('Desempenho');
  });

  it('Fechamento do mês abre com a chave do Fechamento OU a do RH Gestão', () => {
    expect(menu('ver_fechamento')).toContain('Fechamento do mês');
    expect(menu('ver_rh_gestao')).toContain('Fechamento do mês');
    expect(menu()).not.toContain('Fechamento do mês');
    // O Fechamento é da BookPlay; na PaguePlay só o RH abre a tela.
    const pp = (...chaves: string[]) => rotulos(abasDoMenu(ctx({
      isPaguePlay: true, isBookplay: false, temPermissao: com(...chaves),
    })));
    expect(pp('ver_fechamento')).not.toContain('Fechamento do mês');
    expect(pp('ver_rh_gestao')).toContain('Fechamento do mês');
  });

  it('Dados e importações precisa de uma aba de verdade, e não só de uma chave', () => {
    expect(menu('ver_banco_dados')).toContain('Dados e importações');
    // A diretoria da BookPlay tem `ver_painel_diretoria`, mas as abas técnicas
    // do 59 são de super_admin: ela não ganha um item vazio.
    expect(menu('ver_painel_diretoria')).not.toContain('Dados e importações');
  });

  it('Pix Automático e Auditoria obedecem às chaves de antes', () => {
    expect(menu('ver_pix_automatico')).toContain('Pix Automático');
    expect(menu('ver_logs')).toContain('Auditoria');
    expect(menu()).not.toContain('Pix Automático');
    expect(menu()).not.toContain('Auditoria');
  });
});

describe('o botão fixo «Novo acordo»', () => {
  it('obedece a `criar_acordos`, e só existe na cobrança', () => {
    expect(mostrarNovoAcordo(ctx())).toBe(true);
    expect(mostrarNovoAcordo(ctx({ temPermissao: c => c !== 'criar_acordos' }))).toBe(false);
    expect(mostrarNovoAcordo(ctx({ produto: 'comercial', isBookplay: false }))).toBe(false);
  });

  it('na PaguePlay leva à lista com o formulário aberto, e pede a chave da lista', () => {
    expect(destinoNovoAcordo(true)).toBe(`${ROUTE_PATHS.ACORDOS}?novoInline=1`);
    expect(destinoNovoAcordo(false)).toBe(ROUTE_PATHS.ACORDO_NOVO);
    expect(mostrarNovoAcordo(ctx({
      isPaguePlay: true, isBookplay: false, temPermissao: c => c !== 'ver_dashboard',
    }))).toBe(false);
  });
});

describe('as seções', () => {
  it('toda aba mora numa seção que existe', () => {
    const chaves = SECOES_MENU.map(s => s.chave) as readonly string[];
    for (const item of NAV_ITEMS) {
      expect(chaves, `«${item.label}» sem seção`).toContain(item.secao);
    }
  });

  it('seção sem item liberado não aparece', () => {
    const doOperador = abasDoMenu(ctx({
      cargo: 'operador', temPermissao: c => ['ver_dashboard', 'ver_acordos'].includes(c),
    }));
    expect(agruparPorSecao(doOperador).map(s => s.rotulo)).toEqual(['Operação']);
  });
});
