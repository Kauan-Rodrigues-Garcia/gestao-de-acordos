/**
 * SecaoTexto — etapa 2: selo, título e mensagem.
 *
 * Sugestões prontas em chips: quem monta no meio do expediente escolhe em um
 * clique, e quem quer escrever escreve.
 */
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MAX_SELO } from '@/components/comemoracao2/design';
import { MAX_MENSAGEM, MAX_TITULO, type Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

const TITULOS = ['META BATIDA!', 'RECORDE!', 'É CAMPEÃO!', 'MANDOU BEM!', 'SUPEROU A META!'];

function Chips({ itens, onEscolher }: { itens: string[]; onEscolher: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map((t) => (
        <button key={t} type="button" onClick={() => onEscolher(t)}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
          {t}
        </button>
      ))}
    </div>
  );
}

export function SecaoTexto({ r, mudar, nomeDoMes }: { r: Rascunho; mudar: MudarRascunho; nomeDoMes: string }) {
  const selos = [`Meta de ${nomeDoMes}`, 'Recorde do mês', 'Destaque da semana', 'Primeira meta'].map((s) => s.toUpperCase());

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="c2-titulo" className="text-xs">Título</Label>
          <span className="text-[10px] tabular-nums text-muted-foreground">{r.titulo.length}/{MAX_TITULO}</span>
        </div>
        <Input id="c2-titulo" value={r.titulo} maxLength={MAX_TITULO}
          onChange={(e) => mudar({ titulo: e.target.value })} placeholder="META BATIDA!" />
        <Chips itens={TITULOS} onEscolher={(t) => mudar({ titulo: t })} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="c2-msg" className="text-xs">Mensagem <span className="text-muted-foreground">(opcional)</span></Label>
          <span className="text-[10px] tabular-nums text-muted-foreground">{r.mensagem.length}/{MAX_MENSAGEM}</span>
        </div>
        <Textarea id="c2-msg" rows={3} value={r.mensagem} maxLength={MAX_MENSAGEM}
          onChange={(e) => mudar({ mensagem: e.target.value })}
          placeholder="Fechou o mês antes do prazo. Dedicação que inspira o time todo!" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="c2-selo" className="text-xs">Selo <span className="text-muted-foreground">(opcional, acima do título)</span></Label>
          <span className="text-[10px] tabular-nums text-muted-foreground">{r.design.selo.length}/{MAX_SELO}</span>
        </div>
        <Input id="c2-selo" value={r.design.selo} maxLength={MAX_SELO}
          onChange={(e) => mudar((a) => ({ design: { ...a.design, selo: e.target.value.toUpperCase() } }))}
          placeholder="META DE OUTUBRO" />
        <Chips itens={[...selos, 'Sem selo']}
          onEscolher={(t) => mudar((a) => ({ design: { ...a.design, selo: t === 'Sem selo' ? '' : t } }))} />
      </div>
    </>
  );
}
