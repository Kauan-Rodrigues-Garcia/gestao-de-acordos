/**
 * Laboratório do Natal no Pix — `npm run dev` e abrir /lab-pix-natal.html.
 *
 * O cabeçalho e a sub-aba Registros de verdade, com um estado fixo: sem login
 * e sem banco (sem empresa, o painel de bônus — o único que lê sozinho — não
 * monta). `?estilo=simples|detalhado&tema=dark&lider=1&natal=0`.
 *
 * Abre CARREGANDO e solta os dados meio segundo depois, como o app: foi assim
 * que o fio sumia na tela de verdade e aparecia aqui (06/11/2026). E sem
 * StrictMode, como o app: o efeito rodando duas vezes escondia o defeito.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import '@/index.css';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import { calcularDobraComissao, totaisPorStatus, totalPagoPix } from '@/pages/Acordos/pixAutomaticoView';
import type { PixTela } from '@/pages/Acordos/usePixAutomatico';
import { PixCabecalho } from '@/pages/Acordos/PixCabecalho';
import { PixAbaRegistros } from '@/pages/Acordos/PixAbaRegistros';
import { PixSubAbas } from '@/pages/Acordos/PixSubAbas';
import { ListChecks, Medal, ShieldCheck, Trophy } from 'lucide-react';
import { TemaNatalContext, type EstiloNatal } from '../tema';
import { SincelosDaMarca, SincelosDoTopo } from '../Sincelos';

const busca = new URLSearchParams(location.search);
const estilo: EstiloNatal | null = busca.get('natal') === '0' ? null : busca.get('estilo') === 'simples' ? 'simples' : 'detalhado';
const lider = busca.get('lider') === '1';
const MES = '2026-11';
const PCT = { 'setor-1': 1 };
const nada = (): void => undefined;

function acordo(id: string, extras: Partial<PixAutoAcordo> = {}): PixAutoAcordo {
  return {
    id, empresa_id: 'e', operador_id: 'op-1', operador_nome: 'Ana Operadora', setor_id: 'setor-1',
    nr_cliente: `1287${id}0${id}`, valor: 380 + Number(id) * 45, status: 'pendente', pct_comissao: 1,
    avaliado_por: null, avaliado_por_nome: null, avaliado_em: null, criado_em: `2026-11-0${id}T12:00:00Z`,
    pago: false, pago_em: null, pago_por_nome: null, ajuste_valor: null, ajuste_motivo: null,
    extra: false, bonus_pct: 0, ...extras,
  } as PixAutoAcordo;
}

const itens = [
  acordo('1'), acordo('2', { extra: true }), acordo('3'),
  acordo('4', { status: 'aprovado', avaliado_por_nome: 'Kauan' }),
  acordo('5', { status: 'aprovado', pago: true, pago_por_nome: 'Kauan', pago_em: '2026-11-05T15:00:00Z', avaliado_por_nome: 'Kauan' }),
];

const pix = {
  perfil: { id: 'op-1', nome: 'Ana Operadora', email: 'ana@x', setor_id: 'setor-1' },
  empresa: null, temPermissao: () => lider, podeAprovar: lider,
  podeVerTodosSetores: false, podeVerDeOutros: lider, podeAgirSobreOutros: lider,
  podeEditarConfig: false, podeAjustarSaldo: false, podeRegistrar: false, podeMarcarPremiacaoPaga: false,
  mes: MES, setMes: nada, meuSetor: 'setor-1', setorEscopo: null, noMesAtual: true,
  fechamento: { impedir: () => false, impedirData: () => false },
  inicioDoMes: '2026-11-01', fimDoMes: '2026-11-30',
  itens, configs: {}, operadores: [], setores: [{ id: 'setor-1', nome: 'Play 1' }],
  setoresDoFiltro: [{ id: 'setor-1', nome: 'Play 1' }], doRetrato: false,
  donosDeNr: new Map(), nrsBloqueados: new Set<string>(), saldos: [],
  pagamentosPremiacao: [], setPagamentosPremiacao: nada,
  loading: false, carregar: async (): Promise<void> => undefined, carregarMetaPix: async (): Promise<void> => undefined,
  jaPintouPix: { current: true }, clonesRef: { current: {} }, nrDeFora: null, consumirNrDeFora: nada,
  subAba: 'registros', trocarSubAba: nada, diaNovo: '2026-11-06', setDiaNovo: nada,
  pedidosNr: [], aprovacoesNr: [], meusSetores: [], acordosSemPix: [],
  chaveAba: 'lab-pix', busca: '', setBusca: nada, filtroStatus: 'todos', setFiltroStatus: nada,
  filtroOperador: '', setFiltroOperador: nada, filtroEquipe: '', setFiltroEquipe: nada,
  setFiltroSetor: nada, filtroPagamento: 'todos', setFiltroPagamento: nada,
  dataDe: '', setDataDe: nada, dataAte: '', setDataAte: nada, metaPorOperador: {}, metasPix: [],
  setorFoco: 'setor-1', setorConfig: null, equipesDoFoco: [],
  pctPorSetor: PCT, pctDoMeuSetor: 1, fixoDoMeuSetor: null, pctSetorConfig: 1, registroLigadoSetorConfig: true,
  metaDobraSetorConfig: 18, operadoresFiltro: [], operadoresDoSeletor: [], visiveis: itens,
  setPagina: nada, totalPaginas: 1, paginaAtual: 1, daPagina: itens,
  totais: totaisPorStatus(itens, PCT), pagamento: totalPagoPix(itens, PCT),
  meusDesaprovados: 0, saldoPorOperador: {}, nrPorAcordo: {}, bonusMeta: null, metaPorSetor: {},
  dobra: calcularDobraComissao(itens, 'op-1', PCT, MES, { metaValor: null, recebidoMes: null }, {}),
  abasRanking: [], pedidosDoFoco: [], fotoPorOperador: {}, nomePorSetor: {},
  resumoPorSetor: {}, pedidosSemSetor: 0, blocosMetaPix: [],
  selecionados: new Set<string>(), setSelecionados: nada,
  quemExclui: { id: 'op-1', nome: 'Ana Operadora' }, divergenciasAbertas: 0, resumoPremiacao: null,
} as unknown as PixTela;

function Tela() {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setLoading(false), 500); return () => window.clearTimeout(t); }, []);
  const tela = { ...pix, loading } as PixTela;
  return (
    <>
      <PixCabecalho pix={tela} />
      <PixSubAbas
        ativa="registros" onTrocar={nada}
        abas={[
          { key: 'registros', label: 'Registros', Icon: ListChecks, resumo: '3 pendentes · 2 aprovados' },
          { key: 'divergencias', label: 'NRs divergentes', Icon: ShieldCheck, resumo: 'Nada divergente' },
          { key: 'premiacao', label: 'Premiação dobrada', Icon: Trophy, resumo: 'Ninguém dobrou ainda' },
          { key: 'ranking', label: 'Ranking', Icon: Medal, resumo: 'Pódio do setor no mês' },
        ]}
      />
      <PixAbaRegistros pix={tela} />
    </>
  );
}

createRoot(document.getElementById('lab')!).render(
    <ThemeProvider attribute="class" defaultTheme={busca.get('tema') === 'dark' ? 'dark' : 'light'} enableSystem={false}>
      <MemoryRouter>
        <TemaNatalContext.Provider value={estilo}>
          {/* A barra do topo e a marca do menu, de mentira, só para ver o gelo do Layout. */}
          <div className="flex">
            <div className="relative z-[3] flex w-[240px] shrink-0 items-center gap-3 border-b border-r border-border bg-sidebar px-4 py-5">
              <span className="h-8 w-8 rounded-lg bg-primary/20" />
              <span className="text-sm font-bold text-sidebar-foreground">Gestão de Acordos</span>
              {estilo && <SincelosDaMarca />}
            </div>
            <header className="relative z-[12] flex h-[73px] flex-1 items-center border-b border-border bg-card px-4 text-xs text-muted-foreground">
              barra do topo
              {estilo && <SincelosDoTopo />}
            </header>
          </div>
          <div className="min-h-screen bg-background p-4 sm:p-6">
            <div className="mx-auto max-w-[1400px] space-y-4">
              <Tela />
            </div>
          </div>
        </TemaNatalContext.Provider>
      </MemoryRouter>
    </ThemeProvider>
,
);
