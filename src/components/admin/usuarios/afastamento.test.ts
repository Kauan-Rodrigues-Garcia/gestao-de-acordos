import { describe, it, expect } from 'vitest';
import { TIPOS_AUSENCIA } from '@/lib/ausencias';
import {
  MOTIVOS_DE_AFASTAMENTO, validarAfastamento, foraDasContasEfetivo,
  rotuloDoAfastamento, afastamentoDaVez, rotuloDoUltimoUso, type RascunhoAfastamento,
} from './afastamento';

const HOJE = '2026-10-28';

function rascunho(p: Partial<RascunhoAfastamento> = {}): RascunhoAfastamento {
  return { tipo: 'atestado', inicio: HOJE, fim: '2026-10-30', semVolta: false, foraDasContas: false, observacao: '', ...p };
}

describe('motivos', () => {
  it('todo motivo da aba existe no banco', () => {
    const doBanco = new Set(TIPOS_AUSENCIA.map(t => t.tipo));
    for (const m of MOTIVOS_DE_AFASTAMENTO) expect(doBanco.has(m.tipo as never), m.tipo).toBe(true);
  });

  it('falta, abono e declaração não são afastamento', () => {
    const tipos = MOTIVOS_DE_AFASTAMENTO.map(m => m.tipo);
    expect(tipos).not.toContain('falta');
    expect(tipos).not.toContain('abono');
    expect(tipos).not.toContain('declaracao');
  });
});

describe('validarAfastamento', () => {
  it('aceita o caso comum', () => {
    expect(validarAfastamento(rascunho(), HOJE)).toBeNull();
  });

  it('tempo indeterminado dispensa o último dia', () => {
    expect(validarAfastamento(rascunho({ tipo: 'inss', fim: '', semVolta: true }), HOJE)).toBeNull();
  });

  it('férias sem volta é recusado', () => {
    expect(validarAfastamento(rascunho({ tipo: 'ferias', semVolta: true }), HOJE)).toMatch(/Férias precisam/);
  });

  it('fim antes do início, ou período que já passou', () => {
    expect(validarAfastamento(rascunho({ inicio: '2026-10-29', fim: '2026-10-28' }), HOJE)).toMatch(/anterior/);
    expect(validarAfastamento(rascunho({ inicio: '2026-10-01', fim: '2026-10-20' }), HOJE)).toMatch(/já terminou/);
  });

  it('outro motivo exige o texto', () => {
    expect(validarAfastamento(rascunho({ tipo: 'outros' }), HOJE)).toMatch(/escreva/);
    expect(validarAfastamento(rascunho({ tipo: 'outros', observacao: 'Curso da empresa' }), HOJE)).toBeNull();
  });
});

describe('foraDasContasEfetivo', () => {
  it('férias sai das contas mesmo com o interruptor desligado', () => {
    expect(foraDasContasEfetivo({ tipo: 'ferias', foraDasContas: false })).toBe(true);
    expect(foraDasContasEfetivo({ tipo: 'atestado', foraDasContas: false })).toBe(false);
    expect(foraDasContasEfetivo({ tipo: 'atestado', foraDasContas: true })).toBe(true);
  });
});

describe('rótulos', () => {
  it('diz até quando, sem data, ou a partir de quando', () => {
    expect(rotuloDoAfastamento({ tipo: 'atestado', inicio: HOJE, fim: '2026-11-05' }, HOJE)).toBe('Atestado até 05/11');
    expect(rotuloDoAfastamento({ tipo: 'inss', inicio: HOJE, fim: null }, HOJE)).toBe('INSS · sem data de volta');
    expect(rotuloDoAfastamento({ tipo: 'ferias', inicio: '2026-11-03', fim: '2026-11-20' }, HOJE)).toBe('Férias a partir de 03/11');
  });

  it('outro motivo mostra o texto escrito', () => {
    expect(rotuloDoAfastamento({ tipo: 'outros', inicio: HOJE, fim: null, observacao: 'Curso externo' }, HOJE))
      .toBe('Curso externo · sem data de volta');
  });

  it('último uso', () => {
    expect(rotuloDoUltimoUso('2026-10-20')).toBe('último acesso 20/10');
    expect(rotuloDoUltimoUso(null)).toBe('nunca abriu o sistema');
  });
});

describe('afastamentoDaVez', () => {
  it('prefere o que vale hoje; senão o próximo; ignora os encerrados', () => {
    const lista = [
      { id: 'velho', inicio: '2026-09-01', fim: '2026-09-10' },
      { id: 'futuro', inicio: '2026-11-10', fim: '2026-11-20' },
      { id: 'agora', inicio: '2026-10-27', fim: null },
    ];
    expect(afastamentoDaVez(lista, HOJE)?.id).toBe('agora');
    expect(afastamentoDaVez(lista.filter(a => a.id !== 'agora'), HOJE)?.id).toBe('futuro');
    expect(afastamentoDaVez([lista[0]], HOJE)).toBeNull();
  });
});
