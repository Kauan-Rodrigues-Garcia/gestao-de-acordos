import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'eu' } }),
}));

// A conversa pergunta ao painel quem escreve em grupo travado; o hook real
// puxa EmpresaProvider, que este teste de rolagem nao monta.
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }),
}));

vi.mock('@/hooks/useGravadorAudio', () => ({
  useGravadorAudio: () => ({
    gravando: false, segundos: 0, erro: null, suportado: false,
    iniciar: vi.fn(), parar: vi.fn(), cancelar: vi.fn(),
  }),
}));

vi.mock('@/services/chat/chat.service', () => ({
  LIMITE_ANEXO: 10 * 1024 * 1024,
  subirAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
  urlDoAnexoEmCache: vi.fn(() => null),
  curtirMensagem: vi.fn(async () => ({ total: 0, erro: null })),
  // A conversa carrega as curtidas da pagina inteira ao montar. Sem o dublê o
  // efeito estoura e o teste falha por um motivo que nao e a rolagem.
  curtidasDasMensagens: vi.fn(async () => new Map()),
  quemCurtiu: vi.fn(async () => []),
}));

// Grupo: a conversa busca os membros para nomear os autores dos baloes.
vi.mock('@/services/chat/grupos.service', () => ({
  listarMembros: vi.fn(async () => []),
}));

import { Conversa } from './Conversa';
import { toast } from 'sonner';
import { curtidasDasMensagens } from '@/services/chat/chat.service';
import type { ConversaChat, MensagemChat } from '@/services/chat/chat.service';

const conversa: ConversaChat = {
  id: 'c-1', outro_id: 'ana', outro_nome: 'Ana', outro_usuario: 'ana',
  outro_foto: null, outro_empresa: null, ultima_mensagem_em: null,
  ultima_atividade_em: null, em_historico: false,
  ultimo_texto: null, ultimo_autor_id: null, nao_lidas: 0,
  leitura_do_outro: null, entrega_minha: null, entrega_do_outro: null,
  outro_perfil: null,
  tipo: 'direta', participantes: 1, sou_admin: false, somente_lideranca: false,
};

const base = {
  conversa,
  online: true,
  expandido: false,
  onEnviar: vi.fn(async () => null),
  onDigitando: vi.fn(),
  onGravando: vi.fn(),
  gravando: false,
  temMais: false,
  carregandoMais: false,
  onVerAnteriores: vi.fn(),
};

describe('rolagem viva da conversa', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true, value: scrollTo,
    });
  });

  it('desce quando o balão de digitando aparece e quando chega mensagem', () => {
    const tela = render(<Conversa {...base} mensagens={[]} digitando={false} />);
    scrollTo.mockClear();

    tela.rerender(<Conversa {...base} mensagens={[]} digitando />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });

    scrollTo.mockClear();
    const mensagem: MensagemChat = {
      id: 'm-1', conversa_id: 'c-1', autor_id: 'ana', texto: 'Oi', anexos: [],
      criado_em: '2026-08-26T16:00:00Z', disparo_id: null, expurgado_em: null,
      respondendo_id: null, curtida_em: null, sistema: null, sistema_dados: null,
    };
    tela.rerender(<Conversa {...base} mensagens={[mensagem]} digitando={false} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });

  it('carregar curtidas históricas não notifica nem provoca nova rolagem', async () => {
    const m = { id: 'm-antiga', conversa_id: 'c-1', autor_id: 'eu', texto: 'Ontem', anexos: [],
      criado_em: '2026-08-26T16:00:00Z', curtida_em: '2026-08-26T17:00:00Z', curtida_por: 'ana' } as MensagemChat;
    let resolver!: (m: Map<string, unknown>) => void;
    vi.mocked(curtidasDasMensagens).mockReturnValueOnce(new Promise(r => { resolver = r; }));
    const tela = render(<Conversa {...base} mensagens={[m]} digitando={false} />);
    scrollTo.mockClear();
    await act(async () => { resolver(new Map([[m.id, { total: 1, euCurti: false }]])); });
    expect(toast).not.toHaveBeenCalled();
    tela.rerender(<Conversa {...base} mensagens={[{ ...m, curtida_por: 'bia' }]} digitando={false} />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('libera o campo imediatamente e não apaga a próxima mensagem quando o envio termina', async () => {
    let confirmar!: (erro: string | null) => void;
    const enviar = vi.fn(() => new Promise<string | null>(r => { confirmar = r; }));
    render(<Conversa {...base} onEnviar={enviar} mensagens={[]} digitando={false} />);
    const campo = screen.getByRole('textbox');
    fireEvent.change(campo, { target: { value: 'Primeira' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar', exact: true }));
    expect(enviar).toHaveBeenCalledWith('Primeira', [], null, []);
    expect(campo).toHaveValue('');
    fireEvent.change(campo, { target: { value: 'Segunda' } });
    await act(async () => confirmar(null));
    expect(campo).toHaveValue('Segunda');
  });
});
