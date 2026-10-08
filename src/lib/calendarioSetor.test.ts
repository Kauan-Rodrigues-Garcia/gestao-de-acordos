import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MODELOS, TIPOS_EVENTO, TIPOS_LANCAVEIS, corForte, diasDaRegra, diasDoMes, eventosPorDia,
  faltaNoHorarioBanco, feriadosDoMes, lerHorarioBanco, proximosEventos, resumoDoMes, rotuloDoDia,
  semanasDoMes, temaEfetivo, textoDoBanco, textoSobreCor, type EventoCalendario,
} from './calendarioSetor';

/** Segunda a sexta, menos o 12/10 — o calendário das Metas de outubro/2026. */
const FERIADOS_OUT = ['2026-10-12'];
const util = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 5 && !FERIADOS_OUT.includes(iso);
};

function ev(dia: string, tipo: EventoCalendario['tipo'], extra: Partial<EventoCalendario> = {}): EventoCalendario {
  return {
    id: `${dia}-${tipo}-${extra.pessoa_id ?? ''}`, dia, tipo, titulo: tipo, detalhe: null, destaque: false,
    pessoa_id: null, pessoa_nome: null, pessoa_foto: null, ...extra,
  };
}

describe('a grade do mês', () => {
  it('outubro/2026 começa na quinta e tem 5 semanas de domingo a sábado', () => {
    const semanas = semanasDoMes('2026-10');
    expect(semanas).toHaveLength(5);
    expect(semanas[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(semanas[0][4]).toBe('2026-10-01');
    expect(semanas[4][6]).toBe('2026-10-31');
    expect(semanas.every(s => s.length === 7)).toBe(true);
  });

  it('fevereiro de ano bissexto tem 29 dias', () => {
    expect(diasDoMes('2028-02')).toHaveLength(29);
    expect(diasDoMes('2026-02')).toHaveLength(28);
  });
});

describe('aplicar em vários dias', () => {
  it('todos os sábados de outubro/2026', () => {
    expect(diasDaRegra('2026-10', { tipo: 'semana', dia: 6 }, util))
      .toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
  });

  it('dias úteis respeitam o feriado das Metas', () => {
    const uteis = diasDaRegra('2026-10', { tipo: 'dias_uteis' }, util);
    expect(uteis).toHaveLength(21);
    expect(uteis).not.toContain('2026-10-12');
  });

  it('fins de semana e o mês inteiro', () => {
    expect(diasDaRegra('2026-10', { tipo: 'fins_de_semana' }, util)).toHaveLength(9);
    expect(diasDaRegra('2026-10', { tipo: 'todos' }, util)).toHaveLength(31);
  });
});

describe('o resumo do mês', () => {
  const eventos = [
    ev('2026-10-03', 'banco_horas'),
    ev('2026-10-03', 'aniversario', { pessoa_id: 'ana' }),
    ev('2026-10-05', 'banco_horas'),
    ev('2026-10-05', 'banco_horas'),            // o mesmo dia não conta duas vezes
    ev('2026-10-12', 'feriado'),                // também está nas Metas: um feriado só
    ev('2026-10-20', 'feriado'),                // só aqui, à mão: não é feriado (quem diz é a Meta)
    ev('2026-10-28', 'aniversario', { pessoa_id: 'ana' }), // a mesma pessoa: uma vez
  ];

  it('conta dias, feriados, banco de horas e aniversariantes sem repetir', () => {
    const r = resumoDoMes('2026-10', eventos, util, FERIADOS_OUT, '2026-10-06');
    expect(r).toEqual({
      diasNoMes: 31,
      diasUteis: 21,
      diasUteisRestantes: 18,  // de 06 a 30, menos o 12
      feriados: 1,
      diasComBancoDeHoras: 2,
      aniversariantes: 1,
    });
  });

  it('fora do mês corrente não há «restantes»', () => {
    expect(resumoDoMes('2026-11', [], util, [], '2026-10-06').diasUteisRestantes).toBeNull();
  });

  it('a agenda começa hoje no mês corrente, e no dia 1 nos outros', () => {
    expect(proximosEventos('2026-10', eventos, '2026-10-06').map(e => e.dia))
      .toEqual(['2026-10-12', '2026-10-20', '2026-10-28']);
    expect(proximosEventos('2026-10', eventos, '2026-09-15')).toHaveLength(eventos.length);
  });

  it('agrupa por dia na ordem de chegada', () => {
    const porDia = eventosPorDia(eventos);
    expect(porDia.get('2026-10-03')?.map(e => e.tipo)).toEqual(['banco_horas', 'aniversario']);
    expect(porDia.get('2026-10-04')).toBeUndefined();
  });
});

describe('o feriado vem das Metas', () => {
  it('o dia das Metas é folga, com o nome do feriado nacional quando é um', () => {
    const f = feriadosDoMes('2026-10', ['2026-10-12', '2026-10-16']);
    expect(f.get('2026-10-12')).toEqual({ nome: 'Nossa Senhora Aparecida', folga: true });
    expect(f.get('2026-10-16')).toEqual({ nome: 'Feriado', folga: true });
  });

  it('feriado nacional que as Metas contam é dia de trabalho', () => {
    const f = feriadosDoMes('2026-11', []);
    expect(f.get('2026-11-02')).toEqual({ nome: 'Finados', folga: false });
    expect(f.get('2026-11-20')).toEqual({ nome: 'Consciência Negra', folga: false });
    expect(f.get('2026-11-03')).toBeUndefined();
  });

  it('o formulário não lança feriado nem tem modelo dele', () => {
    expect(TIPOS_LANCAVEIS).not.toContain('feriado');
    expect(MODELOS.some(m => m.tipo === 'feriado')).toBe(false);
  });
});

describe('o horário do banco de horas', () => {
  it('um modelo só de banco de horas, sem ponto facultativo nem expediente especial', () => {
    expect(MODELOS.filter(m => m.tipo === 'banco_horas')).toHaveLength(1);
    expect(MODELOS.map(m => m.rotulo)).not.toContain('Ponto facultativo');
    expect(MODELOS.map(m => m.rotulo)).not.toContain('Expediente especial');
  });

  it('escreve como a liderança já escrevia', () => {
    expect(textoDoBanco({ modo: 'duracao', minutos: 60 })).toBe('01 hora');
    expect(textoDoBanco({ modo: 'duracao', minutos: 120 })).toBe('02 horas');
    expect(textoDoBanco({ modo: 'duracao', minutos: 90 })).toBe('01h30');
    expect(textoDoBanco({ modo: 'duracao', minutos: 30 })).toBe('30 minutos');
    expect(textoDoBanco({ modo: 'intervalo', de: '08:30', ate: '12:00' })).toBe('08:30 às 12:00');
    expect(textoDoBanco({ modo: 'ate', ate: '19:00' })).toBe('até às 19:00');
  });

  it('lê de volta o que gravou, e o resto vira texto livre', () => {
    for (const t of ['01 hora', '02 horas', '01h30', '30 minutos', '08:30 às 12:00', 'até às 19:00']) {
      expect(textoDoBanco(lerHorarioBanco(t))).toBe(t);
    }
    expect(lerHorarioBanco('depois do almoço')).toEqual({ modo: 'livre', texto: 'depois do almoço' });
    expect(lerHorarioBanco('')).toEqual({ modo: 'duracao', minutos: 60 });
  });

  it('recusa horário incompleto ou ao contrário', () => {
    expect(faltaNoHorarioBanco({ modo: 'intervalo', de: '12:00', ate: '08:30' })).toMatch(/depois do início/);
    expect(faltaNoHorarioBanco({ modo: 'intervalo', de: '', ate: '12:00' })).toMatch(/Preencha/);
    expect(faltaNoHorarioBanco({ modo: 'ate', ate: '' })).toMatch(/Preencha/);
    expect(faltaNoHorarioBanco({ modo: 'livre', texto: '  ' })).toMatch(/Escreva/);
    expect(faltaNoHorarioBanco({ modo: 'intervalo', de: '08:30', ate: '12:00' })).toBeNull();
  });
});

describe('os temas', () => {
  it('«Automático» escolhe a campanha do mês, e o Padrão no mês sem campanha', () => {
    expect(temaEfetivo('automatico', 10).id).toBe('outubro_rosa');
    expect(temaEfetivo(null, 11).id).toBe('novembro_azul');
    expect(temaEfetivo('automatico', 7).id).toBe('padrao');
  });

  it('tema escolhido vence o mês; tema desconhecido cai no Padrão', () => {
    expect(temaEfetivo('natal', 10).id).toBe('natal');
    expect(temaEfetivo('nao_existe', 10).id).toBe('padrao');
  });

  it('o dia forte do Outubro Rosa tem texto branco; o do amarelo, escuro', () => {
    expect(textoSobreCor(corForte('#EC4899'))).toBe('#FFFFFF');
    expect(textoSobreCor(corForte('#2563EB'))).toBe('#FFFFFF');
    expect(textoSobreCor(corForte('#F59E0B'))).toBe('#1A1A1A');
  });
});

describe('textos', () => {
  it('rótulo do dia por extenso, sem passar por UTC', () => {
    expect(rotuloDoDia('2026-10-16')).toBe('Sexta-feira, 16 de outubro');
    expect(rotuloDoDia('2026-11-01')).toBe('Domingo, 1 de novembro');
  });
});

describe('contrato com o banco', () => {
  it('os tipos de evento são os mesmos do CHECK da migration', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/20261006170000_calendario_do_setor.sql'), 'utf8',
    );
    const bloco = /CONSTRAINT calendario_eventos_tipo CHECK \(tipo IN \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? '';
    const noSql = [...bloco.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    expect(noSql.sort()).toEqual([...TIPOS_EVENTO].sort());
  });
});
