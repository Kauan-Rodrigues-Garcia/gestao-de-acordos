/**
 * comum.tsx — as peças que as três telas do chat repetem.
 *
 * Nada aqui sabe de banco. São formas e formatos: o avatar com iniciais, a hora
 * curta, o balão de anexo. Ficam juntos para a bolha e a versão expandida
 * mostrarem exatamente a mesma coisa — duas cópias divergem no primeiro ajuste.
 */
import { useEffect, useState } from 'react';
import { FileText, ImageIcon, Music, Video, Download } from 'lucide-react';
import { urlDoAnexo, type AnexoChat } from '@/services/chat/chat.service';
import { cn } from '@/lib/utils';

// ── Avatar ───────────────────────────────────────────────────────────────────

export function AvatarChat({
  nome, foto, tamanho = 36, online = false,
}: {
  nome: string; foto: string | null; tamanho?: number; online?: boolean;
}) {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const estilo = { width: tamanho, height: tamanho };

  return (
    <div className="relative shrink-0" style={estilo}>
      {foto ? (
        <img src={foto} alt="" className="rounded-full object-cover w-full h-full" />
      ) : (
        <div
          className="rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground w-full h-full"
          style={{ fontSize: Math.max(10, tamanho * 0.34) }}
        >
          {iniciais || '?'}
        </div>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-2 ring-background"
          style={{ width: Math.max(8, tamanho * 0.28), height: Math.max(8, tamanho * 0.28) }}
        />
      )}
    </div>
  );
}

// ── Tempo ────────────────────────────────────────────────────────────────────

/**
 * Hora curta, do jeito que se lê de relance numa lista.
 *
 * Hoje mostra a hora; ontem, a palavra; nesta semana, o dia; antes disso, a
 * data. É a régua do WhatsApp e existe por um motivo: numa lista, «14:32» e
 * «23/07» respondem perguntas diferentes, e mostrar sempre a data completa
 * obriga a pessoa a calcular se aquilo foi agora ou no mês passado.
 */
export function horaCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const agora = new Date();
  const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.floor((meiaNoite.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);

  if (dias <= 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias === 1) return 'ontem';
  if (dias < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function horaDoBalao(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** «Hoje», «Ontem» ou a data — o separador entre os dias da conversa. */
export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const dias = Math.floor(
    (new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()
     - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function diaDaMensagem(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Anexos ───────────────────────────────────────────────────────────────────

function iconeDoTipo(tipo: string) {
  if (tipo.startsWith('image/')) return ImageIcon;
  if (tipo.startsWith('video/')) return Video;
  if (tipo.startsWith('audio/')) return Music;
  return FileText;
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Um anexo dentro do balão.
 *
 * O balde é privado, então a URL é assinada e pedida na hora — não dá para
 * montar o endereço no cliente. Imagem carrega o preview; o resto vira uma
 * linha com nome e tamanho. Enquanto a assinatura não volta, o espaço já fica
 * reservado, senão a conversa dá um salto quando a imagem aparece.
 */
export function AnexoNoBalao({ anexo, meu }: { anexo: AnexoChat; meu: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const ehImagem = anexo.tipo?.startsWith('image/');

  useEffect(() => {
    let vivo = true;
    void urlDoAnexo(anexo.url).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [anexo.url]);

  if (ehImagem) {
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer"
         className="block rounded-lg overflow-hidden bg-muted/40 max-w-[240px]">
        {url
          ? <img src={url} alt={anexo.nome} className="w-full h-auto max-h-64 object-cover" />
          : <div className="w-[240px] h-32 animate-pulse" />}
      </a>
    );
  }

  const Icone = iconeDoTipo(anexo.tipo ?? '');
  return (
    <a
      href={url ?? undefined} target="_blank" rel="noreferrer" download={anexo.nome}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 max-w-[240px] transition-colors',
        meu ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
            : 'bg-background/70 hover:bg-background',
      )}
    >
      <Icone className="w-4 h-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium truncate">{anexo.nome}</span>
        <span className="block text-[10px] opacity-60">{tamanhoLegivel(anexo.tamanho)}</span>
      </span>
      <Download className="w-3.5 h-3.5 shrink-0 opacity-50" />
    </a>
  );
}

// ── Emoji ────────────────────────────────────────────────────────────────────

/**
 * Uma lista curta, escolhida a dedo, em vez de uma biblioteca.
 *
 * Um seletor completo são centenas de KB e uma busca que ninguém usa para
 * mandar 👍. Estes são os que aparecem numa conversa de trabalho — e a pessoa
 * que quiser outro cola do teclado do sistema, que continua funcionando.
 */
export const EMOJIS = [
  '👍', '👏', '🙏', '💪', '🔥', '🎉', '✅', '❌',
  '😀', '😂', '🙂', '😉', '😍', '🤔', '😅', '😢',
  '😮', '😎', '🥳', '😴', '🤝', '👀', '💡', '⚠️',
  '❤️', '⭐', '📌', '📎', '📊', '💰', '⏰', '🚀',
] as const;
