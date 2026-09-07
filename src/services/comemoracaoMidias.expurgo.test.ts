/**
 * comemoracaoMidias.expurgo.test.ts — o dreno da fila de arquivos vencidos.
 *
 * A faxina noturna apaga a linha da mídia mas não o arquivo: o Supabase recusa
 * `DELETE FROM storage.objects` e a exceção derrubava a função inteira, o que a
 * migration 20260831120000 resolveu enfileirando o caminho em vez de tentar.
 * Só que quem drena a fila é o app, e por uma semana ninguém drenou — os
 * arquivos ficaram no bucket.
 *
 * O que estes testes seguram é o comportamento que faz a fila ANDAR: carimbar o
 * que saiu (senão retenta para sempre) e NÃO carimbar o que não saiu (senão o
 * arquivo fica no bucket com a linha dizendo que foi embora).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSelect, mockUpdate, mockRemove } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase', () => {
  // Encadeamento do supabase-js: os filtros devolvem o próprio builder e só o
  // método final resolve. `limit` fecha a leitura, `in` fecha o UPDATE — é por
  // eles que o teste responde.
  const fazerBuilder = () => {
    let payloadUpdate: unknown = null;
    const b: Record<string, unknown> = {};
    const devolve = () => vi.fn(() => b);
    b.select = devolve();
    b.eq     = devolve();
    b.is     = devolve();
    b.order  = devolve();
    b.update = vi.fn((p: unknown) => { payloadUpdate = p; return b; });
    b.limit  = vi.fn((n: number) => mockSelect(n));
    b.in     = vi.fn((coluna: string, ids: string[]) =>
      mockUpdate({ payload: payloadUpdate, coluna, ids }));
    return b;
  };

  return {
    supabase: {
      from: vi.fn(() => fazerBuilder()),
      storage: {
        from: vi.fn((bucket: string) => ({
          remove: (caminhos: string[]) => mockRemove(bucket, caminhos),
        })),
      },
    },
  };
});

import { drenarExpurgo, LOTE_EXPURGO } from './comemoracaoMidias.service';

function fila(n: number, bucket = 'comemoracoes') {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${i + 1}`, bucket, caminho: `empresa/gif/arquivo-${i + 1}.gif`,
  }));
}

describe('drenarExpurgo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
  });

  it('tira os arquivos do bucket e carimba as linhas', async () => {
    mockSelect.mockResolvedValue({ data: fila(3), error: null });

    const r = await drenarExpurgo('emp-1');

    expect(mockRemove).toHaveBeenCalledWith('comemoracoes', [
      'empresa/gif/arquivo-1.gif',
      'empresa/gif/arquivo-2.gif',
      'empresa/gif/arquivo-3.gif',
    ]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      coluna: 'id', ids: ['e-1', 'e-2', 'e-3'],
    });
    expect(r).toEqual({ removidos: 3, pendentes: 0 });
  });

  it('carimba `removido_em` com um instante, não com null', async () => {
    mockSelect.mockResolvedValue({ data: fila(1), error: null });

    await drenarExpurgo('emp-1');

    const { payload } = mockUpdate.mock.calls[0][0] as { payload: { removido_em: string } };
    expect(typeof payload.removido_em).toBe('string');
    expect(Number.isFinite(new Date(payload.removido_em).getTime())).toBe(true);
  });

  it('fila vazia não chama o Storage', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const r = await drenarExpurgo('emp-1');

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r).toEqual({ removidos: 0, pendentes: 0 });
  });

  it('Storage recusou: nada de carimbo, tudo volta como pendente', async () => {
    mockSelect.mockResolvedValue({ data: fila(2), error: null });
    mockRemove.mockResolvedValue({ error: { message: 'bucket indisponível' } });

    const r = await drenarExpurgo('emp-1');

    // Este é o ponto: carimbar aqui deixaria o arquivo no bucket para sempre,
    // com a linha jurando que ele saiu.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r).toEqual({ removidos: 0, pendentes: 2 });
  });

  it('arquivo saiu mas o carimbo falhou: conta como pendente, não como removido', async () => {
    mockSelect.mockResolvedValue({ data: fila(2), error: null });
    mockUpdate.mockResolvedValue({ error: { message: 'sem permissão' } });

    const r = await drenarExpurgo('emp-1');

    expect(r).toEqual({ removidos: 0, pendentes: 2 });
  });

  it('respeita o lote e devolve o resto como pendente', async () => {
    // A consulta pede LOTE+1 justamente para saber que sobrou.
    mockSelect.mockResolvedValue({ data: fila(LOTE_EXPURGO + 1), error: null });

    const r = await drenarExpurgo('emp-1');

    expect(mockSelect).toHaveBeenCalledWith(LOTE_EXPURGO + 1);
    expect(mockRemove.mock.calls[0][1]).toHaveLength(LOTE_EXPURGO);
    expect(r).toEqual({ removidos: LOTE_EXPURGO, pendentes: 1 });
  });

  it('chama cada bucket no seu lugar, não todos no padrão', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 'e-1', bucket: 'comemoracoes', caminho: 'a.gif' },
        { id: 'e-2', bucket: 'outro',        caminho: 'b.gif' },
      ],
      error: null,
    });

    const r = await drenarExpurgo('emp-1');

    expect(mockRemove).toHaveBeenCalledWith('comemoracoes', ['a.gif']);
    expect(mockRemove).toHaveBeenCalledWith('outro', ['b.gif']);
    expect(r).toEqual({ removidos: 2, pendentes: 0 });
  });

  it('um bucket falhar não impede o outro de ser drenado', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 'e-1', bucket: 'comemoracoes', caminho: 'a.gif' },
        { id: 'e-2', bucket: 'outro',        caminho: 'b.gif' },
      ],
      error: null,
    });
    mockRemove.mockImplementation((bucket: string) =>
      Promise.resolve(bucket === 'outro' ? { error: { message: 'fora do ar' } } : { error: null }));

    const r = await drenarExpurgo('emp-1');

    expect(r).toEqual({ removidos: 1, pendentes: 1 });
  });

  it('tabela ausente (migration não aplicada) não quebra a tela', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { code: '42P01', message: 'no such table' } });

    const r = await drenarExpurgo('emp-1');

    expect(mockRemove).not.toHaveBeenCalled();
    expect(r).toEqual({ removidos: 0, pendentes: 0 });
  });

  it('erro de leitura qualquer devolve zeros em vez de lançar', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { code: '42501', message: 'sem permissão' } });

    await expect(drenarExpurgo('emp-1')).resolves.toEqual({ removidos: 0, pendentes: 0 });
  });
});
