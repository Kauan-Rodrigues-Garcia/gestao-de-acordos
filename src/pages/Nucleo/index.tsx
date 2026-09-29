/**
 * Núcleo — a área do Núcleo de Inteligência e Gestão num item só.
 *
 * Até o Mapa de Abas (29/09/2026) eram dois itens de menu, Dashboard – ADM e
 * Controle de Números, usados pelos mesmos quatro assistentes. Viraram um, com
 * o painel como primeira aba e as quatro abas do Controle de Números ao lado.
 *
 * As chaves são as mesmas: `ver_dashboard_adm` abre o Painel,
 * `ver_controle_numeros` abre as outras, e dentro delas `numeros_administrar`
 * (Lixeira) e `numeros_configurar` (Configuração, concessão nominal) decidem o
 * que já decidiam. A RLS de `fn_numeros_visivel` não mudou.
 *
 * O Controle de Números é UMA instância para as quatro abas: remontá-lo a cada
 * troca recarregaria a lista inteira de aparelhos.
 */
import { Gauge, Smartphone, Hash, Trash2, Settings, LayoutDashboard } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TelaComAbas, type AbaDaTela } from '@/components/TelaComAbas';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { abasDoNucleo } from '@/lib/mapaAbas';
import type { AbaControleNumeros } from '@/pages/ControleNumeros';

const DashboardAdm    = lazy(() => import('@/pages/DashboardAdm'));
const ControleNumeros = lazy(() => import('@/pages/ControleNumeros'));

const carregandoAba = <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;

export default function Nucleo() {
  const { temPermissao, temPermissaoExplicita, loading } = useCargoPermissoes();
  const tenant = useTenant();
  const abas = abasDoNucleo(temPermissao, {
    isPaguePlay: tenant.isPaguePlay,
    isBookplay: tenant.slug === 'bookplay',
    superAdmin: false,
  });

  const numeros = (chave: AbaControleNumeros) => (
    <Suspense fallback={carregandoAba}><ControleNumeros aba={chave} /></Suspense>
  );

  const lista: AbaDaTela[] = [
    {
      chave: 'painel', rotulo: 'Painel', Icon: LayoutDashboard, visivel: abas.painel,
      render: () => <Suspense fallback={carregandoAba}><DashboardAdm /></Suspense>,
    },
    { chave: 'celulares', rotulo: 'Celulares', Icon: Smartphone, visivel: abas.numeros,
      instancia: 'numeros', render: a => numeros(a as AbaControleNumeros) },
    { chave: 'numeros', rotulo: 'Números', Icon: Hash, visivel: abas.numeros,
      instancia: 'numeros', render: a => numeros(a as AbaControleNumeros) },
    { chave: 'lixeira', rotulo: 'Lixeira', Icon: Trash2,
      visivel: abas.numeros && temPermissao('numeros_administrar'),
      instancia: 'numeros', render: a => numeros(a as AbaControleNumeros) },
    { chave: 'configuracao', rotulo: 'Configuração', Icon: Settings,
      visivel: abas.numeros && temPermissaoExplicita('numeros_configurar'),
      instancia: 'numeros', render: a => numeros(a as AbaControleNumeros) },
  ];

  return (
    <TelaComAbas
      titulo="Núcleo"
      descricao="Núcleo de Inteligência e Gestão · painel, celulares e números de WhatsApp"
      Icon={Gauge}
      abas={lista}
      carregando={loading}
    />
  );
}
