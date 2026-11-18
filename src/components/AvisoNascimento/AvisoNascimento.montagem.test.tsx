import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisoNascimento } from './AvisoNascimento';
import { conteudoDoBanco } from './conteudo';

const h = vi.hoisted(() => ({
  perfil: { id: 'eu', setor_id: 'setor-a', empresa_id: 'empresa' } as { id: string; setor_id: string; empresa_id: string } | null,
  lerMeus: vi.fn(),
  marcarVi: vi.fn(),
  salvarRecado: vi.fn(),
  urlDaFoto: vi.fn(),
  impersonando: null as object | null,
  sinal: null as null | { onMudou: (s: { tabela: string }) => void },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: h.perfil }) }));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: () => h.impersonando }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: (_n: string, _e: string, o: typeof h.sinal) => { h.sinal = o; return () => undefined; } }));
vi.mock('./banco', () => ({
  faltaMigration: () => false, mensagemDoErro: (e: Error) => e.message,
  lerMeus: h.lerMeus, marcarVi: h.marcarVi, salvarRecado: h.salvarRecado, urlDaFoto: h.urlDaFoto,
}));
vi.mock('./TelaNascimento', () => ({
  default: ({ onAberto, onFim }: { onAberto: () => void; onFim: () => void }) => (
    <div><button onClick={onAberto}>abrir</button><button onClick={onFim}>fim</button></div>
  ),
}));

const aviso = (vi_ = false) => ({ id: 'a1', conteudo: conteudoDoBanco({}), foto_caminho: 'a1/f.jpg', pode_recado: true, vi: vi_, meu_recado: null });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.perfil = { id: 'eu', setor_id: 'setor-a', empresa_id: 'empresa' };
  h.impersonando = null;
  h.sinal = null;
  h.lerMeus.mockResolvedValue([]);
  h.urlDaFoto.mockResolvedValue('blob:foto');
  h.marcarVi.mockResolvedValue(undefined);
  vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve(); });
});

describe('AvisoNascimento', () => {
  it('sem aviso para a pessoa, não mostra nada', async () => {
    const { container } = render(<AvisoNascimento />);
    await waitFor(() => expect(h.lerMeus).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('o sinal só faz reler no setor certo', async () => {
    render(<AvisoNascimento />);
    await waitFor(() => expect(h.sinal).not.toBeNull());
    await waitFor(() => expect(h.lerMeus).toHaveBeenCalledTimes(1));
    act(() => h.sinal?.onMudou({ tabela: 'aviso_nascimento:setor-b' }));
    expect(h.lerMeus).toHaveBeenCalledTimes(1);
    act(() => h.sinal?.onMudou({ tabela: 'aviso_nascimento:setor-a' }));
    expect(h.lerMeus).toHaveBeenCalledTimes(2);
  });

  it('abre quando liberado e marca «viu» só ao abrir o livro', async () => {
    h.lerMeus.mockResolvedValue([aviso()]);
    render(<AvisoNascimento />);
    const abrir = await screen.findByText('abrir', {}, { timeout: 2500 });
    expect(h.marcarVi).not.toHaveBeenCalled();
    act(() => abrir.click());
    expect(h.marcarVi).toHaveBeenCalledWith('a1');
    act(() => screen.getByText('fim').click());
    expect(screen.queryByText('abrir')).toBeNull();
  });

  it('quem já viu não recebe de novo', async () => {
    h.lerMeus.mockResolvedValue([aviso(true)]);
    render(<AvisoNascimento />);
    await waitFor(() => expect(h.lerMeus).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 900));
    expect(h.urlDaFoto).not.toHaveBeenCalled();
  });

  it('super admin entrando como outra pessoa não recebe nem marca nada', async () => {
    h.impersonando = { alvoId: 'x' };
    render(<AvisoNascimento />);
    await new Promise(r => setTimeout(r, 30));
    expect(h.lerMeus).not.toHaveBeenCalled();
  });
});
