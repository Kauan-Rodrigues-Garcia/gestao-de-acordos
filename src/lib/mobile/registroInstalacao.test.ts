import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { aparelhoDoNavegador, precisaRegistrar, registrarAberturaInstalada } from './registroInstalacao';
import { resumoAppCelular, type LinhaAppCelular } from '@/pages/AdminLogs/appCelular';

describe('registro de instalação', () => {
  beforeEach(() => { rpc.mockReset(); localStorage.clear(); });

  it('reconhece o aparelho pelo navegador', () => {
    expect(aparelhoDoNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('iphone');
    expect(aparelhoDoNavegador('Mozilla/5.0 (Linux; Android 14; SM-A546E)')).toBe('android');
    expect(aparelhoDoNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('outro');
  });

  it('registra uma vez por dia', async () => {
    rpc.mockResolvedValue({ error: null });
    await registrarAberturaInstalada('ana', '2026-10-05');
    await registrarAberturaInstalada('ana', '2026-10-05');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_app_registrar_abertura', expect.objectContaining({ p_aparelho: expect.any(String) }));
    await registrarAberturaInstalada('ana', '2026-10-06');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('falha não marca o dia: a próxima abertura tenta de novo', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'rede' } }).mockResolvedValueOnce({ error: null });
    await registrarAberturaInstalada('ana', '2026-10-05');
    expect(precisaRegistrar('ana', '2026-10-05')).toBe(true);
    await registrarAberturaInstalada('ana', '2026-10-05');
    expect(precisaRegistrar('ana', '2026-10-05')).toBe(false);
  });
});

describe('resumoAppCelular', () => {
  const linha = (instalado: boolean, celulares: number): LinhaAppCelular => ({
    perfil_id: Math.random().toString(), nome: 'x', cargo: 'operador', situacao: 'ativo',
    empresa_id: 'e', empresa_nome: null, setor_nome: null,
    instalado_em: instalado ? '2026-10-05T12:00:00Z' : null, ultima_abertura_em: null,
    aparelho: instalado ? 'iphone' : null, celulares, celular_desde: null,
  });

  it('conta instalou, celular registrado e instalou sem avisos', () => {
    expect(resumoAppCelular([linha(true, 1), linha(true, 0), linha(false, 2)])).toEqual({
      instalaram: 2, comCelular: 2, instalaramSemAviso: 1,
    });
  });
});
