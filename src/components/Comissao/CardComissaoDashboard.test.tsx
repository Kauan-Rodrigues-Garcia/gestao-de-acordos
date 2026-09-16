/**
 * CardComissaoDashboard.test.tsx — a comissão ao lado do «Progresso da meta».
 *
 * As contas têm teste próprio (`comissao.test.ts`). Aqui fica o que é do card:
 * o valor e a faixa de relance, a escada em uma linha por faixa, quanto falta
 * para a próxima e a porta para a tela completa.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatBRL } from '@/lib/money';
import {
  calcularComissao, type ConfigComissao, type EntradaComissao,
} from '@/services/comissao/comissao';
import { ALTURA_CARD_PROGRESSO } from '@/components/PainelMetas/tamanhoCards';
import { CardComissaoDashboard } from './CardComissaoDashboard';

vi.mock('./VerComissao', () => ({
  VerComissao: ({ nome }: { nome: string }) => <div role="dialog">{`Comissão — ${nome}`}</div>,
}));

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, grupoUsuarios: false, usuarioIds: [],
    ano: 2026, mes: 9,
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

function desenhar(props: Partial<Parameters<typeof CardComissaoDashboard>[0]> = {}) {
  const r = props.resultado ?? resultado();
  render(
    <CardComissaoDashboard
      resultado={r} isPaguePlay={false} mesFechado={false} mes="2026-09" nome="Ana"
      {...props}
    />,
  );
  return r;
}

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('CardComissaoDashboard', () => {
  it('com faixa atual: a comissão, a faixa e quanto falta para a próxima', () => {
    const r = desenhar();
    expect(texto()).toContain(formatBRL(r.total).replace(/\s+/g, ' '));
    expect(texto()).toContain('2ª Meta · 2,11%');
    expect(texto()).toMatch(/Faltam R\$\s?1\.550,00 para a 3ª Meta/);
  });

  it('desenha uma linha por faixa e marca a atual', () => {
    desenhar();
    const faixas = screen.getByRole('list', { name: 'Faixas de comissão' });
    expect(faixas.querySelectorAll('li')).toHaveLength(4);
    expect(faixas.querySelector('[aria-current="step"]')?.textContent).toContain('2ª Meta');
  });

  it('sem faixa atingida, diz isso', () => {
    desenhar({ resultado: resultado({ recebidoDireto: 30_000 }) });
    expect(screen.getByText('Nenhuma faixa ainda')).toBeInTheDocument();
    expect(texto()).toMatch(/Faltam R\$\s?4\.000,00 para a 1ª Meta/);
  });

  it('com todas as faixas atingidas, não promete uma próxima', () => {
    desenhar({ resultado: resultado({ recebidoDireto: 50_000 }) });
    expect(texto()).toContain('Todas as faixas atingidas');
  });

  it('mês fechado diz quanto faltou', () => {
    desenhar({ mesFechado: true });
    expect(texto()).toMatch(/Faltou R\$\s?1\.550,00/);
  });

  it('com o benefício do setor ativo, mostra o selo', () => {
    const cfg = config({ regraSetor: 'percentual_especial', setorMetaConfirmadaEm: '2026-09-28T14:32:00Z' });
    desenhar({ resultado: resultado({}, cfg) });
    expect(screen.getByTitle('Meta do setor atingida — benefício ativo')).toBeInTheDocument();
  });

  it('na PaguePlay, diz que é H.O.', () => {
    desenhar({ isPaguePlay: true });
    expect(screen.getByText('· H.O.')).toBeInTheDocument();
  });

  it('na BookPlay, não fala em H.O.', () => {
    desenhar();
    expect(screen.queryByText('· H.O.')).toBeNull();
  });

  // Mesma altura do «Progresso da meta», nas duas vistas dele (14/09/2026):
  // os dois ficam lado a lado e nenhum pode crescer sozinho.
  it('usa a altura fixa do card de Progresso da meta', () => {
    desenhar();
    const card = screen.getByRole('list', { name: 'Faixas de comissão' }).closest('[data-card-comissao]');
    expect(card?.className).toContain(ALTURA_CARD_PROGRESSO);
  });

  it('bônus: uma linha por bônus, e o garantido embaixo do valor', () => {
    const r = resultado({
      recebidoDireto: 43_000,
      hoje: '2026-09-16',
      bonus: [
        {
          id: 'b1', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9, tipo: 'meta', metaOrdem: 4,
          valorAlvo: null, periodoInicio: null, periodoFim: null, valorBonus: 200, descricao: null, usuarioIds: ['ana'],
        },
        {
          id: 'b2', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9, tipo: 'valor', metaOrdem: null,
          valorAlvo: 200_000, periodoInicio: null, periodoFim: null, valorBonus: 500, descricao: null, usuarioIds: ['ana'],
        },
      ],
    });
    desenhar({ resultado: r });
    expect(r.total).toBe(1_732.9);
    expect(texto()).toContain(`+ ${formatBRL(200)} de bônus garantido`.replace(/\s+/g, ' '));
    expect(texto()).toContain('Bônus 4ª Meta');
    expect(texto()).toContain(`+${formatBRL(500)}`.replace(/\s+/g, ' '));
  });

  it('sem faixas no mês e com bônus, o card mostra o bônus', () => {
    const r = resultado({
      config: null, doSetor: null, hoje: '2026-09-16',
      bonus: [{
        id: 'b1', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9, tipo: 'valor', metaOrdem: null,
        valorAlvo: 30_000, periodoInicio: null, periodoFim: null, valorBonus: 150, descricao: null, usuarioIds: ['ana'],
      }],
    });
    desenhar({ resultado: r });
    expect(texto()).toContain('Sem faixas no mês');
    expect(texto()).toContain(`+ ${formatBRL(150)} de bônus garantido`.replace(/\s+/g, ' '));
  });

  it('«Ver comissão» abre a tela completa', () => {
    desenhar();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver comissão' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Comissão — Ana');
  });
});
