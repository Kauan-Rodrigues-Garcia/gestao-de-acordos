/**
 * O tutorial avisa quando sai do caminho (01/10/2026).
 *
 * A mensagem de Halloween espera o tutorial. Ela olhava `perfil.tour_visto_em`
 * — que o tutorial grava no banco, mas que o perfil em memória só enxerga
 * depois de recarregar. Numa conta nova, a mensagem não aparecia até o F5.
 * Agora o tutorial chama `onFinished` em três situações, e estes testes as
 * prendem: já visto (data no perfil), já visto nesta máquina, e concluído.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const perfilAtual: { id: string; tour_visto_em: string | null } = { id: 'p1', tour_visto_em: null };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, perfil: perfilAtual }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'e1' }, tenantSlug: 'bookplay', loading: false }) }));
vi.mock('@/hooks/useCargoPermissoes', () => ({ useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }) }));
vi.mock('@/lib/tenant-config', () => ({ useTenant: () => ({ isPaguePlay: false }) }));
vi.mock('@/lib/produto', () => ({ produtoDaEmpresa: () => 'cobranca' }));
vi.mock('@/services/tourVisto.service', () => ({ registrarTourVisto: vi.fn(async () => ({ erro: null })) }));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: () => null }));

import { OnboardingTour, ONBOARDING_STORAGE_KEY } from './OnboardingTour';

function montar(onFinished: () => void) {
  return render(
    <MemoryRouter>
      <OnboardingTour precisaAceitar={false} termoLoading={false} onFinished={onFinished} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  perfilAtual.tour_visto_em = null;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('OnboardingTour — onFinished libera quem espera o tutorial', () => {
  it('perfil que já viu o tutorial: avisa na hora, sem abrir', () => {
    perfilAtual.tour_visto_em = '2026-09-28T10:00:00Z';
    const fim = vi.fn();
    montar(fim);
    expect(fim).toHaveBeenCalled();
  });

  it('já visto nesta máquina (chave local): avisa na hora', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY('u1'), '1');
    const fim = vi.fn();
    montar(fim);
    expect(fim).toHaveBeenCalled();
  });

  it('conta nova: NÃO avisa enquanto o tutorial está aberto', () => {
    const fim = vi.fn();
    montar(fim);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(fim).not.toHaveBeenCalled();
  });

  it('esperando o termo de uso: não abre e não avisa', () => {
    const fim = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingTour precisaAceitar termoLoading={false} onFinished={fim} />
      </MemoryRouter>,
    );
    act(() => { vi.advanceTimersByTime(1500); });
    expect(fim).not.toHaveBeenCalled();
  });
});
