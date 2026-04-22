import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn() })) })) },
}));

import { classificarNrsImportados, agruparPorCategoria } from './classificar_nrs_import.service';
import type { DuplicadoInfo, ClassificarParams } from './classificar_nrs_import.service';
import type { DiretoExtraConfig } from './direto_extra.service';

describe('classificarNrsImportados', () => {
  const opAtualId = 'op-atual';
  const opOutroId = 'op-outro';

  // Configuração padrão: sem lógica ativa para ninguém
  const baseParams: Omit<ClassificarParams, 'registros' | 'duplicados'> = {
    operadorAtualId: opAtualId,
    operadorAtualSetorId: 'setor-1',
    operadorAtualEquipeId: 'equipe-1',
    configsDiretoExtra: [],
  };

  it('novo: NR que não aparece em duplicados → categoria "novo"', async () => {
    const params: ClassificarParams = {
      ...baseParams,
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map(),
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('novo');
    expect(res[0].nr).toBe('NR123');
  });

  it('nr vazio: input com nr="" → categoria "novo" sem acessar duplicados', async () => {
    const params: ClassificarParams = {
      ...baseParams,
      registros: [{ linhaOriginal: 1, nr: '' }],
      duplicados: new Map([['', { acordoId: 'a1', operadorId: 'op1', operadorNome: 'Op' }]]),
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('novo');
    expect(res[0].nr).toBe('');
  });

  it('duplicado do próprio operador: duplicados tem o NR mas operadorId === operadorAtualId → categoria "duplicado", precisaAutorizacao=false', async () => {
    const dupInfo: DuplicadoInfo = { acordoId: 'a1', operadorId: opAtualId, operadorNome: 'Eu' };
    const params: ClassificarParams = {
      ...baseParams,
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map([['NR123', dupInfo]]),
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('duplicado');
    expect(res[0].precisaAutorizacao).toBe(false);
    expect(res[0].donoAtual).toEqual(dupInfo);
  });

  it('extra (Caso A): operador atual TEM lógica + duplicado com outro operador → categoria "extra", donoAtual preenchido', async () => {
    const configAtiva: any = {
      id: 'c1', escopo: 'usuario', referencia_id: opAtualId, ativo: true, empresa_id: 'e1', criado_em: ''
    };
    const dupInfo: DuplicadoInfo = { acordoId: 'a1', operadorId: opOutroId, operadorNome: 'Outro' };
    const params: ClassificarParams = {
      ...baseParams,
      configsDiretoExtra: [configAtiva],
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map([['NR123', dupInfo]]),
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('extra');
    expect(res[0].donoAtual).toEqual(dupInfo);
    expect(res[0].operadorTemLogica).toBe(true);
  });

  it('direto cruzado (Caso B): operador atual NÃO tem lógica, MAS o operador dono TEM → categoria "direto", donoAtual preenchido, donoTemLogica=true', async () => {
    const configDono: any = {
      id: 'c2', escopo: 'usuario', referencia_id: opOutroId, ativo: true, empresa_id: 'e1', criado_em: ''
    };
    const dupInfo: DuplicadoInfo = { acordoId: 'a1', operadorId: opOutroId, operadorNome: 'Outro' };
    const params: ClassificarParams = {
      ...baseParams,
      configsDiretoExtra: [configDono],
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map([['NR123', dupInfo]]),
      resolverDadosOperador: async (id) => id === opOutroId ? { setorId: null, equipeId: null } : null
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('direto');
    expect(res[0].donoAtual).toEqual(dupInfo);
    expect(res[0].donoTemLogica).toBe(true);
    expect(res[0].operadorTemLogica).toBe(false);
  });

  it('duplicado bloqueado (Caso C): nenhum dos dois tem lógica → categoria "duplicado", precisaAutorizacao=true', async () => {
    const dupInfo: DuplicadoInfo = { acordoId: 'a1', operadorId: opOutroId, operadorNome: 'Outro' };
    const params: ClassificarParams = {
      ...baseParams,
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map([['NR123', dupInfo]]),
      resolverDadosOperador: async () => ({ setorId: null, equipeId: null })
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('duplicado');
    expect(res[0].precisaAutorizacao).toBe(true);
    expect(res[0].donoTemLogica).toBe(false);
  });

  it('resolverDadosOperador omitido: assume nenhum outro operador tem lógica → categoria "duplicado" com precisaAutorizacao=true', async () => {
    const dupInfo: DuplicadoInfo = { acordoId: 'a1', operadorId: opOutroId, operadorNome: 'Outro' };
    const params: ClassificarParams = {
      ...baseParams,
      registros: [{ linhaOriginal: 1, nr: 'NR123' }],
      duplicados: new Map([['NR123', dupInfo]]),
      resolverDadosOperador: undefined
    };
    const res = await classificarNrsImportados(params);
    expect(res[0].categoria).toBe('duplicado');
    expect(res[0].precisaAutorizacao).toBe(true);
  });

  it('agruparPorCategoria: soma corretamente os totais', () => {
    const lista: any[] = [
      { categoria: 'novo' },
      { categoria: 'novo' },
      { categoria: 'extra' },
      { categoria: 'direto' },
      { categoria: 'duplicado' },
    ];
    const totais = agruparPorCategoria(lista);
    expect(totais).toEqual({
      novo: 2,
      disponivel: 0,
      duplicado: 1,
      extra: 1,
      direto: 1
    });
  });
});
