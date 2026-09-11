/**
 * VerComissao.test.tsx — a progressão das faixas.
 *
 * O foco é o que o operador precisa entender de relance, e sem depender de cor:
 * a situação de cada faixa escrita, a faixa atual marcada como o passo em que
 * ele está com a comissão sobre o que realizou, o mínimo das outras faixas,
 * quanto falta, e o benefício do setor dito com «anterior → atual».
 *
 * Rótulo e valor moram em elementos vizinhos, e o `textContent` os cola sem
 * espaço — daí o `\s?` entre eles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { VerComissao } from './VerComissao';
import {
  calcularComissao, type ConfigComissao, type EntradaComissao,
} from '@/services/comissao/comissao';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: 2 },
      { ordem: 2, pct: 2.11, pctEspecial: 2.24 },
      { ordem: 3, pct: 3.30, pctEspecial: 3.6 },
      { ordem: 4, pct: 4.03, pctEspecial: 4.4 },
    ],
    ...over,
  };
}

/** R$ 38.450,00 realizados: 2ª Meta, 38.450 × 2,11% = R$ 811,30. */
function resultado(cfg: ConfigComissao = config(), over: Partial<EntradaComissao> = {}) {
  return calcularComissao({
    metaBruta: 34_000, metasExtrasBrutas: [37_000, 40_000, 43_000], metaIndiretaBruta: null,
    recebidoDireto: 38_450, recebidoIndiretoBruto: 0, fatorUnidade: 1,
    config: cfg, doSetor: cfg,
    ...over,
  });
}

function abrir(props: Partial<Parameters<typeof VerComissao>[0]> = {}) {
  return render(
    <VerComissao
      aberto
      onFechar={vi.fn()}
      nome="Ana Paula"
      mes="2026-09"
      isPaguePlay={false}
      mesFechado={false}
      resultado={resultado()}
      {...props}
    />,
  );
}

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const faixas = () =>
  within(screen.getByRole('list', { name: /Faixas de comissão/ })).getAllByRole('listitem');
const textoDa = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('VerComissao', () => {
  it('abre com o nome e o mês', () => {
    abrir();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(texto()).toContain('Ana Paula');
    expect(texto()).toContain('setembro/2026');
  });

  it('cada faixa diz a própria situação em texto, não só em cor', () => {
    abrir();
    const f = faixas();
    expect(f).toHaveLength(4);
    expect(within(f[0]).getByText('Atingida')).toBeInTheDocument();
    expect(within(f[1]).getByText('Comissão atual')).toBeInTheDocument();
    expect(within(f[2]).getByText('Próxima')).toBeInTheDocument();
    expect(within(f[3]).getByText('Não atingida')).toBeInTheDocument();
  });

  it('a faixa atual é o passo corrente da progressão', () => {
    abrir();
    expect(faixas()[1]).toHaveAttribute('aria-current', 'step');
    expect(faixas()[0]).not.toHaveAttribute('aria-current');
  });

  it('a faixa atual mostra a comissão sobre o valor realizado', () => {
    abrir();
    expect(textoDa(faixas()[1])).toMatch(/Comissão\s?R\$\s?811,30/);
    expect(textoDa(faixas()[1])).toMatch(/sobre R\$\s?38\.450,00 realizados/);
    expect(texto()).toMatch(/Comissão atual\s?R\$\s?811,30/);
  });

  it('as outras faixas mostram o mínimo ao chegar lá', () => {
    abrir();
    expect(textoDa(faixas()[2])).toMatch(/A partir de\s?R\$\s?1\.320,00/);
    expect(texto()).toMatch(/Próxima faixa, a partir de\s?R\$\s?1\.320,00/);
  });

  it('faixa não atingida mostra quanto falta', () => {
    abrir();
    expect(textoDa(faixas()[2])).toMatch(/Faltam R\$\s?1\.550,00/);
  });

  it('com o benefício ativo, mostra o percentual e a comissão de antes e de agora', () => {
    const cfg = config({ regraSetor: 'percentual_especial', setorMetaConfirmadaEm: '2026-09-28T14:32:00Z', setorMetaConfirmadaPorNome: 'Fulano' });
    abrir({ resultado: resultado(cfg) });
    expect(texto()).toContain('Meta do setor atingida');
    expect(texto()).toMatch(/2,11%\s?→\s?2,24%/);
    expect(texto()).toMatch(/R\$\s?811,30\s?→\s?R\$\s?861,28/);
  });

  it('sem confirmação, avisa o que muda se o setor bater a meta', () => {
    const cfg = config({ regraSetor: 'percentual_especial' });
    abrir({ resultado: resultado(cfg) });
    expect(texto()).not.toContain('Meta do setor atingida');
    expect(texto()).toMatch(/Se o setor bater a meta: 2ª Meta passa a 2,24% \(R\$\s?861,28\)/);
  });

  it('antes da 1ª faixa, o aviso fala do mínimo com o benefício', () => {
    const cfg = config({ regraSetor: 'percentual_especial' });
    abrir({ resultado: resultado(cfg, { recebidoDireto: 30_000 }) });
    expect(texto()).toMatch(/Se o setor bater a meta: 1ª Meta passa a 2,00% \(a partir de R\$\s?680,00\)/);
  });

  it('a indireta aparece no modo separado, com o total das duas partes', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    abrir({ resultado: resultado(cfg, { metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_600 }) });
    expect(texto()).toContain('Meta indireta');
    expect(texto()).toMatch(/Comissão R\$\s?84,00/);
    expect(texto()).toMatch(/Total R\$\s?895,30/);
  });

  it('indireta não atingida mostra o mínimo', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    abrir({ resultado: resultado(cfg, { metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 4_000 }) });
    expect(texto()).toMatch(/A partir de R\$\s?75,00/);
  });

  it('sem meta indireta, a seção não existe', () => {
    abrir();
    expect(texto()).not.toContain('Meta indireta');
  });

  it('mês fechado diz quanto faltou', () => {
    abrir({ mesFechado: true });
    expect(texto()).toMatch(/Faltou R\$\s?1\.550,00/);
  });

  it('na PaguePlay, diz que os valores estão em H.O.', () => {
    abrir({ isPaguePlay: true });
    expect(texto()).toContain('H.O.');
  });

  it('explica a conta: realizado × percentual da maior faixa atingida', () => {
    abrir();
    expect(texto()).toContain('Comissão = valor realizado × percentual da maior faixa atingida');
  });
});
