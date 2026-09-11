/**
 * O recorte por setor que vale para UMA PESSOA.
 *
 * Escrito depois da queixa de 10/09/2026. O recorte entrou antes da permissão e
 * sem atalho nenhum: o super_admin — que a RLS do módulo libera por inteiro —
 * perdeu Controle de Números, e quem tinha acesso total no setor do Núcleo
 * perdeu, do outro lado, Acordos e os painéis. Quem configura o módulo sem ser
 * do Núcleo ficou sem a tela onde a configuração mora.
 *
 * `menuLateral.nucleo.contrato.test.ts` trava que menu e rota carregam a mesma
 * MARCA. Este trava o LADO que cada pessoa recebe.
 */
import { describe, it, expect } from 'vitest';
import { abasDoMenu, recorteDoNucleo, type ContextoMenu } from './menuLateral';

/** Um contexto que pode tudo pela permissão: o que sobra é só o recorte. */
function ctx(souDoNucleo: boolean | null): ContextoMenu {
  return {
    cargo: 'operador',
    produto: 'cobranca',
    isPaguePlay: false,
    isBookplay: true,
    temPermissao: () => true,
    acessoTickets: true,
    souDoNucleo,
  };
}

const abas = (p: Parameters<typeof recorteDoNucleo>[0]) =>
  abasDoMenu(ctx(recorteDoNucleo(p))).map(i => i.label);

describe('recorteDoNucleo', () => {
  it('a pessoa comum fica no lado dela', () => {
    expect(recorteDoNucleo({ souDoNucleo: true,  acessoTotal: false, configuraNucleo: false })).toBe(true);
    expect(recorteDoNucleo({ souDoNucleo: false, acessoTotal: false, configuraNucleo: false })).toBe(false);
  });

  it('acesso total não tem lado — dentro e fora do Núcleo', () => {
    expect(recorteDoNucleo({ souDoNucleo: false, acessoTotal: true, configuraNucleo: false })).toBeNull();
    expect(recorteDoNucleo({ souDoNucleo: true,  acessoTotal: true, configuraNucleo: false })).toBeNull();
  });

  it('quem configura sem ser do Núcleo recebe os dois lados', () => {
    expect(recorteDoNucleo({ souDoNucleo: false, acessoTotal: false, configuraNucleo: true })).toBeNull();
  });

  it('quem configura E é do Núcleo segue a regra do Núcleo', () => {
    expect(recorteDoNucleo({ souDoNucleo: true, acessoTotal: false, configuraNucleo: true })).toBe(true);
  });
});

describe('o recorte aplicado ao menu', () => {
  it('acesso total fora do Núcleo volta a ver Controle de Números, sem perder a cobrança', () => {
    const lista = abas({ souDoNucleo: false, acessoTotal: true, configuraNucleo: false });
    expect(lista).toContain('Controle de Números');
    expect(lista).toContain('Acordos');
    expect(lista).toContain('Meus Chips');
  });

  it('acesso total cadastrado no setor do Núcleo não perde Acordos nem os painéis', () => {
    const lista = abas({ souDoNucleo: true, acessoTotal: true, configuraNucleo: false });
    for (const aba of ['Acordos', 'Analítico', 'Painel Diretoria', 'Controle de Números']) {
      expect(lista, `${aba} some para quem tem acesso total`).toContain(aba);
    }
  });

  it('quem configura sem ser do Núcleo alcança Controle de Números', () => {
    const lista = abas({ souDoNucleo: false, acessoTotal: false, configuraNucleo: true });
    expect(lista).toContain('Controle de Números');
    expect(lista).toContain('Acordos');
  });

  it('o operador do Núcleo continua sem a cobrança', () => {
    const lista = abas({ souDoNucleo: true, acessoTotal: false, configuraNucleo: false });
    expect(lista).not.toContain('Acordos');
    expect(lista).toContain('Meus Chips');
    expect(lista).toContain('Controle de Números');
  });

  it('o operador da cobrança continua sem Controle de Números', () => {
    const lista = abas({ souDoNucleo: false, acessoTotal: false, configuraNucleo: false });
    expect(lista).not.toContain('Controle de Números');
    expect(lista).toContain('Acordos');
  });
});
