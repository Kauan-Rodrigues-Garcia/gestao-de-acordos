/**
 * ImportarExcel.tsx — Importação via planilha padrão PaguePLAY
 *
 * Template de planilha (linha 1 = seção, linha 2 = cabeçalho, linha 3+ = dados):
 *   Col A: Código (instituicao) — chave única do cliente
 *   Col B: Estado / UF (2 letras)
 *   Col C: Forma de Pagamento (Boleto | Cartão | Cartão Recorrente | PIX | PIX Automático)
 *   Col D: Qtd. Parcelas
 *   Col E: Valor Total
 *   Col F: Data de Vencimento (dd/mm/yyyy)
 *   Col G: Status (Pendente | Pago | Não Pago)
 *   Col H: Nome do Profissional
 *   Col I: WhatsApp
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { read as xlsxRead, utils as xlsxUtils, write as xlsxWrite } from '@e965/xlsx';
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, XCircle,
  RefreshCw, Shield, Download, ArrowRight, AlertCircle, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase } from '@/lib/supabase';
import {
  ROUTE_PATHS, formatDate, formatCurrency, getTodayISO, buildObservacoesComEstado,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { criarNotificacao } from '@/services/notificacoes.service';
import { verificarNrsDuplicadosEmLote } from '@/services/acordos.service';
import {
  classificarNrsImportados,
  type ClassificacaoNR,
} from '@/services/classificar_nrs_import.service';
import { processarImportacaoEmLote } from '@/services/importar_excel_batch.service';
import { autenticarLider, type AutorizadorInfo } from '@/services/autorizacao_lider.service';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { resolverDiretoExtraAtivo } from '@/services/direto_extra.service';
import {
  parsearPlanilha,
  classificarLinha,
  validarColunasObrigatorias,
  type RegistroImportado,
  type ModoParse,
} from '@/lib/importar_excel_parser';
import {
  selecionarAbas,
  marcarAba,
  forcarClassificacaoExtra,
} from '@/lib/importar_excel_extra';

// Re-exporta o motor adaptativo — a suíte de testes importa estas funções
// diretamente de `@/pages/ImportarExcel`. (A lógica pura vive em
// `@/lib/importar_excel_parser`; isto é apenas uma ponte para os testes.)
// eslint-disable-next-line react-refresh/only-export-components
export { parsearPlanilha, classificarLinha };

// ─── Types ────────────────────────────────────────────────────────────────────

type Etapa      = 'upload' | 'preview' | 'resultado';
type AbaPreview = 'novos' | 'extra' | 'bloqueados';

interface ResultadoImportacao { ok: number; erros: number; msgs: string[] }

// ─── Template download ────────────────────────────────────────────────────────

function baixarModelo() {
  const wb = xlsxUtils.book_new();
  const ws = xlsxUtils.aoa_to_sheet([
    ['Planilha de Acordos — PaguePLAY'],
    ['Código', 'Estado', 'Forma de Pagamento', 'Qtd. Parcelas', 'Valor Total', 'Data de Venci.', 'Status', 'Nome do Profissional', 'WhatsApp'],
    ['12345',  'SP', 'Boleto',           3,  1500.00, '30/05/2026', 'Pendente',  'João da Silva',   '(11) 98765-4321'],
    ['67890',  'RJ', 'Cartão',           1,   500.00, '15/06/2026', 'Pendente',  'Maria Oliveira',  '(21) 91234-5678'],
    ['11111',  'MG', 'PIX',              1,   200.00, '10/07/2026', 'Pago',      'Carlos Pereira',  '(31) 99876-5432'],
    ['22222',  'RS', 'Cartão Recorrente',12,  2400.00, '01/06/2026', 'Pendente', 'Ana Santos',      '(51) 98888-7777'],
    ['33333',  'BA', 'Boleto',           6,   900.00, '20/06/2026', 'Não Pago',  'Pedro Lima',      '(71) 97777-6666'],
  ]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 13 },
    { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 18 },
  ];
  xlsxUtils.book_append_sheet(wb, ws, 'DIRETO');

  // Aba EXTRA (opcional): mesmas colunas. Só é lida quando o setor tem a
  // função Direto/Extra ativa — as linhas entram como acordos "extra".
  const wsExtra = xlsxUtils.aoa_to_sheet([
    ['Planilha de Acordos (EXTRA) — PaguePLAY'],
    ['Código', 'Estado', 'Forma de Pagamento', 'Qtd. Parcelas', 'Valor Total', 'Data de Venci.', 'Status', 'Nome do Profissional', 'WhatsApp'],
    ['12345',  'SP', 'Boleto', 2, 800.00, '30/05/2026', 'Pendente', 'João da Silva', '(11) 98765-4321'],
  ]);
  wsExtra['!cols'] = ws['!cols'];
  xlsxUtils.book_append_sheet(wb, wsExtra, 'EXTRA');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf  = xlsxWrite(wb, { type: 'array', bookType: 'xlsx' as any }) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'modelo_importacao_pagueplay.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function baixarModeloBP() {
  const wb = xlsxUtils.book_new();
  const ws = xlsxUtils.aoa_to_sheet([
    ['Planilha de Acordos — Bookplay'],
    ['NR', 'Nome do Cliente', 'WhatsApp', 'Instituição', 'Forma de Pagamento', 'Qtd. Parcelas', 'Valor (Parcela)', 'Data de Venci.', 'Status', 'Observações'],
    ['NR-001', 'João da Silva',  '(89) 99999-1111', 'Banco X', 'Boleto',  3, 500.00, '30/05/2026', 'Pendente',  ''],
    ['NR-002', 'Maria Oliveira', '(89) 98888-2222', 'Banco Y', 'PIX',     1, 200.00, '15/06/2026', 'Pago',      ''],
    ['NR-003', 'Carlos Pereira', '',                '',        'Cartão',  1, 350.00, '10/07/2026', 'Não Pago',  'Cliente em negociação'],
  ]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 22 },
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 },
  ];
  xlsxUtils.book_append_sheet(wb, ws, 'DIRETO');

  // Aba EXTRA (opcional): mesmas colunas. Só é lida quando o setor tem a
  // função Direto/Extra ativa — as linhas entram como acordos "extra".
  const wsExtra = xlsxUtils.aoa_to_sheet([
    ['Planilha de Acordos (EXTRA) — Bookplay'],
    ['NR', 'Nome do Cliente', 'WhatsApp', 'Instituição', 'Forma de Pagamento', 'Qtd. Parcelas', 'Valor (Parcela)', 'Data de Venci.', 'Status', 'Observações'],
    ['NR-010', 'João da Silva', '(89) 99999-1111', 'Banco X', 'Boleto', 2, 250.00, '30/05/2026', 'Pendente', ''],
  ]);
  wsExtra['!cols'] = ws['!cols'];
  xlsxUtils.book_append_sheet(wb, wsExtra, 'EXTRA');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf  = xlsxWrite(wb, { type: 'array', bookType: 'xlsx' as any }) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'modelo_importacao_bookplay.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTipo(tipo: string): string {
  const MAP: Record<string, string> = {
    boleto: 'Boleto', cartao: 'Cartão',
    cartao_recorrente: 'Cartão Recorrente',
    pix: 'PIX', pix_automatico: 'PIX Automático',
  };
  return MAP[tipo] ?? tipo;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportarExcel() {
  const { perfil }                      = useAuth();
  const { empresa }                     = useEmpresa();
  const { isPaguePlay }                 = useTenant();
  const navigate                        = useNavigate();
  const inputRef                        = useRef<HTMLInputElement>(null);
  const { configs: configsDiretoExtra } = useDiretoExtraConfig();

  const [etapa,      setEtapa]      = useState<Etapa>('upload');
  const [arquivo,    setArquivo]    = useState<File | null>(null);
  const [registros,  setRegistros]  = useState<RegistroImportado[]>([]);
  const [resultado,  setResultado]  = useState<ResultadoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [abaAtiva,   setAbaAtiva]   = useState<AbaPreview>('novos');
  const [modoParse,  setModoParse]  = useState<ModoParse>('tabela');
  const [avisoExtra, setAvisoExtra] = useState<string | null>(null);

  // Classificação
  const [classificacao,     setClassificacao]     = useState<ClassificacaoNR[]>([]);
  const [carregandoClassif, setCarregandoClassif] = useState(false);

  // Autorização
  const [modalAberto,        setModalAberto]        = useState(false);
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<Set<number>>(new Set());
  const [liderEmail,         setLiderEmail]         = useState('');
  const [liderSenha,         setLiderSenha]         = useState('');
  const [autorizando,        setAutorizando]        = useState(false);
  const [autorizador,        setAutorizador]        = useState<AutorizadorInfo | null>(null);
  const [linhasAutorizadas,  setLinhasAutorizadas]  = useState<Set<number>>(new Set());

  // ── Derived ────────────────────────────────────────────────────────────────
  const classifMap    = new Map<number, ClassificacaoNR>(classificacao.map(c => [c.linhaOriginal, c]));
  const classifLoaded = !carregandoClassif && classificacao.length > 0;

  const validos   = registros.filter(r => r.valido);
  const invalidos = registros.filter(r => !r.valido);

  // Uma linha vinda da aba EXTRA (abaOrigem === 'extra') é SEMPRE extra: é um
  // dado local e determinístico da planilha, que não pode depender da
  // classificação assíncrona (Supabase). Se a classificação falhar/não carregar,
  // essas linhas ainda assim aparecem na aba Extra — e nunca em Novos.
  const regNovos = validos.filter(r => {
    if (r.abaOrigem === 'extra') return false;
    if (!classifLoaded) return true;
    const c = classifMap.get(r.linha);
    return !c || c.categoria === 'novo' || c.categoria === 'disponivel' || c.categoria === 'direto';
  });
  const regExtra = validos.filter(r =>
    r.abaOrigem === 'extra' ||
    (classifLoaded && classifMap.get(r.linha)?.categoria === 'extra'),
  );
  const regBloqueados = classifLoaded
    ? validos.filter(r => r.abaOrigem !== 'extra' && classifMap.get(r.linha)?.categoria === 'duplicado')
    : [];

  const valorTotal = validos.reduce((s, r) => s + (r.valor ?? 0), 0);

  // ── Classification loader ──────────────────────────────────────────────────
  async function carregarClassificacao(regs: RegistroImportado[]) {
    if (!empresa?.id || !perfil?.id) return;
    setCarregandoClassif(true);
    try {
      const campoChave = isPaguePlay ? 'instituicao' as const : 'nr_cliente' as const;
      const valids = regs.filter(r => r.valido && (isPaguePlay ? r.instituicao : r.nr_cliente));
      const inputs = valids.map(r => ({ linhaOriginal: r.linha, nr: isPaguePlay ? r.instituicao : r.nr_cliente }));
      const nrs    = inputs.map(i => i.nr);

      const duplicados = nrs.length > 0
        ? await verificarNrsDuplicadosEmLote(nrs, empresa.id, campoChave)
        : new Map();

      const classif = await classificarNrsImportados({
        registros:             inputs,
        operadorAtualId:       perfil.id,
        operadorAtualSetorId:  perfil.setor_id  ?? null,
        operadorAtualEquipeId: perfil.equipe_id ?? null,
        configsDiretoExtra,
        duplicados,
        resolverDadosOperador: async (operadorId: string) => {
          const { data } = await supabase
            .from('perfis').select('setor_id, equipe_id')
            .eq('id', operadorId).maybeSingle();
          if (!data) return null;
          return { setorId: data.setor_id ?? null, equipeId: data.equipe_id ?? null };
        },
      });

      // Linhas vindas da aba EXTRA são forçadas para a categoria 'extra'
      // (vinculadas ao direto de outro operador quando existir; senão órfãs).
      const linhasExtra = new Set(regs.filter(r => r.abaOrigem === 'extra').map(r => r.linha));
      const classifFinal = linhasExtra.size > 0
        ? forcarClassificacaoExtra(classif, linhasExtra, perfil.id)
        : classif;

      setClassificacao(classifFinal);
      setLinhasAutorizadas(new Set());
      setAutorizador(null);
    } catch (err) {
      toast.error('Erro ao classificar registros: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCarregandoClassif(false);
    }
  }

  // ── File processing ────────────────────────────────────────────────────────
  function processarArquivo(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = xlsxRead(e.target?.result, { type: 'array', cellDates: false, raw: true });
        const { diretoIdx, extraIdx } = selecionarAbas(wb.SheetNames);

        const lerAba = (idx: number) => {
          const ws      = wb.Sheets[wb.SheetNames[idx]];
          const rawRows = xlsxUtils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
          return parsearPlanilha(rawRows);
        };

        // ── Aba principal (DIRETO) ──────────────────────────────────────────
        const dir = lerAba(diretoIdx);
        const valDir = validarColunasObrigatorias(dir.mapa, isPaguePlay, dir.modo);
        if (!valDir.ok) {
          toast.error(
            `Não foi possível identificar as colunas obrigatórias: ${valDir.faltando.join(', ')}. ` +
            `Verifique o cabeçalho da planilha (a ordem das colunas é livre, mas todas precisam existir).`,
          );
          return;
        }
        const modo = dir.modo;
        let regs: RegistroImportado[] = marcarAba(dir.registros, 'direto');

        // ── Aba EXTRA (opcional, gated pela função Direto/Extra) ────────────
        let avisoExtra: string | null = null;
        const temFuncaoExtra = resolverDiretoExtraAtivo({
          userId:       perfil?.id ?? '',
          userSetorId:  perfil?.setor_id  ?? null,
          userEquipeId: perfil?.equipe_id ?? null,
          configs:      configsDiretoExtra,
        });
        if (extraIdx >= 0) {
          if (!temFuncaoExtra) {
            avisoExtra = 'Aba EXTRA ignorada: seu setor não tem a função Direto/Extra ativa.';
          } else {
            const ext = lerAba(extraIdx);
            const valExt = validarColunasObrigatorias(ext.mapa, isPaguePlay, ext.modo);
            if (!valExt.ok) {
              avisoExtra = `Aba EXTRA ignorada: colunas obrigatórias ausentes (${valExt.faltando.join(', ')}).`;
            } else if (ext.registros.length === 0) {
              avisoExtra = 'Aba EXTRA sem linhas de dados reconhecidas.';
            } else {
              regs = [...regs, ...marcarAba(ext.registros, 'extra')];
            }
          }
        } else if (temFuncaoExtra) {
          // Função Direto/Extra ATIVA, porém nenhuma aba EXTRA foi encontrada no
          // arquivo. Antes isso falhava em silêncio (nenhum aviso). Agora
          // listamos as abas achadas para o operador saber exatamente o que
          // corrigir (adicionar/renomear a 2ª aba).
          avisoExtra =
            `Nenhuma aba "EXTRA" encontrada no arquivo. Abas do arquivo: ${wb.SheetNames.join(', ')}. ` +
            'Para importar acordos extras, o arquivo precisa de uma 2ª aba cujo nome contenha "EXTRA".';
        }

        if (regs.length === 0) {
          toast.warning('Nenhuma linha de dados reconhecida. Confira se há um cabeçalho e ao menos uma linha preenchida.');
          return;
        }
        setArquivo(file);
        setRegistros(regs);
        setAvisoExtra(avisoExtra);
        setModoParse(modo);
        setClassificacao([]);
        setLinhasAutorizadas(new Set());
        setAutorizador(null);
        setAbaAtiva('novos');
        setEtapa('preview');
        const sufixoModo = modo === 'blocos' ? ' (blocos por data)' : '';
        toast.success(`${regs.length} linha(s) lida(s)${sufixoModo} — ${regs.filter(r => r.valido).length} válida(s)`);
        if (avisoExtra) toast.warning(avisoExtra);
        void carregarClassificacao(regs);
      } catch {
        toast.error('Erro ao ler o arquivo. Envie uma planilha .xlsx/.xls com uma linha de cabeçalho.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  function abrirModal(linhas?: Set<number>) {
    const sel = linhas ?? new Set(regBloqueados.map(r => r.linha));
    if (sel.size === 0) { toast.info('Nenhuma inscrição selecionada'); return; }
    setLinhasSelecionadas(sel);
    setLiderEmail('');
    setLiderSenha('');
    setModalAberto(true);
  }

  async function confirmarAutorizacao() {
    if (linhasSelecionadas.size === 0) { toast.error('Selecione pelo menos uma inscrição'); return; }
    setAutorizando(true);
    try {
      const res = await autenticarLider({ email: liderEmail, senha: liderSenha });
      if (!res.ok) { toast.error(res.erro); return; }
      setAutorizador(res.autorizador);
      setLinhasAutorizadas(prev => new Set([...prev, ...linhasSelecionadas]));
      setModalAberto(false);
      toast.success(`Autorizado por ${res.autorizador.nome}. ${linhasSelecionadas.size} inscrição(ões) liberada(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao autorizar');
    } finally {
      setAutorizando(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function confirmarImportacao() {
    if (!empresa?.id || !perfil?.id) { toast.error('Contexto de empresa/perfil indisponível'); return; }
    if (validos.length === 0) { toast.error('Nenhum registro válido para importar'); return; }
    setImportando(true);

    const hoje = getTodayISO();
    const errosMsgs: string[] = [];

    const payloads = validos.map(r => {
      let registro: Record<string, unknown>;
      let nr: string;

      if (isPaguePlay) {
        // PaguePLAY: a coluna "Valor" representa o TOTAL do acordo; a parcela é derivada.
        const valorTotalPP  = r.valor;
        const valorParcelaPP = valorTotalPP !== null && r.parcelas > 0
          ? parseFloat((valorTotalPP / r.parcelas).toFixed(2))
          : 0;
        const obs = r.estado_uf ? buildObservacoesComEstado('', r.estado_uf) : null;
        registro = {
          nome_cliente:  r.nome_cliente,
          nr_cliente:    '',
          instituicao:   r.instituicao,
          vencimento:    r.vencimento ?? hoje,
          valor:         valorParcelaPP,
          valor_total:   valorTotalPP,
          whatsapp:      r.whatsapp ?? null,
          status:        r.status,
          tipo:          r.tipo,
          parcelas:      r.parcelas,
          observacoes:   obs || null,
          data_cadastro: hoje,
          operador_id:   perfil.id,
          setor_id:      perfil.setor_id ?? null,
          empresa_id:    empresa.id,
        };
        nr = r.instituicao;
      } else {
        // Bookplay: a coluna "Valor" já é o valor da parcela.
        registro = {
          nome_cliente:  r.nome_cliente,
          nr_cliente:    r.nr_cliente,
          instituicao:   r.instituicao || null,
          vencimento:    r.vencimento ?? hoje,
          valor:         r.valor ?? 0,
          whatsapp:      r.whatsapp ?? null,
          status:        r.status,
          tipo:          r.tipo,
          parcelas:      r.parcelas,
          observacoes:   r.observacoes_raw || null,
          data_cadastro: hoje,
          operador_id:   perfil.id,
          setor_id:      perfil.setor_id ?? null,
          empresa_id:    empresa.id,
        };
        nr = r.nr_cliente;
      }

      return { linhaOriginal: r.linha, registro, nr, nomeCliente: r.nome_cliente };
    });

    const lote = await processarImportacaoEmLote({
      payloads,
      classificacao,
      linhasAutorizadas,
      autorizador,
      operadorAtual: { id: perfil.id, nome: perfil.nome ?? 'Operador' },
      empresaId:     empresa.id,
      labelNr:       isPaguePlay ? 'Inscrição' : 'NR',
      isPaguePlay,
      batchSize:     50,
    });

    errosMsgs.push(...lote.erros);
    if (lote.bloqueados.length > 0) {
      const lista = lote.bloqueados.slice(0, 5).map(b => `"${b.nr}"`).join(', ');
      errosMsgs.push(
        `${lote.bloqueados.length} inscrição(ões) bloqueada(s) não importada(s): ${lista}` +
        (lote.bloqueados.length > 5 ? '…' : ''),
      );
    }

    const ok = lote.inseridos;
    setResultado({ ok, erros: validos.length - ok + invalidos.length, msgs: errosMsgs });
    setImportando(false);
    setEtapa('resultado');

    if (ok > 0) {
      toast.success(`${ok} acordo(s) importado(s)!`);
      if (perfil.lider_id) {
        void criarNotificacao({
          usuario_id: perfil.lider_id,
          titulo:     'Importação de acordos concluída',
          mensagem:   `${perfil.nome} importou ${ok} acordo(s) via planilha ${isPaguePlay ? 'PaguePLAY' : 'Bookplay'}.`,
          empresa_id: empresa.id,
        });
      }
    }
  }

  const qtdNovos = carregandoClassif ? '…' : String(regNovos.length);
  const qtdExtra = carregandoClassif ? '…' : String(regExtra.length);
  const qtdBloq  = carregandoClassif ? '…' : String(regBloqueados.length);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Importar via Planilha
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isPaguePlay ? 'PaguePLAY — planilha padrão' : 'Bookplay — detecção automática de colunas'}
          </p>
        </div>
        {etapa === 'upload' && (
          <Button variant="outline" size="sm" onClick={isPaguePlay ? baixarModelo : baixarModeloBP} className="gap-2 shrink-0">
            <Download className="w-4 h-4" /> Baixar modelo
          </Button>
        )}
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        {(['upload', 'preview', 'resultado'] as Etapa[]).map((e, i) => {
          const labels = ['Upload', 'Pré-visualização', 'Resultado'];
          const ativo  = etapa === e;
          const feito  = ['upload', 'preview', 'resultado'].indexOf(etapa) > i;
          return (
            <div key={e} className="flex items-center gap-2">
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full font-medium',
                ativo ? 'bg-primary text-primary-foreground' :
                feito ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground',
              )}>
                <span>{i + 1}.</span> {labels[i]}
              </div>
              {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* ─── UPLOAD ─── */}
      {etapa === 'upload' && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardContent className="p-8">
              <div
                className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-12 text-center cursor-pointer transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processarArquivo(f); }}
              >
                <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-base font-medium mb-1">Arraste o arquivo ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground mb-4">Aceita .xlsx e .xls</p>
                <Button variant="outline" type="button">Selecionar arquivo</Button>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
            </CardContent>
          </Card>

          {/* Format guide */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Formato da planilha</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                {isPaguePlay
                  ? 'Use o modelo padrão PaguePLAY. Clique em "Baixar modelo" para obter um arquivo de exemplo pronto para preencher.'
                  : 'A ordem das colunas é livre — o sistema reconhece cada campo pelo nome do cabeçalho. A planilha só precisa conter as colunas abaixo (o Status é opcional). Clique em "Baixar modelo" para um exemplo pronto.'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Col.', 'Campo', 'Valores aceitos'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(isPaguePlay ? [
                      ['A', 'Código (Inscrição)', '12345  ·  qualquer texto ou número'],
                      ['B', 'Estado / UF',        'SP  ·  RJ  ·  MG  (2 letras)'],
                      ['C', 'Forma de Pagamento', 'Boleto  ·  Cartão  ·  Cartão Recorrente  ·  PIX'],
                      ['D', 'Qtd. Parcelas',      '1  ·  3  ·  6  ·  12'],
                      ['E', 'Valor Total',        '1500,00  ·  R$ 1.500,00'],
                      ['F', 'Data de Vencimento', '30/05/2026  ·  2026-05-30'],
                      ['G', 'Status',             'Pendente  ·  Pago  ·  Não Pago'],
                      ['H', 'Nome do Profissional','João da Silva'],
                      ['I', 'WhatsApp',           '(11) 98765-4321  ·  11987654321'],
                    ] : [
                      ['A', 'NR do Cliente *',    'NR-001  ·  qualquer texto ou número'],
                      ['B', 'Nome do Cliente',    'João da Silva'],
                      ['C', 'WhatsApp',           '(89) 99999-1111  ·  opcional'],
                      ['D', 'Instituição',        'Banco X  ·  opcional'],
                      ['E', 'Forma de Pagamento', 'Boleto  ·  PIX  ·  Cartão  ·  Cartão Recorrente  ·  Pix Automático'],
                      ['F', 'Qtd. Parcelas',      '1  ·  3  ·  6  ·  12'],
                      ['G', 'Valor (Parcela) *',  '500,00  ·  R$ 500,00  (valor de cada parcela)'],
                      ['H', 'Data de Vencimento *','30/05/2026  ·  2026-05-30'],
                      ['I', 'Status',             'Pendente  ·  Pago  ·  Não Pago'],
                      ['J', 'Observações',        'Texto livre  ·  opcional'],
                    ]).map(([col, campo, valores]) => (
                      <tr key={col} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-mono font-bold text-primary">{col}</td>
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">{campo}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{valores}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {isPaguePlay
                  ? '* Linha 1: título da seção (ignorada). Linha 2: nomes das colunas. Dados nas linhas seguintes.'
                  : '* Colunas obrigatórias. A coluna "Col." abaixo é só um exemplo — a ordem pode ser qualquer uma e o cabeçalho pode estar em qualquer linha inicial. Nomes alternativos são reconhecidos (ex.: "Celular" = WhatsApp, "Contrato/Código" = NR). Também aceita planilhas divididas em blocos por data.'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Aba <span className="font-semibold text-primary">EXTRA</span> (opcional): se a planilha tiver uma segunda aba com esse nome exato,
                suas linhas são importadas como acordos <span className="font-medium">extra</span> (mesmas colunas da aba principal).
                Só é lida quando o seu setor tem a função <span className="font-medium">Direto/Extra</span> ativa — caso contrário, é ignorada.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── PREVIEW ─── */}
      {etapa === 'preview' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{registros.length}</p>
                <p className="text-xs text-muted-foreground">Total de linhas</p>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-success/5">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{validos.length}</p>
                <p className="text-xs text-muted-foreground">Válidos</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{invalidos.length}</p>
                <p className="text-xs text-muted-foreground">Inválidos</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-lg font-bold text-primary font-mono">{formatCurrency(valorTotal)}</p>
                <p className="text-xs text-muted-foreground">Valor total válido</p>
              </CardContent>
            </Card>
          </div>

          {/* File + classification status */}
          <div className="flex items-center gap-2 text-xs p-2.5 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
            <FileSpreadsheet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="font-medium">{arquivo?.name}</span>
            {carregandoClassif && (
              <>
                <span className="text-muted-foreground">·</span>
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                <span className="text-muted-foreground">Classificando inscrições…</span>
              </>
            )}
          </div>

          {/* Invalid records warning */}
          {invalidos.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">{invalidos.length} linha(s) com erros — serão ignoradas:</p>
                <ul className="space-y-0.5 text-destructive/80">
                  {invalidos.slice(0, 5).map(r => (
                    <li key={r.linha}>
                      Linha {r.linhaPlanilha ?? r.linha}
                      {r.abaOrigem === 'extra' && ' (aba EXTRA)'}: {r.erros.join(', ')}
                    </li>
                  ))}
                  {invalidos.length > 5 && <li>…e mais {invalidos.length - 5}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Aviso da aba EXTRA (função ativa mas aba ausente/ignorada) */}
          {avisoExtra && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{avisoExtra}</p>
            </div>
          )}

          {/* Tabs */}
          <Card className="border-border overflow-hidden">
            <div className="flex border-b border-border bg-muted/20 px-4">
              {([
                ['novos',      `Novos (${qtdNovos})`],
                ['extra',      `Extra (${qtdExtra})`],
                ['bloqueados', `Bloqueados (${qtdBloq})`],
              ] as [AbaPreview, string][]).map(([aba, label]) => (
                <button
                  key={aba}
                  onClick={() => setAbaAtiva(aba)}
                  className={cn(
                    'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5',
                    abaAtiva === aba
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                  {aba === 'bloqueados' && regBloqueados.length > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                      !
                    </span>
                  )}
                </button>
              ))}
            </div>

            {abaAtiva === 'novos' && (
              <TabelaSimples registros={regNovos} classifMap={classifMap} linhasAutorizadas={linhasAutorizadas} isPP={isPaguePlay} modo={modoParse} />
            )}
            {abaAtiva === 'extra' && (
              <TabelaSimples registros={regExtra} classifMap={classifMap} linhasAutorizadas={linhasAutorizadas} isPP={isPaguePlay} modo={modoParse} />
            )}
            {abaAtiva === 'bloqueados' && (
              <TabelaBloqueados
                registros={regBloqueados}
                classifMap={classifMap}
                linhasAutorizadas={linhasAutorizadas}
                onAutorizar={abrirModal}
              />
            )}
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); setRegistros([]); setAvisoExtra(null); }}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Novo arquivo
            </Button>
            <Button onClick={confirmarImportacao} disabled={importando || validos.length === 0} className="gap-2">
              {importando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importando…</>
                : <><CheckCircle2 className="w-4 h-4" /> Importar {validos.length} acordo(s)</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ─── RESULTADO ─── */}
      {etapa === 'resultado' && resultado && (
        <div className="space-y-4">
          <Card className={cn('border', resultado.ok > 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30')}>
            <CardContent className="p-8 text-center">
              {resultado.ok > 0
                ? <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
                : <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />}
              <h2 className="text-xl font-bold mb-2">
                {resultado.ok > 0 ? 'Importação concluída!' : 'Nenhum acordo importado'}
              </h2>
              <div className="flex justify-center gap-8 mt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{resultado.ok}</p>
                  <p className="text-sm text-muted-foreground">Importados</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-destructive">{resultado.erros}</p>
                  <p className="text-sm text-muted-foreground">Ignorados / Bloqueados</p>
                </div>
              </div>
              {resultado.msgs.length > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg text-left">
                  {resultado.msgs.map((m, i) => <p key={i} className="text-xs text-destructive">{m}</p>)}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); setRegistros([]); setResultado(null); }}>
              Nova Importação
            </Button>
            <Button onClick={() => navigate(ROUTE_PATHS.ACORDOS)}>
              Ver Acordos <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── MODAL DE AUTORIZAÇÃO ─── */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg" aria-describedby="dlg-autorizar-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Autorizar inscrições bloqueadas
            </DialogTitle>
            <DialogDescription id="dlg-autorizar-desc" className="text-xs leading-relaxed">
              Informe as credenciais de um líder, elite, gerência ou administrador para autorizar
              a transferência das inscrições selecionadas para o operador atual.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[200px] overflow-y-auto border border-border rounded-md divide-y divide-border">
            {[...linhasSelecionadas].map(linha => {
              const reg    = registros.find(r => r.linha === linha);
              const classif = classifMap.get(linha);
              return (
                <div key={linha} className="p-2.5 text-xs">
                  <span className="font-mono text-primary font-medium">#{linha} — {reg?.instituicao}</span>
                  {classif?.donoAtual?.operadorNome && (
                    <span className="text-muted-foreground ml-2">
                      (atualmente: {classif.donoAtual.operadorNome})
                    </span>
                  )}
                  {reg?.nome_cliente && (
                    <span className="text-muted-foreground ml-1">· {reg.nome_cliente}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">E-mail do líder / admin</label>
              <Input type="email" value={liderEmail} onChange={e => setLiderEmail(e.target.value)}
                placeholder="lider@empresa.com" disabled={autorizando} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Senha</label>
              <Input type="password" value={liderSenha} onChange={e => setLiderSenha(e.target.value)}
                disabled={autorizando} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalAberto(false)} disabled={autorizando}>Cancelar</Button>
            <Button onClick={confirmarAutorizacao} disabled={autorizando || linhasSelecionadas.size === 0} className="gap-2">
              {autorizando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Autorizando…</>
                : <><Shield className="w-4 h-4" /> Autorizar {linhasSelecionadas.size}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabelaSimples({
  registros,
  classifMap,
  linhasAutorizadas,
  isPP,
  modo,
}: {
  registros: RegistroImportado[];
  classifMap: Map<number, ClassificacaoNR>;
  linhasAutorizadas: Set<number>;
  isPP: boolean;
  modo: ModoParse;
}) {
  void classifMap; void linhasAutorizadas;

  if (registros.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nenhum registro nesta categoria.</p>;
  }

  const emBlocos = modo === 'blocos';
  const headers = [
    'Linha',
    ...(emBlocos ? ['Bloco'] : []),
    ...(isPP
      ? ['Código', 'UF', 'Tipo', 'Parc.', 'Valor Total', 'Valor/Parc.', 'Vencimento', 'Status', 'Nome', 'WhatsApp']
      : ['NR', 'Nome', 'Tipo', 'Parc.', 'Valor/Parc.', 'Vencimento', 'Status', 'Instituição', 'WhatsApp']),
  ];

  return (
    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm border-b border-border z-10">
          <tr>
            {headers.map(h => (
              <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map(r => {
            const valorParcela = isPP
              ? (r.valor !== null && r.parcelas > 0 ? r.valor / r.parcelas : null)
              : r.valor;
            return (
            <tr key={r.linha} className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                {r.linhaPlanilha ?? r.linha}
                {r.abaOrigem === 'extra' && (
                  <span className="ml-1 px-1 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold uppercase align-middle">
                    Extra
                  </span>
                )}
              </td>
              {emBlocos && (
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.bloco ?? '—'}</td>
              )}
              <td className="px-2 py-1.5 font-mono font-medium text-primary">
                {isPP ? (r.instituicao || '—') : (r.nr_cliente || '—')}
              </td>
              {isPP ? (
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.estado_uf || '—'}</td>
              ) : (
                <td className="px-2 py-1.5 max-w-[120px] truncate">{r.nome_cliente || '—'}</td>
              )}
              <td className="px-2 py-1.5 text-muted-foreground">{formatTipo(r.tipo)}</td>
              <td className="px-2 py-1.5 text-center">{r.parcelas}x</td>
              {isPP && (
                <td className="px-2 py-1.5 text-right font-mono">{r.valor !== null ? formatCurrency(r.valor) : '—'}</td>
              )}
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                {valorParcela !== null ? formatCurrency(valorParcela) : '—'}
              </td>
              <td className="px-2 py-1.5 font-mono">{r.vencimento ? formatDate(r.vencimento) : '—'}</td>
              <td className="px-2 py-1.5">
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">{r.status}</span>
              </td>
              {isPP ? (
                <td className="px-2 py-1.5 max-w-[120px] truncate">{r.nome_cliente || '—'}</td>
              ) : (
                <td className="px-2 py-1.5 text-muted-foreground">{r.instituicao || '—'}</td>
              )}
              <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{r.whatsapp || '—'}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelaBloqueados({
  registros,
  classifMap,
  linhasAutorizadas,
  onAutorizar,
}: {
  registros: RegistroImportado[];
  classifMap: Map<number, ClassificacaoNR>;
  linhasAutorizadas: Set<number>;
  onAutorizar: (linhas: Set<number>) => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const naoAutorizados = registros.filter(r => !linhasAutorizadas.has(r.linha));
  const todosNaoAutSelec = naoAutorizados.length > 0 && selecionados.size === naoAutorizados.length;

  function toggle(linha: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(linha)) next.delete(linha); else next.add(linha);
      return next;
    });
  }

  function toggleAll() {
    setSelecionados(todosNaoAutSelec ? new Set() : new Set(naoAutorizados.map(r => r.linha)));
  }

  if (registros.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma inscrição bloqueada.</p>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border bg-destructive/5 flex-wrap">
        <p className="text-xs text-destructive/80 max-w-md leading-relaxed">
          {registros.length} inscrição(ões) pertencem a outro operador e precisam de autorização de líder ou superior para transferência.
          {linhasAutorizadas.size > 0 && (
            <span className="text-success ml-1 font-medium">· {linhasAutorizadas.size} já autorizada(s)</span>
          )}
        </p>
        {selecionados.size > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { onAutorizar(new Set(selecionados)); setSelecionados(new Set()); }}
            className="text-xs h-8 whitespace-nowrap border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
          >
            <Shield className="w-3 h-3 mr-1" />
            Autorizar {selecionados.size} selecionada(s)
          </Button>
        )}
      </div>

      <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm border-b border-border z-10">
            <tr>
              <th className="px-2 py-2 w-8">
                <Checkbox checked={todosNaoAutSelec} onCheckedChange={toggleAll}
                  className={naoAutorizados.length === 0 ? 'opacity-30' : ''} />
              </th>
              {['Linha', 'Código', 'UF', 'Titular atual', 'Valor Total', 'Vencimento', 'Nome', 'Ação'].map(h => (
                <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.map(r => {
              const classif    = classifMap.get(r.linha);
              const autorizada = linhasAutorizadas.has(r.linha);
              const sel        = selecionados.has(r.linha);
              return (
                <tr key={r.linha} className={cn(
                  'border-b border-border/50',
                  autorizada ? 'bg-success/5' : sel ? 'bg-destructive/5' : 'hover:bg-muted/20',
                )}>
                  <td className="px-2 py-1.5 text-center">
                    {autorizada
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success mx-auto" />
                      : <Checkbox checked={sel} onCheckedChange={() => toggle(r.linha)} />
                    }
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.linhaPlanilha ?? r.linha}</td>
                  <td className="px-2 py-1.5 font-mono font-medium text-primary">{r.instituicao || '—'}</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{r.estado_uf || '—'}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{classif?.donoAtual?.operadorNome ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.valor !== null ? formatCurrency(r.valor) : '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.vencimento ? formatDate(r.vencimento) : '—'}</td>
                  <td className="px-2 py-1.5 max-w-[110px] truncate">{r.nome_cliente || '—'}</td>
                  <td className="px-2 py-1.5">
                    {autorizada ? (
                      <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                        Autorizado
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 text-[11px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onAutorizar(new Set([r.linha]))}
                      >
                        <Shield className="w-3 h-3 mr-1" /> Autorizar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
