/**
 * BolhaChat — a janela do chat vem sob demanda.
 *
 * A bolha fechada monta em toda página; a janela (lista, conversa, monitor,
 * diálogos) saiu do pacote de entrada para `janela.ts`. O que este arquivo
 * trava: fechada, a janela não é baixada; passar o mouse já começa o download;
 * clicar mostra o cabeçalho na hora e o corpo quando o pedaço chega.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { estado, toastErro } = vi.hoisted(() => ({
  estado: { janelaBaixada: 0 },
  toastErro: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', nome: 'Eu' } }) }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }),
}));
vi.mock('@/hooks/useChat', () => {
  const chat = {
    naoLidasTotal: 0, conversas: [], disparos: [], mensagens: [],
    aberta: null, conversaAberta: null,
    carregando: false, carregandoMais: false, carregandoMensagens: false,
    erroMensagens: null, temMais: false,
    abrir: () => {}, abrirCom: async () => null, recarregar: () => {},
    enviar: async () => {}, reenviar: async () => {}, verAnteriores: async () => {},
  };
  return { useChat: () => chat };
});
vi.mock('@/hooks/useChatPresenca', () => {
  const presenca = { online: new Set(), digitando: new Set(), gravando: new Set(), avisarAtividade: () => {} };
  return { useChatPresenca: () => presenca };
});
vi.mock('@/services/chat/chat.service', () => ({
  possoUsarOChat: async () => true,
  apagarConversa: async () => ({}), buscarConversa: async () => null,
  fixarConversa: async () => ({}), rotuloAnexo: () => '', quemCurtiu: async () => [],
  urlDoAnexo: async () => null, urlDoAnexoEmCache: () => null,
}));
vi.mock('@/lib/notificacao-chat', () => ({
  deveNotificarMensagemChat: () => false,
  executarNotificacaoChatUmaVez: () => {},
  tituloComMensagensNaoLidas: () => 'Gestão',
}));
vi.mock('@/lib/som-chat', () => ({ prepararSomChat: () => {}, tocarSomChat: () => {} }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: toastErro, success: vi.fn() } }));

/*
 * O download é contado no CARREGADOR, e não na factory do mock: o Vitest
 * guarda o módulo mockado entre `resetModules`, então uma factory contaria só
 * a primeira vez do arquivo — e o teste dependeria da ordem. O carregador é
 * recriado a cada import novo da BolhaChat, como a aba recém-aberta.
 */
vi.mock('@/lib/sobDemanda', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/sobDemanda')>();
  return {
    ...real,
    comNovaTentativa: <T,>(carregar: () => Promise<T>, esperaMs?: number) =>
      real.comNovaTentativa(() => { estado.janelaBaixada++; return carregar(); }, esperaMs),
  };
});

vi.mock('@/components/Chat/janela', () => {
  const nada = () => null;
  return {
    ListaConversas: () => <div>lista de conversas</div>,
    Conversa: nada, PainelMonitor: nada, DisparoDialog: nada,
    NovaConversaDialog: nada, NovoGrupoDialog: nada, ConfigGrupoDialog: nada,
    GaleriaDialog: nada, BoasVindasChat: nada,
  };
});

async function montarBolha() {
  // Módulo novo por teste: o carregador guarda a promessa, e um teste não pode
  // herdar a janela que o anterior já baixou.
  vi.resetModules();
  const { BolhaChat } = await import('./BolhaChat');
  render(<BolhaChat />);
  return screen.findByRole('button', { name: 'Abrir o chat' });
}

beforeEach(() => {
  estado.janelaBaixada = 0;
  toastErro.mockClear();
  // Ocioso que nunca chega: aqui se testa o que o USUÁRIO dispara.
  vi.stubGlobal('requestIdleCallback', () => 0);
  vi.stubGlobal('cancelIdleCallback', () => {});
});

describe('BolhaChat — janela sob demanda', () => {
  it('fechada, a bolha aparece e a janela não é baixada', async () => {
    await montarBolha();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(estado.janelaBaixada).toBe(0);
  });

  it('passar o mouse na bolha já começa o download', async () => {
    const bolha = await montarBolha();
    fireEvent.mouseEnter(bolha);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(estado.janelaBaixada).toBe(1);
  });

  it('clicar abre a janela: cabeçalho na hora, corpo quando o pedaço chega', async () => {
    const bolha = await montarBolha();
    fireEvent.click(bolha);

    expect(screen.getByRole('button', { name: 'Fechar o chat' })).toBeInTheDocument();
    expect(await screen.findByText('lista de conversas')).toBeInTheDocument();
    expect(estado.janelaBaixada).toBe(1);
    expect(toastErro).not.toHaveBeenCalled();
  });
});
