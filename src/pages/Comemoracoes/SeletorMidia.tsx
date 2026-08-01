/**
 * SeletorMidia — a biblioteca de GIFs, imagens e sons da empresa.
 *
 * Substitui a fileira de chips da fase 2, que funcionava com três arquivos e
 * ficava ilegível com trinta. Aqui são abas por tipo e uma grade de
 * miniaturas — dá para achar o troféu animado sem passar pelas fotos da equipe.
 *
 * **Um slot visual, um slot de som.** O card tem uma única mídia, então
 * escolher uma imagem limpa o GIF e vice-versa. A exclusão mútua é da
 * estrutura, não uma regra que alguém precisa lembrar de aplicar.
 *
 * Some inteiro quando a migration da biblioteca não foi aplicada (`midias`
 * null): o catálogo em código cobre tudo, e um botão de enviar que só dá erro
 * é pior que a ausência dele.
 */
import { useRef, useState, useEffect, useMemo } from 'react';
import {
  Upload, Trash2, Loader2, Play, Pause, Music, Pin, PinOff, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tocarPrevia, ouvirPrevia, urlTocando, pausarPrevia } from '@/lib/previaSom';
import {
  enviarMidia, excluirMidia, fixarMidia, validarArquivo, mimesAceitos,
  diasAteExpirar, LIMITE_BYTES, MAX_MIDIAS, MAX_FIXADAS_POR_TIPO, NOME_TIPO,
  type MidiaComemoracao, type TipoMidia,
} from '@/services/comemoracaoMidias.service';
import { EditorTrecho } from './EditorTrecho';
import { formatarSegundos } from './trechoAudio';

const ABAS: readonly { tipo: TipoMidia; rotulo: string }[] = [
  { tipo: 'gif',    rotulo: 'GIFs' },
  { tipo: 'imagem', rotulo: 'Imagens' },
  { tipo: 'som',    rotulo: 'Áudios' },
];

export interface SeletorMidiaProps {
  /** null = migration 20260731f pendente; o componente não renderiza. */
  midias:        MidiaComemoracao[] | null;
  empresaId:     string;
  usuarioId:     string;
  /** GIF ou imagem escolhida — o slot visual do card. */
  visual:        MidiaComemoracao | null;
  som:           MidiaComemoracao | null;
  onEscolherVisual: (m: MidiaComemoracao | null) => void;
  onEscolherSom:    (m: MidiaComemoracao | null) => void;
  /** Por quanto tempo a música toca na prévia — é a duração da comemoração. */
  duracaoComemoracaoS: number;
  onMudou:       () => void;
}

export function SeletorMidia({
  midias, empresaId, usuarioId, visual, som,
  onEscolherVisual, onEscolherSom, duracaoComemoracaoS, onMudou,
}: SeletorMidiaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [aba, setAba] = useState<TipoMidia>('gif');
  const [enviando, setEnviando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  /** Som aguardando a escolha do trecho — ainda não subiu. */
  const [aguardandoTrecho, setAguardandoTrecho] = useState<File | null>(null);
  const [tocando, setTocando] = useState<string | null>(() => urlTocando());

  useEffect(() => ouvirPrevia(setTocando), []);
  // Sair da tela com música tocando deixaria o som órfão, sem botão de pausa.
  useEffect(() => () => pausarPrevia(), []);

  const daAba = useMemo(
    () => (midias ?? []).filter((m) => m.tipo === aba),
    [midias, aba],
  );

  if (midias === null) return null;

  const total   = midias.length;
  const lotado  = total >= MAX_MIDIAS;
  const fixadas = daAba.filter((m) => m.fixada).length;

  async function subir(arquivo: File, inicio?: number) {
    setEnviando(true);
    try {
      const { ok, erro, dados } = await enviarMidia({
        empresaId, criadoPor: usuarioId, tipo: aba, arquivo, inicioS: inicio,
      });
      if (!ok || !dados) { toast.error(erro ?? 'Não foi possível enviar.'); return; }
      toast.success(`${NOME_TIPO[aba]} salvo na biblioteca.`);
      if (aba === 'som') onEscolherSom(dados); else onEscolherVisual(dados);
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
    const problema = validarArquivo(arquivo, aba);
    if (problema) { toast.error(problema); return; }

    if (aba === 'som') { setAguardandoTrecho(arquivo); return; }
    void subir(arquivo);
  }

  /** Escolher no slot certo, e desmarcar clicando de novo. */
  function alternarEscolha(m: MidiaComemoracao) {
    if (m.tipo === 'som') {
      onEscolherSom(som?.id === m.id ? null : m);
      return;
    }
    // Um slot visual só: escolher imagem apaga o GIF e vice-versa, sem a
    // pessoa precisar limpar o anterior.
    onEscolherVisual(visual?.id === m.id ? null : m);
  }

  async function aoFixar(m: MidiaComemoracao) {
    setOcupadoId(m.id);
    try {
      const { ok, erro } = await fixarMidia(m.id, !m.fixada);
      if (!ok) { toast.error(erro ?? 'Não foi possível fixar.'); return; }
      toast.success(m.fixada
        ? `${NOME_TIPO[m.tipo]} volta a expirar em 3 dias.`
        : `${NOME_TIPO[m.tipo]} fixado — não expira mais.`);
      onMudou();
    } finally {
      setOcupadoId(null);
    }
  }

  async function aoExcluir(m: MidiaComemoracao) {
    setOcupadoId(m.id);
    try {
      const { ok, erro } = await excluirMidia(m);
      if (!ok) { toast.error(erro ?? 'Não foi possível excluir.'); return; }
      // Estava escolhida: volta para o catálogo, senão a comemoração sairia
      // apontando para arquivo que não existe mais.
      if (visual?.id === m.id) onEscolherVisual(null);
      if (som?.id === m.id)    onEscolherSom(null);
      if (tocando === m.url)   pausarPrevia();
      onMudou();
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
      <input
        ref={inputRef}
        type="file"
        accept={mimesAceitos(aba)}
        className="hidden"
        onChange={(e) => { aoEscolherArquivo(e.target.files?.[0]); e.target.value = ''; }}
      />

      {aguardandoTrecho && (
        <EditorTrecho
          arquivo={aguardandoTrecho}
          enviando={enviando}
          duracaoComemoracaoS={duracaoComemoracaoS}
          onConfirmar={(inicio) => void subir(aguardandoTrecho, inicio)}
          onCancelar={() => setAguardandoTrecho(null)}
        />
      )}

      {/* Abas + contador da cota */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ABAS.map(({ tipo, rotulo }) => (
          <button
            key={tipo}
            type="button"
            onClick={() => setAba(tipo)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              aba === tipo
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {rotulo}
          </button>
        ))}

        {/* O contador é a defesa contra a faxina falhar em silêncio: se o
            pg_cron não estiver rodando, o número sobe e alguém vê. */}
        <span
          title={`Biblioteca da empresa: ${total} de ${MAX_MIDIAS} arquivos.`}
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
            lotado ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          {total}/{MAX_MIDIAS}
        </span>
      </div>

      {/* Grade */}
      {daAba.length === 0 ? (
        <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
          Nenhum arquivo aqui ainda.
        </p>
      ) : (
        <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {daAba.map((m) => {
            const escolhida = m.tipo === 'som' ? som?.id === m.id : visual?.id === m.id;
            const dias      = diasAteExpirar(m);
            const ocupada   = ocupadoId === m.id;

            return (
              <div
                key={m.id}
                className={cn(
                  'group relative overflow-hidden rounded-lg border transition-colors',
                  escolhida ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => alternarEscolha(m)}
                  aria-pressed={escolhida}
                  className="block w-full text-left"
                >
                  {m.tipo === 'som' ? (
                    <div className="flex h-14 items-center justify-center bg-muted/50">
                      <Music className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ) : (
                    <img src={m.url} alt="" className="h-14 w-full bg-muted/50 object-contain" />
                  )}
                  <span className="block truncate px-1.5 pb-0.5 pt-1 text-[10px] font-medium">
                    {m.nome}
                  </span>
                  <span className="block px-1.5 pb-1 text-[9px] text-muted-foreground">
                    {m.tipo === 'som' && !!m.inicio_s && `de ${formatarSegundos(m.inicio_s)} · `}
                    {m.fixada ? 'fixado' : dias === 0 ? 'expira hoje' : `expira em ${dias}d`}
                  </span>
                </button>

                {/* Ações — sempre visíveis no toque, destacadas no hover. */}
                <div className="absolute right-0.5 top-0.5 flex gap-0.5 rounded-md bg-background/85 p-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                  {m.tipo === 'som' && (
                    <button
                      type="button"
                      title={tocando === m.url ? 'Pausar' : 'Ouvir como vai tocar'}
                      aria-label={tocando === m.url ? `Pausar ${m.nome}` : `Ouvir ${m.nome}`}
                      onClick={() => tocarPrevia(m.url, {
                        inicio: m.inicio_s ?? 0, duracao: duracaoComemoracaoS,
                      })}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {tocando === m.url ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={ocupada}
                    title={m.fixada
                      ? 'Deixar expirar em 3 dias'
                      : `Manter salvo (${fixadas}/${MAX_FIXADAS_POR_TIPO} fixados)`}
                    aria-label={m.fixada ? `Desafixar ${m.nome}` : `Fixar ${m.nome}`}
                    onClick={() => void aoFixar(m)}
                    className={cn(
                      'rounded p-0.5 hover:text-foreground',
                      m.fixada ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {m.fixada ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                  </button>

                  <button
                    type="button"
                    disabled={ocupada}
                    title="Excluir da biblioteca"
                    aria-label={`Excluir ${m.nome}`}
                    onClick={() => void aoExcluir(m)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    {ocupada
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
          disabled={enviando || lotado}
          title={lotado ? `Biblioteca cheia (${MAX_MIDIAS}). Exclua algo ou espere expirar.` : undefined}
          onClick={() => inputRef.current?.click()}
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Enviar {NOME_TIPO[aba]}
          <span className="text-muted-foreground">
            até {LIMITE_BYTES / 1024 / 1024} MB
          </span>
        </Button>

        {/* Limpar o slot sem precisar caçar o item escolhido na grade. */}
        {aba === 'som'
          ? som && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px]"
              onClick={() => onEscolherSom(null)}>
              <X className="h-3 w-3" /> Usar som do catálogo
            </Button>
          )
          : visual && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px]"
              onClick={() => onEscolherVisual(null)}>
              <X className="h-3 w-3" /> Sem imagem
            </Button>
          )}
      </div>
    </div>
  );
}
