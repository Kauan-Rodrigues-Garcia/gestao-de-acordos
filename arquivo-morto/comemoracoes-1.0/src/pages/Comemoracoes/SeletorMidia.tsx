/**
 * SeletorMidia — a biblioteca de imagens, GIFs e áudios da empresa.
 *
 * **Dois campos, à vista ao mesmo tempo.** Antes eram três abas (GIFs,
 * Imagens, Áudios): quem montava via um terço da biblioteca por vez e
 * precisava saber de antemão se o troféu que procurava era GIF ou PNG — uma
 * distinção que não muda nada no card, já que o slot visual é um só. Agora
 * imagem e GIF dividem a mesma grade, os áudios ficam logo abaixo, e o botão
 * de importar do campo visual aceita os dois formatos.
 *
 * `gif` e `imagem` continuam separados no BANCO: validade, cota de fixados e
 * MIME aceito são por tipo. Quem decide em qual gaveta o arquivo cai é o MIME
 * dele (`validarArquivoDoGrupo`), não mais a aba onde a pessoa clicou.
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
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tocarPrevia, ouvirPrevia, urlTocando, pausarPrevia } from '@/lib/previaSom';
import {
  enviarMidia, excluirMidia, fixarMidia, validarArquivoDoGrupo, mimesDoGrupo,
  diasAteExpirar, LIMITE_BYTES, MAX_MIDIAS, MAX_FIXADAS_POR_TIPO, NOME_TIPO,
  NOME_GRUPO, TIPOS_DO_GRUPO,
  type MidiaComemoracao, type TipoMidia, type GrupoMidia,
} from '@/services/comemoracaoMidias.service';
import { EditorTrecho } from './EditorTrecho';
import { formatarSegundos } from './trechoAudio';

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
  const inputVisualRef = useRef<HTMLInputElement>(null);
  const inputSomRef    = useRef<HTMLInputElement>(null);
  /** Qual dos dois botões está subindo — o outro continua clicável. */
  const [enviando, setEnviando] = useState<GrupoMidia | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  /** Som aguardando a escolha do trecho — ainda não subiu. */
  const [aguardandoTrecho, setAguardandoTrecho] = useState<File | null>(null);
  const [tocando, setTocando] = useState<string | null>(() => urlTocando());

  useEffect(() => ouvirPrevia(setTocando), []);
  // Sair da tela com música tocando deixaria o som órfão, sem botão de pausa.
  useEffect(() => () => pausarPrevia(), []);

  const visuais = useMemo(
    () => (midias ?? []).filter((m) => TIPOS_DO_GRUPO.visual.includes(m.tipo)),
    [midias],
  );
  const sons = useMemo(
    () => (midias ?? []).filter((m) => m.tipo === 'som'),
    [midias],
  );
  /** Fixados por TIPO: a cota do banco é por tipo, não por campo da tela. */
  const fixadasPorTipo = useMemo(() => {
    const conta = { gif: 0, imagem: 0, som: 0 } as Record<TipoMidia, number>;
    for (const m of midias ?? []) if (m.fixada) conta[m.tipo] += 1;
    return conta;
  }, [midias]);

  if (midias === null) return null;

  const total  = midias.length;
  const lotado = total >= MAX_MIDIAS;

  async function subir(arquivo: File, tipo: TipoMidia, inicio?: number) {
    const grupo: GrupoMidia = tipo === 'som' ? 'som' : 'visual';
    setEnviando(grupo);
    try {
      const { ok, erro, dados } = await enviarMidia({
        empresaId, criadoPor: usuarioId, tipo, arquivo, inicioS: inicio,
      });
      if (!ok || !dados) { toast.error(erro ?? 'Não foi possível enviar.'); return; }
      toast.success(`${NOME_TIPO[tipo]} salvo na biblioteca.`);
      if (tipo === 'som') onEscolherSom(dados); else onEscolherVisual(dados);
      onMudou();
      setAguardandoTrecho(null);
    } finally {
      setEnviando(null);
    }
  }

  function aoEscolherArquivo(arquivo: File | undefined, grupo: GrupoMidia) {
    if (!arquivo) return;
    // Valida ANTES de abrir o editor de trecho: não faz sentido escolher o
    // pedaço de um arquivo que vai ser recusado por tamanho ou formato.
    const { tipo, erro } = validarArquivoDoGrupo(arquivo, grupo);
    if (erro) { toast.error(erro); return; }

    if (tipo === 'som') { setAguardandoTrecho(arquivo); return; }
    void subir(arquivo, tipo);
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

  /** Miniatura, com o que ela precisa saber do estado do seletor. */
  const item = (m: MidiaComemoracao) => (
    <ItemMidia
      key={m.id}
      m={m}
      escolhida={m.tipo === 'som' ? som?.id === m.id : visual?.id === m.id}
      ocupada={ocupadoId === m.id}
      tocando={tocando}
      fixadasDoTipo={fixadasPorTipo[m.tipo]}
      duracaoComemoracaoS={duracaoComemoracaoS}
      onEscolher={() => alternarEscolha(m)}
      onFixar={() => void aoFixar(m)}
      onExcluir={() => void aoExcluir(m)}
    />
  );

  /** Botão de importar de um campo. Um por slot, e o do visual aceita os dois. */
  const botaoEnviar = (grupo: GrupoMidia, aoClicar: () => void) => (
    <Button
      type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
      disabled={!!enviando || lotado}
      title={lotado ? `Biblioteca cheia (${MAX_MIDIAS}). Exclua algo ou espere expirar.` : undefined}
      onClick={aoClicar}
    >
      {enviando === grupo
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Upload className="h-3.5 w-3.5" />}
      Importar {NOME_GRUPO[grupo]}
      <span className="text-muted-foreground">até {LIMITE_BYTES / 1024 / 1024} MB</span>
    </Button>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-2">
      <input
        ref={inputVisualRef} type="file" className="hidden"
        accept={mimesDoGrupo('visual')}
        onChange={(e) => { aoEscolherArquivo(e.target.files?.[0], 'visual'); e.target.value = ''; }}
      />
      <input
        ref={inputSomRef} type="file" className="hidden"
        accept={mimesDoGrupo('som')}
        onChange={(e) => { aoEscolherArquivo(e.target.files?.[0], 'som'); e.target.value = ''; }}
      />

      {aguardandoTrecho && (
        <EditorTrecho
          arquivo={aguardandoTrecho}
          enviando={enviando === 'som'}
          duracaoComemoracaoS={duracaoComemoracaoS}
          onConfirmar={(inicio) => void subir(aguardandoTrecho, 'som', inicio)}
          onCancelar={() => setAguardandoTrecho(null)}
        />
      )}

      {/* ── Campo visual: imagens e GIFs juntos ── */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Imagens e GIFs
          </h3>
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

        {visuais.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
            Nenhuma imagem ou GIF ainda.
          </p>
        ) : (
          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {visuais.map(item)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {botaoEnviar('visual', () => inputVisualRef.current?.click())}
          {/* Limpar o slot sem precisar caçar o item escolhido na grade. */}
          {visual && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px]"
              onClick={() => onEscolherVisual(null)}>
              <X className="h-3 w-3" /> Sem imagem
            </Button>
          )}
        </div>
      </section>

      {/* ── Campo de áudio, logo abaixo ── */}
      <section className="space-y-1.5 border-t border-border/60 pt-2.5">
        <div className="flex items-center gap-1.5">
          <Music className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Áudios
          </h3>
        </div>

        {sons.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
            Nenhum áudio ainda — vale o som do catálogo.
          </p>
        ) : (
          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {sons.map(item)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {botaoEnviar('som', () => inputSomRef.current?.click())}
          {som && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px]"
              onClick={() => onEscolherSom(null)}>
              <X className="h-3 w-3" /> Usar som do catálogo
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Uma miniatura da grade — o mesmo cartão nos dois campos.
 *
 * Fora do `SeletorMidia` de propósito: componente declarado dentro de outro
 * ganha identidade nova a cada render, e o React remonta a árvore inteira —
 * aqui isso significaria as imagens recarregando a cada clique.
 */
interface ItemMidiaProps {
  m:             MidiaComemoracao;
  escolhida:     boolean;
  ocupada:       boolean;
  tocando:       string | null;
  fixadasDoTipo: number;
  duracaoComemoracaoS: number;
  onEscolher: () => void;
  onFixar:    () => void;
  onExcluir:  () => void;
}

function ItemMidia({
  m, escolhida, ocupada, tocando, fixadasDoTipo, duracaoComemoracaoS,
  onEscolher, onFixar, onExcluir,
}: ItemMidiaProps) {
  const dias = diasAteExpirar(m);

  return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg border transition-colors',
          escolhida ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50',
        )}
      >
        <button
          type="button"
          onClick={onEscolher}
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
              : `Manter salvo (${fixadasDoTipo}/${MAX_FIXADAS_POR_TIPO} ${NOME_TIPO[m.tipo]} fixados)`}
            aria-label={m.fixada ? `Desafixar ${m.nome}` : `Fixar ${m.nome}`}
            onClick={onFixar}
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
            onClick={onExcluir}
            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
          >
            {ocupada
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      </div>
    );
}
