/**
 * Início — a porta de entrada da cobrança (Mapa de Abas, 29/09/2026).
 *
 * ## Uma informação, uma casa
 *
 * Recebido do mês, meta e projeção apareciam em seis lugares: Dashboard,
 * Analítico, Painel Líder (Desempenho Equipes e Gráfico recebimento), Painel
 * Diretoria, Fechamento e Modo TV. O Início é a casa do total no alcance da
 * pessoa; a quebra por setor, equipe e pessoa mora em Desempenho.
 *
 * Quatro leituras, escolhidas por um alternador e não por abas de tela:
 *
 *   Mês ...... o antigo Dashboard — recebido × meta × projeção, evolução
 *              diária, formas de pagamento e quartil resumido;
 *   Hoje ..... o painel Desempenho do Dia (era a gaveta do topo) e os
 *              Destaques do dia (eram aba do Analítico);
 *   Formas ... o detalhamento das formas de pagamento (era aba do Analítico);
 *   Empresa .. a Visão geral do Painel Diretoria; na PaguePlay, o painel dela.
 *
 * Cada leitura aparece pela chave que abria a tela de onde veio — ver
 * `abasDoInicio`. O Início é igual nas duas empresas: a lista de acordos da
 * PaguePlay, que morava embaixo do painel, virou o item Acordos.
 */
import { lazy, Suspense, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, Sun, Wallet, Building2 } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { ROUTE_PATHS } from '@/lib/index';
import { abasDoInicio } from '@/lib/mapaAbas';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { NivelBaseUso, useSubAbaUso } from '@/providers/RastreioUsoProvider';
import Dashboard from '@/pages/Dashboard';

const DesempenhoDia = lazy(() => import('@/components/DesempenhoDia').then(m => ({ default: m.DesempenhoDia })));
const PaginaAnalitico = lazy(() => import('@/pages/Analitico'));
const PainelDiretoria = lazy(() => import('@/pages/PainelDiretoria'));

type Vista = 'mes' | 'hoje' | 'formas' | 'empresa';

/**
 * Parâmetros de quem abria a lista da PaguePlay pelo Dashboard. A lista mudou
 * para `/acordos`; notificação antiga e favorito seguem para lá.
 */
const PARAMETROS_DA_LISTA = ['highlight', 'verAcordo', 'novoInline'];

const nada = (): void => {};

export default function Inicio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const abas = abasDoInicio(temPermissao);
  const nivelSetor = niveisLiberados('analitico', temPermissao).includes('setor');

  const disponiveis = useMemo(() => {
    const lista: AbaSegmentada<Vista>[] = [{ key: 'mes', label: 'Mês', Icon: CalendarRange }];
    if (abas.hoje)    lista.push({ key: 'hoje',    label: 'Hoje',    Icon: Sun });
    if (abas.formas)  lista.push({ key: 'formas',  label: 'Formas',  Icon: Wallet });
    if (abas.empresa) lista.push({ key: 'empresa', label: 'Empresa', Icon: Building2 });
    return lista;
  }, [abas.hoje, abas.formas, abas.empresa]);

  const pedida = searchParams.get('vista') as Vista | null;
  const vista: Vista = disponiveis.some(v => v.key === pedida) ? pedida! : 'mes';
  useSubAbaUso(vista === 'mes' ? null : vista);

  const doLink = PARAMETROS_DA_LISTA.some(p => searchParams.has(p));
  if (tenant.isPaguePlay && doLink) {
    return <Navigate to={`${ROUTE_PATHS.ACORDOS}?${searchParams.toString()}`} replace />;
  }

  function trocar(v: Vista) {
    const prox = new URLSearchParams(searchParams);
    if (v === 'mes') prox.delete('vista'); else prox.set('vista', v);
    setSearchParams(prox, { replace: true });
  }

  const carregando = <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;

  return (
    <div>
      {disponiveis.length > 1 && (
        <div className="mx-auto flex max-w-[1400px] justify-end px-6 pt-6 -mb-4">
          <AbasSegmentadas abas={disponiveis} ativa={vista} onTrocar={trocar} rotulo="Leitura do Início" />
        </div>
      )}

      <NivelBaseUso acima={1}>
        {vista === 'mes' && <Dashboard secao="inicio" />}

        {vista === 'hoje' && (
          <Suspense fallback={carregando}>
            <div className="mx-auto grid max-w-[1400px] gap-6 p-6 xl:grid-cols-[520px_1fr]">
              <DesempenhoDia aberto embutido onClose={nada} />
              {abas.destaques && nivelSetor && (
                <div className="-m-6"><PaginaAnalitico secao="destaques" /></div>
              )}
            </div>
          </Suspense>
        )}

        {vista === 'formas' && (
          <Suspense fallback={carregando}><PaginaAnalitico secao="formas" /></Suspense>
        )}

        {vista === 'empresa' && (
          <Suspense fallback={carregando}>
            <PainelDiretoria abas={[tenant.isPaguePlay ? 'painel' : 'visao']} compacto />
          </Suspense>
        )}
      </NivelBaseUso>
    </div>
  );
}
