/**
 * BibliotecaMidia — os GIFs e sons que o líder enviou.
 *
 * Some inteira quando a migration 20260731f não foi aplicada (`midias` null):
 * o catálogo em código cobre tudo, então não faz sentido mostrar um botão de
 * enviar que só resultaria em erro.
 */
import { useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Play, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tocarArquivoDeSom } from '@/lib/som-comemoracao';
import {
  enviarMidia, excluirMidia, LIMITE_GIF_BYTES, LIMITE_SOM_BYTES,
  type MidiaComemoracao, type TipoMidia,
} from '@/services/comemoracaoMidias.service';

const ACEITA: Record<TipoMidia, string> = {
  gif: 'image/gif,image/png,image/webp',
  som: 'audio/mpeg,audio/mp3,audio/wav,audio/ogg',
};

function limiteEmMB(tipo: TipoMidia): string {
  return `${(tipo === 'gif' ? LIMITE_GIF_BYTES : LIMITE_SOM_BYTES) / 1024 / 1024} MB`;
}

export function BibliotecaMidia({
  tipo, midias, empresaId, usuarioId, selecionadaId, onSelecionar, onMudou,
}: {
  tipo:          TipoMidia;
  /** null = migration pendente; o componente não renderiza. */
  midias:        MidiaComemoracao[] | null;
  empresaId:     string;
  usuarioId:     string;
  selecionadaId: string | null;
  onSelecionar:  (m: MidiaComemoracao | null) => void;
  onMudou:       () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  if (midias === null) return null;

  const doTipo = midias.filter((m) => m.tipo === tipo);

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const { ok, erro, dados } = await enviarMidia({ empresaId, criadoPor: usuarioId, tipo, arquivo });
      if (!ok || !dados) { toast.error(erro ?? 'Não foi possível enviar.'); return; }
      toast.success(`${tipo === 'gif' ? 'GIF' : 'Som'} salvo na biblioteca.`);
      onSelecionar(dados);
      onMudou();
    } finally {
      setEnviando(false);
    }
  }

  async function aoExcluir(m: MidiaComemoracao) {
    setExcluindoId(m.id);
    try {
      const { ok, erro } = await excluirMidia(m);
      if (!ok) { toast.error(erro ?? 'Não foi possível excluir.'); return; }
      // Estava escolhido: volta para o catálogo, senão a comemoração sairia
      // apontando para arquivo que não existe mais.
      if (selecionadaId === m.id) onSelecionar(null);
      onMudou();
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={ACEITA[tipo]}
        className="hidden"
        onChange={(e) => { void aoEscolherArquivo(e.target.files?.[0]); e.target.value = ''; }}
      />

      {doTipo.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {doTipo.map((m) => {
            const escolhida = selecionadaId === m.id;
            return (
              <div key={m.id}
                className={cn(
                  'group relative flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors',
                  escolhida ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}>
                <button type="button" onClick={() => onSelecionar(escolhida ? null : m)}
                  className="flex items-center gap-1.5">
                  {tipo === 'gif'
                    ? <img src={m.url} alt="" className="h-6 w-6 rounded object-cover" />
                    : <Play className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="max-w-[110px] truncate">{m.nome}</span>
                  {escolhida && <Check className="h-3 w-3 text-primary" />}
                </button>

                {tipo === 'som' && (
                  <button type="button" title="Ouvir"
                    onClick={() => tocarArquivoDeSom(m.url, true)}
                    className="text-muted-foreground hover:text-foreground">
                    <Play className="h-3 w-3" />
                  </button>
                )}

                <button type="button" title="Excluir da biblioteca"
                  disabled={excluindoId === m.id}
                  onClick={() => void aoExcluir(m)}
                  className="text-muted-foreground hover:text-destructive">
                  {excluindoId === m.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
        disabled={enviando} onClick={() => inputRef.current?.click()}>
        {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Enviar {tipo === 'gif' ? 'GIF' : 'som'}
        <span className="text-muted-foreground">até {limiteEmMB(tipo)}</span>
      </Button>
    </div>
  );
}
