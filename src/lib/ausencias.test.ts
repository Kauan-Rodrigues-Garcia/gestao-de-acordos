import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TIPOS_AUSENCIA, ehTipoAusencia, rotuloDoTipo, diasDaAusencia, diasNoRecorte,
  estadoDaAusencia, primeiraSobreposta, validarAusencia, rotuloDoPeriodo,
} from './ausencias';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

function migracaoDaFase8(): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_vendas_fase8_feedback_e_ausencias.sql'));
  expect(arquivo, 'migration da Fase 8 não encontrada').toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

describe('a lista de tipos é a mesma do banco', () => {
  it('cada tipo, rótulo e `abate_meta` do INSERT está aqui, na mesma ordem', () => {
    const sql = migracaoDaFase8();
    const bloco = sql.slice(
      sql.indexOf('INSERT INTO public.ausencias_tipos'),
      sql.indexOf('ON CONFLICT (tipo) DO NOTHING'),
    );
    const doBanco = [...bloco.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*(true|false),\s*(\d+)\)/g)]
      .map(m => ({ tipo: m[1], rotulo: m[2], abateMeta: m[3] === 'true', ordem: Number(m[4]) }))
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ tipo, rotulo, abateMeta }) => ({ tipo, rotulo, abateMeta }));

    // Divergir faz a tela oferecer um tipo que o banco recusa, ou mostrar um
    // rótulo diferente do que a meta proporcional vai ler.
    expect(doBanco).toEqual(TIPOS_AUSENCIA.map(t => ({ ...t })));
  });

  it('falta e suspensão não descontam — descontar falta seria premiar a falta', () => {
    const naoAbatem = TIPOS_AUSENCIA.filter(t => !t.abateMeta).map(t => t.tipo);
    expect(naoAbatem).toEqual(['falta', 'suspensao', 'outros']);
  });
});

describe('tipos', () => {
  it('reconhece só o que existe', () => {
    expect(ehTipoAusencia('inss')).toBe(true);
    expect(ehTipoAusencia('feriado')).toBe(false);
    expect(ehTipoAusencia(undefined)).toBe(false);
  });

  it('rótulo desconhecido volta como veio, em vez de sumir', () => {
    expect(rotuloDoTipo('banco_de_horas')).toBe('Banco de horas');
    expect(rotuloDoTipo('tipo_novo')).toBe('tipo_novo');
  });
});

describe('contagem de dias', () => {
  it('conta os dois extremos', () => {
    expect(diasDaAusencia({ inicio: '2026-09-10', fim: '2026-09-10', meio_periodo: false })).toBe(1);
    expect(diasDaAusencia({ inicio: '2026-09-01', fim: '2026-09-30', meio_periodo: false })).toBe(30);
  });

  it('meio período vale meio dia', () => {
    expect(diasDaAusencia({ inicio: '2026-09-10', fim: '2026-09-10', meio_periodo: true })).toBe(0.5);
  });

  it('atravessa mês e ano sem errar por fuso', () => {
    // 28/12 a 05/01 são 9 dias. Contar por `new Date('2026-12-28')` local erra
    // em um no horário de verão; a conta é em UTC.
    expect(diasDaAusencia({ inicio: '2026-12-28', fim: '2027-01-05', meio_periodo: false })).toBe(9);
    expect(diasDaAusencia({ inicio: '2028-02-28', fim: '2028-03-01', meio_periodo: false })).toBe(3);
  });

  it('período invertido ou data malformada conta zero', () => {
    expect(diasDaAusencia({ inicio: '2026-09-10', fim: '2026-09-09', meio_periodo: false })).toBe(0);
    expect(diasDaAusencia({ inicio: '10/09/2026', fim: '2026-09-10', meio_periodo: false })).toBe(0);
  });

  it('no recorte, conta só o que cai dentro do mês', () => {
    // INSS de 20/08 a 10/10: em setembro são os 30 dias do mês.
    const inss = { inicio: '2026-08-20', fim: '2026-10-10', meio_periodo: false };
    expect(diasNoRecorte(inss, '2026-09-01', '2026-09-30')).toBe(30);
    expect(diasNoRecorte(inss, '2026-08-01', '2026-08-31')).toBe(12);
    expect(diasNoRecorte(inss, '2026-11-01', '2026-11-30')).toBe(0);
  });
});

describe('estado', () => {
  const a = { inicio: '2026-09-10', fim: '2026-09-20' };
  it('o primeiro e o último dia ainda estão em curso', () => {
    expect(estadoDaAusencia(a, '2026-09-10')).toBe('em_curso');
    expect(estadoDaAusencia(a, '2026-09-20')).toBe('em_curso');
  });
  it('antes é futura, depois é encerrada', () => {
    expect(estadoDaAusencia(a, '2026-09-09')).toBe('futura');
    expect(estadoDaAusencia(a, '2026-09-21')).toBe('encerrada');
  });
});

describe('sobreposição — a mesma regra de fn_ausencia_salvar', () => {
  const lista = [
    { id: 'a', tipo: 'inss',     inicio: '2026-09-01', fim: '2026-09-15', meio_periodo: false },
    { id: 'b', tipo: 'atestado', inicio: '2026-09-20', fim: '2026-09-20', meio_periodo: false },
  ];

  it('um dia em comum já é choque', () => {
    expect(primeiraSobreposta(lista, { inicio: '2026-09-15', fim: '2026-09-18' })?.id).toBe('a');
    expect(primeiraSobreposta(lista, { inicio: '2026-09-18', fim: '2026-09-25' })?.id).toBe('b');
  });

  it('encostar não é sobrepor', () => {
    expect(primeiraSobreposta(lista, { inicio: '2026-09-16', fim: '2026-09-19' })).toBeNull();
  });

  it('ao corrigir, a própria linha não conta', () => {
    expect(primeiraSobreposta(lista, { inicio: '2026-09-01', fim: '2026-09-16' }, 'a')).toBeNull();
  });

  it('com dois choques, devolve o mais antigo', () => {
    expect(primeiraSobreposta(lista, { inicio: '2026-08-01', fim: '2026-09-30' })?.id).toBe('a');
  });
});

describe('validação do formulário', () => {
  const ok = { tipo: 'atestado', inicio: '2026-09-10', fim: '2026-09-12', meio_periodo: false, observacao: '' };

  it('um atestado de três dias passa', () => {
    expect(validarAusencia(ok)).toBeNull();
  });

  it('recusa o que o banco recusaria', () => {
    expect(validarAusencia({ ...ok, tipo: '' })).toMatch(/tipo/);
    expect(validarAusencia({ ...ok, fim: '' })).toMatch(/primeiro e o último dia/);
    expect(validarAusencia({ ...ok, fim: '2026-09-09' })).toMatch(/anterior/);
    expect(validarAusencia({ ...ok, meio_periodo: true })).toMatch(/um dia só/);
    expect(validarAusencia({ ...ok, tipo: 'outros' })).toMatch(/motivo/);
  });

  it('«Outros» com motivo passa', () => {
    expect(validarAusencia({ ...ok, tipo: 'outros', observacao: 'Doação de sangue' })).toBeNull();
  });
});

describe('rótulo do período', () => {
  it('um dia, com e sem meio período', () => {
    expect(rotuloDoPeriodo({ inicio: '2026-09-10', fim: '2026-09-10', meio_periodo: false })).toBe('10/09');
    expect(rotuloDoPeriodo({ inicio: '2026-09-10', fim: '2026-09-10', meio_periodo: true })).toBe('10/09 (meio período)');
  });

  it('o ano só aparece quando muda', () => {
    expect(rotuloDoPeriodo({ inicio: '2026-09-10', fim: '2026-09-20', meio_periodo: false })).toBe('10/09 a 20/09');
    expect(rotuloDoPeriodo({ inicio: '2026-12-28', fim: '2027-01-05', meio_periodo: false }))
      .toBe('28/12/2026 a 05/01/2027');
  });
});
