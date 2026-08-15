/**
 * BotaoFechamento.test.tsx
 *
 * Uma regra só, e ela é de calendário: o botão existe quando o mês existe como
 * fechamento. Mês corrente não tem fechamento, tem parcial — e um HTML parcial
 * com o mesmo nome de arquivo e o mesmo cabeçalho do definitivo é indistinguível
 * dele depois de encaminhado no WhatsApp.
 *
 * O mês corrente sai de `mesAtual()` de verdade, sem congelar relógio: o teste
 * pergunta "o que é hoje?" à mesma função que a produção usa, então ele continua
 * verdadeiro em qualquer dia em que rodar — inclusive na virada do mês, que é
 * exatamente quando um teste com data cravada começaria a mentir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mesAtual, deslocarMes } from '@/lib/mesReferencia';

// ── Mocks (ANTES do SUT) ────────────────────────────────────────────────────

let perfilValue: { id: string; nome: string; perfil: string; setor_id: string | null } | null = {
  id: 'u-1', nome: 'Fulana', perfil: 'lider', setor_id: 's-1',
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: perfilValue }) }));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'e-1', nome: 'BookPlay' }, tenantSlug: 'bookplay' }),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    temPermissao: () => false,
    temPermissaoExplicita: () => false,
  }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ slug: 'bookplay', isPaguePlay: false }),
}));

const baixarMock = vi.fn().mockResolvedValue({ ok: true, nomeArquivo: 'x.html' });
vi.mock('@/services/fechamento/baixarFechamento', () => ({
  baixarRelatorioFechamento: (...a: unknown[]) => baixarMock(...a),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(), success: vi.fn(), loading: vi.fn(() => 'id'), warning: vi.fn(),
  },
}));

import { BotaoFechamento } from './BotaoFechamento';

const botao = () => screen.queryByRole('button', { name: /fechamento/i });

beforeEach(() => {
  perfilValue = { id: 'u-1', nome: 'Fulana', perfil: 'lider', setor_id: 's-1' };
});

describe('BotaoFechamento — só aparece em mês fechado', () => {
  it('não renderiza nada no mês corrente', () => {
    const { container } = render(<BotaoFechamento mes={mesAtual()} />);
    expect(botao()).toBeNull();
    // Nem um invólucro vazio: o container do painel usa `gap`, e um filho vazio
    // abriria um buraco na faixa de botões.
    expect(container.firstChild).toBeNull();
  });

  it('renderiza no mês passado', () => {
    render(<BotaoFechamento mes={deslocarMes(mesAtual(), -1)} />);
    expect(botao()).not.toBeNull();
  });

  it('renderiza em mês antigo qualquer', () => {
    render(<BotaoFechamento mes="2020-01" />);
    expect(botao()).not.toBeNull();
  });

  /**
   * Quem passa pelo cadeado para EDITAR mês fechado continua sem botão em mês
   * aberto. São perguntas diferentes: o cadeado é sobre autoridade, o botão é
   * sobre o arquivo existir.
   */
  it('super_admin também não vê o botão em mês aberto', () => {
    perfilValue = { id: 'u-9', nome: 'Root', perfil: 'super_admin', setor_id: null };
    render(<BotaoFechamento mes={mesAtual()} />);
    expect(botao()).toBeNull();
  });

  it('mês vazio não vira botão', () => {
    // `''` normaliza para algo menor que o mês corrente em comparação de texto;
    // o guarda tem de barrar assim mesmo, senão o seletor ainda vazio na
    // primeira renderização pisca um botão que baixa um relatório sem mês.
    const { container } = render(<BotaoFechamento mes="" />);
    expect(container.firstChild).toBeNull();
  });
});
