/**
 * CardComissao.test.tsx — a comissão no Dashboard, de relance.
 *
 * O card não repete a tabela de faixas: diz quanto já recebe, em que faixa está,
 * qual percentual vale e quanto falta — e manda o resto para «Ver comissão».
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardComissao } from './CardComissao';
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

function resultado(over: Partial<EntradaComissao> = {}, cfg: ConfigComissao = config()) {
  return calcularComissao({
    metaBruta: 34_000, metasExtrasBrutas: [37_000, 40_000, 43_000], metaIndiretaBruta: null,
    recebidoDireto: 38_450, recebidoIndiretoBruto: 0, fatorUnidade: 1,
    config: cfg, doSetor: cfg,
    ...over,
  });
}

function desenhar(props: Partial<Parameters<typeof CardComissao>[0]> = {}) {
  const onVer = vi.fn();
  render(
    <CardComissao resultado={resultado()} isPaguePlay={false} mesFechado={false} onVer={onVer} {...props} />,
  );
  return { onVer };
}

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('CardComissao', () => {
  it('com faixa atual: valor, faixa, percentual, próxima e quanto falta', () => {
    desenhar();
    expect(texto()).toMatch(/R\$\s?780,70/);
    expect(texto()).toContain('2ª Meta · 2,11%');
    expect(texto()).toMatch(/Próxima: R\$\s?1\.320,00 \(3ª Meta\)/);
    expect(texto()).toMatch(/Faltam R\$\s?1\.550,00/);
  });

  it('sem faixa atingida, diz isso e mostra a 1ª meta', () => {
    desenhar({ resultado: resultado({ recebidoDireto: 30_000 }) });
    expect(screen.getByText('Nenhuma faixa ainda')).toBeInTheDocument();
    expect(texto()).toMatch(/1ª Meta: faltam R\$\s?4\.000,00 · comissão R\$\s?595,00/);
  });

  it('com todas as faixas atingidas, não promete uma próxima', () => {
    desenhar({ resultado: resultado({ recebidoDireto: 50_000 }) });
    expect(texto()).toContain('Todas as faixas atingidas');
    expect(texto()).not.toContain('Próxima');
  });

  it('com o benefício do setor ativo, mostra o selo', () => {
    const cfg = config({ regraSetor: 'percentual_especial', setorMetaConfirmadaEm: '2026-09-28T14:32:00Z' });
    desenhar({ resultado: resultado({}, cfg) });
    expect(screen.getByTitle('Meta do setor atingida — benefício ativo')).toBeInTheDocument();
    expect(texto()).toContain('2ª Meta · 2,24%');
  });

  it('sem benefício ativo, não há selo', () => {
    desenhar();
    expect(screen.queryByTitle('Meta do setor atingida — benefício ativo')).toBeNull();
  });

  it('mês fechado diz quanto faltou', () => {
    desenhar({ mesFechado: true });
    expect(texto()).toMatch(/Faltou R\$\s?1\.550,00/);
  });

  it('na PaguePlay, o rótulo diz que é H.O.', () => {
    desenhar({ isPaguePlay: true });
    expect(texto()).toContain('Comissão · H.O.');
  });

  it('«Ver comissão» abre a tela completa', () => {
    const { onVer } = desenhar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver comissão' }));
    expect(onVer).toHaveBeenCalledTimes(1);
  });
});
