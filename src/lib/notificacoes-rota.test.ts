/**
 * notificacoes-rota.test.ts — destino do clique em cada notificação.
 *
 * Requisito: TODA notificação leva para a aba de origem. Analítico vai para o
 * analítico, recebimento diário para a sub-aba dele, chat para Solicitar
 * Atendimento.
 */
import { describe, it, expect } from 'vitest';
import {
  rotaDaNotificacao, caminhoInternoSeguro,
  ROTA_ANALITICO, ROTA_DIARIO, ROTA_SOLICITACOES,
} from './notificacoes-rota';

const base = { titulo: '', rota: null as string | null, acordo_id: null as string | null };

describe('rotaDaNotificacao — coluna `rota` (produtores novos)', () => {
  it('analítico', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Analítico atualizado', rota: ROTA_ANALITICO }, true))
      .toBe('/analitico');
  });
  it('recebimento diário abre a sub-aba certa', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Recebimento diário atualizado', rota: ROTA_DIARIO }, true))
      .toBe('/analitico?aba=diario');
  });
  it('mensagem do chat', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Nova mensagem — MARIA', rota: ROTA_SOLICITACOES }, true))
      .toBe('/solicitacoes-whatsapp');
  });
});

describe('rotaDaNotificacao — acordo tem precedência', () => {
  it('PaguePlay manda para o dashboard com highlight', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Acordo transferido', acordo_id: 'abc' }, true))
      .toBe('/?highlight=abc');
  });
  it('BookPlay manda para /acordos', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Acordo transferido', acordo_id: 'abc' }, false))
      .toBe('/acordos?highlight=abc');
  });
  it('acordo vence a rota gravada — é o destino mais específico', () => {
    expect(rotaDaNotificacao({ titulo: 'x', rota: ROTA_ANALITICO, acordo_id: 'abc' }, true))
      .toBe('/?highlight=abc');
  });
});

describe('rotaDaNotificacao — linhas antigas, sem a coluna `rota`', () => {
  it.each([
    ['Analítico atualizado',          ROTA_ANALITICO],
    ['Recebimento diário atualizado', ROTA_DIARIO],
    ['Nova mensagem — João',          ROTA_SOLICITACOES],
  ])('%s → %s', (titulo, esperado) => {
    expect(rotaDaNotificacao({ ...base, titulo }, true)).toBe(esperado);
  });

  it('"diário" não cai no analítico por engano', () => {
    // O título do diário não contém "analítico", mas a ordem dos testes no
    // palpite é o que garante isso — este caso trava a ordem.
    expect(rotaDaNotificacao({ ...base, titulo: 'Recebimento diário atualizado' }, true))
      .not.toBe(ROTA_ANALITICO);
  });

  it('aguenta título sem acento', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Analitico atualizado' }, true)).toBe(ROTA_ANALITICO);
    expect(rotaDaNotificacao({ ...base, titulo: 'Recebimento diario' }, true)).toBe(ROTA_DIARIO);
  });

  it('título desconhecido não inventa destino', () => {
    expect(rotaDaNotificacao({ ...base, titulo: 'Bem-vindo ao sistema' }, true)).toBeNull();
  });
});

describe('caminhoInternoSeguro — a notificação não tira o operador do sistema', () => {
  it.each([
    ['/analitico'],
    ['/analitico?aba=diario'],
    ['/acordos?highlight=abc-123'],
    ['/'],
  ])('aceita caminho interno %s', (rota) => {
    expect(caminhoInternoSeguro(rota)).toBe(rota);
  });

  it.each([
    ['//site-falso.com',          'duas barras viram host'],
    ['/\\site-falso.com',         'barra invertida — o desvio do CVE-2025-68470'],
    ['\\\\site-falso.com',        'caminho UNC'],
    ['https://site-falso.com',    'URL absoluta'],
    ['javascript:alert(1)',       'esquema javascript'],
    ['analitico',                 'relativo, sem barra inicial'],
    ['',                          'vazio'],
  ])('recusa %s (%s)', (rota) => {
    expect(caminhoInternoSeguro(rota)).toBeNull();
  });

  it('recusa caractere de controle no meio, que o navegador descartaria', () => {
    // O navegador tira o byte antes de resolver a URL: a checagem veria
    // "/\x00/site-falso" e o navegador veria "//site-falso".
    const comControle = '/' + String.fromCharCode(0) + '/site-falso.com';
    expect(caminhoInternoSeguro(comControle)).toBeNull();
    expect(caminhoInternoSeguro('/' + String.fromCharCode(9) + 'x')).toBeNull();
  });

  it.each([null, undefined, 42, {}])('recusa valor não-texto (%s)', (rota) => {
    expect(caminhoInternoSeguro(rota)).toBeNull();
  });

  it('rota externa no banco não vira destino — cai no palpite pelo título', () => {
    expect(rotaDaNotificacao(
      { ...base, titulo: 'Analítico atualizado', rota: 'https://site-falso.com' }, true,
    )).toBe(ROTA_ANALITICO);
  });

  it('rota externa sem título reconhecível não leva a lugar nenhum', () => {
    expect(rotaDaNotificacao(
      { ...base, titulo: 'Bem-vindo', rota: '//site-falso.com' }, true,
    )).toBeNull();
  });
});
