/**
 * cpfChat.test.ts — o aviso de CPF no chat de Solicitar Atendimento.
 *
 * A regra aqui é o oposto da dos acordos, e de propósito: no acordo o CPF é
 * RECUSADO, porque existe substituto (o código do ERP). No chat ele PASSA, com
 * prazo de 12 horas, porque bloquear conversa entre pessoas empurraria o dado
 * para fora do sistema — WhatsApp pessoal, papel, voz — onde não há prazo
 * nenhum.
 *
 * Quem apaga é o banco (migration 20260803d). Aqui é só o que a tela promete —
 * e a promessa tem que bater com o que o banco cumpre.
 */
import { describe, it, expect } from 'vitest';
import {
  estadoCpfDaMensagem, avisoAoDigitar, rotuloDeHoras, HORAS_ATE_EXPURGO,
} from './cpfChat';

const CPF = '529.982.247-25';
const CPF_CORRIDO = '52998224725';
const AGORA = new Date('2026-08-03T12:00:00Z');

function msg(over: Partial<Parameters<typeof estadoCpfDaMensagem>[0]> = {}) {
  return { conteudo: 'tudo certo por aqui', ...over };
}

describe('estadoCpfDaMensagem — mensagem limpa', () => {
  it('texto sem CPF não vira aviso', () => {
    expect(estadoCpfDaMensagem(msg(), AGORA).estado).toBe('limpa');
  });

  it('número que não é CPF não dispara — código de acordo continua livre', () => {
    expect(estadoCpfDaMensagem(msg({ conteudo: 'acordo 8472913, ver com o líder' }), AGORA).estado)
      .toBe('limpa');
  });
});

describe('estadoCpfDaMensagem — mensagem com CPF', () => {
  it('pega com pontuação e sem pontuação', () => {
    for (const conteudo of [`o CPF é ${CPF}`, `doc ${CPF_CORRIDO} confere`]) {
      expect(estadoCpfDaMensagem(msg({ conteudo }), AGORA).estado).toBe('aguardando');
    }
  });

  it('avisa quanto tempo falta, a partir do prazo gravado no banco', () => {
    const r = estadoCpfDaMensagem(
      msg({ conteudo: CPF, tem_cpf: true, expurgar_em: '2026-08-03T15:00:00Z' }), AGORA);
    expect(r.estado).toBe('aguardando');
    if (r.estado !== 'aguardando') return;
    expect(r.horasRestantes).toBe(3);
    expect(r.aviso).toContain('3 horas');
    expect(r.aviso).toContain('apagada');
  });

  it('confia na marca do banco mesmo se o texto já não parecer CPF', () => {
    // O banco marcou na escrita; a tela não precisa reencontrar o número.
    const r = estadoCpfDaMensagem(
      msg({ conteudo: 'segue o doc', tem_cpf: true, expurgar_em: '2026-08-03T18:00:00Z' }), AGORA);
    expect(r.estado).toBe('aguardando');
  });

  it('sem prazo do banco ainda avisa, com o padrão de 12 h', () => {
    // É o intervalo entre enviar e o servidor responder — justamente quando a
    // pessoa ainda lembra do que escreveu e pode se corrigir.
    const r = estadoCpfDaMensagem(msg({ conteudo: CPF }), AGORA);
    if (r.estado !== 'aguardando') throw new Error('esperava aguardando');
    expect(r.horasRestantes).toBe(HORAS_ATE_EXPURGO);
  });

  it('prazo vencido mas ainda não apagado não promete tempo que não existe', () => {
    // O cron roda de 10 em 10 minutos: há uma janela em que já venceu e o texto
    // ainda está lá. Dizer "faltam -1 horas" seria pior que dizer o mínimo.
    const r = estadoCpfDaMensagem(
      msg({ conteudo: CPF, tem_cpf: true, expurgar_em: '2026-08-03T11:00:00Z' }), AGORA);
    if (r.estado !== 'aguardando') throw new Error('esperava aguardando');
    expect(r.horasRestantes).toBe(0);
    expect(r.aviso).toContain('menos de 1 hora');
  });
});

describe('estadoCpfDaMensagem — já expurgada', () => {
  it('diz que o original não existe mais', () => {
    const r = estadoCpfDaMensagem(msg({
      conteudo: '[mensagem apagada automaticamente: continha CPF]',
      tem_cpf: true, expurgar_em: '2026-08-03T00:00:00Z', expurgado_em: '2026-08-03T00:05:00Z',
    }), AGORA);
    expect(r.estado).toBe('expurgada');
    expect(r.aviso).toContain('não existe mais');
  });

  it('expurgada vence a detecção local — não volta a prometer prazo', () => {
    const r = estadoCpfDaMensagem(
      msg({ conteudo: CPF, tem_cpf: true, expurgado_em: '2026-08-03T00:05:00Z' }), AGORA);
    expect(r.estado).toBe('expurgada');
  });
});

describe('rotuloDeHoras', () => {
  it.each([
    [12, '12 horas'],
    [3,  '3 horas'],
    [1,  '1 hora'],
    [0,  'menos de 1 hora'],
    [-5, 'menos de 1 hora'],
  ])('%s → %s', (horas, esperado) => {
    expect(rotuloDeHoras(horas)).toBe(esperado);
  });
});

describe('avisoAoDigitar', () => {
  it('nada a avisar em texto limpo', () => {
    expect(avisoAoDigitar('bom dia, pode confirmar?')).toBeNull();
    expect(avisoAoDigitar('')).toBeNull();
  });

  it('avisa e sugere o código, sem impedir o envio', () => {
    const aviso = avisoAoDigitar(`cliente ${CPF}`)!;
    expect(aviso).toContain('Você pode enviar');
    expect(aviso).toContain('12 horas');
    expect(aviso).toContain('código do cliente');
  });
});

describe('a promessa da tela bate com o banco', () => {
  it('o prazo anunciado é o mesmo da migration', () => {
    // A migration 20260803d usa INTERVAL '12 hours'. Se um dos dois mudar sem
    // o outro, a tela passa a mentir sobre quando o dado some.
    expect(HORAS_ATE_EXPURGO).toBe(12);
    expect(avisoAoDigitar(CPF)).toContain('12 horas');
  });
});
