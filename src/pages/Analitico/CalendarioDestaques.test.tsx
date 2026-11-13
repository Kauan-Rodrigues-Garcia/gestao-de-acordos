/**
 * Destaques do dia (13/11/2026): o dia mostra o ranking das equipes, do maior
 * para o menor, com a foto de cada um — e não um nome só.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CalendarioDestaques } from './CalendarioDestaques';
import type { DestaqueGrupoDia } from '@/services/analitico/analitico.service';

const grupo = (operador: string, nome: string, equipe: string, valor: number): DestaqueGrupoDia => ({
  dia: '2026-11-05', grupo_id: `g-${equipe}`, grupo_nome: equipe, grupo_tipo: 'equipe',
  equipe_id: `g-${equipe}`, equipe_nome: equipe, operador_id: operador, operador_usuario: operador,
  operador_nome: nome, total_recebido: valor, total_pagamentos: 3,
});

describe('CalendarioDestaques', () => {
  // Fora de ordem de propósito: a tela ordena.
  const porGrupo = new Map([['2026-11-05', [
    grupo('b', 'Bruno Lima', 'Equipe B', 800),
    grupo('a', 'Ana Souza', 'Equipe A', 1500),
    grupo('c', 'Carla Dias', 'Equipe C', 300),
  ]]]);

  const desenhar = () => render(
    <CalendarioDestaques
      mes="2026-11" diasNoMes={30} hojeISO="2026-11-13" diaDaLente={null}
      porGrupo={porGrupo} unico={new Map()} usarGrupos
      fotos={{ a: 'https://x/ana.jpg', b: null }}
    />,
  );

  it('o quadradinho do dia já traz o ranking das equipes, maior primeiro', () => {
    desenhar();
    const dia = screen.getByRole('button', { name: /^5: / });
    expect(dia.getAttribute('aria-label')?.replace(/\s/g, ' ')).toBe('5: 1º Ana Souza, R$ 1.500,00; 2º Bruno Lima, R$ 800,00; 3º Carla Dias, R$ 300,00');
    expect(dia.textContent).toContain('Ana S.');
    expect(dia.textContent).toContain('Bruno L.');
    expect(dia.textContent).toContain('Carla D.');
  });

  it('a lista do dia aberto mostra a foto, ou as iniciais sem foto', () => {
    desenhar();
    // Celular e tela larga desenham a mesma lista (o CSS esconde uma): a primeira basta.
    const [detalhe] = screen.getAllByRole('region', { name: /Destaques de 05/ });
    const linhas = within(detalhe).getAllByRole('listitem');
    expect(linhas.map(l => l.textContent?.includes('Ana Souza'))).toEqual([true, false, false]);
    expect(linhas[0].querySelector('img')?.getAttribute('src')).toBe('https://x/ana.jpg');
    expect(linhas[1].querySelector('img')).toBeNull();
    expect(linhas[1].textContent).toContain('BL');
  });
});
