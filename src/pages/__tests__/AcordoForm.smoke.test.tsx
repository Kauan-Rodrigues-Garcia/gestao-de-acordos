/**
 * AcordoForm.smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * O AcordoForm deixou de ter formulário próprio: as duas rotas de tela cheia
 * são molduras em volta dos MESMOS componentes que a lista de Acordos usa.
 *
 *   /acordos/novo        → AcordoNovoInline
 *   /acordos/:id/editar  → AcordoEditInline
 *
 * É exatamente isso que este arquivo trava. Antes existiam dois formulários
 * por tenant aqui dentro, com uma cópia da escada de conflito de NR que
 * divergiu da do inline. Se alguém reintroduzir um formulário local, ou trocar
 * qual componente cada rota monta, estes testes quebram.
 *
 * Substitui o AcordoForm.vencimento-pagueplay.test.ts, que lia FormPP.tsx e
 * FormBP.tsx do disco — arquivos que deixaram de existir, e cuja premissa
 * ("tela cheia de Novo acordo") já estava desatualizada desde que a criação
 * passou a renderizar o inline.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Mocks (antes do SUT) ────────────────────────────────────────────────────

let paramsId: string | undefined;
const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams:   () => ({ id: paramsId }),
  useNavigate: () => navigateMock,
}));

let isPaguePlayValue = false;
vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: isPaguePlayValue }),
}));

// IDENTIDADE ESTÁVEL, e não um literal por chamada. O componente tem
// `useEffect(..., [perfil, user])`; devolvendo objetos novos a cada render o
// efeito redispara, chama setPerfilLocal, e o render seguinte cria outro objeto
// — laço infinito que derruba o worker do vitest por memória, sem mensagem de
// asserção nenhuma.
const PERFIL_FIXO = { id: 'perfil-1', nome: 'Operador Teste', setores: { nome: 'Cobranca' } };
const USER_FIXO   = { id: 'perfil-1', email: 'op@teste.com' };
const AUTH_FIXO   = { perfil: PERFIL_FIXO, user: USER_FIXO, perfilLoading: false };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => AUTH_FIXO,
}));

/** Resposta de `.single()` no carregamento do acordo em modo edição. */
let acordoCarregado: { data: unknown; error: { message: string } | null } = {
  data: { id: 'acordo-1', nome_cliente: 'Joao', nr_cliente: '777' },
  error: null,
};

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) builder[m] = vi.fn(() => builder);
  builder.single      = vi.fn(async () => acordoCarregado);
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  return { supabase: { from: vi.fn(() => builder) } };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Os dois componentes viram sondas: o que importa aqui é QUAL deles monta, e
// com quais props — não o que cada um desenha por dentro (isso os testes deles
// já cobrem).
const novoProps = vi.fn();
const editProps = vi.fn();

vi.mock('@/components/AcordoNovoInline', () => ({
  AcordoNovoInline: (props: Record<string, unknown>) => {
    novoProps(props);
    return React.createElement('tr', null, React.createElement('td', null, 'novo-inline'));
  },
}));

vi.mock('@/components/AcordoEditInline', () => ({
  AcordoEditInline: (props: Record<string, unknown>) => {
    editProps(props);
    return React.createElement('tr', null, React.createElement('td', null, 'edit-inline'));
  },
}));

import AcordoForm from '../AcordoForm';

beforeEach(() => {
  paramsId = undefined;
  isPaguePlayValue = false;
  navigateMock.mockReset();
  novoProps.mockReset();
  editProps.mockReset();
  acordoCarregado = {
    data: { id: 'acordo-1', nome_cliente: 'Joao', nr_cliente: '777' },
    error: null,
  };
});

// ── Cenários ────────────────────────────────────────────────────────────────

describe('AcordoForm — moldura em volta dos componentes da lista', () => {
  it('/acordos/novo monta o AcordoNovoInline, e nenhum formulário próprio', async () => {
    render(<AcordoForm />);

    await screen.findByText('novo-inline');
    expect(screen.getByText('Novo Acordo')).toBeTruthy();
    expect(editProps).not.toHaveBeenCalled();
  });

  it('/acordos/:id/editar monta o AcordoEditInline com o acordo carregado', async () => {
    paramsId = 'acordo-1';

    render(<AcordoForm />);

    await screen.findByText('edit-inline');
    expect(screen.getByText('Editar Acordo')).toBeTruthy();
    expect(novoProps).not.toHaveBeenCalled();
    expect(editProps.mock.calls[0][0]).toMatchObject({
      acordo: { id: 'acordo-1' },
    });
  });

  it('o tenant chega nos dois componentes — a tela cheia nao decide sozinha', async () => {
    isPaguePlayValue = true;
    render(<AcordoForm />);

    await screen.findByText('novo-inline');
    expect(novoProps.mock.calls[0][0]).toMatchObject({ isPaguePlay: true });
  });

  it('acordo que nao carrega volta para a lista em vez de renderizar vazio', async () => {
    paramsId = 'acordo-sumido';
    acordoCarregado = { data: null, error: { message: 'not found' } };

    render(<AcordoForm />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/acordos'));
    expect(editProps).not.toHaveBeenCalled();
  });
});
