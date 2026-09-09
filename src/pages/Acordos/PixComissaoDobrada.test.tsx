/**
 * PixComissaoDobrada.test.tsx — o requisito 1 fala a meta do setor.
 *
 * O defeito que estes casos travam: a meta de acordos deixou de ser 18 fixo
 * quando virou `meta_acordos_dobra`, coluna por setor. A CONTA passou a ler a
 * coluna; o TÍTULO do requisito continuou com o 18 escrito no código. Num setor
 * de 25 a tela dizia «Requisito 1 · 18 acordos Pix no mês» e, na mesma linha,
 * «18 / 25» — o número certo em corpo menor, ao lado do errado.
 *
 * Por isso os dois casos abaixo: um setor configurado (25) e um sem
 * configuração (o piso de 18). O segundo não é redundante — é ele que impede
 * "consertar" o título trocando um literal por outro.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PixComissaoDobrada } from './PixComissaoDobrada';
import type { DobraComissao } from './pixAutomaticoView';

/** Uma dobra com os dois requisitos em aberto — só a meta de acordos importa aqui. */
function dobra(over: Partial<DobraComissao> = {}): DobraComissao {
  const feitos = over.feitos ?? 18;
  const meta = over.meta ?? 25;
  return {
    feitos,
    faltam: Math.max(0, meta - feitos),
    meta,
    acordosOk: feitos >= meta,
    pctAcordos: Math.min(100, Math.round((feitos / meta) * 100)),
    metaValor: 10_000,
    recebidoMes: 4_000,
    metaDefinida: true,
    metaOk: false,
    faltaMeta: 6_000,
    pctMeta: 40,
    requisitosOk: feitos >= meta ? 1 : 0,
    atingiu: false,
    comissao: 450,
    bonus: 0,
    comissaoFinal: 450,
    ...over,
  };
}

describe('PixComissaoDobrada — o requisito 1', () => {
  it('escreve a meta do setor no título, e não o piso de 18', () => {
    render(<PixComissaoDobrada dobra={dobra({ feitos: 18, meta: 25 })} />);

    expect(screen.getByText('Requisito 1 · 25 acordos Pix no mês')).toBeInTheDocument();
    expect(screen.queryByText(/Requisito 1 · 18 acordos/)).not.toBeInTheDocument();
  });

  it('o título e o contador dizem o mesmo número', () => {
    render(<PixComissaoDobrada dobra={dobra({ feitos: 18, meta: 25 })} />);

    // O contador já estava certo antes da correção: é o título que o alcançou.
    expect(screen.getByText('18 / 25')).toBeInTheDocument();
    expect(screen.getByText(/Faltam 7 acordos\./)).toBeInTheDocument();
  });

  it('sem meta configurada no setor, o título mostra o piso de 18', () => {
    render(<PixComissaoDobrada dobra={dobra({ feitos: 12, meta: 18 })} />);

    expect(screen.getByText('Requisito 1 · 18 acordos Pix no mês')).toBeInTheDocument();
    expect(screen.getByText('12 / 18')).toBeInTheDocument();
  });
});
