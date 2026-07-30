/**
 * Estado e lógica do Campanha Fácil (BookPlay).
 *
 * Porta a máquina de estado do app.js original para React, reaproveitando a
 * lógica pura (campaign-core.js / xlsx-export.js) sem alterá-la. A persistência
 * de mensagens, descontos e ocultas passou de localStorage para Supabase
 * compartilhado por empresa (campanhaFacil.service).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { copiarTexto } from '@/lib/clipboard';
import { CampaignCore, type Discounts, type ParsedResult, type Template, type CampaignItem } from './lib/campaign-core';
import { CampaignXlsx } from './lib/xlsx-export';
import { parseSpreadsheetReport } from './lib/readSpreadsheet';
import {
  fetchMensagens, criarMensagem, atualizarMensagemCorpo, excluirMensagem,
  fetchDescontos, salvarDesconto, excluirDesconto,
  fetchOcultas, ocultarMensagemPadrao, restaurarMensagensPadrao,
  type CampanhaMensagem, type CampanhaDesconto,
} from './campanhaFacil.service';

const DISCOUNT_KEYS: (keyof Discounts)[] = ['overdue', 'settlement', 'interest', 'bundle', 'annual'];
const PAGE_SIZE = 25;

export interface ImportProgress { value: number; label: string; detail: string }
export type StatusFilter = 'all' | 'Revisar';
export type WorkspaceState = 'ready' | 'review' | 'blocked';

function normalizeDiscountValue(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function discountsEqual(a: Discounts, b: Discounts): boolean {
  return DISCOUNT_KEYS.every((k) => Math.abs(normalizeDiscountValue(a[k]) - normalizeDiscountValue(b[k])) < 0.0001);
}

function userMessageToTemplate(m: CampanhaMensagem): Template {
  return {
    id: m.id,
    name: m.titulo,
    category: m.categoria,
    description: 'Mensagem adicionada por você — texto preservado.',
    body: m.corpo,
  };
}

// Ao importar um relatório 247 (sem valores), se a mensagem escolhida exigir
// dados financeiros, cai numa mensagem compatível — igual ao app original.
const PREFERRED_247_IDS = ['regularizacao-um-minuto', 'em-dia', 'preventivo', 'negociacao-recebida', 'negociacao-nao-concluida'];

export function useCampanhaFacil() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  // ── Persistência compartilhada ─────────────────────────────────────────────
  const [userMessages, setUserMessages] = useState<CampanhaMensagem[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [discountPresets, setDiscountPresets] = useState<CampanhaDesconto[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Edições de texto de mensagens PADRÃO são efêmeras (sessão), como no original.
  const [customBodies, setCustomBodies] = useState<Map<string, string>>(new Map());

  // ── Estado da campanha ─────────────────────────────────────────────────────
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedRowNumber, setSelectedRowNumber] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  // ── Configuração (form) ────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState<string>(CampaignCore.TEMPLATES[0].id);
  const [sendersInput, setSendersInput] = useState('');
  const [discountsInput, setDiscountsInput] = useState<Discounts>({ ...CampaignCore.DEFAULT_DISCOUNTS });

  // Valores "aplicados" (debounced) que alimentam a geração da campanha.
  const [sendersApplied, setSendersApplied] = useState('');
  const [discountsApplied, setDiscountsApplied] = useState<Discounts>({ ...CampaignCore.DEFAULT_DISCOUNTS });

  useEffect(() => {
    const t = setTimeout(() => setSendersApplied(sendersInput), 250);
    return () => clearTimeout(t);
  }, [sendersInput]);
  useEffect(() => {
    const t = setTimeout(() => setDiscountsApplied(discountsInput), 250);
    return () => clearTimeout(t);
  }, [discountsInput]);

  // ── Carga inicial da persistência ──────────────────────────────────────────
  useEffect(() => {
    if (!empresaId) return;
    let ativo = true;
    setLoadingConfig(true);
    Promise.all([fetchMensagens(empresaId), fetchDescontos(empresaId), fetchOcultas(empresaId)])
      .then(([msgs, descs, ocultas]) => {
        if (!ativo) return;
        setUserMessages(msgs);
        setDiscountPresets(descs);
        setHiddenIds(new Set(ocultas));
      })
      .catch((err) => {
        console.error('[CampanhaFacil] carga inicial falhou:', err);
        if (ativo) toast.error('Não foi possível carregar mensagens e configurações salvas.');
      })
      .finally(() => { if (ativo) setLoadingConfig(false); });
    return () => { ativo = false; };
  }, [empresaId]);

  // ── Templates disponíveis ──────────────────────────────────────────────────
  const templates = useMemo<Template[]>(() => {
    const builtIns = CampaignCore.TEMPLATES.filter((t) => !hiddenIds.has(t.id));
    return [...builtIns, ...userMessages.map(userMessageToTemplate)];
  }, [hiddenIds, userMessages]);

  const isUserTemplate = useCallback((id: string) => userMessages.some((m) => m.id === id), [userMessages]);

  const selectedTemplate = useMemo<Template>(() => {
    return templates.find((t) => t.id === templateId) ?? templates[0] ?? CampaignCore.TEMPLATES[0];
  }, [templates, templateId]);

  // Garante que o templateId aponte para algo existente (ex.: após exclusão).
  useEffect(() => {
    if (templates.length && !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0].id);
    }
  }, [templates, templateId]);

  const selectedTemplateBody = useMemo(() => {
    if (isUserTemplate(selectedTemplate.id)) return selectedTemplate.body;
    return customBodies.get(selectedTemplate.id) ?? selectedTemplate.body;
  }, [selectedTemplate, customBodies, isUserTemplate]);

  const isReport247 = parsed?.sourceType === 'report-247';

  // ── Geração da campanha (pura, memoizada) ──────────────────────────────────
  const sendersList = useMemo(() => CampaignCore.normalizeSenders(sendersApplied), [sendersApplied]);

  const campaign = useMemo<CampaignItem[]>(() => {
    if (!parsed) return [];
    return CampaignCore.buildCampaign(parsed.records, {
      discounts: discountsApplied,
      senders: sendersList,
      template: selectedTemplateBody,
    });
  }, [parsed, discountsApplied, sendersList, selectedTemplateBody]);

  // ── Seleção ────────────────────────────────────────────────────────────────
  const selectedIndex = useMemo(() => {
    if (selectedRowNumber == null) return campaign.length ? 0 : -1;
    const idx = campaign.findIndex((i) => i.rowNumber === selectedRowNumber);
    return idx >= 0 ? idx : (campaign.length ? 0 : -1);
  }, [campaign, selectedRowNumber]);
  const selectedItem = selectedIndex >= 0 ? campaign[selectedIndex] : null;

  // ── Filtro + paginação ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return campaign
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (!query) return true;
        return [item.name, item.cpf, item.phone, item.contract, item.company, item.sender]
          .some((v) => String(v || '').toLocaleLowerCase('pt-BR').includes(query));
      });
  }, [campaign, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, pageCount));
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Estatísticas / estado do workspace ─────────────────────────────────────
  const stats = useMemo(() => {
    const ready = campaign.filter((i) => i.status === 'Pronto').length;
    const review = campaign.length - ready;
    const blocking = campaign.filter((i) => i.hasBlockingIssues || (i.blockingIssues?.length ?? 0) > 0).length;
    return { total: campaign.length, ready, review, blocking, senderCount: sendersList.length };
  }, [campaign, sendersList]);

  const workspaceState: WorkspaceState =
    stats.blocking > 0 ? 'blocked'
    : (stats.review > 0 || stats.senderCount === 0) ? 'review'
    : 'ready';

  // ── Configuração de desconto selecionada ───────────────────────────────────
  const selectedDiscountPresetId = useMemo(() => {
    if (discountsEqual(discountsInput, CampaignCore.DEFAULT_DISCOUNTS)) return 'macro-default';
    const match = discountPresets.find((p) => discountsEqual(p.discounts, discountsInput));
    return match?.id ?? 'custom';
  }, [discountsInput, discountPresets]);

  // ── Ações de arquivo ───────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File | null | undefined) => {
    if (!file || isProcessing) return;
    if (!/\.(csv|txt|xls|xlsx)$/i.test(file.name)) {
      toast.error('Selecione um arquivo CSV, TXT, XLS ou XLSX.');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      toast.error('O arquivo ultrapassa o limite de 40 MB. Exporte uma versão menor antes de continuar.');
      return;
    }

    setIsProcessing(true);
    setImportProgress({ value: 6, label: 'Abrindo o arquivo', detail: 'Carregando os dados selecionados.' });
    try {
      const buffer = await file.arrayBuffer();
      const isSpreadsheet = /\.xlsx?$/i.test(file.name);
      let result: ParsedResult;
      if (isSpreadsheet) {
        result = parseSpreadsheetReport(buffer, (value, label, detail) => setImportProgress({ value, label, detail }));
      } else {
        setImportProgress({ value: 52, label: 'Analisando o mailing', detail: 'Identificando colunas, contatos e valores.' });
        result = CampaignCore.parseMailing(buffer);
      }
      if (result.records.length > 100000) {
        throw new Error('O arquivo ultrapassa o limite de 100 mil contatos. Divida-o antes de continuar.');
      }

      const compact = result.sourceType === 'report-247';
      setImportProgress({
        value: 94,
        label: 'Gerando as mensagens',
        detail: compact ? 'Aplicando a mensagem e os responsáveis, sem criar valores financeiros.' : 'Aplicando responsáveis, descontos e validações.',
      });

      // Mensagem compatível para o 247 (que não tem valores financeiros).
      let changedTemplate = false;
      if (compact && CampaignCore.templateRequiresFinancialData(selectedTemplateBody)) {
        const bodyOf = (t: Template) => (isUserTemplate(t.id) ? t.body : (customBodies.get(t.id) ?? t.body));
        const compatible =
          PREFERRED_247_IDS.map((id) => templates.find((t) => t.id === id)).find((t) => t && !CampaignCore.templateRequiresFinancialData(bodyOf(t)))
          || templates.find((t) => !CampaignCore.templateRequiresFinancialData(bodyOf(t)));
        if (compatible) { setTemplateId(compatible.id); changedTemplate = true; }
      }

      setParsed(result);
      setFileName(file.name);
      setSelectedRowNumber(null);
      setPage(1);
      setSearch('');
      setStatusFilter('all');
      setImportProgress({ value: 100, label: 'Campanha preparada', detail: 'Os dados foram analisados com sucesso.' });

      toast.success(
        compact
          ? `${result.records.length.toLocaleString('pt-BR')} registros do relatório 247 preparados sem cálculos financeiros.${changedTemplate ? ' Uma mensagem compatível foi selecionada.' : ''}`
          : result.sourceType === 'collections-report'
            ? `${result.records.length.toLocaleString('pt-BR')} cobranças prontas após os filtros automáticos.`
            : `${result.records.length.toLocaleString('pt-BR')} contatos processados.`,
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler o mailing.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setImportProgress(null), 400);
    }
  }, [isProcessing, selectedTemplateBody, templates, customBodies, isUserTemplate]);

  const removeMailing = useCallback(() => {
    setParsed(null);
    setFileName('');
    setSelectedRowNumber(null);
    setPage(1);
    setSearch('');
    setStatusFilter('all');
    toast.success('Mailing removido.');
  }, []);

  const downloadExcluded = useCallback(() => {
    if (!parsed?.excludedRecords?.length) {
      toast.error('Não há registros excluídos para baixar.');
      return;
    }
    try {
      const csv = CampaignCore.excludedRecordsToCsv(parsed);
      const base = (fileName.replace(/\.[^.]+$/, '').trim() || 'relatorio').replace(/[<>:"/\\|?* -]/g, '-').replace(/[. ]+$/, '');
      const nome = `registros-excluidos-${base}-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nome);
      toast.success(`${parsed.excludedRecords.length.toLocaleString('pt-BR')} registros excluídos foram baixados.`);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível gerar o relatório de excluídos.');
    }
  }, [parsed, fileName]);

  // ── Mensagens ──────────────────────────────────────────────────────────────
  const saveTemplateBody = useCallback(async (corpo: string) => {
    if (!corpo.trim()) { toast.error('A mensagem não pode ficar vazia.'); return; }
    const id = selectedTemplate.id;
    if (isUserTemplate(id)) {
      try {
        await atualizarMensagemCorpo(id, corpo);
        setUserMessages((prev) => prev.map((m) => (m.id === id ? { ...m, corpo } : m)));
        toast.success('Mensagem aplicada sem alterar o texto digitado.');
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível salvar a mensagem.');
      }
    } else {
      setCustomBodies((prev) => new Map(prev).set(id, corpo));
      toast.success('Mensagem aplicada sem alterar o texto digitado.');
    }
  }, [selectedTemplate, isUserTemplate]);

  const resetTemplateBody = useCallback(() => {
    const id = selectedTemplate.id;
    setCustomBodies((prev) => { const n = new Map(prev); n.delete(id); return n; });
  }, [selectedTemplate]);

  const addMessage = useCallback(async (titulo: string, categoria: string, corpo: string) => {
    if (!empresaId) return;
    if (!titulo.trim() || !corpo.trim()) { toast.error('Informe o título e o texto da mensagem.'); return; }
    try {
      const nova = await criarMensagem({
        empresaId,
        titulo: titulo.trim(),
        categoria: categoria.trim() || 'Personalizadas',
        corpo,
        criadoPor: perfil?.id ?? null,
        criadoPorNome: perfil?.nome ?? null,
      });
      setUserMessages((prev) => [...prev, nova]);
      setTemplateId(nova.id);
      toast.success('Mensagem adicionada sem alterações.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível adicionar a mensagem.');
    }
  }, [empresaId, perfil]);

  const deleteSelectedMessage = useCallback(async () => {
    if (templates.length <= 1) { toast.error('Mantenha ao menos uma mensagem na biblioteca.'); return; }
    if (!empresaId) return;
    const id = selectedTemplate.id;
    const idx = templates.findIndex((t) => t.id === id);
    try {
      if (isUserTemplate(id)) {
        await excluirMensagem(id);
        setUserMessages((prev) => prev.filter((m) => m.id !== id));
        toast.success('Mensagem excluída.');
      } else {
        await ocultarMensagemPadrao({ empresaId, templateId: id, ocultadoPor: perfil?.id ?? null });
        setHiddenIds((prev) => new Set(prev).add(id));
        toast.success('Mensagem removida da lista.');
      }
      setCustomBodies((prev) => { const n = new Map(prev); n.delete(id); return n; });
      // Seleciona uma vizinha após remover.
      const remaining = templates.filter((t) => t.id !== id);
      const next = remaining[Math.min(Math.max(idx, 0), remaining.length - 1)];
      if (next) setTemplateId(next.id);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível excluir a mensagem.');
    }
  }, [templates, empresaId, selectedTemplate, isUserTemplate, perfil]);

  const restoreDefaults = useCallback(async () => {
    if (!empresaId || hiddenIds.size === 0) return;
    try {
      await restaurarMensagensPadrao(empresaId);
      setHiddenIds(new Set());
      toast.success('Mensagens padrão restauradas.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível restaurar as mensagens padrão.');
    }
  }, [empresaId, hiddenIds]);

  // ── Descontos ──────────────────────────────────────────────────────────────
  const setDiscount = useCallback((key: keyof Discounts, value: number | string) => {
    setDiscountsInput((prev) => ({ ...prev, [key]: normalizeDiscountValue(value) }));
  }, []);

  const applyDiscountPreset = useCallback((id: string) => {
    if (id === 'custom') return;
    const preset = id === 'macro-default'
      ? { discounts: { ...CampaignCore.DEFAULT_DISCOUNTS }, nome: 'Padrão do macro' }
      : discountPresets.find((p) => p.id === id);
    if (!preset) return;
    setDiscountsInput({ ...preset.discounts });
    toast.success(`Configuração “${preset.nome}” aplicada.`);
  }, [discountPresets]);

  const saveDiscountPreset = useCallback(async (nome: string) => {
    if (!empresaId) return;
    if (!nome.trim()) { toast.error('Informe um nome para a configuração.'); return; }
    try {
      const { atualizado } = await salvarDesconto({
        empresaId, nome: nome.trim(), discounts: discountsInput, criadoPor: perfil?.id ?? null,
      });
      const frescos = await fetchDescontos(empresaId);
      setDiscountPresets(frescos);
      toast.success(atualizado ? 'Configuração de desconto atualizada.' : 'Configuração de desconto salva.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível salvar a configuração de desconto.');
    }
  }, [empresaId, discountsInput, perfil]);

  const deleteDiscountPreset = useCallback(async (id: string) => {
    try {
      await excluirDesconto(id);
      setDiscountPresets((prev) => prev.filter((p) => p.id !== id));
      toast.success('Configuração de desconto excluída.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível excluir a configuração de desconto.');
    }
  }, []);

  // ── Exportar ───────────────────────────────────────────────────────────────
  const exportCampaign = useCallback((rawFileName: string): boolean => {
    if (!campaign.length) return false;
    if (sendersList.length === 0) { toast.error('Informe quem encaminhará a campanha antes de exportar.'); return false; }
    if (campaign.some((i) => i.hasBlockingIssues || (i.blockingIssues?.length ?? 0) > 0)) {
      toast.error(isReport247 ? 'Corrija as pendências do relatório 247 antes de exportar.' : 'Corrija os registros com valores inválidos antes de exportar.');
      return false;
    }
    const nome = normalizeExportFileName(rawFileName);
    try {
      const workbook = CampaignXlsx.createWorkbook(campaign);
      if (!CampaignXlsx.isValidWorkbook(workbook)) throw new Error('O arquivo Excel não foi gerado corretamente.');
      downloadBlob(new Blob([workbook as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome);
      toast.success(`Campanha salva como ${nome}.`);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a campanha.');
      return false;
    }
  }, [campaign, sendersList, isReport247]);

  const defaultExportFileName = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    const base = fileName.replace(/\.[^.]+$/, '').trim();
    return base ? `campanha-${base}-${date}.xlsx` : `campanha-pronta-${date}.xlsx`;
  }, [fileName]);

  const copyMessage = useCallback(async (item: CampaignItem | null) => {
    if (!item) return;
    // O fallback duplicado que existia aqui virou `copiarTexto`. De passagem
    // conserta o toast: ele estava FORA do try/catch, então anunciava
    // "Mensagem copiada." mesmo quando os dois caminhos de cópia falhavam.
    await copiarTexto(item.message, 'Mensagem copiada.', 'Não foi possível copiar a mensagem.');
  }, []);

  return {
    // dados/estado
    loadingConfig, parsed, fileName, campaign, filtered, pageItems,
    selectedItem, selectedIndex, selectedRowNumber, setSelectedRowNumber,
    page: safePage, pageCount, pageStart, setPage,
    search, setSearch, statusFilter, setStatusFilter,
    isProcessing, importProgress, isReport247,
    stats, workspaceState,
    // templates
    templates, templateId, setTemplateId, selectedTemplate, selectedTemplateBody,
    isUserTemplate, hiddenCount: hiddenIds.size,
    // config
    sendersInput, setSendersInput, sendersList,
    discountsInput, setDiscount, discountPresets, selectedDiscountPresetId,
    // ações
    processFile, removeMailing, downloadExcluded,
    saveTemplateBody, resetTemplateBody, addMessage, deleteSelectedMessage, restoreDefaults,
    applyDiscountPreset, saveDiscountPreset, deleteDiscountPreset,
    exportCampaign, defaultExportFileName, copyMessage,
  };
}

// ── util ───────────────────────────────────────────────────────────────────
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function normalizeExportFileName(value: string): string {
  const date = new Date().toISOString().slice(0, 10);
  let name = String(value || '').trim().replace(/[<>:"/\\|?* -]/g, '-').replace(/[. ]+$/, '');
  if (!name) name = `campanha-pronta-${date}`;
  if (!/\.xlsx$/i.test(name)) name += '.xlsx';
  return name;
}
