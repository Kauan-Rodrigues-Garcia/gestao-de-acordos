/**
 * permissoes-catalogo.test.ts
 *
 * Os dois testes de contrato que existem para um defeito não voltar.
 *
 * Antes de 2026-08-15 havia três listas de permissão — o catálogo da tela (26
 * chaves), o banco (29) e o que o código consultava (24) — e nenhuma mandava
 * nas outras. O resultado foram toggles que ligavam, desligavam e não mudavam
 * nada (`ver_acordos_proprios`, `ver_analiticos_setor`) e chaves no banco que a
 * tela nem mostrava (as três de ouvidoria).
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
  CARGOS_CONFIGURAVEIS, CARGOS_ACESSO_TOTAL,
  catalogoDoTenant, gruposDoTenant, permissoesPadraoDoCargo,
} from './permissoes-catalogo';

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

/** Toda chave fiscalizada no app, venha de onde vier. */
function chavesFiscalizadas(): Set<string> {
  const achadas = new Set<string>();
  for (const m of CODIGO.matchAll(/temPermissao\(\s*['"]([a-z_]+)['"]\s*\)/g)) achadas.add(m[1]);
  for (const m of CODIGO.matchAll(/requiredPermissao=["']([a-z_]+)["']/g)) achadas.add(m[1]);
  for (const m of CODIGO.matchAll(/permissao:\s*['"]([a-z_]+)['"]/g)) achadas.add(m[1]);
  return achadas;
}

describe('contrato: catálogo ↔ código', () => {
  it('toda permissão do catálogo é consultada em algum lugar do app', () => {
    const fiscalizadas = chavesFiscalizadas();
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

  it('as duas chaves aposentadas não voltaram', () => {
    // Governadas por RLS, nunca por toggle: o operador vê os próprios acordos
    // porque a política do banco diz isso.
    expect(CHAVES_PERMISSAO).not.toContain('ver_acordos_proprios');
    expect(CHAVES_PERMISSAO).not.toContain('ver_analiticos_setor');
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
  it('BookPlay não recebe as permissões de Ouvidoria', () => {
    const chaves = catalogoDoTenant('bookplay').map(p => p.key);
    expect(chaves).not.toContain('ver_ouvidoria');
    expect(chaves).not.toContain('editar_ouvidoria');
    expect(chaves).not.toContain('gerenciar_acessos_ouvidoria');
  });

  it('PaguePlay não recebe Pix automático nem Campanha Fácil', () => {
    const chaves = catalogoDoTenant('pagueplay').map(p => p.key);
    expect(chaves).not.toContain('ver_pix_automatico');
    expect(chaves).not.toContain('aprovar_pix_automatico');
    expect(chaves).not.toContain('ver_campanha_facil');
    expect(chaves).not.toContain('ver_acordos');
  });

  it('o que não declara tenant aparece nas duas', () => {
    const bp = new Set(catalogoDoTenant('bookplay').map(p => p.key));
    const pp = new Set(catalogoDoTenant('pagueplay').map(p => p.key));
    for (const p of PERMISSOES.filter(x => !x.tenants)) {
      expect(bp.has(p.key) && pp.has(p.key), `${p.key} sumiu de uma operação`).toBe(true);
    }
  });

  it('grupo sem permissão na operação não aparece', () => {
    // "Ações específicas" da PaguePlay existe (ouvidoria + whatsapp), mas o
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
    expect(operador.editar_usuarios).toBe(false);
    expect(operador.editar_equipes).toBe(false);
    expect(operador.gerenciar_metas).toBe(false);
    expect(operador.ver_logs).toBe(false);
  });

  it('administrador e super_admin nascem com tudo ligado', () => {
    for (const cargo of CARGOS_ACESSO_TOTAL) {
      const mapa = permissoesPadraoDoCargo(cargo);
      expect(Object.values(mapa).every(Boolean), `${cargo} não veio completo`).toBe(true);
    }
  });

  it('operador continua podendo o básico do dia a dia', () => {
    const operador = permissoesPadraoDoCargo('operador');
    expect(operador.criar_acordos).toBe(true);
    expect(operador.editar_acordos).toBe(true);
    expect(operador.ver_analitico).toBe(true);
  });

  it('ouvidoria nasce com a própria aba e sem as de gestão', () => {
    const ouv = permissoesPadraoDoCargo('ouvidoria');
    expect(ouv.ver_ouvidoria).toBe(true);
    expect(ouv.editar_ouvidoria).toBe(true);
    // Os seis casos que a tela sempre mostrou desligados e o sistema concedia.
    expect(ouv.editar_usuarios).toBe(false);
    expect(ouv.editar_equipes).toBe(false);
    expect(ouv.gerenciar_metas).toBe(false);
    expect(ouv.ver_logs).toBe(false);
    expect(ouv.filtrar_por_setor).toBe(false);
    expect(ouv.filtrar_por_equipe).toBe(false);
  });
});
