/**
 * A janela de editar ou adicionar uma mensagem da Campanha Fácil.
 *
 * Desde 23/10/2026 (Cleber: «as variáveis ao lado da mensagem e não abaixo»)
 * a janela ocupa quase a tela toda e tem duas colunas: à esquerda a mensagem,
 * que estica até o fim da janela; à direita as variáveis, com rolagem própria.
 * Antes as variáveis vinham embaixo do texto, e inserir uma no fim da lista
 * era rolar a janela para longe da mensagem.
 *
 * No celular as colunas viram uma fila: mensagem em cima, variáveis embaixo.
 *
 * Desde 25/10/2026, embaixo do texto vem a prévia da mensagem montada para um
 * cliente, e os botões das variáveis mostram o valor de cada uma. O texto
 * avisa a variável que não existe e o «R$»/«,00» escrito em volta de uma
 * variável que já sai em reais (com o botão que corrige).
 */
import { useMemo, type ReactNode, type RefObject } from 'react';
import { AlertTriangle, Braces, MessageSquare } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RealceDeVariavel, VariableChips, insertVariable, variaveisUsadas } from './VariaveisMensagem';
import {
  corrigirReaisDuplicados, corrigirVezesRepetidas, reaisDuplicados, variaveisDesconhecidas, vezesRepetidas,
  type ExemploDaMensagem,
} from './detalheDasVariaveis';
import { PreviaDaMensagem } from './PreviaDaMensagem';

export function JanelaDaMensagem({
  aberta, onOpenChange, titulo, descricao, campos, textoRef, texto, setTexto, placeholder,
  realce, setRealce, rodape, exemplo,
}: {
  aberta: boolean;
  onOpenChange: (aberta: boolean) => void;
  titulo: string;
  descricao: ReactNode;
  /** Campos acima da mensagem (título e categoria, ao adicionar). */
  campos?: ReactNode;
  textoRef: RefObject<HTMLTextAreaElement>;
  texto: string;
  setTexto: (v: string) => void;
  placeholder?: string;
  realce: string | null;
  setRealce: (v: string | null) => void;
  rodape: ReactNode;
  /** O cliente da prévia (o selecionado no mailing ou o fictício). */
  exemplo: ExemploDaMensagem;
}) {
  const usadas = useMemo(() => variaveisUsadas(texto).size, [texto]);
  const desconhecidas = useMemo(() => variaveisDesconhecidas(texto), [texto]);
  const emReais = useMemo(() => reaisDuplicados(texto), [texto]);
  const comVezes = useMemo(() => vezesRepetidas(texto), [texto]);
  return (
    <Dialog open={aberta} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,920px)] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> {titulo}
          </DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(460px,46%)] lg:overflow-hidden">
          {/* ── A mensagem e, embaixo, a prévia ── */}
          <div className="flex min-h-0 flex-col gap-3 p-5 lg:overflow-y-auto">
            {campos}
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-xs font-medium">Texto da mensagem</label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {texto.length.toLocaleString('pt-BR')} caracteres
                </span>
              </div>
              <div className="relative flex min-h-[220px] flex-1 flex-col">
                <Textarea
                  ref={textoRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={placeholder}
                  className="min-h-[220px] flex-1 resize-none font-mono text-xs leading-relaxed"
                />
                <RealceDeVariavel alvo={textoRef} texto={texto} variavel={realce} />
              </div>
              {desconhecidas.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400" role="alert">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  {desconhecidas.map((v) => `{{${v}}}`).join(', ')}{' '}
                  {desconhecidas.length === 1 ? 'não existe e sairia' : 'não existem e sairiam'} em branco. Confira a escrita ou use os botões ao lado.
                </p>
              )}
              {emReais.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400" role="alert">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <p className="flex-1">
                    {emReais.map((v) => `{{${v}}}`).join(', ')}{' '}
                    {emReais.length === 1 ? 'já sai' : 'já saem'} com «R$» e centavos. Com «R$» antes ou «,00» depois,
                    o cliente recebe «R$R$ 1.400,00,00».
                  </p>
                  <Button
                    type="button" size="sm" variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    onClick={() => setTexto(corrigirReaisDuplicados(texto))}
                  >
                    Corrigir
                  </Button>
                </div>
              )}
              {comVezes.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400" role="alert">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <p className="flex-1">
                    {comVezes.map((v) => `{{${v}}}`).join(', ')}{' '}
                    {comVezes.length === 1 ? 'já sai' : 'já saem'} com as vezes («12x de R$ 59,00»). Com as vezes escritas
                    antes, o cliente recebe «12x de 12x de R$ 59,00».
                  </p>
                  <Button
                    type="button" size="sm" variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    onClick={() => setTexto(corrigirVezesRepetidas(texto))}
                  >
                    Corrigir
                  </Button>
                </div>
              )}
              {desconhecidas.length === 0 && emReais.length === 0 && comVezes.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Clique numa variável ao lado para inseri-la onde está o cursor.
                </p>
              )}
            </div>
            <PreviaDaMensagem texto={texto} exemplo={exemplo} />
          </div>

          {/* ── As variáveis, ao lado ── */}
          <aside className="flex min-h-0 flex-col border-t border-border bg-muted/20 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Braces className="h-3.5 w-3.5 text-primary" /> Inserir variável
              </p>
              <span className="text-[11px] text-muted-foreground">
                {usadas === 0 ? 'Nenhuma na mensagem' : `${usadas} na mensagem`}
              </span>
            </div>
            <div className="min-h-0 flex-1 p-3 lg:overflow-y-auto">
              <VariableChips
                texto={texto}
                exemplo={exemplo}
                onRealcar={setRealce}
                onInsert={(v) => insertVariable(textoRef, texto, setTexto, v)}
              />
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-3">
          {rodape}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
