import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { apurar, cedulaComTodos, type Candidato, type Pergunta } from './cedula';
import { montarCampeoes, montarPlanilhaCampeoes, nomeArquivoCampeoes, type DadosPlanilhaCampeoes } from './planilhaCampeoes';

const P = (id: string, texto: string): Pergunta => ({ id, emoji: '⭐', texto });
const perguntas = [
  P('estrategica', 'Líder Estratégica'),
  P('comunicativo', 'Mais comunicativo'),
  P('paciente', 'Mais paciente'),
  P('organizado', 'Mais organizado'),
];
const L = (id: string, nome: string, setor: string): Candidato => ({ id, nome, foto: null, setor, perfil: 'lider' });
const lideres = [L('ellen', 'Ellen Teste', 'Play 2'), L('bia', 'Bia Teste', 'Receptivo'), L('caio', 'Caio Teste', 'Play 3'), L('duda', 'Duda Teste', 'Jornada')];
const pessoas = new Map(lideres.map(l => [l.id, l]));
const cedula = cedulaComTodos(perguntas, lideres);
const resultados = apurar(cedula, {
  estrategica: { ellen: 9, bia: 3 },
  comunicativo: { ellen: 7, caio: 4 }, // Ellen de novo: pede a diretoria
  paciente: { bia: 5, duda: 5 },       // empate
  organizado: { caio: 6, duda: 2 },
});

describe('montarCampeoes', () => {
  it('mostra que a Ellen já é campeã de Líder Estratégica quando também leva outra', () => {
    const c = montarCampeoes(resultados, {}, pessoas);
    const comunicativo = c.categorias.find(x => x.pergunta.id === 'comunicativo')!;
    expect(comunicativo.campeoes).toEqual(['ellen']);
    expect(comunicativo.como).toBe('pendente_repetido');
    expect(comunicativo.outras.get('ellen')!.map(p => p.texto)).toEqual(['Líder Estratégica']);
    const ellen = c.lideres[0];
    expect(ellen.id).toBe('ellen');
    expect(ellen.categorias.map(p => p.id)).toEqual(['estrategica', 'comunicativo']);
  });

  it('empate a decidir lista os dois; vencedor claro sem repetição fica «claro»', () => {
    const c = montarCampeoes(resultados, {}, pessoas);
    const paciente = c.categorias.find(x => x.pergunta.id === 'paciente')!;
    expect(paciente.campeoes).toEqual(['bia', 'duda']);
    expect(paciente.como).toBe('pendente_empate');
    expect(c.categorias.find(x => x.pergunta.id === 'organizado')!.como).toBe('claro');
  });

  it('com a decisão da diretoria, o escolhido leva e o repetido some', () => {
    const c = montarCampeoes(resultados, { comunicativo: 'caio', paciente: 'duda' }, pessoas);
    const comunicativo = c.categorias.find(x => x.pergunta.id === 'comunicativo')!;
    expect(comunicativo.campeoes).toEqual(['caio']);
    expect(comunicativo.como).toBe('diretoria_repetido');
    expect(comunicativo.votos).toBe(4);
    expect(comunicativo.segundo).toEqual({ id: 'ellen', votos: 7 });
    expect(c.categorias.find(x => x.pergunta.id === 'paciente')!.como).toBe('diretoria_empate');
    // Caio agora leva Comunicativo e Organizado.
    expect(c.lideres[0].id).toBe('caio');
    expect(c.lideres.find(l => l.id === 'ellen')!.categorias.map(p => p.id)).toEqual(['estrategica']);
    expect(c.lideres.find(l => l.id === 'bia')!.categorias).toEqual([]);
  });
});

describe('montarPlanilhaCampeoes', () => {
  const dados: DadosPlanilhaCampeoes = {
    titulo: 'Votação Novembro', estado: 'encerrada', geradoEm: new Date('2026-11-11T15:00:00Z'),
    resultados, desempates: {}, pessoas, votaram: 4,
  };

  it('sai um xlsx com as três abas e a Ellen marcada como campeã de Líder Estratégica', () => {
    const zip = unzipSync(montarPlanilhaCampeoes(dados));
    const livro = strFromU8(zip['xl/workbook.xml']);
    expect(livro).toContain('name="Campeões"');
    expect(livro).toContain('name="Por líder"');
    expect(livro).toContain('name="Ranking completo"');
    const campeoes = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(campeoes).toContain('Ellen Teste');
    expect(campeoes).toContain('⭐ Líder Estratégica');
    expect(campeoes).toContain('A decidir: em 1º em mais de uma');
    const porLider = strFromU8(zip['xl/worksheets/sheet2.xml']);
    expect(porLider).toContain('Campeão(ã) de 2 categorias');
    expect(porLider).toContain('(a decidir)');
    // Empate em «Mais paciente»: os dois aparecem como 1º no ranking.
    const ranking = strFromU8(zip['xl/worksheets/sheet3.xml']);
    // 1º: Ellen (estratégica), Ellen (comunicativo), Bia + Duda (paciente), Caio (organizado).
    expect(ranking.match(/>1º</g)).toHaveLength(5);
  });

  it('nome do arquivo sem acento e com o dia', () => {
    expect(nomeArquivoCampeoes(dados)).toBe('votacao-lideranca-campeoes-votacao-novembro-2026-11-11.xlsx');
  });
});
