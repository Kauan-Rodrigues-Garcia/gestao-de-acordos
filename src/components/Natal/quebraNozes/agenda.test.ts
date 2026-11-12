import { describe, expect, it } from 'vitest';
import { EPOCA } from '../musica';
import {
  CHAMADA_DAS_DEZ_MIN, DIA_MS, JANELAS_MIN, TOLERANCIA_MS,
  chaveDoAjuste, diaDoNatal, ehDiaUtil, indiceDoBoletim, inicioDoDia, proximaSessao, sessaoDaChamada, sessoesDoDia,
} from './agenda';
import { DESLIGADA, daLinha, type ChamadaNaHora } from './configuracao';
import { montarDestaques, nomeCurto, tituloDosDestaques } from './dados';

const LIGADO = { automaticas: true, chamada10h: true };
/** 12/11/2026 é uma quinta-feira; o dia 0 (1º/11) é domingo. */
const QUINTA = 11;
const SABADO = 13;
const minutoDoDia = (ms: number, dia: number) => (ms - inicioDoDia(dia)) / 60_000;

describe('o dia do Natal', () => {
  it('conta de Brasília: vira à meia-noite de lá (3h UTC)', () => {
    expect(diaDoNatal(EPOCA)).toBe(0);
    expect(diaDoNatal(EPOCA + DIA_MS - 1)).toBe(0);
    expect(diaDoNatal(EPOCA + DIA_MS)).toBe(1);
    expect(diaDoNatal(Date.UTC(2026, 10, 12, 13, 0, 0))).toBe(QUINTA); // 10h de Brasília
    expect(diaDoNatal(Date.UTC(2026, 10, 13, 2, 59, 0))).toBe(QUINTA); // 23h59 de Brasília
  });

  it('segunda a sexta é dia útil; sábado e domingo, não', () => {
    expect(ehDiaUtil(0)).toBe(false); // domingo, 1º/11
    expect([1, 2, 3, 4, 5].every(ehDiaUtil)).toBe(true);
    expect(ehDiaUtil(6)).toBe(false);
    expect(ehDiaUtil(QUINTA)).toBe(true);
    expect(ehDiaUtil(SABADO)).toBe(false);
  });
});

describe('as sessões do dia', () => {
  it('a chamada às 10h em ponto e três aparições, cada uma na sua janela', () => {
    const sessoes = sessoesDoDia('birigui', QUINTA, { ...LIGADO, boletim: false });
    expect(sessoes.map(s => s.tipo)).toEqual(['parabens', 'aparicao', 'aparicao', 'aparicao']);
    expect(minutoDoDia(sessoes[0].inicio, QUINTA)).toBe(CHAMADA_DAS_DEZ_MIN);
    sessoes.slice(1).forEach((s, k) => {
      const m = minutoDoDia(s.inicio, QUINTA);
      expect(m).toBeGreaterThanOrEqual(JANELAS_MIN[k][0]);
      expect(m).toBeLessThan(JANELAS_MIN[k][1]);
    });
    expect(new Set(sessoes.map(s => s.chave)).size).toBe(4);
    expect(sessoes.map(s => s.indice)).toEqual([0, 1, 2, 3]);
  });

  it('é a mesma em todo computador, e muda de um dia para o outro e de uma cidade para a outra', () => {
    expect(sessoesDoDia('marilia', QUINTA, LIGADO)).toEqual(sessoesDoDia('marilia', QUINTA, LIGADO));
    const horas = (cidade: 'birigui' | 'marilia', dia: number) => sessoesDoDia(cidade, dia, LIGADO).slice(1).map(s => s.inicio - inicioDoDia(dia));
    expect(horas('birigui', QUINTA)).not.toEqual(horas('birigui', QUINTA + 1));
    expect(horas('birigui', QUINTA)).not.toEqual(horas('marilia', QUINTA));
  });

  it('respeita os interruptores e o fim de semana', () => {
    expect(sessoesDoDia('birigui', QUINTA, { automaticas: false, chamada10h: true }).map(s => s.tipo)).toEqual(['parabens']);
    expect(sessoesDoDia('birigui', QUINTA, { automaticas: true, chamada10h: false })).toHaveLength(3);
    expect(sessoesDoDia('birigui', QUINTA, { automaticas: false, chamada10h: false })).toEqual([]);
    expect(sessoesDoDia('birigui', SABADO, LIGADO)).toEqual([]);
  });

  it('em 40 dias, nenhuma aparição cai fora do expediente', () => {
    for (let dia = 0; dia < 40; dia++) {
      for (const cidade of ['birigui', 'marilia'] as const) {
        for (const s of sessoesDoDia(cidade, dia, LIGADO)) {
          const m = minutoDoDia(s.inicio, dia);
          expect(m).toBeGreaterThanOrEqual(10 * 60);
          expect(m).toBeLessThan(17 * 60 + 15);
        }
      }
    }
  });
});

describe('o boletim', () => {
  it('é uma das duas aparições da tarde, uma por dia, e só com ele ligado', () => {
    const vistos = new Set<number>();
    for (let dia = 1; dia < 40; dia++) {
      if (!ehDiaUtil(dia)) continue;
      for (const cidade of ['birigui', 'marilia'] as const) {
        const boletins = sessoesDoDia(cidade, dia, LIGADO).filter(s => s.tipo === 'boletim');
        expect(boletins).toHaveLength(1);
        expect([2, 3]).toContain(boletins[0].indice);
        expect(boletins[0].indice).toBe(indiceDoBoletim(cidade, dia));
        vistos.add(boletins[0].indice);
        expect(sessoesDoDia(cidade, dia, { ...LIGADO, boletim: false }).some(s => s.tipo === 'boletim')).toBe(false);
      }
    }
    // Ora a do meio da tarde, ora a do fim.
    expect(vistos.size).toBe(2);
  });

  it('sem as aparições automáticas não há boletim', () => {
    expect(sessoesDoDia('birigui', QUINTA, { automaticas: false, chamada10h: true }).some(s => s.tipo === 'boletim')).toBe(false);
  });
});

describe('o horário trocado à mão', () => {
  const sorteadas = sessoesDoDia('birigui', QUINTA, LIGADO);
  const ajustes = { [chaveDoAjuste(QUINTA, 'birigui', 2)]: 16 * 60 + 30 };

  it('muda só aquela sessão, só naquela cidade', () => {
    const mudadas = sessoesDoDia('birigui', QUINTA, { ...LIGADO, ajustes });
    const antes = sorteadas.find(s => s.indice === 2)!;
    const depois = mudadas.find(s => s.indice === 2)!;
    expect(minutoDoDia(depois.inicio, QUINTA)).toBe(16 * 60 + 30);
    expect(depois.sorteada).toBe(antes.inicio);
    // O espetáculo é o mesmo: o tipo, o dia e o número não mudam.
    expect(depois).toMatchObject({ tipo: antes.tipo, dia: antes.dia, indice: antes.indice });
    // A chave muda: a hora nova vale mesmo para quem já viu a antiga.
    expect(depois.chave).not.toBe(antes.chave);
    for (const i of [0, 1, 3]) expect(mudadas.find(s => s.indice === i)).toEqual(sorteadas.find(s => s.indice === i));
    expect(sessoesDoDia('marilia', QUINTA, { ...LIGADO, ajustes })).toEqual(sessoesDoDia('marilia', QUINTA, LIGADO));
    expect(sessoesDoDia('birigui', QUINTA + 1, { ...LIGADO, ajustes })).toEqual(sessoesDoDia('birigui', QUINTA + 1, LIGADO));
  });

  it('continua em ordem, e a chamada das dez também se mexe', () => {
    const cedo = { [chaveDoAjuste(QUINTA, 'birigui', 3)]: 9 * 60, [chaveDoAjuste(QUINTA, 'birigui', 0)]: 9 * 60 + 30 };
    const mudadas = sessoesDoDia('birigui', QUINTA, { ...LIGADO, ajustes: cedo });
    expect(mudadas.map(s => s.indice)).toEqual([3, 0, 1, 2]);
    expect(minutoDoDia(mudadas[1].inicio, QUINTA)).toBe(9 * 60 + 30);
    for (let i = 1; i < mudadas.length; i++) expect(mudadas[i].inicio).toBeGreaterThan(mudadas[i - 1].inicio);
  });

  it('a próxima sessão respeita a hora nova', () => {
    const config = { ...LIGADO, ajustes, chamada: null };
    const as1629 = inicioDoDia(QUINTA) + (16 * 60 + 29) * 60_000;
    const feitas = new Set(sessoesDoDia('birigui', QUINTA, config).filter(s => s.inicio < as1629).map(s => s.chave));
    expect(proximaSessao('birigui', as1629, config, feitas)).toMatchObject({ indice: 2, inicio: as1629 + 60_000 });
  });

  it('minuto estranho não vale: fica o sorteio', () => {
    for (const minuto of [-1, 1440, NaN]) {
      expect(sessoesDoDia('birigui', QUINTA, { ...LIGADO, ajustes: { [chaveDoAjuste(QUINTA, 'birigui', 2)]: minuto } })).toEqual(sorteadas);
    }
  });
});

describe('a próxima sessão', () => {
  const dez = inicioDoDia(QUINTA) + CHAMADA_DAS_DEZ_MIN * 60_000;
  const config = { ...LIGADO, chamada: null };

  it('antes das 10h é a chamada; depois dela, a primeira aparição', () => {
    expect(proximaSessao('birigui', dez - 3_600_000, config)?.tipo).toBe('parabens');
    expect(proximaSessao('birigui', dez + TOLERANCIA_MS + 1, config)?.indice).toBe(1);
  });

  it('quem chega atrasado ainda pega a que está no palco, até a tolerância', () => {
    expect(proximaSessao('birigui', dez + 30_000, config)?.inicio).toBe(dez);
    expect(proximaSessao('birigui', dez + TOLERANCIA_MS - 1, config)?.inicio).toBe(dez);
  });

  it('não repete a que já tocou', () => {
    const primeira = proximaSessao('birigui', dez + 10_000, config)!;
    expect(proximaSessao('birigui', dez + 10_000, config, new Set([primeira.chave]))?.chave).not.toBe(primeira.chave);
  });

  it('depois da última do dia, aponta para a de amanhã; na sexta à noite, nada até segunda', () => {
    const noite = inicioDoDia(QUINTA) + 20 * 3_600_000;
    expect(proximaSessao('birigui', noite, config)?.dia).toBe(QUINTA + 1);
    expect(proximaSessao('birigui', inicioDoDia(QUINTA + 1) + 20 * 3_600_000, config)).toBeNull();
  });

  it('tudo desligado: nada', () => {
    expect(proximaSessao('birigui', dez - 60_000, { automaticas: false, chamada10h: false, chamada: null })).toBeNull();
  });
});

describe('a chamada na hora', () => {
  const em = inicioDoDia(SABADO) + 15 * 3_600_000;
  const chamada: ChamadaNaHora = { em, tipo: 'aparicao', cidade: 'marilia', numero: 7 };

  it('vale só para a cidade chamada — ou para as duas', () => {
    expect(sessaoDaChamada(chamada, 'marilia')?.inicio).toBe(em);
    expect(sessaoDaChamada(chamada, 'birigui')).toBeNull();
    expect(sessaoDaChamada({ ...chamada, cidade: 'todas' }, 'birigui')?.inicio).toBe(em);
    expect(sessaoDaChamada(null, 'birigui')).toBeNull();
  });

  it('sobe mesmo no sábado e com tudo desligado, e vence depois da tolerância', () => {
    const desligado = { automaticas: false, chamada10h: false, chamada };
    expect(proximaSessao('marilia', em - 10_000, desligado)?.chave).toContain('chamada:7');
    expect(proximaSessao('marilia', em + TOLERANCIA_MS + 1, desligado)).toBeNull();
  });

  it('nunca usa o número de uma aparição marcada, e duas chamadas não se confundem', () => {
    const a = sessaoDaChamada(chamada, 'marilia')!;
    const b = sessaoDaChamada({ ...chamada, numero: 8, em: em + 120_000 }, 'marilia')!;
    expect(a.indice).toBeGreaterThanOrEqual(100);
    expect(a.chave).not.toBe(b.chave);
    expect(a.indice).not.toBe(b.indice);
  });
});

describe('a configuração', () => {
  it('sem a linha (migration pendente) fica tudo desligado', () => {
    expect(daLinha(null)).toBe(DESLIGADA);
    expect(DESLIGADA).toMatchObject({ automaticas: false, chamada10h: false, boletim: false, ajustes: {}, lida: false, completa: false });
  });

  it('sem as colunas da segunda migration: o resto vale, o boletim fica desligado e não há horário trocado', () => {
    const c = daLinha({ automaticas: true, chamada_10h: true, sons: true, chamada_em: null, chamada_tipo: null, chamada_cidade: null, chamada_numero: 0 });
    expect(c).toMatchObject({ automaticas: true, chamada10h: true, lida: true, completa: false, boletim: false, ajustes: {} });
  });

  it('lê o boletim e os horários trocados, e descarta minuto estranho', () => {
    const c = daLinha({
      automaticas: true, chamada_10h: true, sons: true, chamada_em: '2026-11-12T13:00:15Z', chamada_tipo: 'boletim', chamada_cidade: 'marilia', chamada_numero: 4,
      boletim: true, ajustes: { '11:birigui:2': 990, '11:marilia:1': 'dez', '11:marilia:3': 2000, '12:birigui:0': 615.7 },
    });
    expect(c).toMatchObject({ completa: true, boletim: true, ajustes: { '11:birigui:2': 990, '12:birigui:0': 615 } });
    expect(Object.keys(c.ajustes)).toHaveLength(2);
    expect(c.chamada?.tipo).toBe('boletim');
  });

  it('lê os interruptores e a chamada', () => {
    const c = daLinha({ automaticas: true, chamada_10h: false, sons: true, chamada_em: '2026-11-12T13:00:15Z', chamada_tipo: 'parabens', chamada_cidade: 'todas', chamada_numero: 3 });
    expect(c).toMatchObject({ automaticas: true, chamada10h: false, sons: true, lida: true });
    expect(c.chamada).toEqual({ em: Date.UTC(2026, 10, 12, 13, 0, 15), tipo: 'parabens', cidade: 'todas', numero: 3 });
  });

  it('chamada incompleta ou estranha não vale', () => {
    const base = { automaticas: true, chamada_10h: true, sons: null, chamada_numero: 1 };
    expect(daLinha({ ...base, chamada_em: null, chamada_tipo: 'aparicao', chamada_cidade: 'birigui' }).chamada).toBeNull();
    expect(daLinha({ ...base, chamada_em: '2026-11-12T13:00:15Z', chamada_tipo: 'festa', chamada_cidade: 'birigui' }).chamada).toBeNull();
    expect(daLinha({ ...base, chamada_em: '2026-11-12T13:00:15Z', chamada_tipo: 'aparicao', chamada_cidade: 'sp' }).chamada).toBeNull();
    // `sons` nulo conta como ligado.
    expect(daLinha({ ...base, chamada_em: null, chamada_tipo: null, chamada_cidade: null }).sons).toBe(true);
  });
});

describe('os destaques lidos', () => {
  it('o nome cabe no cartão: primeiro e último', () => {
    expect(nomeCurto('Maria Eduarda Souza Lima')).toBe('Maria Lima');
    expect(nomeCurto('  João   Pedro ')).toBe('João Pedro');
    expect(nomeCurto('Bianca')).toBe('Bianca');
  });

  it('marca o do meu setor e descarta linha sem nome ou sem setor', () => {
    const d = montarDestaques([
      { setor_id: 's1', setor: 'Play 1', nome: 'Camila de Souza', foto: ' https://x/y.jpg ' },
      { setor_id: 's2', setor: 'Play 2', nome: 'Rafael Costa', foto: '' },
      { setor_id: 's3', setor: 'Play 5', nome: '  ' },
      { setor_id: 's4', setor: null, nome: 'Alguém' },
    ], 's2');
    expect(d).toEqual([
      { setor: 'Play 1', nome: 'Camila Souza', foto: 'https://x/y.jpg', meu: false },
      { setor: 'Play 2', nome: 'Rafael Costa', foto: null, meu: true },
    ]);
  });

  it('a faixa diz «ontem», o dia da semana, ou a data', () => {
    expect(tituloDosDestaques('2026-11-11', '2026-11-12')).toBe('Destaques de ontem');
    expect(tituloDosDestaques('2026-11-13', '2026-11-16')).toBe('Destaques de sexta'); // segunda-feira
    expect(tituloDosDestaques('2026-11-03', '2026-11-12')).toBe('Destaques de 03/11');
    expect(tituloDosDestaques(null, '2026-11-12')).toBe('Destaques de ontem');
  });
});
