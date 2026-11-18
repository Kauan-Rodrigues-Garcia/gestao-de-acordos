/**
 * Peças da aba Banco de Horas, nas cores do tema do gestão.
 *
 *   positivas (guardadas) .. primary
 *   negativas (devendo) .... destructive — sempre em vermelho (regra do usuário)
 *   vence no dia 25 ........ warning
 *   em dia ................. success
 *
 * Hora não leva sinal: a cor e a palavra ao lado («devendo») dizem o lado.
 */
import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Pessoa, TomGrupo } from '@/lib/bancoHoras/calculos';
import { TOM } from './cores';
import { horas, iniciais } from '@/lib/bancoHoras/formato';
import { copiarTexto } from '@/lib/bancoHoras/textos';

export function Foto({ p, url, tom, tamanho = 'md' }: { p: Pessoa; url: string | null; tom: TomGrupo; tamanho?: 'sm' | 'md' | 'lg' }) {
  const t = TOM[tom];
  const tam = tamanho === 'lg' ? 'h-14 w-14 text-base' : tamanho === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn('shrink-0 rounded-full object-cover ring-2 ring-offset-1 ring-offset-card', t.anel, tam)} />
  ) : (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-offset-1 ring-offset-card', t.anel, t.suave, t.texto, tam)}>
      {iniciais(p.nome)}
    </span>
  );
}

/** Hora com a cor do lado e, se negativa, «devendo». */
export function Horas({ min, tom, devendo = true, className }: { min: number; tom?: TomGrupo; devendo?: boolean; className?: string }) {
  const lado: TomGrupo = tom ?? (min < 0 ? 'neg' : 'pos');
  return (
    <span className={cn('font-mono font-semibold tabular-nums', TOM[lado].texto, className)}>
      {horas(min)}
      {devendo && min < 0 && <span className="ml-1 font-sans text-[10.5px] font-medium">devendo</span>}
    </span>
  );
}

export function Etiqueta({ tom, children, className }: { tom: TomGrupo; children: ReactNode; className?: string }) {
  const t = TOM[tom];
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium', t.suave, t.borda, t.texto, className)}>
      {children}
    </span>
  );
}

export function BotaoCopiar({ texto, rotulo = 'Copiar', className }: { texto: () => string; rotulo?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="outline" size="sm" className={cn('h-8 gap-1.5 text-xs', className)}
      onClick={async () => {
        const deu = await copiarTexto(texto());
        if (deu) { setOk(true); setTimeout(() => setOk(false), 1600); toast.success('Copiado. É só colar (Ctrl+V).'); }
        else toast.error('Não consegui copiar neste navegador.');
      }}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {rotulo}
    </Button>
  );
}

/** Uma linha de pessoa clicável: foto, nome, setor, valor. */
export function LinhaPessoa({
  p, url, tom, valor, sub, onAbrir, mostraSetor = true,
}: {
  p: Pessoa; url: string | null; tom: TomGrupo; valor: ReactNode; sub?: ReactNode;
  onAbrir: (p: Pessoa) => void; mostraSetor?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(p)}
      className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60',
        p.saldo < 0 && 'bg-destructive/[0.04]')}
    >
      <Foto p={p} url={url} tom={tom} tamanho="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{p.nome}</span>
        {mostraSetor && <span className="block truncate text-[11px] text-muted-foreground">{p.setor}</span>}
      </span>
      <span className="shrink-0 text-right text-[13px]">
        {valor}
        {sub && <span className="block text-[10.5px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Barra de proporção horizontal: cada parte com a sua cor. */
export function BarraEmpilhada({ partes, className }: { partes: { valor: number; tom: TomGrupo; forca?: number; titulo: string }[]; className?: string }) {
  const total = partes.reduce((s, x) => s + x.valor, 0) || 1;
  return (
    <div className={cn('flex h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      {partes.filter(x => x.valor > 0).map(x => (
        <span
          key={x.titulo} title={`${x.titulo}: ${x.valor}`}
          className={cn('h-full', TOM[x.tom].fundo)}
          style={{ width: `${(x.valor / total) * 100}%`, opacity: x.forca ?? 1 }}
        />
      ))}
    </div>
  );
}

/** Botões lado a lado, um ligado — a mesma altura dos outros controles (h-8). */
export function Segmentado<K extends string>({ opcoes, valor, onTrocar, rotulo, className }: {
  opcoes: readonly { id: NoInfer<K>; titulo: ReactNode; cor?: string }[]; valor: K; onTrocar: (k: K) => void; rotulo: string; className?: string;
}) {
  return (
    <div className={cn('inline-flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5', className)} role="group" aria-label={rotulo}>
      {opcoes.map(o => (
        <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => onTrocar(o.id)}
          className={cn('inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors',
            valor === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {o.cor && <span className={cn('h-2 w-2 rounded-full', o.cor)} />}
          {o.titulo}
        </button>
      ))}
    </div>
  );
}
