/**
 * ProtectedRoute.test.tsx
 *
 * Escrito depois de um bug real, reportado em 15/08/2026.
 *
 * A operadora Aline teve `ver_analitico` desligado na aba «Por pessoa». Salvou
 * certo no banco, o menu escondeu a aba — e ela abriu `/analitico` assim mesmo.
 *
 * Causa: este guard lia `permissoes[chave]` direto, que é o mapa do CARGO. O
 * cargo `operador` concede `ver_analitico`, então a exceção da pessoa era
 * ignorada. A regra estava escrita em dois lugares e os dois discordavam.
 *
 * Agora existe uma pergunta só — `temPermissao` —, e estes testes fixam isso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { authRef, permRef } = vi.hoisted(() => ({
  authRef: { current: { user: { id: 'u1' }, perfil: { perfil: 'operador' }, loading: false } as unknown },
  permRef: { current: { temPermissao: (_: string) => true, loading: false } as unknown },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authRef.current }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => permRef.current,
}));
// A guarda passou a perguntar em que PRODUTO a pessoa está (25/08). Sem o
// provider real, o hook lança — e o que estes testes medem é cargo e permissão.
const empresaRef = { current: { empresa: { slug: 'bookplay', produto: 'cobranca' }, tenantSlug: 'bookplay', loading: false } };
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => empresaRef.current }));

import { ProtectedRoute } from './ProtectedRoute';

function renderizar(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter initialEntries={['/alvo']}>
      <ProtectedRoute {...props}>
        <p>conteúdo protegido</p>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

const passou = () => screen.queryByText('conteúdo protegido') !== null;

beforeEach(() => {
  authRef.current = { user: { id: 'u1' }, perfil: { perfil: 'operador' }, loading: false };
  permRef.current = { temPermissao: () => true, loading: false };
});

describe('ProtectedRoute — permissão configurável', () => {
  it('deixa passar quando a permissão resolve para sim', () => {
    permRef.current = { temPermissao: (k: string) => k === 'ver_analitico', loading: false };
    renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(true);
  });

  it('bloqueia quando a permissão resolve para não', () => {
    permRef.current = { temPermissao: () => false, loading: false };
    renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(false);
  });

  /**
   * O bug da Aline, em uma linha: o guard TEM que perguntar ao `temPermissao`,
   * que aplica a exceção da pessoa por cima do cargo. Se ele voltar a ler o
   * mapa do cargo, este teste falha.
   */
  it('respeita a exceção por pessoa mesmo quando o cargo concede', () => {
    // Simula a resolução real: cargo diz sim, exceção da pessoa diz não.
    const cargo    = { ver_analitico: true };
    const excecoes = { ver_analitico: false };
    permRef.current = {
      temPermissao: (k: string) =>
        k in excecoes ? excecoes[k as keyof typeof excecoes] : !!cargo[k as keyof typeof cargo],
      loading: false,
    };

    renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(false);
  });

  /**
   * A outra metade do mesmo bug: a rota não declara `allowedProfiles`, e o
   * fallback antigo liberava para todo mundo quando a chave não estava no mapa
   * do cargo. `/analitico`, `/ouvidoria`, `/campanha-facil` e
   * `/solicitacoes-whatsapp` são exatamente assim.
   */
  it('NEGA quando não há permissão e a rota não declara cargos', () => {
    permRef.current = { temPermissao: () => false, loading: false };
    renderizar({ requiredPermissao: 'ver_ouvidoria' });
    expect(passou()).toBe(false);
  });

  it('não decide nada enquanto as permissões carregam', () => {
    permRef.current = { temPermissao: () => false, loading: true };
    renderizar({ requiredPermissao: 'ver_analitico' });
    // Nem libera nem redireciona: mostra o esqueleto.
    expect(passou()).toBe(false);
    expect(screen.queryByText('conteúdo protegido')).toBeNull();
  });

  it('manda para o login quem não está autenticado', () => {
    authRef.current = { user: null, perfil: null, loading: false };
    renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(false);
  });
});

describe('ProtectedRoute — só por cargo (sem requiredPermissao)', () => {
  it('deixa passar o cargo listado', () => {
    authRef.current = { user: { id: 'u1' }, perfil: { perfil: 'lider' }, loading: false };
    renderizar({ allowedProfiles: ['lider', 'administrador'] });
    expect(passou()).toBe(true);
  });

  it('bloqueia o cargo fora da lista', () => {
    authRef.current = { user: { id: 'u1' }, perfil: { perfil: 'operador' }, loading: false };
    renderizar({ allowedProfiles: ['lider', 'administrador'] });
    expect(passou()).toBe(false);
  });

  it('super_admin passa por cima da lista de cargos', () => {
    authRef.current = { user: { id: 'u1' }, perfil: { perfil: 'super_admin' }, loading: false };
    renderizar({ allowedProfiles: ['lider'] });
    expect(passou()).toBe(true);
  });
});

/*
 * Bug de 04/09/2026: sair da janela do navegador e voltar levava a pessoa de
 * volta para a primeira aba interna da tela.
 *
 * A causa estava em `useEmpresa`, que recarregava a empresa em todo `SIGNED_IN`
 * — e o supabase-js REEMITE esse evento quando a aba volta ao foco. `load()`
 * começa com `setLoading(true)`, este guard trocava a página por um esqueleto,
 * e trocar a página DESMONTA tudo o que estava dentro: aba aberta, filtro,
 * rolagem, formulário pela metade.
 *
 * A causa foi corrigida lá. Isto aqui é a segunda trava: são três flags de
 * carregamento desembocando num único `if`, e a próxima que piscar não pode
 * recriar o mesmo sintoma.
 */
describe('ProtectedRoute — o esqueleto é só da primeira carga', () => {
  it('mostra o esqueleto enquanto carrega pela primeira vez', () => {
    permRef.current = { temPermissao: () => true, loading: true };
    renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(false);
  });

  it('NÃO desmonta o conteúdo quando o carregamento volta depois de já ter mostrado', () => {
    permRef.current = { temPermissao: () => true, loading: false };
    const { rerender } = renderizar({ requiredPermissao: 'ver_analitico' });
    expect(passou()).toBe(true);

    // A aba volta ao foco: alguma fonte recarrega em segundo plano.
    permRef.current = { temPermissao: () => true, loading: true };
    rerender(
      <MemoryRouter initialEntries={['/alvo']}>
        <ProtectedRoute requiredPermissao="ver_analitico">
          <p>conteúdo protegido</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    // O conteúdo continua montado — é isso que preserva a aba interna aberta.
    expect(passou()).toBe(true);
  });

  it('a recarga de empresa também não derruba a página já mostrada', () => {
    empresaRef.current = { empresa: { slug: 'bookplay', produto: 'cobranca' }, tenantSlug: 'bookplay', loading: false };
    const { rerender } = renderizar({ produtos: ['cobranca'] as unknown as string[] });
    expect(passou()).toBe(true);

    empresaRef.current = { ...empresaRef.current, loading: true };
    rerender(
      <MemoryRouter initialEntries={['/alvo']}>
        <ProtectedRoute produtos={['cobranca'] as unknown as string[]}>
          <p>conteúdo protegido</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(passou()).toBe(true);
  });
});
