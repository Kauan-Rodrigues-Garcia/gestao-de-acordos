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
 * Cada NR é único por empresa (registro histórico em pix_automatico_nr_registro).
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Plus, RefreshCw, Search, X, Check, XCircle, Trash2, Undo2,
  Clock, CheckCircle2, Percent, Hash, DollarSign, User, Layers, Save,
  Copy, Upload, Download, Building2, Lock, Target, TrendingUp,
} from 'lucide-react';
import { utils as xlsxUtils, write as xlsxWrite } from '@e965/xlsx';
import { lerArquivoOperador } from '@/services/importOperadorExcel/lerArquivo';
import { resolverOperadorDaEmpresa } from '@/services/importOperadorExcel/resolverOperador';
import type { ResultadoArquivo } from '@/services/importOperadorExcel/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes } from '@/lib/supabase';
import { formatCurrency, parseCurrencyInput, isPerfilAdminOuLider, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { diasUteisDoMes, diasUteisDecorridos, quartilAtual } from '@/lib/diasUteis';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import {
  PixAutoAcordo, PixAutoStatus, PixAutoConfig, PIX_AUTO_PCT_PADRAO,
  fetchAcordosPix, criarAcordoPix, avaliarAcordoPix, reavaliarAcordoPix,
  excluirAcordoPix, limparDesaprovados, fetchConfigsPix, upsertConfigPix,
  setPermiteRegistroOperador, normalizarNr, fetchNrsBloqueados,
  comissaoDe, formatarLinhaPix, criarAcordosPixLote, type LinhaPixLote,
} from '@/services/pix_automatico.service';

/** Copia texto para a área de transferência com feedback via toast. */
async function copiarTexto(texto: string, msgOk: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(msgOk);
  } catch {
    toast.error('Não foi possível copiar (área de transferência indisponível).');
  }
}

const STATUS_INFO: Record<PixAutoStatus, { label: string; cls: string }> = {
  pendente:    { label: 'Pendente',    cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
  aprovado:    { label: 'Aprovado',    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  desaprovado: { label: 'Desaprovado', cls: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

function fmtPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

interface OperadorInfo { id: string; nome: string; equipe_id: string | null; setor_id: string | null; perfil: string; }

/** Resumo da leitura das planilhas antes de confirmar a inclusão dos pendentes. */
interface PreviewImport {
  linhas: LinhaPixLote[];                                    // pendentes vinculados → viram acordos Pix
  porOperador: { nome: string; qtd: number; total: number }[];
  arquivosOk: { nome: string; pagas: number; pendentes: number }[];
  pagas: number;
  revisao: { arquivo: string; login: string; nr: string; motivo: string }[];
  erros: string[];
}

/** Cargos com visão de mais de um setor (podem filtrar e configurar por setor). */
const CARGOS_MULTI_SETOR = ['gerencia', 'diretoria', 'administrador', 'super_admin'];

export function PixAutomatico() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const cargo   = String(perfil?.perfil ?? '').toLowerCase();
  const ehLider = isPerfilAdminOuLider(cargo);
  const ehMultiSetor = CARGOS_MULTI_SETOR.includes(cargo);

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

  // Config % (líder)
  const [pctInput, setPctInput]     = useState('');
  const [salvandoPct, setSalvandoPct] = useState(false);
  const [confirmandoPct, setConfirmandoPct] = useState<number | null>(null);
  const [salvandoToggle, setSalvandoToggle] = useState(false);
  const [avaliandoId, setAvaliandoId] = useState<string | null>(null);
  const [limpando, setLimpando]       = useState(false);

  // Seleção múltipla (líder) + import
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteProcessando, setLoteProcessando] = useState(false);
  const [importando, setImportando]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Prévia da importação (aba pelo nome do arquivo, cor→pendente, login→operador)
  const [previewImport, setPreviewImport] = useState<PreviewImport | null>(null);
  const [confirmandoImport, setConfirmandoImport] = useState(false);

  // Meta / quartil do operador logado (card de bônus)
  const [metaValor, setMetaValor]   = useState<number | null>(null);
  const [configMes, setConfigMes]   = useState<MetasConfigMes | null>(null);
  const [recebidoMes, setRecebidoMes] = useState<number | null>(null);

  const meuSetor = perfil?.setor_id ?? null;
  // Setor cuja configuração (% e interruptor) está em edição: multi-setor usa o
  // filtro de setor; líder/elite sempre o próprio setor.
  const setorConfig = ehMultiSetor ? (filtroSetor || meuSetor) : meuSetor;

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
  // Operador só registra com o interruptor do PRÓPRIO setor ligado
  const podeRegistrar = ehLider
    || meuSetor == null
    || (configs[meuSetor]?.permite_registro_operador ?? true);

  const carregar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    setLoading(true);
    try {
      const [lista, cfgs, bloqueados] = await Promise.all([
        fetchAcordosPix(empresa.id, ehLider ? undefined : { operadorId: perfil.id }),
        fetchConfigsPix(empresa.id),
        fetchNrsBloqueados(empresa.id),
      ]);
      setItens(lista);
      const mapa: Record<string, PixAutoConfig> = {};
      cfgs.forEach(c => { mapa[c.setor_id] = { ...c, permite_registro_operador: c.permite_registro_operador ?? true }; });
      setConfigs(mapa);
      setNrsBloqueados(bloqueados);

      if (ehLider) {
        // Nomes/equipes/setores para filtros, vínculo e coluna Operador
        const [{ data: ops }, { data: eqs }, { data: sets }] = await Promise.all([
          supabase.from('perfis').select('id, nome, equipe_id, setor_id, perfil')
            .eq('empresa_id', empresa.id).order('nome'),
          supabase.from('equipes').select('id, nome')
            .eq('empresa_id', empresa.id).order('nome'),
          supabase.from('setores').select('id, nome')
            .eq('empresa_id', empresa.id).order('nome'),
        ]);
        setOperadores(((ops ?? []) as OperadorInfo[]));
        setEquipes(((eqs ?? []) as { id: string; nome: string }[]));
        setSetores(((sets ?? []) as { id: string; nome: string }[]));
      }
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, perfil?.id, ehLider]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPctInput(String(pctSetorConfig).replace('.', ',')); }, [pctSetorConfig]);

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
          buscarResumoOperadoresAnalitico(empresa.id, mesStr),
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

  // ── Derivados ───────────────────────────────────────────────────────────
  const operadorEquipe = useMemo(() => {
    const m: Record<string, string | null> = {};
    operadores.forEach(o => { m[o.id] = o.equipe_id; });
    return m;
  }, [operadores]);

  const operadorSetor = useMemo(() => {
    const m: Record<string, string | null> = {};
    operadores.forEach(o => { m[o.id] = o.setor_id; });
    return m;
  }, [operadores]);

  // Filtro de operador só lista OPERADORES (sem líder/gerência/diretoria etc.)
  const operadoresFiltro = useMemo(
    () => operadores.filter(o => String(o.perfil ?? '').toLowerCase() === 'operador'),
    [operadores],
  );

  // Sugestões do vínculo (líder+ registra em nome de um operador)
  const sugestoesVinculo = useMemo(() => {
    const b = vinculoBusca.trim().toLowerCase();
    if (!b) return [];
    return operadoresFiltro
      .filter(o => o.nome.toLowerCase().includes(b))
      .slice(0, 8);
  }, [operadoresFiltro, vinculoBusca]);

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return itens.filter(i => {
      if (filtroStatus !== 'todos' && i.status !== filtroStatus) return false;
      if (filtroOperador && i.operador_id !== filtroOperador) return false;
      if (filtroEquipe && operadorEquipe[i.operador_id] !== filtroEquipe) return false;
      if (filtroSetor && (i.setor_id ?? operadorSetor[i.operador_id] ?? null) !== filtroSetor) return false;
      if (!b) return true;
      return i.nr_cliente.toLowerCase().includes(b) || (i.operador_nome ?? '').toLowerCase().includes(b);
    });
  }, [itens, busca, filtroStatus, filtroOperador, filtroEquipe, filtroSetor, operadorEquipe, operadorSetor]);

  // Totais SEMPRE sobre o conjunto visível (líder filtrando vê o recorte)
  const totais = useMemo(() => {
    const soma = (status: PixAutoStatus) => {
      const doStatus = visiveis.filter(i => i.status === status);
      return {
        qtd:      doStatus.length,
        valor:    doStatus.reduce((acc, i) => acc + Number(i.valor), 0),
        comissao: doStatus.reduce((acc, i) => acc + comissaoDe(i, pctPorSetor), 0),
      };
    };
    return { pendente: soma('pendente'), aprovado: soma('aprovado'), desaprovado: soma('desaprovado') };
  }, [visiveis, pctPorSetor]);

  const meusDesaprovados = itens.filter(i => i.operador_id === perfil?.id && i.status === 'desaprovado').length;

  // ── Bônus por meta (card dinâmico) ──────────────────────────────────────
  // O que o operador já recebeu de comissão APROVADA no mês é pago DE NOVO se
  // ele bater a meta. Estado do card vem da meta + quartis configurados:
  //   • meta batida → valor garantido (verde)
  //   • 1º quartil  → projetando a meta, mensagem de incentivo (azul)
  //   • demais      → informativo (violeta)
  const bonusMeta = useMemo(() => {
    if (!perfil?.id || metaValor == null || metaValor <= 0 || !configMes || recebidoMes == null) return null;
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth() + 1;
    const prefixoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const acumulado = itens
      .filter(i => i.operador_id === perfil.id && i.status === 'aprovado' && i.criado_em.startsWith(prefixoMes))
      .reduce((s, i) => s + comissaoDe(i, pctPorSetor), 0);
    if (acumulado <= 0) return null;

    const metaBatida = recebidoMes >= metaValor;
    const totalUteis = diasUteisDoMes(ano, mes, configMes.feriados);
    const decorridos = totalUteis === 0 ? 0 : diasUteisDecorridos(
      ano, mes, configMes.feriados, getTodayISO(), undefined, configMes.contar_dia_atual === true,
    );
    const esperado  = totalUteis === 0 ? 0 : (metaValor / totalUteis) * Math.max(decorridos, 1);
    const projecao  = esperado > 0 ? Math.min(Math.round((recebidoMes / esperado) * 100), 999) : 0;
    const quartil   = quartilAtual(projecao, configMes.quartis);
    return { acumulado, metaBatida, quartil: quartil?.quartil ?? null, projecao };
  }, [perfil?.id, itens, pctPorSetor, metaValor, configMes, recebidoMes]);

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

  async function excluir(item: PixAutoAcordo) {
    const { ok, error } = await excluirAcordoPix(item.id);
    if (!ok) { toast.error('Erro ao excluir: ' + error); return; }
    toast.success('Registro excluído.');
    await carregar();
  }

  async function limparMeusDesaprovados() {
    if (!empresa?.id || !perfil?.id) return;
    setLimpando(true);
    try {
      const { ok, count, error } = await limparDesaprovados(empresa.id, perfil.id);
      if (!ok) { toast.error('Erro ao limpar: ' + error); return; }
      toast.success(`${count} registro${count !== 1 ? 's' : ''} desaprovado${count !== 1 ? 's' : ''} removido${count !== 1 ? 's' : ''}.`);
      await carregar();
    } finally {
      setLimpando(false);
    }
  }

  /** Passo 1: valida o % digitado e abre a confirmação. */
  function pedirConfirmacaoPct() {
    if (!setorConfig) return;
    const pct = parseFloat(pctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentual inválido (0 a 100)'); return; }
    if (pct === pctSetorConfig) { toast.info('O percentual não mudou.'); return; }
    setConfirmandoPct(pct);
  }

  /** Passo 2: usuário confirmou no diálogo — grava o % do setor. */
  async function salvarPctConfirmado() {
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

  /** Liga/desliga o registro manual de operadores no setor em edição. */
  async function alternarRegistroSetor(ligar: boolean) {
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
    const linhas = visiveis
      .filter(i => selecionados.has(i.id))
      .map(i => formatarLinhaPix(i, comissaoDe(i, pctPorSetor)));
    if (linhas.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }
    await copiarTexto(linhas.join('\n'), `${linhas.length} acordo(s) copiado(s) para encaminhar.`);
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

  // Exclui (lixeira) em lote os selecionados.
  async function excluirSelecionados() {
    const alvos = visiveis.filter(i => selecionados.has(i.id));
    if (alvos.length === 0) { toast.error('Nenhum acordo selecionado.'); return; }
    setLoteProcessando(true);
    try {
      for (const item of alvos) await excluirAcordoPix(item.id);
      toast.success(`${alvos.length} registro(s) excluído(s).`);
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

  /**
   * Lê 1+ planilhas de operador e monta a prévia. Para cada arquivo:
   *  - a aba lida é a que tem o mesmo nome do arquivo (ex.: Luciana.xlsx → aba "Luciana");
   *  - cada linha é classificada pela COR real da célula (verde = paga; azul/branco = pendente);
   *  - só os PENDENTES válidos (Login+NR+Meta>0) viram acordos Pix, vinculados ao
   *    operador pelo Login (perfis.usuario). Nada é gravado até o usuário confirmar.
   */
  async function lerArquivos(files: FileList | File[]) {
    if (!empresa?.id || !perfil?.id) return;
    const lista = [...files].filter(f => /\.xlsx$/i.test(f.name));
    if (lista.length === 0) { toast.error('Envie ao menos um arquivo .xlsx.'); return; }
    setImportando(true);
    try {
      const resolver = await resolverOperadorDaEmpresa(empresa.id);
      const resultados: ResultadoArquivo[] = [];
      for (const file of lista) {
        try { resultados.push(await lerArquivoOperador(file, resolver)); }
        catch (e) {
          resultados.push({
            nomeArquivo: file.name, principal: file.name, abaUsada: null, hashArquivo: '',
            ok: false, error: e instanceof Error ? e.message : 'Falha ao ler o arquivo.',
            linhas: [], consolidado: [],
            totais: { verdesPagas: 0, pendentes: 0, needsReview: 0, operadoresComPendencia: 0, totalPendenteBruto: '0.00000' },
          });
        }
      }

      // Pendentes vinculados → linhas do lote Pix (uma por NR pendente).
      // O `valor` do acordo Pix é o VALOR DE NOTA (total do acordo); o sistema
      // recalcula a comissão pelo % do setor — igual à planilha (Nota × %).
      // Sem Valor de Nota, deriva do pendente ÷ % da linha; por último, o pendente.
      const num = (s: string | null | undefined) => Number(String(s ?? '').replace(',', '.'));
      const linhas: LinhaPixLote[] = [];
      const porOp = new Map<string, { nome: string; qtd: number; total: number }>();
      for (const r of resultados) {
        for (const c of r.consolidado) {
          for (const l of c.linhas) {
            const nota = num(l.valorNota);
            const pct = num(l.percentual);
            const pend = num(l.metaBatidaPendente);
            const valor = Number.isFinite(nota) && nota > 0
              ? nota
              : (Number.isFinite(pct) && pct > 0 ? pend / pct : pend);
            linhas.push({
              nrCliente: l.nrOriginal, valor,
              operadorId: c.operadorId, operadorNome: c.operadorNome, setorId: c.operadorSetorId,
            });
            const acc = porOp.get(c.operadorId) ?? { nome: c.operadorNome, qtd: 0, total: 0 };
            acc.qtd += 1; acc.total += valor;
            porOp.set(c.operadorId, acc);
          }
        }
      }

      const revisao = resultados.flatMap(r => r.linhas
        .filter(l => l.status === 'NEEDS_REVIEW' || l.status === 'OPERATOR_NOT_FOUND' || l.status === 'AMBIGUOUS_OPERATOR')
        .map(l => ({ arquivo: r.principal, login: l.loginOriginal, nr: l.nrOriginal, motivo: l.observacao ?? l.status })));

      const preview: PreviewImport = {
        linhas,
        porOperador: [...porOp.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
        arquivosOk: resultados.filter(r => r.ok).map(r => ({ nome: r.nomeArquivo, pagas: r.totais.verdesPagas, pendentes: r.totais.pendentes })),
        pagas: resultados.reduce((s, r) => s + r.totais.verdesPagas, 0),
        revisao,
        erros: resultados.filter(r => !r.ok).map(r => `${r.nomeArquivo}: ${r.error}`),
      };

      if (preview.linhas.length === 0 && preview.erros.length > 0) {
        toast.error(preview.erros[0]);
        return;
      }
      setPreviewImport(preview);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Confirma a prévia: grava os pendentes como acordos Pix (nascem pendentes). */
  async function confirmarImport() {
    if (!empresa?.id || !previewImport) return;
    setConfirmandoImport(true);
    try {
      const r = await criarAcordosPixLote(empresa.id, previewImport.linhas);
      if (!r.ok) { toast.error('Erro ao importar: ' + r.error); return; }
      toast.success(
        `Adicionados: ${r.importados}` +
        (r.duplicados ? ` · Duplicados ignorados: ${r.duplicados}` : '') +
        (r.ignorados ? ` · Inválidos ignorados: ${r.ignorados}` : ''),
      );
      setPreviewImport(null);
      await carregar();
    } finally {
      setConfirmandoImport(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const statsCards = [
    {
      label: 'Pendente', qtd: totais.pendente.qtd,
      valor: totais.pendente.valor, comissao: totais.pendente.comissao,
      cls: 'from-sky-500/15 to-sky-600/5 border-sky-500/25', icon: <Clock className="w-4 h-4 text-sky-400" />,
      comissaoCls: 'text-sky-400',
    },
    {
      label: 'Aprovado', qtd: totais.aprovado.qtd,
      valor: totais.aprovado.valor, comissao: totais.aprovado.comissao,
      cls: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/25', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
      comissaoCls: 'text-emerald-400',
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
          <input ref={fileRef} type="file" accept=".xlsx" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) lerArquivos(e.target.files); }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importando}
            className="gap-1.5 h-8 text-xs rounded-lg" title="Importar planilhas de operador (ex.: Luciana.xlsx) — puxa os pendentes por operador">
            {importando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={loading || visiveis.length === 0}
            className="gap-1.5 h-8 text-xs rounded-lg" title="Exportar registros visíveis">
            <Download className="w-3.5 h-3.5" /> Exportar
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {statsCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}>
              <div className={cn('rounded-xl border bg-gradient-to-br p-4 flex items-center justify-between gap-3', s.cls)}>
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
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Bônus por meta (dinâmico: meta batida / 1º quartil / demais) ── */}
      {!loading && bonusMeta && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className={cn(
            'rounded-xl border bg-gradient-to-br p-4 flex items-start gap-3',
            bonusMeta.metaBatida
              ? 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/40'
              : bonusMeta.quartil === 1
                ? 'from-sky-500/15 to-indigo-600/5 border-sky-500/30'
                : 'from-violet-500/15 to-fuchsia-600/5 border-violet-500/25',
          )}>
            {bonusMeta.metaBatida
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              : bonusMeta.quartil === 1
                ? <TrendingUp className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                : <Target className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">
                Bônus por meta · comissão aprovada acumulada no mês
              </p>
              <p className={cn('text-xl font-bold font-mono leading-tight',
                bonusMeta.metaBatida ? 'text-emerald-400' : bonusMeta.quartil === 1 ? 'text-sky-400' : 'text-violet-400')}>
                {formatCurrency(bonusMeta.acumulado)}
              </p>
              {bonusMeta.metaBatida ? (
                <p className="text-xs font-semibold text-emerald-400 mt-1">
                  🏆 Meta batida — este valor está <strong>garantido</strong> e será recebido novamente!
                </p>
              ) : bonusMeta.quartil === 1 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-sky-400">Você está no 1º quartil, projetando a meta ({bonusMeta.projecao}%)!</span>{' '}
                  Continue assim: batendo a meta do mês, você recebe este valor <strong className="text-foreground">de novo</strong>.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Bata a meta do mês e receba este valor <strong className="text-foreground">novamente</strong> como bônus.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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
      {ehLider && setorConfig && (
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
          <button onClick={() => avaliarSelecionados(true)} disabled={loteProcessando}
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" /> Aprovar
          </button>
          <button onClick={() => avaliarSelecionados(false)} disabled={loteProcessando}
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
            <XCircle className="w-3.5 h-3.5" /> Desaprovar
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
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Registrado em</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((item, i) => {
                    const comissao = comissaoDe(item, pctPorSetor);
                    const pctLinha = item.status === 'aprovado' && item.pct_comissao != null
                      ? Number(item.pct_comissao)
                      : (item.setor_id != null ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO) : PIX_AUTO_PCT_PADRAO);
                    const sInfo = STATUS_INFO[item.status];
                    const desaprovado = item.status === 'desaprovado';
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
                          <div className="flex items-center gap-1.5">
                            <span>{item.nr_cliente}</span>
                            <button title="Copiar NR" onClick={() => copiarTexto(item.nr_cliente, 'NR copiado.')}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-violet-400">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        {ehLider && (
                          <td className="px-4 py-3 text-foreground/80 max-w-[160px]">
                            <span className="truncate block">{item.operador_nome ?? '—'}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                          {formatCurrency(item.valor)}
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
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {ehLider && item.status === 'pendente' && (
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
                            {ehLider && item.status !== 'pendente' && (
                              <button title="Voltar para pendente" disabled={avaliandoId === item.id}
                                onClick={() => voltarPendente(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(ehLider || (desaprovado && item.operador_id === perfil?.id)) && (
                              <button title="Excluir registro" onClick={() => excluir(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Prévia da importação de planilhas de operador ── */}
      <Dialog open={previewImport != null} onOpenChange={aberto => { if (!aberto && !confirmandoImport) setPreviewImport(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-violet-400" /> Prévia da importação
            </DialogTitle>
            <DialogDescription className="text-xs">
              Só os <strong>pendentes</strong> (azul/branco) viram acordos Pix, vinculados ao operador pelo Login.
              Os já pagos (verde) são ignorados. O valor é o <strong>total do acordo</strong> (Valor de Nota) — a
              comissão é calculada pelo % do setor. Confira antes de adicionar.
            </DialogDescription>
          </DialogHeader>

          {previewImport && (
            <div className="space-y-3">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
                  <p className="text-lg font-bold text-violet-400">{previewImport.linhas.length}</p>
                  <p className="text-[11px] text-muted-foreground">Pendentes a adicionar</p>
                </div>
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                  <p className="text-lg font-bold text-emerald-400">{previewImport.pagas}</p>
                  <p className="text-[11px] text-muted-foreground">Pagas (ignoradas)</p>
                </div>
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
                  <p className="text-lg font-bold text-amber-500">{previewImport.revisao.length}</p>
                  <p className="text-[11px] text-muted-foreground">Sem operador / revisão</p>
                </div>
              </div>

              {/* Arquivos lidos */}
              {previewImport.arquivosOk.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {previewImport.arquivosOk.map(a => (
                    <span key={a.nome} className="text-[11px] px-2 py-1 rounded-md bg-muted/40 border border-border">
                      {a.nome} · {a.pendentes} pend.
                    </span>
                  ))}
                </div>
              )}

              {/* Por operador */}
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {previewImport.porOperador.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">Nenhum pendente vinculado a operador.</p>
                ) : previewImport.porOperador.map(op => (
                  <div key={op.nome} className="flex items-center gap-3 px-3 py-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs font-medium truncate">{op.nome}</span>
                    <Badge variant="outline" className="text-[10px]">{op.qtd} NR</Badge>
                    <span className="text-xs font-mono font-semibold text-violet-400 w-24 text-right">{formatCurrency(op.total)}</span>
                  </div>
                ))}
              </div>

              {/* Erros de arquivo */}
              {previewImport.erros.length > 0 && (
                <div className="text-[11px] text-red-400 space-y-0.5">
                  {previewImport.erros.map((e, i) => <p key={i}>⚠ {e}</p>)}
                </div>
              )}

              {/* Revisão (sem operador / conflito) */}
              {previewImport.revisao.length > 0 && (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-amber-500 font-medium">
                    {previewImport.revisao.length} linha(s) não vinculadas (não serão adicionadas)
                  </summary>
                  <div className="mt-1 max-h-[140px] overflow-y-auto rounded-md border border-border">
                    <table className="w-full">
                      <tbody>
                        {previewImport.revisao.slice(0, 100).map((r, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td className="px-2 py-1 text-muted-foreground">{r.arquivo}</td>
                            <td className="px-2 py-1 font-mono">{r.login || '—'}</td>
                            <td className="px-2 py-1 font-mono">{r.nr || '—'}</td>
                            <td className="px-2 py-1 text-amber-500">{r.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewImport(null)} disabled={confirmandoImport}>
              Cancelar
            </Button>
            <Button onClick={confirmarImport} disabled={confirmandoImport || !previewImport?.linhas.length} className="gap-1.5">
              {confirmandoImport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar {previewImport?.linhas.length ?? 0} acordo(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
