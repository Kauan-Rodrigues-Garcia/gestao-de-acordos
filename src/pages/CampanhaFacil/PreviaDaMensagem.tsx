/**
 * A prévia da mensagem enquanto ela é escrita (25/10/2026): o texto montado
 * para um cliente — o selecionado no mailing ou o fictício —, com a
 * formatação do WhatsApp (*negrito*, _itálico_, ~riscado~).
 *
 * Cada valor que veio de uma variável fica realçado; a variável que saiu
 * vazia para este cliente aparece em vermelho, e a que não existe (erro de
 * digitação) em âmbar — as duas sairiam em branco para o cliente.
 */
import { useMemo, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pedacosDaPrevia, type ExemploDaMensagem, type PedacoDaPrevia } from './detalheDasVariaveis';

// Marcadores de uso privado: o valor de cada variável entra no texto como
// «<n>» antes da formatação, para um *negrito* que abraça uma
// variável (*{{primeiro_nome}}*) funcionar e o valor não ser formatado por dentro.
const MARCA = /(\d+)/;
const FORMATO = /([*_~])(?=\S)([^\n]*?\S)\1/;

function folhas(texto: string, pedacos: PedacoDaPrevia[], chave: string): ReactNode[] {
  return texto.split(MARCA).map((parte, i) => (i % 2 === 0
    ? parte
    : <Variavel key={`${chave}-${i}`} pedaco={pedacos[Number(parte)]} />));
}

function formatar(texto: string, pedacos: PedacoDaPrevia[], chave = 'f'): ReactNode[] {
  const saida: ReactNode[] = [];
  let resto = texto;
  let n = 0;
  while (resto) {
    const m = FORMATO.exec(resto);
    if (!m) { saida.push(...folhas(resto, pedacos, `${chave}${n}`)); break; }
    if (m.index > 0) saida.push(...folhas(resto.slice(0, m.index), pedacos, `${chave}${n}a`));
    const dentro = formatar(m[2], pedacos, `${chave}${n}d`);
    const k = `${chave}${n}m`;
    saida.push(m[1] === '*' ? <strong key={k}>{dentro}</strong> : m[1] === '_' ? <em key={k}>{dentro}</em> : <s key={k}>{dentro}</s>);
    resto = resto.slice(m.index + m[0].length);
    n += 1;
  }
  return saida;
}

function Variavel({ pedaco }: { pedaco: PedacoDaPrevia | undefined }) {
  if (!pedaco || pedaco.tipo === 'texto') return null;
  if (pedaco.tipo === 'valor') {
    return (
      <span title={`{{${pedaco.variavel}}}`} className="rounded-sm bg-emerald-500/15 px-0.5 ring-1 ring-emerald-500/25">
        {pedaco.texto}
      </span>
    );
  }
  const vazia = pedaco.tipo === 'vazia';
  return (
    <span
      title={vazia ? 'Vazia para este cliente: sai em branco' : 'Esta variável não existe: sai em branco'}
      className={cn(
        'rounded-sm px-1 font-mono text-[11px] font-normal not-italic ring-1',
        vazia
          ? 'bg-destructive/10 text-destructive ring-destructive/30'
          : 'bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-400',
      )}
    >
      {`{{${pedaco.variavel}}}`}
    </span>
  );
}

export function PreviaDaMensagem({ texto, exemplo }: { texto: string; exemplo: ExemploDaMensagem }) {
  const pedacos = useMemo(() => pedacosDaPrevia(texto, exemplo.variaveis), [texto, exemplo]);
  const montado = useMemo(() => pedacos
    .map((p, i) => (p.tipo === 'texto' ? p.texto : `${i}`))
    .join(''), [pedacos]);
  const vazias = pedacos.filter((p) => p.tipo === 'vazia').length;
  const desconhecidas = pedacos.filter((p) => p.tipo === 'desconhecida').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Eye className="h-3.5 w-3.5 text-primary" aria-hidden /> Prévia
          <span className="font-normal text-muted-foreground">— {exemplo.rotulo}</span>
        </p>
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {vazias > 0 && <span className="font-medium text-destructive">{vazias} vazia{vazias > 1 ? 's' : ''}</span>}
          {desconhecidas > 0 && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {desconhecidas} não existe{desconhecidas > 1 ? 'm' : ''}
            </span>
          )}
          {vazias === 0 && desconhecidas === 0 && texto.trim() && <span>Todas as variáveis preenchidas</span>}
        </p>
      </div>
      <div className="min-h-[200px] flex-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
        {texto.trim() ? (
          <div className="ml-auto w-fit max-w-[95%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-foreground shadow-sm dark:bg-emerald-950/40">
            {formatar(montado, pedacos)}
          </div>
        ) : (
          <p className="pt-6 text-center text-xs text-muted-foreground">Escreva a mensagem para ver como ela chega ao cliente.</p>
        )}
      </div>
      {!exemplo.real && (
        <p className="text-[11px] text-muted-foreground">Importe um mailing e selecione um contato para ver a prévia com um cliente de verdade.</p>
      )}
    </div>
  );
}
