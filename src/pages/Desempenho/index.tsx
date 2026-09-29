/**
 * Desempenho — a quebra por equipe e por pessoa (Mapa de Abas, 29/09/2026).
 *
 * Juntou o que respondia a mesma pergunta em lugares diferentes:
 *
 *   Equipes ........ Painel Líder › Desempenho Equipes (29 de 34 líderes o
 *                    usavam — muda de endereço, não de desenho); para a
 *                    diretoria sem o Painel Líder, Painel Diretoria › Setores;
 *   Pessoas ........ Painel Líder › Quartis, Analítico › Ranking e Painel
 *                    Diretoria › Por pessoa, escolhidos por um filtro;
 *   Desafios ....... Analítico › Desafios (a gaveta do topo leva para cá);
 *   Plantão Elite .. Painel Líder › Plantão Elite.
 *
 * Toda aba abre pela chave que já abria a tela de onde veio (ver
 * `abasDoDesempenho`); nenhum cargo precisou ser reconfigurado. Dentro de cada
 * uma, a tela é a mesma, com o mesmo cálculo — só o título e a régua própria
 * saíram, porque a régua agora é esta.
 */
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BarChart3, Users, Trophy, Clock, TrendingUp, Database } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { TelaComAbas, type AbaDaTela } from '@/components/TelaComAbas';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { abasDoDesempenho } from '@/lib/mapaAbas';
import { NivelBaseUso, useSubAbaUso } from '@/providers/RastreioUsoProvider';

const PainelLider     = lazy(() => import('@/pages/PainelLider'));
const PainelDiretoria = lazy(() => import('@/pages/PainelDiretoria'));
const PaginaAnalitico = lazy(() => import('@/pages/Analitico'));

const carregando = <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;
const comEspera = (no: ReactNode) => <Suspense fallback={carregando}>{no}</Suspense>;

type LeituraPessoas = 'quartis' | 'ranking' | 'relatorio59';

/**
 * Pessoas: três leituras que existiam em três telas. Um filtro, e não mais
 * uma régua de abas — dois níveis é o teto.
 */
function AbaPessoas({ leituras }: { leituras: readonly LeituraPessoas[] }) {
  const [escolhida, setEscolhida] = useState<LeituraPessoas>(leituras[0]);
  const ativa = leituras.includes(escolhida) ? escolhida : leituras[0];
  useSubAbaUso(leituras.length > 1 ? ativa : null);

  const opcoes: AbaSegmentada<LeituraPessoas>[] = ([
    { key: 'quartis',     label: 'Quartis',      Icon: TrendingUp },
    { key: 'ranking',     label: 'Ranking',      Icon: Trophy },
    { key: 'relatorio59', label: 'Relatório 59', Icon: Database },
  ] as AbaSegmentada<LeituraPessoas>[]).filter(o => leituras.includes(o.key));

  return (
    <>
      {opcoes.length > 1 && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 md:px-6">
          <AbasSegmentadas abas={opcoes} ativa={ativa} onTrocar={(k: LeituraPessoas) => setEscolhida(k)} rotulo="Leitura de pessoas" />
        </div>
      )}
      <NivelBaseUso acima={1}>
        {ativa === 'quartis' && comEspera(<PainelLider abas={['quartis']} compacto />)}
        {ativa === 'ranking' && comEspera(<PaginaAnalitico secao="ranking" />)}
        {ativa === 'relatorio59' && comEspera(<PainelDiretoria abas={['operadores']} compacto />)}
      </NivelBaseUso>
    </>
  );
}

export default function Desempenho() {
  const { temPermissao, loading } = useCargoPermissoes();
  const tenant = useTenant();
  const abas = abasDoDesempenho(temPermissao, {
    isPaguePlay: tenant.isPaguePlay,
    isBookplay: tenant.slug === 'bookplay',
    // As abas do Desempenho não dependem do cargo — só as de Dados dependem.
    superAdmin: false,
  });

  const leiturasPessoas: LeituraPessoas[] = [
    ...(abas.quartis ? ['quartis' as const] : []),
    ...(abas.ranking ? ['ranking' as const] : []),
    ...(abas.pessoasDiretoria ? ['relatorio59' as const] : []),
  ];

  const lista: AbaDaTela[] = [
    {
      chave: 'equipes', rotulo: 'Equipes', Icon: BarChart3, visivel: abas.equipes,
      render: () => (abas.equipesLider
        ? comEspera(<PainelLider abas={['desempenho']} compacto />)
        : comEspera(<PainelDiretoria abas={['setores']} compacto />)),
    },
    {
      chave: 'pessoas', rotulo: 'Pessoas', Icon: Users, visivel: abas.pessoas,
      render: () => <AbaPessoas leituras={leiturasPessoas} />,
    },
    {
      chave: 'desafios', rotulo: 'Desafios', Icon: Trophy, visivel: abas.desafios,
      render: () => comEspera(<PaginaAnalitico secao="desafios" />),
    },
    {
      chave: 'elite', rotulo: 'Plantão Elite', Icon: Clock, visivel: abas.elite,
      render: () => comEspera(<PainelLider abas={['elite']} compacto />),
    },
  ];

  return (
    <TelaComAbas
      titulo="Desempenho"
      descricao="Equipes, pessoas, desafios e plantão — a quebra do recebimento por quem fez"
      Icon={BarChart3}
      abas={lista}
      carregando={loading}
    />
  );
}
