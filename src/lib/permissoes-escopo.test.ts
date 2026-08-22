/**
 * permissoes-escopo.test.ts
 *
 * O contrato central da estrutura por aba: **uma aba nunca fala pela outra.**
 *
 * O defeito que estes testes existem para impedir é o descrito no pedido de
 * reestruturação — configurar escopo numa aba e ver o alcance mudar em outra.
 * Antes disso, `ver_acordos_gerais` sozinho decidia Acordos, Dashboard e
 * Lixeira ao mesmo tempo.
 *
 * Cenários cobertos:
 *   1. Aba desligada zera os níveis, mesmo com todos ligados
 *   2. Níveis independentes: buracos no meio são respeitados
 *   3. Escopo efetivo é o mais amplo liberado, não o último ligado
 *   4. Uma aba não vaza para outra
 *   5. Comparação de amplitude e limitação ao teto
 */

import { describe, it, expect } from 'vitest';
import {
  NIVEIS_ESCOPO, ABAS_COM_ESCOPO, chaveEscopo, niveisLiberados,
  escopoEfetivo, alcancaPeloMenos, limitarAoTeto,
} from './permissoes-escopo';

/** Constrói um `temPermissao` a partir de uma lista de chaves ligadas. */
function comChaves(...ligadas: string[]) {
  const set = new Set(ligadas);
  return (chave: string) => set.has(chave);
}

describe('chaveEscopo', () => {
  it('monta a chave no formato do catálogo', () => {
    expect(chaveEscopo('lixeira', 'todos_setores')).toBe('lixeira_escopo_todos_setores');
    expect(chaveEscopo('lixeira', 'individual')).toBe('lixeira_escopo_individual');
  });
});

describe('dependência aba-mãe', () => {
  it('aba desligada zera os níveis mesmo com todos ligados', () => {
    const tem = comChaves(
      ...NIVEIS_ESCOPO.map(n => chaveEscopo('lixeira', n)),
      // repare: 'ver_lixeira' NÃO está aqui
    );
    expect(niveisLiberados('lixeira', tem)).toEqual([]);
    expect(escopoEfetivo('lixeira', tem)).toBeNull();
  });

  it('religar a aba devolve a configuração que já existia', () => {
    // A dependência é resolvida na leitura, então as chaves filhas continuam
    // gravadas enquanto a mãe está desligada.
    const chavesFilhas = [chaveEscopo('lixeira', 'individual'), chaveEscopo('lixeira', 'setor')];
    expect(niveisLiberados('lixeira', comChaves(...chavesFilhas))).toEqual([]);
    expect(niveisLiberados('lixeira', comChaves('ver_lixeira', ...chavesFilhas)))
      .toEqual(['individual', 'setor']);
  });
});

describe('níveis independentes', () => {
  it('respeita buraco no meio: individual + setor, sem equipe', () => {
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'individual'),
      chaveEscopo('lixeira', 'setor'),
    );
    expect(niveisLiberados('lixeira', tem)).toEqual(['individual', 'setor']);
  });

  it('devolve sempre do mais estreito ao mais amplo', () => {
    const tem = comChaves('ver_lixeira', ...NIVEIS_ESCOPO.map(n => chaveEscopo('lixeira', n)));
    expect(niveisLiberados('lixeira', tem))
      .toEqual(['individual', 'equipe', 'setor', 'todos_setores']);
  });

  it('nenhum nível ligado, com a aba ligada, nao devolve escopo', () => {
    expect(escopoEfetivo('lixeira', comChaves('ver_lixeira'))).toBeNull();
  });
});

describe('escopo efetivo', () => {
  it('e o mais amplo liberado, nao o ultimo ligado', () => {
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'setor'),
      chaveEscopo('lixeira', 'individual'),
    );
    expect(escopoEfetivo('lixeira', tem)).toBe('setor');
  });

  it('so individual devolve individual', () => {
    const tem = comChaves('ver_lixeira', chaveEscopo('lixeira', 'individual'));
    expect(escopoEfetivo('lixeira', tem)).toBe('individual');
  });
});

describe('uma aba nao fala pela outra', () => {
  it('chave de outra aba nao libera nada aqui', () => {
    // O caso do pedido: escopo amplo no Pix nao pode mexer na Lixeira.
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'individual'),
      'pix_escopo_todos_setores',
      'acordos_escopo_todos_setores',
      'dashboard_escopo_todos_setores',
    );
    expect(escopoEfetivo('lixeira', tem)).toBe('individual');
  });

  it('as chaves globais antigas nao concedem escopo nenhum', () => {
    // ver_acordos_gerais e ver_todos_setores deixam de mandar aqui. Enquanto
    // elas existirem no catalogo, este teste garante que nao voltaram a decidir.
    const tem = comChaves('ver_lixeira', 'ver_acordos_gerais', 'ver_todos_setores');
    expect(niveisLiberados('lixeira', tem)).toEqual([]);
    expect(escopoEfetivo('lixeira', tem)).toBeNull();
  });

  it('toda aba registrada usa o proprio prefixo', () => {
    for (const [nome, meta] of Object.entries(ABAS_COM_ESCOPO)) {
      for (const nivel of meta.niveis) {
        expect(chaveEscopo(meta.prefixo, nivel)).toContain(meta.prefixo);
      }
      expect(meta.chaveAba).not.toContain('escopo');
      expect(nome.length).toBeGreaterThan(0);
    }
  });
});

describe('amplitude', () => {
  it('compara niveis corretamente', () => {
    expect(alcancaPeloMenos('todos_setores', 'individual')).toBe(true);
    expect(alcancaPeloMenos('setor', 'equipe')).toBe(true);
    expect(alcancaPeloMenos('individual', 'setor')).toBe(false);
    expect(alcancaPeloMenos('setor', 'setor')).toBe(true);
  });

  it('limitarAoTeto nunca deixa passar do teto', () => {
    // A regra que impede concessao silenciosa quando o escopo derivado virar
    // teto de RLS: ver docs/PERMISSOES-POR-ABA-PROJETO.md.
    expect(limitarAoTeto('todos_setores', 'individual')).toBe('individual');
    expect(limitarAoTeto('setor', 'individual')).toBe('individual');
    expect(limitarAoTeto('individual', 'todos_setores')).toBe('individual');
    expect(limitarAoTeto('setor', 'todos_setores')).toBe('setor');
  });
});
