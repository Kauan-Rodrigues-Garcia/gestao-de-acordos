/**
 * Vendas — a aba do Comercial.
 *
 * ## Refeita em 21/09/2026, no desenho da aba Acordos da BookPlay
 *
 * O pedido: «o jeito que a venda é cadastrada é muito arcaico e complicado»,
 * «fica muito espaço sobrando nas linhas», e a aba «tem que ser boa tanto para
 * o líder quanto para o operador». O que mudou, e por quê:
 *
 *   - **Cadastro de dois campos, na própria lista.** NR e valor; o resto chega
 *     pelo relatório, que casa pelo NR e valida a venda sozinho
 *     (`fn_vendas_projetar`). Linha inline no topo da tabela, Enter salva,
 *     «continuar lançando» deixa o cursor no NR. E «Colar várias» para quem
 *     anota o dia numa planilha ou no WhatsApp. Ver `NovaVendaInline`.
 *   - **Tabela com colunas**, e o espaço que sobrava virou informação: vendedor,
 *     as duas datas, pagamento, status, valor, **quanto vale na meta** e
 *     recebido. Ver `TabelaVendas`.
 *   - **Status que diz quem mexe agora.** «Aguardando relatório» (lançada, o
 *     NR ainda não apareceu), «Falta assinatura» (cobrança do líder), «Na
 *     meta». Ver `statusDaLinha` em `@/lib/vendasLista`.
 *   - **Abas por situação** — Todas, Na meta, Pendências, Perdas — e busca por
 *     NR, cliente ou vendedor, como em Acordos.
 *
 * ## A reforma de 21/09/2026
 *
 *   - **O dinheiro vem primeiro nos cards.** «Faturamento na meta» antes de «Na
 *     meta»: a pergunta de quem abre a aba é *quanto*, e a quantidade é como
 *     esse quanto foi feito.
 *   - **Filtro de setor**, que não existia. Quem enxerga mais de um setor
 *     escolhe qual olhar, e o filtro de equipe passa a oferecer só as equipes
 *     dele. Os cinco cards e as contagens das abas seguem o recorte — um total
 *     que não bate com a lista embaixo dele é o defeito que o Fechamento existe
 *     para evitar.
 *   - **A tabela cabe inteira.** Nenhuma coluna some por largura de tela; cada
 *     uma declara a largura mínima que o conteúdo pede, e o que passa disso é
 *     rolagem horizontal. Informação escondida não é layout, é dado perdido.
 *   - **Aba «Fora do relatório».** A venda lançada cujo NR o ERP nunca
 *     confirmou sai da lista em 1 dia e vive um MÊS nesta aba, em vez de ir
 *     direto para a lixeira — onde o operador não a alcançaria, por não ter
 *     `ver_lixeira_vendas`. Ela não soma em nada, e volta sozinha se o NR
 *     aparecer. Ver a migration 20260921170000.
 *   - **O líder decide na linha**: ✓ confirma e assina, ✎ marca assinado, e o
 *     detalhe (clique na linha) tem cancelar, devolver e voltar para aberta.
 *     A antiga «Fila do líder» virou a aba Pendências — de todos os meses.
 *   - **O operador vê a própria parte**: os cards falam dele, e a meta aparece
 *     como a contribuição dele para a meta da equipe — nunca como se a meta do
 *     setor inteiro fosse medida só com as vendas dele (era o que acontecia).
 *
 * ## Dois eixos, uma consulta
 *
 * A meta conta pela **data de confirmação**; o trabalho do dia, pela **data
 * da venda** (venda lançada hoje ainda não tem confirmação). A tela busca as
 * vendas com QUALQUER das duas datas no mês (`eixo: 'qualquer'`) e separa em
 * memória: os cards e a meta usam o recorte oficial; a lista agrupa pelo eixo
 * escolhido, com «Data da venda» como padrão — antes era «Confirmação», e a
 * venda que o operador acabava de lançar sumia da tela.
 *
 * A régua mora em `@/lib/vendas` e, no banco, em duas colunas geradas. Esta
 * tela nunca a reimplementa.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, RefreshCw, TriangleAlert, ChevronLeft, ChevronRight, Search, X,
  ShoppingBag, DollarSign, Clock, Zap, Percent, ListChecks, Target,
  Hourglass, Ban, ClipboardPaste, SearchX, TimerOff, Building2, FileX2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { MetricCard } from '@/components/AnalyticsPanel/SubComponents';
import { containerVariants } from '@/components/AnalyticsPanel/constants';
import { EfeitoComemoracao } from '@/components/comemoracao/EfeitoComemoracao';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import {
  deslocarMes, ehMesAtual, mesAtual, partesDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  resumirVendas, agruparPorDia, diaDaVenda, type EixoDaVenda,
} from '@/lib/vendas';
import {
  abaDaVenda, casaComBusca, podeExcluirVenda, prazoDaVenda, type AbaDaLista,
} from '@/lib/vendasLista';
import { equipeDaVenda } from '@/lib/vendasPlacar';
import { ticketMedio } from '@/lib/vendasDashboard';
import { contarVendasLancadasPor, type Venda } from '@/services/vendas/vendas.service';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { AndamentoDasMetas } from './AndamentoDasMetas';
import { NovaVendaInline, type OpcaoDeVendedor } from './lista/NovaVendaInline';
import { ColarVendas } from './lista/ColarVendas';
import { TabelaVendas } from './lista/TabelaVendas';
import { MinhaParteNaMeta } from './lista/MinhaParteNaMeta';

/** O `Select` do shadcn recusa `value=""`; o «todos» precisa de um valor. */
const TODOS = '__todos__';
/** Quantas linhas antes do «mostrar mais». Um mês do setor cabe inteiro. */
const PASSO = 150;

export default function Vendas() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [agrupar, setAgrupar] = useState<EixoDaVenda>('venda');
  const [aba, setAba] = useState<AbaDaLista>('todas');
  const [busca, setBusca] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState(TODOS);
  const [filtroSetor, setFiltroSetor] = useState(TODOS);
  const [filtroEquipe, setFiltroEquipe] = useState(TODOS);
  const [novoAberto, setNovoAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [colarAberto, setColarAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<Venda | null>(null);
  const [limite, setLimite] = useState(PASSO);
  const [festa, setFesta] = useState<string | null>(null);
  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);

  const empresaId = empresa?.id ?? null;
  const {
    vendas, pendentes, prazos, foraDoRelatorio, carregando, disponivel, erro,
    recarregar, salvar, confirmar, excluir,
  } = useVendas({ empresaId, mes, eixo: 'qualquer', ativo: Boolean(empresaId) });
  const placar = useVendasPlacar({ empresaId, mes, ativo: Boolean(empresaId) });

  /*
   * Quem enxerga mais de uma pessoa ganha coluna de vendedor, filtros de
   * pessoa e equipe, o seletor «em nome de» e o bloco de meta inteiro. Quem
   * tem só `individual` vê a própria carteira — oferecer esses controles a ele
   * seria mostrar botões que não controlam nada.
   */
  const niveis = useMemo(() => niveisLiberados('vendas', temPermissao), [temPermissao]);
  const veAlemDeSi = niveis.some(n => n !== 'individual');
  /*
   * O filtro de SETOR só existe para quem enxerga além do próprio.
   *
   * `setor` sozinho já basta: quem tem só ele pode pertencer a mais de um
   * setor (`fn_setores_do_operador` devolve vários), e nesse caso escolher
   * entre os seus é recorte legítimo. Quem tem `todos_setores` escolhe entre os
   * da empresa. Em ambos os casos a lista de opções sai do que CHEGOU na tela —
   * oferecer um setor que o RLS recusa devolveria lista vazia sem explicação.
   */
  const veSetor = niveis.some(n => n === 'setor' || n === 'todos_setores');

  const podeCriar     = temPermissao('criar_vendas');
  const podeEditar    = temPermissao('editar_vendas');
  const podeDecidir   = temPermissao('confirmar_vendas');
  const podeVerMetas  = temPermissao('ver_metas_vendas');

  /*
   * Excluir é por LINHA desde 21/09/2026: venda na meta pede a chave
   * `excluir_vendas_na_meta` (operador e líder não a têm), e quem lançou
   * exclui a própria venda manual mesmo sem `excluir_vendas`. A RPC confere a
   * mesma regra (migration 20260921150000).
   */
  const quemExclui = useMemo(() => ({
    meuId: perfil?.id ?? null,
    temChave: temPermissao('excluir_vendas'),
    temChaveNaMeta: temPermissao('excluir_vendas_na_meta'),
  }), [perfil?.id, temPermissao]);
  const podeExcluir = (v: Venda) => podeExcluirVenda(v, quemExclui);

  // O relógio de 1 dia: relido a cada minuto para a pílula andar sozinha.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (prazos.size === 0) return;
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, [prazos.size]);
  const prazoDe = (v: Venda) => prazoDaVenda(prazos.get(v.id), agora);

  useEffect(() => {
    if (!empresaId || !podeVerMetas) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, podeVerMetas]);

  // Trocar de mês volta a lista ao começo; o filtro de texto fica, porque
  // procurar o mesmo NR em outro mês é justamente o motivo de trocar.
  useEffect(() => { setLimite(PASSO); }, [mes, aba, agrupar]);

  /*
   * `/vendas?aba=fora_relatorio` abre direto na lista das arquivadas — é para
   * onde a notificação de «saiu da lista» aponta. Uma vez só: depois disso a
   * pessoa navega pelas abas, e reaplicar o parâmetro a prenderia lá.
   */
  const [abaDaUrl] = useState(() => new URLSearchParams(window.location.search).get('aba'));
  useEffect(() => {
    if (abaDaUrl === 'fora_relatorio' && foraDoRelatorio.length > 0) setAba('fora_relatorio');
  }, [abaDaUrl, foraDoRelatorio.length]);

  // A aba some quando o último NR é resolvido; ficar nela mostraria uma lista
  // vazia sem botão de saída.
  useEffect(() => {
    if (aba === 'fora_relatorio' && foraDoRelatorio.length === 0) setAba('todas');
  }, [aba, foraDoRelatorio.length]);

  /* ── Os recortes ──────────────────────────────────────────────────────── */

  const noMes = (dia: string) => dia.slice(0, 7) === mes;

  /** O recorte OFICIAL: confirmadas no mês. É dele que saem meta e placar. */
  const oficiais = useMemo(
    () => vendas.filter(v => v.data_confirmacao && noMes(v.data_confirmacao)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, mes],
  );

  const hoje = getTodayISO();
  const lancadasHoje = useMemo(() => vendas.filter(v => v.data_venda.slice(0, 10) === hoje), [vendas, hoje]);

  const vendedores = useMemo((): OpcaoDeVendedor[] => {
    if (!veAlemDeSi) return [];
    const lista = placar.pessoas
      .filter(p => !p.robo && p.situacao !== 'desligado')
      .map(p => ({ id: p.id, nome: p.nome, equipe: p.equipe_nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    // Quem está logado é o vendedor padrão do formulário; se o cadastro do
    // placar não o trouxer, o seletor abriria em branco.
    if (perfil?.id && !lista.some(v => v.id === perfil.id)) {
      lista.unshift({ id: perfil.id, nome: `${perfil.nome ?? 'Você'} (você)`, equipe: null });
    }
    return lista;
  }, [placar.pessoas, veAlemDeSi, perfil?.id, perfil?.nome]);

  /**
   * Os setores que aparecem no filtro.
   *
   * Duas fontes, porque nenhuma sozinha basta: o cadastro do placar traz o
   * setor de quem existe (mesmo sem venda no mês), e as vendas trazem o setor
   * de quem vendeu (mesmo que o cadastro não o alcance — venda do relatório de
   * um setor sem gente cadastrada). A união é o que a pessoa de fato enxerga.
   */
  const setores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of placar.pessoas) if (p.setor_id && p.setor_nome) mapa.set(p.setor_id, p.setor_nome);
    for (const v of [...vendas, ...pendentes, ...foraDoRelatorio]) {
      if (v.setor_id && !mapa.has(v.setor_id)) mapa.set(v.setor_id, 'Setor não cadastrado');
    }
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [placar.pessoas, vendas, pendentes, foraDoRelatorio]);

  /** equipe_id → setor_id, para o filtro de equipe obedecer ao de setor. */
  const setorDaEquipe = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const p of placar.pessoas) if (p.equipe_id) mapa.set(p.equipe_id, p.setor_id);
    return mapa;
  }, [placar.pessoas]);

  /*
   * As equipes oferecidas são só as do setor escolhido.
   *
   * Cruzar «setor A» com «equipe do setor B» devolveria lista vazia, e a tela
   * pareceria dizer que não há vendas quando quem estava impossível era o
   * filtro. O mesmo cuidado que `escopoDoPainel` toma no Painel do Líder.
   */
  const equipes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of placar.pessoas) {
      if (!p.equipe_id || !p.equipe_nome) continue;
      if (filtroSetor !== TODOS && p.setor_id !== filtroSetor) continue;
      mapa.set(p.equipe_id, p.equipe_nome);
    }
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [placar.pessoas, filtroSetor]);

  // Trocar de setor não pode deixar marcada a equipe do setor anterior.
  useEffect(() => {
    if (filtroEquipe === TODOS) return;
    if (filtroSetor !== TODOS && setorDaEquipe.get(filtroEquipe) !== filtroSetor) setFiltroEquipe(TODOS);
  }, [filtroSetor, filtroEquipe, setorDaEquipe]);

  /*
   * O nome da equipe sai do cadastro INTEIRO, e não de `equipes` — que o filtro
   * de setor encolhe. A coluna da tabela tem de saber escrever «Play 5» mesmo
   * quando o recorte é outro setor, senão a linha ficaria sem equipe por causa
   * de um filtro que nem a alcança.
   */
  const nomeDaEquipe = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of placar.pessoas) if (p.equipe_id && p.equipe_nome) mapa.set(p.equipe_id, p.equipe_nome);
    return mapa;
  }, [placar.pessoas]);
  const equipeDe = (v: Venda) => {
    const id = equipeDaVenda(v, placar.indice);
    return id ? nomeDaEquipe.get(id) ?? null : null;
  };

  /** Todas as pessoas que aparecem nas vendas, para o filtro — inclusive desligado e robô. */
  const vendedoresDoFiltro = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of [...vendas, ...pendentes]) mapa.set(v.operador_id, v.perfis?.nome ?? 'Sem nome');
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [vendas, pendentes]);

  /** NR → de quem é. Para o cadastro avisar antes de o banco recusar. */
  const nrsConhecidos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of [...vendas, ...pendentes]) {
      mapa.set(v.nr_documento, `${v.perfis?.nome ?? 'outro vendedor'}, ${v.data_venda.slice(8, 10)}/${v.data_venda.slice(5, 7)}`);
    }
    return mapa;
  }, [vendas, pendentes]);

  /** O recorte sem a busca — é o que os cards usam, e a lista reaproveita. */
  const noRecorte = (v: Venda) =>
    (filtroSetor === TODOS || v.setor_id === filtroSetor)
    && (filtroVendedor === TODOS || v.operador_id === filtroVendedor)
    && (filtroEquipe === TODOS || equipeDaVenda(v, placar.indice) === filtroEquipe);

  const filtrar = (lista: readonly Venda[]) => lista.filter(v => casaComBusca(v, busca) && noRecorte(v));

  /** O mês pelo eixo escolhido para agrupar — é a lista das abas do mês. */
  const doMesNoEixo = useMemo(
    () => vendas.filter(v => noMes(diaDaVenda(v, agrupar))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, mes, agrupar],
  );

  const baseDaAba = useMemo(() => {
    if (aba === 'pendencias') return pendentes;
    // Sem recorte de mês: a venda arquivada no dia 1º é de uma venda do mês
    // anterior, e quem a procura está olhando o mês em que ela caiu.
    if (aba === 'fora_relatorio') return foraDoRelatorio;
    if (aba === 'todas') return doMesNoEixo;
    return doMesNoEixo.filter(v => abaDaVenda(v) === aba);
  }, [aba, pendentes, foraDoRelatorio, doMesNoEixo]);

  const visiveis = useMemo(
    () => filtrar(baseDaAba),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseDaAba, busca, filtroSetor, filtroVendedor, filtroEquipe, placar.indice],
  );

  const grupos = useMemo(() => {
    const cortadas = visiveis.slice(0, limite);
    // Pendência e fora do relatório agrupam pela data da VENDA: nas duas o que
    // importa é a idade do problema, e nenhuma delas tem confirmação.
    const porVenda = aba === 'pendencias' || aba === 'fora_relatorio';
    return agruparPorDia(cortadas, porVenda ? 'venda' : agrupar);
  }, [visiveis, limite, aba, agrupar]);

  /* ── Os números ───────────────────────────────────────────────────────── */

  // Os cards respondem ao filtro de pessoa e equipe: um total que não bate
  // com a lista embaixo dele é o defeito que o Fechamento existe para evitar.
  const filtrando = filtroSetor !== TODOS || filtroVendedor !== TODOS || filtroEquipe !== TODOS;
  const oficiaisFiltradas = useMemo(
    () => (filtrando ? oficiais.filter(noRecorte) : oficiais),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oficiais, filtrando, filtroSetor, filtroVendedor, filtroEquipe, placar.indice],
  );
  const resumo = useMemo(() => resumirVendas(oficiaisFiltradas), [oficiaisFiltradas]);
  const ticket = ticketMedio(resumo);
  // Pendências e «hoje» seguem o mesmo recorte dos demais cards: um número que
  // não bate com a lista embaixo dele é o defeito que o Fechamento existe para
  // evitar, e ele vale para os cinco cards, não só para os da meta.
  const pendentesNoRecorte = useMemo(
    () => (filtrando ? pendentes.filter(noRecorte) : pendentes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendentes, filtrando, filtroSetor, filtroVendedor, filtroEquipe, placar.indice],
  );
  const hojeNoRecorte = useMemo(
    () => (filtrando ? lancadasHoje.filter(noRecorte) : lancadasHoje),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lancadasHoje, filtrando, filtroSetor, filtroVendedor, filtroEquipe, placar.indice],
  );
  const aguardando = pendentesNoRecorte.filter(v => v.situacao === 'aberta');
  const semAssinatura = pendentesNoRecorte.filter(v => v.situacao === 'confirmada');
  const valorParado = semAssinatura.reduce((s, v) => s + v.valor_total, 0);
  const valorHoje = hojeNoRecorte.reduce((s, v) => s + v.valor_total, 0);
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

  // As contagens seguem o recorte, pelo mesmo motivo dos cards: a aba que diz
  // «Perdas (12)» e mostra 3 linhas está mentindo sobre uma das duas coisas.
  const contagem = useMemo(() => {
    const doMes = filtrando ? doMesNoEixo.filter(noRecorte) : doMesNoEixo;
    const c = {
      todas: doMes.length,
      na_meta: 0,
      pendencias: pendentesNoRecorte.length,
      perdas: 0,
      fora: (filtrando ? foraDoRelatorio.filter(noRecorte) : foraDoRelatorio).length,
    };
    for (const v of doMes) {
      const a = abaDaVenda(v);
      if (a === 'na_meta') c.na_meta += 1;
      if (a === 'perdas') c.perdas += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doMesNoEixo, pendentesNoRecorte, foraDoRelatorio, filtrando,
      filtroSetor, filtroVendedor, filtroEquipe, placar.indice]);

  const abas: AbaSegmentada<AbaDaLista>[] = [
    { key: 'todas',      label: `Todas (${contagem.todas})`, Icon: ListChecks },
    { key: 'na_meta',    label: `Na meta (${contagem.na_meta})`, Icon: Target },
    { key: 'pendencias', label: 'Pendências', Icon: Hourglass, badge: contagem.pendencias },
    { key: 'perdas',     label: `Perdas (${contagem.perdas})`, Icon: Ban },
    // A aba só aparece quando há o que mostrar: sem nenhuma venda arquivada ela
    // seria um botão que abre uma lista vazia todo dia. Some sozinha quando o
    // último NR é resolvido — que é o desfecho desejado.
    ...(contagem.fora > 0
      ? [{ key: 'fora_relatorio' as const, label: `Fora do relatório (${contagem.fora})`, Icon: FileX2 }]
      : []),
  ];

  const { uteis, trabalhados } = useMemo(() => {
    const { ano, mes: m } = partesDoMes(mes);
    return { uteis: diasUteisDoMes(ano, m), trabalhados: diasUteisDecorridos(ano, m, [], hoje) };
  }, [mes, hoje]);

  /* ── Ações ────────────────────────────────────────────────────────────── */

  /*
   * Confete só na PRIMEIRA venda da vida de quem lança (pedido de 21/09/2026:
   * «depois não soltar mais»). O banco responde se há mais vendas lançadas
   * por esta pessoa do que as que acabaram de entrar; a resposta fica gravada
   * no navegador, para a pergunta não se repetir a cada lançamento.
   */
  async function aoLancar(quantas = 1) {
    if (!perfil?.id || !empresaId) return;
    const chave = `vendas:primeira-venda:${perfil.id}`;
    try { if (localStorage.getItem(chave)) return; } catch { /* sem armazenamento: pergunta ao banco */ }
    const total = await contarVendasLancadasPor(empresaId, perfil.id, quantas + 1);
    if (total === null) return;
    try { localStorage.setItem(chave, '1'); } catch { /* ignora */ }
    if (total <= quantas) setFesta(String(Date.now()));
  }
  const comemorar = (quantas?: number) => { void aoLancar(quantas); };
  useEffect(() => {
    if (!festa) return;
    const t = setTimeout(() => setFesta(null), 4500);
    return () => clearTimeout(t);
  }, [festa]);

  async function confirmarExclusao() {
    const v = excluindo;
    setExcluindo(null);
    if (!v) return;
    const r = await excluir(v.id, null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir a venda.'); return; }
    toast.success(`Venda ${v.nr_documento} na lixeira. Sete dias para restaurar.`);
  }

  /*
   * As que estão com o relógio ligado. Toda venda nessa situação é manual e
   * fora da meta — então está em `pendentes`, que é de todos os meses.
   */
  const saindo = useMemo(
    () => pendentes
      .filter(v => prazos.has(v.id))
      .sort((a, b) => (prazos.get(a.id) ?? '').localeCompare(prazos.get(b.id) ?? '')),
    [pendentes, prazos],
  );

  const temFiltros = Boolean(busca.trim()) || filtrando;
  const limparFiltros = () => {
    setBusca(''); setFiltroSetor(TODOS); setFiltroVendedor(TODOS); setFiltroEquipe(TODOS);
  };
  const colSpan = veAlemDeSi ? 12 : 11;
  const operadorPadrao = perfil?.id ?? '';
  const eu = placar.pessoas.find(p => p.id === perfil?.id) ?? null;

  const vazio = (
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
        {temFiltros ? <SearchX className="h-6 w-6 opacity-40" /> : <Clock className="h-6 w-6 opacity-40" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/70">
          {temFiltros ? 'Nenhuma venda com esses filtros'
            : aba === 'pendencias' ? 'Nada pendente — tudo validado'
            : aba === 'fora_relatorio' ? 'Nenhuma venda fora do relatório'
            : `Nenhuma venda em ${rotuloDoMes(mes)}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {temFiltros ? 'Tente ajustar a busca ou os filtros.'
            : podeCriar ? 'Lance a primeira: só NR e valor.' : ''}
        </p>
      </div>
      {temFiltros ? (
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={limparFiltros}>
          <X className="h-3.5 w-3.5" /> Limpar filtros
        </Button>
      ) : podeCriar && disponivel && aba !== 'pendencias' && aba !== 'fora_relatorio' && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova venda
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {festa && <EfeitoComemoracao efeito="confete" id={festa} />}

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden /> Vendas
            </h1>
            <div className="mt-2 flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Mês anterior"
                onClick={() => setMes(deslocarMes(mes, -1))}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="min-w-[110px] text-center text-xs font-semibold capitalize text-muted-foreground">
                {rotuloDoMes(mes)}
              </span>
              <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Próximo mês"
                onClick={() => setMes(deslocarMes(mes, 1))}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              {!ehMesAtual(mes) && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => setMes(mesAtual())}>
                  Mês atual
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {carregando && vendas.length === 0
                ? 'Carregando…'
                : veAlemDeSi
                  ? `${doMesNoEixo.length} venda${doMesNoEixo.length === 1 ? '' : 's'} no mês`
                  : `Suas vendas · ${doMesNoEixo.length} no mês`}
              {podeDecidir && pendentes.length > 0 && aba !== 'pendencias' && (
                <button type="button" onClick={() => setAba('pendencias')}
                  className="ml-2 font-medium text-warning hover:underline">
                  · {pendentes.length} esperando você
                </button>
              )}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={recarregar}
              disabled={carregando} aria-label="Recarregar" title="Recarregar">
              <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} />
            </Button>
            {podeCriar && disponivel && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setColarAberto(true)}
                  data-tour="colar-vendas">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Colar várias
                </Button>
                <Button size="sm" data-tour="nova-venda"
                  onClick={() => { setEditandoId(null); setNovoAberto(v => !v); if (aba === 'pendencias') setAba('todas'); }}
                  className={cn('gap-1.5 shadow-sm',
                    novoAberto && 'border border-border bg-muted text-foreground hover:bg-muted/80')}>
                  <Plus className={cn('h-4 w-4 transition-transform', novoAberto && 'rotate-45')} />
                  {novoAberto ? 'Fechar' : 'Nova venda'}
                </Button>
              </>
            )}
          </div>
        </div>

        {!disponivel && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              A aba Vendas não respondeu. <strong>Recarregue a página</strong> — se persistir, confira se a
              migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">20260915100000_vendas_fase1.sql</code>
              está aplicada.
            </div>
          </div>
        )}
        {erro && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{erro}
          </div>
        )}

        {/* ── O aviso do relógio de 1 dia ───────────────────────────────── */}
        {saindo.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px]">
            <TimerOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-foreground">
                <strong>
                  {saindo.length === 1
                    ? '1 venda lançada não veio no relatório'
                    : `${saindo.length} vendas lançadas não vieram no relatório`}
                </strong>
                {' '}— se o NR não aparecer no geral nem na prévia do setor em até 1 dia, a venda vai para a
                lixeira. Confira o NR: se estiver errado, corrija ou exclua.
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {saindo.slice(0, 8).map(v => (
                  <span key={v.id} className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px] text-destructive">
                    {v.nr_documento}
                  </span>
                ))}
                {saindo.length > 8 && <span className="text-[11px] text-muted-foreground">e mais {saindo.length - 8}</span>}
              </p>
            </div>
            {aba !== 'pendencias' && (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setAba('pendencias')}>
                Ver
              </Button>
            )}
          </div>
        )}

        {/* ── Os números do mês ─────────────────────────────────────────── */}
        <motion.div
          variants={containerVariants} initial="hidden" animate="visible"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          data-tour="vendas-metricas"
        >
          {/* O dinheiro primeiro (pedido de 21/09/2026): a pergunta de quem
              abre a aba é «quanto», e a quantidade é como esse quanto foi feito. */}
          <MetricCard
            label={veAlemDeSi ? 'Faturamento na meta' : 'Seu faturamento na meta'}
            value={formatBRL(resumo.valor)}
            icon={<DollarSign className="h-4 w-4" />} accentColor="#6366f1" gradientFrom="#6366f1"
            sub={ticket !== null ? `ticket médio ${formatBRL(ticket)}` : 'o que conta para a meta'}
          />
          <MetricCard
            label={veAlemDeSi ? 'Na meta' : 'Suas vendas na meta'}
            value={resumo.quantidade}
            icon={<Target className="h-4 w-4" />} accentColor="#22c55e" gradientFrom="#22c55e"
            sub="confirmadas e assinadas no mês"
          />
          <MetricCard
            label="Vendas de hoje" value={hojeNoRecorte.length}
            icon={<Zap className="h-4 w-4" />} accentColor="#0ea5e9" gradientFrom="#0ea5e9"
            sub={hojeNoRecorte.length > 0 ? formatBRL(valorHoje) : 'nenhuma ainda'}
          />
          <MetricCard
            label="Pendências" value={pendentesNoRecorte.length}
            icon={<Hourglass className="h-4 w-4" />} accentColor="#f59e0b" gradientFrom="#f59e0b"
            sub={`${aguardando.length} aguardando · ${semAssinatura.length} sem assinatura${valorParado > 0 ? ` (${formatBRL(valorParado)})` : ''}`}
          />
          <MetricCard
            label="Devolução / cancel." value={`${pct(resumo.pctDevolucao)} / ${pct(resumo.pctCancelamento)}`}
            icon={<Percent className="h-4 w-4" />} accentColor="#ef4444"
            sub={`${resumo.porGaveta.devolvida} devolvida${resumo.porGaveta.devolvida === 1 ? '' : 's'} · ${resumo.porGaveta.cancelada} cancelada${resumo.porGaveta.cancelada === 1 ? '' : 's'}`}
          />
        </motion.div>

        {/* ── A meta ────────────────────────────────────────────────────── */}
        <div data-tour="vendas-meta">
          {veAlemDeSi ? (
            <AndamentoDasMetas
              vendas={oficiais} metas={metas} eixo="confirmacao"
              uteis={uteis} trabalhados={trabalhados}
              pessoas={placar.indice.size > 0 ? placar.indice : undefined}
              presencaPorRecorte={placar.presencaPorRecorte}
            />
          ) : (
            <MinhaParteNaMeta
              metas={metas} eu={eu} resumo={resumirVendas(oficiais)}
              uteis={uteis} trabalhados={trabalhados}
            />
          )}
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2" data-tour="vendas-filtros">
          <AbasSegmentadas<AbaDaLista> abas={abas} ativa={aba} onTrocar={setAba} rotulo="Situação das vendas" />
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar NR, cliente ou vendedor"
              className="h-8 pl-8 text-xs" aria-label="Buscar venda"
            />
          </div>
          {veSetor && setores.length > 1 && (
            <Select value={filtroSetor} onValueChange={setFiltroSetor}>
              <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Filtrar por setor">
                <Building2 className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os setores</SelectItem>
                {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {veAlemDeSi && vendedoresDoFiltro.length > 1 && (
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Filtrar por vendedor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                {vendedoresDoFiltro.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {veAlemDeSi && equipes.length > 1 && (
            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Filtrar por equipe"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as equipes</SelectItem>
                {equipes.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {aba !== 'pendencias' && aba !== 'fora_relatorio' && (
            <Select value={agrupar} onValueChange={v => setAgrupar(v as EixoDaVenda)}>
              <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Agrupar por"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="venda">Pelo dia da venda</SelectItem>
                <SelectItem value="confirmacao">Pelo dia da confirmação</SelectItem>
              </SelectContent>
            </Select>
          )}
          {temFiltros && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={limparFiltros}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>

        {aba === 'pendencias' && (
          <p className="text-[11px] text-muted-foreground">
            Pendência de <strong className="text-foreground">qualquer mês</strong>: venda lançada que o relatório
            ainda não validou, e venda confirmada sem contrato assinado — o maior motivo de cancelamento.
          </p>
        )}

        {aba === 'fora_relatorio' && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <FileX2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <p>
              O NR destas vendas <strong className="text-foreground">não apareceu no relatório</strong> — nem no
              geral, nem na prévia do setor — e um dia depois elas saíram da lista principal. Elas
              não somam em nada: nem no placar, nem na meta, nem nos cards. Ficam aqui{' '}
              <strong className="text-foreground">um mês</strong> para você conferir o NR ou questionar por que
              ele não veio; depois vão para a lixeira. Se o NR aparecer num relatório novo, a venda volta
              sozinha para a lista.
            </p>
          </div>
        )}

        {/* ── A tabela ──────────────────────────────────────────────────── */}
        <Card className="border-border" data-tour="vendas-tabela">
          <CardContent className="p-0">
            {carregando && vendas.length === 0 && pendentes.length === 0 ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : (
              /* A rolagem horizontal é da tabela, não da página: as colunas têm
                 largura mínima e a barra aparece embaixo delas (`TabelaVendas`). */
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[1180px] text-xs">
                  <TabelaVendas
                    grupos={grupos} colSpan={colSpan}
                    mostrarVendedor={veAlemDeSi} equipeDe={equipeDe}
                    podeEditar={podeEditar} podeExcluir={podeExcluir}
                    // Decidir aqui traria a venda de volta à meta sem ela voltar
                    // à lista — o banco só desfaz o arquivamento no próximo ciclo.
                    // Nesta aba o caminho é corrigir o NR ou excluir.
                    podeDecidir={podeDecidir && aba !== 'fora_relatorio'}
                    foraDoRelatorio={aba === 'fora_relatorio'}
                    prazoDe={prazoDe}
                    editandoId={editandoId}
                    renderEdicao={v => (
                      <NovaVendaInline
                        key={`editar-${v.id}`} colSpan={colSpan} venda={v}
                        operadorPadrao={operadorPadrao} vendedores={vendedores}
                        nrsConhecidos={nrsConhecidos} onSalvar={salvar}
                        onFechar={() => setEditandoId(null)}
                      />
                    )}
                    onEditar={v => { setNovoAberto(false); setEditandoId(v.id); }}
                    onExcluir={setExcluindo}
                    onDecidir={confirmar}
                    topo={novoAberto && podeCriar ? (
                      <NovaVendaInline
                        colSpan={colSpan} operadorPadrao={operadorPadrao}
                        vendedores={vendedores} nrsConhecidos={nrsConhecidos}
                        onSalvar={salvar} onFechar={() => setNovoAberto(false)}
                        onColar={() => setColarAberto(true)} onLancou={() => comemorar(1)}
                      />
                    ) : null}
                    vazio={vazio}
                  />
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {visiveis.length > limite && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setLimite(l => l + PASSO)}>
              Mostrar mais ({visiveis.length - limite} restantes)
            </Button>
          </div>
        )}
      </div>

      <ColarVendas
        aberto={colarAberto} onFechar={() => setColarAberto(false)}
        operadorPadrao={operadorPadrao} vendedores={vendedores}
        nrsConhecidos={nrsConhecidos} onSalvar={salvar}
        onLancou={comemorar}
      />

      <AlertDialog open={excluindo !== null} onOpenChange={o => { if (!o) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a venda {excluindo?.nr_documento}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela vai para a lixeira e sai do placar. Dá para restaurar por sete dias.
              {excluindo?.origem === 'geral' && ' Como veio do relatório oficial, a próxima importação do geral a traz de volta.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarExclusao()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
