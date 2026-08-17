/**
 * "Quem conta no recebimento?" — uma pergunta, uma resposta.
 *
 * Este arquivo é o contrato que impede a lista de divergir de novo. Em
 * 17/08/2026 existiam quatro cópias dela e uma discordava: o filtro do Pix
 * Automático comparava com `=== 'operador'`, então um usuário `elite` aparecia
 * no ranking, nos quartis e no Painel do Líder — e sumia do filtro de
 * operadores e das sugestões de vínculo, apesar de o recebimento dele contar em
 * todos os lados.
 *
 * O teste de fonte no fim é o que mata a próxima cópia antes de ela nascer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERFIS_QUE_CONTAM_NO_RECEBIMENTO, contaNoRecebimento } from '@/lib/index';

const RAIZ = resolve(__dirname, '../..');

describe('contaNoRecebimento', () => {
  it('operador conta', () => {
    expect(contaNoRecebimento('operador')).toBe(true);
  });

  it('elite conta — é operador que também lidera', () => {
    expect(contaNoRecebimento('elite')).toBe(true);
  });

  it('quem supervisiona não conta', () => {
    for (const cargo of ['lider', 'gerencia', 'diretoria', 'administrador', 'super_admin', 'ouvidoria']) {
      expect(contaNoRecebimento(cargo), cargo).toBe(false);
    }
  });

  it('tolera caixa e espaços — o cargo vem de coluna de texto', () => {
    expect(contaNoRecebimento(' ELITE ')).toBe(true);
    expect(contaNoRecebimento('Operador')).toBe(true);
  });

  it('vazio, nulo e desconhecido não contam', () => {
    expect(contaNoRecebimento('')).toBe(false);
    expect(contaNoRecebimento(null)).toBe(false);
    expect(contaNoRecebimento(undefined)).toBe(false);
    expect(contaNoRecebimento('estagiario')).toBe(false);
  });

  it('a lista é exatamente operador e elite', () => {
    expect([...PERFIS_QUE_CONTAM_NO_RECEBIMENTO]).toEqual(['operador', 'elite']);
  });
});

describe('nenhuma cópia da lista sobrou no código', () => {
  /**
   * Os três consumidores da regra de recebimento. Cada um tem de citar a
   * constante — se alguém voltar a escrever a lista à mão, aqui quebra.
   */
  const CONSUMIDORES = [
    'pages/Acordos/pixAutomaticoView.ts',
    'pages/Dashboard/Analitico/QuartisOperadores.tsx',
    'pages/PainelLider.tsx',
  ];

  it.each(CONSUMIDORES)('%s usa a constante, não a lista escrita à mão', (rel) => {
    const fonte = readFileSync(resolve(RAIZ, rel), 'utf-8');

    const usaConstante = /PERFIS_QUE_CONTAM_NO_RECEBIMENTO|contaNoRecebimento/.test(fonte);
    expect(usaConstante, `${rel} deveria citar a constante`).toBe(true);

    // A lista literal `['operador', 'elite']` não pode reaparecer: é justamente
    // a cópia que este contrato veio eliminar.
    const listaLiteral = /\[\s*'operador'\s*,\s*'elite'\s*\]/.test(fonte);
    expect(listaLiteral, `${rel} ainda tem a lista escrita à mão`).toBe(false);
  });

  it('a comparação estrita com "operador" não voltou ao filtro do Pix', () => {
    const fonte = readFileSync(resolve(RAIZ, 'pages/Acordos/pixAutomaticoView.ts'), 'utf-8');
    // Era exatamente esta linha que deixava o elite de fora.
    expect(/toLowerCase\(\)\s*===\s*'operador'/.test(fonte)).toBe(false);
  });
});
