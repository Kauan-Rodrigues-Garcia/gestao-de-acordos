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

  // ═══════════════════════════════════════════════════════════════════════════
  // Regressão 2026-04-22 — bug #10 (Inscrição 1000)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // ANTES:
  //   - A lógica Direto/Extra do operador dono era descoberta via
  //     `resolverDadosOperador`, que fazia SELECT em `perfis` sob RLS
  //     do classificador.
  //   - Operador Carlos (sem permissão RLS para ler perfil de outro setor)
  //     recebia `dados=null` → `donoTemLogica=false` → categoria 'duplicado'.
  //   - Admin (RLS global) recebia dados corretos → 'direto'.
  //   - Resultado: MESMO NR com mesma planilha dava categorias diferentes
  //     dependendo de quem estava classificando.
  //
  // DEPOIS:
  //   - `DuplicadoInfo` carrega `operadorSetorId`/`operadorEquipeId` embutidos
  //     pela query batch de duplicados (join com `perfis`).
  //   - A classificação usa esses campos direto, sem depender de RLS no
  //     contexto do classificador → mesmo NR dá a mesma categoria para qualquer
  //     classificador.
  // ═══════════════════════════════════════════════════════════════════════════
  describe('regressão #10: classificação independe do perfil do classificador', () => {
    const SETOR_DONO = 'setor-dono';
    const configSetorDonoAtiva: DiretoExtraConfig = {
      id: 'cfg-setor-dono',
      escopo: 'setor',
      referencia_id: SETOR_DONO,
      ativo: true,
      empresa_id: 'e1',
      criado_em: '',
      atualizado_em: '',
    };
    const dupInfoEmbutido: DuplicadoInfo = {
      acordoId: 'a-1000',
      operadorId: opOutroId,
      operadorNome: 'Dono',
      operadorSetorId: SETOR_DONO,
      operadorEquipeId: null,
    };

    it('usa setor/equipe embutidos no DuplicadoInfo — resolverDadosOperador NÃO é chamado', async () => {
      const resolverSpy = vi.fn(async () => ({ setorId: null, equipeId: null }));

      const res = await classificarNrsImportados({
        ...baseParams,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'INSC-1000' }],
        duplicados: new Map([['INSC-1000', dupInfoEmbutido]]),
        resolverDadosOperador: resolverSpy,
      });

      expect(res[0].categoria).toBe('direto');
      expect(res[0].donoTemLogica).toBe(true);
      // O callback (sujeito a RLS) NÃO deve ter sido acionado quando o
      // DuplicadoInfo já traz os dados embutidos.
      expect(resolverSpy).not.toHaveBeenCalled();
    });

    it('mesmo com resolverDadosOperador retornando null (RLS bloqueou), categoria ainda é "direto" via dados embutidos', async () => {
      // Cenário exato do bug: RLS bloqueia leitura de perfis de outro setor.
      // Antes do fix, isso derrubava a categoria para 'duplicado'. Com os
      // dados embutidos, a classificação ignora o fallback bloqueado.
      const res = await classificarNrsImportados({
        ...baseParams,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'INSC-1000' }],
        duplicados: new Map([['INSC-1000', dupInfoEmbutido]]),
        resolverDadosOperador: async () => null, // RLS bloqueou
      });

      expect(res[0].categoria).toBe('direto');
      expect(res[0].donoTemLogica).toBe(true);
    });

    it('dois classificadores diferentes produzem a MESMA categoria para o mesmo duplicado embutido', async () => {
      // Classificador A: operador "Carlos" sem permissão de ler outros perfis.
      const resCarlos = await classificarNrsImportados({
        operadorAtualId: 'carlos-id',
        operadorAtualSetorId: 'setor-carlos',
        operadorAtualEquipeId: null,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'INSC-1000' }],
        duplicados: new Map([['INSC-1000', dupInfoEmbutido]]),
        resolverDadosOperador: async () => null, // RLS bloqueia Carlos
      });

      // Classificador B: "Admin" com visão global.
      const resAdmin = await classificarNrsImportados({
        operadorAtualId: 'admin-id',
        operadorAtualSetorId: 'setor-admin',
        operadorAtualEquipeId: null,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'INSC-1000' }],
        duplicados: new Map([['INSC-1000', dupInfoEmbutido]]),
        resolverDadosOperador: async () => ({
          setorId: SETOR_DONO,
          equipeId: null,
        }),
      });

      expect(resCarlos[0].categoria).toBe(resAdmin[0].categoria);
      expect(resCarlos[0].categoria).toBe('direto');
    });

    it('retrocompat: DuplicadoInfo sem setor/equipe embutidos ainda cai no resolverDadosOperador (callback)', async () => {
      const dupLegado: DuplicadoInfo = {
        acordoId: 'a-legado',
        operadorId: opOutroId,
        operadorNome: 'Legado',
        // SEM operadorSetorId / operadorEquipeId → cai no fallback
      };
      const resolverSpy = vi.fn(async () => ({
        setorId: SETOR_DONO,
        equipeId: null,
      }));

      const res = await classificarNrsImportados({
        ...baseParams,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'NR-LEG' }],
        duplicados: new Map([['NR-LEG', dupLegado]]),
        resolverDadosOperador: resolverSpy,
      });

      expect(res[0].categoria).toBe('direto');
      expect(resolverSpy).toHaveBeenCalledWith(opOutroId);
    });

    it('dados embutidos indicando "sem lógica" no dono → duplicado com autorização (não chama callback)', async () => {
      const dupEmbutidoSemLogica: DuplicadoInfo = {
        acordoId: 'a-2',
        operadorId: opOutroId,
        operadorNome: 'Outro',
        operadorSetorId: 'setor-neutro',  // sem config ativa
        operadorEquipeId: null,
      };
      const resolverSpy = vi.fn(async () => ({
        // Se chamado por engano, isso MUDARIA a resposta — o teste garante
        // que não é chamado.
        setorId: SETOR_DONO,
        equipeId: null,
      }));

      const res = await classificarNrsImportados({
        ...baseParams,
        configsDiretoExtra: [configSetorDonoAtiva],
        registros: [{ linhaOriginal: 1, nr: 'NR-X' }],
        duplicados: new Map([['NR-X', dupEmbutidoSemLogica]]),
        resolverDadosOperador: resolverSpy,
      });

      expect(res[0].categoria).toBe('duplicado');
      expect(res[0].precisaAutorizacao).toBe(true);
      expect(resolverSpy).not.toHaveBeenCalled();
    });
  });
});
