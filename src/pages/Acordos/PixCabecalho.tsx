/**
 * PixCabecalho — o título da tela, o seletor de mês e as ferramentas:
 * atualizar, importar e exportar planilha, Lixeira, Histórico e limpar os
 * próprios desaprovados. Lixeira e Histórico são diálogos daqui.
 */
import { useState } from 'react';
import { Download, History, RefreshCw, Trash2, Upload, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  comissaoDe, excluirItemLixeiraPix, fetchLixeiraPix, fetchLogPix,
  limparDesaprovados, purgarLixeiraPixExpirada, restaurarItemLixeiraPix,
  type PixLixeiraItem, type PixLogItem,
} from '@/services/pix_automatico.service';
import { fmtPct, STATUS_INFO } from './pixTelaComum';
import { PixHistoricoDialog } from './PixHistoricoDialog';
import { PixLixeiraDialog } from './PixLixeiraDialog';
import { PixImportarDialog } from './PixImportarDialog';
import type { PixTela } from './usePixAutomatico';
import { useTemaNatal } from '@/components/Natal/tema';
import { RenaNeon } from '@/components/Natal/pix/PixNatal';
import { GorroNoel } from '@/components/Natal/Desenhos';

export function PixCabecalho({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, mes, setMes, loading, carregar, visiveis, pctPorSetor, pctDoMeuSetor, fixoDoMeuSetor,
    podeVerDeOutros, podeAgirSobreOutros,
    meusDesaprovados, quemExclui,
  } = pix;
  const natal = useTemaNatal();
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
  const [importarAberto, setImportarAberto] = useState(false);

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

  return (
    <>
      {/* ── Cabeçalho da aba ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
            {/* Natal: o gorro do Papai Noel, o mesmo das fotos do chat. */}
            {natal && <GorroNoel chave="pix" className="pointer-events-none absolute -top-[18px] -left-[10px] w-9 -rotate-[16deg]" />}
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
          {/* Natal: a rena de neon ao lado do título (`Natal/pix/PixNatal.tsx`). */}
          {natal && <RenaNeon className="ml-2 hidden h-[76px] w-[57px] text-muted-foreground md:block" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}
            className="gap-1.5 h-8 text-xs rounded-lg">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
          </Button>
          {/* Importar é conferência contra o Pix de todos os setores, e só a
              liderança lê todos os setores (RLS `fn_user_escopo('pix') >= 2`):
              para o operador, a comparação sairia cega. Ver `PixImportarDialog`. */}
          {podeAgirSobreOutros && (
            <Button variant="outline" size="sm" onClick={() => setImportarAberto(true)}
              className="gap-1.5 h-8 text-xs rounded-lg"
              title="Importar a planilha do Pix: confere cada NR com todos os setores antes de lançar">
              <Upload className="w-3.5 h-3.5" /> Importar
            </Button>
          )}
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
      {podeAgirSobreOutros && (
        <PixImportarDialog pix={pix} aberto={importarAberto} onAbertoChange={setImportarAberto} />
      )}
      <PixHistoricoDialog
        aberto={historicoAberto} onAbertoChange={setHistoricoAberto}
        carregando={historicoCarregando} itens={historico}
        podeVerDeOutros={podeVerDeOutros}
      />
    </>
  );
}
