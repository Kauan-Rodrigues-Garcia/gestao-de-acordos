/**
 * rascunhoBonus.test.ts — o formulário do bônus antes de ir ao banco.
 *
 * As recusas espelham `fn_comissao_bonus_salvar`; o payload leva só os campos
 * do tipo — a constraint `comissao_bonus_campos_do_tipo` recusaria o resto.
 */
import { describe, it, expect } from 'vitest';
import { formatBRL } from '@/lib/money';
import { condicaoDoBonus, resumoDeNomes } from './bonusTexto';
import { payloadDoBonus, problemaDoRascunho, rascunhoDoBonus, type RascunhoBonus } from './rascunhoBonus';

function rascunho(over: Partial<RascunhoBonus> = {}): RascunhoBonus {
  return { ...rascunhoDoBonus(null, ['ana']), metaOrdem: '4', valorBonus: '200,00', ...over };
}

describe('problemaDoRascunho', () => {
  it('bônus de meta completo pode salvar', () => {
    expect(problemaDoRascunho(rascunho(), 2026, 9)).toBeNull();
  });

  it.each([
    [{ pessoas: [] }, 'Escolha ao menos uma pessoa.'],
    [{ metaOrdem: '' }, 'Escolha a meta que libera o bônus.'],
    [{ tipo: 'valor' as const, valorAlvo: '' }, 'Informe o valor a atingir.'],
    [{ valorBonus: '' }, 'Informe o valor do bônus.'],
    [{ tipo: 'especial' as const, valorAlvo: '20.000,00', inicio: '2026-09-07', fim: '' }, 'Informe o início e o fim do período.'],
    [{ tipo: 'especial' as const, valorAlvo: '20.000,00', inicio: '2026-09-11', fim: '2026-09-07' }, 'O fim do período vem antes do início.'],
    [{ tipo: 'especial' as const, valorAlvo: '20.000,00', inicio: '2026-08-31', fim: '2026-09-04' }, 'O período precisa estar dentro do mês.'],
  ])('%o → %s', (over, esperado) => {
    expect(problemaDoRascunho(rascunho(over), 2026, 9)).toBe(esperado);
  });
});

describe('payloadDoBonus', () => {
  const alvo = { empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9 };

  it('meta leva só a ordem', () => {
    expect(payloadDoBonus(rascunho({ valorAlvo: '9,99', inicio: '2026-09-01' }), alvo)).toMatchObject({
      tipo: 'meta', metaOrdem: 4, valorAlvo: null, periodoInicio: null, periodoFim: null, valorBonus: 200, usuarios: ['ana'],
    });
  });

  it('especial leva valor e período, sem a ordem', () => {
    const r = rascunho({ tipo: 'especial', valorAlvo: '20.000,00', inicio: '2026-09-07', fim: '2026-09-11', descricao: '  semana 2 ' });
    expect(payloadDoBonus(r, alvo)).toMatchObject({
      tipo: 'especial', metaOrdem: null, valorAlvo: 20_000, periodoInicio: '2026-09-07', periodoFim: '2026-09-11', descricao: 'semana 2',
    });
  });

  it('editar parte do bônus gravado, com as pessoas dele', () => {
    const r = rascunhoDoBonus({
      id: 'b1', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9, tipo: 'valor', metaOrdem: null,
      valorAlvo: 200_000, periodoInicio: null, periodoFim: null, valorBonus: 200, descricao: null, usuarioIds: ['ana', 'bia'],
    }, []);
    expect(r).toMatchObject({ id: 'b1', pessoas: ['ana', 'bia'], valorAlvo: '200.000,00', valorBonus: '200,00' });
  });
});

describe('textos', () => {
  it('a condição de cada forma', () => {
    expect(condicaoDoBonus({ tipo: 'meta', metaOrdem: 4, alvo: null, periodoInicio: null, periodoFim: null }))
      .toBe('ao bater a 4ª Meta');
    expect(condicaoDoBonus({ tipo: 'valor', metaOrdem: null, alvo: 200_000, periodoInicio: null, periodoFim: null }))
      .toBe(`ao chegar a ${formatBRL(200_000)} realizados no mês`);
    expect(condicaoDoBonus({ tipo: 'especial', metaOrdem: null, alvo: 20_000, periodoInicio: '2026-09-07', periodoFim: '2026-09-11' }))
      .toBe(`ao fazer ${formatBRL(20_000)} de 07/09 a 11/09`);
  });

  it('resumo de nomes em ordem, com «e mais»', () => {
    const nomes = new Map([['a', 'Ana'], ['b', 'Bruno'], ['c', 'Carla'], ['d', 'Davi']]);
    expect(resumoDeNomes(['c', 'a'], nomes)).toBe('Ana, Carla');
    expect(resumoDeNomes(['d', 'c', 'b', 'a'], nomes)).toBe('Ana, Bruno, Carla e mais 1');
  });
});
