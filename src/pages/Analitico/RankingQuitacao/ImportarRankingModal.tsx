/**
 * Importar o relatório mensal de parcelas pagas para o Ranking de quitação.
 *
 * Lê o arquivo no navegador, casa o login do operador com o perfil (a mesma
 * regra das outras importações, `resolverOperadores`) e mostra a prévia antes
 * de gravar.
 *
 * CADA SETOR IMPORTA O SEU (20261112234000): a prévia mostra, por setor, o
 * que o mês tem hoje e o que o arquivo traz, e a importação atualiza só os
 * setores marcados — os outros ficam exatamente como estão. Antes, importar
 * substituía o mês da empresa inteira, e o relatório do Play 2 (12/11/2026)
 * apagou o novembro do Play 3, do Play 5 e do Play Mix Marília.
 *
 * Vêm marcados os setores que estão no arquivo, menos o que cairia para menos
 * da metade do que tem hoje: aí o arquivo parece não ser daquele setor (uma
 * pessoa de lá no relatório de outro grupo), e quem importa decide.
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
import { pareceDeOutroSetor, setoresParaAtualizar } from '@/services/rankingQuitacao/ranking';
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
  /** Por setor, hoje × arquivo. `null`: não deu para conferir — e sem isso não se importa. */
  setores: SetorNaPrevia[] | null;
};

export function ImportarRankingModal({ aberto, empresaId, onFechar, onImportado }: Props) {
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const limpar = () => {
    setPrevia(null);
    setNomeArquivo('');
    setMarcados(new Set());
  };

  const fechar = () => {
    if (gravando) return;
    limpar();
    onFechar();
  };

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    setLendo(true);
    setPrevia(null);
    setMarcados(new Set());
    try {
      const r = await lerRelatorioQuitacao(arquivo);
      if (r.erros.length) { toast.error(r.erros[0]); return; }
      const logins = [...new Set(r.acordos.map(a => a.operador_usuario))];
      const { map } = await resolverOperadores(empresaId, logins);
      const setores = r.mes
        ? await previaDaImportacao(empresaId, r.mes, r.acordos.map(a => map[a.operador_usuario] ?? null)).catch((): null => null)
        : null;
      setPrevia({ ...r, idPorLogin: map, setores });
      setMarcados(new Set(setores ? setoresParaAtualizar(setores) : []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa?.mes || !marcados.size) return;
    setGravando(true);
    try {
      const n = await importarRanking(empresaId, previa.mes, previa.acordos.map(a => ({
        ...a, operador_id: previa.idPorLogin[a.operador_usuario] ?? null,
      })), [...marcados]);
      const nomes = (previa.setores ?? []).filter(s => marcados.has(s.setor_id)).map(s => s.setor_nome).join(', ');
      toast.success(`Ranking de ${nomeDoMes(previa.mes)} importado: ${n} quitaç${n === 1 ? 'ão' : 'ões'} em ${nomes}.`, {
        description: 'Os outros setores ficaram como estavam.',
      });
      const mes = previa.mes;
      limpar();
      onImportado(mes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gravar a importação.');
    } finally {
      setGravando(false);
    }
  }

  const alternar = (id: string, v: boolean) => setMarcados(m => {
    const novo = new Set(m);
    if (v) novo.add(id); else novo.delete(id);
    return novo;
  });

  const resumo = previa ? resumoPorOperador(previa.acordos) : [];
  const semVinculo = resumo.filter(o => !previa?.idPorLogin[o.operador]);
  const noArquivo = (previa?.setores ?? []).filter(s => s.no_arquivo > 0);
  const foraDoArquivo = (previa?.setores ?? []).filter(s => s.no_arquivo === 0);

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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

            {previa.setores === null ? (
              <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Não deu para conferir de que setores é este arquivo. Sem isso a importação não grava — tente de novo.
              </p>
            ) : noArquivo.length === 0 ? (
              <p className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
                Ninguém deste arquivo é de um setor cadastrado no sistema.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Atualizar o setor</span>
                  <span>Hoje no mês → no arquivo</span>
                </div>
                <ul className="divide-y divide-border">
                  {noArquivo.map(s => {
                    const marcado = marcados.has(s.setor_id);
                    const estranho = pareceDeOutroSetor(s);
                    return (
                      <li key={s.setor_id} className={cn('space-y-1 px-3 py-2 text-xs', estranho && 'bg-warning/10')}>
                        <label className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <Checkbox checked={marcado} onCheckedChange={v => alternar(s.setor_id, v === true)} />
                            <span className={cn('truncate', marcado ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.setor_nome}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {s.no_banco} → <span className={cn('font-semibold', estranho ? 'text-warning' : 'text-foreground')}>{s.no_arquivo}</span>
                          </span>
                        </label>
                        {estranho && (
                          <p className="pl-6 text-[11px] text-warning">
                            Cairia de {s.no_banco} para {s.no_arquivo}: parece que o arquivo não é deste setor. Marque só se for isso mesmo.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {foraDoArquivo.length > 0 && (
                  <p className="border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                    Não vêm no arquivo e ficam como estão: {foraDoArquivo.map(s => `${s.setor_nome} (${s.no_banco})`).join(', ')}.
                  </p>
                )}
              </div>
            )}

            {(previa.porTipo.juncao > 0 || previa.porTipo.saldo_zerado > 0 || previa.porTipo.quitacao_boleto > 0) && (
              <p className="text-xs text-muted-foreground">
                {previa.porTipo.quitacao} de acordo de Quitação, {previa.porTipo.quitacao_boleto} de Quitação no boleto à vista
                (fim do contrato), {previa.porTipo.juncao} de troca de plano (Junção) e {previa.porTipo.saldo_zerado} de
                saldo zerado. O setor que aceita só Quitação conta só as primeiras.
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
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                {semVinculo.length} login{semVinculo.length === 1 ? '' : 's'} sem usuário no sistema
                ({semVinculo.slice(0, 4).map(o => o.operador).join(', ')}{semVinculo.length > 4 ? '…' : ''}) — sem
                usuário não há setor, e essas quitações ficam de fora.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Atualiza {nomeDoMes(previa.mes)} só nos setores marcados. Os outros ficam exatamente como estão.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={gravando}>Cancelar</Button>
          <Button
            onClick={() => void confirmar()}
            disabled={!previa?.mes || !previa.acordos.length || !previa.setores || !marcados.size || gravando}
            className="gap-2"
          >
            {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {marcados.size > 1 ? `Importar ${marcados.size} setores` : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
