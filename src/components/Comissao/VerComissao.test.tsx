/**
 * VerComissao.test.tsx — a progressão das faixas.
 *
 * O foco é o que o operador precisa entender de relance, e sem depender de cor:
 * a situação de cada faixa escrita, a faixa atual marcada como o passo em que
 * ele está, quanto falta, e o benefício do setor dito com «anterior → atual».
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

describe('VerComissao', () => {
  it('abre com o nome e o mês', () => {
    abrir();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(texto()).toContain('Ana Paula');
    expect(texto()).toContain('setembro/2026');
  });

  it('cada faixa diz a própria situação em texto, não só em cor', () => {
    abrir();
    const faixas = within(screen.getByRole('list', { name: /Faixas de comissão/ })).getAllByRole('listitem');
    expect(faixas).toHaveLength(4);
    expect(within(faixas[0]).getByText('Atingida')).toBeInTheDocument();
    expect(within(faixas[1]).getByText('Comissão atual')).toBeInTheDocument();
    expect(within(faixas[2]).getByText('Próxima')).toBeInTheDocument();
    expect(within(faixas[3]).getByText('Não atingida')).toBeInTheDocument();
  });

  it('a faixa atual é o passo corrente da progressão', () => {
    abrir();
    const faixas = within(screen.getByRole('list', { name: /Faixas de comissão/ })).getAllByRole('listitem');
    expect(faixas[1]).toHaveAttribute('aria-current', 'step');
    expect(faixas[0]).not.toHaveAttribute('aria-current');
  });

  it('faixa não atingida mostra quanto falta', () => {
    abrir();
    const faixas = within(screen.getByRole('list', { name: /Faixas de comissão/ })).getAllByRole('listitem');
    expect(faixas[2].textContent?.replace(/\s+/g, ' ')).toMatch(/Faltam R\$\s?1\.550,00/);
  });

  it('com o benefício ativo, mostra o percentual e a comissão de antes e de agora', () => {
    const cfg = config({ regraSetor: 'percentual_especial', setorMetaConfirmadaEm: '2026-09-28T14:32:00Z', setorMetaConfirmadaPorNome: 'Fulano' });
    abrir({ resultado: resultado(cfg) });
    expect(texto()).toContain('Meta do setor atingida');
    expect(texto()).toMatch(/2,11%\s?→\s?2,24%/);
    expect(texto()).toMatch(/R\$\s?780,70\s?→\s?R\$\s?828,80/);
  });

  it('sem confirmação, avisa o que muda se o setor bater a meta', () => {
    const cfg = config({ regraSetor: 'percentual_especial' });
    abrir({ resultado: resultado(cfg) });
    expect(texto()).not.toContain('Meta do setor atingida');
    expect(texto()).toMatch(/Se o setor bater a meta: 2ª Meta passa a 2,24% \(R\$\s?828,80\)/);
  });

  it('a indireta aparece no modo separado, com o total das duas partes', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    abrir({ resultado: resultado(cfg, { metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_000 }) });
    expect(texto()).toContain('Meta indireta');
    expect(texto()).toMatch(/Total R\$\s?855,70/);
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
});
