import { describe, it, expect } from 'vitest';
import {
  TEMAS, TEMA_AUTOMATICO, corDoIdLivre, feriadosDoMes, idDaCorLivre, temaEfetivo, type EventoCalendario,
} from './calendarioSetor';
import {
  ACENTO_PADRAO_GIBI, diasEntre, misturar, paletaGibi, primeiroNome, proximoMarco, reguaDoMes, sobre, varsDaPaleta,
} from './calendarioGibi';

/** Segunda a sexta, menos o 12/10 — o calendário das Metas de outubro/2026. */
const FERIADOS_OUT = ['2026-10-12'];
const util = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 5 && !FERIADOS_OUT.includes(iso);
};

function ev(dia: string, tipo: EventoCalendario['tipo'], extra: Partial<EventoCalendario> = {}): EventoCalendario {
  return {
    id: `${dia}-${tipo}`, dia, tipo, titulo: tipo, detalhe: null, destaque: false,
    pessoa_id: null, pessoa_nome: null, pessoa_foto: null, ...extra,
  };
}

const HEX = /^#[0-9A-F]{6}$/;

describe('a paleta do gibi', () => {
  it('mistura em sRGB e devolve hex', () => {
    expect(misturar('#000000', 50, '#FFFFFF')).toBe('#808080');
    expect(misturar('#EC4899', 100, '#FFFFFF')).toBe('#EC4899');
    expect(misturar('#EC4899', 0, '#FFFFFF')).toBe('#FFFFFF');
  });

  it('todo tema sai em hex no claro e no escuro — o html2canvas não apaga a sombra', () => {
    for (const t of TEMAS) {
      for (const escuro of [false, true]) {
        for (const [k, v] of Object.entries(paletaGibi(t, escuro))) {
          expect(v, `${t.id} ${escuro ? 'escuro' : 'claro'} ${k}`).toMatch(HEX);
        }
      }
    }
  });

  it('a paleta à mão vence a derivada; o Padrão usa o acento próprio do gibi', () => {
    const outubro = paletaGibi(temaEfetivo('outubro_rosa', 10), false);
    expect(outubro.ol).toBe('#2B0718');
    expect(outubro.paper).toBe('#FFF5FA');
    expect(paletaGibi(temaEfetivo('padrao', 7), false).ac).toBe(ACENTO_PADRAO_GIBI);
  });

  it('o escuro: texto claro, papel escuro; o Halloween tem o escuro dele', () => {
    const azul = paletaGibi(temaEfetivo('novembro_azul', 11), true);
    expect(azul.ink).toBe('#F3EFF5');
    expect(sobre(azul.paper)).toBe('#FFFFFF');
    expect(paletaGibi(temaEfetivo('halloween', 10), true).paper).toBe('#140F1C');
  });

  it('o texto em cima do acento acompanha a cor', () => {
    expect(paletaGibi(temaEfetivo('novembro_azul', 11), false).onac).toBe('#FFFFFF');
    expect(paletaGibi(temaEfetivo('setembro_amarelo', 9), false).onac).toBe('#2A1F00');
    expect(sobre('#FACC15')).toBe('#1A1A1A');
  });

  it('vira variáveis CSS', () => {
    const vars = varsDaPaleta(paletaGibi(temaEfetivo('natal', 12), false));
    expect(vars['--ac']).toBe('#D62828');
    expect(vars['--ol']).toBe('#2B0D0D');
  });
});

describe('os temas do ano', () => {
  it('ids únicos e dentro do CHECK da coluna (`^[a-z0-9_]{1,40}$`)', () => {
    const ids = TEMAS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]{1,40}$/);
    expect(idDaCorLivre('#0D9488')).toMatch(/^[a-z0-9_]{1,40}$/);
  });

  it('cada mês tem no máximo uma campanha no «Automático»', () => {
    const meses = TEMAS.flatMap(t => (t.mes ? [t.mes] : []));
    expect(new Set(meses).size).toBe(meses.length);
  });

  it('as datas comemorativas não tiram a campanha do mês', () => {
    expect(temaEfetivo(TEMA_AUTOMATICO, 10).id).toBe('outubro_rosa');
    expect(temaEfetivo('halloween', 10).id).toBe('halloween');
    expect(temaEfetivo('pascoa', 4).motivo).toBe('ovo');
  });

  it('a cor livre vai e volta pelo id', () => {
    expect(idDaCorLivre('#0D9488')).toBe('cor_0d9488');
    expect(corDoIdLivre('cor_0d9488')).toBe('#0D9488');
    expect(corDoIdLivre('cor_xyz')).toBeNull();
    expect(corDoIdLivre('outubro_rosa')).toBeNull();
    const t = temaEfetivo('cor_0d9488', 10);
    expect(t.acento).toBe('#0D9488');
    expect(paletaGibi(t, false).ac).toBe('#0D9488');
  });
});

describe('a régua do mês', () => {
  const feriados = feriadosDoMes('2026-10', FERIADOS_OUT);

  it('no mês corrente: passado, hoje e futuro; feriado das Metas marcado', () => {
    const r = reguaDoMes('2026-10', util, feriados, '2026-10-08');
    expect(r.tempo).toBe('corrente');
    expect(r.segmentos).toHaveLength(31);
    expect(r.segmentos[6].quando).toBe('passado');
    expect(r.segmentos[7].quando).toBe('hoje');
    expect(r.segmentos[8].quando).toBe('futuro');
    expect(r.segmentos[11]).toMatchObject({ feriado: true, util: false });
    expect(r.uteis).toBe(21);
    expect(r.uteisAteHoje).toBe(6);
    expect(r.uteisRestantes).toBe(16);
  });

  it('mês passado e mês que vem', () => {
    expect(reguaDoMes('2026-09', util, new Map(), '2026-10-08').tempo).toBe('passado');
    expect(reguaDoMes('2026-11', util, new Map(), '2026-10-08').tempo).toBe('futuro');
  });
});

describe('o próximo marco', () => {
  const feriados = feriadosDoMes('2026-10', FERIADOS_OUT);

  it('o mais perto entre destaque, horário especial e feriado das Metas', () => {
    const eventos = [
      ev('2026-10-19', 'evento', { destaque: true, titulo: 'Dia D' }),
      ev('2026-10-30', 'horario', { titulo: 'Fechamento' }),
      ev('2026-10-09', 'evento', { titulo: 'Reunião' }),
    ];
    expect(proximoMarco(eventos, feriados, '2026-10-08')).toEqual({ dia: '2026-10-12', titulo: 'Nossa Senhora Aparecida', faltam: 4 });
    expect(proximoMarco(eventos, feriados, '2026-10-12')).toEqual({ dia: '2026-10-19', titulo: 'Dia D', faltam: 7 });
    expect(proximoMarco(eventos, feriados, '2026-10-30')).toBeNull();
  });

  it('feriado nacional com expediente não é marco', () => {
    const soNacional = feriadosDoMes('2026-10', []);
    expect(proximoMarco([], soNacional, '2026-10-08')).toBeNull();
  });

  it('conta dias corridos sem fuso', () => {
    expect(diasEntre('2026-10-31', '2026-11-01')).toBe(1);
    expect(diasEntre('2026-02-27', '2026-03-02')).toBe(3);
  });
});

it('primeiro nome', () => {
  expect(primeiroNome('  Ana Paula Souza ')).toBe('Ana');
});
