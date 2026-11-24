/**
 * PixRankingSetor — o recorte por equipe (24/11/2026).
 *
 * O ranking separava só por setor. Agora, dentro do setor, filtra por equipe e
 * mostra as equipes disputando entre si — sem nunca atravessar setores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PixRankingSetor, type AbaRankingPix } from './PixRankingSetor';
import type { LinhaRankingPix } from './pixAutomaticoView';

const linha = (operadorId: string, nome: string, acordos: number): LinhaRankingPix => ({
  operadorId, nome, acordos, valor: acordos * 1000, comissao: acordos * 10, requisitoAcordosOk: acordos >= 18,
});

const ABA: AbaRankingPix = {
  setorId: 'rec',
  nome: 'Receptivo',
  linhas: [
    linha('maria', 'Maria', 20),
    linha('ana',   'Ana',   12),
    linha('joao',  'João',  5),
    linha('bia',   'Bia',   3),
  ],
  equipes: [
    { id: 'eq-l', nome: 'Luciana' },
    { id: 'eq-m', nome: 'Matheus' },
    { id: 'eq-p', nome: 'Parada' },
  ],
  equipeDe: { maria: 'eq-l', ana: 'eq-m', joao: 'eq-l', bia: null },
  metaPorEquipe: { 'eq-m': { pct: 110, metaBatida: true } },
};

beforeEach(() => { window.localStorage.clear(); });

describe('PixRankingSetor — equipes', () => {
  it('oferece as equipes com gente, mais «Sem equipe»; a parada não vira chip', () => {
    render(<PixRankingSetor abas={[ABA]} recolhivel={false} />);
    const chips = within(screen.getByRole('radiogroup', { name: 'Equipe do ranking' }));
    expect(chips.getAllByRole('radio').map(b => b.textContent)).toEqual(
      ['Todas as equipes', 'Luciana', 'Matheus', 'Sem equipe'],
    );
  });

  it('escolher a equipe recorta o pódio e recomeça os lugares', () => {
    render(<PixRankingSetor abas={[ABA]} recolhivel={false} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Luciana' }));
    expect(screen.getByText('Maria')).toBeTruthy();
    expect(screen.getByText('João')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();
    expect(screen.getByText(/2 operadores · 25 acordos/)).toBeTruthy();
    expect(screen.getByText('2º lugar')).toBeTruthy();
  });

  it('abre na equipe da barra do topo quando ela é do setor', () => {
    render(<PixRankingSetor abas={[ABA]} recolhivel={false} equipeInicial="eq-m" />);
    expect(screen.getByRole('radio', { name: 'Matheus' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('Maria')).toBeNull();
  });

  it('modo Equipes: ranking das equipes, parada zerada e clique abre a equipe', () => {
    render(<PixRankingSetor abas={[ABA]} recolhivel={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /Equipes/ }));
    expect(screen.getByText('3 equipes · 40 acordos no mês')).toBeTruthy();
    expect(screen.getByText('110%')).toBeTruthy();
    expect(screen.getByText('Parada')).toBeTruthy();

    fireEvent.click(screen.getByText('Matheus'));
    // Voltou para Operadores, já na equipe clicada.
    expect(screen.getByRole('radio', { name: 'Matheus' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('setor sem equipe fica como sempre foi', () => {
    const semEquipe: AbaRankingPix = { setorId: 'x', nome: 'Digital', linhas: ABA.linhas };
    render(<PixRankingSetor abas={[semEquipe]} recolhivel={false} />);
    expect(screen.queryByRole('tab', { name: /Equipes/ })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Equipe do ranking' })).toBeNull();
  });
});
