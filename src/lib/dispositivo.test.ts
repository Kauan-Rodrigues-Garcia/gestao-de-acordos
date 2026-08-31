import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  limparCacheDispositivoParaTeste,
  obterDispositivoId,
  rotuloDispositivo,
} from './dispositivo';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  window.localStorage.clear();
  limparCacheDispositivoParaTeste();
  vi.restoreAllMocks();
});

describe('identificação do computador', () => {
  it('cria uma vez e reutiliza o UUID persistido', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID);

    expect(obterDispositivoId()).toBe(UUID);
    limparCacheDispositivoParaTeste();
    expect(obterDispositivoId()).toBe(UUID);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('ignora valor adulterado e grava um UUID válido novo', () => {
    window.localStorage.setItem('gestao-acordos:dispositivo:v1', 'nome-do-pc-inventado');
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID);

    expect(obterDispositivoId()).toBe(UUID);
  });

  it('mostra um rótulo curto sem fingir ser o hostname', () => {
    expect(rotuloDispositivo(UUID)).toBe('PC-123E4567');
    expect(rotuloDispositivo(null)).toBe('Não identificado');
  });
});
