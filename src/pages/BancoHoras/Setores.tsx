/**
 * Setores: um setor por linha. Clicar abre as pessoas do setor.
 */
import { ChevronRight, FileSpreadsheet, Filter, ImageIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  grupoDe, grupos, ordemNatural, porSetor, verNegativas, verPositivas, verVencimento, type ResumoSetor,
} from '@/lib/bancoHoras/calculos';
import { diaMes, horas, plural } from '@/lib/bancoHoras/formato';
import { textoPessoas, textoSetores } from '@/lib/bancoHoras/textos';
import type { ContextoBH } from './contexto';
import { CabecalhoOrdenavel } from './Pessoas';
import { TOM, tomDaPessoa } from './cores';
import { BarraEmpilhada, BotaoCopiar, Horas, LinhaPessoa, Vazio } from './partes';

type Chave = 'setor' | 'n' | 'bPos' | 'bNeg' | 'saldo' | 'vprox';

export function Setores({ c }: { c: ContextoBH }) {
  const { F, sit, limite, visao: v } = c;
  const [ord, setOrd] = useState<{ k: Chave; d: 1 | -1 }>({ k: sit === 'neg' ? 'bNeg' : sit === 'pos' ? 'bPos' : 'saldo', d: -1 });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const defs = grupos(v, sit, limite);
  const G = porSetor(F, v.ult3, sit, limite);
  const val = (s: ResumoSetor) => (ord.k === 'setor' ? s.setor : ord.k === 'bNeg' ? -s.bNeg : s[ord.k]);
  G.sort((a, b) => {
    const x = val(a); const y = val(b);
    return (typeof x === 'string' ? ordemNatural(x, String(y)) : x - (y as number)) * ord.d;
  });
  const T = G.reduce((t, s) => ({ n: t.n + s.n, bPos: t.bPos + s.bPos, bNeg: t.bNeg + s.bNeg, saldo: t.saldo + s.saldo, vprox: t.vprox + s.vprox }),
    { n: 0, bPos: 0, bNeg: 0, saldo: 0, vprox: 0 });
  const pos = verPositivas(sit); const neg = verNegativas(sit); const vence = verVencimento(sit);
  const ordenar = (k: Chave) => setOrd(o => (o.k === k ? { k, d: (o.d * -1) as 1 | -1 } : { k, d: k === 'setor' ? 1 : -1 }));
  const cab = (k: Chave, rotulo: string, className?: string) => (
    <CabecalhoOrdenavel ativo={ord.k === k} sobe={ord.d > 0} onClick={() => ordenar(k)} className={className}>{rotulo}</CabecalhoOrdenavel>
  );
  const colunas = 3 + (pos ? 1 : 0) + (neg ? 1 : 0) + (sit === 'todas' ? 1 : 0) + (vence ? 1 : 0) + 1;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-foreground">{plural(G.length, 'setor', 'setores')}</p>
            <p className="text-[11px] text-muted-foreground">Clique numa linha para abrir as pessoas do setor</p>
          </div>
          <BotaoCopiar rotulo="Copiar resumo" texto={() => textoSetores(G, c.filtroTxt, v, sit)} />
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!G.length}
            onClick={() => c.excel(['resumo', 'setores'], `Banco de horas - setores ${v.data.split('-').reverse().join('-')}.xlsx`)}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel dos setores
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {defs.map(d => (
            <span key={d.id} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', TOM[d.tom].fundo)} style={{ opacity: d.forca }} />{d.titulo}
            </span>
          ))}
        </div>

        {G.length === 0 ? <Vazio>Nenhum setor com esse filtro.</Vazio> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {cab('setor', 'Setor')}
                  {cab('n', 'Pessoas', 'text-right')}
                  {pos && cab('bPos', 'Positivas', 'text-right')}
                  {neg && cab('bNeg', 'Negativas', 'text-right')}
                  {sit === 'todas' && cab('saldo', 'Saldo', 'text-right')}
                  {vence && cab('vprox', `Vence ${diaMes(v.prox)}`, 'text-right')}
                  <TableHead className="min-w-40 text-[11px]">Situação das pessoas</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {G.map(s => {
                  const aberto = abertos.has(s.setor);
                  const gente = [...s.pessoas].sort((a, b) => (sit === 'neg' ? a.saldo - b.saldo : b.saldo - a.saldo));
                  return (
                    <Fragment key={s.setor}>
                      <TableRow className={cn('cursor-pointer', aberto && 'bg-muted/30')}
                        onClick={() => setAbertos(x => { const n = new Set(x); if (n.has(s.setor)) n.delete(s.setor); else n.add(s.setor); return n; })}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                            <div>
                              <p className="text-[13px] font-semibold text-foreground">{s.setor}</p>
                              <p className="text-[10.5px] text-muted-foreground">{s.depto} · {s.empresa}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-[13px] tabular-nums">{s.n}</TableCell>
                        {pos && (
                          <TableCell className="py-2.5 text-right">
                            <Horas min={s.bPos} tom="pos" />
                            <p className="text-[10.5px] text-muted-foreground">{plural(s.nPos, 'pessoa', 'pessoas')}{s.nPos ? ` · média ${horas(s.bPos / s.nPos)}` : ''}</p>
                          </TableCell>
                        )}
                        {neg && (
                          <TableCell className="py-2.5 text-right">
                            {s.bNeg ? <Horas min={s.bNeg} devendo={false} /> : <span className="text-muted-foreground">—</span>}
                            {s.nNeg > 0 && <p className="text-[10.5px] text-muted-foreground">{plural(s.nNeg, 'pessoa', 'pessoas')}</p>}
                          </TableCell>
                        )}
                        {sit === 'todas' && <TableCell className="py-2.5 text-right"><Horas min={s.saldo} /></TableCell>}
                        {vence && (
                          <TableCell className="py-2.5 text-right">
                            {s.vprox ? <><Horas min={s.vprox} tom="warn" devendo={false} /><p className="text-[10.5px] text-muted-foreground">{plural(s.nV, 'pessoa', 'pessoas')}</p></>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                        <TableCell className="py-2.5">
                          <BarraEmpilhada partes={defs.map(d => ({ valor: s.grupos[d.id] || 0, tom: d.tom, forca: d.forca, titulo: d.titulo }))} />
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" title="Imagem do setor para e-mail"
                            onClick={e => { e.stopPropagation(); c.imagem(s.setor); }}>
                            <ImageIcon className="h-3.5 w-3.5" /> Imagem
                          </Button>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={colunas} className="bg-muted/20 p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="text-[12.5px] font-semibold text-foreground">{s.setor}</span>
                              <span className="text-[11px] text-muted-foreground">· {plural(gente.length, 'pessoa', 'pessoas')}</span>
                              <span className="ml-auto flex gap-1.5">
                                <BotaoCopiar className="h-7" texto={() => textoPessoas(gente, `Banco de horas · ${s.setor}`, '', v, sit)} />
                                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => c.ir('pessoas', { setor: s.setor })}>
                                  <Filter className="h-3.5 w-3.5" /> Ver só este setor
                                </Button>
                              </span>
                            </div>
                            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                              {gente.map(p => (
                                <LinhaPessoa key={p.key} p={p} url={c.fotoDe(p)} tom={tomDaPessoa(p, vence)} onAbrir={c.abrirPessoa} mostraSetor={false}
                                  valor={<Horas min={p.saldo} />}
                                  sub={defs.find(d => d.id === grupoDe(p, sit, limite))?.titulo} />
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              {G.length > 1 && (
                <TableFooter>
                  <TableRow className="text-[12px] font-semibold">
                    <TableCell>Total · {plural(G.length, 'setor', 'setores')}</TableCell>
                    <TableCell className="text-right">{T.n}</TableCell>
                    {pos && <TableCell className="text-right"><Horas min={T.bPos} tom="pos" /></TableCell>}
                    {neg && <TableCell className="text-right"><Horas min={T.bNeg} devendo={false} /></TableCell>}
                    {sit === 'todas' && <TableCell className="text-right"><Horas min={T.saldo} /></TableCell>}
                    {vence && <TableCell className="text-right"><Horas min={T.vprox} tom="warn" /></TableCell>}
                    <TableCell /><TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
