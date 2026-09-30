/** «Instalar app» na visão Equipe — o líder cai direto aqui e não via o botão. */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const inst = { modo: 'iphone' as string, instalar: vi.fn() };
vi.mock('@/lib/mobile/instalar', () => ({ useInstalacao: () => inst }));

import { BotaoInstalar, PassoIPhone } from './InstalarApp';

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('Instalar app na visão Equipe', () => {
  it('iPhone: o botão abre o passo a passo', () => {
    inst.modo = 'iphone';
    const abrir = vi.fn();
    render(<BotaoInstalar onPassoIPhone={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: /Instalar app/ }));
    expect(abrir).toHaveBeenCalled();
  });

  it('Android com convite: o botão chama o convite do navegador', () => {
    inst.modo = 'convite';
    render(<BotaoInstalar onPassoIPhone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Instalar app/ }));
    expect(inst.instalar).toHaveBeenCalled();
  });

  it('já instalado (ou navegador sem convite): sem botão', () => {
    inst.modo = 'instalado';
    const { container } = render(<BotaoInstalar onPassoIPhone={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('o passo a passo do iPhone', () => {
    render(<PassoIPhone aberto onFechar={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Instalar no iPhone' })).toBeTruthy();
    expect(screen.getByText('Adicionar à Tela de Início')).toBeTruthy();
  });
});
