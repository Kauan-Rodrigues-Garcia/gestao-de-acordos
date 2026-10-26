/**
 * Campanha Fácil (BookPlay) — aba nativa do painel.
 *
 * Transforma arquivos exportados do sistema (mailing CSV/TXT, relatório 245 ou
 * 247 em Excel) em campanhas de cobrança: aplica descontos, substitui variáveis
 * da mensagem, distribui os operadores marcados em rodízio e exporta um Excel
 * pronto — ou libera a parte de cada um, que chega na aba Campanhas de WhatsApp.
 *
 * A lógica de negócio é a mesma do app original (campaign-core / xlsx-export,
 * portados verbatim); esta página é a interface reescrita com o design system
 * do próprio painel. Mensagens, excluídas e descontos são do SETOR da
 * campanha (20261016210000): o do líder, ou o que a gerência escolhe no topo.
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload, FileText, Trash2, Plus, Pencil, Copy, Download, Search,
  ChevronLeft, ChevronRight, MessageSquare, Percent,
  AlertTriangle, Eye, Users, Save, Sparkles, Lock, Send, Filter, UserX, Undo2, Star, Building2,
} from 'lucide-react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CampaignCore, type CampaignItem } from './lib/campaign-core';
import { motivoDoFiltro, temPendenciaGrave, useCampanhaFacil, type StatusFilter, type WorkspaceState } from './useCampanhaFacil';
import { PENDENCIA_PARCELA_MINIMA, mensagemAindaTemParcelaBaixa, type ParcelaBaixa } from './parcela-minima';
import { SeletorOperadores } from './SeletorOperadores';
import { MinhasCampanhas } from './HistoricoCampanhas';
import { JanelaDaMensagem } from './JanelaDaMensagem';
import { exemploDaMensagem } from './detalheDasVariaveis';
import { CampoPercentual } from './CampoPercentual';
import { textoDoPercentual } from './percentual';

/** Cada %, e o que ele muda (21/10/2026): um desconto, um grupo de variáveis. */
const DISCOUNT_FIELDS: [keyof typeof CampaignCore.DEFAULT_DISCOUNTS, string, string][] = [
  ['overdue', 'Atrasadas', 'Todas e 1 parcela'],
  ['settlement', 'Quitação', 'Pix e cartão'],
  ['interest', 'Juros', 'Saldo com juros'],
  ['bundle', 'Junção', 'À vista, 6x e 12x'],
  ['annual', 'Anual', 'À vista e cartão'],
  ['pix_automatico', 'Pix Automático', 'Com desconto e só a parcela'],
];

export default function CampanhaFacil() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const cf = useCampanhaFacil();

  // Sub-abas (16/10/2026): «Minhas campanhas» saiu da lateral, onde a lista
  // crescia sem fim. A aba fica na URL para sobreviver ao F5, e o link da
  // notificação (`?campanha=<id>`) já cai nela.
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'campanhas' || params.has('campanha') ? 'campanhas' : 'nova';
  function trocarAba(nova: string) {
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      if (nova === 'campanhas') p.set('aba', 'campanhas'); else p.delete('aba');
      return p;
    }, { replace: true });
  }
  const minhasAbertas = cf.envios.historico.filter((l) => l.criado_por === cf.envios.autorId && !l.encerrada_em).length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const addRef = useRef<HTMLTextAreaElement>(null);
  /** A variável com o mouse em cima, realçada na mensagem (editar ou adicionar). */
  const [realce, setRealce] = useState<string | null>(null);
  /** O cliente da prévia nas janelas da mensagem: o selecionado, ou o fictício. */
  const exemplo = useMemo(
    () => exemploDaMensagem(cf.selectedItem, cf.discountsApplied),
    [cf.selectedItem, cf.discountsApplied],
  );
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
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [liberarTitulo, setLiberarTitulo] = useState('');
  const [saveDiscountOpen, setSaveDiscountOpen] = useState(false);
  const [discountName, setDiscountName] = useState('');
  const [deleteDiscountOpen, setDeleteDiscountOpen] = useState(false);
  /** Mensagem de UM cliente sendo editada (26/10/2026); `null` = fechado. */
  const [edicaoCliente, setEdicaoCliente] = useState<{ item: CampaignItem; baixas: ParcelaBaixa[]; texto: string } | null>(null);

  // Categorias das mensagens para o Select agrupado
  const categorias = Array.from(new Set(cf.templates.map((t) => t.category)));

  const presetReal = cf.selectedDiscountPresetId !== 'custom' && cf.selectedDiscountPresetId !== 'macro-default';
  /** «do setor Cobrança» — onde as mensagens e descontos ficam guardados. */
  const doSetor = cf.envios.setorNome ? `do setor ${cf.envios.setorNome}` : 'do seu setor';
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

  // ── Gate da aba ──
  //
  // Defesa em profundidade: o item já some do menu e o `ProtectedRoute` já
  // barra, mas a rota continua acessível por URL colada.
  //
  // Era uma comparação de HIERARQUIA — `PERFIL_NIVEL[cargo] <= operador` —, e
  // por isso ligar `ver_campanha_facil` para um operador abria o menu, deixava
  // a rota passar e mostrava esta tela de bloqueio. Três autoridades para a
  // mesma porta, e a última vencia em silêncio.
  if (!temPermissao('ver_campanha_facil')) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Lock className="mx-auto mb-3 h-8 w-8 opacity-50" />
          O Campanha Fácil não está liberado para o seu acesso.
        </CardContent></Card>
      </div>
    );
  }

  /** O botão e o Enter do nome: sem nome, o aviso aparece e o diálogo fica. */
  async function salvarConfiguracao() {
    if (!discountName.trim()) { void cf.saveDiscountPreset(discountName); return; }
    await cf.saveDiscountPreset(discountName);
    setSaveDiscountOpen(false);
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
    document.getElementById('cf-senders')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /** Os cards de pendência: filtram a tabela e rolam até ela. */
  function verNaTabela(filtro: StatusFilter) {
    cf.setStatusFilter(filtro);
    requestAnimationFrame(() => document.getElementById('cf-tabela')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function abrirEdicaoCliente(item: CampaignItem) {
    setEdicaoCliente({ item, baixas: cf.parcelasBaixas.get(item.rowNumber) ?? [], texto: item.message });
  }
  function salvarEdicaoCliente() {
    if (!edicaoCliente) return;
    cf.editarMensagemDoCliente(edicaoCliente.item.rowNumber, edicaoCliente.texto);
    setEdicaoCliente(null);
  }
  function openLiberar() {
    if (!cf.campaign.length) return;
    if (cf.sendersList.length === 0) { openSendersHint(); return; }
    setLiberarTitulo('');
    setLiberarOpen(true);
  }
  function confirmarLiberar() {
    setLiberarOpen(false);
    void cf.liberarCampanha(liberarTitulo);
  }

  const reviewCount = cf.stats.review;
  const excludedCount = cf.parsed?.excludedRecords?.length ?? 0;
  const travada = cf.stats.parcelaBaixa > 0;
  /** Os outros tipos de pendência — a parcela mínima tem card próprio. */
  const outrasPendencias = cf.gruposDePendencia.filter((g) => !g.trava);
  const comPendencia = cf.stats.comPendencia;
  const motivoFiltrado = motivoDoFiltro(cf.statusFilter);

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <Tabs value={aba} onValueChange={trocarAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="nova" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Nova campanha</TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Minhas campanhas
            {minhasAbertas > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{minhasAbertas}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="mt-0">
          <MinhasCampanhas envios={cf.envios} />
        </TabsContent>

        <TabsContent value="nova" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6">
            {/* ══ Painel de controle ══════════════════════════════════════════════ */}
            <aside className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Nova campanha</p>
                <h1 className="mt-1 text-xl font-bold leading-tight">Configure uma vez.<br />Gere tudo pronto.</h1>
                <p className="mt-1 text-sm text-muted-foreground">Importe o arquivo do sistema, escolha a mensagem e revise o resultado.</p>
              </div>

              <SetorDaCampanha envios={cf.envios} />

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
                  <StepTitle n={2} title="Escolher mensagem" subtitle={`Mensagens ${doSetor}`} />
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
                  {/* Favoritas: de cada líder, fixadas no topo (09/10/2026). */}
                  {cf.templatesFavoritos.length > 0 && (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-2">
                      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <Star className="h-3 w-3 fill-current" /> Minhas favoritas
                      </p>
                      <ul className="space-y-0.5">
                        {cf.templatesFavoritos.map((t) => {
                          const bloqueada = cf.templatesBloqueados.has(t.id);
                          const escolhida = t.id === cf.selectedTemplate.id;
                          return (
                            <li key={t.id} className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={bloqueada}
                                onClick={() => cf.setTemplateId(t.id)}
                                title={bloqueada ? 'Usa valores que este relatório não tem' : `Usar “${t.name}”`}
                                className={cn(
                                  'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                  escolhida ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
                                  bloqueada && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                                )}
                              >
                                {t.name}
                                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{t.category}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void cf.alternarFavorita(t.id)}
                                aria-label={`Tirar “${t.name}” das favoritas`}
                                title="Tirar das favoritas"
                                className="rounded-md p-1.5 text-amber-500 hover:bg-amber-500/10"
                              >
                                <Star className="h-3.5 w-3.5 fill-current" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Select value={cf.templateId} onValueChange={cf.setTemplateId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione uma mensagem" /></SelectTrigger>
                      <SelectContent>
                        {categorias.map((cat) => (
                          <SelectGroup key={cat}>
                            <SelectLabel>{cat}</SelectLabel>
                            {cf.templates.filter((t) => t.category === cat).map((t) => {
                              const bloqueada = cf.templatesBloqueados.has(t.id);
                              return (
                                <SelectItem key={t.id} value={t.id} disabled={bloqueada}>
                                  {cf.favoritas.includes(t.id) && <Star className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-400" />}
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
                    {(() => {
                      const fav = cf.favoritas.includes(cf.selectedTemplate.id);
                      return (
                        <Button
                          type="button" variant="outline" size="icon"
                          className={cn('h-10 w-10 shrink-0', fav && 'border-amber-400/60 bg-amber-400/10')}
                          onClick={() => void cf.alternarFavorita(cf.selectedTemplate.id)}
                          aria-pressed={fav}
                          aria-label={fav ? 'Tirar das favoritas' : 'Fixar nas favoritas'}
                          title={fav ? 'Tirar das favoritas' : 'Fixar nas favoritas'}
                        >
                          <Star className={cn('h-4 w-4', fav ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
                        </Button>
                      );
                    })()}
                  </div>
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

              {/* Passo 3 — Responsáveis: operadores do setor, marcados */}
              <Card id="cf-senders">
                <CardContent className="space-y-2 p-4">
                  <StepTitle n={3} title="Quem encaminhará" subtitle="Marque os operadores do setor — e líderes, se quiser" />
                  <SeletorOperadores envios={cf.envios} destacarVazio={!!cf.parsed} />
                </CardContent>
              </Card>

              {/* Descontos (ocultos no relatório 245) */}
              {!cf.relatorioSemValores && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Percent className="h-4 w-4 text-primary" /> Descontos e cálculos
                      <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">Configurações {doSetor}</span>
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
                      {DISCOUNT_FIELDS.map(([key, label, afeta]) => (
                        <label key={key} className="flex min-w-0 flex-col gap-1 rounded-md border border-border px-2.5 py-2 text-xs">
                          <span className="truncate text-muted-foreground" title={label}>{label}</span>
                          <CampoPercentual rotulo={label} valor={cf.discountsInput[key]} aoMudar={(n) => cf.setDiscount(key, n)} />
                          <span className="truncate whitespace-nowrap text-[10px] leading-tight text-muted-foreground/80" title={`Afeta: ${afeta}`}>{afeta}</span>
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
                      Os dados e mensagens são organizados automaticamente e divididos entre os operadores marcados. Cada um recebe a parte dele na aba Campanhas de WhatsApp.
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
                          {cf.workspaceState === 'travada' ? 'Parcelas abaixo de R$ 30'
                            : cf.workspaceState === 'critical' ? 'Pendências graves na campanha'
                            : cf.workspaceState === 'review' ? 'Revisão recomendada'
                            : 'Pronta para exportar'}
                        </h2>
                        <StateBadge state={cf.workspaceState} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {cf.stats.total.toLocaleString('pt-BR')} mensagens com o modelo “{cf.selectedTemplate.name}”.
                        {cf.stats.editadas > 0 && ` ${cf.stats.editadas.toLocaleString('pt-BR')} ${cf.stats.editadas === 1 ? 'editada' : 'editadas'} à mão.`}
                      </p>
                    </div>
                    {/* Pendência de dado não trava: as linhas saem marcadas na
                        planilha. Só a parcela abaixo de R$ 30 trava (26/10/2026). */}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="gap-2" onClick={openExport} disabled={travada}>
                        <Download className="h-4 w-4" /> Exportar Excel
                      </Button>
                      <Button className="gap-2" onClick={openLiberar} disabled={cf.envios.liberando || travada}>
                        <Send className="h-4 w-4" /> {cf.envios.liberando ? 'Liberando…' : 'Liberar para os operadores'}
                      </Button>
                    </div>
                  </div>

                  {/* Parcela mínima (26/10/2026): trava a campanha. A correção não
                      é automática porque o número de vezes é texto da mensagem. */}
                  {travada && (
                    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                          <p>
                            <strong>
                              {cf.stats.parcelaBaixa.toLocaleString('pt-BR')} {cf.stats.parcelaBaixa === 1 ? 'cliente fica' : 'clientes ficam'} com parcela abaixo de R$ 30.
                            </strong>{' '}
                            A campanha não sai assim.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            O número de vezes está escrito na mensagem, então o valor não se corrige sozinho. Tire esses clientes,
                            troque a mensagem para menos vezes, ou edite a mensagem de cada um na prévia — ela mostra em quantas vezes o total cabe.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-6">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => verNaTabela(`motivo:${PENDENCIA_PARCELA_MINIMA}`)}>
                          <Filter className="h-3.5 w-3.5" /> Ver e corrigir um a um
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openEdit}>
                          <Pencil className="h-3.5 w-3.5" /> Editar a mensagem de todos
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => cf.tirarComPendencia(PENDENCIA_PARCELA_MINIMA)}
                        >
                          <UserX className="h-3.5 w-3.5" /> Tirar {cf.stats.parcelaBaixa === 1 ? 'este cliente' : `os ${cf.stats.parcelaBaixa.toLocaleString('pt-BR')}`} da campanha
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* As outras pendências, por tipo (26/10/2026): qualquer dado
                      faltando, não só a grave, pode sair da campanha — um tipo
                      ou todos de uma vez. */}
                  {outrasPendencias.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-500" />
                        <p className="min-w-0 flex-1">
                          <strong>
                            {comPendencia.toLocaleString('pt-BR')} {comPendencia === 1 ? 'registro com pendência' : 'registros com pendência'}.
                          </strong>{' '}
                          <span className="text-muted-foreground">
                            Se continuarem, saem marcados como “Revisar”. Dá para tirar um tipo ou todos de uma vez.
                          </span>
                        </p>
                        <Button
                          size="sm" variant="outline"
                          className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => cf.tirarComPendencia()}
                        >
                          <UserX className="h-3.5 w-3.5" /> Tirar todos com pendência ({comPendencia.toLocaleString('pt-BR')})
                        </Button>
                      </div>
                      <ul className="divide-y divide-amber-500/15 pl-6">
                        {outrasPendencias.map((g) => (
                          <li key={g.motivo} className="flex flex-wrap items-center gap-2 py-1.5">
                            <span className="w-14 text-right font-semibold tabular-nums">{g.quantidade.toLocaleString('pt-BR')}</span>
                            <span className="min-w-0 flex-1">{g.motivo}</span>
                            {g.grave && <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Grave</Badge>}
                            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => verNaTabela(`motivo:${g.motivo}`)}>
                              <Filter className="h-3 w-3" /> Ver
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => cf.tirarComPendencia(g.motivo)}
                            >
                              <UserX className="h-3 w-3" /> Tirar
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {cf.removidos > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <UserX className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{cf.removidos.toLocaleString('pt-BR')}</strong>{' '}
                        {cf.removidos === 1 ? 'cliente tirado' : 'clientes tirados'} da campanha. Não vão para nenhum operador nem para o Excel.
                      </span>
                      <Button variant="link" className="ml-auto h-auto p-0 text-xs" onClick={cf.devolverRemovidos}>
                        <Undo2 className="mr-1 h-3.5 w-3.5" /> Devolver à campanha
                      </Button>
                    </div>
                  )}

                  {/* Banner de validação */}
                  {cf.stats.critical === 0 && (cf.sendersList.length === 0 || (cf.parsed.missingHeaders?.length ?? 0) > 0) && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-500" />
                      <div>
                        {cf.sendersList.length === 0 ? (
                          <><strong>Marque quem encaminhará a campanha.</strong>{' '}
                            <span className="text-muted-foreground">Escolha os operadores do setor no passo 3.</span></>
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
                    <Card id="cf-tabela" className={cn((cf.statusFilter === 'critico' || motivoFiltrado) && 'border-amber-500/50')}>
                      <CardContent className="p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">
                              {motivoFiltrado
                                ? motivoFiltrado
                                : cf.statusFilter === 'critico'
                                ? 'Registros com pendência grave'
                                : cf.relatorioSemValores ? 'Registros da campanha' : 'Contatos da campanha'}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {cf.filtered.length.toLocaleString('pt-BR')} {cf.filtered.length === 1 ? 'registro' : 'registros'}
                              {(cf.statusFilter === 'critico' || motivoFiltrado) && (
                                <>
                                  {' · '}
                                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => cf.setStatusFilter('all')}>
                                    ver todos
                                  </button>
                                </>
                              )}
                            </p>
                          </div>
                          {(cf.statusFilter === 'critico' || motivoFiltrado) && cf.filtered.length > 0 && (
                            <Button
                              size="sm" variant="outline"
                              className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => (motivoFiltrado ? cf.tirarComPendencia(motivoFiltrado) : cf.removerPendenciasGraves())}
                            >
                              <UserX className="h-3.5 w-3.5" /> Tirar {cf.filtered.length === 1 ? 'este' : `estes ${cf.filtered.length.toLocaleString('pt-BR')}`} da campanha
                            </Button>
                          )}
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
                              <Select value={cf.statusFilter} onValueChange={(v) => cf.setStatusFilter(v as StatusFilter)}>
                                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Todos</SelectItem>
                                  <SelectItem value="Revisar">Precisam revisão</SelectItem>
                                  {cf.stats.critical > 0 && <SelectItem value="critico">Pendência grave</SelectItem>}
                                  {cf.gruposDePendencia.length > 0 && (
                                    <SelectGroup>
                                      <SelectLabel>Por tipo</SelectLabel>
                                      {cf.gruposDePendencia.map((g) => (
                                        <SelectItem key={g.motivo} value={`motivo:${g.motivo}`}>
                                          {g.motivo} ({g.quantidade.toLocaleString('pt-BR')})
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  )}
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
                                      {cf.parcelasBaixas.has(item.rowNumber) ? (
                                        <span title={item.issues.join(', ')} className="text-xs font-medium text-destructive">
                                          {PENDENCIA_PARCELA_MINIMA}
                                        </span>
                                      ) : temPendenciaGrave(item) ? (
                                        <span title={item.issues.join(', ')} className="text-xs font-medium text-destructive">
                                          {item.blockingIssues.join(' · ') || item.issues[0] || 'Pendência grave'}
                                        </span>
                                      ) : item.status !== 'Pronto' && (
                                        <span title={item.issues.join(', ')} className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                          {item.issues.join(' · ') || 'Revisar'}
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
                    <MessagePreview
                      item={cf.selectedItem} relatorioSemValores={cf.relatorioSemValores} onCopy={() => cf.copyMessage(cf.selectedItem)}
                      baixas={cf.selectedItem ? cf.parcelasBaixas.get(cf.selectedItem.rowNumber) : undefined}
                      editada={!!cf.selectedItem && cf.mensagensEditadas.has(cf.selectedItem.rowNumber)}
                      onEditar={() => { if (cf.selectedItem) abrirEdicaoCliente(cf.selectedItem); }}
                      onVoltarAoModelo={() => { if (cf.selectedItem) cf.editarMensagemDoCliente(cf.selectedItem.rowNumber, null); }}
                      onTirar={() => { if (cf.selectedItem) cf.tirarCliente(cf.selectedItem.rowNumber); }}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>

      {/* ══ Janela: editar mensagem ═════════════════════════════════════════
          A mensagem à esquerda e as variáveis ao lado — ver JanelaDaMensagem. */}
      <JanelaDaMensagem
        aberta={editOpen}
        onOpenChange={(v) => { setEditOpen(v); setRealce(null); }}
        titulo="Editar mensagem"
        descricao="Use as variáveis para inserir dados e valores de cada cliente. O texto é preservado como digitado."
        textoRef={editRef}
        texto={editValue}
        setTexto={setEditValue}
        exemplo={exemplo}
        realce={realce}
        setRealce={setRealce}
        rodape={(
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => { cf.resetTemplateBody(); setEditValue(cf.selectedTemplate.body); }}>Restaurar modelo</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={() => { cf.saveTemplateBody(editValue); setEditOpen(false); }}>Aplicar mensagem</Button>
            </div>
          </div>
        )}
      />

      {/* ══ Janela: adicionar mensagem ══════════════════════════════════════ */}
      <JanelaDaMensagem
        aberta={addOpen}
        onOpenChange={(v) => { setAddOpen(v); setRealce(null); }}
        titulo="Adicionar mensagem"
        descricao={`O texto será salvo exatamente como for digitado e ficará disponível só para os líderes ${doSetor}.`}
        campos={(
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-1">
              <label className="text-xs font-medium">Título da mensagem</label>
              <Input value={addTitulo} maxLength={100} onChange={(e) => setAddTitulo(e.target.value)} placeholder="Ex.: Campanha de negociação" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Categoria</label>
              <Input value={addCategoria} maxLength={40} onChange={(e) => setAddCategoria(e.target.value)} placeholder="Ex.: Cobrança" />
            </div>
          </div>
        )}
        textoRef={addRef}
        texto={addCorpo}
        setTexto={setAddCorpo}
        exemplo={exemplo}
        placeholder="Cole ou digite a mensagem sem alterar o conteúdo."
        realce={realce}
        setRealce={setRealce}
        rodape={(
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => { await cf.addMessage(addTitulo, addCategoria, addCorpo); if (addTitulo.trim() && addCorpo.trim()) setAddOpen(false); }}
            >Adicionar à lista</Button>
          </>
        )}
      />

      {/* ══ Dialog: excluir mensagem ════════════════════════════════════════ */}
      <AlertDialog open={deleteMsgOpen} onOpenChange={setDeleteMsgOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {cf.isUserTemplate(cf.selectedTemplate.id)
                ? `A mensagem “${cf.selectedTemplate.name}” será excluída ${doSetor}.`
                : `O modelo padrão “${cf.selectedTemplate.name}” deixará de aparecer na lista ${doSetor}. Os outros setores continuam com ele. Você poderá restaurá-lo depois.`}
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

      {/* ══ Dialog: liberar para os operadores ══════════════════════════════ */}
      <AlertDialog open={liberarOpen} onOpenChange={setLiberarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar a campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              {cf.stats.total.toLocaleString('pt-BR')} contatos com a mensagem “{cf.selectedTemplate.name}”, divididos
              entre {cf.sendersList.length} {cf.sendersList.length === 1 ? 'operador' : 'operadores'}. Cada um recebe
              uma notificação e envia a parte dele pela aba Campanhas de WhatsApp. Fica disponível até o fim do mês.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="cf-liberar-titulo">Título da campanha</label>
            <Input
              id="cf-liberar-titulo" value={liberarTitulo} maxLength={200} autoFocus
              onChange={(e) => setLiberarTitulo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarLiberar(); } }}
              placeholder={`Ex.: Atrasados de outubro — ${cf.selectedTemplate.name}`}
            />
            <p className="text-[11px] text-muted-foreground">
              É o nome que aparece no histórico e na aba dos operadores. Em branco, fica “{cf.selectedTemplate.name}”.
            </p>
          </div>
          {reviewCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {reviewCount.toLocaleString('pt-BR')} registros precisam de atenção e aparecem marcados para quem recebê-los.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarLiberar}>
              Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ Dialog: editar a mensagem de UM cliente (26/10/2026) ════════════ */}
      <Dialog open={!!edicaoCliente} onOpenChange={(v) => { if (!v) setEdicaoCliente(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mensagem de {edicaoCliente?.item.name || 'cliente'}</DialogTitle>
            <DialogDescription>
              Vale só para este cliente. As outras mensagens continuam com o modelo.
            </DialogDescription>
          </DialogHeader>
          {edicaoCliente && edicaoCliente.baixas.length > 0 && (() => {
            const aindaBaixa = mensagemAindaTemParcelaBaixa(edicaoCliente.texto, edicaoCliente.baixas);
            return (
              <div className={cn(
                'space-y-1 rounded-lg border p-2.5 text-xs',
                aindaBaixa ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-500/40 bg-emerald-500/5',
              )}>
                <ul className="space-y-0.5">
                  {edicaoCliente.baixas.map((b) => <li key={b.variavel}><TextoParcelaBaixa b={b} /></li>)}
                </ul>
                <p className={cn('font-medium', aindaBaixa ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                  {aindaBaixa
                    ? 'Troque o número de vezes e o valor no texto. Enquanto a parcela baixa estiver na mensagem, a campanha continua travada.'
                    : 'A parcela baixa saiu do texto. Confira as vezes e o valor antes de salvar.'}
                </p>
              </div>
            );
          })()}
          <Textarea
            value={edicaoCliente?.texto ?? ''}
            onChange={(e) => setEdicaoCliente((ed) => (ed ? { ...ed, texto: e.target.value } : ed))}
            className="min-h-[280px] font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicaoCliente(null)}>Cancelar</Button>
            <Button onClick={salvarEdicaoCliente} disabled={!edicaoCliente?.texto.trim()}>Salvar mensagem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: salvar configuração de desconto ═════════════════════════ */}
      <Dialog open={saveDiscountOpen} onOpenChange={setSaveDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar configuração</DialogTitle>
            <DialogDescription>Guarde estes percentuais para reutilizar. Fica disponível só para os líderes {doSetor}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nome da configuração</label>
              <Input
                value={discountName} maxLength={80} autoFocus
                onChange={(e) => setDiscountName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvarConfiguracao(); } }}
                placeholder="Ex.: Campanha de julho"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-3">
              {DISCOUNT_FIELDS.map(([key, label]) => (
                <div key={key}><p className="text-muted-foreground">{label}</p><p className="font-semibold">{textoDoPercentual(cf.discountsInput[key])}%</p></div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDiscountOpen(false)}>Cancelar</Button>
            <Button onClick={() => { void salvarConfiguracao(); }}>
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
              A configuração “{presetSelecionado?.nome}” será removida {doSetor}.
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

/**
 * O setor da campanha, no topo: vale para a aba toda — mensagens, excluídas,
 * descontos, quem encaminha e as campanhas do setor (16/10/2026). O líder vê o
 * dele, travado; a gerência escolhe.
 */
function SetorDaCampanha({ envios }: { envios: ReturnType<typeof useCampanhaFacil>['envios'] }) {
  const { setorFixo, setores, setorId, setSetorId, setorNome } = envios;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
      <Building2 className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Setor da campanha</p>
        {setorFixo ? (
          <p className="truncate text-sm font-semibold">{setorId ? (setorNome ?? 'Seu setor') : 'Sem setor cadastrado'}</p>
        ) : (
          <Select value={setorId ?? ''} onValueChange={setSetorId}>
            <SelectTrigger className="mt-1 h-8 bg-background"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
            <SelectContent>
              {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {setorFixo && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Só o seu setor" />}
    </div>
  );
}

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

function StateBadge({ state }: { state: WorkspaceState }) {
  if (state === 'travada') return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Travada</Badge>;
  if (state === 'critical') return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Pendência grave</Badge>;
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

/** Uma parcela baixa e, quando cabe, em quantas vezes o total dá R$ 30 ou mais. */
function TextoParcelaBaixa({ b }: { b: ParcelaBaixa }) {
  return (
    <>
      <strong>{b.rotulo}: {b.parcelaTexto}</strong>
      {b.sugestao
        ? <> — o total de {CampaignCore.formatCurrency(b.total)} cabe em até <strong>{b.sugestao.vezes}x de {CampaignCore.formatCurrency(b.sugestao.parcela)}</strong>.</>
        : <> — o total de {CampaignCore.formatCurrency(b.total)} não chega a 2x de R$ 30; ofereça à vista.</>}
    </>
  );
}

function MessagePreview({
  item, relatorioSemValores, onCopy, baixas, editada, onEditar, onVoltarAoModelo, onTirar,
}: {
  item: CampaignItem | null;
  relatorioSemValores: boolean;
  onCopy: () => void;
  /** As parcelas abaixo de R$ 30 deste cliente (26/10/2026). */
  baixas?: ParcelaBaixa[];
  editada: boolean;
  onEditar: () => void;
  onVoltarAoModelo: () => void;
  onTirar: () => void;
}) {
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

        {baixas && baixas.length > 0 && (
          <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
            <p className="font-semibold text-destructive">Parcela abaixo de R$ 30 — esta mensagem não sai assim.</p>
            <ul className="space-y-0.5">
              {baixas.map((b) => <li key={b.variavel}><TextoParcelaBaixa b={b} /></li>)}
            </ul>
          </div>
        )}

        {/* Editar ou tirar só este cliente (26/10/2026). */}
        {item && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onEditar}>
              <Pencil className="h-3 w-3" /> Editar a mensagem deste cliente
            </Button>
            {editada && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onVoltarAoModelo} title="Descartar a edição">
                <Undo2 className="h-3 w-3" /> Voltar ao modelo
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              className="ml-auto h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onTirar}
            >
              <UserX className="h-3 w-3" /> Tirar da campanha
            </Button>
          </div>
        )}
        {editada && <p className="text-[11px] text-muted-foreground">Mensagem editada à mão só para este cliente.</p>}

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
