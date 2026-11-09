/**
 * DialogDiasDaPessoa.tsx — os dias úteis de UMA pessoa no mês (09/11/2026).
 *
 * Abre pela linha do operador na aba Metas quando a «Meta proporcional» está
 * marcada. Duas escolhas:
 *
 *   - Segue os dias úteis do setor (o padrão; não grava nada);
 *   - Dias úteis personalizados: os dias que a pessoa trabalha, sempre dentro
 *     dos dias úteis do setor. Atalho «de… até…» para quem começou (ou saiu)
 *     no meio do mês, e clique no dia para tirar ou pôr um dia solto.
 *
 * A régua que aplica a lista é `lib/diasUteisDoSetor.ts` (`perfilId`).
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { diasDoSetorNoIntervalo } from '@/lib/diasUteisDoSetor';

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export interface DialogDiasDaPessoaProps {
  aberto: boolean;
  nome: string;
  /** 'yyyy-MM' */
  mes: string;
  /** Os feriados da régua do SETOR da pessoa (geral ou exceção do setor). */
  feriadosDoSetor: readonly string[];
  /** A lista gravada; `null` = segue o setor. */
  diasAtuais: readonly string[] | null;
  somenteLeitura?: boolean;
  onSalvar: (dias: string[] | null) => Promise<boolean>;
  onFechar: () => void;
}

function semanasDoMes(mes: string): (string | null)[][] {
  const [ano, m] = mes.split('-').map(Number);
  const total = new Date(ano, m, 0).getDate();
  const primeiro = new Date(ano, m - 1, 1).getDay();
  const celulas: (string | null)[] = Array.from({ length: primeiro }, (): string | null => null);
  for (let d = 1; d <= total; d++) celulas.push(`${mes}-${String(d).padStart(2, '0')}`);
  while (celulas.length % 7) celulas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

export function DialogDiasDaPessoa({
  aberto, nome, mes, feriadosDoSetor, diasAtuais, somenteLeitura, onSalvar, onFechar,
}: DialogDiasDaPessoaProps) {
  const doSetor = useMemo(() => diasDoSetorNoIntervalo(mes, feriadosDoSetor), [mes, feriadosDoSetor]);
  const uteisDoSetor = useMemo(() => new Set(doSetor), [doSetor]);
  const [personalizado, setPersonalizado] = useState(false);
  const [dias, setDias] = useState<Set<string>>(new Set());
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Cada abertura nasce do que está gravado.
  useEffect(() => {
    if (!aberto) return;
    setPersonalizado(diasAtuais !== null);
    setDias(new Set((diasAtuais ?? doSetor).filter(d => uteisDoSetor.has(d))));
    setDesde('');
    setAte('');
  }, [aberto, diasAtuais, doSetor, uteisDoSetor]);

  const [ano, m] = mes.split('-').map(Number);
  const primeiroDia = `${mes}-01`;
  const ultimoDia = `${mes}-${String(new Date(ano, m, 0).getDate()).padStart(2, '0')}`;
  const semanas = useMemo(() => semanasDoMes(mes), [mes]);
  const qtd = personalizado ? dias.size : doSetor.length;

  function aplicarIntervalo() {
    setDias(new Set(diasDoSetorNoIntervalo(mes, feriadosDoSetor, desde || null, ate || null)));
  }

  function alternar(iso: string) {
    setDias(prev => {
      const n = new Set(prev);
      if (n.has(iso)) n.delete(iso); else n.add(iso);
      return n;
    });
  }

  async function salvar() {
    setSalvando(true);
    const ok = await onSalvar(personalizado ? [...dias].sort() : null);
    setSalvando(false);
    if (ok) onFechar();
  }

  const travado = somenteLeitura || salvando;
  const semDia = personalizado && dias.size === 0;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Dias úteis de {nome}
          </DialogTitle>
          <DialogDescription>
            {NOMES_MES[m - 1]} de {ano}. A meta diária e a projeção dela passam a contar só os dias escolhidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2" role="radiogroup" aria-label="Dias úteis">
            {([
              [false, 'Segue os dias úteis do setor', `${doSetor.length} dias úteis no mês`],
              [true, 'Dias úteis personalizados', 'Para quem começou, saiu ou voltou no meio do mês'],
            ] as const).map(([valor, titulo, sub]) => (
              <button key={titulo} type="button" role="radio" aria-checked={personalizado === valor}
                disabled={travado}
                onClick={() => setPersonalizado(valor)}
                className={cn('rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed',
                  personalizado === valor ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40')}>
                <span className="block text-sm font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{sub}</span>
              </button>
            ))}
          </div>

          {personalizado && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="dias-desde" className="text-xs text-muted-foreground">Começou em</Label>
                  <Input id="dias-desde" type="date" className="h-8 w-[150px] text-xs" value={desde}
                    min={primeiroDia} max={ultimoDia} disabled={travado} onChange={e => setDesde(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="dias-ate" className="text-xs text-muted-foreground">Até (opcional)</Label>
                  <Input id="dias-ate" type="date" className="h-8 w-[150px] text-xs" value={ate}
                    min={desde || primeiroDia} max={ultimoDia} disabled={travado} onChange={e => setAte(e.target.value)} />
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8"
                  disabled={travado || (!desde && !ate)} onClick={aplicarIntervalo}>
                  Aplicar
                </Button>
              </div>

              <div>
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
                  {SEMANA.map((d, i) => <span key={i}>{d}</span>)}
                </div>
                <div className="grid gap-1">
                  {semanas.map((semana, i) => (
                    <div key={i} className="grid grid-cols-7 gap-1">
                      {semana.map((iso, j) => {
                        if (!iso) return <span key={j} />;
                        const util = uteisDoSetor.has(iso);
                        const marcado = dias.has(iso);
                        return (
                          <button key={iso} type="button" disabled={!util || travado}
                            aria-pressed={util ? marcado : undefined}
                            aria-label={`Dia ${Number(iso.slice(8))}${util ? (marcado ? ', trabalha' : ', não trabalha') : ', não é dia útil do setor'}`}
                            onClick={() => alternar(iso)}
                            className={cn('h-8 rounded-md text-xs tabular-nums transition-colors',
                              !util && 'cursor-default text-muted-foreground/40',
                              util && marcado && 'bg-primary font-semibold text-primary-foreground',
                              util && !marcado && 'border border-dashed border-border text-muted-foreground hover:bg-accent/40')}>
                            {Number(iso.slice(8))}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Clique no dia para tirar ou pôr. Só dá para escolher entre os dias úteis do setor.
                </p>
              </div>
            </>
          )}

          <p className={cn('rounded-md px-3 py-2 text-xs', semDia ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground')}>
            {semDia
              ? 'Escolha pelo menos um dia.'
              : <><b className="text-foreground">{qtd}</b> de {doSetor.length} dias úteis do setor. A meta diária vira a meta ÷ {qtd}.</>}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          {!somenteLeitura && (
            <Button onClick={() => void salvar()} disabled={travado || semDia} className="gap-1.5">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
