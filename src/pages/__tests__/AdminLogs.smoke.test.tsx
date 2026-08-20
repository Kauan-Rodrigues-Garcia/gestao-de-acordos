/**
 * AdminLogs.smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A tela de Logs 2.0 monta e mostra o que prometeu.
 *
 * O que este arquivo trava, em ordem de importância:
 *
 *   1. **A frase pronta aparece, não a ação crua.** Era o defeito central da
 *      versão 1.0 ("UPDATE" numa coluna, `JSON.stringify(detalhes)` na outra).
 *      Se alguém trocar `log.descricao` pelo `log.acao` na lista, quebra aqui.
 *   2. **Os números vêm do resumo, não da página.** O painel mostra o total do
 *      período (12.340), não o tamanho da lista carregada (2).
 *   3. **O detalhe abre com a tabela de diferenças** — "antes → depois" campo a
 *      campo, que é a pergunta que o log existe para responder.
 *   4. **Autor sobrevive ao desligamento**: log de quem não tem mais perfil
 *      continua mostrando o nome, porque ele está na própria linha.
 *   5. **A retenção só aparece para super_admin**, e exige confirmação digitada.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LogSistema } from '@/lib/supabase';
import type { ResumoLogs } from '@/services/logs.service';
import { RETENCAO_LOGS_DIAS } from '@/lib/logs-catalogo';

// ── Estado controlável pelos testes ─────────────────────────────────────────
let cargo = 'administrador';
const setFiltroMock = vi.fn();
const recarregarMock = vi.fn();

const LOGS: LogSistema[] = [
  {
    id: 'log-1',
    usuario_id: 'u-1',
    usuario_nome: 'Ana Souza',
    usuario_cargo: 'operador',
    acao: 'acordo_status_alterado',
    categoria: 'acordo',
    severidade: 'aviso',
    descricao: 'Mudou o status do acordo NR 12345 — João da Silva de "verificar_pendente" para "pago"',
    tabela: 'acordos',
    registro_id: 'acordo-1',
    alvo_tipo: 'acordo',
    alvo_rotulo: 'NR 12345 — João da Silva',
    campos: ['status', 'valor'],
    antes: { status: 'verificar_pendente', valor: 100 },
    depois: { status: 'pago', valor: 250 },
    detalhes: null,
    origem: 'trigger',
    criado_em: '2026-08-12T14:30:00.000Z',
    empresa_id: 'emp-1',
    // Sem `perfis`: o autor foi desligado e a junção não traz mais nada. O nome
    // tem de vir da própria linha.
  },
  {
    id: 'log-2',
    usuario_id: 'u-2',
    usuario_nome: 'Carlos Admin',
    usuario_cargo: 'administrador',
    acao: 'permissoes_alteradas',
    categoria: 'seguranca',
    severidade: 'critico',
    descricao: 'Alterou permissões do cargo "lider": +ver_logs, −excluir_acordos',
    tabela: 'cargos_permissoes',
    registro_id: 'cargo-1',
    alvo_tipo: 'cargo_permissoes',
    alvo_rotulo: 'lider',
    campos: ['ver_logs', 'excluir_acordos'],
    antes: { ver_logs: false, excluir_acordos: true },
    depois: { ver_logs: true, excluir_acordos: false },
    detalhes: null,
    origem: 'trigger',
    criado_em: '2026-08-12T10:00:00.000Z',
    empresa_id: 'emp-1',
  },
];

const RESUMO: ResumoLogs = {
  total: 12340,
  criticos: 18,
  avisos: 210,
  exclusoes: 47,
  usuariosAtivos: 9,
  automaticos: 3,
  primeiroEm: '2026-08-05T00:00:00.000Z',
  ultimoEm: '2026-08-12T14:30:00.000Z',
  porCategoria: [
    { chave: 'acordo', total: 9000 },
    { chave: 'seguranca', total: 18 },
  ],
  porSeveridade: [{ chave: 'info', total: 12112 }],
  porAcao: [{ chave: 'acordo_alterado', total: 4000 }],
  porUsuario: [{ chave: 'Ana Souza', id: 'u-1', total: 3000 }],
  porTabela: [{ chave: 'acordos', total: 9000 }],
  porDia: [
    { chave: '2026-08-11', total: 500, criticos: 2 },
    { chave: '2026-08-12', total: 900, criticos: 5 },
  ],
  porHora: [{ chave: '14', total: 700 }],
};

// ── Mocks (antes do SUT) ────────────────────────────────────────────────────
// IDENTIDADE ESTÁVEL, e não um literal por chamada. A página tem um
// `useEffect` que depende de `tenantEmpresa`: devolvendo um objeto novo a cada
// render, o efeito redispara, chama `setEmpresas`, e o render seguinte cria outro
// objeto — laço infinito que trava o worker do vitest sem mensagem de asserção
// nenhuma. (Mesma armadilha documentada em AcordoForm.smoke.test.tsx.)
const EMPRESA_FIXA = { id: 'emp-1', nome: 'PaguePlay' };
const EMPRESA_CTX   = { empresa: EMPRESA_FIXA };
const authPorCargo: Record<string, { perfil: { id: string; nome: string; perfil: string } }> = {
  administrador: { perfil: { id: 'u-9', nome: 'Quem Olha', perfil: 'administrador' } },
  super_admin:   { perfil: { id: 'u-9', nome: 'Quem Olha', perfil: 'super_admin' } },
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authPorCargo[cargo],
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    temPermissao: (chave: string) => {
      if (chave === 'expurgar_logs' || chave === 'ver_multiempresa') {
        return cargo === 'super_admin';
      }
      return chave === 'ver_monitoramento_uso';
    },
  }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => EMPRESA_CTX,
}));

vi.mock('@/services/empresas.service', () => ({
  fetchEmpresas: vi.fn().mockResolvedValue([{ id: 'emp-1', nome: 'PaguePlay' }]),
}));

const expurgarLogsMock = vi.fn().mockResolvedValue({ removidos: 412, erro: null });
const exportarLogsCsvMock = vi.fn().mockResolvedValue({ csv: 'a;b', linhas: 2, truncado: false });
const registrarLogMock = vi.fn().mockResolvedValue('log-novo');

vi.mock('@/services/logs.service', () => ({
  exportarLogsCsv: (...a: unknown[]) => exportarLogsCsvMock(...a),
  baixarCsv: vi.fn(),
  expurgarLogs: (...a: unknown[]) => expurgarLogsMock(...a),
  registrarLog: (...a: unknown[]) => registrarLogMock(...a),
  fetchHistoricoRegistro: vi.fn().mockResolvedValue([]),
  LOGS_POR_PAGINA: 50,
  RESUMO_VAZIO: {},
}));

vi.mock('@/hooks/useLogs', async (importOriginal) => {
  // As funções puras (`intervaloDoPeriodo`, `PERIODO_LABEL`) continuam as reais:
  // só o hook de estado é substituído. E o retorno é um objeto ÚNICO, pelo mesmo
  // motivo do bloco acima.
  const orig = await importOriginal<typeof import('@/hooks/useLogs')>();

  // Montado na PRIMEIRA chamada, não aqui: a fábrica do `vi.mock` é içada para o
  // topo do arquivo e `LOGS`/`RESUMO` ainda não existem neste instante
  // ("Cannot access 'LOGS' before initialization"). Depois de montado, é sempre o
  // mesmo objeto — identidade estável, pelo motivo explicado acima.
  let retorno: ReturnType<typeof orig.useLogs> | null = null;

  return {
    ...orig,
    useLogs: () => {
      retorno ??= {
        logs: LOGS,
        resumo: RESUMO,
        opcoes: {
          usuarios: [{ id: 'u-1', nome: 'Ana Souza' }],
          acoes: ['acordo_alterado'],
          tabelas: ['acordos'],
        },
        total: 12340,
        temMais: true,
        carregando: false,
        carregandoMais: false,
        carregandoResumo: false,
        filtros: orig.FILTROS_INICIAIS,
        filtrosAtivos: 0,
        setFiltro: setFiltroMock,
        limparFiltros: vi.fn(),
        carregarMais: vi.fn(),
        recarregar: recarregarMock,
        aoVivo: false,
        setAoVivo: vi.fn(),
        novosDesdeCarga: 0,
        atualizadoEm: new Date('2026-08-12T14:31:00.000Z'),
        filtrosServico: {},
      };
      return retorno;
    },
  };
});

vi.mock('framer-motion', () => ({
  motion: { div: 'div', tr: 'tr' },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import AdminLogs from '@/pages/AdminLogs';

beforeEach(() => {
  cargo = 'administrador';
  setFiltroMock.mockClear();
  recarregarMock.mockClear();
  expurgarLogsMock.mockClear();
  exportarLogsCsvMock.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('AdminLogs 2.0 — painel e lista', () => {
  it('mostra a frase pronta do evento, e não a ação crua', () => {
    render(<AdminLogs />);
    expect(
      screen.getByText(/Mudou o status do acordo NR 12345 — João da Silva/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alterou permissões do cargo "lider"/)).toBeInTheDocument();
  });

  it('mostra os números do PERÍODO, não o tamanho da página carregada', () => {
    render(<AdminLogs />);
    // 12.340 eventos no filtro, com 2 linhas na lista.
    expect(screen.getByText('12.340')).toBeInTheDocument();
    // Pelo cartão, não pelo texto solto: "18" também aparece na barra de
    // categorias (Segurança), e o que este teste garante é o número do painel.
    expect(screen.getByRole('button', { name: /Críticos\s*18/ })).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();   // exclusões
    expect(screen.getByText(/Mostrando 2 de 12\.340 evento/)).toBeInTheDocument();
  });

  it('preserva o autor de quem não tem mais perfil no sistema', () => {
    // `usuario_nome` desnormalizado é o que sobrevive ao ON DELETE SET NULL.
    render(<AdminLogs />);
    expect(screen.getAllByText(/Ana Souza/).length).toBeGreaterThan(0);
  });

  it('destaca a severidade crítica com selo próprio', () => {
    render(<AdminLogs />);
    expect(screen.getAllByText('Crítico').length).toBeGreaterThan(0);
  });

  it('clicar numa categoria do painel aplica o filtro', () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByRole('button', { name: /Segurança 18/ }));
    expect(setFiltroMock).toHaveBeenCalledWith('categoria', 'seguranca');
  });

  it('clicar no cartão de críticos filtra por severidade', () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByRole('button', { name: /Críticos/ }));
    expect(setFiltroMock).toHaveBeenCalledWith('severidade', 'critico');
  });

  it('alterna entre linha do tempo e tabela', () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByTitle('Tabela'));
    // A tabela tem cabeçalho de coluna; a linha do tempo não.
    expect(screen.getByText('O que aconteceu')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Linha do tempo'));
    expect(screen.queryByText('O que aconteceu')).not.toBeInTheDocument();
  });
});

describe('AdminLogs 2.0 — detalhe do evento', () => {
  it('abre o painel lateral com a tabela de antes → depois', async () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByText(/Mudou o status do acordo NR 12345/));

    await waitFor(() => {
      expect(screen.getByText('O que mudou')).toBeInTheDocument();
    });

    // Cabeçalhos do diff.
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Depois')).toBeInTheDocument();
    // Valores formatados: status traduzido e dinheiro em real.
    expect(screen.getByText('Verificar/Pendente')).toBeInTheDocument();
    expect(screen.getAllByText(/250,00/).length).toBeGreaterThan(0);
  });

  it('avisa quando o autor do evento não existe mais', async () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByText(/Mudou o status do acordo NR 12345/));
    await waitFor(() => {
      expect(screen.getByText(/perfil deste autor não existe mais/)).toBeInTheDocument();
    });
  });

  it('permite filtrar por um campo do diff', async () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByText(/Mudou o status do acordo NR 12345/));
    await waitFor(() => expect(screen.getByText('O que mudou')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle(/Ver todos os eventos que mexeram em "Status"/));
    expect(setFiltroMock).toHaveBeenCalledWith('campo', 'status');
  });
});

describe('AdminLogs 2.0 — retenção', () => {
  it('não oferece expurgo para administrador comum', () => {
    cargo = 'administrador';
    render(<AdminLogs />);
    expect(screen.queryByText('Retenção')).not.toBeInTheDocument();
  });

  it('oferece expurgo para super_admin, exigindo confirmação digitada', async () => {
    cargo = 'super_admin';
    render(<AdminLogs />);

    fireEvent.click(screen.getByText('Retenção'));

    const botao = await screen.findByRole('button', { name: /Expurgar eventos antigos/ });
    // Sem digitar EXPURGAR, o botão fica travado — apagar trilha de auditoria não
    // pode acontecer por clique acidental.
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('EXPURGAR'), { target: { value: 'EXPURGAR' } });
    expect(botao).toBeEnabled();

    fireEvent.click(botao);
    // O prazo que o diálogo já vem preenchendo é o da POLÍTICA, não um literal.
    // Era 180 fixo até 17/08/2026, de antes de existir política de retenção —
    // e um diálogo que sugere meio ano quando a regra é 2 anos convida a apagar
    // ano e meio de trilha sem perceber.
    await waitFor(() => {
      expect(expurgarLogsMock).toHaveBeenCalledWith(RETENCAO_LOGS_DIAS, 'emp-1');
    });
  });

  it('recusa retenção abaixo de 30 dias antes de chamar o banco', async () => {
    cargo = 'super_admin';
    render(<AdminLogs />);
    fireEvent.click(screen.getByText('Retenção'));

    const dias = await screen.findByRole('spinbutton');
    fireEvent.change(dias, { target: { value: '5' } });
    fireEvent.change(screen.getByPlaceholderText('EXPURGAR'), { target: { value: 'EXPURGAR' } });

    expect(screen.getByText(/mínimo é 30 dias/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expurgar eventos antigos/ })).toBeDisabled();
    expect(expurgarLogsMock).not.toHaveBeenCalled();
  });
});

describe('AdminLogs 2.0 — exportação', () => {
  it('registra a exportação na própria trilha antes de baixar o arquivo', async () => {
    render(<AdminLogs />);
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));

    await waitFor(() => {
      expect(exportarLogsCsvMock).toHaveBeenCalled();
    });
    // Levar auditoria para fora do sistema é, ele mesmo, um evento de auditoria.
    await waitFor(() => {
      expect(registrarLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'logs_exportados', categoria: 'seguranca' }),
      );
    });
  });
});
