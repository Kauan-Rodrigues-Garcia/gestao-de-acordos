/**
 * A cédula da votação dos gerentes (12/11/2026): o operador vê o gerente
 * dele e marca a opção que mais se encaixa. Com 2 gerentes, uma para cada, e
 * a mesma opção não fica nos dois.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PERGUNTAS_PADRAO_GERENTES, cedulaComTodos, type Candidato } from './cedula';
import { TelaVotacao } from './TelaVotacao';

const g = (id: string, nome: string): Candidato => ({ id, nome, foto: null, setor: 'Play 1', perfil: 'gerencia' });
const OPCOES = PERGUNTAS_PADRAO_GERENTES;
const abrir = (gerentes: Candidato[], onEnviar = vi.fn(async () => undefined)) => {
  render(
    <TelaVotacao tipo="gerentes" modo="real" cedula={cedulaComTodos(OPCOES, gerentes)} pessoas={new Map(gerentes.map(x => [x.id, x]))}
      eleitorId="op" nomeEleitor="Olga" semente={1} umPorCandidato onEnviar={onEnviar} onFechar={() => undefined} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Começar/ }));
  return onEnviar;
};

describe('VotoNoGerente', () => {
  it('um gerente: marca uma opção e envia {opção: gerente}', async () => {
    const enviar = abrir([g('g1', 'Gabi Souza')]);
    expect(screen.getByText('Gabi Souza')).toBeTruthy();
    expect(screen.getByText(/Selecione a opção que mais se encaixa com seu gerente/)).toBeTruthy();
    const botao = screen.getByRole('button', { name: /Enviar meu voto/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Mais inspirador/ }));
    // Trocar de ideia: a outra opção substitui.
    fireEvent.click(screen.getByRole('radio', { name: /Referência para todos/ }));
    fireEvent.click(botao);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toEqual({ referencia: 'g1' });
    expect(await screen.findByText('Voto enviado!')).toBeTruthy();
  });

  it('dois gerentes: uma opção para cada, e a mesma não fica nos dois', async () => {
    const enviar = abrir([g('g1', 'Gabi Souza'), g('g2', 'Gustavo Lima')]);
    const deGabi = screen.getByRole('radiogroup', { name: 'Opções para Gabi Souza' });
    const deGustavo = screen.getByRole('radiogroup', { name: 'Opções para Gustavo Lima' });
    fireEvent.click(within(deGabi).getByRole('radio', { name: /Mais resolve problemas/ }));
    // Gustavo pega a mesma: sai da Gabi.
    fireEvent.click(within(deGustavo).getByRole('radio', { name: /Mais resolve problemas/ }));
    expect(within(deGabi).getByRole('radio', { name: /Mais resolve problemas/ }).getAttribute('aria-checked')).toBe('false');
    expect((screen.getByRole('button', { name: /Enviar meu voto/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(deGabi).getByRole('radio', { name: /Mais ético/ }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar meu voto/ }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toEqual({ solucionador: 'g2', etico: 'g1' });
  });
});
