/**
 * Os diálogos do Banco de Horas: a pessoa, importar, Excel e imagem para e-mail.
 */
import {
  AlertTriangle, Copy, Download, FileSpreadsheet, FolderOpen, ImageIcon, Loader2, Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  grupoDe, grupos, type FiltroSituacao, type Pessoa, type Visao,
} from '@/lib/bancoHoras/calculos';
import { ABAS_EXCEL, baixarArquivo, type AbaExcel } from '@/lib/bancoHoras/excel';
import { data as fmtData, diaMes, horas, mesLongo, plural, somaMeses, titulo } from '@/lib/bancoHoras/formato';
import {
  desenharImagem, MODOS_IMAGEM, nomeDaImagem, passaModo, type ModoImagem,
} from '@/lib/bancoHoras/imagem';
import type { Lote } from '@/lib/bancoHoras/importacao';
import { textoPessoa } from '@/lib/bancoHoras/textos';
import type { ResultadoImportacao } from '@/services/bancoHoras/bancoHoras.service';
import { tomDaPessoa, tomDoGrupo } from './cores';
import { BotaoCopiar, Etiqueta, Foto, Horas, Segmentado } from './partes';

// ── A pessoa ─────────────────────────────────────────────────────────────────

export function DialogPessoa({ p, visao: v, sit, limite, url, meses: escolhidos = [], onFechar }: {
  p: Pessoa | null; visao: Visao; sit: FiltroSituacao; limite: number; url: string | null;
  /** Os meses do filtro: aparecem em destaque. */
  meses?: string[];
  onFechar: () => void;
}) {
  if (!p) return null;
  const meses = Object.keys(p.mes).filter(m => p.mes[m]).sort().reverse();
  const mx = Math.max(1, ...meses.map(m => Math.abs(p.mes[m])));
  const g = grupoDe(p, sit, limite);
  const nomeGrupo = grupos(v, sit, limite).find(d => d.id === g)?.titulo ?? '';
  return (
    <Dialog open onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
          <Foto p={p} url={url} tom={tomDaPessoa(p, true)} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{p.nome}</DialogTitle>
            <DialogDescription>Matrícula {p.mat} · {p.setor} · {p.depto} · {p.empresa}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <div className={cn('rounded-xl border p-3', p.saldo < 0 ? 'border-destructive/30 bg-destructive/[0.05]' : 'border-primary/25 bg-primary/[0.05]')}>
            <p className="text-[11px] text-muted-foreground">{p.saldo < 0 ? 'Devendo no banco' : 'Guardadas no banco'}</p>
            <Horas min={p.saldo} devendo={false} className="text-xl" />
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/[0.05] p-3">
            <p className="text-[11px] text-muted-foreground">Vence em {diaMes(v.prox)}</p>
            {p.vprox ? <Horas min={p.vprox} tom="warn" devendo={false} className="text-xl" /> : <p className="text-xl font-semibold text-muted-foreground">—</p>}
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1 text-[11px] text-muted-foreground">Situação</p>
            <Etiqueta tom={tomDoGrupo(g)}>{nomeGrupo}</Etiqueta>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Horas por mês em que foram feitas</p>
          {meses.length === 0 ? <p className="text-sm text-muted-foreground">Sem horas listadas.</p> : (
            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {meses.map(m => {
                const x = p.mes[m];
                const vence = `${somaMeses(m, 12)}-25`;
                const passou = vence < v.data;
                return (
                  <div key={m} className={cn('flex items-center gap-3 px-3 py-1.5 text-[12.5px]', escolhidos.includes(m) && 'bg-primary/[0.05]')}>
                    <span className="w-48 shrink-0 font-medium text-foreground">
                      {mesLongo(m)}{m === v.mesAtual && <span className="ml-1 text-[10px] text-muted-foreground">(atual)</span>}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className={cn('block h-full rounded-full', x < 0 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${(Math.abs(x) / mx) * 100}%` }} />
                    </span>
                    <Horas min={x} devendo={false} className="w-16 text-right" />
                    <span className="w-28 text-right text-[11px] text-muted-foreground">
                      {x < 0 ? 'devendo' : passou ? <span className="font-medium text-destructive">vencida</span> : `vence ${fmtData(vence)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {p.venc.length > 0 && p.soma !== p.saldo && (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> Os meses somam {horas(p.soma)}, mas o banco no relatório é {horas(p.saldo)}.
            </p>
          )}
        </div>
        <DialogFooter>
          <BotaoCopiar texto={() => textoPessoa(p, v)} rotulo="Copiar para o WhatsApp" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Importar ─────────────────────────────────────────────────────────────────

export interface ResultadoDoLote { lote: Lote; porData: Record<string, ResultadoImportacao> }

/** Os arquivos de um arrastar, inclusive de dentro de pastas. */
async function arquivosDoArrasto(dt: DataTransfer): Promise<File[]> {
  const entradas = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entradas.length) return [...dt.files];
  const out: File[] = [];
  const andar = async (en: FileSystemEntry): Promise<void> => {
    if (en.isFile) {
      try { out.push(await new Promise<File>((r, j) => (en as FileSystemFileEntry).file(r, j))); } catch { /* ignora */ }
    } else if (en.isDirectory) {
      const leitor = (en as FileSystemDirectoryEntry).createReader();
      let lote: FileSystemEntry[];
      do {
        lote = await new Promise<FileSystemEntry[]>((r, j) => leitor.readEntries(r, j));
        for (const e of lote) await andar(e);
      } while (lote.length);
    }
  };
  for (const e of entradas) await andar(e);
  return out;
}

export function DialogImportar({ aberto, onFechar, onArquivos, importando, resultado, posicaoPessoas }: {
  aberto: boolean; onFechar: () => void; onArquivos: (f: File[]) => void; importando: boolean;
  resultado: ResultadoDoLote | null;
  /** Setores e pessoas de uma data, depois de gravar. */
  posicaoPessoas: (data: string) => { setores: number; pessoas: number } | null;
}) {
  const arquivos = useRef<HTMLInputElement>(null);
  const pasta = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  useEffect(() => { pasta.current?.setAttribute('webkitdirectory', ''); }, [aberto]);

  const soltar = async (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    onArquivos(await arquivosDoArrasto(e.dataTransfer));
  };
  const escolher = (input: HTMLInputElement | null) => {
    const f = [...(input?.files ?? [])];
    if (input) input.value = '';
    if (f.length) onArquivos(f);
  };

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !importando) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{resultado ? (resultado.lote.datas.size ? 'Importação concluída' : 'Nada foi importado') : 'Importar o banco de horas do DP'}</DialogTitle>
          <DialogDescription>
            {resultado
              ? 'Setor igual não é tocado, setor diferente é trocado pela versão nova, e setor repetido nunca é somado duas vezes.'
              : 'Os CSV, o .zip do e-mail (às vezes ele baixa como .tmp) ou a pasta inteira, tudo de uma vez.'}
          </DialogDescription>
        </DialogHeader>

        {!resultado && (
          <div
            onDragOver={e => { e.preventDefault(); setSobre(true); }}
            onDragLeave={() => setSobre(false)}
            onDrop={e => void soltar(e)}
            className={cn('rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              sobre ? 'border-primary bg-primary/[0.06]' : 'border-border bg-muted/20')}
          >
            {importando ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo e gravando…</p>
            ) : (
              <>
                <Upload className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Arraste os arquivos do DP para cá</p>
                <p className="text-[12px] text-muted-foreground">Não precisa descompactar nem renomear.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={() => arquivos.current?.click()}><Upload className="h-3.5 w-3.5" /> Escolher arquivos</Button>
                  <Button size="sm" variant="outline" onClick={() => pasta.current?.click()}><FolderOpen className="h-3.5 w-3.5" /> Escolher pasta</Button>
                </div>
              </>
            )}
            <input ref={arquivos} type="file" multiple accept=".csv,.zip,.tmp,.json,.txt" hidden onChange={e => escolher(e.currentTarget)} />
            <input ref={pasta} type="file" multiple hidden onChange={e => escolher(e.currentTarget)} />
          </div>
        )}
        {!resultado && (
          <ol className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-3">
            <li className="rounded-lg bg-muted/30 p-2.5"><b className="text-foreground">1.</b> No e-mail do DP, clique em <b>Baixar todos os anexos</b>.</li>
            <li className="rounded-lg bg-muted/30 p-2.5"><b className="text-foreground">2.</b> Arraste o arquivo baixado para cá.</li>
            <li className="rounded-lg bg-muted/30 p-2.5"><b className="text-foreground">3.</b> No mês seguinte, o mesmo: só o que mudou é trocado.</li>
          </ol>
        )}

        {resultado && <ResumoImportacao r={resultado} posicaoPessoas={posicaoPessoas} />}

        {resultado && (
          <DialogFooter>
            <Button onClick={onFechar}>Ver o banco de horas</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResumoImportacao({ r, posicaoPessoas }: { r: ResultadoDoLote; posicaoPessoas: (d: string) => { setores: number; pessoas: number } | null }) {
  const { lote, porData } = r;
  const linhas = [...lote.datas].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return (
    <div className="max-h-[55vh] space-y-3 overflow-y-auto text-[12.5px]">
      {linhas.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {linhas.map(([dt, t]) => {
            const n = porData[dt] ?? { novos: 0, trocados: 0, iguais: 0 };
            const q = posicaoPessoas(dt);
            const desc = t.backup ? `restaurado do backup${n.novos || n.trocados ? '' : ' (já estava no gestão)'}`
              : t.novo ? 'relatório novo'
                : !n.trocados && !n.novos ? `já estava importado: ${plural(n.iguais, 'setor igual', 'setores iguais')}, nada mudou`
                  : `atualizado · ${[n.trocados && plural(n.trocados, 'setor trocado pela versão nova', 'setores trocados pela versão nova'),
                    n.novos && plural(n.novos, 'setor novo', 'setores novos'), n.iguais && plural(n.iguais, 'igual', 'iguais')].filter(Boolean).join(', ')}`;
            return (
              <div key={dt} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2">
                <b className="text-foreground">Saldo em {fmtData(dt)}</b>
                {q && <span className="text-muted-foreground">{plural(q.setores, 'setor', 'setores')} · {plural(q.pessoas, 'pessoa', 'pessoas')}</span>}
                <span className="ml-auto text-muted-foreground">{desc}</span>
              </div>
            );
          })}
        </div>
      )}
      {lote.repetidos.length > 0 && (
        <Bloco titulo={`Arquivos repetidos, contados uma vez só (${lote.repetidos.length})`}
          linhas={lote.repetidos.slice(0, 12).map(x => `${x.arquivo}: mesmo conteúdo de ${x.igual}`)
            .concat(lote.repetidos.length > 12 ? [`e mais ${lote.repetidos.length - 12}`] : [])} />
      )}
      {lote.conflitos.length > 0 && (
        <Bloco titulo={`Mesmo setor em versões diferentes (${lote.conflitos.length})`} alerta
          linhas={lote.conflitos.map(x => `${titulo(x.setor)}: ${x.empate
            ? `as duas versões têm a mesma data de geração; fiquei com ${x.ficou} e deixei de fora ${x.saiu}. Vale conferir com o DP.`
            : `fiquei com ${x.ficou}${x.gerado ? ` (gerado em ${fmtData(x.gerado)} ${x.gerado.slice(11)})` : ''}, a mais nova; deixei de fora ${x.saiu}.`}`)} />
      )}
      {lote.erros.length > 0 && (
        <Bloco titulo={`Ficaram de fora (${lote.erros.length})`} alerta linhas={lote.erros.map(e => `${e.arquivo}: ${e.motivo}`)} />
      )}
      {!linhas.length && !lote.erros.length && <p className="text-muted-foreground">Nenhum arquivo era o relatório de banco de horas (HRBH102).</p>}
    </div>
  );
}

function Bloco({ titulo: t, linhas, alerta }: { titulo: string; linhas: string[]; alerta?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', alerta ? 'border-warning/35 bg-warning/[0.05]' : 'border-border bg-muted/20')}>
      <p className="mb-1 font-semibold text-foreground">{t}</p>
      {linhas.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
    </div>
  );
}

// ── Excel ────────────────────────────────────────────────────────────────────

export function DialogExcel({ aberto, onFechar, onBaixar, filtroTxt }: {
  aberto: boolean; onFechar: () => void; onBaixar: (abas: AbaExcel[]) => void; filtroTxt: string;
}) {
  const [quais, setQuais] = useState<Set<AbaExcel>>(new Set(ABAS_EXCEL.map(a => a.id)));
  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar para o Excel</DialogTitle>
          <DialogDescription>Uma aba para cada assunto. As horas saem no formato que o Excel soma, com filtro em cada coluna.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {ABAS_EXCEL.map(a => (
            <label key={a.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 hover:bg-muted/30">
              <Checkbox checked={quais.has(a.id)} className="mt-0.5"
                onCheckedChange={v => setQuais(q => { const n = new Set(q); if (v) n.add(a.id); else n.delete(a.id); return n; })} />
              <span>
                <span className="block text-[13px] font-medium text-foreground">{a.titulo}</span>
                <span className="block text-[11px] text-muted-foreground">{a.descricao}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="rounded-lg bg-muted/30 p-2.5 text-[12px] text-muted-foreground">
          {filtroTxt ? <>Vai sair só <b className="text-foreground">{filtroTxt}</b>, como está filtrado na tela.</> : 'Vai sair tudo o que você vê. Para um setor só, filtre o setor antes.'}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!quais.size} onClick={() => { onBaixar(ABAS_EXCEL.filter(a => quais.has(a.id)).map(a => a.id)); onFechar(); }}>
            <FileSpreadsheet className="h-4 w-4" /> Baixar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Imagem para e-mail ───────────────────────────────────────────────────────

const TODOS = '__todos__';

export function DialogImagem({ aberto, onFechar, visao, pessoas, setorInicial, modoInicial, limite, fotoDe }: {
  aberto: boolean; onFechar: () => void; visao: Visao; pessoas: Pessoa[]; setorInicial: string; modoInicial: ModoImagem;
  limite: number; fotoDe: (p: Pessoa) => string | null;
}) {
  const [setor, setSetor] = useState(setorInicial);
  const [modo, setModo] = useState<ModoImagem>(modoInicial);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setSetor(setorInicial); setModo(modoInicial); } }, [aberto, setorInicial, modoInicial]);
  const setores = [...new Set(pessoas.map(p => p.setor))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setPrevia(null);
    void desenharImagem({ visao, pessoas, setor, modo, limite, fotoDe }).then(cv => {
      if (cancelado) return;
      setCanvas(cv);
      try { setPrevia(cv.toDataURL('image/png')); } catch { setPrevia(null); }
    });
    return () => { cancelado = true; };
  }, [aberto, visao, pessoas, setor, modo, limite, fotoDe]);

  const blob = () => new Promise<Blob | null>(r => (canvas ? canvas.toBlob(r, 'image/png') : r(null)));
  const baixar = async () => { const b = await blob(); if (b) baixarArquivo(b, nomeDaImagem(setor, modo, visao.data)); };
  const copiar = async () => {
    try {
      const b = await blob();
      if (!b) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      toast.success('Imagem copiada. Cole no e-mail com Ctrl+V.');
    } catch {
      await baixar();
      toast.error('Este navegador não deixou copiar; baixei o PNG para anexar.');
    }
  };
  const baixarTodos = async () => {
    const lista = [...new Set(pessoas.filter(p => passaModo(p, modo)).map(p => p.setor))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    toast(`Gerando ${lista.length} imagens… o navegador pode pedir para permitir vários downloads.`);
    for (const s of lista) {
      const cv = await desenharImagem({ visao, pessoas, setor: s, modo, limite, fotoDe });
      const b = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
      if (b) baixarArquivo(b, nomeDaImagem(s, modo, visao.data));
      await new Promise(r => setTimeout(r, 350));
    }
    toast.success('Pronto: as imagens estão na pasta Downloads.');
  };

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> Imagem para e-mail</DialogTitle>
          <DialogDescription>Escolha o setor e o que mostrar. Depois copie e cole no e-mail, ou baixe para anexar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={setor || TODOS} onValueChange={x => setSetor(x === TODOS ? '' : x)}>
            <SelectTrigger className="h-8 w-64 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os setores (resumo)</SelectItem>
              {setores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Segmentado<ModoImagem> rotulo="O que mostrar" valor={modo} onTrocar={setModo} opcoes={MODOS_IMAGEM} />
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-border bg-muted/30 p-3">
          {previa ? <img src={previa} alt="Prévia da imagem" className="mx-auto w-full max-w-[960px] rounded-lg shadow-sm" />
            : <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Montando a imagem…</p>}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => void baixarTodos()} title="Um PNG para cada setor, com a opção escolhida">
            Baixar de todos os setores
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void baixar()} disabled={!canvas}><Download className="h-4 w-4" /> Baixar PNG</Button>
            <Button onClick={() => void copiar()} disabled={!canvas}><Copy className="h-4 w-4" /> Copiar imagem</Button>
          </div>
        </DialogFooter>
        <p className="text-[11px] text-muted-foreground">No Outlook ou no Gmail, clique no corpo do e-mail e aperte <b>Ctrl+V</b> depois de copiar.</p>
      </DialogContent>
    </Dialog>
  );
}
