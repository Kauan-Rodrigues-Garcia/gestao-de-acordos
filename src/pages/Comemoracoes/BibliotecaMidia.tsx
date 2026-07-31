/**
 * BibliotecaMidia — os GIFs e sons que o líder enviou.
 *
 * Some inteira quando a migration 20260731f não foi aplicada (`midias` null):
 * o catálogo em código cobre tudo, então não faz sentido mostrar um botão de
 * enviar que só resultaria em erro.
 */
import { useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Play, Check, Music } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tocarArquivoDeSom } from '@/lib/som-comemoracao';
import {
  enviarMidia, excluirMidia, validarArquivo, LIMITE_GIF_BYTES, LIMITE_SOM_BYTES,
  type MidiaComemoracao, type TipoMidia,
} from '@/services/comemoracaoMidias.service';
import { EditorTrecho } from './EditorTrecho';
import { formatarSegundos, type Trecho } from './trechoAudio';

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
  /** Som aguardando a escolha do trecho — ainda não subiu. */
  const [aguardandoTrecho, setAguardandoTrecho] = useState<File | null>(null);

  if (midias === null) return null;

  const doTipo = midias.filter((m) => m.tipo === tipo);

  async function subir(arquivo: File, trecho?: Trecho | null) {
    setEnviando(true);
    try {
      const { ok, erro, dados } = await enviarMidia({
        empresaId, criadoPor: usuarioId, tipo, arquivo, trecho,
      });
      if (!ok || !dados) { toast.error(erro ?? 'Não foi possível enviar.'); return; }
      toast.success(`${tipo === 'gif' ? 'GIF' : 'Som'} salvo na biblioteca.`);
      onSelecionar(dados);
      onMudou();
      setAguardandoTrecho(null);
    } finally {
      setEnviando(false);
    }
  }

  function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;

    // Valida ANTES de abrir o editor de trecho: não faz sentido escolher o
    // pedaço de um arquivo que vai ser recusado por tamanho ou formato.
    const problema = validarArquivo(arquivo, tipo);
    if (problema) { toast.error(problema); return; }

    // Som passa pelo editor de trecho; GIF sobe direto.
    if (tipo === 'som') { setAguardandoTrecho(arquivo); return; }
    void subir(arquivo);
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
        onChange={(e) => { aoEscolherArquivo(e.target.files?.[0]); e.target.value = ''; }}
      />

      {aguardandoTrecho && (
        <EditorTrecho
          arquivo={aguardandoTrecho}
          enviando={enviando}
          onConfirmar={(trecho) => void subir(aguardandoTrecho, trecho)}
          onCancelar={() => setAguardandoTrecho(null)}
        />
      )}

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
                    : <Music className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="max-w-[110px] truncate">{m.nome}</span>
                  {/* Trecho salvo: mostra o pedaço que vai tocar. */}
                  {tipo === 'som' && !!m.trecho_s && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatarSegundos(m.inicio_s ?? 0)} · {Math.round(m.trecho_s)}s
                    </span>
                  )}
                  {escolhida && <Check className="h-3 w-3 text-primary" />}
                </button>

                {tipo === 'som' && (
                  <button type="button" title="Ouvir o trecho"
                    onClick={() => tocarArquivoDeSom(
                      m.url, true,
                      m.trecho_s ? { inicio: m.inicio_s ?? 0, duracao: m.trecho_s } : null,
                    )}
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
