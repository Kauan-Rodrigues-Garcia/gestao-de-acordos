/**
 * PixCabecalho — o título da tela, o seletor de mês e as ferramentas:
 * atualizar, importar e exportar planilha, Lixeira, Histórico e limpar os
 * próprios desaprovados. Lixeira e Histórico são diálogos daqui.
 */
import { useRef, useState } from 'react';
import { Download, History, RefreshCw, Trash2, Upload, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { cn } from '@/lib/utils';
import { gruposDeNumeros, soNumeros } from '@/lib/soNumeros';
import {
  comissaoDe, criarAcordosPixLote, excluirItemLixeiraPix, fetchLixeiraPix, fetchLogPix,
  limparDesaprovados, purgarLixeiraPixExpirada, restaurarItemLixeiraPix,
  type LinhaPixLote, type PixLixeiraItem, type PixLogItem,
} from '@/services/pix_automatico.service';
import { fmtPct, STATUS_INFO } from './pixTelaComum';
import { PixHistoricoDialog } from './PixHistoricoDialog';
import { PixLixeiraDialog } from './PixLixeiraDialog';
import type { PixTela } from './usePixAutomatico';

export function PixCabecalho({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, mes, setMes, loading, carregar, visiveis, pctPorSetor, pctDoMeuSetor, fixoDoMeuSetor,
    operadores, podeVerDeOutros, podeAgirSobreOutros, noMesAtual, diaNovo, fechamento,
    meusDesaprovados, quemExclui,
  } = pix;
  // Lixeira: 3 dias de retenção, restaurar é líder+
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [lixeira, setLixeira] = useState<PixLixeiraItem[]>([]);
  const [lixeiraCarregando, setLixeiraCarregando] = useState(false);

  // Histórico: tudo o que aconteceu com os registros desta aba.
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historico, setHistorico] = useState<PixLogItem[]>([]);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [limpando, setLimpando]       = useState(false);
  const [importando, setImportando]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      setLixeira(await fetchLixeiraPix(empresa.id, podeVerDeOutros ? undefined : { operadorId: perfil.id }));
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

  // ── Exportar / Importar planilha ──────────────────────────────────────────
  // O xlsx (~160 kB gzip) vem só no clique: era import estático e a aba Pix
  // inteira esperava por ele para abrir, sem ninguém ter pedido planilha.
  async function exportar() {
    if (visiveis.length === 0) { toast.error('Nenhum registro para exportar.'); return; }
    let xlsx: typeof import('@e965/xlsx');
    try {
      xlsx = await import('@e965/xlsx');
    } catch {
      toast.error('Não foi possível carregar o gerador de planilha. Tente de novo.');
      return;
    }
    const { utils: xlsxUtils, write: xlsxWrite } = xlsx;
    const rows = visiveis.map(i => ({
      NR:        i.nr_cliente,
      Operador:  i.operador_nome ?? '',
      Valor:     Number(i.valor),
      Comissao:  comissaoDe(i, pctPorSetor),
      Bonus:     Number(i.bonus_pct) > 0 ? `+${fmtPct(Number(i.bonus_pct))}` : '',
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
    if (fechamento.impedir('importar Pix neste mês')) return;
    setImportando(true);
    try {
      const [buf, { read: xlsxRead, utils: xlsxUtils }] = await Promise.all([
        file.arrayBuffer(),
        import('@e965/xlsx'),
      ]);
      const wb = xlsxRead(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsxUtils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      const linhas: LinhaPixLote[] = rows.map(row => {
        // Só número (26/10/2026): «12748027_» vira 12748027; com mais de um
        // número na célula, fica vazio e a linha entra nos inválidos ignorados.
        const nrBruto = String(pegarCampo(row, ['nr', 'nr do acordo', 'nr_cliente']) ?? '').trim();
        const nr = gruposDeNumeros(nrBruto) === 1 ? soNumeros(nrBruto) : '';
        const valor = parseCurrencyInput(String(pegarCampo(row, ['valor', 'valor total', 'valor do acordo']) ?? ''));
        const opNome = String(pegarCampo(row, ['operador', 'operador_nome', 'nome']) ?? '').trim();

        // Atribuição de operador: líder + nome reconhecido → esse operador; senão, o usuário logado.
        let opId = perfil.id;
        let opNomeFinal = perfil.nome ?? perfil.email ?? '—';
        let setorId = perfil.setor_id ?? null;
        if (podeAgirSobreOutros && opNome) {
          const match = operadores.find(o => o.nome.trim().toLowerCase() === opNome.toLowerCase());
          if (match) { opId = match.id; opNomeFinal = match.nome; setorId = match.setor_id; }
        }
        return { nrCliente: nr, valor, operadorId: opId, operadorNome: opNomeFinal, setorId };
      });

      const r = await criarAcordosPixLote(empresa.id, linhas, noMesAtual ? null : diaNovo);
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

  return (
    <>
      {/* ── Cabeçalho da aba ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            {/* Título da TELA desde 16/10/2026 — antes era o de uma aba de Acordos. */}
            <h1 className="text-xl font-bold text-foreground leading-tight">Pix Automático</h1>
            <p className="text-[11px] text-muted-foreground">
              Comissão de {fixoDoMeuSetor != null ? formatCurrency(fixoDoMeuSetor) : fmtPct(pctDoMeuSetor)} por acordo
              aprovado — sem vínculo com a lista de acordos.
            </p>
            {/* O MESMO seletor do Dashboard e do Analítico, ligado ao mesmo
                mês: a aba inteira (lista, metas, dobra, ranking, premiação)
                fala do mês escolhido aqui. */}
            <div className="-ml-1.5 mt-0.5">
              <SeletorMes mes={mes} onChange={setMes} desabilitado={loading} />
            </div>
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
              className="gap-1.5 h-8 text-xs rounded-lg text-red-700 dark:text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:text-red-800 dark:hover:text-red-300">
              <Trash2 className="w-3.5 h-3.5" />
              {limpando ? 'Limpando...' : `Limpar desaprovados (${meusDesaprovados})`}
            </Button>
          )}
        </div>
      </div>

      <PixLixeiraDialog
        aberto={lixeiraAberta} onAbertoChange={setLixeiraAberta}
        carregando={lixeiraCarregando} itens={lixeira}
        podeAgirSobreOutros={podeAgirSobreOutros} restaurandoId={restaurandoId}
        onRestaurar={restaurarDaLixeira} onApagar={apagarDaLixeira}
      />
      <PixHistoricoDialog
        aberto={historicoAberto} onAbertoChange={setHistoricoAberto}
        carregando={historicoCarregando} itens={historico}
        podeVerDeOutros={podeVerDeOutros}
      />
    </>
  );
}
