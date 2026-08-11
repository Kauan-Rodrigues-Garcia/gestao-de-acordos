/**
 * SeletorEmoji — o menu de emoji da caixa de mensagem do chat (PaguePlay).
 *
 * Um botão ao lado do campo abre uma grade em popover. Clicar insere na posição
 * do cursor e MANTÉM o menu aberto: mandar "🎉🎉🎉" é um caso comum e reabrir o
 * menu a cada emoji seria hostil. Fecha com Esc, clique fora ou o botão.
 *
 * A lógica (recentes, inserção no texto) vive em `emojis.ts`, que tem teste. Aqui
 * só sobra o desenho.
 */
import { useState, useCallback } from 'react';
import { Smile } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  GRUPOS_EMOJI, lerRecentes, salvarRecentes, registrarRecente,
} from './emojis';

export function SeletorEmoji({
  onEscolher, disabled = false,
}: {
  /** Recebe o emoji cru. Quem chama decide onde ele entra. */
  onEscolher: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto]     = useState(false);
  const [grupoId, setGrupoId]   = useState(GRUPOS_EMOJI[0].id);
  // Lê do storage uma vez, na montagem: reler a cada abertura só custaria I/O
  // para devolver o que já está na memória desta aba.
  const [recentes, setRecentes] = useState<string[]>(() => lerRecentes());

  const grupo = GRUPOS_EMOJI.find(g => g.id === grupoId) ?? GRUPOS_EMOJI[0];

  const escolher = useCallback((emoji: string) => {
    onEscolher(emoji);
    setRecentes(atuais => {
      const nova = registrarRecente(atuais, emoji);
      salvarRecentes(nova);
      return nova;
    });
  }, [onEscolher]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Emojis"
          aria-label="Abrir o menu de emojis"
          className={cn(
            'h-9 w-9 shrink-0 rounded-md inline-flex items-center justify-center',
            'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'disabled:opacity-50 disabled:pointer-events-none',
            aberto && 'text-primary bg-accent',
          )}
        >
          <Smile className="w-[18px] h-[18px]" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-[292px] p-0 overflow-hidden"
        // O campo de texto perde o foco ao abrir o popover; devolver o foco na
        // hora faria o popover fechar sozinho. Quem recoloca o cursor é o
        // `onEscolher`, depois de inserir.
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {recentes.length > 0 && (
          <div className="px-2.5 pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
              Recentes
            </p>
            <Grade itens={recentes} onEscolher={escolher} />
          </div>
        )}

        <div className="px-2.5 py-2.5 max-h-[188px] overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
            {grupo.nome}
          </p>
          <Grade itens={grupo.itens} onEscolher={escolher} />
        </div>

        {/* Abas embaixo, como em mensageiro: o polegar (e o cursor) já está na
            parte de baixo do popover depois de escolher. */}
        <div className="flex items-center gap-0.5 border-t border-border bg-muted/30 px-1.5 py-1">
          {GRUPOS_EMOJI.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGrupoId(g.id)}
              title={g.nome}
              aria-label={g.nome}
              aria-pressed={g.id === grupo.id}
              className={cn(
                'flex-1 h-7 rounded text-base leading-none transition-colors',
                g.id === grupo.id ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              {g.aba}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Grade({
  itens, onEscolher,
}: {
  itens: readonly string[];
  onEscolher: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {itens.map((emoji, i) => (
        <button
          // O mesmo emoji pode repetir dentro de um grupo (😅 aparece duas
          // vezes em Rostos), então a chave precisa do índice.
          key={`${emoji}-${i}`}
          type="button"
          onClick={() => onEscolher(emoji)}
          aria-label={`Inserir ${emoji}`}
          className="h-8 w-8 rounded text-lg leading-none hover:bg-accent active:scale-95 transition-[background-color,transform]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
