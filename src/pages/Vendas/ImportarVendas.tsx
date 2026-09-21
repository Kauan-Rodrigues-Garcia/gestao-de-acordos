/**
 * ImportarVendas — a porta do menu «Importar Vendas», com duas abas.
 *
 * ## Por que o Fechamento mora aqui
 *
 * Até 16/09/2026 ele era item de menu próprio. O pedido foi parar de separar
 * o que é da mesma família, no desenho da BookPlay, e o Fechamento é a última
 * pergunta da importação: a tela de Importação já leva o lote até a Projeção e
 * a Conciliação, e «a conta do setor fecha?» é o que se pergunta logo depois.
 *
 * ## Cada aba continua pedindo a chave dela
 *
 * A rota pede `ver_importacoes_vendas`. A aba Fechamento pede `ver_vendas`,
 * que era a chave do item de menu — mover a tela não pode mudar quem a lê. O
 * alcance de verdade continua sendo o escopo, conferido na RPC.
 *
 * A aba escolhida vai na URL (`?tab=`), igual Usuários: o endereço antigo
 * `/vendas/fechamento` redireciona para cá já na aba certa.
 *
 * ## Relatório do mês (21/09/2026)
 *
 * «Saber tudo que está no relatório, igual o Painel Diretoria da BookPlay.»
 * A terceira aba lê a carga vigente inteira e fatia cada coluna do arquivo —
 * ver `relatorio/RaioXDoRelatorio`.
 */
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSearch, FileSpreadsheet, Loader2, Scale } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';

const Importacao = lazy(() => import('./Importacao'));
const FechamentoDoSetor = lazy(() => import('./FechamentoDoSetor'));
const RelatorioDoMes = lazy(() => import('./relatorio/RelatorioDoMes'));

type Aba = 'importacao' | 'relatorio' | 'fechamento';

export default function ImportarVendas() {
  const { temPermissao } = useCargoPermissoes();
  const [searchParams, setSearchParams] = useSearchParams();

  const abas: AbaSegmentada<Aba>[] = [
    { key: 'importacao', label: 'Importação', Icon: FileSpreadsheet },
    // Mesma chave da rota: `vendas_relatorio` abre para `ver_importacoes_vendas`.
    { key: 'relatorio', label: 'Relatório do mês', Icon: FileSearch },
    ...(temPermissao('ver_vendas')
      ? [{ key: 'fechamento' as const, label: 'Fechamento do setor', Icon: Scale }]
      : []),
  ];

  const pedida = searchParams.get('tab');
  // Aba sem chave cai na primeira: esconder o botão e servir a tela pela URL
  // não seria permissão.
  const ativa: Aba = abas.find(a => a.key === pedida)?.key ?? 'importacao';
  useSubAbaUso(ativa);

  const trocar = (aba: Aba) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', aba);
    setSearchParams(p, { replace: true });
  };

  return (
    <div>
      {abas.length > 1 && (
        <div className="px-4 pt-4 md:px-6 md:pt-6">
          <AbasSegmentadas abas={abas} ativa={ativa} onTrocar={trocar} rotulo="Seção de Importar Vendas" />
        </div>
      )}
      <Suspense fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      }>
        {ativa === 'fechamento' ? <FechamentoDoSetor />
          : ativa === 'relatorio' ? <RelatorioDoMes />
          : <Importacao />}
      </Suspense>
    </div>
  );
}
