/**
 * Importar o relatório mensal de parcelas pagas para o Ranking de quitação.
 *
 * Lê o arquivo no navegador, casa o login do operador com o perfil (a mesma
 * regra das outras importações, `resolverOperadores`) e mostra a prévia antes
 * de gravar. Gravar substitui a importação daquele mês na empresa inteira: o
 * relatório é um só para todos os setores, e cada setor vê só a sua gente.
 */
import { useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { resolverOperadores } from '@/services/analitico/analitico.service';
import { lerRelatorioQuitacao, resumoPorOperador, type RelatorioQuitacao } from '@/services/rankingQuitacao/relatorioQuitacao';
import { importarRanking } from '@/services/rankingQuitacao/rankingQuitacao.service';
import { nomeDoMes } from './mes';

interface Props {
  aberto: boolean;
  empresaId: string;
  onFechar: () => void;
  /** Gravou: devolve o mês importado (`AAAA-MM-01`). */
  onImportado: (mes: string) => void;
}

type Previa = RelatorioQuitacao & { idPorLogin: Record<string, string | null> };

export function ImportarRankingModal({ aberto, empresaId, onFechar, onImportado }: Props) {
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');

  const fechar = () => {
    if (gravando) return;
    setPrevia(null);
    setNomeArquivo('');
    onFechar();
  };

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    setLendo(true);
    setPrevia(null);
    try {
      const r = await lerRelatorioQuitacao(arquivo);
      if (r.erros.length) { toast.error(r.erros[0]); return; }
      const logins = [...new Set(r.acordos.map(a => a.operador_usuario))];
      const { map } = await resolverOperadores(empresaId, logins);
      setPrevia({ ...r, idPorLogin: map });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa?.mes) return;
    setGravando(true);
    try {
      const n = await importarRanking(empresaId, previa.mes, previa.acordos.map(a => ({
        ...a, operador_id: previa.idPorLogin[a.operador_usuario] ?? null,
      })));
      toast.success(`Ranking de ${nomeDoMes(previa.mes)} importado: ${n} acordo${n === 1 ? '' : 's'} quitado${n === 1 ? '' : 's'}.`);
      const mes = previa.mes;
      setPrevia(null);
      setNomeArquivo('');
      onImportado(mes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gravar a importação.');
    } finally {
      setGravando(false);
    }
  }

  const resumo = previa ? resumoPorOperador(previa.acordos) : [];
  const semVinculo = resumo.filter(o => !previa?.idPorLogin[o.operador]);

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Ranking de quitação</DialogTitle>
          <DialogDescription>
            O relatório mensal de parcelas pagas do ERP (ex.: SETEMBRO.xls). Entram os acordos
            com «Situação Atual» Quitação e a data da quitação dentro do mês.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 transition-colors hover:bg-muted/40">
          {lendo ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-sm">
            {lendo ? 'Lendo o relatório…' : nomeArquivo || 'Escolher arquivo .xls ou .xlsx'}
          </span>
          <input
            type="file"
            accept=".xls,.xlsx"
            className="sr-only"
            disabled={lendo || gravando}
            onChange={e => { void escolher(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>

        {previa?.mes && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Mês</p>
                <p className="font-semibold capitalize">{nomeDoMes(previa.mes)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Acordos quitados</p>
                <p className="font-semibold tabular-nums">{previa.acordos.length}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Operadores</p>
                <p className="font-semibold tabular-nums">{resumo.length}</p>
              </div>
            </div>

            {previa.quitadosForaDoMes > 0 && (
              <p className="text-xs text-muted-foreground">
                {previa.quitadosForaDoMes} acordo{previa.quitadosForaDoMes === 1 ? '' : 's'} quit{previa.quitadosForaDoMes === 1 ? 'ou' : 'aram'} em
                outro mês e fica{previa.quitadosForaDoMes === 1 ? '' : 'm'} para o relatório daquele mês.
              </p>
            )}
            {semVinculo.length > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                {semVinculo.length} login{semVinculo.length === 1 ? '' : 's'} sem usuário no sistema
                ({semVinculo.slice(0, 4).map(o => o.operador).join(', ')}{semVinculo.length > 4 ? '…' : ''}) —
                essas quitações são gravadas, mas não aparecem no ranking.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Substitui a importação de {nomeDoMes(previa.mes)} da empresa inteira. Cada setor
              habilitado vê só os seus operadores.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={gravando}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={!previa?.mes || !previa.acordos.length || gravando} className="gap-2">
            {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

