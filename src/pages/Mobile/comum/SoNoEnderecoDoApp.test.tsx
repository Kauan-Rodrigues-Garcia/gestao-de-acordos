/**
 * A tela do celular só no endereço do app (07/10/2026): fora dele, desliga os
 * avisos do endereço antigo e vai para a mesma tela no `app.`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  noApp: true,
  aposentar: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/mobile/preferencia', () => ({
  mobileNesteEndereco: () => mocks.noApp,
  urlNoApp: (c: string) => `https://app.gestaodeacordos.com.br/#${c}`,
}));
vi.mock('@/lib/mobile/push', () => ({ aposentarAvisosDesteEndereco: mocks.aposentar }));

import { SoNoEnderecoDoApp } from './SoNoEnderecoDoApp';

const original = window.location;
const replace = vi.fn();

beforeEach(() => {
  replace.mockReset();
  mocks.aposentar.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, replace } });
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: original });
});

function montar(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <SoNoEnderecoDoApp><p>tela do app</p></SoNoEnderecoDoApp>
    </MemoryRouter>,
  );
}

describe('SoNoEnderecoDoApp', () => {
  it('no endereço do app mostra a tela', () => {
    mocks.noApp = true;
    montar('/m');
    expect(screen.getByText('tela do app')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('no endereço do site desliga os avisos antigos e vai para a mesma tela no app', async () => {
    mocks.noApp = false;
    montar('/m/equipe?aba=hoje');
    expect(screen.queryByText('tela do app')).toBeNull();
    expect(screen.getByText('Abrindo o app…')).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://app.gestaodeacordos.com.br/#/m/equipe?aba=hoje'));
    expect(mocks.aposentar).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
