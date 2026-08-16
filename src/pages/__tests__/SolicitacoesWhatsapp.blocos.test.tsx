/**
 * SolicitacoesWhatsapp.blocos.test.tsx
 *
 * A aba 2.0 divide os pedidos em quatro blocos. Estes testes fixam as duas
 * coisas que a divisão precisa garantir e que `agrupamento.test.ts` sozinho não
 * alcança, porque são decisões da PÁGINA:
 *
 *   1. o agrupamento por pessoa acontece SEM filtro de equipe — era esse o
 *      defeito relatado: a lista só se separava por usuário quando uma equipe
 *      era escolhida, e a aba abre sem filtro nenhum;
 *   2. a mesma lista produz telas diferentes para quem atende e para quem só
 *      acompanha os próprios pedidos, sem que exista um ramo por papel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const EU   = 'u-eu';
const JOAO = { id: 'u-joao', nome: 'João Silva',  foto_url: null };
const ANA  = { id: 'u-ana',  nome: 'Ana Paula',   foto_url: null };
const BIA  = { id: 'u-bia',  nome: 'Bia Nogueira', foto_url: null };

/** Quem está logado. Cada bloco de teste ajusta antes de renderizar. */
const sessao = vi.hoisted(() => ({ perfil: 'lider' as string, id: 'u-eu' }));
/** A lista que o hook devolve. */
const lista = vi.hoisted(() => ({ itens: [] as unknown[] }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    perfil: {
      id: sessao.id, nome: 'Quem Testa', perfil: sessao.perfil,
      empresa_id: 'emp', setor_id: 'set-1', equipe_id: null,
    },
  }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'emp', nome: 'PaguePlay' }, tenantSlug: 'pagueplay' }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, temPermissaoExplicita: () => false }),
}));
vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: true, slug: 'pagueplay' }),
}));

vi.mock('@/hooks/useSolicitacoesWhatsapp', () => ({
  useSolicitacoesWhatsapp: () => ({
    solicitacoes: lista.itens,
    loading: false, dbAtiva: true, erro: null,
    naoLidas: {}, totaisMensagens: {},
    recarregar: vi.fn(), limparNaoLidas: vi.fn(),
  }),
  useResponsaveisAtendimento: () => ({ responsaveis: [], recarregarResponsaveis: vi.fn() }),
  useChatSolicitacao: () => ({
    mensagens: [], leituras: [], loading: false, enviando: false,
    digitando: null, enviar: vi.fn(), avisarDigitando: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  },
}));

// O painel de responsáveis e o formulário são telas próprias; aqui só atrapalham.
vi.mock('../SolicitacoesWhatsapp/PainelResponsaveis', () => ({
  PainelResponsaveis: () => null,
}));
vi.mock('../SolicitacoesWhatsapp/FormNovaSolicitacao', () => ({
  FormNovaSolicitacao: () => null,
}));

import SolicitacoesWhatsapp from '../SolicitacoesWhatsapp';

function ped(over: Record<string, unknown> & { id: string }) {
  return {
    empresa_id: 'emp', solicitante_id: EU,
    setor_id: 'set-1', equipe_id: null,
    codigo_cliente: '500' + over.id, nome_cliente: 'CLIENTE ' + over.id,
    estado_uf: 'PB', whatsapp: '83999990000',
    categoria: 'proposta', mensagem: 'mensagem',
    status: 'pendente', responsavel_id: null,
    iniciado_em: null, finalizado_em: null,
    criado_em: '2026-08-10T12:00:00Z', atualizado_em: '2026-08-10T12:00:00Z',
    solicitante: null, responsavel: null,
    ...over,
  };
}

beforeEach(() => {
  sessao.perfil = 'lider';
  sessao.id = EU;
  lista.itens = [];
});

describe('a aba separa por usuário SEM filtro de equipe', () => {
  /** O defeito relatado, em forma de teste. */
  it('a fila aparece agrupada por quem pediu, com a aba recém-aberta', async () => {
    lista.itens = [
      ped({ id: 'a', solicitante_id: JOAO.id, solicitante: JOAO }),
      ped({ id: 'b', solicitante_id: JOAO.id, solicitante: JOAO }),
      ped({ id: 'c', solicitante_id: ANA.id,  solicitante: ANA  }),
    ];
    render(<SolicitacoesWhatsapp />);

    expect(await screen.findByText('Aguardando alguém')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Ana Paula')).toBeInTheDocument();
  });

  /** Um cabeçalho com o nome de quem já está no topo da tela não informa nada. */
  it('com um solicitante só, não cria cabeçalho de grupo', async () => {
    lista.itens = [
      ped({ id: 'a', solicitante_id: JOAO.id, solicitante: JOAO }),
      ped({ id: 'b', solicitante_id: JOAO.id, solicitante: JOAO }),
    ];
    render(<SolicitacoesWhatsapp />);

    await screen.findByText('Aguardando alguém');
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument();
  });
});

describe('quem atende', () => {
  beforeEach(() => {
    lista.itens = [
      ped({ id: 'meu',   status: 'em_andamento', responsavel_id: EU }),
      ped({ id: 'fila' }),
      ped({ id: 'dela',  status: 'em_andamento', responsavel_id: ANA.id, responsavel: ANA }),
      ped({ id: 'dele',  status: 'em_andamento', responsavel_id: BIA.id, responsavel: BIA }),
      ped({ id: 'pronto', status: 'feito', responsavel_id: ANA.id, responsavel: ANA }),
    ];
  });

  it('vê a própria mesa separada da dos outros', async () => {
    render(<SolicitacoesWhatsapp />);
    expect(await screen.findByText('Comigo agora')).toBeInTheDocument();
    expect(screen.getByText('Com outra pessoa')).toBeInTheDocument();
  });

  /**
   * Os dois blocos frios nascem fechados — e fechados NÃO montam o conteúdo.
   * Com 128 concluídos em produção, montá-los só para escondê-los era o custo
   * que pesava ao abrir a aba.
   */
  it('os blocos frios nascem recolhidos, sem montar os cards', async () => {
    render(<SolicitacoesWhatsapp />);
    await screen.findByText('Comigo agora');

    expect(screen.getByRole('button', { name: /Com outra pessoa/ }))
      .toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Concluídos/ }))
      .toHaveAttribute('aria-expanded', 'false');
    // Ana só aparece dentro de "Com outra pessoa", que está fechado.
    expect(screen.queryByText('Ana Paula')).not.toBeInTheDocument();
  });

  it('abrindo "Com outra pessoa", os atendimentos vêm agrupados por quem atende', async () => {
    render(<SolicitacoesWhatsapp />);
    await screen.findByText('Comigo agora');

    await userEvent.click(screen.getByRole('button', { name: /Com outra pessoa/ }));

    expect(await screen.findByText('Ana Paula')).toBeInTheDocument();
    expect(screen.getByText('Bia Nogueira')).toBeInTheDocument();
  });
});

describe('quem só acompanha os próprios pedidos', () => {
  beforeEach(() => {
    sessao.perfil = 'operador';
    sessao.id = 'u-solicitante';
    lista.itens = [
      ped({ id: 'x', solicitante_id: 'u-solicitante', status: 'em_andamento', responsavel_id: JOAO.id, responsavel: JOAO }),
      ped({ id: 'y', solicitante_id: 'u-solicitante', status: 'em_andamento', responsavel_id: JOAO.id, responsavel: JOAO }),
      ped({ id: 'z', solicitante_id: 'u-solicitante', status: 'em_andamento', responsavel_id: ANA.id,  responsavel: ANA  }),
    ];
  });

  /**
   * Esta pessoa nunca é responsável — ser responsável dá visão geral. O bloco
   * some sozinho, sem `if` de papel em lugar nenhum.
   */
  it('não ganha o bloco "Comigo agora"', async () => {
    render(<SolicitacoesWhatsapp />);
    await screen.findByText('Quem está atendendo');
    expect(screen.queryByText('Comigo agora')).not.toBeInTheDocument();
  });

  /** "João está com 2 pedidos seus" — o pedido original, em forma de teste. */
  it('vê os próprios pedidos agrupados por quem está atendendo', async () => {
    render(<SolicitacoesWhatsapp />);
    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Ana Paula')).toBeInTheDocument();
  });

  /** É a única coisa em andamento que essa pessoa tem: esconder seria perverso. */
  it('o bloco nasce ABERTO para ela, ao contrário de quem atende', async () => {
    render(<SolicitacoesWhatsapp />);
    expect(await screen.findByRole('button', { name: /Quem está atendendo/ }))
      .toHaveAttribute('aria-expanded', 'true');
  });
});

describe('contadores', () => {
  it('mostram zero em vez de sumir junto com o bloco vazio', async () => {
    lista.itens = [ped({ id: 'so-um' })];
    render(<SolicitacoesWhatsapp />);

    // Sem nada em andamento, os blocos "Comigo" e "Com outros" não existem…
    await screen.findByText('Aguardando alguém');
    expect(screen.queryByText('Comigo agora')).not.toBeInTheDocument();
    // …mas os números continuam na tela.
    expect(screen.getByText('Comigo')).toBeInTheDocument();
    expect(screen.getByText('Com outros')).toBeInTheDocument();
  });

  /**
   * Em 16/08/2026 eram 32 atrasados de 59 em andamento. O contador só acende
   * quando existe atraso — senão seria mais um número cinza entre quatro.
   */
  it('"Atrasados" não aparece quando está tudo no prazo', async () => {
    lista.itens = [ped({ id: 'novo', criado_em: new Date().toISOString() })];
    render(<SolicitacoesWhatsapp />);
    await screen.findByText('Aguardando alguém');
    expect(screen.queryByText('Atrasados')).not.toBeInTheDocument();
  });

  it('"Atrasados" acende para o que passou de 5 dias', async () => {
    const antigo = new Date(Date.now() - 9 * 86_400_000).toISOString();
    lista.itens = [ped({ id: 'velho', criado_em: antigo })];
    render(<SolicitacoesWhatsapp />);
    expect(await screen.findByText('Atrasados')).toBeInTheDocument();
  });
});
