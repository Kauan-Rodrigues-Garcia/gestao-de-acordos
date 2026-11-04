/**
 * usePixAutomatico.ts — o estado e as contas da tela "Pix Automático"
 * ─────────────────────────────────────────────────────────────────────────
 * Desde 16/10/2026 é tela própria no menu (`/pix-automatico`, ver
 * `pages/PixAutomatico`), dividida em sub-abas — Registros, NRs divergentes,
 * Premiação dobrada e Ranking. O porquê está em `PixSubAbas`.
 *
 * Acompanhamento de comissão de acordos fechados no Pix automático, SEM
 * vínculo com a tabela `acordos`.
 *
 * Operador: registra NR + valor (nasce pendente) — se o registro manual do
 * setor estiver LIGADO —, vê os próprios registros, a comissão por linha,
 * totais pendente/aprovado e o card de bônus por meta (comissão aprovada do
 * mês é paga de novo se bater a meta; estado do card segue meta + quartis).
 * Líder+: vê tudo, filtra por operador/equipe (e por setor para gerência+),
 * aprova/desaprova, registra vinculando a um operador, e configura o setor:
 * % de comissão (com confirmação) e interruptor do registro manual.
 * Cada NR só pode ter UM registro vivo por empresa, em qualquer status; excluir
 * a linha libera o NR (migration 20260811c). Todo movimento — registro, edição,
 * avaliação, pagamento, exclusão e restauração — vai para `pix_automatico_log`,
 * que o botão "Histórico" mostra.
 *
 * ## A aba segue o mês do sistema
 *
 * Todas as contas daqui — dobra, ranking, meta por equipe, premiação — são "no
 * mês". Até 01/09/2026 esse mês era `mesAtual()` fixo, em sete lugares: virou
 * setembro e a meta de agosto sumiu da tela (continuava no banco, só ninguém
 * pedia por ela), o card de comissão dobrada desapareceu para quem ainda não
 * tinha acordo no mês novo, e a premiação de agosto ficou inalcançável.
 *
 * Agora o mês vem do `MesProvider`, o mesmo do Dashboard e do Analítico. Olhar
 * agosto aqui mostra agosto inteiro — e continua sendo possível registrar,
 * editar e avaliar ali, porque o Pix é conferência de comissão e ela não fecha
 * junto com o mês do relatório. O que muda é que o registro lançado com agosto
 * na tela nasce COM DATA DE AGOSTO (ver `dia` em `criarAcordoPix`).
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes } from '@/lib/supabase';
import { getTodayISO } from '@/lib/index';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import {
  ehMesAtual, mesAtual, partesDoMes, primeiroDiaDoMes, ultimoDiaDoMes,
} from '@/lib/mesReferencia';
import { noMesPix } from '@/lib/mesPix';
import { useFechamentoMes } from '@/hooks/useFechamentoMes';
import { useMesGlobal } from '@/providers/MesProvider';
// As contas desta tela vivem em `pixAutomaticoView`: são puras e têm teste
// próprio, o que os `useMemo` que elas substituíram nunca tiveram.
import {
  mapaOperadorEquipe, mapaOperadorSetor, apenasOperadores, operadoresDoRecorte,
  filtrarItensPix, totaisPorStatus, totalPagoPix, calcularBonusMeta,
  calcularDobraComissao, rankingPixSetor, calcularMetaPixPorEquipe,
  pedidosDoSetor, setoresComAcordosPix, escolherSetorInicial, itensDoSetorPix,
  setorDaLinhaPix, clonesPorOperador, incluirClonesDoSetor,
  setoresPorPessoaClonada, pessoasCompartilhadasCom, juntarLinhasCompartilhadas,
  type OperadorInfo, type FiltroPagamento, type OndeFoiClonado,
} from './pixAutomaticoView';
import type { AbaRankingPix } from './PixRankingSetor';
import type { ResumoSetorPix } from './PixBarraSetores';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { configComDiasDoSetor, type DiasUteisPorSetor } from '@/lib/diasUteisDoSetor';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import {
  PixAutoAcordo, PixAutoConfig, PIX_AUTO_PCT_PADRAO, PIX_META_ACORDOS_DOBRA,
  fetchAcordosPix, fetchConfigsPix, PIX_LINHAS_POR_PAGINA, metasDobraPorSetor,
  normalizarNr, fetchMetasPixEquipes, expurgarDesaprovadosVencidos,
  fetchSaldosPix, saldosPorOperador,
  fetchPedidosNr, type PixNrPedido,
  fetchAprovacoesPedidosNr, type PixNrAprovacao,
  fetchDonosDeNrPix, type DonoDeNrPix,
  fetchAcordosRecorrentesSemPix, type AcordoSemRegistroPix,
  fetchMeusSetores, fetchPremiacoesPagamento,
  fetchRetratoPixDoMes, aplicarRetratoPix,
  type PixAutoStatus, type PixAutoMeta, type PixAutoSaldo, type PixPremiacaoPagamento,
} from '@/services/pix_automatico.service';
import { SUB_ABAS_PIX, type SubAbaPix } from './subAbasPix';
import { painelPremiacoes, totalDoPainel } from './pixPremiacao';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { reconciliarLista, reconciliarMapa } from '@/lib/dadosVivos';
import { chaveDeCache, gravarInstantaneo, valorInstantaneo } from '@/lib/cacheInstantaneo';
import { COLUNAS_SETOR_DO_FILTRO, setoresDosFiltros } from '@/lib/setoresDosFiltros';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { buscarConfigDoMes } from '@/services/fechamento/configDoMes';
import {
  donosIguais, lerVinculosDeClone, mapasDeSetoresIguais, TODOS_SETORES,
  type EquipeComSetor, type InstantaneoPix, type SetorDaAba,
} from './pixTelaComum';

/**
 * O estado da tela inteira: permissões, mês, a leitura do banco, os filtros e
 * as contas que mais de uma sub-aba usa. O que é de uma parte só (o
 * formulário de registro, a edição de uma linha, a lixeira) mora no
 * componente dela — digitar ali não redesenha a tela toda.
 */
export function usePixAutomatico() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const podeAprovar = temPermissao('aprovar_pix_automatico');

  /*
   * ESCOPO desta aba — o que a pessoa VÊ.
   *
   * Antes saía de duas listas de cargo escritas neste arquivo: `ehLider`
   * (`isPerfilAdminOuLider`) decidia se a consulta trazia registros de outras
   * pessoas, e uma lista `CARGOS_MULTI_SETOR` decidia se ela via além do próprio setor.
   * Nenhuma das duas era configurável, então "quem enxerga o quê no Pix" só
   * mudava mexendo em código.
   *
   * O que NÃO passa por aqui, de propósito: aprovar, editar registro alheio,
   * restaurar da lixeira e registrar em nome de outro. Aprovar Pix mexe em
   * comissão — juntar isso com alcance de leitura é exatamente a mistura que
   * esta reestruturação está desfazendo. Essas ações seguem em
   * `aprovar_pix_automatico` e em `podeAgirSobreOutros`, abaixo.
   */
  const niveisPix = useMemo(() => niveisLiberados('pix', temPermissao), [temPermissao]);
  const podeVerTodosSetores = niveisPix.includes('todos_setores');
  /*
   * O nível `setor` precisa de um setor para recortar (15/10/2026). Sem setor
   * no cadastro, `setorEscopo` abaixo virava `null` — e `null` nas consultas é
   * «sem filtro»: o líder sem setor recebia o Pix da EMPRESA inteira. Quem não
   * tem setor e não tem `todos_setores` fica só com os próprios registros.
   */
  const podeVerDeOutros     = niveisPix.includes('setor') && (podeVerTodosSetores || !!perfil?.setor_id);

  /*
   * AÇÃO sobre registro alheio.
   *
   * Era `isPerfilAdminOuLider(cargo)` — a última lista de cargo deste arquivo,
   * declarada como pendência em `docs/PERMISSOES-POR-ABA-PROJETO.md` §5.3.
   * Passa a ser a mesma pergunta do escopo: quem enxerga registro de outra
   * pessoa é quem pode agir sobre ele.
   *
   * Cargo a cargo o resultado é idêntico ao de antes — `pix_escopo_setor` nasceu
   * com exatamente `lider, elite, gerencia, ouvidoria`, e o acesso total cobre o
   * resto. O que muda é que agora dá para separar os dois: tirar `setor` de um
   * cargo tira o botão junto, em vez de esconder a linha e deixar o botão.
   *
   * `todos_setores` entra explicitamente. Sem ele, desligar `setor` e manter
   * `todos_setores` produziria alguém que vê a empresa inteira e não pode tocar
   * em nada — um estado que ninguém pediria de propósito.
   */
  const podeAgirSobreOutros = podeVerDeOutros || podeVerTodosSetores;
  const podeEditarConfig = temPermissao('pix_editar_configuracoes');
  /*
   * Corrigir valor divergente mexe em dinheiro que vai sair, e é anotado em
   * OUTRA pessoa — daí exigir as duas coisas, exatamente como
   * `fn_pix_pode_ajustar_saldo` exige no banco. Se a tela pedisse menos que o
   * banco, o botão apareceria e a gravação falharia sem explicação.
   */
  const podeAjustarSaldo = podeVerDeOutros && temPermissao('pix_ajustar_saldo');

  /*
   * O mês da aba é o do sistema (`MesProvider`) — o mesmo que o Dashboard e o
   * Analítico mostram. Ver o cabeçalho deste arquivo.
   *
   * Fica ANTES dos estados porque a chave do instantâneo precisa dele: sem o
   * mês na chave, voltar para a aba em setembro pintaria a lista de agosto.
   */
  const { mes, setMes } = useMesGlobal();

  const meuSetor = perfil?.setor_id ?? null;
  /**
   * Setor a que o líder está preso.
   *
   * A RLS do Pix libera o líder para a EMPRESA inteira, não para o setor dele —
   * então a tela puxava acordos, operadores e equipes de todos os setores, e o
   * líder do Receptivo via "Digital Amauri", "Isabela" e companhia no filtro de
   * equipes. Cargo multi-setor (gerência, diretoria, admin) continua vendo tudo
   * e escolhendo no filtro de setor; líder/elite ficam no próprio.
   *
   * O fix 54ba8ea do repositório resolveu o mesmo problema com o nome
   * `setorEscopo`; as duas expressões eram idênticas e ficou esta, que já
   * era aplicada também nas consultas de perfis/equipes/setores.
   */
  const setorEscopo = podeVerDeOutros && !podeVerTodosSetores ? meuSetor : null;

  /**
   * A última resposta desta aba, para a volta não custar um esqueleto.
   *
   * Sair do Pix, abrir o Analítico e voltar desmontava tudo: a tela renascia
   * vazia, ligava `loading`, pintava o esqueleto por 400 ms e no fim mostrava
   * exatamente os mesmos números. Quem estava conferindo NR a NR perdia o lugar
   * a cada ida e volta — a queixa de 02/09/2026.
   *
   * Só memória (`persistir` fica no padrão `false` de `gravarInstantaneo`): a
   * lista tem centenas de linhas e serializá-la não pagaria o custo. Memória já
   * resolve a navegação, que é o caso que importa. Ver `cacheInstantaneo`.
   */
  const chaveDados = chaveDeCache(
    'pix-auto-dados', empresa?.id, perfil?.id, setorEscopo, mes,
  );
  const guardado = valorInstantaneo<InstantaneoPix>(chaveDados);

  const [itens, setItens]           = useState<PixAutoAcordo[]>(() => guardado?.itens ?? []);
  const [configs, setConfigs]       = useState<Record<string, PixAutoConfig>>(() => guardado?.configs ?? {});
  const [operadores, setOperadores] = useState<OperadorInfo[]>(() => guardado?.operadores ?? []);
  /*
   * `setor_id` viaja junto, e é ele que faz o recorte por setor existir.
   *
   * Sem a coluna, quem escolhia «Play 3» no filtro continuava vendo as equipes
   * de todos os setores no painel de metas e no seletor de equipe — a lista
   * vinha da empresa inteira e não havia como estreitá-la depois.
   */
  const [equipes, setEquipes]       = useState<EquipeComSetor[]>(() => guardado?.equipes ?? []);
  const [setores, setSetores]       = useState<SetorDaAba[]>(() => guardado?.setores ?? []);
  /** Os setores que a barra oferece: sem setor de sistema, e sem inativo do
   *  mês corrente em diante — mês passado mantém quem existia nele. */
  const setoresDoFiltro = useMemo(() => setoresDosFiltros(setores, { mes }), [setores, mes]);
  /*
   * A composição desta tela veio da FOTO do mês, e não das tabelas de hoje?
   *
   * Serve ao aviso do topo. Sem dizer isso, quem abre agosto e vê uma equipe
   * com o nome antigo (ou alguém numa equipe de que já saiu) conclui que a tela
   * está errada — quando é justamente o contrário.
   */
  const [doRetrato, setDoRetrato]   = useState(false);
  /*
   * NR → quem está com ele hoje.
   *
   * Era um `Set` de NRs bloqueados. Virou mapa quando a duplicidade passou a
   * depender de QUEM é o dono (09/09/2026): o mesmo NR na mão da mesma pessoa
   * é engano e não vai para a fila de autorização; na mão de outra pessoa é o
   * pedido dos dois líderes. Com o Set, a tela não sabia qual dos dois
   * caminhos oferecer.
   */
  const [donosDeNr, setDonosDeNr] = useState<Map<string, DonoDeNrPix[]>>(new Map());
  const nrsBloqueados = useMemo(() => new Set(donosDeNr.keys()), [donosDeNr]);
  const [saldos, setSaldos]         = useState<PixAutoSaldo[]>(() => guardado?.saldos ?? []);
  const [pagamentosPremiacao, setPagamentosPremiacao] = useState<PixPremiacaoPagamento[]>(
    () => guardado?.pagamentos ?? [],
  );
  // Já houve resposta para este recorte? Então não há esqueleto a pintar.
  const [loading, setLoading]       = useState(() => guardado == null);

  const noMesAtual = ehMesAtual(mes);
  /*
   * Mês fechado (01/10/2026): registrar, importar em lote e editar valor/NR de
   * um mês já fechado ficam bloqueados — o banco recusa do mesmo jeito
   * (20261001130000). Avaliar, pagar e corrigir saldo continuam: é a fila do
   * mês passado sendo resolvida, não o mês sendo reescrito.
   */
  const fechamento = useFechamentoMes(mes);
  const inicioDoMes = primeiroDiaDoMes(mes);
  const fimDoMes    = ultimoDiaDoMes(mes);

  /*
   * NR vindo de fora: `/acordos?tab=pix&novo_nr=123`.
   *
   * Quem salva um acordo de PIX Automático ou Cartão Recorrente na lista recebe
   * um aviso de que a comissão ainda depende desta aba, com um botão que traz a
   * pessoa para cá — ver `ModalAvisoPixAutomatico`. O NR já vem digitado; o
   * valor não, porque lá ele é o da PARCELA e aqui é o TOTAL do acordo.
   *
   * O parâmetro é consumido e apagado da URL: sem isso, um F5 meia hora depois
   * reescreveria o campo por cima do que a pessoa tivesse digitado.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  /** O NR que já foi consumido — o parâmetro volta, o preenchimento não. */
  const nrDeForaRef = useRef<string | null>(null);
  /**
   * O NR que chegou pela URL e o formulário ainda não pegou.
   *
   * O formulário mora na sub-aba Registros e só existe lá: ele lê daqui ao
   * montar e avisa com `consumirNrDeFora`, para que voltar à sub-aba depois
   * não reescreva o que a pessoa digitou.
   */
  const [nrDeFora, setNrDeFora] = useState<string | null>(null);
  const consumirNrDeFora = useCallback(() => setNrDeFora(null), []);
  useEffect(() => {
    const nrDaUrl = searchParams.get('novo_nr');
    if (!nrDaUrl) return;

    /*
     * Apagar SEMPRE que ele aparecer, e preencher UMA vez só.
     *
     * Quando esta tela morava dentro de Acordos, a página reescrevia a barra
     * de endereço 400 ms depois de montar e devolvia o `novo_nr` que esta aba
     * acabou de tirar. Desde 16/10/2026 a tela é própria e isso não acontece
     * mais, mas o `ref` fica: qualquer outra volta do parâmetro (o «voltar» do
     * navegador, um link repetido) não pode apagar o que a pessoa digitou.
     */
    const params = new URLSearchParams(searchParams);
    params.delete('novo_nr');
    // O formulário mora na sub-aba Registros: o NR chega e a tela vai até ele.
    params.delete('aba');
    setSearchParams(params, { replace: true });

    if (nrDeForaRef.current === nrDaUrl) return;
    nrDeForaRef.current = nrDaUrl;
    setNrDeFora(nrDaUrl);
    toast.info(`NR ${nrDaUrl} preenchido. Informe o valor TOTAL do acordo e registre.`);
  }, [searchParams, setSearchParams]);

  /*
   * A sub-aba aberta mora na URL (`?aba=divergencias`): o F5 volta para ela, o
   * «voltar» do navegador anda entre elas, e um link pode abrir direto a fila
   * de NR. Registros é a porta — sem parâmetro.
   *
   * O Ranking é só de quem vê o Pix dos outros (o operador enxerga só as
   * próprias linhas, e um pódio de uma pessoa não diz nada): pedido por quem
   * não pode, cai em Registros em vez de abrir uma aba vazia.
   *
   * A Premiação dobrada também (16/10/2026): para o operador ela só repetia o
   * card da comissão dobrada, que já fica em Registros. Saiu da lista dele, e
   * um link antigo com `?aba=premiacao` cai em Registros.
   */
  const abaDaUrl = searchParams.get('aba');
  const subAbaPedida: SubAbaPix = (SUB_ABAS_PIX as readonly string[]).includes(abaDaUrl ?? '')
    ? abaDaUrl as SubAbaPix
    : 'registros';
  const subAba: SubAbaPix = (subAbaPedida === 'ranking' || subAbaPedida === 'premiacao') && !podeVerDeOutros
    ? 'registros'
    : subAbaPedida;
  const trocarSubAba = useCallback((aba: SubAbaPix) => {
    setSearchParams(atual => {
      const params = new URLSearchParams(atual);
      if (aba === 'registros') params.delete('aba'); else params.set('aba', aba);
      return params;
    });
  }, [setSearchParams]);
  useSubAbaUso(subAba);
  /*
   * Dia do registro quando a aba está fora do mês corrente.
   *
   * Sem ele, lançar um acordo olhando agosto criaria uma linha de setembro:
   * ela sumiria da tela no mesmo instante e não entraria em nenhuma conta de
   * agosto. O padrão é o último dia do mês olhado, que é o que a operação faz
   * ao fechar o mês; o calendário não deixa sair do mês.
   */
  const [diaNovo, setDiaNovo] = useState<string>(() => ultimoDiaDoMes(mesAtual()));
  useEffect(() => { setDiaNovo(ultimoDiaDoMes(mes)); }, [mes]);
  /** Fila de NRs duplicados esperando decisao do lider. */
  const [pedidosNr, setPedidosNr] = useState<PixNrPedido[]>([]);
  /*
   * As assinaturas dos pedidos abertos.
   *
   * Consulta à parte porque a tabela de aprovações só entra nos tipos gerados
   * depois da migration 20260909110000 — e porque ela depende dos ids dos
   * pedidos, que só existem depois da consulta anterior.
   */
  const [aprovacoesNr, setAprovacoesNr] = useState<PixNrAprovacao[]>([]);
  /*
   * Os setores por onde EU respondo — cadastro, clones e as equipes que lidero.
   *
   * Vem do banco (`fn_meus_setores`) em vez de sair de `perfil.setor_id`. Líder
   * não se define pelo cadastro: um líder com 6 equipes em 4 setores tem um
   * `setor_id` só, e a tela desenhava botão de assinatura para 1 dos 4 — daí a
   * queixa de que a autorização de dois setores «só aparece para super_admin».
   */
  const [meusSetores, setMeusSetores] = useState<readonly string[]>([]);
  /*
   * Os acordos DA PESSOA que ficaram só na aba Acordos.
   *
   * Sempre do próprio usuário, mesmo para quem vê o Pix do setor inteiro: o
   * aviso existe para que alguém REGISTRE, e quem registra é o dono do acordo.
   * Uma lista com as pendências de dezoito pessoas seria relatório, não aviso.
   */
  const [acordosSemPix, setAcordosSemPix] = useState<AcordoSemRegistroPix[]>([]);
  /*
   * Onde cada operador foi clonado, dentro do escopo — para o registro em nome
   * de um clone cair no setor que está sendo olhado. Ver `setorDoRegistroPix`.
   * Ref, e não estado: só `registrar` lê, e nada na tela redesenha por ela.
   */
  const clonesRef = useRef<Record<string, OndeFoiClonado[]>>({});
  /*
   * Os setores de cada pessoa clonada (cadastro + clones). Estado, e não ref:
   * o filtro da tabela lê, e a linha compartilhada precisa aparecer no foco de
   * setor da diretoria também. Ver `linhaVisivelNoSetor`.
   */
  const [setoresDaPessoa, setSetoresDaPessoa] = useState<Record<string, string[]>>(
    () => guardado?.setoresDaPessoa ?? {},
  );

  /*
   * ── Filtros (líder) ───────────────────────────────────────────────────────
   *
   * Lembrados entre montagens, e não `useState` puro.
   *
   * Sair da aba para conferir um NR, abrir o Analítico, voltar — e a tela
   * reabria com a busca vazia, o status em «todos» e o período limpo. Quem
   * estava validando uma lista nome a nome recomeçava do zero a cada ida e
   * volta, que era a queixa de 02/09/2026.
   *
   * A chave leva empresa e perfil: o depósito é por aba do navegador, e trocar
   * de conta na mesma aba é um caminho real — o filtro de uma pessoa não pode
   * reaparecer na sessão da próxima.
   */
  const chaveAba = chaveDeCache('pix-auto', empresa?.id, perfil?.id);
  const [busca, setBusca]                   = useEstadoLembrado(`${chaveAba}|busca`, '');
  const [filtroStatus, setFiltroStatus]     = useEstadoLembrado<'todos' | PixAutoStatus>(`${chaveAba}|status`, 'todos');
  const [filtroOperador, setFiltroOperador] = useEstadoLembrado(`${chaveAba}|operador`, '');
  const [filtroEquipe, setFiltroEquipe]     = useEstadoLembrado(`${chaveAba}|equipe`, '');
  const [filtroSetor, setFiltroSetor]       = useEstadoLembrado(`${chaveAba}|setor`, '');
  // Pagamento e período — os dois valem para operador e líder: o operador
  // precisa saber o que já caiu, o líder precisa achar o que registrou na
  // semana passada sem rolar a lista inteira.
  const [filtroPagamento, setFiltroPagamento] = useEstadoLembrado<FiltroPagamento>(`${chaveAba}|pagamento`, 'todos');
  const [dataDe, setDataDe]   = useEstadoLembrado(`${chaveAba}|data-de`, '');
  const [dataAte, setDataAte] = useEstadoLembrado(`${chaveAba}|data-ate`, '');

  // Seleção múltipla (líder): a tabela marca, a barra de lote age.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Meta / quartil do operador logado (card de bônus)
  const [metaValor, setMetaValor]   = useState<number | null>(null);
  const [configMes, setConfigMes]   = useState<MetasConfigMes | null>(null);
  /** Setores com dias úteis próprios — a conta de cada setor usa os dele. */
  const [diasPorSetor, setDiasPorSetor] = useState<DiasUteisPorSetor>({});
  const [recebidoMes, setRecebidoMes] = useState<number | null>(null);
  /*
   * Meta de recebimento e recebido do mes, POR OPERADOR.
   *
   * E o segundo requisito da comissao dobrada, e sem ele o painel do lider
   * mostrava a comissao simples de quem tinha direito ao dobro — o defeito de
   * 02/09/2026. A meta de ACORDOS por setor nao substitui esta: sao os dois
   * requisitos, e os dois precisam fechar.
   */
  const [metaPorOperador, setMetaPorOperador] =
    useState<Record<string, { metaValor: number | null; recebidoMes: number | null }>>({});

  // Meta de Pix do setor (independente do recebimento)
  const [metasPix, setMetasPix]         = useState<PixAutoMeta[]>([]);

  /*
   * Equipe e setor de cada operador.
   *
   * Sobem para cá porque o recorte por setor passou a depender do mapa: uma
   * linha sem carimbo de setor cai no setor ATUAL do operador, e sem isso ela
   * sumiria do ranking e dos painéis enquanto continuava na tabela — os dois
   * discordando sobre o que é «do setor». Ver `setorDaLinhaPix`.
   */
  const operadorEquipe = useMemo(() => mapaOperadorEquipe(operadores), [operadores]);
  const operadorSetor  = useMemo(() => mapaOperadorSetor(operadores),  [operadores]);

  /**
   * Os setores que TIVERAM movimento no mês — as abas do ranking e o alvo do
   * padrão da barra. Ver `setoresComAcordosPix`.
   */
  const setoresComMovimento = useMemo(
    () => setoresComAcordosPix(itens, setoresDoFiltro, mes, operadorSetor),
    [itens, setoresDoFiltro, mes, operadorSetor],
  );

  /**
   * Em que setor a aba abre para quem enxerga mais de um.
   *
   * Prefere um setor COM movimento, porque abrir num setor parado mostra
   * painéis vazios e faz a pessoa procurar o defeito onde só faltou volume. Sem
   * nenhum com movimento, cai na lista inteira — melhor um setor quieto que
   * nenhum.
   */
  const setorPadrao = useMemo(
    () => escolherSetorInicial(setoresComMovimento, meuSetor)
       ?? escolherSetorInicial(setoresDoFiltro, meuSetor),
    [setoresComMovimento, setoresDoFiltro, meuSetor],
  );

  /**
   * O setor que a tela está OLHANDO. `null` = todos.
   *
   * Três estados, não dois: o setor escolhido, «todos» escolhido
   * (`TODOS_SETORES`) e ninguém escolheu ainda (`''`) — este último resolve no
   * padrão. Enquanto «todos» era o padrão, os dois últimos eram a mesma coisa;
   * deixaram de ser quando a aba passou a abrir num setor.
   *
   * ## Por que a aba deixou de abrir em «todos»
   *
   * Com «todos» a tela empilhava um painel de metas por setor, a fila de NRs da
   * empresa e a lista inteira num scroll só. Era a queixa de 05/09/2026: para
   * apresentar um número à diretoria era preciso rolar procurando. Um setor de
   * cada vez cabe na tela; «todos» continua a um clique, para comparar.
   */
  const setorFoco = podeVerTodosSetores
    ? (filtroSetor === TODOS_SETORES ? null : (filtroSetor || setorPadrao))
    : meuSetor;

  /**
   * Setor cuja configuração (% e interruptor) está em edição.
   *
   * Segue o foco, e cai no próprio setor quando o foco é «todos»: editar o
   * percentual precisa de um alvo concreto, e «todos os setores» não é um.
   */
  const setorConfig = podeVerTodosSetores ? (setorFoco ?? meuSetor) : meuSetor;

  /**
   * As equipes do setor em foco.
   *
   * A consulta traz a empresa inteira para quem enxerga mais de um setor, e sem
   * este recorte filtrar «Play 3» deixava no painel de metas e no seletor de
   * equipe as equipes de todos os setores — o defeito relatado em 02/09/2026.
   *
   * Equipe sem setor cadastrado fica de fora de qualquer recorte: ela não
   * pertence a setor nenhum, e colocá-la em todos seria pior que omiti-la.
   */
  const equipesDoFoco = useMemo(
    () => (setorFoco ? equipes.filter(e => e.setor_id === setorFoco) : equipes),
    [equipes, setorFoco],
  );

  /*
   * Trocar de setor solta a equipe escolhida no setor anterior.
   *
   * Sem isto, escolher «Play 3» com uma equipe do Receptivo ainda selecionada
   * cruzaria dois recortes impossíveis e devolveria lista vazia — parecendo
   * «não há acordos» quando o filtro é que era contraditório. O seletor nem
   * mostraria a equipe culpada, porque ela já não está na lista do setor novo.
   *
   * Só age quando a equipe some da lista: enquanto ela pertencer ao foco, a
   * escolha de quem está olhando fica de pé.
   */
  useEffect(() => {
    if (!filtroEquipe) return;
    if (equipes.length === 0) return;   // listas ainda não chegaram
    if (equipesDoFoco.some(e => e.id === filtroEquipe)) return;
    setFiltroEquipe('');
  }, [filtroEquipe, equipes, equipesDoFoco, setFiltroEquipe]);

  // Setor lembrado que saiu do filtro (inativado, ou de sistema): volta ao
  // padrão em vez de deixar a aba presa num setor que a barra não mostra.
  useEffect(() => {
    if (!podeVerTodosSetores || !filtroSetor || filtroSetor === TODOS_SETORES) return;
    if (setores.length === 0) return;   // lista ainda não chegou
    if (setoresDoFiltro.some(s => s.id === filtroSetor)) return;
    setFiltroSetor('');
  }, [podeVerTodosSetores, filtroSetor, setores, setoresDoFiltro, setFiltroSetor]);

  /*
   * A config que entra na CONTA do mês (31/10/2026). Mês fechado: a que o
   * retrato guardou (`composicao_mes_config.pix_config`) — mudar o percentual
   * ou a meta da dobra em novembro não reescreve outubro. Mês aberto: a de hoje.
   * O editor de config continua sobre `configs` (é o que se grava).
   */
  const [configsDoMes, setConfigsDoMes] = useState<Record<string, PixAutoConfig> | null>(null);
  useEffect(() => {
    let vivo = true;
    setConfigsDoMes(null);
    void buscarConfigDoMes(empresa?.id, mes).then(cfg => {
      if (!vivo || !cfg) return;
      const mapa: Record<string, PixAutoConfig> = {};
      for (const c of cfg.pixConfig as unknown as PixAutoConfig[]) {
        mapa[c.setor_id] = { ...c, permite_registro_operador: c.permite_registro_operador ?? true };
      }
      setConfigsDoMes(mapa);
    });
    return () => { vivo = false; };
  }, [empresa?.id, mes]);
  const configsDaConta = configsDoMes ?? configs;

  const pctPorSetor = useMemo(() => {
    const m: Record<string, number> = {};
    Object.values(configsDaConta).forEach(c => { m[c.setor_id] = Number(c.pct); });
    return m;
  }, [configsDaConta]);
  /** O percentual de HOJE — o do editor e o do registro novo. */
  const pctPorSetorHoje = useMemo(() => {
    const m: Record<string, number> = {};
    Object.values(configs).forEach(c => { m[c.setor_id] = Number(c.pct); });
    return m;
  }, [configs]);

  const pctDoMeuSetor = meuSetor != null
    ? (pctPorSetorHoje[meuSetor] ?? PIX_AUTO_PCT_PADRAO)
    : PIX_AUTO_PCT_PADRAO;
  const pctSetorConfig = setorConfig != null
    ? (pctPorSetorHoje[setorConfig] ?? PIX_AUTO_PCT_PADRAO)
    : PIX_AUTO_PCT_PADRAO;
  const registroLigadoSetorConfig = setorConfig != null
    ? (configs[setorConfig]?.permite_registro_operador ?? true)
    : true;
  // Meta de acordos da dobra do setor em edição. Sem config gravada, o padrão
  // da operação (18) — o mesmo default da coluna.
  const metaDobraSetorConfig = setorConfig != null
    ? (Number(configs[setorConfig]?.meta_acordos_dobra) || PIX_META_ACORDOS_DOBRA)
    : PIX_META_ACORDOS_DOBRA;
  // Operador só registra com o interruptor do PRÓPRIO setor ligado
  const podeRegistrar = podeAgirSobreOutros
    || meuSetor == null
    || (configs[meuSetor]?.permite_registro_operador ?? true);
  /*
   * Marcar a premiação como paga.
   *
   * Era `PERFIL_NIVEL[cargo] >= PERFIL_NIVEL.gerencia` — a última decisão por
   * cargo deste arquivo, e hierarquia de cargo é a mesma coisa que nome de
   * cargo com outra roupa: promover alguém a «paga a premiação» exigia mexer em
   * código. O banco cobrava o mesmo por conta própria (`fn_user_has_any_role`),
   * então os dois lados foram convertidos juntos — pedir menos aqui do que a
   * RPC cobra lá faria o botão aparecer e a gravação falhar sem explicação.
   *
   * O par com `podeVerDeOutros` é o mesmo de `podeAjustarSaldo`, e pelo mesmo
   * motivo: a premiação marcada é de OUTRA pessoa.
   */
  const podeMarcarPremiacaoPaga =
    podeVerDeOutros && temPermissao('pix_marcar_premiacao_paga');

  /*
   * `carregar` é chamada depois de TODA ação da aba: aprovar, pagar, excluir,
   * editar, aplicar correção. Enquanto ela ligava `loading`, cada clique
   * apagava a tela — cards, filtros e as 100 linhas — para redesenhar quase
   * tudo igual, e quem tinha rolado até o meio voltava ao topo.
   *
   * Agora o esqueleto vale para a primeira carga e para a troca de escopo. A
   * releitura das ações passa por `reconciliarLista`: só a linha que mudou é
   * substituída, e as outras 99 mantêm a mesma referência.
   *
   * «Primeira carga» é a primeira DESTE recorte, e não a primeira montagem: com
   * um instantâneo em mãos a tela já está pintada, e ligar `loading` para
   * substituí-la por barras cinzas seria desfazer o que o instantâneo veio
   * fazer.
   */
  const primeiraCargaPix = useRef(guardado == null);

  /*
   * O que `carregar` NÃO refaz a cada clique (16/10/2026).
   *
   * Ela roda depois de toda ação — aprovar, pagar, excluir —, e a cada uma
   * relia também o que quase nunca muda: operadores, equipes, setores e o
   * retrato do mês, além de disparar o expurgo dos desaprovados (uma ESCRITA).
   * Um líder aprovando 40 linhas fazia 40 vezes as três consultas de cadastro
   * e 40 expurgos idênticos.
   *
   *   • expurgo ........ uma vez por abertura da tela (o job das 05h20 no banco
   *                      é quem cobra o prazo de verdade — ver a migration
   *                      20260909100100; aqui é só o reforço de quem abre);
   *   • cadastro ....... na primeira carga do recorte, na troca de recorte, e
   *                      depois de 5 minutos — gente nova entra sem F5, mas
   *                      não a cada clique.
   */
  const expurgoFeitoRef = useRef(false);
  const estruturaRef = useRef<{
    chave: string; em: number;
    ops: OperadorInfo[]; eqs: EquipeComSetor[]; sets: SetorDaAba[];
  } | null>(null);

  const carregar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    const comEsqueleto = primeiraCargaPix.current;
    if (comEsqueleto) setLoading(true);
    try {
      const estrutura = estruturaRef.current;
      const precisaEstrutura = podeVerDeOutros && (
        !estrutura || estrutura.chave !== chaveDados || Date.now() - estrutura.em > 5 * 60_000
      );
      const fazExpurgo = podeVerDeOutros && !expurgoFeitoRef.current;
      expurgoFeitoRef.current = expurgoFeitoRef.current || fazExpurgo;

      /*
       * Fase 1, tudo junto: o que não depende de nada.
       *
       * Expurgo dos desaprovados vencidos ANTES de listar — só líder+ tem a
       * policy. O try/catch é a segunda trava: o expurgo é acessório, a
       * listagem é a tela. Enquanto ele estourava (RPC ainda não aplicada no
       * banco), a exceção abortava o `carregar` inteiro e a aba aparecia VAZIA
       * — com 73 pendentes e 148 aprovados intactos no banco.
       *
       * Os clones vêm junto, ANTES da lista: é deles que sai quem tem Pix
       * compartilhado entre dois setores. Ver «Linha compartilhada» em
       * pixAutomaticoView.
       *
       * O cadastro (nomes/equipes/setores para filtros, vínculo e coluna
       * Operador) também não depende da lista, e entra aqui em vez de esperar
       * por ela. Preso ao setor do líder — ver `setorEscopo`. `foto_url` entra
       * por causa do pódio do ranking — ver `PixRankingSetor`.
       */
      const consultaEstrutura = precisaEstrutura ? (() => {
        let qOps = supabase.from('perfis')
          .select('id, nome, equipe_id, setor_id, perfil, foto_url')
          .eq('empresa_id', empresa.id);
        let qEqs = supabase.from('equipes').select('id, nome, setor_id')
          .eq('empresa_id', empresa.id);
        let qSets = supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO)
          .eq('empresa_id', empresa.id);
        if (setorEscopo) {
          qOps  = qOps.eq('setor_id', setorEscopo);
          qEqs  = qEqs.eq('setor_id', setorEscopo);
          qSets = qSets.eq('id', setorEscopo);
        }
        return Promise.all([
          qOps.order('nome'), qEqs.order('nome'), qSets.order('nome'),
          // Mês fechado tem foto. Ver `fetchRetratoPixDoMes`.
          ehMesAtual(mes) ? Promise.resolve(null) : fetchRetratoPixDoMes(empresa.id, mes),
        ]);
      })() : null;

      const [, vinculos, meus] = await Promise.all([
        fazExpurgo
          ? expurgarDesaprovadosVencidos(empresa.id).catch(e => {
              console.warn('[PixAutomatico] expurgo dos desaprovados:', e);
            })
          : Promise.resolve(),
        podeVerDeOutros ? lerVinculosDeClone(empresa.id) : Promise.resolve([]),
        fetchMeusSetores(),
      ]);
      const setoresDaPessoa = setoresPorPessoaClonada(vinculos);
      const compartilhadas = setorEscopo
        ? pessoasCompartilhadasCom(setoresDaPessoa, setorEscopo)
        : [];

      // ── Fase 2: as listas (dependem dos clones) ──
      const [listaDoSetor, listaCompartilhada, cfgs, bloqueados, saldosDoEscopo, pedidos, pagamentos] = await Promise.all([
        fetchAcordosPix(empresa.id, podeVerDeOutros
          ? { setorId: setorEscopo }
          : { operadorId: perfil.id }),
        // O Pix das pessoas clonadas carimbado no OUTRO setor delas — o que a
        // consulta por carimbo acima não alcança. Lista vazia não vai ao banco.
        fetchAcordosPix(empresa.id, { operadorIds: compartilhadas }),
        fetchConfigsPix(empresa.id),
        fetchDonosDeNrPix(empresa.id),
        // Mesmo recorte da lista: o operador vê o próprio saldo (ele precisa
        // saber que há um acerto no nome dele), o líder vê os do setor.
        fetchSaldosPix(empresa.id, podeVerDeOutros
          ? { setorId: setorEscopo }
          : { operadorId: perfil.id }),
        // A RLS recorta por PERMISSÃO, e quem aprova Pix aprova na empresa
        // inteira — por isso o líder preso a um setor pede o setor dele aqui.
        // Sem isto ele recebia para decidir NR de setor que não acompanha.
        // O foco fino (a barra de setores) recorta depois, sem ir ao banco.
        fetchPedidosNr(empresa.id, { setorId: setorEscopo }),
        podeVerDeOutros
          ? fetchPremiacoesPagamento(empresa.id, mes)
          : Promise.resolve([]),
      ]);
      // As assinaturas de quem já decidiu um lado. Fila vazia não vai ao banco.
      // Sai já, e corre junto com o processamento abaixo.
      const assinaturasP = fetchAprovacoesPedidosNr(pedidos.map(x => x.id));

      const lista = setorEscopo
        ? juntarLinhasCompartilhadas(listaDoSetor, listaCompartilhada, setorEscopo, setoresDaPessoa)
        : listaDoSetor;
      setSetoresDaPessoa(atual => mapasDeSetoresIguais(atual, setoresDaPessoa) ? atual : setoresDaPessoa);
      // Reconciliação: a linha que não mudou volta com a MESMA referência, e
      // uma releitura sem novidade devolve o array anterior — nesse caso o
      // React não renderiza nada. Ver `lib/dadosVivos`.
      setItens(atual => reconciliarLista(atual, lista, { chave: i => i.id }));
      setSaldos(atual => reconciliarLista(atual, saldosDoEscopo, { chave: s => s.id }));
      setPedidosNr(atual => reconciliarLista(atual, pedidos, { chave: x => x.id }));
      setMeusSetores(meus);
      setPagamentosPremiacao(atual => reconciliarLista(
        atual, pagamentos, { chave: x => x.id },
      ));
      const mapa: Record<string, PixAutoConfig> = {};
      cfgs.forEach(c => { mapa[c.setor_id] = { ...c, permite_registro_operador: c.permite_registro_operador ?? true }; });
      setConfigs(atual => reconciliarMapa(atual, mapa));
      // O Set é reconstruído a cada leitura; sem esta comparação todo consumidor
      // dele re-renderizaria a cada ação, com o mesmo conteúdo dentro.
      setDonosDeNr(atual => donosIguais(atual, bloqueados) ? atual : bloqueados);

      let listaOps: OperadorInfo[] = estrutura?.ops ?? [];
      let listaEqs: EquipeComSetor[] = estrutura?.eqs ?? [];
      let listaSets: SetorDaAba[] = estrutura?.sets ?? [];

      if (podeVerDeOutros) {
        // Clone não muda o setor do cadastro — ver «Clones» em pixAutomaticoView.
        // O setor de cada equipe vem do próprio vínculo, e não de `listaEqs`:
        // esta já está presa ao setor do líder, e o líder do Receptivo perderia
        // de vista onde a pessoa dele foi clonada. Recalculado a cada carga: os
        // vínculos acabaram de ser lidos, e a conta não vai ao banco.
        const clones = clonesPorOperador(
          vinculos,
          vinculos.map(v => ({ id: v.equipe_id, setor_id: v.setor_da_equipe })),
        );
        clonesRef.current = clones;
      }

      if (consultaEstrutura) {
        const [{ data: ops }, { data: eqs }, { data: sets }, retrato] = await consultaEstrutura;
        listaOps  = (ops  ?? []) as OperadorInfo[];
        listaEqs  = (eqs  ?? []) as EquipeComSetor[];
        // `tipo` (fase 6) ainda não está em `database.types.ts`.
        listaSets = (sets ?? []) as unknown as SetorDaAba[];

        /*
         * O líder preso a um setor alternativo (Treinamento) não tem operador
         * nenhum com `setor_id` dele: são todos clones. Sem esta leitura, o
         * vínculo abria vazio e ele não registrava Pix para ninguém.
         */
        if (setorEscopo) {
          const clones = clonesRef.current;
          const naLista = new Set(listaOps.map(o => o.id));
          const faltando = Object.keys(clones).filter(id =>
            !naLista.has(id) && clones[id].some(c => c.setor_id === setorEscopo));
          let perfisDosClones: OperadorInfo[] = [];
          if (faltando.length > 0) {
            const { data } = await supabase.from('perfis')
              .select('id, nome, equipe_id, setor_id, perfil, foto_url')
              .in('id', faltando);
            perfisDosClones = (data ?? []) as OperadorInfo[];
          }
          listaOps = incluirClonesDoSetor(listaOps, perfisDosClones, clones, setorEscopo);
        }

        /*
         * Mês fechado: o AGRUPAMENTO vem do retrato, não das tabelas de hoje.
         *
         * As três listas acima são a configuração de AGORA. Usá-las para
         * desenhar agosto espalha os números de agosto pela estrutura de
         * setembro — operador na equipe para a qual mudou depois, equipe com o
         * nome novo, setor renomeado, e o ranking somando gente que naquele mês
         * estava noutro lugar. É o mesmo defeito que o Desempenho Equipes
         * corrigiu em 02/09/2026, e a foto é a mesma.
         *
         * Sem retrato (mês antigo sem foto), segue ao vivo: é o comportamento
         * anterior, e é melhor que uma aba vazia.
         */
        setDoRetrato(!!retrato);
        if (retrato) {
          const nomesCongelados: Record<string, string> = {};
          for (const i of lista) {
            if (i.operador_nome) nomesCongelados[i.operador_id] = i.operador_nome;
          }
          const corrigido = aplicarRetratoPix(listaOps, retrato, nomesCongelados);
          listaOps = corrigido.operadores;
          // O escopo do líder continua valendo — ele é permissão, não recorte
          // de mês. Aplicado sobre o setor DAQUELE mês, que é o que a foto diz.
          listaEqs = (setorEscopo
            ? corrigido.equipes.filter(e => e.setor_id === setorEscopo)
            : corrigido.equipes) as EquipeComSetor[];
          // O retrato traz o nome do mês; `ativo`/`tipo` são de hoje, e é hoje
          // que decide se o setor ainda entra no filtro.
          const cadastro = new Map(listaSets.map(s => [s.id, s]));
          listaSets = (setorEscopo
            ? corrigido.setores.filter(s => s.id === setorEscopo)
            : corrigido.setores
          ).map(s => ({ ...s, ativo: cadastro.get(s.id)?.ativo, tipo: cadastro.get(s.id)?.tipo }));
        }

        estruturaRef.current = {
          chave: chaveDados, em: Date.now(), ops: listaOps, eqs: listaEqs, sets: listaSets,
        };
        setOperadores(atual => reconciliarLista(atual, listaOps, { chave: o => o.id }));
        setEquipes(atual => reconciliarLista(atual, listaEqs, { chave: e => e.id }));
        setSetores(atual => reconciliarLista(atual, listaSets, { chave: x => x.id }));
      }

      const assinaturas = await assinaturasP;
      setAprovacoesNr(atual => reconciliarLista(atual, assinaturas, { chave: a => a.id }));

      // O retrato para a próxima montagem. Ver `chaveDados`.
      gravarInstantaneo<InstantaneoPix>(chaveDados, {
        itens: lista,
        configs: mapa,
        operadores: listaOps,
        equipes: listaEqs,
        setores: listaSets,
        saldos: saldosDoEscopo,
        setoresDaPessoa,
        pagamentos: pagamentos as PixPremiacaoPagamento[],
      });
    } finally {
      if (comEsqueleto) setLoading(false);
      primeiraCargaPix.current = false;
    }
  }, [empresa?.id, perfil?.id, podeVerDeOutros, setorEscopo, mes, chaveDados]);

  /*
   * Recorte novo (outro mês, outro setor, outra empresa) é conteúdo novo.
   *
   * Duas saídas, e a diferença entre elas é ter ou não um retrato do recorte
   * NOVO. Com retrato, a tela troca para ele na hora e a rede corrige em
   * silêncio. Sem retrato, o esqueleto volta — porque o que está pintado é a
   * resposta de OUTRA pergunta, e deixá-lo no lugar seria apresentá-lo como
   * resposta desta.
   *
   * A primeira execução não faz nada de novo: os estados já nasceram com o
   * mesmo retrato, e reaplicá-lo devolveria os mesmos objetos.
   */
  useEffect(() => {
    const retrato = valorInstantaneo<InstantaneoPix>(chaveDados);
    primeiraCargaPix.current = retrato == null;
    if (!retrato) return;
    setItens(atual => reconciliarLista(atual, retrato.itens, { chave: i => i.id }));
    setConfigs(atual => reconciliarMapa(atual, retrato.configs));
    setOperadores(atual => reconciliarLista(atual, retrato.operadores, { chave: o => o.id }));
    setEquipes(atual => reconciliarLista(atual, retrato.equipes, { chave: e => e.id }));
    setSetores(atual => reconciliarLista(atual, retrato.setores, { chave: s => s.id }));
    setSaldos(atual => reconciliarLista(atual, retrato.saldos, { chave: s => s.id }));
    setPagamentosPremiacao(atual => reconciliarLista(
      atual, retrato.pagamentos, { chave: p => String(p.id) },
    ));
    setLoading(false);
  }, [chaveDados]);

  /*
   * A primeira pintura da tabela não anima.
   *
   * O comportamento antigo escalonava a entrada das 100 linhas por índice, e
   * como a lista era refeita a cada ação, aprovar um acordo redesenhava a
   * tabela inteira em cascata. Agora só quem CHEGA se move.
   */
  const jaPintouPix = useRef(false);
  useEffect(() => { if (!loading) jaPintouPix.current = true; }, [loading]);

  useEffect(() => { carregar(); }, [carregar]);

  // Meta do mês + config de quartis + recebido no analítico (card de bônus)
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!empresa?.id || !perfil?.id) return;
      // Do MÊS OLHADO, não de hoje: em setembro, olhando agosto, a dobra tem
      // de ser conferida contra a meta e o recebido de agosto.
      const { ano, mes: mesNum } = partesDoMes(mes);
      const mesStr = mes;
      try {
        const [{ data: metasRows }, cfg, resumo] = await Promise.all([
          // TODAS as metas de operador do mes, e nao so a minha: o painel do
          // lider precisa saber quem bateu a meta para saber quem dobra.
          supabase.from('metas').select('referencia_id, meta_valor')
            .eq('tipo', 'operador')
            .eq('empresa_id', empresa.id).eq('mes', mesNum).eq('ano', ano),
          getMetasConfig(empresa.id, mesNum, ano),
          buscarResumoOperadoresAnalitico(empresa.id, mesStr),
        ]);
        if (cancelado) return;

        const linhasMeta = (metasRows ?? []) as { referencia_id: string; meta_valor: number }[];
        const minhaMeta = linhasMeta.find(m => m.referencia_id === perfil.id);
        setMetaValor(minhaMeta ? Number(minhaMeta.meta_valor) || null : null);
        setConfigMes(cfg.data);
        setDiasPorSetor(cfg.porSetor ?? {});
        const minha = resumo.data.find(r => r.operador_id === perfil.id);
        setRecebidoMes(minha ? Number(minha.total_recebido) || 0 : 0);

        // Cruza meta com recebido. Quem tem uma das duas pontas entra: sem
        // meta a dobra nao fecha (e correto), e sem recebido o valor e zero.
        const recebidoPor = new Map(
          resumo.data.map(r => [r.operador_id, Number(r.total_recebido) || 0]),
        );
        const mapa: Record<string, { metaValor: number | null; recebidoMes: number | null }> = {};
        for (const m of linhasMeta) {
          mapa[m.referencia_id] = {
            metaValor: Number(m.meta_valor) || null,
            recebidoMes: recebidoPor.get(m.referencia_id) ?? 0,
          };
        }
        setMetaPorOperador(mapa);
      } catch { /* sem meta/config → card não aparece */ }
    })();
    return () => { cancelado = true; };
  }, [empresa?.id, perfil?.id, mes]);

  /*
   * O que a pessoa tabulou como PIX Automático / Cartão Recorrente na aba
   * Acordos e ainda não registrou aqui.
   *
   * Depende de `itens` porque a comparação é com os NRs que ELA já registrou:
   * o mesmo NR na mão de outra pessoa não quita pendência nenhuma — ao
   * contrário, é o caso que vira pedido de autorização.
   *
   * Falha em silêncio: é um aviso, e um aviso que derruba a aba é pior que a
   * ausência dele.
   */
  useEffect(() => {
    let cancelado = false;
    if (!empresa?.id || !perfil?.id) { setAcordosSemPix([]); return; }

    const meusNrs = new Set(
      itens.filter(i => i.operador_id === perfil.id).map(i => normalizarNr(i.nr_cliente)),
    );

    void (async () => {
      try {
        const pendentes = await fetchAcordosRecorrentesSemPix({
          empresaId: empresa.id,
          mes,
          operadorId: perfil.id,
          nrsDoOperador: meusNrs,
        });
        if (cancelado) return;
        setAcordosSemPix(atual => reconciliarLista(atual, pendentes, { chave: a => a.id }));
      } catch (e) {
        console.warn('[PixAutomatico] acordos sem registro no Pix:', e);
      }
    })();
    return () => { cancelado = true; };
  }, [empresa?.id, perfil?.id, mes, itens]);

  // Metas de Pix das EQUIPES do setor em foco. A meta do setor é a soma
  // delas — não existe uma linha "do setor" para carregar.
  const carregarMetaPix = useCallback(async () => {
    if (!empresa?.id) { setMetasPix([]); return; }
    /*
     * `setorFoco` nulo lê TODOS os setores, e não nenhum.
     *
     * Era `if (!setorConfig) return []`, e por isso o painel de metas não
     * existia para o super admin sem setor no cadastro: ele nunca escolhia um
     * setor, a leitura desistia, e a tela não tinha o que mostrar.
     */
    // A meta é gravada POR MÊS. Ler sempre o mês de hoje foi o que fez a meta
    // de agosto "sumir" no dia 1º de setembro: ela nunca saiu do banco — a
    // tela é que passou a perguntar por outro mês.
    const { ano, mes: mesNum } = partesDoMes(mes);
    const metas = await fetchMetasPixEquipes(empresa.id, setorFoco, mesNum, ano);
    setMetasPix(metas);
  }, [empresa?.id, setorFoco, mes]);

  useEffect(() => { void carregarMetaPix(); }, [carregarMetaPix]);

  // ── Derivados ───────────────────────────────────────────────────────────
  // Filtro de operador só lista OPERADORES (sem líder/gerência/diretoria etc.)
  const operadoresFiltro = useMemo(() => apenasOperadores(operadores), [operadores]);
  // O seletor da barra segue a equipe (e o setor) escolhidos. Ver
  // `operadoresDoRecorte`.
  const operadoresDoSeletor = useMemo(
    () => operadoresDoRecorte(
      operadoresFiltro,
      { equipeId: filtroEquipe, setorId: setorEscopo ?? setorFoco },
      { porEquipe: operadorEquipe, porSetor: operadorSetor, setoresDaPessoa },
      itens,
    ),
    [operadoresFiltro, filtroEquipe, setorEscopo, setorFoco, operadorEquipe, operadorSetor,
     setoresDaPessoa, itens],
  );

  // Trocar de equipe/setor solta o operador que ficou de fora — mesma razão
  // da equipe solta ao trocar de setor, logo acima.
  useEffect(() => {
    if (!filtroOperador) return;
    if (operadoresFiltro.length === 0) return;   // listas ainda não chegaram
    if (operadoresDoSeletor.some(o => o.id === filtroOperador)) return;
    setFiltroOperador('');
  }, [filtroOperador, operadoresFiltro, operadoresDoSeletor, setFiltroOperador]);

  const visiveis = useMemo(
    () => filtrarItensPix(
      itens,
      { busca, status: filtroStatus, operadorId: filtroOperador,
        equipeId: filtroEquipe, setorId: setorEscopo ?? setorFoco,
        pagamento: filtroPagamento, de: dataDe, ate: dataAte, mes },
      { porEquipe: operadorEquipe, porSetor: operadorSetor, setoresDaPessoa },
    ),
    [itens, busca, filtroStatus, filtroOperador, filtroEquipe, setorFoco,
     filtroPagamento, dataDe, dataAte, mes, setorEscopo, operadorEquipe, operadorSetor,
     setoresDaPessoa],
  );

  // ── Paginação da tabela ─────────────────────────────────────────────────
  // De EXIBIÇÃO, não de consulta: `visiveis` continua sendo o filtro inteiro,
  // e é ele que alimenta os totais. A fatia existe para a tabela não desenhar
  // milhares de <tr> de uma vez.
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / PIX_LINHAS_POR_PAGINA));
  // Mexer no filtro encurta a lista; sem isto quem estava na página 7 ficaria
  // olhando uma tabela vazia sem entender por quê.
  const paginaAtual = Math.min(pagina, totalPaginas);
  useEffect(() => { setPagina(1); }, [
    busca, filtroStatus, filtroOperador, filtroEquipe, filtroSetor,
    filtroPagamento, dataDe, dataAte, mes,
  ]);

  const daPagina = useMemo(
    () => visiveis.slice(
      (paginaAtual - 1) * PIX_LINHAS_POR_PAGINA,
      paginaAtual * PIX_LINHAS_POR_PAGINA,
    ),
    [visiveis, paginaAtual],
  );

  // Totais SEMPRE sobre o conjunto visível (líder filtrando vê o recorte)
  const totais = useMemo(() => totaisPorStatus(visiveis, pctPorSetor), [visiveis, pctPorSetor]);
  // Pago × a pagar: o operador via "Aprovado R$ 105,49" e recebia R$ 50,00 sem
  // nada na tela explicando a diferença. Agora os dois números aparecem.
  const pagamento = useMemo(() => totalPagoPix(visiveis, pctPorSetor), [visiveis, pctPorSetor]);


  const meusDesaprovados = itens.filter(i =>
    i.operador_id === perfil?.id
    && i.status === 'desaprovado'
    && noMesPix(i.criado_em, mes)).length;

  // ── Saldo de divergência ────────────────────────────────────────────────
  // O acerto do Pix que saiu com valor errado. Ver `PixSaldoPainel` e a
  // migration 20260823080000.
  const saldoPorOperador = useMemo(() => saldosPorOperador(saldos), [saldos]);

  /** NR de cada acordo — a lista de saldos mostra onde a correção está presa. */
  const nrPorAcordo = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of itens) m[i.id] = i.nr_cliente;
    return m;
  }, [itens]);

  // ── Bônus por meta (card dinâmico) ──────────────────────────────────────
  // O que o operador já recebeu de comissão APROVADA no mês é pago DE NOVO se
  // ele bater a meta. Estado do card vem da meta + quartis configurados:
  //   • meta batida → valor garantido (verde)
  //   • 1º quartil  → projetando a meta, mensagem de incentivo (azul)
  //   • demais      → informativo (destaque do tema)
  const bonusMeta = useMemo(() => calcularBonusMeta({
    operadorId: perfil?.id, itens, pctPorSetor, metaValor, recebidoMes,
    // Os dias úteis do setor de quem olha (a exceção dele, se houver).
    configMes: configComDiasDoSetor(configMes, diasPorSetor, meuSetor),
    // Mês e "hoje" de São Paulo, não do relógio de quem abre a tela.
    mes, hojeISO: getTodayISO(),
  }), [perfil?.id, itens, pctPorSetor, metaValor, configMes, diasPorSetor, meuSetor, recebidoMes, mes]);

  // ── Comissão dobrada: meta de acordos do setor + meta do mês ────────────
  // Sempre sobre os acordos do próprio usuário, mesmo quando ele é líder e a
  // lista mostra o setor inteiro: a dobra é individual. São DOIS requisitos —
  // a quantidade de acordos e a meta de recebimento —, e a meta vem do mesmo
  // par (meta do mês, recebido no analítico) que alimentava o card de bônus.
  // A meta de acordos deixou de ser 18 fixo: cada setor tem a sua
  // (`pix_automatico_config.meta_acordos_dobra`, migration 20260810c).
  const metaPorSetor = useMemo(
    () => metasDobraPorSetor(Object.values(configsDaConta)),
    [configsDaConta],
  );

  const dobra = useMemo(
    () => calcularDobraComissao(itens, perfil?.id, pctPorSetor, mes, {
      metaValor, recebidoMes,
    }, metaPorSetor),
    [itens, perfil?.id, pctPorSetor, metaValor, recebidoMes, metaPorSetor, mes],
  );

  // ── Ranking do setor ────────────────────────────────────────────────────
  // Sobre `itens` (o setor inteiro do líder), não sobre `visiveis`: o ranking é
  // do setor, e mudar o filtro de status não pode reescrever a classificação.
  const nomePorOperador = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operadores) m[o.id] = o.nome;
    return m;
  }, [operadores]);

  /**
   * Os acordos do líder que CONTAM para o setor dele: os carimbados nele.
   *
   * A lista do líder também traz o Pix das pessoas clonadas carimbado no outro
   * setor delas — para ele ver, aprovar e pagar. Mas o dinheiro conta para um
   * setor só: somado no ranking e na meta dos dois, o mesmo acordo apareceria
   * duas vezes na empresa. A consulta por carimbo nunca trouxe linha sem
   * carimbo, então isto é exatamente o conjunto de antes.
   */
  const itensDoCarimbo = useMemo(
    () => (setorEscopo ? itens.filter(i => i.setor_id === setorEscopo) : itens),
    [itens, setorEscopo],
  );

  /**
   * Um ranking por setor — nunca um que os misture.
   *
   * Comparar operadores de setores diferentes não responde pergunta nenhuma: a
   * meta de acordos é por setor, o percentual de comissão é por setor, e o
   * volume que chega a cada um não se parece. Até 05/09/2026 o super admin sem
   * filtro via a empresa inteira num pódio só, com o nome de UM setor no
   * cabeçalho — um número errado apresentado como certo.
   *
   * O líder preso a um setor tem UMA aba, e ela recebe `itens` sem recorte
   * extra: a consulta dele já veio por `setorEscopo`, e filtrar de novo tiraria
   * as linhas de carimbo vazio. Mesmo cuidado de `blocosMetaPix`.
   */
  const abasRanking = useMemo<AbaRankingPix[]>(() => {
    const linhasDe = (lista: PixAutoAcordo[]) =>
      rankingPixSetor(lista, pctPorSetor, mes, nomePorOperador, metaPorSetor);

    if (setorEscopo) {
      return [{
        setorId: setorEscopo,
        nome: setores.find(s => s.id === setorEscopo)?.nome ?? 'Meu setor',
        linhas: linhasDe(itensDoCarimbo),
      }];
    }
    return setoresComMovimento.map(s => ({
      setorId: s.id,
      nome: s.nome,
      linhas: linhasDe(itensDoSetorPix(itens, s.id, operadorSetor)),
    }));
  }, [itens, itensDoCarimbo, pctPorSetor, nomePorOperador, metaPorSetor, mes,
      setorEscopo, setores, setoresComMovimento, operadorSetor]);

  /**
   * A fila de NRs que a pessoa vê.
   *
   * A consulta já recortou pelo escopo de PERMISSÃO (`setorEscopo`); aqui vem o
   * recorte de FOCO, que é escolha de quem está olhando e por isso não vale uma
   * ida ao banco a cada clique na barra. Ver `pedidosDoSetor`.
   */
  const pedidosDoFoco = useMemo(
    () => pedidosDoSetor(pedidosNr, setorFoco),
    [pedidosNr, setorFoco],
  );

  /** Foto de cada operador, para o pódio. Sem foto, o card cai nas iniciais. */
  const fotoPorOperador = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const o of operadores) m[o.id] = o.foto_url ?? null;
    return m;
  }, [operadores]);

  const nomePorSetor = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of setores) m[s.id] = s.nome;
    return m;
  }, [setores]);

  /** Acordos e fila parada de cada setor — os números dos chips da barra. */
  const resumoPorSetor = useMemo(() => {
    const m: Record<string, ResumoSetorPix> = {};
    for (const s of setores) m[s.id] = { acordos: 0, pedidos: 0 };
    for (const i of itens) {
      if (!noMesPix(i.criado_em, mes)) continue;
      if (i.status === 'desaprovado') continue;
      const setor = i.setor_id ?? operadorSetor[i.operador_id] ?? null;
      if (setor && m[setor]) m[setor].acordos += 1;
    }
    // O pedido entre dois setores conta no chip dos DOIS — os dois líderes assinam.
    for (const pedido of pedidosNr) {
      for (const setor of new Set([pedido.setor_id, pedido.conflito_setor_id])) {
        if (setor && m[setor]) m[setor].pedidos += 1;
      }
    }
    return m;
  }, [setores, itens, mes, operadorSetor, pedidosNr]);

  /* Pedido sem setor não cabe em chip nenhum, e some da soma se ninguém contar:
     «Todos os setores» é quem o carrega. Ver `pedidosDoSetor`. */
  const pedidosSemSetor = useMemo(
    () => pedidosNr.filter(x => !x.setor_id).length,
    [pedidosNr],
  );

  // ── Meta de Pix do setor ────────────────────────────────────────────────
  // O realizado sai dos acordos do setor. Para o líder, `itens` já é o setor;
  // o operador só tem os próprios, então o painel fica restrito a líder+ —
  // "faltam X para o setor" calculado só com as linhas de uma pessoa seria
  // um número errado apresentado como certo.
  /**
   * Um bloco de meta por SETOR em foco.
   *
   * Com um setor escolhido a lista tem um item, que é o que a tela sempre
   * mostrou. Com «Todos os setores», ela tem um por setor — e é isso que faz o
   * painel finalmente existir para o super admin sem setor no cadastro.
   *
   * Os acordos de cada bloco são recortados pelo `setor_id` da própria linha.
   * Passar `itens` inteiro devolveria, no «Total do setor», a soma da empresa
   * embaixo do nome de um setor só: um número errado apresentado como certo,
   * que é exatamente o que este painel existe para não fazer.
   *
   * A exceção é o líder preso a um setor: ali a CONSULTA já recortou, e filtrar
   * de novo por `setor_id` tiraria do total as linhas que estão com o carimbo
   * vazio — dinheiro que sempre contou, sumindo por causa de uma correção que
   * não era sobre ele.
   */
  const blocosMetaPix = useMemo(() => {
    if (!podeVerDeOutros) return [];
    const recortarPorSetor = setorEscopo == null;
    const nomeEquipe = new Map(equipes.map(e => [e.id, e.nome]));
    const nomeSetor  = new Map(setores.map(s => [s.id, s.nome]));

    // Quais setores desenhar: o escolhido, ou todos os que têm equipe ou meta.
    const ids = setorFoco
      ? [setorFoco]
      : [...new Set([
          ...equipes.map(e => e.setor_id).filter((s): s is string => !!s),
          ...metasPix.map(m => m.setor_id),
        ])].sort((a, b) =>
          (nomeSetor.get(a) ?? '').localeCompare(nomeSetor.get(b) ?? '', 'pt-BR'));

    return ids.map(sid => ({
      setorId: sid,
      nome: nomeSetor.get(sid) ?? 'Setor',
      equipes: equipes.filter(e => e.setor_id === sid),
      metasAtuais: Object.fromEntries(
        metasPix
          .filter(m => m.setor_id === sid && m.equipe_id)
          .map(m => [
            m.equipe_id!,
            { valor: Number(m.meta_valor) || 0, acordos: Number(m.meta_acordos) || 0 },
          ]),
      ),
      consolidado: calcularMetaPixPorEquipe({
        // `setorDaLinhaPix` e não `i.setor_id`: a linha sem carimbo cai no setor
        // atual do operador, como na tabela e no ranking. Comparando o carimbo
        // cru, o «Total do setor» deste painel não fechava com a lista embaixo.
        itens: recortarPorSetor
          ? itens.filter(i => setorDaLinhaPix(i, operadorSetor) === sid)
          : itensDoCarimbo,
        metas: metasPix
          .filter(m => m.setor_id === sid && m.equipe_id)
          .map(m => ({
            equipeId:    m.equipe_id!,
            equipeNome:  nomeEquipe.get(m.equipe_id!) ?? 'Equipe',
            metaValor:   Number(m.meta_valor)   || 0,
            metaAcordos: Number(m.meta_acordos) || 0,
          })),
        equipePorOperador: operadorEquipe,
        configMes: configComDiasDoSetor(configMes, diasPorSetor, sid),
        mes, hojeISO: getTodayISO(),
      }),
    }));
  }, [podeVerDeOutros, itens, itensDoCarimbo, metasPix, equipes, setores, setorFoco, setorEscopo,
      operadorEquipe, operadorSetor, configMes, diasPorSetor, mes]);

  /** Quem está executando — vai para a lixeira, para a auditoria ter nome. */
  const quemExclui = { id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null };

  // ── Sub-abas ────────────────────────────────────────────────────────────
  /*
   * O que conta como divergência aberta — o que faz a aba piscar.
   *
   * O NR em disputa conta pela fila INTEIRA do escopo, e não só pelo setor em
   * foco: trocar o foco na barra de setores não pode apagar o aviso de um NR
   * que continua parado. O acordo que ficou só na lista de acordos é sempre da
   * própria pessoa (ver `acordosSemPix`). A correção de valor NÃO conta: ela é
   * anotação que espera o próximo pagamento, e não decisão de alguém.
   */
  const divergenciasAbertas = pedidosNr.length + acordosSemPix.length;

  /** O resumo da premiação para o rótulo da aba — a mesma conta do painel. */
  const resumoPremiacao = useMemo(() => {
    if (!podeVerDeOutros) return null;
    const carimbos: Record<string, { pago: boolean; valorPago?: number | null }> = {};
    for (const p of pagamentosPremiacao) {
      carimbos[p.operador_id] = {
        pago: p.pago === true,
        valorPago: p.valor_pago == null ? null : Number(p.valor_pago),
      };
    }
    const linhas = painelPremiacoes({
      itens: visiveis, pctPorSetor, mes, metaPorOperador, metaPorSetor,
      pagamentoPorOperador: carimbos,
    });
    return {
      pessoas: linhas.length,
      aPagar: linhas.filter(l => l.falta >= 0.005).length,
      falta: totalDoPainel(linhas).falta,
    };
  }, [podeVerDeOutros, pagamentosPremiacao, visiveis, pctPorSetor, mes, metaPorOperador, metaPorSetor]);

  return {
    perfil, empresa, temPermissao, podeAprovar,
    podeVerTodosSetores, podeVerDeOutros, podeAgirSobreOutros,
    podeEditarConfig, podeAjustarSaldo, podeRegistrar, podeMarcarPremiacaoPaga,
    mes, setMes, meuSetor, setorEscopo, noMesAtual, fechamento, inicioDoMes, fimDoMes,
    itens, configs, operadores, setores, setoresDoFiltro, doRetrato,
    donosDeNr, nrsBloqueados, saldos, pagamentosPremiacao, setPagamentosPremiacao,
    loading, carregar, carregarMetaPix, jaPintouPix, clonesRef,
    nrDeFora, consumirNrDeFora,
    subAba, trocarSubAba, diaNovo, setDiaNovo,
    pedidosNr, aprovacoesNr, meusSetores, acordosSemPix,
    chaveAba, busca, setBusca, filtroStatus, setFiltroStatus,
    filtroOperador, setFiltroOperador, filtroEquipe, setFiltroEquipe, setFiltroSetor,
    filtroPagamento, setFiltroPagamento, dataDe, setDataDe, dataAte, setDataAte,
    metaPorOperador, metasPix,
    setorFoco, setorConfig, equipesDoFoco,
    pctPorSetor, pctDoMeuSetor, pctSetorConfig, registroLigadoSetorConfig, metaDobraSetorConfig,
    operadoresFiltro, operadoresDoSeletor, visiveis,
    setPagina, totalPaginas, paginaAtual, daPagina,
    totais, pagamento, meusDesaprovados, saldoPorOperador, nrPorAcordo,
    bonusMeta, metaPorSetor, dobra, abasRanking, pedidosDoFoco,
    fotoPorOperador, nomePorSetor, resumoPorSetor, pedidosSemSetor, blocosMetaPix,
    selecionados, setSelecionados, quemExclui, divergenciasAbertas, resumoPremiacao,
  };
}

/** Tudo o que a tela do Pix lê e muda — o que cada parte recebe como `pix`. */
export type PixTela = ReturnType<typeof usePixAutomatico>;
