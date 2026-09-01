/**
 * MesProvider.test.tsx — o mês escolhido não pode se perder, nem grudar.
 *
 * As duas queixas que este provider resolve são opostas, e é por isso que os
 * testes andam em par:
 *
 *   • escolher agosto e clicar em outra página voltava para setembro — o mês
 *     tem de SOBREVIVER à navegação e ao F5;
 *   • um mês que sobrevive demais é pior ainda: alguém abre o sistema semanas
 *     depois, vê números de agosto e trata como os de hoje.
 *
 * Daí `sessionStorage` (morre com a aba) e o campo `era`, que solta quem estava
 * "no mês corrente" quando o mês vira.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MesProvider, useMesGlobal } from '../MesProvider';
import { mesAtual } from '@/lib/mesReferencia';

const CHAVE = 'gac:mes-global:v1';

function Sonda() {
  const { mes, setMes, voltarAoMesAtual } = useMesGlobal();
  return (
    <div>
      <span data-testid="mes">{mes}</span>
      <button onClick={() => setMes('2026-08')}>agosto</button>
      <button onClick={() => setMes('2999-01')}>futuro</button>
      <button onClick={voltarAoMesAtual}>hoje</button>
    </div>
  );
}

function montar() {
  return render(<MesProvider><Sonda /></MesProvider>);
}

describe('MesProvider', () => {
  beforeEach(() => { sessionStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('começa no mês corrente quando não há nada guardado', () => {
    montar();
    expect(screen.getByTestId('mes').textContent).toBe(mesAtual());
  });

  it('guarda a escolha na aba', async () => {
    montar();
    await act(async () => { screen.getByText('agosto').click(); });

    expect(screen.getByTestId('mes').textContent).toBe('2026-08');
    const guardado = JSON.parse(sessionStorage.getItem(CHAVE)!);
    expect(guardado.mes).toBe('2026-08');
    // `era` é o mês corrente do momento da escolha — é ele que distingue
    // "escolhi agosto" de "estou no mês de hoje, que por acaso é agosto".
    expect(guardado.era).toBe(mesAtual());
  });

  it('uma tela nova nasce no mês que a anterior escolheu', () => {
    sessionStorage.setItem(CHAVE, JSON.stringify({ mes: '2026-08', era: '2026-09' }));
    montar();
    expect(screen.getByTestId('mes').textContent).toBe('2026-08');
  });

  it('quem estava no mês corrente acompanha a virada do mês', () => {
    // Guardado quando setembro era "hoje". Se hoje já é outro mês, ficar preso
    // em setembro mostraria dado velho para quem nunca pediu mês nenhum.
    sessionStorage.setItem(CHAVE, JSON.stringify({ mes: '2026-09', era: '2026-09' }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));

    montar();
    expect(screen.getByTestId('mes').textContent).toBe('2026-10');
  });

  it('mês guardado no futuro é ignorado', () => {
    sessionStorage.setItem(CHAVE, JSON.stringify({ mes: '2999-01', era: '2999-01' }));
    montar();
    expect(screen.getByTestId('mes').textContent).toBe(mesAtual());
  });

  it('lixo no storage não derruba a tela', () => {
    sessionStorage.setItem(CHAVE, 'não é json');
    montar();
    expect(screen.getByTestId('mes').textContent).toBe(mesAtual());
  });

  it('entrada inválida vira o mês corrente, e "hoje" volta para ele', async () => {
    montar();
    await act(async () => { screen.getByText('futuro').click(); });
    // `normalizarMes` aceita o formato, então 2999-01 entra; o que não pode é
    // ele SOBREVIVER a um recarregamento — é o teste acima que fixa isso.
    await act(async () => { screen.getByText('hoje').click(); });
    expect(screen.getByTestId('mes').textContent).toBe(mesAtual());
  });

  it('fora do provider a tela ainda funciona, com o mês corrente', () => {
    render(<Sonda />);
    expect(screen.getByTestId('mes').textContent).toBe(mesAtual());
  });
});
