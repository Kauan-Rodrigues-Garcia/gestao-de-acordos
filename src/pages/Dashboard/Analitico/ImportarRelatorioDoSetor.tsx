/**
 * ImportarRelatorioDoSetor — o botão e o diálogo do relatório próprio do setor
 * (o 1017 da Manutenção, 12/11/2026).
 *
 * Separado do ImportarModal do 58/994 de propósito: o 1017 não tem operador,
 * não tabula, não remove linha do analítico e não passa pela sincronização do
 * 59. Ele só troca o mês do setor pelo arquivo, pela RPC. Juntar os fluxos
 * faria cada mudança num deles ter de provar que não mexeu no outro.
 *
 * Aparece só para quem importa: o líder do próprio setor e o super admin
 * (`setoresQuePodeImportar`), e só onde o setor tem o relatório no cadastro.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, BarChart3, CheckCircle2, FileSpreadsheet, Loader2, Repeat } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { RELATORIOS_DO_SETOR } from '@/lib/relatoriosDoSetor';
import {
  importarRelatorioDoSetor, ultimoLoteDoMes,
  type LoteDoRelatorio, type SetorComRelatorio,
} from '@/services/relatorio1017/relatorioDoSetor.service';
import type { ResultadoParse1017 } from '@/services/relatorio1017/relatorio1017Parser';
import { DetalheRelatorioDoSetor } from './DetalheRelatorioDoSetor';

interface Props {
  /** O que `useSetoresQueImportamRelatorio` devolveu. Vazio = nada aparece. */
  permitidos: readonly SetorComRelatorio[];
  /** 'yyyy-MM' do recorte. */
  mes: string;
  /** O setor em foco na tela; para o super admin, é o escolhido de partida. */
  setorEmFoco?: string | null;
  nomeDoSetor: (id: string) => string | undefined;
  /** Depois de gravar: a página relê os totais. */
  onImportado?: () => void;
}

const nomeMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function ImportarRelatorioDoSetor({ permitidos, mes, setorEmFoco, nomeDoSetor, onImportado }: Props) {
  const [aberto, setAberto] = useState(false);
  const [setorId, setSetorId] = useState<string | null>(null);
  const [lote, setLote] = useState<LoteDoRelatorio | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<ResultadoParse1017 | null>(null);
  const [gravando, setGravando] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // O setor de partida: o em foco, se ele usa relatório; senão o único possível.
  useEffect(() => {
    if (!permitidos.length) { setSetorId(null); return; }
    const foco = permitidos.find(p => p.setorId === setorEmFoco);
    setSetorId(atual => (atual && permitidos.some(p => p.setorId === atual))
      ? atual
      : (foco ?? permitidos[0]).setorId);
  }, [permitidos, setorEmFoco]);

  const escolhido = permitidos.find(p => p.setorId === setorId) ?? null;
  const catalogo = escolhido ? RELATORIOS_DO_SETOR[escolhido.relatorio] : null;

  const recarregarLote = useCallback(async () => {
    if (!escolhido) { setLote(null); return; }
    setLote(await ultimoLoteDoMes(escolhido.setorId, escolhido.relatorio, mes));
  }, [escolhido, mes]);

  useEffect(() => { void recarregarLote(); }, [recarregarLote]);

  const limpar = () => {
    setArquivo(null);
    setPrevia(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const ler = async (f: File) => {
    setArquivo(f);
    setPrevia(null);
    setLendo(true);
    try {
      const { parseRelatorio1017 } = await import('@/services/relatorio1017/relatorio1017Parser');
      setPrevia(await parseRelatorio1017(f));
    } catch (e) {
      setPrevia(null);
      toast.error(`Não consegui ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLendo(false);
    }
  };

  const mesDoArquivo = previa?.mes ?? null;
  const mesDiferente = !!mesDoArquivo && mesDoArquivo !== mes;
  const podeGravar = !!escolhido && !!previa && !previa.erros.length && !!mesDoArquivo && !gravando;

  const gravar = async () => {
    if (!escolhido || !previa || !mesDoArquivo || !arquivo) return;
    setGravando(true);
    const { data, error } = await importarRelatorioDoSetor({
      setorId: escolhido.setorId,
      relatorio: escolhido.relatorio,
      mes: mesDoArquivo,
      arquivoNome: arquivo.name,
      linhas: previa.linhas,
    });
    setGravando(false);
    if (error || !data) { toast.error(error ?? 'Falha ao importar.'); return; }
    const fora = data.ignoradas59
      ? ` ${data.ignoradas59} linha(s) (${formatBRL(data.valorIgnorado59)}) ficaram fora: o 59 já conta para setor.`
      : '';
    toast.success(`${catalogo?.nome ?? 'Relatório'}: ${formatBRL(data.valor)} em ${data.linhas} linhas no setor.${fora}`);
    limpar();
    setAberto(false);
    void recarregarLote();
    setDetalhe(true);
    onImportado?.();
  };

  if (!escolhido || !catalogo) return null;

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 rounded-lg"
        onClick={() => setAberto(true)}
        title={`${catalogo.nome} — ${catalogo.descricao} Soma só no recebimento geral do setor.`}>
        <Repeat className="h-4 w-4" /> Importar {escolhido.relatorio}
        {lote && <span className="text-muted-foreground font-normal">· {formatBRL(lote.valorTotal)}</span>}
      </Button>
      {lote && (
        <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg" onClick={() => setDetalhe(true)}
          title={`Ver o ${escolhido.relatorio} do mês: por dia, por tipo e linha a linha.`}>
          <BarChart3 className="h-4 w-4" /> Ver {escolhido.relatorio}
        </Button>
      )}

      <DetalheRelatorioDoSetor aberto={detalhe} onAbertoChange={setDetalhe}
        setorId={escolhido.setorId} relatorio={escolhido.relatorio} mes={mes}
        nomeDoSetor={nomeDoSetor(escolhido.setorId)} lote={lote} />

      <Dialog open={aberto} onOpenChange={o => { if (!gravando) { setAberto(o); if (!o) limpar(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar {catalogo.nome}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <DialogDescription>
              {catalogo.descricao} O valor soma só no recebimento <strong>geral do setor</strong> — não
              conta para operador, equipe nem para o total da empresa. Cada importação troca o mês do
              setor pelo arquivo inteiro.
            </DialogDescription>

            {permitidos.length > 1 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Setor</span>
                <Select value={escolhido.setorId} onValueChange={v => { setSetorId(v); limpar(); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {permitidos.map(p => (
                      <SelectItem key={p.setorId} value={p.setorId}>
                        {nomeDoSetor(p.setorId) ?? 'Setor'} · {p.relatorio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              {lote
                ? <>Última importação de {nomeMes(mes)}: <strong className="text-foreground">{formatBRL(lote.valorTotal)}</strong> em {lote.linhas} linhas
                    {lote.ultimoPagamento && <> (pagamentos até {lote.ultimoPagamento.split('-').reverse().slice(0, 2).join('/')})</>}
                    , {dataHora(lote.importadoEm)}{lote.importadoPorNome && <> por {lote.importadoPorNome}</>}.</>
                : <>Nada importado em {nomeMes(mes)} para {nomeDoSetor(escolhido.setorId) ?? 'este setor'}.</>}
            </div>

            <div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void ler(f); }} />
              <Button variant="outline" className="w-full gap-2" disabled={lendo || gravando}
                onClick={() => inputRef.current?.click()}>
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {arquivo ? arquivo.name : `Escolher o arquivo do ${escolhido.relatorio}`}
              </Button>
            </div>

            {previa && previa.erros.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                {previa.erros.map(e => (
                  <p key={e} className="flex gap-2 text-destructive"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{e}</p>
                ))}
              </div>
            )}

            {previa && !previa.erros.length && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {mesDoArquivo ? nomeMes(mesDoArquivo) : ''}: {formatBRL(previa.total.valor)} em {previa.total.linhas} linhas
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {Object.entries(previa.porTipo).map(([tipo, s]) => (
                    <li key={tipo}>{tipo}: {formatBRL(s.valor)} ({s.linhas})</li>
                  ))}
                  {previa.fora.semPagamento.linhas > 0 && (
                    <li>{previa.fora.semPagamento.linhas} sem Dt. Pagamento ficam fora ({formatBRL(previa.fora.semPagamento.valor)}).</li>
                  )}
                  {previa.fora.parcelaUm.linhas > 0 && (
                    <li>{previa.fora.parcelaUm.linhas} de 1ª parcela ficam fora — entram pelo 58/59 ({formatBRL(previa.fora.parcelaUm.valor)}).</li>
                  )}
                  {previa.fora.semNr.linhas > 0 && (
                    <li>{previa.fora.semNr.linhas} sem Nr. Documento ficam fora ({formatBRL(previa.fora.semNr.valor)}).</li>
                  )}
                </ul>
                {lote && (
                  <p className="text-xs">
                    Troca {formatBRL(lote.valorTotal)} por {formatBRL(previa.total.valor)}
                    {' '}({previa.total.valor - lote.valorTotal >= 0 ? '+' : ''}{formatBRL(previa.total.valor - lote.valorTotal)}).
                  </p>
                )}
                {mesDiferente && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    O arquivo é de {nomeMes(mesDoArquivo!)}, e a tela está em {nomeMes(mes)}. Ele grava em {nomeMes(mesDoArquivo!)}.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={gravando} onClick={() => { setAberto(false); limpar(); }}>Cancelar</Button>
            <Button disabled={!podeGravar} onClick={() => { void gravar(); }} className="gap-2">
              {gravando && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar para {nomeDoSetor(escolhido.setorId) ?? 'o setor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
