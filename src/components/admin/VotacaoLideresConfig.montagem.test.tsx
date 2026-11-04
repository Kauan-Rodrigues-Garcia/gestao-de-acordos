/**
 * O card da Votação da Liderança MONTA e faz o que prometeu? — teste de fumaça
 * com um cadastro de mentira (o padrão da casa: `ListaPessoas.montagem.test`).
 *
 * Confere o que foi pedido em 04/11/2026: nenhum setor vem marcado; BookPlay e
 * PaguePlay separados de Vendas; contas como «Suporte Play 2» saem sozinhas;
 * dá para incluir à mão alguém da diretoria (sem setor); e a demonstração abre
 * com essa pessoa na grade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';

vi.mock('framer-motion', () => {
  const limpar = (p: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout'].includes(k)) r[k] = v;
    }
    return r;
  };
  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => ({ children, ...p }: { children?: React.ReactNode }) => {
        const Tag = tag as unknown as React.ElementType;
        return <Tag {...limpar(p)}>{children}</Tag>;
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', perfil: 'super_admin' } }) }));

const pessoa = (id: string, nome: string, setorId: string | null, grupo: string, produto: Participante['produto'], perfil = 'lider', setor = ''): Participante => ({
  id, nome, foto: null, perfil, setor: setor || (setorId ? `Setor ${setorId}` : 'Sem setor'), setorId, grupo, produto, empresa: 'Empresa',
});

const PESSOAS: Participante[] = [
  pessoa('a', 'Ana Souza', 's1', 'marca:bookplay', 'cobranca', 'lider', 'Play 1'),
  pessoa('b', 'Bruno Lima', 's1', 'marca:bookplay', 'cobranca', 'lider', 'Play 1'),
  pessoa('c', 'Carla Mendes', 's2', 'marca:bookplay', 'cobranca', 'lider', 'Play 2'),
  pessoa('conta', 'Suporte Play 2', 's2', 'marca:bookplay', 'cobranca', 'lider', 'Play 2'),
  pessoa('m', 'Mariana Freitas', 's3', 'marca:pagueplay', 'cobranca', 'lider', 'Conecta Play'),
  pessoa('v', 'Vitor Vendas', 's4', 'empresa:eV', 'comercial', 'lider', 'Vendas 1'),
  pessoa('dir', 'Cleber Diretor', null, '', 'cobranca', 'diretoria'),
];
const GRUPOS: GrupoDaVotacao[] = [
  { chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', produto: 'cobranca', setores: [
    { id: 's1', nome: 'Play 1', grupo: 'marca:bookplay', produto: 'cobranca' },
    { id: 's2', nome: 'Play 2', grupo: 'marca:bookplay', produto: 'cobranca' },
  ] },
  { chave: 'marca:pagueplay', rotulo: 'PaguePlay · Marília', produto: 'cobranca', setores: [
    { id: 's3', nome: 'Conecta Play', grupo: 'marca:pagueplay', produto: 'cobranca' },
  ] },
  { chave: 'empresa:eV', rotulo: 'Comercial', produto: 'comercial', setores: [
    { id: 's4', nome: 'Vendas 1', grupo: 'empresa:eV', produto: 'comercial' },
  ] },
];

vi.mock('@/components/VotacaoLideres/participantes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/VotacaoLideres/participantes')>()),
  lerParticipantes: () => Promise.resolve({ pessoas: PESSOAS, grupos: GRUPOS }),
}));

// O jsdom não tem ResizeObserver nem tamanho de tela: a grade mede 1280×700.
class RO { observe() {} disconnect() {} unobserve() {} }
Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });

const { default: VotacaoLideresConfig } = await import('./VotacaoLideresConfig');

const entra = () => screen.getByText(/^2\. Quem entra/).closest('section')!;

describe('VotacaoLideresConfig', () => {
  beforeEach(() => localStorage.clear());

  it('abre sem setor marcado, e a demonstração travada', async () => {
    render(<VotacaoLideresConfig />);
    expect(await screen.findByText('BookPlay · Birigui')).toBeTruthy();
    expect(screen.getByText('PaguePlay · Marília')).toBeTruthy();
    expect(screen.queryByText('Comercial')).toBeNull(); // Vendas fica em outra aba
    expect(screen.getByText(/Escolha os setores que participam/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Abrir a demonstração/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marcar BookPlay traz os líderes e tira a conta «Suporte Play 2»', async () => {
    render(<VotacaoLideresConfig />);
    const grupo = (await screen.findByText('BookPlay · Birigui')).parentElement!;
    fireEvent.click(within(grupo).getByRole('button', { name: 'Marcar todos' }));
    const sec = entra();
    expect(within(sec).getByText(/3 na votação/)).toBeTruthy();
    expect(within(sec).getByText(/1 conta tirada/)).toBeTruthy();
    expect(within(sec).getByText('Contas que não parecem pessoa')).toBeTruthy();
    expect(within(sec).queryByText('Mariana Freitas')).toBeNull(); // PaguePlay não marcado
  });

  it('Vendas é outra votação: só os setores de Vendas', async () => {
    render(<VotacaoLideresConfig />);
    await screen.findByText('BookPlay · Birigui');
    fireEvent.click(screen.getByRole('radio', { name: /Vendas/ }));
    expect(screen.getByText('Comercial')).toBeTruthy();
    expect(screen.queryByText('BookPlay · Birigui')).toBeNull();
  });

  it('inclui alguém da diretoria à mão e ele aparece na votação', async () => {
    render(<VotacaoLideresConfig />);
    const grupo = (await screen.findByText('BookPlay · Birigui')).parentElement!;
    fireEvent.click(within(grupo).getByRole('button', { name: 'Marcar todos' }));
    fireEvent.change(screen.getByLabelText('Buscar pessoa para incluir'), { target: { value: 'cleb' } });
    fireEvent.click(screen.getByRole('button', { name: /Cleber Diretor/ }));
    expect(within(entra()).getByText(/4 na votação/)).toBeTruthy();
    expect(screen.getByLabelText('Incluídos à mão').textContent).toContain('Cleber');

    const abrir = screen.getByRole('button', { name: /Abrir a demonstração/ }) as HTMLButtonElement;
    await waitFor(() => expect(abrir.disabled).toBe(false));
    fireEvent.click(abrir);
    fireEvent.click(await screen.findByRole('button', { name: /Começar/ }));
    // Formato padrão: todas as categorias juntas; toca numa e abre o seletor.
    fireEvent.click(await screen.findByRole('button', { name: /Quem é o líder mais comunicativo\? — sem escolha/ }));
    const grade = await screen.findByRole('radiogroup', { name: 'Quem é o líder mais comunicativo?' });
    const nomes = within(grade).getAllByRole('radio').map(b => b.getAttribute('aria-label'));
    expect(nomes).toContain('Cleber Diretor');
    expect(nomes).not.toContain('Suporte Play 2');
    expect(within(grade).getByText('Diretoria')).toBeTruthy(); // sem setor: aparece o cargo
  });

  it('categorias juntas: escolhe, volta ao quadro, e o escolhido trava nas outras', async () => {
    render(<VotacaoLideresConfig />);
    const grupo = (await screen.findByText('BookPlay · Birigui')).parentElement!;
    fireEvent.click(within(grupo).getByRole('button', { name: 'Marcar todos' }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir a demonstração/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Começar/ }));

    const categorias = await screen.findByRole('list', { name: 'Categorias' });
    expect(within(categorias).getAllByRole('button')).toHaveLength(24); // todas juntas

    fireEvent.click(within(categorias).getByRole('button', { name: /mais comunicativo\? — sem escolha/ }));
    fireEvent.click(within(await screen.findByRole('radiogroup', { name: 'Quem é o líder mais comunicativo?' }))
      .getByRole('radio', { name: 'Bruno Lima' }));
    // Volta sozinho ao quadro, com o Bruno no cartão.
    expect(await screen.findByRole('button', { name: /mais comunicativo\? — escolhido: Bruno Lima/ })).toBeTruthy();
    // 3 participantes (Ana vota): 2 colegas, então 2 categorias para enviar.
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 de 2 categorias escolhidas')).toBeTruthy();
    const enviar = () => screen.getByRole('button', { name: /Faltam|Enviar meus votos/ }) as HTMLButtonElement;
    expect(enviar().disabled).toBe(true);
    expect(enviar().textContent).toContain('Faltam 1');

    fireEvent.click(screen.getByRole('button', { name: /mais paciente\? — sem escolha/ }));
    const paciente = await screen.findByRole('radiogroup', { name: 'Quem é o líder mais paciente?' });
    const bruno = within(paciente).getByRole('radio', { name: /^Bruno Lima \(já escolhido em/ }) as HTMLButtonElement;
    expect(bruno.disabled).toBe(true);

    // Preenchida a última possível, o envio destrava.
    fireEvent.click(within(paciente).getByRole('radio', { name: 'Carla Mendes' }));
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Quem é o líder mais paciente?' })).toBeNull());
    expect(enviar().disabled).toBe(false);
    fireEvent.click(enviar());
    expect(await screen.findByText('Votos enviados!')).toBeTruthy();
  });

  it('o card do canto (demonstração) aparece e abre a votação', async () => {
    render(<VotacaoLideresConfig />);
    const grupo = (await screen.findByText('BookPlay · Birigui')).parentElement!;
    fireEvent.click(within(grupo).getByRole('button', { name: 'Marcar todos' }));
    fireEvent.click(screen.getByRole('button', { name: /Ver o card: votar/ }));
    expect(screen.getByText('Sua vez de votar!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Votação da Liderança/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Votar agora/ }));
    expect(await screen.findByRole('button', { name: /Começar/ })).toBeTruthy();
  });

  it('tirar o incluído à mão devolve a contagem', async () => {
    render(<VotacaoLideresConfig />);
    const grupo = (await screen.findByText('BookPlay · Birigui')).parentElement!;
    fireEvent.click(within(grupo).getByRole('button', { name: 'Marcar todos' }));
    fireEvent.change(screen.getByLabelText('Buscar pessoa para incluir'), { target: { value: 'cleb' } });
    fireEvent.click(screen.getByRole('button', { name: /Cleber Diretor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Cleber Diretor da votação' }));
    expect(within(entra()).getByText(/3 na votação/)).toBeTruthy();
  });
});
