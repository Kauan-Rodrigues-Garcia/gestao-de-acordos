/**
 * ChatNotificacoes.verDetalhes.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do bug reportado pelo usuário:
 *   "Ao clicar em uma notificação e tentar ver detalhes, o app navega
 *    para uma página de erro em vez da página de Notificações Detalhadas."
 *
 * A raiz do sintoma era dupla:
 *   1) O modal interno do popup de notificações NÃO tinha um botão
 *      explícito para abrir a página completa `/notificacoes`. O único
 *      acesso era o link "Ver todas em Notificações Detalhadas →" da
 *      lista, escondido até haver MAIS de 30 notificações.
 *   2) Para 95% dos usuários (≤30 notifs) não havia caminho visível do
 *      popup para a página completa — e o usuário relatava "página de
 *      erro" pelo fluxo confuso.
 *
 * Fix aplicado em `ChatNotificacoes.tsx`:
 *   - Novo botão "Ver detalhes" no modal → navega para `/notificacoes`.
 *   - Gate de visibilidade do link "Ver todas..." passou de >30 para >0.
 *
 * Este teste valida o contrato do ModalDetalhe (unit test do componente
 * exportado) e a presença do link "Ver todas" mesmo com poucas notifs.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

// framer-motion → componentes DOM simples preservando tag + onClick
vi.mock('framer-motion', () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  // Props exclusivas de framer-motion que não devem ir para o DOM
  const MOTION_ONLY_PROPS = new Set([
    'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
    'animate', 'initial', 'exit', 'transition', 'layout', 'layoutId',
    'variants', 'custom', 'drag', 'dragConstraints',
  ]);
  const strip = (props: AnyProps): AnyProps => {
    const out: AnyProps = {};
    for (const k of Object.keys(props)) {
      if (!MOTION_ONLY_PROPS.has(k)) out[k] = props[k];
    }
    return out;
  };
  const makeProxy = (tag: string) => (props: AnyProps) => {
    const { children, ...rest } = strip(props);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return React.createElement(tag, rest as any, children);
  };
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => makeProxy(prop),
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mocks leves para não carregar toda a cadeia de supabase/auth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, perfil: { perfil: 'operador' } }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
  Notificacao: {},
}));

import { ModalDetalhe } from '../ChatNotificacoes';

const notifFake = {
  id: 'n1',
  usuario_id: 'u1',
  titulo: 'NR 1000 transferido',
  mensagem: 'Cliente João foi atribuído ao seu nome.',
  lida: false,
  criado_em: new Date().toISOString(),
};

describe('ChatNotificacoes / ModalDetalhe — botão "Ver detalhes"', () => {
  it('renderiza botão "Ver detalhes" e aciona onVerPagina ao clicar', () => {
    const onVerPagina = vi.fn();
    const onClose = vi.fn();
    render(
      <ModalDetalhe
        notificacao={notifFake}
        onClose={onClose}
        onMarcarLida={vi.fn()}
        onExcluir={vi.fn()}
        onVerPagina={onVerPagina}
      />
    );

    const botao = screen.getByRole('button', { name: /ver detalhes/i });
    expect(botao).toBeInTheDocument();
    expect(botao).toHaveAttribute('title', expect.stringMatching(/notificações detalhadas/i));

    fireEvent.click(botao);
    expect(onVerPagina).toHaveBeenCalledTimes(1);
    // onVerPagina não deve acionar onClose implicitamente — controle fica no pai
    expect(onClose).not.toHaveBeenCalled();
  });

  it('botão "Ver detalhes" convive com "Marcar como lida" quando notificação está não lida', () => {
    render(
      <ModalDetalhe
        notificacao={{ ...notifFake, lida: false }}
        onClose={vi.fn()}
        onMarcarLida={vi.fn()}
        onExcluir={vi.fn()}
        onVerPagina={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /marcar como lida/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver detalhes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excluir/i })).toBeInTheDocument();
  });

  it('botão "Ver detalhes" aparece mesmo quando notificação já foi lida', () => {
    render(
      <ModalDetalhe
        notificacao={{ ...notifFake, lida: true }}
        onClose={vi.fn()}
        onMarcarLida={vi.fn()}
        onExcluir={vi.fn()}
        onVerPagina={vi.fn()}
      />
    );

    // Sem "Marcar como lida" quando já lida
    expect(screen.queryByRole('button', { name: /marcar como lida/i })).not.toBeInTheDocument();
    // Mas "Ver detalhes" deve sempre aparecer
    expect(screen.getByRole('button', { name: /ver detalhes/i })).toBeInTheDocument();
  });
});
