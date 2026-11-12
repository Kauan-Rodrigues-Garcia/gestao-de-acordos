/**
 * Importar o relatório mensal de parcelas pagas para o Ranking de quitação.
 *
 * Lê o arquivo no navegador, casa o login do operador com o perfil (a mesma
 * regra das outras importações, `resolverOperadores`) e mostra a prévia antes
 * de gravar. Gravar substitui a importação daquele mês na empresa inteira: o
 * relatório é um só para todos os setores, e cada setor vê só a sua gente.
 *
 * Por isso a prévia mostra, por setor, o que o mês tem hoje e o que o arquivo
 * traz (20261112210000). Setor que tinha quitação e fica sem nenhuma aparece
 * em destaque e gravar pede «Entendi» — em 12/11/2026 um arquivo só com o
 * Play 2 apagou o novembro do Play 3, do Play 5 e do Play Mix Marília.
 */
import { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { resolverOperadores } from '@/services/analitico/analitico.service';
import { lerRelatorioQuitacao, resumoPorOperador, type RelatorioQuitacao } from '@/services/rankingQuitacao/relatorioQuitacao';
import { importarRanking, previaDaImportacao, type SetorNaPrevia } from '@/services/rankingQuitacao/rankingQuitacao.service';
import { setoresQueFicamSemQuitacao } from '@/services/rankingQuitacao/ranking';
import { cn } from '@/lib/utils';
import { nomeDoMes } from './mes';

interface Props {
  aberto: boolean;
  empresaId: string;
  onFechar: () => void;
  /** Gravou: devolve o mês importado (`AAAA-MM-01`). */
  onImportado: (mes: string) => void;
}

type Previa = RelatorioQuitacao & {
  idPorLogin: Record<string, string | null>;
  /** Por setor, hoje × arquivo. `null`: não deu para conferir (função pendente ou erro). */
  setores: SetorNaPrevia[] | null;
};

export function ImportarRankingModal({ aberto, empresaId, onFechar, onImportado }: Props) {
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [ciente, setCiente] = useState(false);

  const fechar = () => {
    if (gravando) return;
    setPrevia(null);
    setNomeArquivo('');
    setCiente(false);
    onFechar();
  };

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    setLendo(true);
    setPrevia(null);
    setCiente(false);
    try {
      const r = await lerRelatorioQuitacao(arquivo);
      if (r.erros.length) { toast.error(r.erros[0]); return; }
      const logins = [...new Set(r.acordos.map(a => a.operador_usuario))];
      const { map } = await resolverOperadores(empresaId, logins);
      // A conferência por setor não segura a leitura: sem ela, só não há o aviso.
      const setores = r.mes
        ? await previaDaImportacao(empresaId, r.mes, r.acordos.map(a => map[a.operador_usuario] ?? null)).catch((): null => null)
        : null;
      setPrevia({ ...r, idPorLogin: map, setores });
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
      setCiente(false);
      onImportado(mes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gravar a importação.');
    } finally {
      setGravando(false);
    }
  }

  const resumo = previa ? resumoPorOperador(previa.acordos) : [];
  const semVinculo = resumo.filter(o => !previa?.idPorLogin[o.operador]);
  const somem = previa?.setores ? setoresQueFicamSemQuitacao(previa.setores) : [];
  const apagadas = somem.reduce((t, s) => t + s.no_banco, 0);
  const travado = somem.length > 0 && !ciente;

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Ranking de quitação</DialogTitle>
          <DialogDescription>
            O relatório mensal de parcelas pagas do ERP (ex.: SETEMBRO.xls). Entram os acordos
            com «Situação Atual» Quitação e a data da quitação dentro do mês — e a Junção que
            quitou o contrato (saldo zerado e data da quitação). A última parcela de um boleto
            parcelado não é quitação e fica de fora. Pagamento desmembrado no mesmo
            contrato conta como uma quitação, e a quitação que pagou o saldo de um Parcelamento
            leva junto o que ele recebeu no mês. O valor de cada quitação é o RECEBIDO no mês
            (coluna «Recebido»), não o valor do acordo inteiro.
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

            {(previa.porTipo.juncao > 0 || previa.porTipo.saldo_zerado > 0) && (
              <p className="text-xs text-muted-foreground">
                {previa.porTipo.quitacao} de acordo de Quitação, {previa.porTipo.juncao} de troca de plano (Junção) e{' '}
                {previa.porTipo.saldo_zerado} de saldo zerado. O setor que aceita só Quitação conta só as primeiras.
              </p>
            )}
            {previa.quitadosPorJuncao > 0 && (
              <p className="text-xs text-muted-foreground">
                {previa.quitadosPorJuncao} quitaç{previa.quitadosPorJuncao === 1 ? 'ão veio' : 'ões vieram'} de
                Junção que fechou o contrato.
              </p>
            )}
            {previa.quitadosCompletandoParcelamento > 0 && (
              <p className="text-xs text-muted-foreground">
                {previa.quitadosCompletandoParcelamento} quitaç{previa.quitadosCompletandoParcelamento === 1 ? 'ão pagou' : 'ões pagaram'} o
                saldo de um Parcelamento do mesmo contrato e soma{previa.quitadosCompletandoParcelamento === 1 ? '' : 'm'} o
                que já tinha sido pago nele.
              </p>
            )}
            {previa.ultimasParcelasDeCarne != null && previa.ultimasParcelasDeCarne > 0 && (
              <p className="text-xs text-muted-foreground">
                {previa.ultimasParcelasDeCarne} acordo{previa.ultimasParcelasDeCarne === 1 ? '' : 's'} no boleto
                parcelado pag{previa.ultimasParcelasDeCarne === 1 ? 'ou' : 'aram'} a última parcela: o ERP marca
                Quitação, mas não conta{previa.ultimasParcelasDeCarne === 1 ? '' : 'm'} no ranking.
              </p>
            )}
            {previa.ultimasParcelasDeCarne === null && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                O arquivo não tem as colunas «Tp. Doc» e «Qtd. Parcelas Acordo»: a última parcela de boleto
                parcelado vai contar como quitação. Use o relatório completo do ERP.
              </p>
            )}
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
            {previa.setores && previa.setores.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Setor</span>
                  <span>Hoje no mês → no arquivo</span>
                </div>
                <ul className="divide-y divide-border">
                  {previa.setores.map(s => {
                    const some = s.no_banco > 0 && s.no_arquivo === 0;
                    return (
                      <li key={s.setor_id} className={cn('flex items-center justify-between gap-3 px-3 py-1.5 text-xs', some && 'bg-warning/10')}>
                        <span className={cn('truncate', some && 'font-medium text-warning')}>{s.setor_nome}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {s.no_banco} → <span className={cn('font-semibold', some ? 'text-warning' : 'text-foreground')}>{s.no_arquivo}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {somem.length > 0 && (
              <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
                <p className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    O arquivo não tem ninguém de <strong>{somem.map(s => s.setor_nome).join(', ')}</strong>.
                    Importar apaga {apagadas === 1 ? 'a quitação' : `as ${apagadas} quitações`} de {nomeDoMes(previa.mes)} que
                    {somem.length === 1 ? ' esse setor tem' : ' esses setores têm'} hoje. O relatório certo é o da empresa
                    inteira, sem filtro de grupo.
                  </span>
                </p>
                <label className="flex cursor-pointer items-center gap-2 pl-6">
                  <Checkbox checked={ciente} onCheckedChange={v => setCiente(v === true)} />
                  <span>Entendi, pode apagar</span>
                </label>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Substitui a importação de {nomeDoMes(previa.mes)} da empresa inteira. Cada setor
              habilitado vê só os seus operadores.
              {previa.setores === null && ' Não deu para conferir os setores agora: confira se o arquivo tem todos eles.'}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={gravando}>Cancelar</Button>
          <Button
            onClick={() => void confirmar()}
            disabled={!previa?.mes || !previa.acordos.length || gravando || travado}
            variant={somem.length > 0 ? 'destructive' : 'default'}
            className="gap-2"
          >
            {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {somem.length > 0 ? 'Importar mesmo assim' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

