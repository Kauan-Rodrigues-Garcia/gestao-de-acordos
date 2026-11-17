/**
 * Chips Físicos 2.0 (17/11/2026): etiquetas, dias ativo, semáforo e lembrete.
 */
import { describe, it, expect } from 'vitest';
import {
  diasDe, erroDoLembrete, estadoDoLembrete, etiquetasDoChip, filtrarChips, formatarDuracaoLonga,
  luzesDoSemaforo, resumir, rotuloDias, saudeDosChips, tempoAtivoMs, type ChipParaConta,
} from '../chipsFisicosRegras';

const AGORA = Date.parse('2026-11-17T12:00:00Z');
const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('tempoAtivoMs — dias ativo', () => {
  it('ativo agora: acumulado + período atual', () => {
    const ms = tempoAtivoMs({ status: 'ativo', status_desde: iso(AGORA - 3 * DIA), ativo_acumulado_seg: 2 * 86_400 }, AGORA);
    expect(diasDe(ms)).toBe(5);
  });

  it('fora de ativo: só o acumulado', () => {
    const ms = tempoAtivoMs({ status: 'banido', status_desde: iso(AGORA - 3 * DIA), ativo_acumulado_seg: 86_400 }, AGORA);
    expect(diasDe(ms)).toBe(1);
  });

  it('sem a coluna (antes da migration) conta só o período atual', () => {
    expect(diasDe(tempoAtivoMs({ status: 'ativo', status_desde: iso(AGORA - 10 * DIA) }, AGORA))).toBe(10);
  });

  it('rótulo em dias', () => {
    expect(rotuloDias(3 * 3_600_000)).toBe('menos de 1 dia');
    expect(rotuloDias(DIA)).toBe('1 dia');
    expect(rotuloDias(12 * DIA + 5)).toBe('12 dias');
  });
});

describe('semáforo', () => {
  it('verdes primeiro, vermelho na ponta', () => {
    const luzes = luzesDoSemaforo([
      { id: '1', numero: '1', status: 'banido' as const },
      { id: '2', numero: '2', status: 'ativo' as const },
      { id: '3', numero: '3', status: 'recuperar' as const },
      { id: '4', numero: '4', status: 'ativo' as const },
      { id: '5', numero: '5', status: 'restricao' as const },
    ]).map(c => c.status);
    expect(luzes).toEqual(['ativo', 'ativo', 'recuperar', 'restricao', 'banido']);
  });

  it('saúde = % de ativos', () => {
    expect(saudeDosChips({ total: 4, ativo: 3 })).toBe(75);
    expect(saudeDosChips({ total: 0, ativo: 0 })).toBe(0);
  });
});

describe('etiquetas', () => {
  it('só as do catálogo, na ordem do catálogo', () => {
    expect(etiquetasDoChip({ etiquetas: ['reserva', 'xpto', 'movimentando'] })).toEqual(['movimentando', 'reserva']);
    expect(etiquetasDoChip({})).toEqual([]);
  });

  it('resumo conta movimentando e o filtro acha', () => {
    const chips: ChipParaConta[] = [
      { id: 'a', operador_id: 'x', numero: '18911110000', status: 'ativo', prazo_ate: null, etiquetas: ['movimentando'] },
      { id: 'b', operador_id: 'x', numero: '18922220000', status: 'ativo', prazo_ate: null, etiquetas: [] },
    ];
    expect(resumir(chips, AGORA).movimentando).toBe(1);
    const ids = filtrarChips(chips, { status: 'movimentando', busca: '' }, () => '', () => false).map(c => c.id);
    expect(ids).toEqual(['a']);
  });
});

describe('lembrete', () => {
  it('correndo, vencido e sem lembrete', () => {
    expect(estadoDoLembrete({}, AGORA)).toEqual({ tipo: 'sem_lembrete' });
    expect(estadoDoLembrete({ lembrete_ate: iso(AGORA + 60_000), lembrete_texto: 'Recarregar' }, AGORA))
      .toEqual({ tipo: 'correndo', restanteMs: 60_000, texto: 'Recarregar' });
    expect(estadoDoLembrete({ lembrete_ate: iso(AGORA - 1), lembrete_texto: 'Recarregar' }, AGORA))
      .toEqual({ tipo: 'vencido', texto: 'Recarregar' });
  });

  it('resumo conta lembrete vencido', () => {
    const r = resumir([{
      id: 'a', operador_id: 'x', numero: '1', status: 'ativo', prazo_ate: null,
      lembrete_ate: iso(AGORA - 1), lembrete_texto: 'x',
    }], AGORA);
    expect(r.lembreteVencido).toBe(1);
  });

  it('valida texto e tempo (até 7 dias, 80 caracteres)', () => {
    expect(erroDoLembrete('Trocar', 30)).toBeNull();
    expect(erroDoLembrete('', 30)).toMatch(/Escreva/);
    expect(erroDoLembrete('Trocar', null)).toMatch(/Escolha/);
    expect(erroDoLembrete('Trocar', 7 * 1440 + 1)).toMatch(/7 dias/);
    expect(erroDoLembrete('x'.repeat(81), 30)).toMatch(/80/);
  });

  it('duração longa', () => {
    expect(formatarDuracaoLonga(45)).toBe('45 min');
    expect(formatarDuracaoLonga(1440)).toBe('1 dia');
    expect(formatarDuracaoLonga(3 * 1440 + 120)).toBe('3 dias 2 h');
  });
});
