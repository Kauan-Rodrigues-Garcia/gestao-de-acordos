/**
 * Fechamento do mês — Fechamento + RH Gestão (Mapa de Abas, 29/09/2026).
 *
 * Os dois calculavam a mesma premiação e comissão por operador, com as mesmas
 * peças: o Fechamento, a planilha da gerência com o relatório de pagamento; o
 * RH Gestão, a conferência, o envio, a validação e a aprovação. Viraram uma
 * tela com duas abas:
 *
 *   Fechamento ............... a planilha da gerência (`ver_fechamento`);
 *   Premiação e comissão ..... do cálculo à aprovação: o fluxo do RH
 *                              (`ver_rh_gestao`) e o relatório de pagamento
 *                              do Fechamento, escolhidos por um filtro quando
 *                              a pessoa tem os dois.
 *
 * `/rh-gestao` redireciona para a segunda aba. As telas de dentro são as
 * mesmas, com as mesmas RPCs e a mesma RLS.
 */
import { lazy, Suspense, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Award, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { TelaComAbas, type AbaDaTela } from '@/components/TelaComAbas';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { abasDoFechamentoDoMes } from '@/lib/mapaAbas';
import { NivelBaseUso, useSubAbaUso } from '@/providers/RastreioUsoProvider';

const PaginaFechamento = lazy(() => import('@/pages/Fechamento'));
const RhGestao         = lazy(() => import('@/pages/RhGestao'));

const carregando = <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;

type LeituraPremiacao = 'fluxo' | 'relatorio';

function AbaPremiacao({ rh, relatorio }: { rh: boolean; relatorio: boolean }) {
  const [escolhida, setEscolhida] = useState<LeituraPremiacao>(rh ? 'fluxo' : 'relatorio');
  const ativa: LeituraPremiacao = escolhida === 'fluxo' && !rh ? 'relatorio'
    : escolhida === 'relatorio' && !relatorio ? 'fluxo' : escolhida;
  useSubAbaUso(rh && relatorio ? ativa : null);

  const opcoes: AbaSegmentada<LeituraPremiacao>[] = [
    ...(rh ? [{ key: 'fluxo' as const, label: 'Conferência e aprovação', Icon: ShieldCheck }] : []),
    ...(relatorio ? [{ key: 'relatorio' as const, label: 'Relatório de pagamento', Icon: FileSpreadsheet }] : []),
  ];

  return (
    <>
      {opcoes.length > 1 && (
        <div className="mx-auto max-w-[1400px] px-4 pt-4 md:px-6">
          <AbasSegmentadas
            abas={opcoes} ativa={ativa}
            onTrocar={(k: LeituraPremiacao) => setEscolhida(k)}
            rotulo="Leitura da premiação"
          />
        </div>
      )}
      <NivelBaseUso acima={1}>
        <Suspense fallback={carregando}>
          {ativa === 'fluxo' ? <RhGestao /> : <PaginaFechamento aba="premiacoes" />}
        </Suspense>
      </NivelBaseUso>
    </>
  );
}

export default function FechamentoDoMes() {
  const [params] = useSearchParams();
  const { temPermissao, loading } = useCargoPermissoes();
  const tenant = useTenant();
  const abas = abasDoFechamentoDoMes(temPermissao, {
    isPaguePlay: tenant.isPaguePlay,
    isBookplay: tenant.slug === 'bookplay',
    superAdmin: false,
  });

  const lista: AbaDaTela[] = [
    {
      chave: 'fechamento', rotulo: 'Fechamento', Icon: ClipboardCheck, visivel: abas.fechamento,
      render: () => <Suspense fallback={carregando}><PaginaFechamento aba="fechamento" /></Suspense>,
    },
    {
      chave: 'premiacao', rotulo: 'Premiação e comissão', Icon: Award, visivel: abas.premiacao,
      render: () => <AbaPremiacao rh={abas.rh} relatorio={abas.fechamento} />,
    },
  ];

  // `/fechamento?aba=premiacoes` era a segunda aba do Fechamento antigo.
  if (params.get('aba') === 'premiacoes' && !params.get('tab')) {
    return <Navigate to="?tab=premiacao" replace />;
  }

  return (
    <TelaComAbas
      titulo="Fechamento do mês"
      descricao="Planilha de fechamento, premiação e comissão — do cálculo à aprovação do RH"
      Icon={ClipboardCheck}
      abas={lista}
      carregando={loading}
    />
  );
}
