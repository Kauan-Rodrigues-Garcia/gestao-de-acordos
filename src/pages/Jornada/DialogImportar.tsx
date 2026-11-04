/**
 * Importar NRs que a pessoa já tem: colar a lista (do Excel, do bloco de
 * notas…) ou escolher um .csv/.txt. Mostra o que reconheceu antes de gravar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { ItemImportado, ResultadoLote, TipoJornada } from '@/services/jornada/jornada.service';
import { TEXTOS } from './jornada';
import { lerLista } from './importar';

export function DialogImportar({
  aberto, aoFechar, tipo, hoje, aoImportar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  tipo: TipoJornada;
  hoje: string;
  aoImportar: (itens: ItemImportado[]) => Promise<ResultadoLote>;
}) {
  const textos = TEXTOS[tipo];
  const [texto, setTexto] = useState('');
  const [dataPadrao, setDataPadrao] = useState(hoje);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setTexto('');
    setArquivo(null);
    setDataPadrao(hoje);
  }, [aberto, hoje]);

  const leitura = useMemo(() => lerLista(texto, dataPadrao || hoje, hoje), [texto, dataPadrao, hoje]);
  const avisos = [
    leitura.repetidosNaLista && `${leitura.repetidosNaLista} repetido(s) na lista`,
    leitura.futuras && `${leitura.futuras} com data futura`,
    leitura.ignoradas && `${leitura.ignoradas} linha(s) sem NR válido`,
  ].filter(Boolean);

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) {
      toast.error('Use .csv ou .txt. No Excel: Salvar como › CSV, ou copie a coluna e cole aqui.');
      return;
    }
    setTexto(await f.text());
    setArquivo(f.name);
  }

  async function importar() {
    if (leitura.itens.length === 0) return;
    setGravando(true);
    try {
      const r = await aoImportar(leitura.itens);
      const partes = [`${r.inseridos} lançado(s)`];
      if (r.repetidos) partes.push(`${r.repetidos} já lançado(s) neste mês`);
      if (r.invalidos) partes.push(`${r.invalidos} inválido(s)`);
      (r.inseridos ? toast.success : toast.warning)(partes.join(' · '));
      aoFechar();
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !gravando) aoFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar {textos.unidade}</DialogTitle>
          <DialogDescription>
            Um NR por linha. A data ao lado é opcional — sem ela, vale a data abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            autoFocus
            value={texto}
            onChange={e => { setTexto(e.target.value); setArquivo(null); }}
            placeholder={'12345678\n87654321;03/11/2026\n…'}
            className="h-40 font-mono text-sm resize-none"
            disabled={gravando}
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={seletor}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={e => { void escolherArquivo(e.target.files?.[0]); e.target.value = ''; }}
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => seletor.current?.click()} disabled={gravando}>
              <FileUp className="h-3.5 w-3.5" /> Escolher arquivo
            </Button>
            {arquivo && <span className="text-xs text-muted-foreground truncate max-w-[160px]">{arquivo}</span>}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              Data sem data
              <Input
                type="date"
                value={dataPadrao}
                max={hoje}
                onChange={e => setDataPadrao(e.target.value)}
                className="h-8 w-[136px]"
                disabled={gravando}
              />
            </label>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-semibold tabular-nums">{leitura.itens.length}</span>{' '}
            NR(s) para importar
            {avisos.length > 0 && <span className="text-muted-foreground"> · {avisos.join(' · ')}</span>}
            <p className="text-xs text-muted-foreground mt-0.5">
              NR já lançado neste mês em {textos.titulo}, por qualquer pessoa, não entra de novo.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={aoFechar} disabled={gravando}>Cancelar</Button>
          <Button type="button" onClick={importar} disabled={gravando || leitura.itens.length === 0}>
            {gravando && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar {leitura.itens.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
