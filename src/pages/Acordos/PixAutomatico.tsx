/**
 * pages/Acordos/PixAutomatico.tsx — aba destacada "Pix Automático" (BookPlay)
 * ─────────────────────────────────────────────────────────────────────────
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
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Plus, RefreshCw, Search, X, Check, XCircle, Trash2, Undo2,
  Clock, CheckCircle2, Percent, Hash, DollarSign, User, Layers, Save,
  Copy, Upload, Download, Building2, Lock,
  Pencil, Banknote, AlertTriangle, History,
} from 'lucide-react';
import { read as xlsxRead, utils as xlsxUtils, write as xlsxWrite } from '@e965/xlsx';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerField } from '@/components/DatePickerField';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes } from '@/lib/supabase';
import { formatCurrency, parseCurrencyInput, getTodayISO } from '@/lib/index';
import { temEscopo } from '@/lib/permissoes-escopo';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import { mesAtual } from '@/lib/mesReferencia';
// As contas desta tela vivem em `pixAutomaticoView`: são puras e têm teste
// próprio, o que os `useMemo` que elas substituíram nunca tiveram.
import {
  mapaOperadorEquipe, mapaOperadorSetor, apenasOperadores, sugerirOperadores,
  filtrarItensPix, totaisPorStatus, totalPagoPix, calcularBonusMeta,
  calcularDobraComissao, rankingPixSetor, calcularMetaPixPorEquipe,
  textoPrazoExpurgo,
  type OperadorInfo, type FiltroPagamento,
} from './pixAutomaticoView';
import { PixComissaoDobrada } from './PixComissaoDobrada';
import { PixRankingSetor } from './PixRankingSetor';
import { PixMetaPainel } from './PixMetaPainel';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import {
  PixAutoAcordo, PixAutoStatus, PixAutoConfig, PIX_AUTO_PCT_PADRAO,
  PIX_META_ACORDOS_DOBRA,
  fetchAcordosPix, criarAcordoPix, avaliarAcordoPix, reavaliarAcordoPix,
  excluirAcordoPix, limparDesaprovados, fetchConfigsPix, upsertConfigPix,
  PIX_LINHAS_POR_PAGINA, metasDobraPorSetor,
  fetchLixeiraPix, restaurarItemLixeiraPix, excluirItemLixeiraPix,
  purgarLixeiraPixExpirada, type PixLixeiraItem,
  fetchLogPix, type PixLogItem,
  setPermiteRegistroOperador, normalizarNr, fetchNrsBloqueados,
  comissaoDe, formatarCopiaPix, criarAcordosPixLote, editarAcordoPix,
  marcarComissaoPaga, fetchMetasPixEquipes, upsertMetaPixEquipe,
  expurgarDesaprovadosVencidos, PIX_DIAS_UTEIS_EXPURGO,
  type LinhaPixLote, type PixAutoMeta,
} from '@/services/pix_automatico.service';

const STATUS_INFO: Record<PixAutoStatus, { label: string; cls: string }> = {
  pendente:    { label: 'Pendente',    cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
  aprovado:    { label: 'Aprovado',    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  desaprovado: { label: 'Desaprovado', cls: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

function fmtPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

/** Rótulo curto de cada ação do log. */
const PIX_LOG_LABEL: Record<PixLogItem['acao'], string> = {
  registrado:         'Registro',
  restaurado:         'Restauro',
  editado:            'Edição',
  aprovado:           'Aprovado',
  desaprovado:        'Desaprovado',
  voltou_pendente:    'Pendente',
  pago:               'Pago',
  pagamento_desfeito: 'Desfeito',
  excluido:           'Excluído',
};

/**
 * Cor por ação. Mesma paleta dos botões da tabela: aprovar é verde, desaprovar
 * e excluir são vermelhos, pagar é o teal do botão "Pagar". Quem já usa a aba
 * lê o histórico sem aprender uma legenda nova.
 */
const PIX_LOG_ESTILO: Record<PixLogItem['acao'], string> = {
  registrado:         'border-border text-muted-foreground',
  restaurado:         'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  editado:            'border-violet-500/30 bg-violet-500/10 text-violet-400',
  aprovado:           'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  desaprovado:        'border-red-500/30 bg-red-500/10 text-red-400',
  voltou_pendente:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  pago:               'border-teal-500/30 bg-teal-500/10 text-teal-400',
  pagamento_desfeito: 'border-border text-muted-foreground',
  excluido:           'border-destructive/40 bg-destructive/10 text-destructive',
};

export function PixAutomatico() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const podeAprovar = temPermissao('aprovar_pix_automatico');
  const podeEditarConfig = temPermissao('editar_configuracoes_pix_automatico');
  const podeVerEquipe = temEscopo('pix_automatico', 'equipe', temPermissao);
  const podeVerSetor = temEscopo('pix_automatico', 'setor', temPermissao);
  const ehMultiSetor = temEscopo('pix_automatico', 'todos_setores', temPermissao);
  const ehLider = podeVerEquipe || podeVerSetor || ehMultiSetor;

  const [itens, setItens]           = useState<PixAutoAcordo[]>([]);
  const [configs, setConfigs]       = useState<Record<string, PixAutoConfig>>({});
  const [operadores, setOperadores] = useState<OperadorInfo[]>([]);
  const [equipes, setEquipes]       = useState<{ id: string; nome: string }[]>([]);
  const [setores, setSetores]       = useState<{ id: string; nome: string }[]>([]);
  const [nrsBloqueados, setNrsBloqueados] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);

  // Form de registro
  const [nrNovo, setNrNovo]       = useState('');
  const [valorNovo, setValorNovo] = useState('');
  const [salvando, setSalvando]   = useState(false);
  // Vínculo do acordo a um operador (líder+): busca por nome
  const [vinculoBusca, setVinculoBusca] = useState('');
  const [vinculoOp, setVinculoOp]       = useState<OperadorInfo | null>(null);
  const [vinculoAberto, setVinculoAberto] = useState(false);

  // Filtros (líder)
  const [busca, setBusca]                   = useState('');
  const [filtroStatus, setFiltroStatus]     = useState<'todos' | PixAutoStatus>('todos');
  const [filtroOperador, setFiltroOperador] = useState('');
  const [filtroEquipe, setFiltroEquipe]     = useState('');
  const [filtroSetor, setFiltroSetor]       = useState('');
  // Pagamento e período — os dois valem para operador e líder: o operador
  // precisa saber o que já caiu, o líder precisa achar o que registrou na
  // semana passada sem rolar a lista inteira.
  const [filtroPagamento, setFiltroPagamento] = useState<FiltroPagamento>('todos');
  const [dataDe, setDataDe]   = useState('');
  const [dataAte, setDataAte] = useState('');

  // Config % (líder)
  const [pctInput, setPctInput]     = useState('');
  const [salvandoPct, setSalvandoPct] = useState(false);
  // Meta de acordos da comissão dobrada — era 18 fixo no código
  const [metaDobraInput, setMetaDobraInput] = useState('');
  const [salvandoMetaDobra, setSalvandoMetaDobra] = useState(false);

  // Lixeira: 3 dias de retenção, restaurar é líder+
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [lixeira, setLixeira] = useState<PixLixeiraItem[]>([]);
  const [lixeiraCarregando, setLixeiraCarregando] = useState(false);

  // Histórico: tudo o que aconteceu com os registros desta aba.
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historico, setHistorico] = useState<PixLogItem[]>([]);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [historicoBusca, setHistoricoBusca] = useState('');
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [confirmandoPct, setConfirmandoPct] = useState<number | null>(null);
  const [salvandoToggle, setSalvandoToggle] = useState(false);
  const [avaliandoId, setAvaliandoId] = useState<string | null>(null);
  const [limpando, setLimpando]       = useState(false);

  // Seleção múltipla (líder) + import
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteProcessando, setLoteProcessando] = useState(false);
  const [importando, setImportando]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Meta / quartil do operador logado (card de bônus)
  const [metaValor, setMetaValor]   = useState<number | null>(null);
  const [configMes, setConfigMes]   = useState<MetasConfigMes | null>(null);
  const [recebidoMes, setRecebidoMes] = useState<number | null>(null);

  // Meta de Pix do setor (independente do recebimento)
  const [metasPix, setMetasPix]         = useState<PixAutoMeta[]>([]);
  const [salvandoMetaPix, setSalvandoMetaPix] = useState(false);

  // Edição de um registro pendente (dono ou líder+)
  const [editandoId, setEditandoId]     = useState<string | null>(null);
  const [editNr, setEditNr]             = useState('');
  const [editValor, setEditValor]       = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const meuSetor = perfil?.setor_id ?? null;
  // Setor cuja configuração (% e interruptor) está em edição: multi-setor usa o
  // filtro de setor; líder/elite sempre o próprio setor.
  const setorConfig = ehMultiSetor ? (filtroSetor || meuSetor) : meuSetor;

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
  const setorEscopo = ehLider && !ehMultiSetor ? meuSetor : null;

  const pctPorSetor = useMemo(() => {
    const m: Record<string, number> = {};
    Object.values(configs).forEach(c => { m[c.setor_id] = Number(c.pct); });
    return m;
  }, [configs]);

  const pctDoMeuSetor = meuSetor != null
    ? (pctPorSetor[meuSetor] ?? PIX_AUTO_PCT_PADRAO)
    : PIX_AUTO_PCT_PADRAO;
  const pctSetorConfig = setorConfig != null
    ? (pctPorSetor[setorConfig] ?? PIX_AUTO_PCT_PADRAO)
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
  const podeRegistrar = ehLider
    || meuSetor == null
    || (configs[meuSetor]?.permite_registro_operador ?? true);

  const carregar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    setLoading(true);
    try {
      // Expurgo dos desaprovados vencidos ANTES de listar: sem job agendado, é
      // a abertura da tela que cobra o prazo. Só líder+ tem a policy — para o
      // operador a chamada volta zero e a lista segue igual.
      //
      // O try/catch é a segunda trava: o expurgo é acessório, a listagem é a
      // tela. Enquanto ele estourava (RPC ainda não aplicada no banco), a
      // exceção abortava o `carregar` inteiro e a aba aparecia VAZIA — com 73
      // pendentes e 148 aprovados intactos no banco. Nada aqui pode impedir a
      // lista de carregar.
      if (ehLider) {
        try {
          await expurgarDesaprovadosVencidos(empresa.id);
        } catch (e) {
          console.warn('[PixAutomatico] expurgo dos desaprovados:', e);
        }
      }

      const [lista, cfgs, bloqueados] = await Promise.all([
        fetchAcordosPix(empresa.id, ehLider
          ? { setorId: setorEscopo }
          : { operadorId: perfil.id }),
        fetchConfigsPix(empresa.id),
        fetchNrsBloqueados(empresa.id),
      ]);
      setItens(lista);
      const mapa: Record<string, PixAutoConfig> = {};
      cfgs.forEach(c => { mapa[c.setor_id] = { ...c, permite_registro_operador: c.permite_registro_operador ?? true }; });
      setConfigs(mapa);
      setNrsBloqueados(bloqueados);

      if (ehLider) {
        // Nomes/equipes/setores para filtros, vínculo e coluna Operador.
        // Presos ao setor do líder — ver `setorEscopo`.
        let qOps = supabase.from('perfis').select('id, nome, equipe_id, setor_id, perfil')
          .eq('empresa_id', empresa.id);
        let qEqs = supabase.from('equipes').select('id, nome')
          .eq('empresa_id', empresa.id);
        let qSets = supabase.from('setores').select('id, nome')
          .eq('empresa_id', empresa.id);
        if (setorEscopo) {
          qOps  = qOps.eq('setor_id', setorEscopo);
          qEqs  = qEqs.eq('setor_id', setorEscopo);
          qSets = qSets.eq('id', setorEscopo);
        }
        const [{ data: ops }, { data: eqs }, { data: sets }] = await Promise.all([
          qOps.order('nome'), qEqs.order('nome'), qSets.order('nome'),
        ]);
        setOperadores(((ops ?? []) as OperadorInfo[]));
        setEquipes(((eqs ?? []) as { id: string; nome: string }[]));
        setSetores(((sets ?? []) as { id: string; nome: string }[]));
      }
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, perfil?.id, ehLider, setorEscopo]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPctInput(String(pctSetorConfig).replace('.', ',')); }, [pctSetorConfig]);
  useEffect(() => { setMetaDobraInput(String(metaDobraSetorConfig)); }, [metaDobraSetorConfig]);

  // Meta do mês + config de quartis + recebido no analítico (card de bônus)
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!empresa?.id || !perfil?.id) return;
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      const mesStr = `${ano}-${String(mes).padStart(2, '0')}`;
      try {
        const [{ data: metaRow }, cfg, resumo] = await Promise.all([
          supabase.from('metas').select('meta_valor')
            .eq('tipo', 'operador').eq('referencia_id', perfil.id)
            .eq('empresa_id', empresa.id).eq('mes', mes).eq('ano', ano)
            .maybeSingle(),
          getMetasConfig(empresa.id, mes, ano),
          buscarResumoOperadoresAnalitico(empresa.id, mesStr, 'pix_automatico'),
        ]);
        if (cancelado) return;
        setMetaValor(metaRow ? Number((metaRow as { meta_valor: number }).meta_valor) || null : null);
        setConfigMes(cfg.data);
        const minha = resumo.data.find(r => r.operador_id === perfil.id);
        setRecebidoMes(minha ? Number(minha.total_recebido) || 0 : 0);
      } catch { /* sem meta/config → card não aparece */ }
    })();
    return () => { cancelado = true; };
  }, [empresa?.id, perfil?.id]);

  // Metas de Pix das EQUIPES do setor em foco. A meta do setor é a soma
  // delas — não existe uma linha "do setor" para carregar.
  const carregarMetaPix = useCallback(async () => {
    if (!empresa?.id || !setorConfig) { setMetasPix([]); return; }
    const hoje = new Date();
    const metas = await fetchMetasPixEquipes(
      empresa.id, setorConfig, hoje.getMonth() + 1, hoje.getFullYear());
    setMetasPix(metas);
  }, [empresa?.id, setorConfig]);

  useEffect(() => { void carregarMetaPix(); }, [carregarMetaPix]);

  // ── Derivados ───────────────────────────────────────────────────────────
  const operadorEquipe = useMemo(() => mapaOperadorEquipe(operadores), [operadores]);
  const operadorSetor  = useMemo(() => mapaOperadorSetor(operadores),  [operadores]);

  // Filtro de operador só lista OPERADORES (sem líder/gerência/diretoria etc.)
  const operadoresFiltro = useMemo(() => apenasOperadores(operadores), [operadores]);

  // Sugestões do vínculo (líder+ registra em nome de um operador)
  const sugestoesVinculo = useMemo(
    () => sugerirOperadores(operadoresFiltro, vinculoBusca),
    [operadoresFiltro, vinculoBusca],
  );

  const visiveis = useMemo(
    () => filtrarItensPix(
      itens,
      { busca, status: filtroStatus, operadorId: filtroOperador,
        equipeId: filtroEquipe, setorId: setorEscopo ?? filtroSetor,
        pagamento: filtroPagamento, de: dataDe, ate: dataAte },
      { porEquipe: operadorEquipe, porSetor: operadorSetor },
    ),
    [itens, busca, filtroStatus, filtroOperador, filtroEquipe, filtroSetor,
     filtroPagamento, dataDe, dataAte, setorEscopo, operadorEquipe, operadorSetor],
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
    filtroPagamento, dataDe, dataAte,
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

  const meusDesaprovados = itens.filter(i => i.operador_id === perfil?.id && i.status === 'desaprovado').length;

  /** Quanto falta para este desaprovado ser excluído. `null` = sem prazo. */
  function prazoDesaprovado(item: PixAutoAcordo): string | null {
    return textoPrazoExpurgo(item.avaliado_em);
  }

  // ── Bônus por meta (card dinâmico) ──────────────────────────────────────
  // O que o operador já recebeu de comissão APROVADA no mês é pago DE NOVO se
  // ele bater a meta. Estado do card vem da meta + quartis configurados:
  //   • meta batida → valor garantido (verde)
  //   • 1º quartil  → projetando a meta, mensagem de incentivo (azul)
  //   • demais      → informativo (violeta)
  const bonusMeta = useMemo(() => calcularBonusMeta({
    operadorId: perfil?.id, itens, pctPorSetor, metaValor, recebidoMes, configMes,
    // Mês e "hoje" de São Paulo, não do relógio de quem abre a tela.
    mes: mesAtual(), hojeISO: getTodayISO(),
  }), [perfil?.id, itens, pctPorSetor, metaValor, configMes, recebidoMes]);

  // ── Comissão dobrada: 18 acordos + meta do mês ──────────────────────────
  // Sempre sobre os acordos do próprio usuário, mesmo quando ele é líder e a
  // lista mostra o setor inteiro: a dobra é individual. São DOIS requisitos —
  // a quantidade de acordos e a meta de recebimento —, e a meta vem do mesmo
  // par (meta do mês, recebido no analítico) que alimentava o card de bônus.
  // A meta de acordos deixou de ser 18 fixo: cada setor tem a sua
  // (`pix_automatico_config.meta_acordos_dobra`, migration 20260810c).
  const metaPorSetor = useMemo(
    () => metasDobraPorSetor(Object.values(configs)),
    [configs],
  );

  const dobra = useMemo(
    () => calcularDobraComissao(itens, perfil?.id, pctPorSetor, mesAtual(), {
      metaValor, recebidoMes,
    }, metaPorSetor),
    [itens, perfil?.id, pctPorSetor, metaValor, recebidoMes, metaPorSetor],
  );

  // ── Ranking do setor ────────────────────────────────────────────────────
  // Sobre `itens` (o setor inteiro do líder), não sobre `visiveis`: o ranking é
  // do setor, e mudar o filtro de status não pode reescrever a classificação.
  const nomePorOperador = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operadores) m[o.id] = o.nome;
    return m;
  }, [operadores]);

  const ranking = useMemo(
    () => rankingPixSetor(itens, pctPorSetor, mesAtual(), nomePorOperador, metaPorSetor),
    [itens, pctPorSetor, nomePorOperador, metaPorSetor],
  );

  // ── Meta de Pix do setor ────────────────────────────────────────────────
  // O realizado sai dos acordos do setor. Para o líder, `itens` já é o setor;
  // o operador só tem os próprios, então o painel fica restrito a líder+ —
  // "faltam X para o setor" calculado só com as linhas de uma pessoa seria
  // um número errado apresentado como certo.
  const consolidadoMetaPix = useMemo(() => {
    if (!ehLider) return null;
    const nomeEquipe = new Map(equipes.map(e => [e.id, e.nome]));
    return calcularMetaPixPorEquipe({
      itens,
      metas: metasPix
        .filter(m => m.equipe_id)
        .map(m => ({
          equipeId:    m.equipe_id!,
          equipeNome:  nomeEquipe.get(m.equipe_id!) ?? 'Equipe',
          metaValor:   Number(m.meta_valor)   || 0,
          metaAcordos: Number(m.meta_acordos) || 0,
        })),
      equipePorOperador: operadorEquipe,
      configMes,
      mes: mesAtual(), hojeISO: getTodayISO(),
    });
  }, [ehLider, itens, metasPix, equipes, operadorEquipe, configMes]);

  // ── Ações ───────────────────────────────────────────────────────────────
  async function registrar() {
    if (!empresa?.id || !perfil?.id) return;
    const nr = nrNovo.trim();
    const valor = parseCurrencyInput(valorNovo);
    if (!nr) { toast.error('Informe o NR do acordo'); return; }
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    if (nrsBloqueados.has(normalizarNr(nr))) {
      toast.error(`O NR ${nr} já registrou um acordo no Pix automático.`);
      return;
    }
    if (!podeRegistrar) {
      toast.error('O registro manual está desativado para o seu setor.');
      return;
    }
    // Líder+ pode vincular o acordo a um operador; sem vínculo, registra em nome próprio
    const dono = ehLider && vinculoOp ? vinculoOp : null;
    setSalvando(true);
    try {
      const { ok, error } = await criarAcordoPix({
        empresaId:    empresa.id,
        operadorId:   dono ? dono.id : perfil.id,
        operadorNome: dono ? dono.nome : (perfil.nome ?? perfil.email ?? '—'),
        setorId:      dono ? dono.setor_id : (perfil.setor_id ?? null),
        nrCliente:    nr,
        valor,
      });
      if (!ok) { toast.error('Erro ao registrar: ' + error); return; }
      toast.success(dono
        ? `Acordo Pix registrado para ${dono.nome} — aguardando verificação.`
        : 'Acordo Pix registrado — aguardando verificação do líder.');
      setNrNovo('');
      setValorNovo('');
      setVinculoOp(null);
      setVinculoBusca('');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function avaliar(item: PixAutoAcordo, aprovar: boolean) {
    if (!perfil?.id) return;
    // Aprovar Pix decide comissão — é permissão separada de "ver o painel".
    if (!temPermissao('aprovar_pix_automatico')) {
      toast.error('Você não tem permissão para aprovar ou desaprovar Pix.');
      return;
    }
    setAvaliandoId(item.id);
    try {
      const pctDaLinha = item.setor_id != null
        ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO)
        : PIX_AUTO_PCT_PADRAO;
      const { ok, error } = await avaliarAcordoPix({
        id: item.id,
        aprovar,
        pctAtual: pctDaLinha,
        avaliadorId: perfil.id,
        avaliadorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao avaliar: ' + error); return; }
      toast.success(aprovar ? 'Acordo aprovado!' : 'Acordo desaprovado.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function voltarPendente(item: PixAutoAcordo) {
    setAvaliandoId(item.id);
    try {
      const { ok, error } = await reavaliarAcordoPix(item.id);
      if (!ok) { toast.error('Erro: ' + error); return; }
      toast.success('Acordo voltou para pendente.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  // ── Edição de um registro pendente ────────────────────────────────────────
  // Só enquanto pendente: depois de avaliado, o NR e o valor são a base da
  // comissão que o líder já conferiu, e mudá-los por baixo apagaria a conferência.
  function podeEditarLinha(item: PixAutoAcordo): boolean {
    if (item.status !== 'pendente') return false;
    return ehLider || item.operador_id === perfil?.id;
  }

  function abrirEdicao(item: PixAutoAcordo) {
    setEditandoId(item.id);
    setEditNr(item.nr_cliente);
    setEditValor(Number(item.valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }));
  }

  function fecharEdicao() {
    setEditandoId(null);
    setEditNr('');
    setEditValor('');
  }

  async function salvarEdicao(item: PixAutoAcordo) {
    const nr = editNr.trim();
    const valor = parseCurrencyInput(editValor);
    if (!nr) { toast.error('Informe o NR do acordo'); return; }
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    // NR novo já usado por OUTRO acordo: o registro histórico do próprio acordo
    // fica na lista de bloqueados, então trocar por ele mesmo não é conflito.
    const chave = normalizarNr(nr);
    if (chave !== normalizarNr(item.nr_cliente) && nrsBloqueados.has(chave)) {
      toast.error(`O NR ${nr} já registrou um acordo no Pix automático.`);
      return;
    }
    setSalvandoEdicao(true);
    try {
      const { ok, error } = await editarAcordoPix({ id: item.id, nrCliente: nr, valor });
      if (!ok) { toast.error('Erro ao salvar: ' + error); return; }
      toast.success('Acordo atualizado.');
      fecharEdicao();
      await carregar();
    } finally {
      setSalvandoEdicao(false);
    }
  }

  // ── Pagamento da comissão (líder+) ────────────────────────────────────────
  async function alternarPago(item: PixAutoAcordo) {
    if (!perfil?.id) return;
    setAvaliandoId(item.id);
    try {
      const { ok, count, error } = await marcarComissaoPaga({
        ids: [item.id],
        pago: !item.pago,
        responsavelId: perfil.id,
        responsavelNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao marcar pagamento: ' + error); return; }
      if (count === 0) {
        toast.error('Só acordos aprovados podem ser marcados como pagos.');
        return;
      }
      toast.success(item.pago ? 'Pagamento desfeito.' : 'Comissão marcada como paga.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function marcarPagosSelecionados(pago: boolean) {
    if (!perfil?.id) return;
    // Ao PAGAR, só faz sentido o que está aprovado — é o que o banco aceita.
    const alvos = visiveis.filter(i => selecionados.has(i.id)
      && (pago ? i.status === 'aprovado' && !i.pago : i.pago));
    if (alvos.length === 0) {
      toast.error(pago
        ? 'Nenhum acordo aprovado e não pago entre os selecionados.'
        : 'Nenhum acordo pago entre os selecionados.');
      return;
    }
    setLoteProcessando(true);
    try {
      const { ok, count, error } = await marcarComissaoPaga({
        ids: alvos.map(a => a.id),
        pago,
        responsavelId: perfil.id,
        responsavelNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao marcar pagamento: ' + error); return; }
      toast.success(`${count} comissão(ões) ${pago ? 'marcada(s) como paga(s)' : 'desmarcada(s)'}.`);
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  // ── Meta de Pix do setor (líder+) ─────────────────────────────────────────
  // Parâmetros não se chamam `metaValor`: esse nome já é o estado da meta de
  // RECEBIMENTO do operador (card de bônus), e sombreá-lo aqui é convite a erro.
  async function salvarMetaPix(equipeId: string, valorAlvo: number, acordosAlvo: number) {
    if (!podeEditarConfig) return;
    if (!empresa?.id || !perfil?.id || !setorConfig) return;
    const hoje = new Date();
    setSalvandoMetaPix(true);
    try {
      const { ok, error } = await upsertMetaPixEquipe({
        empresaId: empresa.id,
        setorId: setorConfig,
        equipeId,
        mes: hoje.getMonth() + 1,
        ano: hoje.getFullYear(),
        metaValor: valorAlvo,
        metaAcordos: acordosAlvo,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar a meta: ' + error); return; }
      toast.success('Meta de Pix automático atualizada.');
      await carregarMetaPix();
    } finally {
      setSalvandoMetaPix(false);
    }
  }

  /**
   * O histórico filtrado pela busca do painel.
   *
   * Varre a frase inteira, não só o NR: "aprovou", "pagou", o nome de quem fez
   * e o do dono do registro estão todos ali. É o filtro que faz o painel
   * responder a "o que o Bryan mexeu" sem uma tela de filtros por campo.
   */
  const historicoVisivel = useMemo(() => {
    const termo = historicoBusca.trim().toLowerCase();
    if (!termo) return historico;
    return historico.filter(l =>
      `${l.nr_cliente} ${l.descricao} ${l.autor_nome ?? ''} ${l.operador_nome ?? ''} ${PIX_LOG_LABEL[l.acao]}`
        .toLowerCase()
        .includes(termo),
    );
  }, [historico, historicoBusca]);

  /** Quem está executando — vai para a lixeira, para a auditoria ter nome. */
  const quemExclui = { id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null };

  async function excluir(item: PixAutoAcordo) {
    const { ok, error } = await excluirAcordoPix(item.id, quemExclui);
    if (!ok) { toast.error('Erro ao excluir: ' + error); return; }
    toast.success('Registro movido para a lixeira. Fica 3 dias lá.');
    await carregar();
  }

  async function limparMeusDesaprovados() {
    if (!empresa?.id || !perfil?.id) return;
    setLimpando(true);
    try {
      const { ok, count, error } = await limparDesaprovados(empresa.id, perfil.id, quemExclui);
      if (!ok) { toast.error('Erro ao limpar: ' + error); return; }
      toast.success(`${count} registro${count !== 1 ? 's' : ''} desaprovado${count !== 1 ? 's' : ''} na lixeira.`);
      await carregar();
    } finally {
      setLimpando(false);
    }
  }

  // ── Lixeira ─────────────────────────────────────────────────────────────

  /**
   * Abre a lixeira. Purga o vencido ANTES de listar: não há job agendado, e sem
   * isso um item de 4 dias apareceria como se ainda desse para restaurar.
   * Mesmo desenho do expurgo dos desaprovados no `carregar`.
   */
  async function abrirLixeira() {
    if (!empresa?.id || !perfil?.id) return;
    setLixeiraAberta(true);
    setLixeiraCarregando(true);
    try {
      try {
        await purgarLixeiraPixExpirada(empresa.id);
      } catch (e) {
        // Acessório: a listagem é o que importa. Ver o comentário em `carregar`.
        console.warn('[PixAutomatico] purga da lixeira:', e);
      }
      setLixeira(await fetchLixeiraPix(empresa.id, ehLider ? undefined : { operadorId: perfil.id }));
    } finally {
      setLixeiraCarregando(false);
    }
  }

  async function restaurarDaLixeira(item: PixLixeiraItem) {
    setRestaurandoId(item.id);
    try {
      const { ok, error } = await restaurarItemLixeiraPix(item.id);
      if (!ok) { toast.error(error ?? 'Não foi possível restaurar.'); return; }
      toast.success(`NR ${item.nr_cliente} restaurado.`);
      setLixeira(prev => prev.filter(l => l.id !== item.id));
      await carregar();
    } finally {
      setRestaurandoId(null);
    }
  }

  // ── Histórico ───────────────────────────────────────────────────────────

  /**
   * Abre o histórico da aba.
   *
   * A RLS já decide o recorte (operador vê o que é dele, líder+ vê tudo da
   * empresa), então não há filtro por operador aqui — passar um recorte a mais
   * no cliente só criaria uma segunda regra para divergir daquela.
   */
  async function abrirHistorico() {
    if (!empresa?.id) return;
    setHistoricoAberto(true);
    setHistoricoCarregando(true);
    try {
      setHistorico(await fetchLogPix(empresa.id));
    } finally {
      setHistoricoCarregando(false);
    }
  }

  async function apagarDaLixeira(item: PixLixeiraItem) {
    const { ok, error } = await excluirItemLixeiraPix(item.id);
    if (!ok) { toast.error('Erro ao apagar: ' + error); return; }
    setLixeira(prev => prev.filter(l => l.id !== item.id));
    toast.success('Removido em definitivo.');
  }

  /** Passo 1: valida o % digitado e abre a confirmação. */
  function pedirConfirmacaoPct() {
    if (!podeEditarConfig) return;
    if (!setorConfig) return;
    const pct = parseFloat(pctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentual inválido (0 a 100)'); return; }
    if (pct === pctSetorConfig) { toast.info('O percentual não mudou.'); return; }
    setConfirmandoPct(pct);
  }

  /** Passo 2: usuário confirmou no diálogo — grava o % do setor. */
  async function salvarPctConfirmado() {
    if (!podeEditarConfig) return;
    const pct = confirmandoPct;
    setConfirmandoPct(null);
    if (!empresa?.id || !perfil?.id || !setorConfig || pct == null) return;
    setSalvandoPct(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        pct,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar percentual: ' + error); return; }
      toast.success(`Percentual do setor atualizado para ${fmtPct(pct)}. Vale para novas aprovações.`);
      await carregar();
    } finally {
      setSalvandoPct(false);
    }
  }

  /**
   * Grava a meta de acordos da dobra do setor em edição.
   *
   * Separada do percentual de propósito: são dois números com consequências
   * diferentes, e o do percentual tem diálogo de confirmação porque reescreve
   * o que os operadores vão receber. A meta só muda um requisito daqui pra
   * frente — não mexe em comissão já aprovada.
   */
  async function salvarMetaDobra() {
    if (!podeEditarConfig) return;
    if (!empresa?.id || !perfil?.id || !setorConfig) return;
    const meta = parseInt(metaDobraInput.replace(/\D/g, ''), 10);
    if (!Number.isFinite(meta) || meta <= 0) {
      toast.error('A meta precisa ser um número maior que zero.');
      return;
    }
    if (meta === metaDobraSetorConfig) { toast.info('A meta não mudou.'); return; }

    setSalvandoMetaDobra(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        // O percentual vigente viaja junto: `upsertConfigPix` é upsert, e sem
        // ele a linha nasceria com o default de 0,25 quando o setor ainda não
        // tem config gravada.
        pct: pctSetorConfig,
        metaAcordosDobra: meta,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar a meta: ' + error); return; }
      toast.success(`Meta da comissão dobrada: ${meta} acordos no mês.`);
      await carregar();
    } finally {
      setSalvandoMetaDobra(false);
    }
  }

  /** Liga/desliga o registro manual de operadores no setor em edição. */
  async function alternarRegistroSetor(ligar: boolean) {
    if (!podeEditarConfig) return;
    if (!empresa?.id || !perfil?.id || !setorConfig) return;
    setSalvandoToggle(true);
    try {
      const { ok, error } = await setPermiteRegistroOperador({
        empresaId: empresa.id,
        setorId: setorConfig,
        permite: ligar,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao alterar registro manual: ' + error); return; }
      toast.success(ligar
        ? 'Registro manual LIGADO — operadores do setor podem adicionar acordos.'
        : 'Registro manual DESLIGADO — operadores do setor apenas visualizam.');
      await carregar();
    } finally {
      setSalvandoToggle(false);
    }
  }

  // ── Seleção + copiar (líder) ──────────────────────────────────────────────
  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const idsVisiveis = useMemo(() => visiveis.map(i => i.id), [visiveis]);
  const todosVisiveisSelecionados = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id));

  function toggleTodosVisiveis() {
    setSelecionados(prev => {
      if (todosVisiveisSelecionados) {
        const n = new Set(prev);
        idsVisiveis.forEach(id => n.delete(id));
        return n;
      }
      return new Set([...prev, ...idsVisiveis]);
    });
  }

  async function copiarSelecionados() {
    const alvos = visiveis
      .filter(i => selecionados.has(i.id))
      .map(i => ({ acordo: i, comissao: comissaoDe(i, pctPorSetor) }));
    if (alvos.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }
    // Só NR e comissão, com o TOTAL somado no fim quando há mais de um — ver
    // `formatarCopiaPix`. Somar isso à mão no WhatsApp é onde o erro entrava.
    const total = alvos.reduce((s, a) => s + a.comissao, 0);
    await copiarTexto(
      formatarCopiaPix(alvos),
      alvos.length === 1
        ? 'Acordo copiado para encaminhar.'
        : `${alvos.length} acordos copiados · total ${formatCurrency(total)}.`,
    );
  }

  // Avalia (aprova/desaprova) em lote — só pendentes selecionados.
  async function avaliarSelecionados(aprovar: boolean) {
    if (!perfil?.id) return;
    const alvos = visiveis.filter(i => selecionados.has(i.id) && i.status === 'pendente');
    if (alvos.length === 0) { toast.error('Nenhum acordo pendente selecionado.'); return; }
    setLoteProcessando(true);
    try {
      for (const item of alvos) {
        const pctDaLinha = item.setor_id != null
          ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO)
          : PIX_AUTO_PCT_PADRAO;
        await avaliarAcordoPix({
          id: item.id, aprovar, pctAtual: pctDaLinha,
          avaliadorId: perfil.id, avaliadorNome: perfil.nome ?? perfil.email ?? '—',
        });
      }
      toast.success(`${alvos.length} acordo(s) ${aprovar ? 'aprovado(s)' : 'desaprovado(s)'}.`);
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  /**
   * Exclui (lixeira) em lote os selecionados.
   *
   * As linhas já pagas ficam de fora — o banco as recusa uma a uma
   * (`trg_pix_a_impede_pago`) e o laço seguiria em frente sem contar direito.
   * O aviso diz quantas ficaram e por quê, senão o líder vê "3 excluídos" numa
   * seleção de 5 e não sabe o que aconteceu com as outras duas.
   */
  async function excluirSelecionados() {
    const marcados = visiveis.filter(i => selecionados.has(i.id));
    if (marcados.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }

    const alvos = marcados.filter(i => !i.pago);
    const pagos = marcados.length - alvos.length;
    if (alvos.length === 0) {
      toast.error(`${pagos} acordo(s) já pago(s) — desfaça o pagamento antes de excluir.`);
      return;
    }

    setLoteProcessando(true);
    try {
      let excluidos = 0;
      for (const item of alvos) {
        const { ok } = await excluirAcordoPix(item.id, quemExclui);
        if (ok) excluidos++;
      }
      toast.success(
        `${excluidos} registro(s) na lixeira.`
        + (pagos > 0 ? ` ${pagos} já pago(s) foram mantidos.` : ''),
      );
      setSelecionados(new Set());
      await carregar();
    } finally {
      setLoteProcessando(false);
    }
  }

  // ── Exportar / Importar planilha ──────────────────────────────────────────
  function exportar() {
    if (visiveis.length === 0) { toast.error('Nenhum registro para exportar.'); return; }
    const rows = visiveis.map(i => ({
      NR:        i.nr_cliente,
      Operador:  i.operador_nome ?? '',
      Valor:     Number(i.valor),
      Comissao:  comissaoDe(i, pctPorSetor),
      Status:    STATUS_INFO[i.status].label,
      Data:      new Date(i.criado_em).toLocaleDateString('pt-BR'),
    }));
    const ws = xlsxUtils.json_to_sheet(rows);
    const wb = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(wb, ws, 'Pix Automatico');
    const buf  = xlsxWrite(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `pix_automatico_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Acha um cabeçalho tolerando variações de nome/caixa. */
  function pegarCampo(row: Record<string, unknown>, nomes: string[]): unknown {
    const chaves = Object.keys(row);
    for (const n of nomes) {
      const k = chaves.find(c => c.trim().toLowerCase() === n);
      if (k != null) return row[k];
    }
    return undefined;
  }

  async function importarArquivo(file: File) {
    if (!empresa?.id || !perfil?.id) return;
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = xlsxRead(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsxUtils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      const linhas: LinhaPixLote[] = rows.map(row => {
        const nr = String(pegarCampo(row, ['nr', 'nr do acordo', 'nr_cliente']) ?? '').trim();
        const valor = parseCurrencyInput(String(pegarCampo(row, ['valor', 'valor total', 'valor do acordo']) ?? ''));
        const opNome = String(pegarCampo(row, ['operador', 'operador_nome', 'nome']) ?? '').trim();

        // Atribuição de operador: líder + nome reconhecido → esse operador; senão, o usuário logado.
        let opId = perfil.id;
        let opNomeFinal = perfil.nome ?? perfil.email ?? '—';
        let setorId = perfil.setor_id ?? null;
        if (ehLider && opNome) {
          const match = operadores.find(o => o.nome.trim().toLowerCase() === opNome.toLowerCase());
          if (match) { opId = match.id; opNomeFinal = match.nome; setorId = match.setor_id; }
        }
        return { nrCliente: nr, valor, operadorId: opId, operadorNome: opNomeFinal, setorId };
      });

      const r = await criarAcordosPixLote(empresa.id, linhas);
      if (!r.ok) { toast.error('Erro ao importar: ' + r.error); return; }
      toast.success(
        `Importados: ${r.importados}` +
        (r.duplicados ? ` · Duplicados ignorados: ${r.duplicados}` : '') +
        (r.ignorados ? ` · Inválidos ignorados: ${r.ignorados}` : ''),
      );
      await carregar();
    } catch (e) {
      toast.error('Falha ao ler a planilha. Confira o arquivo.');
      console.warn('[PixAutomatico] import:', e);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const statsCards = [
    {
      label: 'Pendente', qtd: totais.pendente.qtd,
      valor: totais.pendente.valor, comissao: totais.pendente.comissao,
      cls: 'from-sky-500/15 to-sky-600/5 border-sky-500/25', icon: <Clock className="w-4 h-4 text-sky-400" />,
      comissaoCls: 'text-sky-400',
      rodape: null as string | null,
    },
    {
      label: 'Aprovado', qtd: totais.aprovado.qtd,
      valor: totais.aprovado.valor, comissao: totais.aprovado.comissao,
      cls: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/25', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
      comissaoCls: 'text-emerald-400',
      rodape: null as string | null,
    },
    // Pago é o que SAIU, não o que é devido. Aprovado R$ 105,49 com R$ 50,00
    // pagos são dois fatos verdadeiros ao mesmo tempo — faltava o segundo.
    {
      label: 'Pago', qtd: pagamento.pago.qtd,
      valor: pagamento.pago.valor, comissao: pagamento.pago.comissao,
      cls: 'from-teal-500/15 to-teal-600/5 border-teal-500/25', icon: <Banknote className="w-4 h-4 text-teal-400" />,
      comissaoCls: 'text-teal-400',
      rodape: pagamento.aPagar.comissao > 0
        ? `Ainda a receber: ${formatCurrency(pagamento.aPagar.comissao)}`
        : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da aba ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border border-violet-500/25 flex items-center justify-center">
            <Zap className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">Pix Automático</h2>
            <p className="text-[11px] text-muted-foreground">
              Comissão de {fmtPct(pctDoMeuSetor)} por acordo aprovado — sem vínculo com a lista de acordos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}
            className="gap-1.5 h-8 text-xs rounded-lg">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importarArquivo(f); }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importando}
            className="gap-1.5 h-8 text-xs rounded-lg" title="Importar planilha de Pix Automático">
            {importando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={loading || visiveis.length === 0}
            className="gap-1.5 h-8 text-xs rounded-lg" title="Exportar registros visíveis">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={abrirLixeira}
            className="gap-1.5 h-8 text-xs rounded-lg"
            title="Registros excluídos nos últimos 3 dias">
            <Trash2 className="w-3.5 h-3.5" /> Lixeira
          </Button>
          <Button variant="outline" size="sm" onClick={abrirHistorico}
            className="gap-1.5 h-8 text-xs rounded-lg"
            title="Tudo o que aconteceu nesta aba: registro, edição, avaliação, pagamento e exclusão">
            <History className="w-3.5 h-3.5" /> Histórico
          </Button>
          {meusDesaprovados > 0 && (
            <Button variant="ghost" size="sm" onClick={limparMeusDesaprovados} disabled={limpando}
              className="gap-1.5 h-8 text-xs rounded-lg text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300">
              <Trash2 className="w-3.5 h-3.5" />
              {limpando ? 'Limpando...' : `Limpar desaprovados (${meusDesaprovados})`}
            </Button>
          )}
        </div>
      </div>

      {/* ── Registrar novo ── */}
      {podeRegistrar ? (
      <Card className="border-violet-500/20 bg-violet-500/[0.03]">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
            <div className="space-y-1 flex-1 max-w-[220px]">
              <Label className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> NR do acordo *</Label>
              <Input value={nrNovo} onChange={e => setNrNovo(e.target.value)}
                placeholder="NR" className="h-9 text-sm font-mono" />
            </div>
            <div className="space-y-1 flex-1 max-w-[220px]">
              <Label className="text-xs font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor total do acordo *</Label>
              <Input value={valorNovo} onChange={e => setValorNovo(e.target.value)}
                placeholder="0,00" className="h-9 text-sm font-mono"
                onKeyDown={e => { if (e.key === 'Enter') registrar(); }} />
            </div>
            {ehLider && (
              <div className="space-y-1 flex-1 max-w-[260px] relative">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <User className="w-3 h-3" /> Vincular a um operador
                </Label>
                {vinculoOp ? (
                  <div className="h-9 flex items-center justify-between gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-3">
                    <span className="text-xs font-medium truncate">{vinculoOp.nome}</span>
                    <button onClick={() => { setVinculoOp(null); setVinculoBusca(''); }}
                      className="text-muted-foreground hover:text-foreground" title="Remover vínculo">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Input value={vinculoBusca}
                      onChange={e => { setVinculoBusca(e.target.value); setVinculoAberto(true); }}
                      onFocus={() => setVinculoAberto(true)}
                      onBlur={() => setTimeout(() => setVinculoAberto(false), 150)}
                      placeholder="Digite o nome do operador…" className="h-9 text-sm" />
                    {vinculoAberto && sugestoesVinculo.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                        {sugestoesVinculo.map(o => (
                          <button key={o.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setVinculoOp(o); setVinculoAberto(false); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-accent/60 flex items-center gap-2">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{o.nome}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {valorNovo && !isNaN(parseCurrencyInput(valorNovo)) && parseCurrencyInput(valorNovo) > 0 && (
              <p className="text-[11px] text-muted-foreground pb-2.5">
                Comissão estimada:{' '}
                <span className="font-mono font-semibold text-violet-400">
                  {formatCurrency(Math.round(parseCurrencyInput(valorNovo) * pctDoMeuSetor) / 100)}
                </span>
              </p>
            )}
            <Button size="sm" onClick={registrar} disabled={salvando}
              className="h-9 gap-1.5 text-xs sm:ml-auto">
              {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Registrar Acordo Pix
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Todo registro entra como <strong>verificação pendente</strong> — o líder aprova ou desaprova.
            Cada NR só pode registrar <strong>um</strong> acordo no Pix automático.
            {ehLider && ' Sem vínculo, o acordo é registrado em seu próprio nome.'}
          </p>
        </CardContent>
      </Card>
      ) : (
      <Card className="border-amber-500/25 bg-amber-500/[0.04]">
        <CardContent className="p-4 flex items-center gap-3">
          <Lock className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            O registro manual de acordos está <strong className="text-amber-500">desativado</strong> para
            o seu setor. Você pode acompanhar seus acordos pendentes, aprovados e desaprovados abaixo.
          </p>
        </CardContent>
      </Card>
      )}

      {/* ── Totais pendente × aprovado ── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {statsCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}>
              <div className={cn('rounded-xl border bg-gradient-to-br p-4 h-full', s.cls)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {s.icon}
                    <div>
                      <p className="text-[11px] text-muted-foreground">{s.label} · {s.qtd} acordo{s.qtd !== 1 ? 's' : ''}</p>
                      <p className="text-lg font-bold font-mono text-foreground leading-tight">{formatCurrency(s.valor)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Comissão Pix</p>
                    <p className={cn('text-lg font-bold font-mono leading-tight', s.comissaoCls)}>{formatCurrency(s.comissao)}</p>
                  </div>
                </div>
                {s.rodape && (
                  <p className="text-[10.5px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
                    {s.rodape}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Meta de Pix do setor (líder+): quanto falta e projeção ──
          Não se mistura com a meta de recebimento: o valor do Pix já entra no
          recebimento pelo analítico, e somar de novo contaria duas vezes. */}
      {!loading && podeEditarConfig && setorConfig && (
        <PixMetaPainel
          consolidado={consolidadoMetaPix}
          nomeSetor={setores.find(s => s.id === setorConfig)?.nome}
          equipes={equipes}
          metasAtuais={Object.fromEntries(
            metasPix.filter(m => m.equipe_id).map(m => [
              m.equipe_id!,
              { valor: Number(m.meta_valor) || 0, acordos: Number(m.meta_acordos) || 0 },
            ]),
          )}
          podeEditar={podeEditarConfig}
          salvando={salvandoMetaPix}
          onSalvar={salvarMetaPix}
          parseValor={parseCurrencyInput}
        />
      )}

      {/* ── Comissão dobrada: os dois requisitos num card só ──
          É individual: aparece para quem tem acordos Pix próprios no mês, e
          sempre para o operador — que precisa saber que a regra existe.
          Substituiu o contador dos 18 + o bloco de "bônus por meta", que eram
          dois desenhos diferentes contando metades da mesma regra. */}
      {!loading && (!ehLider || dobra.feitos > 0) && (
        <PixComissaoDobrada dobra={dobra} projecao={bonusMeta?.projecao ?? null} />
      )}

      {/* ── Ranking do setor ──
          Só para líder+: o operador enxerga apenas os próprios acordos (RLS),
          então um "ranking" para ele seria uma lista de uma pessoa só. */}
      {!loading && ehLider && (
        <PixRankingSetor
          linhas={ranking}
          nomeSetor={setorConfig ? setores.find(s => s.id === setorConfig)?.nome : undefined}
          destacarOperadorId={perfil?.id}
        />
      )}

      {/* ── Aviso do prazo dos desaprovados ──
          O operador é notificado na hora da desaprovação; aqui fica o lembrete
          de que a linha some sozinha, para ele não achar que sumiu por engano. */}
      {!loading && meusDesaprovados > 0 && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Você tem <strong className="text-red-400">{meusDesaprovados}</strong> registro
            {meusDesaprovados !== 1 ? 's' : ''} desaprovado{meusDesaprovados !== 1 ? 's' : ''}.
            Registro desaprovado é excluído automaticamente{' '}
            <strong className="text-foreground">{PIX_DIAS_UTEIS_EXPURGO} dias úteis</strong>{' '}
            depois da avaliação — confira o motivo com o líder antes disso. Depois de
            excluído, o NR volta a ficar livre para ser registrado de novo.
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
          <Input placeholder={ehLider ? 'Buscar por NR ou operador...' : 'Buscar por NR...'}
            value={busca} onChange={e => setBusca(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm rounded-lg" />
          {busca && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setBusca('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as typeof filtroStatus)}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aprovado">Aprovados</SelectItem>
            <SelectItem value="desaprovado">Desaprovados</SelectItem>
          </SelectContent>
        </Select>

        {/* Pagamento: também para o operador — é a pergunta "o que já caiu?". */}
        <Select value={filtroPagamento} onValueChange={v => setFiltroPagamento(v as FiltroPagamento)}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-lg">
            <Banknote className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Pago e a pagar</SelectItem>
            <SelectItem value="pago">Já pagos</SelectItem>
            <SelectItem value="a_pagar">A pagar</SelectItem>
          </SelectContent>
        </Select>

        {/* Período de registro. Vazio = sem recorte, que é o padrão de sempre.
            Usa o MESMO `DatePickerField` da lista de acordos (o calendário em
            popover, com os meses em português) em vez do `input type="date"`
            nativo: são duas datas na mesma tela e a operação já conhece aquele.
            `minDate` na data final impede escolher um fim antes do começo —
            período invertido só devolveria lista vazia sem dizer por quê. */}
        <div className="flex items-center gap-1">
          <DatePickerField
            value={dataDe}
            onChange={setDataDe}
            triggerClassName="h-9 w-36 rounded-lg"
            placeholder="Data inicial"
          />
          <span className="text-[11px] text-muted-foreground px-0.5">até</span>
          <DatePickerField
            value={dataAte}
            onChange={setDataAte}
            minDate={dataDe || undefined}
            triggerClassName="h-9 w-36 rounded-lg"
            placeholder="Data final"
          />
          {(dataDe || dataAte) && (
            <button
              type="button"
              onClick={() => { setDataDe(''); setDataAte(''); }}
              title="Limpar o período"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-input text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {ehLider && (
          <>
            {ehMultiSetor && (
              <Select value={filtroSetor || '__todos__'}
                onValueChange={v => setFiltroSetor(v === '__todos__' ? '' : v)}>
                <SelectTrigger className="h-9 w-40 text-xs rounded-lg">
                  <Building2 className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos os setores</SelectItem>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filtroEquipe || '__todas__'}
              onValueChange={v => setFiltroEquipe(v === '__todas__' ? '' : v)}>
              <SelectTrigger className="h-9 w-40 text-xs rounded-lg">
                <Layers className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas__">Todas as equipes</SelectItem>
                {equipes.map(eq => <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroOperador || '__todos__'}
              onValueChange={v => setFiltroOperador(v === '__todos__' ? '' : v)}>
              <SelectTrigger className="h-9 w-44 text-xs rounded-lg">
                <User className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os operadores</SelectItem>
                {operadoresFiltro.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* ── Configuração do setor (líder+): % de comissão + registro manual ── */}
      {podeEditarConfig && setorConfig && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-violet-400" />
            {setores.find(s => s.id === setorConfig)?.nome ?? 'Meu setor'}
          </span>
          <div className="flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">Comissão do setor:</span>
            <Input value={pctInput} onChange={e => setPctInput(e.target.value)}
              className="h-7 w-16 text-xs text-center font-mono" />
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-violet-400 hover:text-violet-300"
              onClick={pedirConfirmacaoPct} disabled={salvandoPct} title="Confirmar novo percentual do setor">
              {salvandoPct ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Confirmar
            </Button>
          </div>

          {/* Meta da comissão dobrada. Era 18 fixo no código; agora é por
              setor. Sem diálogo de confirmação, ao contrário do percentual:
              mudar a meta não reescreve comissão já aprovada, só muda um
              requisito daqui pra frente. */}
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">
              Acordos p/ dobrar:
            </span>
            <Input
              value={metaDobraInput}
              onChange={e => setMetaDobraInput(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="h-7 w-14 text-xs text-center font-mono"
              title="Quantos acordos Pix o operador precisa fechar no mês"
            />
            <Button size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-amber-400 hover:text-amber-300"
              onClick={salvarMetaDobra} disabled={salvandoMetaDobra}
              title="Salvar a meta de acordos do setor">
              {salvandoMetaDobra ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={registroLigadoSetorConfig} disabled={salvandoToggle}
              onCheckedChange={alternarRegistroSetor}
              aria-label="Registro manual pelos operadores" />
            <span className="text-[11px] text-muted-foreground">
              Registro manual pelos operadores:{' '}
              <strong className={registroLigadoSetorConfig ? 'text-emerald-500' : 'text-amber-500'}>
                {registroLigadoSetorConfig ? 'ligado' : 'desligado'}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Confirmação de alteração do % */}
      <AlertDialog open={confirmandoPct != null} onOpenChange={aberto => { if (!aberto) setConfirmandoPct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar comissão do setor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar a comissão do setor{' '}
              <strong>{setores.find(s => s.id === setorConfig)?.nome ?? 'atual'}</strong>{' '}
              de <strong>{fmtPct(pctSetorConfig)}</strong> para{' '}
              <strong>{confirmandoPct != null ? fmtPct(confirmandoPct) : ''}</strong>?
              A mudança vale apenas para este setor e para as próximas aprovações —
              acordos já aprovados não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarPctConfirmado}>Sim, alterar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Barra de ação em lote (líder) ── */}
      {ehLider && selecionados.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
          <span className="text-xs font-medium text-violet-500 mr-1">{selecionados.size} selecionado(s)</span>
          <Button size="sm" onClick={copiarSelecionados} disabled={loteProcessando} className="h-7 gap-1.5 text-xs">
            <Copy className="w-3.5 h-3.5" /> Copiar
          </Button>
          {podeAprovar && (
            <>
              <button onClick={() => avaliarSelecionados(true)} disabled={loteProcessando}
                className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Aprovar
              </button>
              <button onClick={() => avaliarSelecionados(false)} disabled={loteProcessando}
                className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Desaprovar
              </button>
            </>
          )}
          <button onClick={() => marcarPagosSelecionados(true)} disabled={loteProcessando}
            title="Marcar a comissão dos aprovados como paga"
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-teal-400 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-50">
            <Banknote className="w-3.5 h-3.5" /> Marcar pago
          </button>
          <button onClick={() => marcarPagosSelecionados(false)} disabled={loteProcessando}
            title="Desfazer o pagamento dos selecionados"
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-muted-foreground border border-border hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
            <Undo2 className="w-3.5 h-3.5" /> Desfazer pago
          </button>
          <button onClick={excluirSelecionados} disabled={loteProcessando}
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-muted-foreground border border-border hover:text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
          <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())} disabled={loteProcessando}
            className="h-7 gap-1.5 text-xs text-muted-foreground ml-auto">
            <X className="w-3.5 h-3.5" /> Limpar
          </Button>
        </div>
      )}

      {/* ── Tabela ── */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 space-y-2.5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Zap className="w-8 h-8 opacity-20" />
              <p className="text-sm">
                {itens.length === 0 ? 'Nenhum acordo Pix registrado ainda.' : 'Nenhum resultado para os filtros.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    {ehLider && (
                      <th className="px-3 py-3 w-8">
                        <Checkbox checked={todosVisiveisSelecionados} onCheckedChange={toggleTodosVisiveis}
                          aria-label="Selecionar todos os visíveis" />
                      </th>
                    )}
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">NR</th>
                    {ehLider && <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>}
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Comissão Pix</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Pagamento</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Registrado em</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {daPagina.map((item, i) => {
                    const comissao = comissaoDe(item, pctPorSetor);
                    const pctLinha = item.status === 'aprovado' && item.pct_comissao != null
                      ? Number(item.pct_comissao)
                      : (item.setor_id != null ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO) : PIX_AUTO_PCT_PADRAO);
                    const sInfo = STATUS_INFO[item.status];
                    const desaprovado = item.status === 'desaprovado';
                    const emEdicao = editandoId === item.id;
                    return (
                      <motion.tr key={item.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                        className={cn(
                          'border-b border-border/30 group transition-colors hover:bg-accent/20',
                          desaprovado && 'opacity-60',
                        )}>
                        {ehLider && (
                          <td className="px-3 py-3 w-8">
                            <Checkbox checked={selecionados.has(item.id)}
                              onCheckedChange={() => toggleSelecionado(item.id)}
                              aria-label={`Selecionar NR ${item.nr_cliente}`} />
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono font-bold text-foreground">
                          {emEdicao ? (
                            <Input value={editNr} onChange={e => setEditNr(e.target.value)}
                              className="h-8 w-28 text-xs font-mono" aria-label="NR do acordo"
                              onKeyDown={e => {
                                if (e.key === 'Enter')  salvarEdicao(item);
                                if (e.key === 'Escape') fecharEdicao();
                              }} />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span>{item.nr_cliente}</span>
                              <button title="Copiar NR" onClick={() => copiarTexto(item.nr_cliente, 'NR copiado.')}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-violet-400">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        {ehLider && (
                          <td className="px-4 py-3 text-foreground/80 max-w-[160px]">
                            <span className="truncate block">{item.operador_nome ?? '—'}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                          {emEdicao ? (
                            <Input value={editValor} onChange={e => setEditValor(e.target.value)}
                              className="h-8 w-28 text-xs font-mono text-right ml-auto" aria-label="Valor do acordo"
                              onKeyDown={e => {
                                if (e.key === 'Enter')  salvarEdicao(item);
                                if (e.key === 'Escape') fecharEdicao();
                              }} />
                          ) : formatCurrency(item.valor)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-mono font-bold', desaprovado ? 'text-muted-foreground line-through' : 'text-violet-400')}>
                            {formatCurrency(comissao)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">({fmtPct(pctLinha)})</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('text-[10px] font-semibold', sInfo.cls)}>{sInfo.label}</Badge>
                          {item.status !== 'pendente' && item.avaliado_por_nome && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">por {item.avaliado_por_nome}</p>
                          )}
                          {/* Prazo do desaprovado: ele some sozinho depois de
                              PIX_DIAS_UTEIS_EXPURGO dias úteis, e quem registrou
                              precisa ver quanto tempo ainda tem para conferir. */}
                          {desaprovado && prazoDesaprovado(item) && (
                            <p className="text-[10px] text-red-400/90 mt-0.5 inline-flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {prazoDesaprovado(item)}
                            </p>
                          )}
                        </td>
                        {/* Pagamento da comissão — estado separado da aprovação.
                            Aprovado diz que a comissão é devida; pago diz que ela
                            saiu. O operador vê os dois e para de perguntar. */}
                        <td className="px-4 py-3">
                          {item.pago ? (
                            <>
                              <Badge variant="outline" className="text-[10px] font-semibold bg-teal-500/10 text-teal-400 border-teal-500/30">
                                Pago
                              </Badge>
                              {item.pago_por_nome && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  por {item.pago_por_nome}
                                  {item.pago_em && ` · ${new Date(item.pago_em).toLocaleDateString('pt-BR')}`}
                                </p>
                              )}
                            </>
                          ) : item.status === 'aprovado' ? (
                            <Badge variant="outline" className="text-[10px] font-semibold bg-amber-500/10 text-amber-500 border-amber-500/30">
                              A pagar
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-3">
                          {emEdicao ? (
                            <div className="flex items-center justify-end gap-1">
                              <button title="Salvar" disabled={salvandoEdicao}
                                onClick={() => salvarEdicao(item)}
                                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                                {salvandoEdicao ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Salvar
                              </button>
                              <button title="Cancelar" disabled={salvandoEdicao} onClick={fecharEdicao}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Editar: só enquanto pendente. Depois de avaliado, NR e
                                valor são a base da comissão que o líder já conferiu. */}
                            {podeEditarLinha(item) && (
                              <button title="Editar NR e valor" onClick={() => abrirEdicao(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {ehLider && podeAprovar && item.status === 'pendente' && (
                              <>
                                <button title="Aprovar" disabled={avaliandoId === item.id}
                                  onClick={() => avaliar(item, true)}
                                  className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                                  <Check className="w-3 h-3" /> Aprovar
                                </button>
                                <button title="Desaprovar" disabled={avaliandoId === item.id}
                                  onClick={() => avaliar(item, false)}
                                  className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
                                  <XCircle className="w-3 h-3" /> Desaprovar
                                </button>
                              </>
                            )}
                            {/* Pagar só o que está aprovado — é o que o banco aceita. */}
                            {ehLider && item.status === 'aprovado' && (
                              <button title={item.pago ? 'Desfazer pagamento' : 'Marcar comissão como paga'}
                                disabled={avaliandoId === item.id}
                                onClick={() => alternarPago(item)}
                                className={cn(
                                  'h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold border disabled:opacity-50',
                                  item.pago
                                    ? 'text-muted-foreground border-border hover:text-foreground hover:bg-accent/60'
                                    : 'text-teal-400 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20',
                                )}>
                                <Banknote className="w-3 h-3" /> {item.pago ? 'Desfazer' : 'Pagar'}
                              </button>
                            )}
                            {/* Pago não volta para pendente: ficaria uma linha
                                pendente com pagamento feito, estado que a regra
                                do NR não sabe ler. Desfaz-se o pagamento
                                primeiro — o botão ao lado faz isso. */}
                            {ehLider && item.status !== 'pendente' && !item.pago && (
                              <button title="Voltar para pendente" disabled={avaliandoId === item.id}
                                onClick={() => voltarPendente(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Linha paga não se exclui: o pagamento é o que
                                tranca o NR desde a 20260811a, e apagar a linha
                                destrancaria. O banco recusa de qualquer jeito
                                (trg_pix_a_impede_pago) — aqui é só não oferecer
                                um botão que vai dar erro. */}
                            {!item.pago && (ehLider || (desaprovado && item.operador_id === perfil?.id)) && (
                              <button title="Excluir registro" onClick={() => excluir(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Rodapé de páginas. Só aparece quando há mais de uma — numa
                  lista curta seria ruído fixo dizendo "1 de 1". */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                  <p className="text-[11px] text-muted-foreground">
                    {(paginaAtual - 1) * PIX_LINHAS_POR_PAGINA + 1}
                    {'–'}
                    {Math.min(paginaAtual * PIX_LINHAS_POR_PAGINA, visiveis.length)}
                    {' de '}
                    <span className="font-semibold text-foreground">{visiveis.length}</span>
                    {' registros'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 px-2 text-xs rounded-lg"
                      disabled={paginaAtual <= 1}
                      onClick={() => setPagina(p => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="text-[11px] text-muted-foreground tabular-nums px-1">
                      {paginaAtual} / {totalPaginas}
                    </span>
                    <Button
                      variant="outline" size="sm"
                      className="h-7 px-2 text-xs rounded-lg"
                      disabled={paginaAtual >= totalPaginas}
                      onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Lixeira ────────────────────────────────────────────────────────
          Existe porque o excluir apagava de vez: sem log, sem auditoria, sem
          volta. Um registro se perdeu assim em 10/08/2026 e o valor não pôde
          ser recuperado — ele só existia na tabela do Pix. */}
      <Dialog open={lixeiraAberta} onOpenChange={setLixeiraAberta}>
        <DialogContent className="max-w-3xl" aria-describedby="dlg-lixeira-pix">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
              Lixeira do Pix automático
            </DialogTitle>
            <DialogDescription id="dlg-lixeira-pix">
              Registros excluídos ficam aqui por 3 dias e depois somem de vez.
              {!ehLider && ' Restaurar é com o líder.'}
            </DialogDescription>
          </DialogHeader>

          {lixeiraCarregando ? (
            <div className="space-y-2 py-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
            </div>
          ) : lixeira.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Trash2 className="w-7 h-7 opacity-20" />
              <p className="text-sm">A lixeira está vazia.</p>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border">
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">NR</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Excluído por</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Quando</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lixeira.map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-2 py-2 font-mono">{item.nr_cliente}</td>
                      <td className="px-2 py-2">{item.operador_nome ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrency(Number(item.valor))}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {item.excluido_por_nome ?? '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-muted-foreground">
                        {new Date(item.excluido_em).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {/* Restaurar é líder+ — a RPC confere no servidor, o
                              botão só evita o clique que ia falhar. */}
                          {ehLider && (
                            <button
                              title="Restaurar este registro"
                              disabled={restaurandoId === item.id}
                              onClick={() => restaurarDaLixeira(item)}
                              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {restaurandoId === item.id
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <Undo2 className="w-3 h-3" />}
                              Restaurar
                            </button>
                          )}
                          {ehLider && (
                            <button
                              title="Apagar em definitivo"
                              onClick={() => apagarDaLixeira(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Histórico ──────────────────────────────────────────────────────
          Todo movimento de um registro do Pix: quem criou, quem editou, quem
          aprovou, quem pagou, quem desfez, quem excluiu. Escrito por triggers
          (20260811c) — não existe caminho de escrita pelo cliente, porque log
          que a tela grava tem furo no dia em que alguém esquece de chamar. */}
      <Dialog open={historicoAberto} onOpenChange={setHistoricoAberto}>
        <DialogContent className="max-w-3xl" aria-describedby="dlg-historico-pix">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              Histórico do Pix automático
            </DialogTitle>
            <DialogDescription id="dlg-historico-pix">
              Tudo o que aconteceu com os registros: criação, edição, avaliação,
              pagamento e exclusão.
              {!ehLider && ' Você vê o histórico dos seus registros.'}
            </DialogDescription>
          </DialogHeader>

          <Input
            value={historicoBusca}
            onChange={e => setHistoricoBusca(e.target.value)}
            placeholder="Filtrar por NR, pessoa ou ação…"
            className="h-8 text-xs"
          />

          {historicoCarregando ? (
            <div className="space-y-2 py-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
            </div>
          ) : historicoVisivel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <History className="w-7 h-7 opacity-20" />
              <p className="text-sm">
                {historico.length === 0
                  ? 'Nada registrado ainda.'
                  : 'Nenhuma ação para esse filtro.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1.5">
              {historicoVisivel.map(item => (
                <div key={item.id}
                  className="flex items-start gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
                  <span className={cn(
                    'shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    PIX_LOG_ESTILO[item.acao],
                  )}>
                    {PIX_LOG_LABEL[item.acao]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed break-words">{item.descricao}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {item.autor_nome ?? 'Sistema'}
                      {item.operador_nome && item.operador_nome !== item.autor_nome
                        && ` · registro de ${item.operador_nome}`}
                      {' · '}
                      <span className="font-mono">
                        {new Date(item.criado_em).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
