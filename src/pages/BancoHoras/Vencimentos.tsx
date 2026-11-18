/**
 * Vencimentos: quando as horas positivas vencem (sempre no dia 25), e quem
 * precisa compensar — no próximo dia 25, em 60 ou em 90 dias (acumulado até a
 * data) ou «só o mês» (18/11/2026): um dia 25 só, sem somar os de antes, com os
 * meses tirados de quem está no filtro (o setor escolhido).
 */
import { AlertTriangle, FileSpreadsheet, ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  fimDaJanela, mesesParaVencer, porMesDeVencimento, vencendoNa, vencendoNoMes, verVencimento, type Janela, type Pessoa,
} from '@/lib/bancoHoras/calculos';
import { data as fmtData, diaMes, horas, horasRedondas, mesCurto, plural } from '@/lib/bancoHoras/formato';
import { textoVencimentos, textoVencimentosNoMes } from '@/lib/bancoHoras/textos';
import type { ContextoBH } from './contexto';
import { BotaoCopiar, Horas, LinhaPessoa, Segmentado, Vazio } from './partes';

export function Vencimentos({ c }: { c: ContextoBH }) {
  const { F, sit, visao: v } = c;
  const [janela, setJanela] = useState<Janela>('prox');
  // «Só o mês» (aaaa-mm). Ganha da janela enquanto estiver escolhido.
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  if (!verVencimento(sit)) {
    return <Vazio>Esta aba mostra quem tem horas vencendo. Troque a situação para «Todas» ou «Vence {diaMes(v.prox)}».</Vazio>;
  }
  // Os meses vêm do filtro: trocou de setor e o mês não existe lá, volta para a janela.
  const futuros = mesesParaVencer(F, v.data);
  const sel = futuros.find(m => m.mes === mesEscolhido) ?? null;
  const val = (p: Pessoa) => (sel ? vencendoNoMes(p, sel.mes, v.data) : vencendoNa(p, janela));
  const diaDaPessoa = (p: Pessoa) => (sel
    ? p.venc.find(([d, x]) => x > 0 && d >= v.data && d.startsWith(sel.mes))?.[0] ?? sel.dia
    : p.venc.find(([d, x]) => x > 0 && d >= v.data)?.[0] ?? v.prox);
  const escolherMes = (mes: string | null) => setMesEscolhido(atual => (atual === mes ? null : mes));

  const L = F.filter(p => val(p) > 0);
  const porSetor = new Map<string, Pessoa[]>();
  for (const p of L) porSetor.set(p.setor, [...(porSetor.get(p.setor) ?? []), p]);
  const GS = [...porSetor].map(([s, ps]) => ({ setor: s, ps: ps.sort((a, b) => val(b) - val(a)), tot: ps.reduce((t, p) => t + val(p), 0) }))
    .sort((a, b) => b.tot - a.tot);
  const tot = L.reduce((t, p) => t + val(p), 0);
  const meses = porMesDeVencimento(F, v.data);
  const mx = Math.max(1, ...meses.map(m => m.horas));
  const proxMes = v.prox.slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quando as horas vencem</CardTitle>
            <p className="text-[11px] text-muted-foreground">Horas positivas pelo dia 25 em que vencem · as apagadas já venceram e continuam no saldo · clique num mês para ver só ele</p>
          </CardHeader>
          <CardContent>
            {meses.length === 0 ? <Vazio>Nenhuma hora positiva para vencer.</Vazio> : (
              <div className="flex h-56 items-end gap-1.5 overflow-x-auto pb-1">
                {meses.map(m => {
                  const destaque = sel ? m.mes === sel.mes : m.mes === proxMes;
                  return (
                    <div key={m.mes} className={cn('flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1', !m.passou && 'cursor-pointer')}
                      onClick={m.passou ? undefined : () => escolherMes(m.mes)}
                      title={`Vence em 25/${m.mes.slice(5)}/${m.mes.slice(0, 4)}${m.passou ? ' (já passou)' : ''}: ${horas(m.horas)} · ${plural(m.pessoas, 'pessoa', 'pessoas')}`}>
                      {(destaque || m.horas === mx) && (
                        <span className={cn('font-mono text-[10.5px] font-semibold tabular-nums', destaque ? 'text-warning' : 'text-primary')}>{horasRedondas(m.horas)}h</span>
                      )}
                      <div className="flex w-full max-w-16 flex-1 items-end">
                        <div className={cn('w-full rounded-t-md', destaque ? 'bg-warning' : 'bg-primary', m.passou && 'opacity-35')}
                          style={{ height: `${Math.max(2, (m.horas / mx) * 100)}%` }} />
                      </div>
                      <span className={cn('whitespace-nowrap text-[10px]', destaque ? 'font-semibold text-foreground' : 'text-muted-foreground', m.passou && 'italic')}>{mesCurto(m.mes)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-warning/30 bg-gradient-to-br from-warning/[0.07] to-transparent">
          <CardContent className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {sel ? <>Vencem em {fmtData(sel.dia)} · só este mês</> : <>Precisam compensar até {fmtData(fimDaJanela(v, janela))}</>}
            </p>
            <Segmentado<Janela | 'mes'> rotulo="Até quando" valor={sel ? 'mes' : janela}
              onTrocar={k => { setMesEscolhido(null); if (k !== 'mes') setJanela(k); }} opcoes={[
                { id: 'prox', titulo: `Dia ${diaMes(v.prox)}` }, { id: '60', titulo: '60 dias' }, { id: '90', titulo: '90 dias' },
              ]} />
            {futuros.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Ou só o mês, sem somar os de antes:</p>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Só o mês">
                  {futuros.map(m => (
                    <button key={m.mes} type="button" aria-pressed={sel?.mes === m.mes} onClick={() => escolherMes(m.mes)}
                      title={`${horas(m.horas)} · ${plural(m.pessoas, 'pessoa', 'pessoas')}`}
                      className={cn('h-7 rounded-md border px-2 text-[11.5px] font-medium transition-colors',
                        sel?.mes === m.mes ? 'border-warning bg-warning/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                      {mesCurto(m.mes)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="font-mono text-3xl font-bold tabular-nums text-warning">{horas(tot)}</p>
            <p className="text-[12px] text-muted-foreground">{plural(L.length, 'pessoa', 'pessoas')} em {plural(GS.length, 'setor', 'setores')}</p>
            <div className="flex flex-wrap gap-1.5">
              <BotaoCopiar rotulo="Copiar lista" texto={() => (sel ? textoVencimentosNoMes(F, v, sel.mes, sel.dia) : textoVencimentos(F, v, janela))} />
              {/* O Excel e a imagem são os do próximo dia 25 e dos 90 dias: no «só o mês» saem, para não confundir. */}
              {!sel && <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!L.length}
                onClick={() => c.excel(['vence'], `Banco de horas - vencimentos ${v.data.split('-').reverse().join('-')}.xlsx`, F)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>}
            </div>
          </CardContent>
        </Card>
      </div>

      {GS.length === 0 ? <Vazio>Ninguém com horas vencendo nesse período.</Vazio> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GS.map(g => (
            <Card key={g.setor}>
              <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-sm">{g.setor}</CardTitle>
                  <p className="text-[11px] text-muted-foreground">{plural(g.ps.length, 'pessoa', 'pessoas')}</p>
                </div>
                <Horas min={g.tot} tom="warn" devendo={false} className="text-base" />
                {!sel && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Imagem de quem vence neste setor" onClick={() => c.imagem(g.setor, 'vence')}>
                    <ImageIcon className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-0.5 p-2 pt-0">
                {g.ps.map(p => (
                  <LinhaPessoa key={p.key} p={p} url={c.fotoDe(p)} tom="warn" onAbrir={c.abrirPessoa} mostraSetor={false}
                    valor={<Horas min={val(p)} tom="warn" devendo={false} />}
                    sub={`de ${horas(p.saldo)} · vence ${fmtData(diaDaPessoa(p))}`} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
