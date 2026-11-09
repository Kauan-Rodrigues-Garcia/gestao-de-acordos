/**
 * Anexos.tsx — os arquivos de uma manifestação: print da conversa,
 * comprovante, áudio da ligação, PDF, planilha.
 *
 * Enviar: botão, arrastar para o cartão, ou colar um print (Ctrl+V) com o
 * cartão em foco. Até 15 MB por arquivo. Imagens aparecem em miniatura;
 * áudio toca ali mesmo. O balde é privado: cada abertura gera um link de 10 min.
 *
 * Sem a migration 20261109180000 no banco, o cartão não aparece.
 */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, ExternalLink, FileAudio, FileImage, FileSpreadsheet, FileText, File as IconeArquivo, Loader2,
  Paperclip, Play, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ANEXO_MAX_BYTES, anexarArquivo, linkDoAnexo, linksDeMiniatura, listarAnexos, tirarAnexo,
} from '@/services/ouvidoriaCofen.service';
import { useOuvidoria } from './contexto';
import type { Anexo, Manifestacao } from './ouvidoria';

function tamanhoBr(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const ehImagem = (a: Pick<Anexo, 'tipo'>) => !!a.tipo?.startsWith('image/');
const ehAudio = (a: Pick<Anexo, 'tipo'>) => !!a.tipo?.startsWith('audio/');

function IconeDoTipo({ a, className }: { a: Anexo; className?: string }) {
  const t = a.tipo ?? '';
  const Icone = t.startsWith('image/') ? FileImage
    : t.startsWith('audio/') ? FileAudio
      : /sheet|excel/.test(t) ? FileSpreadsheet
        : /pdf|word|text/.test(t) ? FileText : IconeArquivo;
  return <Icone className={className} />;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', ' às');
}

export function CartaoAnexos({ m }: { m: Manifestacao }) {
  const qc = useQueryClient();
  const { meuId, setor, recarregar } = useOuvidoria();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [tirando, setTirando] = useState<string | null>(null);
  const [tocando, setTocando] = useState<Record<string, string>>({});

  const anexos = useQuery({
    queryKey: ['ouvidoria-anexos', m.id, m.atualizado_em],
    queryFn: () => listarAnexos(m.id),
    staleTime: 60_000,
  });
  const lista = anexos.data ?? [];
  const imagens = lista.filter(ehImagem).map(a => a.caminho);
  const miniaturas = useQuery({
    queryKey: ['ouvidoria-miniaturas', imagens.join('|')],
    queryFn: () => linksDeMiniatura(imagens),
    enabled: imagens.length > 0,
    staleTime: 8 * 60_000,
  });

  if (anexos.data === null) return null; // banco sem a parte 3

  async function enviar(arquivos: File[]) {
    const bons = arquivos.filter(f => {
      if (f.size > ANEXO_MAX_BYTES) { toast.error(`«${f.name}» passa de 15 MB.`); return false; }
      return true;
    });
    for (const f of bons) {
      setEnviando(f.name);
      try {
        await anexarArquivo(m, f);
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
    setEnviando(null);
    if (bons.length) {
      toast.success(bons.length === 1 ? 'Anexo enviado.' : `${bons.length} anexos enviados.`);
      await qc.invalidateQueries({ queryKey: ['ouvidoria-anexos', m.id] });
      recarregar();
    }
  }

  async function abrir(a: Anexo, baixar = false) {
    try {
      const url = await linkDoAnexo(a, baixar);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function ouvir(a: Anexo) {
    try {
      const url = await linkDoAnexo(a);
      setTocando(t => ({ ...t, [a.id]: url }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function tirar(a: Anexo) {
    if (!window.confirm(`Tirar o anexo «${a.nome}»? O arquivo é apagado.`)) return;
    setTirando(a.id);
    try {
      await tirarAnexo(a);
      toast.success('Anexo tirado.');
      await qc.invalidateQueries({ queryKey: ['ouvidoria-anexos', m.id] });
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTirando(null);
    }
  }

  return (
    <section
      tabIndex={0}
      aria-label="Anexos — arraste arquivos ou cole um print aqui"
      onDragOver={e => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={e => { e.preventDefault(); setArrastando(false); void enviar([...e.dataTransfer.files]); }}
      onPaste={e => {
        const arquivos = [...e.clipboardData.files];
        if (!arquivos.length) return;
        e.preventDefault();
        // Print colado vem sem nome: dá um com a hora.
        void enviar(arquivos.map(f => (f.name && f.name !== 'image.png') ? f
          : new File([f], `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: f.type })));
      }}
      className={cn(
        'rounded-xl border bg-card p-4 space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
        arrastando && 'border-primary border-dashed bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2 min-h-7">
        <span className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Paperclip className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold flex-1">
          Anexos {lista.length > 0 && <span className="text-muted-foreground font-normal">({lista.length})</span>}
        </h3>
        <input ref={entrada} type="file" multiple className="hidden"
               accept="image/*,application/pdf,audio/*,video/mp4,.doc,.docx,.xls,.xlsx,.txt"
               onChange={e => { void enviar([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!enviando} onClick={() => entrada.current?.click()}>
          {enviando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
          Anexar
        </Button>
      </div>

      {enviando && <p className="text-[11px] text-muted-foreground">Enviando «{enviando}»…</p>}

      {anexos.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <button type="button" onClick={() => entrada.current?.click()}
                className="w-full rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground hover:bg-muted/40">
          Arraste o arquivo aqui, cole um print (Ctrl+V) ou clique para escolher.
          <span className="block text-[10px] mt-0.5">Imagem, PDF, áudio, Word, Excel ou texto · até 15 MB</span>
        </button>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map(a => {
            const mini = ehImagem(a) ? miniaturas.data?.[a.caminho] : undefined;
            const podeTirar = a.criado_por === meuId || setor.pode_gerir;
            return (
              <li key={a.id} className="rounded-lg border bg-background overflow-hidden">
                {mini && (
                  <button type="button" onClick={() => void abrir(a)} className="block w-full bg-muted/40">
                    <img src={mini} alt={a.nome} className="h-28 w-full object-cover" loading="lazy" />
                  </button>
                )}
                <div className="flex items-center gap-2 px-2.5 py-2">
                  {!mini && <IconeDoTipo a={a} className="h-5 w-5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" title={a.nome}>{a.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {[tamanhoBr(a.tamanho), a.criado_por_nome, quando(a.criado_em)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {ehAudio(a) && !tocando[a.id] && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Ouvir ${a.nome}`} onClick={() => void ouvir(a)}>
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Abrir ${a.nome}`} onClick={() => void abrir(a)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Baixar ${a.nome}`} onClick={() => void abrir(a, true)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {podeTirar && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            aria-label={`Tirar ${a.nome}`} disabled={tirando === a.id} onClick={() => void tirar(a)}>
                      {tirando === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
                {tocando[a.id] && (
                  <audio controls autoPlay src={tocando[a.id]} className="w-full h-9 px-2 pb-2">
                    <track kind="captions" />
                  </audio>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
