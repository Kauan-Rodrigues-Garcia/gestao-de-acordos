/**
 * Pessoas: a tabela de todo mundo no recorte — saldo do banco inteiro, as
 * horas feitas em cada um dos últimos 3 meses, o que vence e a situação.
 */
import { ArrowDown, ArrowUp, FileSpreadsheet, ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { grupoDe, grupos, ordemNatural, verVencimento, type Pessoa } from '@/lib/bancoHoras/calculos';
import { diaMes, mesCurto, plural } from '@/lib/bancoHoras/formato';
import { textoPessoas } from '@/lib/bancoHoras/textos';
import type { ContextoBH } from './contexto';
import { tomDaPessoa, tomDoGrupo } from './cores';
import { BotaoCopiar, Etiqueta, Foto, Horas, Vazio } from './partes';

export function CabecalhoOrdenavel({ ativo, sobe, onClick, className, children }: {
  ativo: boolean; sobe: boolean; onClick: () => void; className?: string; children: React.ReactNode;
}) {
  return (
    <TableHead className={cn('cursor-pointer select-none whitespace-nowrap text-[11px]', className)} onClick={onClick}
      aria-sort={ativo ? (sobe ? 'ascending' : 'descending') : undefined}>
      <span className="inline-flex items-center gap-1">
        {children}
        {ativo && (sobe ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </TableHead>
  );
}

type Chave = 'nome' | 'setor' | 'saldo' | 'vprox' | 'grupo' | 'per' | `m:${string}`;
const PASSO = 50;

export function Pessoas({ c }: { c: ContextoBH }) {
  const { F, sit, limite, visao: v } = c;
  const [ord, setOrd] = useState<{ k: Chave; d: 1 | -1 }>({ k: 'saldo', d: sit === 'neg' ? 1 : -1 });
  const [limiteLinhas, setLimiteLinhas] = useState(PASSO);
  const defs = grupos(v, sit, limite);
  const nomeGrupo = (p: Pessoa) => defs.find(d => d.id === grupoDe(p, sit, limite))?.titulo ?? '';
  const meses = c.meses;
  const somaMeses = (p: Pessoa) => meses.reduce((t, m) => t + (p.mes[m] || 0), 0);
  const mostraVence = verVencimento(sit);
  // Muitos meses: a tabela rola para o lado e o nome fica parado à esquerda.
  const fixa = meses.length > 3;

  const L = useMemo(() => {
    const val = (p: Pessoa): string | number => (ord.k === 'nome' ? p.nome : ord.k === 'setor' ? p.setor
      : ord.k === 'grupo' ? grupoDe(p, sit, limite) : ord.k.startsWith('m:') ? (p.mes[ord.k.slice(2)] || 0)
        : ord.k === 'vprox' ? p.vprox : ord.k === 'per' ? somaMeses(p) : p.saldo);
    return [...F].sort((a, b) => {
      const x = val(a); const y = val(b);
      const r = typeof x === 'string' ? ordemNatural(x, String(y)) : x - (y as number);
      return r * ord.d || a.nome.localeCompare(b.nome, 'pt-BR');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `somaMeses` muda junto com `meses`
  }, [F, ord, sit, limite, meses]);

  const ordenar = (k: Chave) => setOrd(o => (o.k === k ? { k, d: (o.d * -1) as 1 | -1 }
    : { k, d: k === 'nome' || k === 'setor' || k === 'grupo' ? 1 : sit === 'neg' && (k === 'saldo' || k === 'per' || k.startsWith('m:')) ? 1 : -1 }));

  const cab = (k: Chave, rotulo: React.ReactNode, className?: string) => (
    <CabecalhoOrdenavel key={k} ativo={ord.k === k} sobe={ord.d > 0} onClick={() => ordenar(k)} className={className}>
      {rotulo}
    </CabecalhoOrdenavel>
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-foreground">{plural(L.length, 'pessoa', 'pessoas')}</p>
            <p className="text-[11px] text-muted-foreground">
              {sit === 'pos' ? 'Só quem tem horas positivas' : sit === 'neg' ? 'Só quem está devendo horas' : 'Positivas em azul, negativas (devendo) em vermelho'}
              {' · '}clique no nome para ver o detalhe
            </p>
          </div>
          <BotaoCopiar rotulo="Copiar lista" texto={() => textoPessoas(L, 'Banco de horas', c.filtroTxt, v, sit)} />
          {c.setorFiltro && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => c.imagem(c.setorFiltro)}>
              <ImageIcon className="h-3.5 w-3.5" /> Imagem
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!L.length}
            onClick={() => c.excel(sit === 'pos' ? ['positivas'] : sit === 'neg' ? ['negativas'] : ['pessoas', 'positivas', 'negativas'],
              `Banco de horas - pessoas ${v.data.split('-').reverse().join('-')}.xlsx`, L)}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>

        {L.length === 0 ? <Vazio>Ninguém com esse filtro.</Vazio> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {cab('nome', 'Pessoa', fixa ? 'sticky left-0 z-10 bg-muted' : undefined)}
                  {cab('setor', 'Setor')}
                  {cab('saldo', 'Saldo do banco', 'text-right')}
                  {meses.map(m => cab(`m:${m}`, `${mesCurto(m)}${m === v.mesAtual ? ` (até ${diaMes(v.data)})` : ''}`, 'text-right bg-primary/[0.03]'))}
                  {meses.length > 1 && cab('per', 'Nos meses', 'text-right bg-primary/[0.06]')}
                  {mostraVence && cab('vprox', `Vence ${diaMes(v.prox)}`, 'text-right')}
                  {cab('grupo', 'Situação')}
                </TableRow>
              </TableHeader>
              <TableBody>
                {L.slice(0, limiteLinhas).map(p => {
                  const g = grupoDe(p, sit, limite);
                  return (
                    <TableRow key={p.key} className={cn('cursor-pointer', p.saldo < 0 && 'bg-destructive/[0.04] hover:bg-destructive/[0.07]')}
                      onClick={() => c.abrirPessoa(p)}>
                      <TableCell className={cn('py-2', fixa && 'sticky left-0 z-10 bg-card')}>
                        <div className="flex items-center gap-2.5">
                          <Foto p={p} url={c.fotoDe(p)} tom={tomDaPessoa(p, mostraVence)} tamanho="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-foreground">{p.nome}</p>
                            <p className="text-[10.5px] text-muted-foreground">{p.mat}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-[12px] text-muted-foreground">{p.setor}</TableCell>
                      <TableCell className="py-2 text-right"><Horas min={p.saldo} /></TableCell>
                      {meses.map(m => {
                        const x = p.mes[m] || 0;
                        return (
                          <TableCell key={m} className="bg-primary/[0.03] py-2 text-right text-[12px]">
                            {x ? <Horas min={x} devendo={false} className="font-medium" /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                      {meses.length > 1 && (
                        <TableCell className="bg-primary/[0.06] py-2 text-right text-[12px]">
                          {somaMeses(p) ? <Horas min={somaMeses(p)} devendo={false} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {mostraVence && (
                        <TableCell className="py-2 text-right text-[12px]">
                          {p.vprox > 0 ? <Horas min={p.vprox} tom="warn" devendo={false} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell className="py-2"><Etiqueta tom={tomDoGrupo(g)}>{nomeGrupo(p)}</Etiqueta></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {L.length > limiteLinhas && (
          <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
            Mostrando {limiteLinhas} de {L.length}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLimiteLinhas(n => n + PASSO)}>Mostrar mais</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLimiteLinhas(L.length)}>Mostrar todos</Button>
          </div>
        )}
        <p className="text-[10.5px] text-muted-foreground">
          O mês é o da hora feita: o DP manda só o vencimento, e a hora vence 12 meses depois de feita.
          {' '}O saldo do banco soma todos os meses, não só os escolhidos no filtro.
        </p>
      </CardContent>
    </Card>
  );
}
