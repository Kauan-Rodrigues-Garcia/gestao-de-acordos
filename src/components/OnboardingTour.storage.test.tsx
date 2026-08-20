import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingTour } from './OnboardingTour';
import {
  marcarOnboardingApresentado, onboardingJaApresentado, ONBOARDING_STORAGE_KEY,
} from './onboardingStorage';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'pessoa-logada' } }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: true }),
}));

describe('persistencia do onboarding', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('registra que o tutorial ja apareceu para a pessoa', () => {
    expect(onboardingJaApresentado('pessoa-1')).toBe(false);

    marcarOnboardingApresentado('pessoa-1');

    expect(onboardingJaApresentado('pessoa-1')).toBe(true);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY('pessoa-1'))).toBe('1');
  });

  it('nao mistura o tutorial de pessoas diferentes no mesmo navegador', () => {
    marcarOnboardingApresentado('pessoa-1');

    expect(onboardingJaApresentado('pessoa-2')).toBe(false);
  });

  it('marca como apresentado no instante em que abre, sem exigir conclusao', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <OnboardingTour precisaAceitar={false} termoLoading={false} />
      </MemoryRouter>,
    );

    expect(onboardingJaApresentado('pessoa-logada')).toBe(false);
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText('Bem-vindo ao sistema!')).toBeInTheDocument();
    expect(onboardingJaApresentado('pessoa-logada')).toBe(true);
  });

  it('nao reaparece em um login posterior da mesma pessoa', () => {
    marcarOnboardingApresentado('pessoa-logada');
    vi.useFakeTimers();

    render(
      <MemoryRouter>
        <OnboardingTour precisaAceitar={false} termoLoading={false} />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByText('Bem-vindo ao sistema!')).not.toBeInTheDocument();
  });
});
