/**
 * RelatorioDoMes — a aba «Relatório do mês» de Importar Vendas.
 *
 * Escolhe uma carga vigente (geral ou prévia do setor, de qualquer mês que
 * tenha sido importado) e mostra o raio-x dela — tudo o que o arquivo trouxe.
 * Lê `vendas_relatorio`, que é o retrato cru do ERP: nenhuma régua do sistema
 * foi aplicada ainda, e a franquia sem setor aparece como «Sem setor» em vez
 * de sumir.
 *
 * Só lê quando a aba abre, e só a carga escolhida — nada de tempo real. O
 * relatório de agosto tem quase 7 mil linhas; carregá-lo a cada venda lançada
 * seria o mesmo erro que já custou CPU no Dashboard (ver `cpu-sinal-so-update`).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, TriangleAlert, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatDate } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { rotuloDoMes } from '@/lib/mesReferencia';
import {
  buscarLotes, buscarFranquias, buscarLinhasDoLote,
  type Lote, type Franquia, type LinhaGravada,
} from '@/services/vendas/importacaoVendas.service';
import { mapaDeSetorDaFranquia } from '@/lib/vendasRelatorio';
import { RaioXDoRelatorio } from './RaioXDoRelatorio';

export default function RelatorioDoMes() {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [franquias, setFranquias] = useState<Franquia[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaGravada[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lotesProntos, setLotesProntos] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    void Promise.all([buscarLotes(empresaId), buscarFranquias(empresaId)]).then(([l, f]) => {
      const vigentes = l.lotes.filter(x => x.estado === 'vigente')
        .sort((a, b) => (b.mes.localeCompare(a.mes)) || (a.origem === 'geral' ? -1 : 1));
      setLotes(vigentes);
      setFranquias(f.franquias);
      setEscolhido(atual => atual ?? vigentes[0]?.id ?? null);
      if (l.erro) setErro(l.erro);
      setLotesProntos(true);
    });
  }, [empresaId]);

  const lote = lotes.find(l => l.id === escolhido) ?? null;

  async function carregar(alvo: Lote) {
    setCarregando(true); setErro(null); setLinhas(null);
    const r = await buscarLinhasDoLote(alvo);
    setLinhas(r.linhas);
    setErro(r.erro);
    setCarregando(false);
  }

  useEffect(() => {
    if (lote) void carregar(lote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote?.id]);

  const setorDaFranquia = useMemo(() => mapaDeSetorDaFranquia(franquias), [franquias]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <FileSearch className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Relatório do mês</h1>
            <p className="text-[12px] text-muted-foreground">
              Tudo o que o relatório de prospecção trouxe — vendedor, franquia, pagamento, produto, motivos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lotes.length > 0 && (
            <Select value={escolhido ?? undefined} onValueChange={setEscolhido}>
              <SelectTrigger className="h-9 w-[320px] text-xs" aria-label="Carga"><SelectValue /></SelectTrigger>
              <SelectContent>
                {lotes.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {rotuloDoMes(l.mes.slice(0, 7))} · {l.origem === 'geral' ? 'Geral (oficial)' : 'Prévia do setor'}
                    {' · '}{l.linhas_aceitas} linhas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Recarregar"
            disabled={!lote || carregando} onClick={() => lote && void carregar(lote)}>
            <RefreshCw className={carregando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      {lote && (
        <p className="text-[11px] text-muted-foreground">
          {lote.arquivo_nome ?? 'arquivo sem nome'} · importado {formatDate(lote.importado_em?.slice(0, 10))}
          {lote.perfis?.nome ? ` por ${lote.perfis.nome}` : ''} · {lote.quantidade_na_regua} na régua,
          {' '}{formatBRL(lote.faturamento_na_regua)}
          {lote.origem === 'setor' && ' · a prévia recorta pela data da venda e é a única que traz venda em aberto'}
        </p>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{erro}
        </div>
      )}

      {lotesProntos && lotes.length === 0 && !erro ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nenhuma carga vigente ainda. Importe o relatório na aba Importação.
        </p>
      ) : carregando || linhas === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o relatório…
        </div>
      ) : (
        <RaioXDoRelatorio
          linhas={linhas}
          setorDaFranquia={setorDaFranquia}
          nomeDoArquivo={`relatorio-${lote?.origem ?? 'vendas'}-${lote?.mes.slice(0, 7) ?? ''}`}
        />
      )}
    </div>
  );
}
