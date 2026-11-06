import { describe, expect, it } from 'vitest';
import { EPOCA } from '../musica';
import {
  PARADA_ESTACAO_S, PARADA_FIM_S, SORTEIO_INICIO_S, SORTEIO_PASSO_S, chaveDoSorteio, chegaNaAbaEm,
  duracaoDaVolta, etapaDoSorteio, ondeEsta, proximaVoltaEm, quantosABordo, tempoNaAba,
} from './horario';
import { AGENDA_LIVRE, type AgendaDoTrem } from './agenda';
import { abaDoCaminho, ROTA_DO_TREM } from './rota';
import { ROUTE_PATHS } from '@/lib';

const NOSSO = ROTA_DO_TREM;
const em = (s: number) => EPOCA + s * 1000;

describe('um trem só, para todo mundo', () => {
  it('o percurso é Dashboard, Acordos e Analítico, para as duas regras (o Pix saiu da rota)', () => {
    expect(ROTA_DO_TREM).toEqual(['dashboard', 'acordos', 'analitico']);
  });

  it('no Pix Automático não tem trem', () => {
    expect(abaDoCaminho(ROUTE_PATHS.PIX_AUTOMATICO)).toBeNull();
    expect(abaDoCaminho(ROUTE_PATHS.ACORDOS)).toBe('acordos');
    expect(abaDoCaminho(`${ROUTE_PATHS.ANALITICO}/x`)).toBe('analitico');
  });
});

describe('ondeEsta', () => {
  it('começa a volta parado na estação, no Dashboard', () => {
    const p = ondeEsta(em(1), NOSSO);
    expect(p).toMatchObject({ viagem: 0, fase: 'estacao', aba: 'dashboard', progresso: 0 });
  });

  it('sai da estação e percorre as abas na ordem, com o progresso subindo', () => {
    const p = ondeEsta(em(PARADA_ESTACAO_S + tempoNaAba('dashboard') / 2), NOSSO);
    expect(p).toMatchObject({ fase: 'ida', aba: 'dashboard', partindo: true });
    expect(p.progresso).toBeCloseTo(0.5);
    const q = ondeEsta(em(PARADA_ESTACAO_S + tempoNaAba('dashboard') + 1), NOSSO);
    expect(q).toMatchObject({ fase: 'ida', aba: 'acordos', partindo: false });
  });

  it('para no fim da linha e volta com o progresso descendo, chegando parando no Dashboard', () => {
    const ida = NOSSO.reduce((s, a) => s + tempoNaAba(a), 0);
    expect(ondeEsta(em(PARADA_ESTACAO_S + ida + 1), NOSSO)).toMatchObject({ fase: 'fim', aba: 'analitico', progresso: 1 });
    const volta = ondeEsta(em(PARADA_ESTACAO_S + ida + PARADA_FIM_S + tempoNaAba('analitico') / 4), NOSSO);
    expect(volta).toMatchObject({ fase: 'volta', aba: 'analitico', partindo: true });
    expect(volta.progresso).toBeCloseTo(0.75);
    const chegando = ondeEsta(em(duracaoDaVolta(NOSSO) - 1), NOSSO);
    expect(chegando).toMatchObject({ fase: 'volta', aba: 'dashboard', chegando: true });
  });

  it('a volta seguinte é a viagem seguinte', () => {
    expect(ondeEsta(em(duracaoDaVolta(NOSSO) + 1), NOSSO)).toMatchObject({ viagem: 1, fase: 'estacao' });
  });

  it('a volta dura o mesmo para todo mundo: 5 min 2 s (nunca menos de 5 min)', () => {
    expect(duracaoDaVolta(ROTA_DO_TREM)).toBe(302);
    expect(duracaoDaVolta(ROTA_DO_TREM)).toBeGreaterThanOrEqual(300);
  });
});

describe('chegaNaAbaEm', () => {
  it('é 0 com o trem na aba e null para aba fora da rota', () => {
    expect(chegaNaAbaEm(em(1), NOSSO, 'dashboard')).toBe(0);
    expect(chegaNaAbaEm(em(1), ['dashboard', 'analitico'], 'acordos')).toBeNull();
  });
  it('saindo da estação, passa por Acordos e chega ao Analítico', () => {
    const s = chegaNaAbaEm(em(1), NOSSO, 'analitico')!;
    expect(s).toBe(Math.ceil(PARADA_ESTACAO_S + tempoNaAba('dashboard') + tempoNaAba('acordos') - 1));
  });
  it('conta até a entrada do trem na aba', () => {
    const s = chegaNaAbaEm(em(1), NOSSO, 'acordos')!;
    expect(s).toBe(Math.ceil(PARADA_ESTACAO_S + tempoNaAba('dashboard') - 1));
  });
});

describe('chaveDoSorteio', () => {
  it('é o minuto da partida, diferente a cada viagem', () => {
    const volta = duracaoDaVolta(NOSSO);
    const a = chaveDoSorteio(ondeEsta(em(10 * volta + 1), NOSSO))!;
    const b = chaveDoSorteio(ondeEsta(em(11 * volta + 1), NOSSO))!;
    expect(b).toBeGreaterThan(a);
    expect(a).toBe(Math.floor((EPOCA + (10 * volta + PARADA_ESTACAO_S) * 1000) / 60_000));
  });
  it('com o trem parado não há sorteio', () => {
    expect(chaveDoSorteio(ondeEsta(em(1), NOSSO, { ...AGENDA_LIVRE, ativo: false }))).toBeNull();
  });
});

describe('a agenda (ligado, horário e a primeira viagem)', () => {
  // 2/11/2026 em Brasília: EPOCA é 1/11 à meia-noite.
  const dia = EPOCA + 86_400_000;
  const as = (h: number, m = 0, s = 0) => dia + ((h * 60 + m) * 60 + s) * 1000;
  const HORARIO: AgendaDoTrem = { ativo: true, abreMin: 8 * 60, fechaMin: 17 * 60, inicioMs: EPOCA, inscritos: 12 };
  const volta = duracaoDaVolta(NOSSO);

  it('antes de abrir, fechado na estação, abrindo às 8h', () => {
    const p = ondeEsta(as(7, 59), NOSSO, HORARIO);
    expect(p).toMatchObject({ fase: 'estacao', aba: 'dashboard', fechado: { motivo: 'fechado', abreEmMs: as(8) } });
    expect(proximaVoltaEm(as(7, 59), NOSSO, HORARIO)).toBe(as(8));
  });

  it('às 8h a primeira volta do dia começa na estação, com o sorteio', () => {
    expect(ondeEsta(as(8, 0, 1), NOSSO, HORARIO)).toMatchObject({ viagem: 0, fase: 'estacao', fechado: null, partidaMs: as(8) + PARADA_ESTACAO_S * 1000 });
  });

  it('a volta que começou antes das 17h vai até o fim; depois fecha até amanhã', () => {
    // A última volta é a que começa antes das 17h.
    const ultima = Math.floor((as(17) - as(8)) / 1000 / volta - 1e-9);
    const comecoDaUltima = as(8) + ultima * volta * 1000;
    expect(comecoDaUltima).toBeLessThan(as(17));
    const depoisDas17 = comecoDaUltima + (volta - 2) * 1000;
    expect(depoisDas17).toBeGreaterThan(as(17));
    expect(ondeEsta(depoisDas17, NOSSO, HORARIO)).toMatchObject({ viagem: ultima, fase: 'volta', fechado: null });
    const fechou = ondeEsta(comecoDaUltima + (volta + 1) * 1000, NOSSO, HORARIO);
    expect(fechou.fechado).toEqual({ motivo: 'fechado', abreEmMs: as(8) + 86_400_000 });
    // Na última volta, a próxima saída já é amanhã.
    expect(proximaVoltaEm(depoisDas17, NOSSO, HORARIO)).toBe(as(8) + 86_400_000);
  });

  it('desligado, fica em manutenção; sem os cinco primeiros, espera a fila', () => {
    expect(ondeEsta(as(10), NOSSO, { ...HORARIO, ativo: false }).fechado).toEqual({ motivo: 'desligado', abreEmMs: null });
    expect(ondeEsta(as(10), NOSSO, { ...HORARIO, inicioMs: null, inscritos: 3 }).fechado).toEqual({ motivo: 'esperando', abreEmMs: null });
    expect(proximaVoltaEm(as(10), NOSSO, { ...HORARIO, inicioMs: null })).toBeNull();
    expect(ondeEsta(as(10), NOSSO, null).fechado).toEqual({ motivo: 'carregando', abreEmMs: null });
  });

  it('o quinto entrou na fila às 10h17: a primeira viagem começa ali mesmo', () => {
    const agenda = { ...HORARIO, inicioMs: as(10, 17) };
    expect(ondeEsta(as(10, 16), NOSSO, agenda).fechado?.motivo).toBe('fechado');
    expect(ondeEsta(as(10, 17, 5), NOSSO, agenda)).toMatchObject({ viagem: 0, fase: 'estacao', fechado: null, noTrecho: 5 });
    // No dia seguinte, o ciclo segue o horário.
    expect(ondeEsta(as(8, 0, 1) + 86_400_000, NOSSO, agenda)).toMatchObject({ viagem: 0, fechado: null });
  });

  it('o quinto entrou depois do fechamento: só sai amanhã às 8h', () => {
    const agenda = { ...HORARIO, inicioMs: as(18) };
    expect(ondeEsta(as(18, 30), NOSSO, agenda).fechado).toEqual({ motivo: 'fechado', abreEmMs: as(8) + 86_400_000 });
  });

  it('parado, ele não chega em aba nenhuma', () => {
    expect(chegaNaAbaEm(as(7), NOSSO, 'acordos', HORARIO)).toBeNull();
  });
});

describe('o sorteio na estação', () => {
  it('um de cada vez: sorteando, revelado e a bordo, o último antes da partida', () => {
    expect(etapaDoSorteio(1, 5)).toBeNull();
    expect(etapaDoSorteio(SORTEIO_INICIO_S + 1, 5)).toEqual({ indice: 0, etapa: 'sorteando' });
    expect(etapaDoSorteio(SORTEIO_INICIO_S + 3, 5)).toEqual({ indice: 0, etapa: 'revelado' });
    expect(quantosABordo(SORTEIO_INICIO_S + 3, 5)).toBe(0);
    expect(quantosABordo(SORTEIO_INICIO_S + 5.1, 5)).toBe(1);
    expect(quantosABordo(PARADA_ESTACAO_S - 0.5, 5)).toBe(5);
    expect(quantosABordo(PARADA_ESTACAO_S, 2)).toBe(2);
    expect(etapaDoSorteio(SORTEIO_INICIO_S + SORTEIO_PASSO_S * 2 + 1, 2)).toBeNull();
  });
});
