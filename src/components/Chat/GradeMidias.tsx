/**
 * GradeMidias.tsx — a grade de fotos, GIFs e vídeos de UMA conversa.
 *
 * Nasceu dentro de `InfoGrupoPainel`, onde era a seção «galeria» do painel de
 * dados do grupo. Saiu de lá em 03/09/2026 porque a lista de conversas passou a
 * oferecer «ver mídia enviada» também na conversa DIRETA, que não tem painel de
 * dados nenhum — e duplicar a grade faria a próxima correção acontecer só num
 * dos dois lugares.
 *
 * O componente busca sozinho: recebe o id da conversa e cuida do carregamento,
 * do vazio e do visualizador. Quem usa só decide onde ele mora — uma seção do
 * painel deslizante, ou o corpo de um diálogo.
 *
 * A busca é do BANCO, e não das mensagens que a rolagem já carregou: a galeria
 * existe justamente para dispensar subir a conversa inteira atrás de uma foto
 * de três semanas atrás. Montá-la do que está na tela devolveria a última
 * página e mentiria por omissão.
 */
import { useEffect, useState } from 'react';
import { Images, Loader2, Play } from 'lucide-react';
import { listarMidias, type MidiaDaConversa } from '@/services/chat/grupos.service';
import type { AnexoChat } from '@/services/chat/chat.service';
import { useFotoResolvida } from './comum';
import { VisualizadorMidia } from './VisualizadorMidia';

interface Props {
  conversaId: string;
  /**
   * Buscar agora?
   *
   * São até 120 anexos com nome e autor. Num painel que abre em outra seção, ou
   * num diálogo fechado, carregar isso à toa faria toda abertura pagar por uma
   * tela que na maioria das vezes ninguém vê.
   */
  ativo: boolean;
}

export function GradeMidias({ conversaId, ativo }: Props) {
  const [midias, setMidias] = useState<MidiaDaConversa[] | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  // Trocar de conversa invalida a grade: ela é de UMA conversa.
  useEffect(() => { setMidias(null); setAberta(null); }, [conversaId]);

  useEffect(() => {
    if (!ativo || midias !== null) return;
    let cancelado = false;
    void listarMidias(conversaId).then(m => { if (!cancelado) setMidias(m); });
    return () => { cancelado = true; };
  }, [ativo, midias, conversaId]);

  if (!ativo) return null;

  if (midias === null) {
    return (
      <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a galeria…
      </p>
    );
  }

  if (midias.length === 0) {
    return (
      <div className="py-10 text-center">
        <Images aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Nenhuma foto, GIF ou vídeo nesta conversa ainda.
        </p>
      </div>
    );
  }

  const anexos: AnexoChat[] = midias.map(m => m.anexo);

  return (
    <>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {midias.map((m, i) => (
          <BotaoMidia key={`${m.mensagem_id}-${i}`} midia={m} onAbrir={() => setAberta(i)} />
        ))}
      </div>

      {/* O mesmo visualizador dos balões: zoom, setas e teclado já resolvidos. */}
      <VisualizadorMidia midias={anexos} inicial={aberta} onFechar={() => setAberta(null)} />
    </>
  );
}

/**
 * Uma casa da grade.
 *
 * O vídeo não ganha `<video>`: um grid com vinte players carregaria vinte
 * streams para mostrar vinte quadradinhos. Ele aparece como um bloco escuro com
 * o triângulo de play, e só vira vídeo de verdade dentro do visualizador.
 */
function BotaoMidia({ midia, onAbrir }: { midia: MidiaDaConversa; onAbrir: () => void }) {
  const url = useFotoResolvida(midia.anexo.url);
  const ehVideo = midia.anexo.tipo.startsWith('video/');

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${midia.autor_nome ?? 'Alguém'} · ${new Date(midia.criado_em).toLocaleDateString('pt-BR')}`}
      className="relative aspect-square overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-85"
    >
      {ehVideo ? (
        <span className="flex h-full w-full items-center justify-center bg-foreground/10">
          <Play className="h-5 w-5 text-foreground/60" />
        </span>
      ) : url ? (
        <img src={url} alt={midia.anexo.nome} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  );
}
