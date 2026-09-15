/**
 * permissoes-catalogo.test.ts
 *
 * Os dois testes de contrato que existem para um defeito não voltar.
 *
 * Antes de 2026-08-15 havia três listas de permissão — o catálogo da tela (26
 * chaves), o banco (29) e o que o código consultava (24) — e nenhuma mandava
 * nas outras. O resultado foram toggles que ligavam, desligavam e não mudavam
 * nada (`ver_acordos_proprios`, `ver_analiticos_setor`) e chaves no banco que a
 * tela nem mostrava (as de ouvidoria).
 *
 * Estes testes varrem o código de verdade. Se alguém acrescentar uma permissão
 * ao catálogo sem escrever o código que a consulta, ou fiscalizar uma chave que
 * o admin não tem como configurar, a CI para.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERMISSOES, CHAVES_PERMISSAO, PERMISSOES_POR_CHAVE,
  CARGOS_CONFIGURAVEIS, CARGOS_ACESSO_TOTAL, PERMISSOES_EXPLICITAS,
  catalogoDoTenant, gruposDoTenant, permissoesPadraoDoCargo,
  exigeConcessaoExplicita, produtosDaPermissao,
} from './permissoes-catalogo';
import { ABAS_COM_ESCOPO, chaveEscopo } from './permissoes-escopo';

const RAIZ_SRC = path.resolve(__dirname, '..');

/**
 * Arquivos ignorados na varredura:
 *  - o próprio catálogo e este teste (são a definição, não o consumo);
 *  - a tela de permissões (desenha o catálogo inteiro por construção);
 *  - qualquer `.test.`, que usa chave fictícia de propósito.
 */
function ignorado(arquivo: string): boolean {
  const p = arquivo.replace(/\\/g, '/');
  return p.includes('/lib/permissoes-catalogo')
    || p.includes('/pages/AdminPermissoes/')
    || /\.test\.(ts|tsx)$/.test(p);
}

function varrer(dir: string, saida: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p, saida);
    else if (/\.(ts|tsx)$/.test(e.name) && !ignorado(p)) saida.push(p);
  }
  return saida;
}

const CODIGO = varrer(RAIZ_SRC)
  .map(f => fs.readFileSync(f, 'utf8'))
  .join('\n');

/**
 * As chaves de escopo por aba nao aparecem literais em lugar nenhum: elas sao
 * montadas por `chaveEscopo(prefixo, nivel)`, e uma varredura textual nunca as
 * acharia.
 *
 * Conta-las como fiscalizadas so por existirem no registro seria afrouxar o
 * contrato — voltaria a permitir a chave decorativa que estes testes existem
 * para impedir. Entao a exigencia e outra, e mais forte: a aba so passa se o
 * app realmente chamar um dos resolvedores COM O NOME DELA. Aba registrada e
 * nunca consultada reprova, exatamente como uma chave solta reprovaria.
 */
function chavesDeEscopoResolvidas(): string[] {
  const achadas: string[] = [];
  for (const [aba, meta] of Object.entries(ABAS_COM_ESCOPO)) {
    // Sem regex de proposito: montar padrao com aspas dentro de aspas e o
    // tipo de coisa que passa no teste e falha em silencio depois.
    const alvos = [
      "escopoEfetivo('" + aba + "'",
      'escopoEfetivo("' + aba + '"',
      "niveisLiberados('" + aba + "'",
      'niveisLiberados("' + aba + '"',
    ];
    if (!alvos.some(a => CODIGO.includes(a))) continue;
    for (const nivel of meta.niveis) achadas.push(chaveEscopo(meta.prefixo, nivel));
  }
  return achadas;
}

/**
 * As chaves fiscalizadas dentro do BANCO.
 *
 * Nem toda permissão é lida pela tela. `mestre_importar_automatico` só existe
 * para uma conta de robô, e quem a exige são as três RPCs de importação do 59:
 *
 *     if not (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico'))
 *
 * Uma chave assim faz alguma coisa — só que no Postgres. Contá-la como
 * decorativa obrigaria a abrir uma exceção no teste, e exceção é como o
 * contrato começa a afrouxar. A varredura passa a olhar as migrations, que é
 * onde a fiscalização mora de verdade.
 */
function chavesFiscalizadasNoBanco(): Set<string> {
  const dir = path.resolve(RAIZ_SRC, '..', 'supabase', 'migrations');
  const achadas = new Set<string>();
  if (!fs.existsSync(dir)) return achadas;

  for (const arquivo of fs.readdirSync(dir)) {
    if (!arquivo.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    // `fn_user_tem('chave')`, com aspas simples do SQL ou dobradas do plpgsql.
    for (const m of sql.matchAll(/fn_user_tem\(\s*'{1,2}([a-z_]+)'{1,2}\s*\)/g)) {
      achadas.add(m[1]);
    }
  }
  return achadas;
}

/** Toda chave fiscalizada no app, venha de onde vier. */
function chavesFiscalizadas(): Set<string> {
  const achadas = new Set<string>();
  for (const m of CODIGO.matchAll(/temPermissao\(\s*['"]([a-z_]+)['"]\s*\)/g)) achadas.add(m[1]);
  // As chaves que o acesso total não concede sozinho passam por outra função.
  // Sem esta linha elas pareceriam decorativas e o primeiro teste acusaria.
  for (const m of CODIGO.matchAll(/temPermissaoExplicita\(\s*['"]([a-z_]+)['"]\s*\)/g)) achadas.add(m[1]);
  for (const m of CODIGO.matchAll(/requiredPermissao=["']([a-z_]+)["']/g)) achadas.add(m[1]);
  for (const m of CODIGO.matchAll(/permissao:\s*['"]([a-z_]+)['"]/g)) achadas.add(m[1]);
  for (const k of chavesDeEscopoResolvidas()) achadas.add(k);
  return achadas;
}

describe('contrato: catálogo ↔ código', () => {
  it('toda permissão do catálogo é consultada em algum lugar do app', () => {
    /*
     * O banco entra AQUI e não em `chavesFiscalizadas()`.
     *
     * A pergunta deste teste é «alguém exige esta chave?», e o Postgres exige
     * tanto quanto o React. Mas o teste seguinte pergunta o contrário — «toda
     * chave exigida existe no catálogo?» — e ali as migrations não servem: elas
     * são histórico, e citam chaves que foram removidas do catálogo depois (as
     * de ouvidoria, por exemplo). Somar as duas fontes nos dois testes fazia o
     * segundo acusar decisões antigas como se fossem defeito de hoje.
     */
    const fiscalizadas = new Set([
      ...chavesFiscalizadas(),
      ...chavesFiscalizadasNoBanco(),
    ]);
    const decorativas = CHAVES_PERMISSAO.filter(k => !fiscalizadas.has(k));

    expect(
      decorativas,
      `Estas permissões existem no catálogo mas nenhum código pergunta por elas.\n`
      + `Um toggle assim liga, desliga e não muda nada — foi o defeito de 2026-08-15.\n`
      + `Ou escreva o código que as consulta, ou remova-as do catálogo:\n  `
      + decorativas.join('\n  '),
    ).toEqual([]);
  });

  it('toda chave fiscalizada no app existe no catálogo', () => {
    const orfas = [...chavesFiscalizadas()].filter(k => !PERMISSOES_POR_CHAVE[k]);

    expect(
      orfas,
      `Estas chaves são verificadas no código mas não estão no catálogo, então o\n`
      + `administrador não tem como configurá-las — ficam presas no padrão para sempre:\n  `
      + orfas.join('\n  '),
    ).toEqual([]);
  });
});

describe('catálogo — integridade', () => {
  it('não tem chave repetida', () => {
    expect(new Set(CHAVES_PERMISSAO).size).toBe(CHAVES_PERMISSAO.length);
  });

  it('toda permissão tem rótulo e descrição preenchidos', () => {
    for (const p of PERMISSOES) {
      expect(p.label.trim(), `rótulo vazio em ${p.key}`).not.toBe('');
      expect(p.descricao.trim(), `descrição vazia em ${p.key}`).not.toBe('');
    }
  });

  it('toda chave explícita existe no catálogo', () => {
    // Uma chave em `PERMISSOES_EXPLICITAS` que não esteja no catálogo seria um
    // poder impossível de conceder: nenhuma tela desenharia o toggle.
    for (const k of PERMISSOES_EXPLICITAS) {
      expect(PERMISSOES_POR_CHAVE[k], `${k} não está no catálogo`).toBeDefined();
      expect(exigeConcessaoExplicita(k)).toBe(true);
    }
    expect(exigeConcessaoExplicita('ver_analitico')).toBe(false);
  });

  it('as chaves aposentadas não voltaram', () => {
    // Governadas por RLS, nunca por toggle: o operador vê os próprios acordos
    // porque a política do banco diz isso.
    expect(CHAVES_PERMISSAO).not.toContain('ver_acordos_proprios');
    expect(CHAVES_PERMISSAO).not.toContain('ver_analiticos_setor');

    // Aposentadas na fase 3b: eram globais e decidiam os dois filtros do
    // Dashboard. Quem decide agora são os níveis daquela aba.
    expect(CHAVES_PERMISSAO).not.toContain('filtrar_por_setor');
    expect(CHAVES_PERMISSAO).not.toContain('filtrar_por_equipe');

    // Aposentada na fase 4: seu único consumidor era `veTodosOsSetores`, que
    // respondia por cinco telas de uma vez. Quem decide agora é o nível da
    // aba — `analitico_escopo_todos_setores` e os equivalentes das outras.
    expect(CHAVES_PERMISSAO).not.toContain('ver_analiticos_global');

    // Aposentada na fase 5a: era a chave global mais usada do sistema, e
    // sozinha decidia o alcance de Acordos, Dashboard e Lixeira. As três já
    // têm `<aba>_escopo_setor` própria.
    expect(CHAVES_PERMISSAO).not.toContain('ver_acordos_gerais');
  });

  it('toda dependência declarada aponta para chave que existe', () => {
    /*
     * Uma `depende.chaves` com erro de digitação criaria o pior tipo de item:
     * um que a tela marca como «sem efeito» para sempre, e cujo atalho não liga
     * nada. É o defeito que o `depende` veio corrigir, só que pior.
     */
    for (const p of PERMISSOES) {
      if (!p.depende) continue;
      expect(p.depende.chaves.length, `${p.key} depende de lista vazia`)
        .toBeGreaterThan(0);
      expect(p.depende.motivo.trim(), `${p.key} não explica a dependência`)
        .not.toBe('');
      for (const c of p.depende.chaves) {
        expect(PERMISSOES_POR_CHAVE[c], `${p.key} depende de ${c}, que não existe`)
          .toBeDefined();
      }
    }
  });

  it('só declara tenant conhecido', () => {
    for (const p of PERMISSOES) {
      for (const t of p.tenants ?? []) {
        expect(['bookplay', 'pagueplay']).toContain(t);
      }
    }
  });

  it('só usa cargo configurável nos padrões', () => {
    for (const p of PERMISSOES) {
      for (const cargo of Object.keys(p.padrao)) {
        expect(CARGOS_CONFIGURAVEIS as readonly string[], `${p.key} cita ${cargo}`)
          .toContain(cargo);
      }
    }
  });
});

describe('recorte por operação', () => {
  it('PaguePlay não recebe Pix automático nem Campanha Fácil', () => {
    const chaves = catalogoDoTenant('pagueplay').map(p => p.key);
    expect(chaves).not.toContain('ver_pix_automatico');
    expect(chaves).not.toContain('aprovar_pix_automatico');
    expect(chaves).not.toContain('ver_campanha_facil');
    expect(chaves).not.toContain('ver_acordos');
  });

  it('o que não declara tenant aparece nas duas', () => {
    /*
     * `tenants` e `produtos` são eixos diferentes, e a distinção passou a
     * importar em 15/09/2026, quando nasceram as chaves da aba Vendas.
     *
     * `tenants` separa BookPlay de PaguePlay — as duas empresas DA cobrança.
     * `produtos` separa cobrança de Comercial e RH, e está acima. Uma chave do
     * Comercial não declara `tenants` (não há dois comerciais), e mesmo assim
     * não aparece em nenhuma das duas empresas de cobrança — está fora do
     * produto delas.
     *
     * O que este teste protege continua sendo o mesmo: dentro da cobrança,
     * silêncio significa «as duas».
     */
    const bp = new Set(catalogoDoTenant('bookplay').map(p => p.key));
    const pp = new Set(catalogoDoTenant('pagueplay').map(p => p.key));
    const daCobranca = PERMISSOES.filter(
      x => !x.tenants && produtosDaPermissao(x).includes('cobranca'),
    );
    expect(daCobranca.length, 'o filtro não pode esvaziar o teste').toBeGreaterThan(50);
    for (const p of daCobranca) {
      expect(bp.has(p.key) && pp.has(p.key), `${p.key} sumiu de uma operação`).toBe(true);
    }
  });

  it('grupo sem permissão na operação não aparece', () => {
    // "Ações específicas" da PaguePlay existe (whatsapp), mas o
    // teste garante que a função não devolve grupo vazio em nenhum caso.
    for (const slug of ['bookplay', 'pagueplay']) {
      const grupos = gruposDoTenant(slug);
      const catalogo = catalogoDoTenant(slug);
      for (const g of grupos) {
        expect(catalogo.some(p => p.grupo === g), `${g} vazio em ${slug}`).toBe(true);
      }
    }
  });
});

describe('padrões de semeadura', () => {
  it('o mapa de um cargo traz o catálogo INTEIRO, nunca parcial', () => {
    // A ausência de chave é o que gerava os 25 casos de divergência. Depois
    // desta versão não existe ausência para interpretar.
    for (const cargo of CARGOS_CONFIGURAVEIS) {
      const mapa = permissoesPadraoDoCargo(cargo);
      expect(Object.keys(mapa).sort()).toEqual([...CHAVES_PERMISSAO].sort());
    }
  });

  it('cargo sem padrão declarado nasce negado, não permitido', () => {
    const operador = permissoesPadraoDoCargo('operador');
    expect(operador.usuarios_administrar).toBe(false);
    expect(operador.equipes_criar_editar).toBe(false);
    expect(operador.metas_editar).toBe(false);
    expect(operador.ver_logs).toBe(false);
  });

  it('administrador e super_admin nascem com tudo ligado, menos o que exige concessão', () => {
    for (const cargo of CARGOS_ACESSO_TOTAL) {
      const mapa = permissoesPadraoDoCargo(cargo);
      const desligadas = Object.entries(mapa).filter(([, v]) => !v).map(([k]) => k);
      expect(desligadas.sort(), `${cargo} veio errado`)
        .toEqual([...PERMISSOES_EXPLICITAS].sort());
    }
  });

  it('operador continua podendo o básico do dia a dia', () => {
    const operador = permissoesPadraoDoCargo('operador');
    expect(operador.criar_acordos).toBe(true);
    expect(operador.editar_acordos).toBe(true);
    expect(operador.ver_analitico).toBe(true);
  });

  /**
   * O contrato que eu prometi ao ligar o cadeado do mês no catálogo: nenhuma
   * pessoa passa a poder algo que não podia antes. Se um `padrao` for editado
   * para conceder uma chave explícita, este teste denuncia.
   */
  it('nenhum cargo nasce podendo escrever em mês fechado', () => {
    for (const cargo of [...CARGOS_CONFIGURAVEIS, ...CARGOS_ACESSO_TOTAL]) {
      const mapa = permissoesPadraoDoCargo(cargo);
      for (const chave of PERMISSOES_EXPLICITAS) {
        expect(mapa[chave], `${cargo} nasceu com ${chave} ligada`).toBe(false);
      }
    }
  });

  /*
   * A aba Ouvidoria saiu em 05/09/2026 (`arquivo-morto/ouvidoria/`) e as quatro
   * chaves dela saíram do catálogo com ela — em TS aqui, e no SQL pela migration
   * `20260905100000_remove_permissoes_ouvidoria`.
   *
   * O CARGO ficou, e continua nascendo sem as permissões de gestão. É o que
   * este teste guarda agora: perder a aba não podia promover ninguém.
   */
  it('ouvidoria nasce sem as permissões de gestão', () => {
    const ouv = permissoesPadraoDoCargo('ouvidoria');
    // A aba não existe mais para cargo nenhum.
    expect(ouv.ver_ouvidoria).toBeFalsy();
    expect(ouv.editar_ouvidoria).toBeFalsy();
    // Os seis casos que a tela sempre mostrou desligados e o sistema concedia.
    expect(ouv.usuarios_administrar).toBe(false);
    expect(ouv.equipes_criar_editar).toBe(false);
    expect(ouv.metas_editar).toBe(false);
    expect(ouv.ver_logs).toBe(false);
    // `filtrar_por_setor` e `filtrar_por_equipe` saíram do catálogo na fase 3b;
    // o equivalente hoje é o nível da aba, e a ouvidoria não o tem por padrão.
    expect(ouv.dashboard_escopo_todos_setores).toBe(false);
  });
});

/**
 * O eixo de PRODUTO, acrescentado em 25/08 junto com Comercial e RH.
 *
 * O que ele conserta: a tela de Permissões do Comercial mostrava as ~100 chaves
 * da cobrança — «Ver acordos», «Tabular», «Campanha Fácil» — para uma operação
 * de vendas. Oferecer um interruptor que não controla nada é o defeito que este
 * catálogo inteiro existe para não cometer.
 */
describe('catálogo por produto', () => {
  it('o Comercial não recebe nenhuma chave de cobrança', () => {
    const chaves = new Set(catalogoDoTenant('comercial').map(p => p.key));
    for (const daCobranca of [
      'ver_acordos', 'criar_acordos', 'ver_analitico', 'ver_painel_lider',
      'ver_campanha_facil', 'ver_metas', 'importar_analitico',
      // Lixeira é acordo excluído — voltou para a cobrança em 25/08.
      'ver_lixeira', 'lixeira_restaurar', 'lixeira_escopo_setor',
      'ajuste_recebimento_lancar', 'ver_pix_automatico', 'ver_tickets',
    ]) {
      expect(chaves.has(daCobranca), `${daCobranca} vazou para o Comercial`).toBe(false);
    }
  });

  it('o Comercial recebe o que toda operação precisa', () => {
    const chaves = new Set(catalogoDoTenant('comercial').map(p => p.key));
    for (const generica of [
      'ver_usuarios', 'usuarios_administrar', 'equipes_criar_editar',
      'ver_configuracoes', 'administrar_sistema',
    ]) {
      expect(chaves.has(generica), `${generica} sumiu do Comercial`).toBe(true);
    }
  });

  /*
   * Até 15/09/2026 este teste dizia «RH e Comercial recebem o MESMO recorte»,
   * e era verdade: os dois produtos só tinham o punhado de chaves genéricas.
   *
   * A aba Vendas quebrou a igualdade de propósito — o Comercial passou a ter
   * chaves próprias. O que precisa continuar valendo não é a igualdade: é que
   * a diferença entre eles seja SÓ o que é do próprio produto, e que nenhum
   * dos dois ganhe nada da cobrança por tabela.
   */
  it('RH e Comercial partem do mesmo recorte genérico', () => {
    const comercial = new Set(catalogoDoTenant('comercial').map(p => p.key));
    const rh        = new Set(catalogoDoTenant('rh').map(p => p.key));

    // Tudo que o RH tem, o Comercial também tem: o RH não tem chave própria.
    for (const k of rh) {
      expect(comercial.has(k), `${k} está no RH e sumiu do Comercial`).toBe(true);
    }
    // E o que o Comercial tem a mais é, chave por chave, declaradamente dele.
    const soDoComercial = [...comercial].filter(k => !rh.has(k));
    for (const k of soDoComercial) {
      const p = PERMISSOES_POR_CHAVE[k];
      expect(produtosDaPermissao(p), `${k} sobra no Comercial sem ser do Comercial`)
        .toEqual(['comercial']);
    }
  });

  it('a cobrança continua com o catálogo inteiro dela', () => {
    /*
     * A prova de que nada foi tirado de quem já usava: as duas empresas de
     * cobrança somadas cobrem todas as chaves DA COBRANÇA.
     *
     * A comparação era contra `PERMISSOES.length` e deixou de servir quando
     * apareceu a primeira chave que não é de cobrança. Contra o total, este
     * teste passaria a falhar a cada aba nova de Comercial ou RH — acusando
     * como perda o que é crescimento do outro lado.
     */
    const bp = catalogoDoTenant('bookplay').map(p => p.key);
    const pp = catalogoDoTenant('pagueplay').map(p => p.key);
    const juntas = new Set([...bp, ...pp]);
    const esperadas = PERMISSOES.filter(p => produtosDaPermissao(p).includes('cobranca'));
    expect(juntas.size).toBe(esperadas.length);
  });

  it('o recorte genérico é bem menor que o da cobrança', () => {
    // Não é um número mágico a defender: é a garantia de que o filtro FILTRA.
    // Se um dia isto falhar por igualdade, alguém marcou o catálogo inteiro
    // como genérico.
    expect(catalogoDoTenant('comercial').length)
      .toBeLessThan(catalogoDoTenant('bookplay').length / 2);
  });

  it('slug de produto desconhecido não devolve nada', () => {
    expect(catalogoDoTenant('financeiro')).toEqual([]);
  });

  it('sem slug (dev sem VITE_TENANT_SLUG) continua mostrando tudo', () => {
    expect(catalogoDoTenant(null).length).toBe(PERMISSOES.length);
  });
});
