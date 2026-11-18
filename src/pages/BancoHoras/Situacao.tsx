/**
 * Situação: um quadro por grupo (devendo · vence no dia 25 · acima do limite ·
 * em dia), para saber o que fazer com cada pessoa.
 */
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { grupoDe, grupos, valorNoGrupo, type Pessoa } from '@/lib/bancoHoras/calculos';
import { horas } from '@/lib/bancoHoras/formato';
import { textoGrupo } from '@/lib/bancoHoras/textos';
import type { ContextoBH } from './contexto';
import { TOM } from './cores';
import { BotaoCopiar, Horas, LinhaPessoa, Vazio } from './partes';

export function Situacao({ c }: { c: ContextoBH }) {
  const { F, sit, limite, visao: v } = c;
  const defs = grupos(v, sit, limite);
  const porGrupo = new Map<string, Pessoa[]>(defs.map((d): [string, Pessoa[]] => [d.id, []]));
  for (const p of F) porGrupo.get(grupoDe(p, sit, limite))?.push(p);
  for (const d of defs) porGrupo.get(d.id)?.sort((a, b) => Math.abs(valorNoGrupo(d.id, b)) - Math.abs(valorNoGrupo(d.id, a)));

  return (
    <div className={cn('grid gap-3', defs.length >= 4 ? 'md:grid-cols-2 xl:grid-cols-4' : defs.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
      {defs.map(d => {
        const L = porGrupo.get(d.id) ?? [];
        const t = TOM[d.tom];
        const tot = L.reduce((s, p) => s + Math.abs(valorNoGrupo(d.id, p)), 0);
        return (
          <section key={d.id} className={cn('flex min-w-0 flex-col rounded-xl border bg-card', t.borda)}>
            <header className={cn('rounded-t-xl border-b px-3 py-3', t.borda, t.suave)}>
              <div className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', t.fundo)} style={{ opacity: d.forca }} />
                <h3 className="text-[13px] font-semibold text-foreground">{d.titulo}</h3>
                <span className="ml-auto rounded-full bg-background/70 px-2 text-[11px] font-semibold text-foreground">{L.length}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{d.descricao}</p>
              <p className={cn('mt-2 font-mono text-lg font-bold tabular-nums', t.texto)}>
                {horas(tot)}
                <span className="ml-1.5 font-sans text-[11px] font-medium text-muted-foreground">
                  {d.id === 'vence' ? 'vencendo' : d.tom === 'neg' ? 'devendo' : 'guardadas'}
                </span>
              </p>
              <div className="mt-2 flex gap-1.5">
                <BotaoCopiar rotulo="Copiar lista" className="h-7" texto={() => textoGrupo(d, L, c.filtroTxt, v)} />
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={!L.length}
                  onClick={() => c.excel(['situacao'], `Banco de horas - ${d.titulo.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`, L)}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </header>
            <div className="max-h-[560px] flex-1 space-y-0.5 overflow-y-auto p-1.5">
              {L.length ? L.map(p => (
                <LinhaPessoa key={p.key} p={p} url={c.fotoDe(p)} tom={d.tom} onAbrir={c.abrirPessoa}
                  valor={<Horas min={valorNoGrupo(d.id, p)} tom={d.tom === 'ok' ? 'pos' : d.tom} devendo={false} />}
                  sub={d.id === 'vence' ? `de ${horas(p.saldo)}` : undefined} />
              )) : <Vazio>Ninguém aqui.</Vazio>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
