/**
 * Administração › Dados e importações.
 *
 * A casa das ferramentas técnicas, que antes estavam no caminho de quem opera
 * (Mapa de Abas, 29/09/2026):
 *
 *   Relatório 59, Conferência 58 × 59, Equipes a vincular, Fonte dos dados,
 *   Códigos e Histórico ........ eram abas do Painel Diretoria (super_admin);
 *   Relatórios PaguePlay ........ aba do Painel Diretoria na PaguePlay;
 *   Restaurar tabulações e Banco  cards de Configurações › Geral.
 *
 * Nada foi reescrito. As abas do 59 são o próprio Painel Diretoria, com a aba
 * escolhida daqui e o cabeçalho enxuto — o seletor de mês e o «Atualizar»
 * continuam lá dentro, valendo para todas elas, como valiam. E as chaves são as
 * mesmas: super_admin por cargo para o 59, `ver_banco_dados` para os cards.
 */
import { lazy, Suspense } from 'react';
import {
  Database, Scale, Link2, History, FileSpreadsheet, Upload, HardDrive, Hash, GitBranch,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TelaComAbas, type AbaDaTela } from '@/components/TelaComAbas';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { abasDosDados } from '@/lib/mapaAbas';
import type { AbaDoPainel } from '@/pages/PainelDiretoria';

const PainelDiretoria     = lazy(() => import('@/pages/PainelDiretoria'));
const ImportarAcordosCard = lazy(() => import('@/components/admin/ImportarAcordosCard'));
const CardBancoDeDados    = lazy(() => import('@/components/admin/CardBancoDeDados'));

const carregando = <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;

/** A aba daqui → a aba do Painel Diretoria que ela desenha. */
const DO_PAINEL: Record<string, AbaDoPainel> = {
  relatorio59: 'mestre',
  conferencia: 'divergencias',
  equipes:     'equipes',
  fontes:      'fontes',
  codigos:     'codigos',
  historico:   'historico',
  relatoriospp: 'relatorioPP',
};

export default function AdminDados() {
  const { perfil } = useAuth();
  const { temPermissao, loading } = useCargoPermissoes();
  const tenant = useTenant();
  const abas = abasDosDados(temPermissao, {
    isPaguePlay: tenant.isPaguePlay,
    isBookplay: tenant.slug === 'bookplay',
    superAdmin: perfil?.perfil === 'super_admin',
  });

  const doPainel = (a: string) => (
    <Suspense fallback={carregando}>
      <PainelDiretoria abaFixa={DO_PAINEL[a]} compacto />
    </Suspense>
  );
  const cartao = (conteudo: React.ReactNode) => (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <Suspense fallback={carregando}>{conteudo}</Suspense>
    </div>
  );

  const lista: AbaDaTela[] = [
    { chave: 'relatorio59', rotulo: 'Relatório 59', Icon: Database, visivel: abas.relatorio59, instancia: 'painel', render: doPainel },
    { chave: 'conferencia', rotulo: 'Conferência 58 × 59', Icon: Scale, visivel: abas.conferencia, instancia: 'painel', render: doPainel },
    { chave: 'equipes', rotulo: 'Equipes a vincular', Icon: Link2, visivel: abas.equipes, instancia: 'painel', render: doPainel },
    { chave: 'fontes', rotulo: 'Fonte dos dados', Icon: GitBranch, visivel: abas.fontes, instancia: 'painel', render: doPainel },
    { chave: 'codigos', rotulo: 'Códigos', Icon: Hash, visivel: abas.fontes, instancia: 'painel', render: doPainel },
    { chave: 'historico', rotulo: 'Histórico de importações', Icon: History, visivel: abas.historico, instancia: 'painel', render: doPainel },
    { chave: 'relatoriospp', rotulo: 'Relatórios PaguePlay', Icon: FileSpreadsheet, visivel: abas.relatoriosPP, instancia: 'painel', render: doPainel },
    { chave: 'restaurar', rotulo: 'Restaurar tabulações', Icon: Upload, visivel: abas.restaurar, render: () => cartao(<ImportarAcordosCard />) },
    { chave: 'banco', rotulo: 'Banco de dados', Icon: HardDrive, visivel: abas.banco, render: () => cartao(<CardBancoDeDados />) },
  ];

  return (
    <TelaComAbas
      titulo="Dados e importações"
      descricao="Relatórios do ERP, vínculos, fontes, restauração e banco de dados"
      Icon={Database}
      abas={lista}
      carregando={loading}
    />
  );
}
