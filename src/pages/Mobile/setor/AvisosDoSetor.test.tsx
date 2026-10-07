/** As chaves dos avisos da gerência (migration 20261007120000): quatro, começam ligadas. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const estado = { valor: 'ativo' as string };
const definir = vi.fn();
const contexto = { valor: undefined as string | undefined };
type P = Record<string, boolean>;
const ligadas: P = {
  fixo: false, resumo_equipe: false, metas_operadores: false, meta_equipe: false, gerencia: true,
  setor_meta: true, setor_metas_equipes: true, setor_metas_operadores: true, setor_resumo: true,
};
const prefs = { disponivel: true, preferencias: { ...ligadas } as P | null };

vi.mock('../useAvisos', () => ({
  useAvisos: (_e: string | null, c?: string) => {
    contexto.valor = c;
    return { estado: estado.valor, ocupado: false, ativar: vi.fn(), desativar: vi.fn() };
  },
}));
vi.mock('../equipe/usePreferenciasEquipe', () => ({
  usePreferenciasEquipe: () => ({ ...prefs, salvando: false, definir }),
}));

import { AvisosDoSetor } from './AvisosDoSetor';

beforeEach(() => {
  definir.mockReset();
  estado.valor = 'ativo';
  prefs.disponivel = true;
  prefs.preferencias = { ...ligadas };
});

describe('AvisosDoSetor', () => {
  it('gerente: quatro chaves, ligadas; desliga cada uma à parte', () => {
    render(<AvisosDoSetor empresaId="e" />);
    expect(contexto.valor).toBe('setor');
    const chaves = screen.getAllByRole('switch');
    expect(chaves).toHaveLength(4);
    for (const c of chaves) expect((c as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: /Resumo do setor a cada hora/ }));
    expect(definir).toHaveBeenCalledWith('setor_resumo', false);
    fireEvent.click(screen.getByRole('switch', { name: /Metas alcançadas pelas pessoas/ }));
    expect(definir).toHaveBeenCalledWith('setor_metas_operadores', false);
  });

  it('o banco diz que não é gerência: nenhuma chave', () => {
    prefs.preferencias = { ...ligadas, gerencia: false };
    render(<AvisosDoSetor empresaId="e" />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeTruthy();
  });

  it('sem avisos no aparelho: oferece ativar', () => {
    estado.valor = 'inativo';
    render(<AvisosDoSetor empresaId="e" />);
    expect(screen.getByRole('button', { name: 'Ativar avisos' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('banco sem a migration: não promete aviso do setor', () => {
    prefs.disponivel = false;
    prefs.preferencias = null;
    render(<AvisosDoSetor empresaId="e" />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
