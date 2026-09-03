/**
 * pix_automatico.retrato.test.ts — o Pix de um mês fechado é do mês fechado.
 *
 * Cada linha de `pix_automatico_acordos` já nasce com `operador_nome` e
 * `setor_id` carimbados, então o VALOR sempre foi histórico. O AGRUPAMENTO não
 * era: a aba lia `perfis`, `equipes` e `setores` ao vivo, sem filtro de mês.
 *
 * Medido na BookPlay em 03/09/2026, olhando agosto:
 *
 *   • 15 dos 30 operadores com Pix no mês caíam na equipe errada — 565 acordos,
 *     R$ 2.037.140,69 no card de outra equipe;
 *   • a equipe «Bryan» foi dividida em «Matheus» e «Luciana» em setembro e
 *     depois APAGADA, então a produção dela em agosto não tinha onde cair;
 *   • oito equipes e um setor mudaram de nome («Tamires» → «Maria - Capitã»,
 *     «Amauri Digital» → «Marília Digital», e por aí).
 *
 * Estes testes cobrem a peça pura da correção. O resto (quando buscar a foto)
 * é uma condição de mês só, em `PixAutomatico.tsx`.
 */
import { describe, expect, it } from 'vitest';
import { aplicarRetratoPix, type RetratoPixDoMes } from './pix_automatico.service';

interface Op {
  id: string; nome: string; equipe_id: string | null; setor_id: string | null; perfil: string;
}

const AO_VIVO: Op[] = [
  // Hoje está na equipe «Matheus»; em agosto estava na «Bryan».
  { id: 'op-1', nome: 'Eduarda Lorenzo', equipe_id: 'eq-matheus', setor_id: 'set-1', perfil: 'operador' },
  // Não se moveu.
  { id: 'op-2', nome: 'Renata Costa',    equipe_id: 'eq-matheus', setor_id: 'set-1', perfil: 'operador' },
];

const RETRATO: RetratoPixDoMes = {
  porOperador: {
    'op-1': { equipe_id: 'eq-bryan',   setor_id: 'set-1' },
    'op-2': { equipe_id: 'eq-matheus', setor_id: 'set-1' },
    // Estava no mês e já não está em `perfis` — saiu da empresa depois.
    'op-3': { equipe_id: 'eq-bryan',   setor_id: 'set-1' },
  },
  equipes: [
    { id: 'eq-bryan',   nome: 'Bryan',   setor_id: 'set-1' },
    { id: 'eq-matheus', nome: 'Matheus', setor_id: 'set-1' },
  ],
  setores: [{ id: 'set-1', nome: 'Amauri Digital' }],
};

const NOMES_CONGELADOS = { 'op-3': 'Maria Mazziero' };

describe('aplicarRetratoPix', () => {
  it('devolve cada operador para a equipe daquele mês', () => {
    const { operadores } = aplicarRetratoPix(AO_VIVO, RETRATO, NOMES_CONGELADOS);
    const eduarda = operadores.find(o => o.id === 'op-1')!;
    // Sem isto, os 92 acordos dela em agosto contam no card do Matheus.
    expect(eduarda.equipe_id).toBe('eq-bryan');
  });

  it('não mexe em quem não se moveu', () => {
    const { operadores } = aplicarRetratoPix(AO_VIVO, RETRATO, NOMES_CONGELADOS);
    const renata = operadores.find(o => o.id === 'op-2')!;
    expect(renata.equipe_id).toBe('eq-matheus');
    expect(renata.nome).toBe('Renata Costa');
  });

  it('traz de volta quem produziu no mês e já não está em perfis', () => {
    const { operadores } = aplicarRetratoPix(AO_VIVO, RETRATO, NOMES_CONGELADOS);
    const sumida = operadores.find(o => o.id === 'op-3');
    // Some da lista = some do filtro de operador E do total da equipe, levando
    // junto o dinheiro que ela produziu.
    expect(sumida).toBeDefined();
    // O nome vem carimbado na própria linha do Pix, não de `perfis`.
    expect(sumida!.nome).toBe('Maria Mazziero');
    expect(sumida!.equipe_id).toBe('eq-bryan');
  });

  it('sem nome congelado, a pessoa entra mesmo assim', () => {
    // Perder a linha por não saber o nome seria perder o dinheiro dela.
    const { operadores } = aplicarRetratoPix(AO_VIVO, RETRATO, {});
    expect(operadores.find(o => o.id === 'op-3')).toBeDefined();
  });

  it('os rótulos de equipe e setor são os do mês, não os de hoje', () => {
    const { equipes, setores } = aplicarRetratoPix(AO_VIVO, RETRATO, NOMES_CONGELADOS);
    // «Bryan» foi apagada em setembro: ao vivo ela não existe mais.
    expect(equipes.map(e => e.nome)).toContain('Bryan');
    expect(setores[0].nome).toBe('Amauri Digital');
  });

  it('a lista sai ordenada por nome', () => {
    const { operadores } = aplicarRetratoPix(AO_VIVO, RETRATO, NOMES_CONGELADOS);
    const nomes = operadores.map(o => o.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
