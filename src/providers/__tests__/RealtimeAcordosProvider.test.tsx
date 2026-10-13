/**
 * src/providers/__tests__/RealtimeAcordosProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O tempo real de `acordos` pelo aviso com os ids (migration 20261009220000).
 *
 * Estratégia:
 *  • `@/lib/realtime` → `assinarTabela` falso que guarda o ouvinte de cada tópico
 *  • `supabase.from('acordos').select().in()` → devolve `linhasRelidas`
 *  • timers falsos para a janela de `AGRUPAR_MS`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const {
  mockPerfilRef, mockEmpresaRef, mockPermissoesRef, ouvintesPorTopico, saidas, idsPedidosRef, linhasRelidasRef, erroRef,
} = vi.hoisted(() => ({
  mockPerfilRef:     { current: null as unknown },
  mockEmpresaRef:    { current: null as unknown },
  mockPermissoesRef: { current: {} as Record<string, boolean> },
  ouvintesPorTopico: new Map<string, {
    onSinal?: (p: Record<string, unknown>, s: string) => void;
    onReconectado?: () => void;
    onEstado?: (e: 'conectado' | 'caido' | 'barrado') => void;
  }>(),
  saidas:            { current: 0 },
  idsPedidosRef:     { current: [] as string[][] },
  linhasRelidasRef:  { current: [] as unknown[] },
  erroRef:           { current: null as { message: string } | null },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: mockPerfilRef.current }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: mockEmpresaRef.current }) }));
vi.mock('@/lib/mobile/rota', () => ({ useNaRotaDoCelular: () => false }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ permissoes: mockPermissoesRef.current }),
}));

vi.mock('@/lib/realtime', () => ({
  assinarTabela: vi.fn((assinatura: { topico: string }, ouvinte: object) => {
    ouvintesPorTopico.set(assinatura.topico, ouvinte);
    return () => { saidas.current += 1; ouvintesPorTopico.delete(assinatura.topico); };
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn((_col: string, ids: string[]) => {
          idsPedidosRef.current.push(ids);
          const data = (linhasRelidasRef.current as { id: string }[]).filter(l => ids.includes(l.id));
          return Promise.resolve({ data: erroRef.current ? null : data, error: erroRef.current });
        }),
      })),
    })),
  },
}));

import {
  RealtimeAcordosProvider, useRealtimeAcordos, juntarAviso, ouveAEmpresa, AGRUPAR_MS, TOLERANCIA_QUEDA_MS,
  type AcordoRealtimeEvent,
} from '@/providers/RealtimeAcordosProvider';
import { assinarTabela } from '@/lib/realtime';

const EMPRESA_ID = 'emp-1';
const EU = 'perfil-1';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <RealtimeAcordosProvider>{children}</RealtimeAcordosProvider>
    </QueryClientProvider>
  );
}

const acordo = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, empresa_id: EMPRESA_ID, operador_id: EU, nome_cliente: 'Cliente', valor: 100, ...extra });

/** Dispara o aviso num tópico e deixa passar a janela de agrupamento. */
async function aviso(topico: string, payload: Record<string, unknown>) {
  await act(async () => {
    ouvintesPorTopico.get(topico)?.onSinal?.(payload, 'mudou');
    await vi.advanceTimersByTimeAsync(AGRUPAR_MS + 1);
  });
}

describe('RealtimeAcordosProvider — aviso com os ids', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ouvintesPorTopico.clear();
    saidas.current = 0;
    idsPedidosRef.current = [];
    linhasRelidasRef.current = [];
    erroRef.current = null;
    mockEmpresaRef.current = { id: EMPRESA_ID };
    mockPerfilRef.current = { id: EU, empresa_id: EMPRESA_ID, perfil: 'lider' };
    // Líder com a aba Acordos na equipe: passa na policy da empresa.
    mockPermissoesRef.current = { ver_acordos: true, acordos_escopo_equipe: true };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('ouve o tópico do dono e o da empresa, só por sinal', () => {
    renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    expect([...ouvintesPorTopico.keys()].sort()).toEqual([`acordos-op:${EU}`, `acordos:${EMPRESA_ID}`]);
    for (const chamada of vi.mocked(assinarTabela).mock.calls) {
      expect(chamada[0].escutas).toEqual([{ sinal: 'mudou' }]);
    }
  });

  it('operador (só os próprios) não assina o tópico da empresa — a RLS recusaria', () => {
    mockPerfilRef.current = { id: EU, empresa_id: EMPRESA_ID, perfil: 'operador' };
    mockPermissoesRef.current = { ver_acordos: true, acordos_escopo_individual: true };
    renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    expect([...ouvintesPorTopico.keys()]).toEqual([`acordos-op:${EU}`]);
  });

  it('permissões que chegam depois ligam a empresa sem refazer o tópico do dono', () => {
    mockPermissoesRef.current = {};
    const { rerender } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    expect([...ouvintesPorTopico.keys()]).toEqual([`acordos-op:${EU}`]);

    mockPermissoesRef.current = { ver_acordos: true, acordos_escopo_setor: true };
    rerender();

    expect(ouvintesPorTopico.has(`acordos:${EMPRESA_ID}`)).toBe(true);
    expect(saidas.current).toBe(0);
  });

  it('aviso no tópico da empresa entra no mesmo agrupamento', async () => {
    linhasRelidasRef.current = [acordo('a9')];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('t', handler); });

    await aviso(`acordos:${EMPRESA_ID}`, { operacao: 'UPDATE', ids: ['a9'] });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'UPDATE' }));
  });

  it('sem empresa ou sem perfil não assina nada', () => {
    mockEmpresaRef.current = null;
    mockPerfilRef.current = null;
    renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    expect(assinarTabela).not.toHaveBeenCalled();
  });

  it('usa a empresa do perfil quando a empresa ainda não chegou', () => {
    mockEmpresaRef.current = null;
    mockPerfilRef.current = { id: EU, empresa_id: 'emp-do-perfil' };
    renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    expect(ouvintesPorTopico.has('acordos:emp-do-perfil')).toBe(true);
  });

  it('UPDATE: relê os ids com a RLS de quem ouve e entrega o registro completo', async () => {
    linhasRelidasRef.current = [acordo('a1', { valor: 999 })];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await aviso(`acordos-op:${EU}`, { operacao: 'UPDATE', ids: ['a1'] });

    expect(idsPedidosRef.current).toEqual([['a1']]);
    const ev: AcordoRealtimeEvent = handler.mock.calls[0][0];
    expect(ev.eventType).toBe('UPDATE');
    expect(ev.newRecord).toMatchObject({ id: 'a1', valor: 999 });
  });

  it('INSERT chega como INSERT', async () => {
    linhasRelidasRef.current = [acordo('novo')];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await aviso(`acordos:${EMPRESA_ID}`, { operacao: 'INSERT', ids: ['novo'] });

    expect(handler.mock.calls[0][0]).toMatchObject({ eventType: 'INSERT', newRecord: { id: 'novo' } });
  });

  it('o mesmo id avisado pelos dois tópicos é relido e entregue UMA vez', async () => {
    linhasRelidasRef.current = [acordo('a1')];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await act(async () => {
      ouvintesPorTopico.get(`acordos-op:${EU}`)?.onSinal?.({ operacao: 'UPDATE', ids: ['a1'] }, 'mudou');
      ouvintesPorTopico.get(`acordos:${EMPRESA_ID}`)?.onSinal?.({ operacao: 'UPDATE', ids: ['a1'] }, 'mudou');
      await vi.advanceTimersByTimeAsync(AGRUPAR_MS + 1);
    });

    expect(idsPedidosRef.current).toEqual([['a1']]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('acordo fora do alcance (a releitura não devolve) não gera evento', async () => {
    linhasRelidasRef.current = [];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await aviso(`acordos:${EMPRESA_ID}`, { operacao: 'UPDATE', ids: ['de-outro-setor'] });

    expect(handler).not.toHaveBeenCalled();
  });

  it('DELETE entrega o id sem reler', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await aviso(`acordos-op:${EU}`, { operacao: 'DELETE', ids: ['x1'] });

    expect(idsPedidosRef.current).toEqual([]);
    expect(handler.mock.calls[0][0]).toEqual({ eventType: 'DELETE', oldRecord: { id: 'x1' } });
  });

  it('sem nenhuma tela ouvindo, não relê nada', async () => {
    linhasRelidasRef.current = [acordo('a1')];
    renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    await aviso(`acordos-op:${EU}`, { operacao: 'UPDATE', ids: ['a1'] });
    expect(idsPedidosRef.current).toEqual([]);
  });

  it('erro na releitura não quebra o provider nem entrega nada', async () => {
    erroRef.current = { message: 'falha' };
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });
    await aviso(`acordos-op:${EU}`, { operacao: 'UPDATE', ids: ['a1'] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('«recarregar» (importação grande) avisa todos com UPDATE sem registro', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });

    await aviso(`acordos:${EMPRESA_ID}`, { operacao: 'INSERT', recarregar: true });

    expect(handler).toHaveBeenCalledWith({ eventType: 'UPDATE' });
    expect(idsPedidosRef.current).toEqual([]);
  });

  it('unsubscribe para de entregar', async () => {
    linhasRelidasRef.current = [acordo('a1')];
    const handler = vi.fn();
    const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    act(() => { result.current.subscribe('s1', handler); });
    act(() => { result.current.unsubscribe('s1'); });
    await aviso(`acordos-op:${EU}`, { operacao: 'UPDATE', ids: ['a1'] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('desmontar cancela os dois tópicos', () => {
    const { unmount } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
    unmount();
    expect(saidas.current).toBe(2);
  });

  describe('status (segue o tópico do dono)', () => {
    it('connecting → connected quando o canal entra', () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
      expect(result.current.status).toBe('connecting');
      act(() => { ouvintesPorTopico.get(`acordos-op:${EU}`)?.onEstado?.('conectado'); });
      expect(result.current.status).toBe('connected');
    });

    it('queda só vira «error» depois da tolerância; voltar antes cancela', () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: wrapper() });
      const ouvinte = ouvintesPorTopico.get(`acordos-op:${EU}`)!;
      act(() => { ouvinte.onEstado?.('conectado'); });

      act(() => { ouvinte.onEstado?.('caido'); });
      expect(result.current.status).toBe('connected');
      act(() => { ouvinte.onEstado?.('conectado'); vi.advanceTimersByTime(TOLERANCIA_QUEDA_MS); });
      expect(result.current.status).toBe('connected');

      act(() => { ouvinte.onEstado?.('caido'); vi.advanceTimersByTime(TOLERANCIA_QUEDA_MS); });
      expect(result.current.status).toBe('error');
    });
  });

  it('fora do provider: valor padrão seguro', () => {
    const { result } = renderHook(() => useRealtimeAcordos());
    expect(result.current.status).toBe('off');
    expect(() => result.current.subscribe('x', vi.fn())).not.toThrow();
    expect(() => result.current.unsubscribe('x')).not.toThrow();
  });
});

describe('juntarAviso', () => {
  const vazio = () => ({ inseridos: new Set<string>(), alterados: new Set<string>(), apagados: new Set<string>(), recarregar: false });

  it('separa por operação e ignora lixo', () => {
    const p = vazio();
    juntarAviso(p, { operacao: 'INSERT', ids: ['a', 1, null] });
    juntarAviso(p, { operacao: 'UPDATE', ids: ['b'] });
    juntarAviso(p, { operacao: 'DELETE', ids: ['c'] });
    juntarAviso(p, { operacao: 'UPDATE' });
    expect([...p.inseridos]).toEqual(['a']);
    expect([...p.alterados]).toEqual(['b']);
    expect([...p.apagados]).toEqual(['c']);
  });

  it('«recarregar» liga a flag', () => {
    const p = vazio();
    juntarAviso(p, { operacao: 'INSERT', recarregar: true });
    expect(p.recarregar).toBe(true);
  });
});

/** Espelho de `fn_user_escopo_acordos() >= 1 OR fn_user_is_super_admin()`. */
describe('ouveAEmpresa', () => {
  it('super_admin passa sem olhar o mapa', () => {
    expect(ouveAEmpresa('super_admin', {})).toBe(true);
  });

  it('só os próprios (individual) não passa', () => {
    expect(ouveAEmpresa('operador', { ver_acordos: true, acordos_escopo_individual: true })).toBe(false);
  });

  it('escopo além dos meus numa aba ligada passa', () => {
    expect(ouveAEmpresa('lider', { ver_painel_lider: true, painel_lider_escopo_equipe: true })).toBe(true);
    expect(ouveAEmpresa('gerencia', { ver_pix_automatico: true, pix_escopo_todos_setores: true })).toBe(true);
  });

  it('escopo numa aba DESLIGADA não conta', () => {
    expect(ouveAEmpresa('lider', { ver_acordos: false, acordos_escopo_setor: true })).toBe(false);
  });

  it('dashboard não tem interruptor: o escopo dele basta', () => {
    expect(ouveAEmpresa('lider', { dashboard_escopo_setor: true })).toBe(true);
  });

  it('mapa vazio (permissões ainda carregando) não passa', () => {
    expect(ouveAEmpresa('lider', {})).toBe(false);
  });
});
