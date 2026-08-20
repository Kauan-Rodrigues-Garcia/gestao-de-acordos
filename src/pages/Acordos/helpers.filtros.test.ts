import { describe, expect, it } from 'vitest';
import { statusParaAbaAcordos } from './helpers';

describe('statusParaAbaAcordos', () => {
  it('diferencia Todos de Verificar no filtro enviado ao servidor', () => {
    expect(statusParaAbaAcordos('todos')).toBeUndefined();
    expect(statusParaAbaAcordos('analitico')).toBe('verificar_pendente');
  });

  it('mapeia as demais abas e preserva um filtro manual válido', () => {
    expect(statusParaAbaAcordos('pagos')).toBe('pago');
    expect(statusParaAbaAcordos('nao_pagos')).toBe('nao_pago');
    expect(statusParaAbaAcordos('todos', 'pago')).toBe('pago');
  });
});
