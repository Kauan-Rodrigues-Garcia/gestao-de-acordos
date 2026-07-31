/**
 * Campanha Fácil (BookPlay) — aba nativa do painel.
 *
 * Transforma arquivos exportados do sistema (mailing CSV/TXT, relatório 245 ou
 * 247 em Excel) em campanhas de cobrança: aplica descontos, substitui variáveis
 * da mensagem, distribui os responsáveis em rodízio e exporta um Excel pronto.
 *
 * A lógica de negócio é a mesma do app original (campaign-core / xlsx-export,
 * portados verbatim); esta página é a interface reescrita com o design system
 * do próprio painel. Persistência de mensagens/descontos é compartilhada por
 * empresa via Supabase (useCampanhaFacil).
 */
import { useRef, useState, type RefObject } from 'react';
import {
  Upload, FileText, Trash2, Plus, Pencil, Copy, Download, Search,
  ChevronLeft, ChevronRight, MessageSquare, Percent,
  AlertTriangle, Eye, Users, Save, Sparkles, Lock, Send,
} from 'lucide-react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CampaignCore, type CampaignItem } from './lib/campaign-core';
import { useCampanhaFacil } from './useCampanhaFacil';

const VARIABLE_LABELS: [string, string][] = [
  ['primeiro_nome', 'Primeiro nome'], ['nome', 'Nome completo'], ['cpf', 'CPF'],
  ['empresa', 'Empresa'], ['contrato', 'Contrato'], ['parcela_desconto', 'Parcela'],
  ['quitacao', 'Quitação'], ['valor_com_juros', 'Valor atualizado'], ['juncao', 'Junção'],
  ['anual', 'Plano anual'], ['cartao_quitacao', '12x quitação'], ['cartao_anual', '12x anual'],
  ['pct_atraso', '% parcela'], ['pct_quitacao', '% quitação'], ['pct_juncao', '% junção'],
  ['pct_anual', '% anual'], ['protocolo', 'Protocolo'], ['link', 'Link'],
];

const DISCOUNT_FIELDS: [keyof typeof CampaignCore.DEFAULT_DISCOUNTS, string][] = [
  ['overdue', 'Parcela em atraso'], ['settlement', 'Quitação'], ['interest', 'Valor com juros'],
  ['bundle', 'Junção'], ['annual', 'Anual'],
];

function insertVariable(ref: RefObject<HTMLTextAreaElement>, value: string, setValue: (v: string) => void, variable: string) {
  const el = ref.current;
  const token = `{{${variable}}}`;
  if (!el) { setValue(''); return; }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + token + el.value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + token.length;
    el.setSelectionRange(caret, caret);
  });
}

function VariableChips({ onInsert }: { onInsert: (variable: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VARIABLE_LABELS.map(([variable, label]) => (
        <button
          key={variable}
          type="button"
          title={`Inserir {{${variable}}}`}
          onClick={() => onInsert(variable)}
          className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function CampanhaFacil() {
  const { empresa } = useEmpresa();
  const cf = useCampanhaFacil();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const addRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);

  // Dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addTitulo, setAddTitulo] = useState('');
  const [addCategoria, setAddCategoria] = useState('Personalizadas');
  const [addCorpo, setAddCorpo] = useState('');
  const [deleteMsgOpen, setDeleteMsgOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState('');
  const [saveDiscountOpen, setSaveDiscountOpen] = useState(false);
  const [discountName, setDiscountName] = useState('');
  const [deleteDiscountOpen, setDeleteDiscountOpen] = useState(false);

  // Categorias das mensagens para o Select agrupado
  const categorias = Array.from(new Set(cf.templates.map((t) => t.category)));

  const presetReal = cf.selectedDiscountPresetId !== 'custom' && cf.selectedDiscountPresetId !== 'macro-default';
  const presetSelecionado = cf.discountPresets.find((p) => p.id === cf.selectedDiscountPresetId);

  // ── Gate BookPlay (defesa em profundidade; a aba já só aparece na BookPlay) ──
  if (empresa && empresa.slug !== 'bookplay') {
    return (
      <div className="p-6">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-50" />
          O Campanha Fácil está disponível apenas para a BookPlay.
        </CardContent></Card>
      </div>
    );
  }

  function openEdit() {
    setEditValue(cf.selectedTemplateBody);
    setEditOpen(true);
  }
  function openExport() {
    if (!cf.campaign.length) return;
    if (cf.sendersList.length === 0) { openSendersHint(); return; }
    setExportName(cf.defaultExportFileName());
    setExportOpen(true);
  }
  function openSendersHint() {
    document.getElementById('cf-senders')?.focus();
  }

  const reviewCount = cf.stats.review;
  const excludedCount = cf.parsed?.excludedRecords?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6">
        {/* ══ Painel de controle ══════════════════════════════════════════════ */}
        <aside className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Nova campanha</p>
            <h1 className="mt-1 text-xl font-bold leading-tight">Configure uma vez.<br />Gere tudo pronto.</h1>
            <p className="mt-1 text-sm text-muted-foreground">Importe o arquivo do sistema, escolha a mensagem e revise o resultado.</p>
          </div>

          {/* Passo 1 — Importar */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <StepTitle n={1} title="Importar mailing" subtitle="Mailing CSV/TXT ou relatórios 245 e 247 em Excel" />

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                className="hidden"
                onChange={(e) => { cf.processFile(e.target.files?.[0]); e.target.value = ''; }}
              />

              {!cf.parsed && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); cf.processFile(e.dataTransfer.files?.[0]); }}
                  disabled={cf.isProcessing}
                  className={cn(
                    'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/40',
                    cf.isProcessing && 'pointer-events-none opacity-60',
                  )}
                >
                  <Upload className="h-6 w-6 text-primary" />
                  <span className="text-sm font-semibold">Arraste o arquivo aqui</span>
                  <span className="text-xs text-muted-foreground">ou clique para selecionar</span>
                  <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CSV · TXT · XLS · XLSX</span>
                </button>
              )}

              {cf.importProgress && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>{cf.importProgress.label}</span>
                    <span>{Math.round(cf.importProgress.value)}%</span>
                  </div>
                  <Progress value={cf.importProgress.value} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground">{cf.importProgress.detail}</p>
                </div>
              )}

              {cf.parsed && !cf.importProgress && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                    {/* 245 = .xls de ligações, preventivo; 247 = .csv com valores. */}
                    {cf.relatorioSemValores ? '245' : cf.parsed.sourceType === 'report-247' ? '247' : 'CSV'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{cf.fileName || 'mailing'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {cf.relatorioSemValores
                        ? `${cf.parsed.records.length.toLocaleString('pt-BR')} clientes · preventivo · ${(cf.parsed.filterStats?.removed ?? 0).toLocaleString('pt-BR')} removidos`
                        : cf.parsed.sourceType === 'report-247'
                          ? `${cf.parsed.records.length.toLocaleString('pt-BR')} cobranças · com valores · ${cf.parsed.encoding}`
                          : `${cf.parsed.records.length.toLocaleString('pt-BR')} contatos · ${cf.parsed.encoding} · ${cf.parsed.headers.length} colunas`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" title="Remover mailing" onClick={cf.removeMailing}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Vale para os DOIS relatórios: os filtros passaram a ser os
                  mesmos, e o cadastral também precisa dizer o que tirou. */}
              {cf.parsed?.filterStats && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">Relatório filtrado automaticamente</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {cf.parsed.filterStats.removed.toLocaleString('pt-BR')} registros removidos (manutenção, COFEN, jornada, pagos e inválidos). Telefones de DDD 1 + Telefone 1.
                  </p>
                  {!!excludedCount && (
                    <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={cf.downloadExcluded}>
                      Baixar registros excluídos
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Passo 2 — Mensagem */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <StepTitle n={2} title="Escolher mensagem" subtitle="Modelo aplicado a todos os contatos" />
              {/* Relatório cadastral não tem valores: as mensagens que citam
                  parcela, quitação ou cartão sairiam com buracos no lugar dos
                  números, então ficam travadas na lista. */}
              {cf.relatorioSemValores && cf.templatesBloqueados.size > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    Relatório sem valores
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {cf.templatesBloqueados.size === 1
                      ? '1 mensagem que usa valores está indisponível.'
                      : `${cf.templatesBloqueados.size} mensagens que usam valores estão indisponíveis.`}
                    {' '}Este arquivo não traz parcela, quitação nem plano anual.
                  </p>
                </div>
              )}
              <Select value={cf.templateId} onValueChange={cf.setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma mensagem" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((cat) => (
                    <SelectGroup key={cat}>
                      <SelectLabel>{cat}</SelectLabel>
                      {cf.templates.filter((t) => t.category === cat).map((t) => {
                        const bloqueada = cf.templatesBloqueados.has(t.id);
                        return (
                          <SelectItem key={t.id} value={t.id} disabled={bloqueada}>
                            {t.name}
                            {bloqueada && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                usa valores
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {cf.mensagemBloqueada && (
                <p className="text-xs text-destructive">
                  A mensagem selecionada usa valores que este relatório não tem.
                  Escolha uma mensagem sem valores para poder exportar.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{cf.selectedTemplate.category}</Badge>
                <p className="text-xs text-muted-foreground">{cf.selectedTemplate.description}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setAddTitulo(''); setAddCategoria('Personalizadas'); setAddCorpo(''); setAddOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={cf.templates.length <= 1}
                  onClick={() => setDeleteMsgOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
              {cf.hiddenCount > 0 && (
                <Button variant="link" className="h-auto p-0 text-xs" onClick={cf.restoreDefaults}>
                  Restaurar mensagens padrão excluídas ({cf.hiddenCount})
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Passo 3 — Responsáveis */}
          <Card>
            <CardContent className="space-y-2 p-4">
              <StepTitle n={3} title="Quem encaminhará" subtitle="Informe os usuários responsáveis" />
              <Textarea
                id="cf-senders"
                rows={2}
                spellCheck={false}
                placeholder="Ex.: Bianca, Rafaela, Bruna"
                value={cf.sendersInput}
                onChange={(e) => cf.setSendersInput(e.target.value)}
                aria-invalid={!!cf.parsed && cf.sendersList.length === 0}
              />
              <p className={cn('text-xs', !!cf.parsed && cf.sendersList.length === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {cf.sendersList.length === 0
                  ? 'Informe ao menos um nome. Ele aparecerá somente na coluna “Encaminhada por”.'
                  : cf.sendersList.length === 1
                    ? '1 usuário informado · distribuído na coluna “Encaminhada por”.'
                    : `${cf.sendersList.length} usuários informados · distribuição automática em rodízio.`}
              </p>
            </CardContent>
          </Card>

          {/* Descontos (ocultos no relatório 245) */}
          {!cf.relatorioSemValores && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Percent className="h-4 w-4 text-primary" /> Descontos e cálculos
                </div>
                <div className="flex items-center gap-2">
                  <Select value={cf.selectedDiscountPresetId} onValueChange={cf.applyDiscountPreset}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Valores atuais — não salvos</SelectItem>
                      <SelectItem value="macro-default">Padrão do macro</SelectItem>
                      {cf.discountPresets.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Minhas configurações</SelectLabel>
                          {cf.discountPresets.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {presetReal && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" title="Excluir configuração" onClick={() => setDeleteDiscountOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DISCOUNT_FIELDS.map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="flex items-center gap-0.5">
                        <Input
                          type="number" min={0} max={100} step="0.01"
                          value={cf.discountsInput[key]}
                          onChange={(e) => cf.setDiscount(key, e.target.value)}
                          className="h-7 w-16 px-1.5 text-right text-xs"
                        />
                        <span className="text-muted-foreground">%</span>
                      </span>
                    </label>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => { setDiscountName(presetSelecionado?.nome ?? ''); setSaveDiscountOpen(true); }}>
                  <Save className="h-3.5 w-3.5" /> Salvar configuração
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>

        {/* ══ Área de conteúdo ════════════════════════════════════════════════ */}
        <section className="min-w-0">
          {!cf.parsed ? (
            <Card className="flex min-h-[60vh] items-center justify-center">
              <CardContent className="max-w-md py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Comece por aqui</p>
                <h2 className="mt-1 text-lg font-bold">Importe o mailing para criar a campanha</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Os dados e mensagens são organizados automaticamente. “Encaminhada por” usa apenas os nomes informados por você.
                </p>
                <Button className="mt-4 gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Selecionar mailing
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Cabeçalho do workspace */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">
                      {cf.workspaceState === 'blocked' ? 'Corrija os dados da campanha'
                        : cf.workspaceState === 'review' ? 'Revisão necessária'
                        : 'Pronta para exportar'}
                    </h2>
                    <StateBadge state={cf.workspaceState} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {cf.stats.total.toLocaleString('pt-BR')} mensagens com o modelo “{cf.selectedTemplate.name}”.
                  </p>
                </div>
                <Button className="gap-2" onClick={openExport} disabled={cf.stats.blocking > 0}>
                  <Download className="h-4 w-4" /> Exportar Excel
                </Button>
              </div>

              {/* Banner de validação */}
              {(cf.stats.blocking > 0 || cf.sendersList.length === 0 || (cf.parsed.missingHeaders?.length ?? 0) > 0) && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div>
                    {cf.stats.blocking > 0 ? (
                      <><strong>{cf.stats.blocking.toLocaleString('pt-BR')} registros impedem a exportação.</strong>{' '}
                        <span className="text-muted-foreground">Corrija as pendências antes de salvar a campanha.</span></>
                    ) : cf.sendersList.length === 0 ? (
                      <><strong>Informe quem encaminhará a campanha.</strong>{' '}
                        <span className="text-muted-foreground">O mailing não fornece esses nomes.</span></>
                    ) : (
                      <><strong>Alguns campos esperados não foram encontrados.</strong>{' '}
                        <span className="text-muted-foreground">Colunas: {cf.parsed.missingHeaders.join(', ')}.</span></>
                    )}
                  </div>
                </div>
              )}

              {/* Estatísticas */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard icon={<Users className="h-4 w-4" />} value={cf.stats.total} label={cf.relatorioSemValores ? 'registros importados' : 'contatos importados'} tone="blue" />
                {cf.stats.review > 0 && (
                  <StatCard icon={<AlertTriangle className="h-4 w-4" />} value={cf.stats.review} label="precisam de revisão" tone="amber" />
                )}
                <StatCard icon={<Send className="h-4 w-4" />} value={cf.stats.senderCount} label={cf.stats.senderCount === 1 ? 'responsável informado' : 'responsáveis informados'} tone="violet" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* Tabela */}
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{cf.relatorioSemValores ? 'Registros da campanha' : 'Contatos da campanha'}</h3>
                        <p className="text-xs text-muted-foreground">{cf.filtered.length.toLocaleString('pt-BR')} {cf.filtered.length === 1 ? 'registro' : 'registros'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={cf.search}
                            onChange={(e) => cf.setSearch(e.target.value)}
                            placeholder={cf.relatorioSemValores ? 'Buscar nome, documento…' : 'Buscar nome, CPF, telefone…'}
                            className="h-8 w-44 pl-8 text-xs"
                          />
                        </div>
                        {cf.stats.review > 0 && (
                          <Select value={cf.statusFilter} onValueChange={(v) => cf.setStatusFilter(v as 'all' | 'Revisar')}>
                            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="Revisar">Precisam revisão</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente</TableHead>
                            {cf.relatorioSemValores ? <TableHead>Nr. documento</TableHead> : <TableHead>WhatsApp</TableHead>}
                            {cf.relatorioSemValores ? <TableHead>Empresa</TableHead> : <TableHead>Quitação</TableHead>}
                            <TableHead>Encaminhada por</TableHead>
                            {cf.stats.review > 0 && <TableHead>Revisão</TableHead>}
                            <TableHead className="w-9" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cf.pageItems.map(({ item, index }) => (
                            <TableRow
                              key={item.rowNumber}
                              onClick={() => cf.setSelectedRowNumber(item.rowNumber)}
                              className={cn('cursor-pointer', index === cf.selectedIndex && 'bg-accent')}
                            >
                              <TableCell>
                                <div className="font-medium">{item.name || 'Nome não informado'}</div>
                                {!cf.relatorioSemValores && <div className="text-xs text-muted-foreground">Contrato {item.contract || '—'}</div>}
                              </TableCell>
                              {cf.relatorioSemValores ? (
                                <TableCell className="font-medium">{item.contract || 'Não informado'}</TableCell>
                              ) : (
                                <TableCell>
                                  <div className="font-medium">{item.phone || 'Sem contato'}</div>
                                  <div className="text-xs text-muted-foreground">{item.company}</div>
                                </TableCell>
                              )}
                              {cf.relatorioSemValores ? (
                                <TableCell>{item.company || 'Não informada'}</TableCell>
                              ) : (
                                <TableCell className="text-right font-medium tabular-nums">{CampaignCore.formatCurrency(item.settlement)}</TableCell>
                              )}
                              <TableCell>
                                <Badge variant="secondary" className="font-normal">{item.sender || 'Não informado'}</Badge>
                              </TableCell>
                              {cf.stats.review > 0 && (
                                <TableCell>
                                  {item.status !== 'Pronto' && (
                                    <span title={item.issues.join(', ')} className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                      {item.issues[0] || 'Revisar'}
                                    </span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell>
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                          {cf.pageItems.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {cf.pageCount > 1 && (
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Mostrando {cf.filtered.length ? cf.pageStart + 1 : 0}–{Math.min(cf.pageStart + cf.pageItems.length, cf.filtered.length)} de {cf.filtered.length.toLocaleString('pt-BR')}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-7 w-7" disabled={cf.page <= 1} onClick={() => cf.setPage(cf.page - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span>{cf.page} / {cf.pageCount}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7" disabled={cf.page >= cf.pageCount} onClick={() => cf.setPage(cf.page + 1)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Prévia */}
                <MessagePreview item={cf.selectedItem} relatorioSemValores={cf.relatorioSemValores} onCopy={() => cf.copyMessage(cf.selectedItem)} />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ══ Dialog: editar mensagem ═════════════════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar mensagem</DialogTitle>
            <DialogDescription>Use as variáveis para inserir dados e valores de cada cliente. O texto é preservado como digitado.</DialogDescription>
          </DialogHeader>
          <Textarea ref={editRef} rows={16} value={editValue} onChange={(e) => setEditValue(e.target.value)} className="font-mono text-xs" />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Inserir variável</p>
            <VariableChips onInsert={(v) => insertVariable(editRef, editValue, setEditValue, v)} />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => { cf.resetTemplateBody(); setEditValue(cf.selectedTemplate.body); }}>Restaurar modelo</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={() => { cf.saveTemplateBody(editValue); setEditOpen(false); }}>Aplicar mensagem</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: adicionar mensagem ══════════════════════════════════════ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar mensagem</DialogTitle>
            <DialogDescription>O texto será salvo exatamente como for digitado e ficará disponível para toda a BookPlay.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Título da mensagem</label>
                <Input value={addTitulo} maxLength={100} onChange={(e) => setAddTitulo(e.target.value)} placeholder="Ex.: Campanha de negociação" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Categoria</label>
                <Input value={addCategoria} maxLength={40} onChange={(e) => setAddCategoria(e.target.value)} placeholder="Ex.: Cobrança" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Texto da campanha</label>
              <Textarea ref={addRef} rows={12} value={addCorpo} onChange={(e) => setAddCorpo(e.target.value)} className="font-mono text-xs" placeholder="Cole ou digite a mensagem sem alterar o conteúdo." />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Inserir variável</p>
              <VariableChips onInsert={(v) => insertVariable(addRef, addCorpo, setAddCorpo, v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => { await cf.addMessage(addTitulo, addCategoria, addCorpo); if (addTitulo.trim() && addCorpo.trim()) setAddOpen(false); }}
            >Adicionar à lista</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: excluir mensagem ════════════════════════════════════════ */}
      <AlertDialog open={deleteMsgOpen} onOpenChange={setDeleteMsgOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {cf.isUserTemplate(cf.selectedTemplate.id)
                ? `A mensagem “${cf.selectedTemplate.name}” será excluída para toda a BookPlay.`
                : `O modelo padrão “${cf.selectedTemplate.name}” deixará de aparecer na lista. Você poderá restaurá-lo depois.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => cf.deleteSelectedMessage()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ Dialog: exportar ════════════════════════════════════════════════ */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar campanha</DialogTitle>
            <DialogDescription>Escolha o nome do arquivo. O Excel será gerado e conferido antes do download.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nome do arquivo</label>
              <Input value={exportName} maxLength={150} onChange={(e) => setExportName(e.target.value)} placeholder="Ex.: campanha-julho.xlsx" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
              <div><p className="text-muted-foreground">Contatos</p><p className="font-semibold">{cf.stats.total.toLocaleString('pt-BR')}</p></div>
              <div><p className="text-muted-foreground">Responsáveis</p><p className="font-semibold">{cf.stats.senderCount.toLocaleString('pt-BR')}</p></div>
              <div><p className="text-muted-foreground">Mensagem</p><p className="truncate font-semibold" title={cf.selectedTemplate.name}>{cf.selectedTemplate.name}</p></div>
              <div><p className="text-muted-foreground">Excluídos</p><p className="font-semibold">{excludedCount.toLocaleString('pt-BR')}</p></div>
            </div>
            {reviewCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {reviewCount.toLocaleString('pt-BR')} registros precisam de atenção e serão identificados no Excel.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button className="gap-2" onClick={() => { if (cf.exportCampaign(exportName)) setExportOpen(false); }}>
              <Download className="h-4 w-4" /> Baixar Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: salvar configuração de desconto ═════════════════════════ */}
      <Dialog open={saveDiscountOpen} onOpenChange={setSaveDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar configuração</DialogTitle>
            <DialogDescription>Guarde estes percentuais para reutilizar. Fica disponível para toda a BookPlay.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nome da configuração</label>
              <Input value={discountName} maxLength={80} onChange={(e) => setDiscountName(e.target.value)} placeholder="Ex.: Campanha de julho" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-3">
              {DISCOUNT_FIELDS.map(([key, label]) => (
                <div key={key}><p className="text-muted-foreground">{label}</p><p className="font-semibold">{cf.discountsInput[key]}%</p></div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDiscountOpen(false)}>Cancelar</Button>
            <Button onClick={async () => { if (discountName.trim()) { await cf.saveDiscountPreset(discountName); setSaveDiscountOpen(false); } else { cf.saveDiscountPreset(discountName); } }}>
              Salvar configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: excluir configuração de desconto ════════════════════════ */}
      <AlertDialog open={deleteDiscountOpen} onOpenChange={setDeleteDiscountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir configuração?</AlertDialogTitle>
            <AlertDialogDescription>
              A configuração “{presetSelecionado?.nome}” será removida para toda a BookPlay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (presetSelecionado) cf.deleteDiscountPreset(presetSelecionado.id); }}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────────────────────

function StepTitle({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</span>
      <div>
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: 'ready' | 'review' | 'blocked' }) {
  if (state === 'blocked') return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Exportação bloqueada</Badge>;
  if (state === 'review') return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">Atenção</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">Validada</Badge>;
}

function StatCard({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: 'blue' | 'amber' | 'violet' }) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
        <div>
          <p className="text-lg font-bold leading-none">{value.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MessagePreview({ item, relatorioSemValores, onCopy }: { item: CampaignItem | null; relatorioSemValores: boolean; onCopy: () => void }) {
  const initials = item?.name?.split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'C';
  const waEnabled = !!item && CampaignCore.isValidPhone(item.phone) && !!item.sender;
  return (
    <Card className="h-fit">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Prévia da mensagem</h3>
            <p className="text-xs text-muted-foreground">
              {item ? `Linha ${item.rowNumber} do ${relatorioSemValores ? 'relatório 245' : 'mailing'}` : 'Selecione um contato'}
            </p>
          </div>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item?.name || 'Cliente'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item ? (item.phone || 'WhatsApp não informado') : 'WhatsApp'}
              </p>
            </div>
          </div>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs leading-relaxed">
            {item?.message || 'Importe um mailing e selecione um contato para visualizar a mensagem.'}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Encaminhada por</span>
          <span className="text-right font-medium">{item?.sender || '—'}</span>
          <span className="text-muted-foreground">Empresa</span>
          <span className="text-right font-medium">{item?.company || '—'}</span>
        </div>

        {/* O preventivo também abre o WhatsApp: o número existe (DDD 1 +
            Telefone 1) e é justamente o que a campanha precisa. Estava
            escondido só porque o relatório não tem valores. */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!item?.sender} onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
          {waEnabled ? (
            <Button asChild size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
              <a href={`https://wa.me/${item!.whatsAppPhone}?text=${encodeURIComponent(item!.message)}`} target="_blank" rel="noopener noreferrer">
                <Send className="h-3.5 w-3.5" /> Abrir WhatsApp
              </a>
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" disabled variant="outline">
              <Lock className="h-3.5 w-3.5" /> WhatsApp
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
