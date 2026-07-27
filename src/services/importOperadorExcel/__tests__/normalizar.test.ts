import { describe, it, expect } from 'vitest';
import {
  normalizarLogin, normalizarCabecalho, mapearCabecalhos, cabecalhoTemObrigatorios,
} from '../normalizar';

describe('normalizarLogin', () => {
  it('remove espaços das extremidades, minúsculas, preserva miolo', () => {
    expect(normalizarLogin(' GABRIEL_OLIVEIRA ')).toBe('gabriel_oliveira');
    expect(normalizarLogin('maria_mazziero ')).toBe('maria_mazziero');
    expect(normalizarLogin('AMANDA_PAULO')).toBe('amanda_paulo');
  });
  it('remove nbsp / espaços Unicode das extremidades', () => {
    expect(normalizarLogin(' gabriel_oliveira ')).toBe('gabriel_oliveira');
    expect(normalizarLogin(' maria_mazziero﻿')).toBe('maria_mazziero');
  });
  it('trata nulo/undefined', () => {
    expect(normalizarLogin(null)).toBe('');
    expect(normalizarLogin(undefined)).toBe('');
  });
});

describe('normalizarCabecalho', () => {
  it('remove acentos, quebras, colapsa espaços, minúsculas', () => {
    expect(normalizarCabecalho('  Matrícula ')).toBe('matricula');
    expect(normalizarCabecalho('Crachá')).toBe('cracha');
    expect(normalizarCabecalho('Valor  de\nNota')).toBe('valor de nota');
    expect(normalizarCabecalho('Meta batida-Pendente')).toBe('meta batida-pendente');
    expect(normalizarCabecalho(' Super ')).toBe('super');
    expect(normalizarCabecalho('%')).toBe('%');
  });
});

describe('mapearCabecalhos', () => {
  it('mapeia a estrutura da Luciana (A..I)', () => {
    const m = mapearCabecalhos(['Data', 'Crachá', 'Login', 'nr', 'Valor de Nota', '%', 'valor', 'Meta batida-Pendente', 'super']);
    expect(m).toEqual({
      data: 0, matricula: 1, login: 2, nr: 3, valorNota: 4,
      percentual: 5, valorCalculado: 6, metaBatidaPendente: 7, super: 8,
    });
    expect(cabecalhoTemObrigatorios(m)).toBe(true);
  });

  it('mapeia a estrutura do Bryan (sem matrícula)', () => {
    const m = mapearCabecalhos(['Data', 'Login', 'nr', 'Valor de Nota', '%', 'valor', 'Meta batida-Pendente', 'super']);
    expect(m.login).toBe(1);
    expect(m.nr).toBe(2);
    expect(m.valorNota).toBe(3);
    expect(m.valorCalculado).toBe(5);
    expect(m.metaBatidaPendente).toBe(6);
    expect(m.matricula).toBeUndefined();
    expect(cabecalhoTemObrigatorios(m)).toBe(true);
  });

  it('mapeia a estrutura do Matheus (NR/Valor/Super maiúsculos + Matrícula)', () => {
    const m = mapearCabecalhos(['Data', 'Login', 'Matrícula', 'NR', 'Valor de Nota', '%', 'Valor', 'Meta batida-Pendente', 'Super']);
    expect(m.login).toBe(1);
    expect(m.matricula).toBe(2);
    expect(m.nr).toBe(3);
    expect(m.valorCalculado).toBe(6);
    expect(m.metaBatidaPendente).toBe(7);
    expect(m.super).toBe(8);
  });

  it('não confunde "Valor de Nota" com "valor"', () => {
    const m = mapearCabecalhos(['Valor de Nota', 'valor']);
    expect(m.valorNota).toBe(0);
    expect(m.valorCalculado).toBe(1);
  });

  it('cabeçalho incompleto reprova obrigatórios', () => {
    const m = mapearCabecalhos(['Data', 'Login']);
    expect(cabecalhoTemObrigatorios(m)).toBe(false);
  });
});
