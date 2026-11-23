/**
 * O sorteio dos cupons do Pix, setor a setor (23/11/2026). Só super_admin.
 *
 * Cada setor de Pix tem a sua cota de ganhadores (Play 1/2/3 e Receptivo: 3;
 * Playmix: 2; Treinamento: 1). Concorre quem tem cupom (Pix APROVADO no
 * período). O sorteio é feito no banco (`fn_desafio_vale_sortear`) e fica
 * gravado; aqui a tela só revela, um nome de cada vez. A Manutenção é ranking
 * (os que mais recebem) — não entra aqui.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCopy, Dices, Eye, RotateCcw, Ticket, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import {
  previaDoSorteio, sortearSetor, type ConcorrenteDoSorteio, type DetalheVale, type GanhadorDoSorteio, type SetorNoVale,
} from '@/services/desafioVale/desafioVale.service';
import { periodo } from '@/services/desafioVale/regras';

export function Sorteio({ d }: { d: DetalheVale }) {
  const setores = d.todos_setores.filter(s => s.participa);
  const comPix = setores.filter(s => s.cupom_regra !== 'ranking');
  const deRanking = setores.filter(s => s.cupom_regra === 'ranking');
  if (!d.cupom_ativo || !d.cupom_inicio || !d.cupom_fim) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Dices className="h-4 w-4 text-orange-500" aria-hidden /> Sorteio dos cupons</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cupons do Pix de {periodo(d.cupom_inicio, d.cupom_fim)} · {d.cupom_pix} Pix aprovados = 1 cupom ·{' '}
        {d.sorteio_por_cupom ? 'cada cupom é uma chance' : 'uma chance por pessoa com pelo menos 1 cupom'} · ninguém ganha duas vezes.
        O sorteio é feito no banco e fica gravado; os ganhadores aparecem na gaveta do setor.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {comPix.map(s => <SorteioDoSetor key={s.setor_id} s={s} />)}
      </div>
      {deRanking.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Trophy className="h-4 w-4" aria-hidden />
          Sem sorteio (ranking dos que mais recebem): {deRanking.map(s => `${s.nome} (top ${s.cupom_ranking_qtd ?? 2})`).join(', ')}.
        </p>
      )}
    </section>
  );
}

function SorteioDoSetor({ s }: { s: SetorNoVale }) {
  const qc = useQueryClient();
  const qtd = s.sorteio_qtd ?? 0;
  const [concorrentes, setConcorrentes] = useState<ConcorrenteDoSorteio[] | null>(null);
  const [revelando, setRevelando] = useState<GanhadorDoSorteio[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [refazer, setRefazer] = useState(false);
  const ganhadores = revelando ?? s.ganhadores ?? [];
  const jaSorteado = (s.ganhadores ?? []).length > 0;

  async function verConcorrentes() {
    setOcupado(true);
    try { setConcorrentes(await previaDoSorteio(s.setor_id)); }
    catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }
  async function sortear(deNovo: boolean) {
    setOcupado(true);
    setRefazer(false);
    try {
      const r = await sortearSetor(s.setor_id, deNovo);
      if (!r.ganhadores.length) { toast.info('Ninguém tem cupom neste setor ainda — nada a sortear.'); return; }
      setRevelando(r.ganhadores);
      toast.success(`${s.nome}: ${r.ganhadores.length} sorteado${r.ganhadores.length === 1 ? '' : 's'} entre ${r.concorrentes} pessoa${r.concorrentes === 1 ? '' : 's'}.`);
      void qc.invalidateQueries({ queryKey: ['desafio-vale-detalhe'] });
      void qc.invalidateQueries({ queryKey: ['desafio-vale'] });
    } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }
  function copiar() {
    void copiarTexto([`Sorteio ${s.nome}`, ...ganhadores.map(g => `${g.posicao}º ${g.nome}`)].join('\n'), 'Ganhadores copiados.');
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{s.nome}</p>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', qtd > 0 ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300' : 'bg-destructive/10 text-destructive')}>
          {qtd > 0 ? `${qtd} ganhador${qtd === 1 ? '' : 'es'}` : 'defina a cota em Setores'}
        </span>
      </div>

      {ganhadores.length > 0 ? (
        <ol className="mt-2 space-y-1">
          {ganhadores.map((g, i) => <Revela key={`${g.perfil_id}-${revelando ? 'r' : 'g'}`} g={g} atraso={revelando ? i * 1400 : 0} nomes={concorrentes?.map(c => c.nome) ?? []} />)}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Ainda não sorteado.</p>
      )}

      {concorrentes && (
        <details className="mt-2 text-sm" open={!jaSorteado}>
          <summary className="cursor-pointer text-muted-foreground">{concorrentes.length} concorrendo · {concorrentes.reduce((a, c) => a + c.chances, 0)} chances</summary>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
            {concorrentes.map(c => (
              <li key={c.perfil_id} className="flex justify-between gap-2 text-xs">
                <span className="truncate">{c.nome}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground"><Ticket className="mr-0.5 inline h-3 w-3" aria-hidden />{c.cupons} · {c.aprovados} Pix</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={verConcorrentes} disabled={ocupado}><Eye className="mr-1 h-4 w-4" aria-hidden /> Quem concorre</Button>
        {jaSorteado || revelando
          ? <>
              <Button size="sm" variant="outline" onClick={copiar}><ClipboardCopy className="mr-1 h-4 w-4" aria-hidden /> Copiar</Button>
              <Button size="sm" variant="outline" onClick={() => setRefazer(true)} disabled={ocupado || qtd <= 0}><RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Sortear de novo</Button>
            </>
          : <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => sortear(false)} disabled={ocupado || qtd <= 0}>
              <Dices className="mr-1 h-4 w-4" aria-hidden /> Sortear {qtd > 0 ? qtd : ''}
            </Button>}
      </div>

      <AlertDialog open={refazer} onOpenChange={setRefazer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sortear {s.nome} de novo?</AlertDialogTitle>
            <AlertDialogDescription>
              Os ganhadores de agora são apagados e um sorteio novo é feito. Quem já viu o resultado na gaveta vai ver os nomes mudarem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => sortear(true)}>Sortear de novo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Um ganhador: os nomes giram por um instante e param no sorteado. */
function Revela({ g, atraso, nomes }: { g: GanhadorDoSorteio; atraso: number; nomes: string[] }) {
  const [mostrado, setMostrado] = useState<string | null>(atraso ? null : g.nome);
  const [girando, setGirando] = useState(false);
  const fila = useRef(nomes.length ? nomes : [g.nome]);
  useEffect(() => {
    if (!atraso) return;
    let giro: number | undefined;
    const comeca = window.setTimeout(() => {
      setGirando(true);
      let i = 0;
      giro = window.setInterval(() => { setMostrado(fila.current[i++ % fila.current.length]); }, 70);
    }, atraso);
    const para = window.setTimeout(() => { window.clearInterval(giro); setGirando(false); setMostrado(g.nome); }, atraso + 1200);
    return () => { window.clearTimeout(comeca); window.clearTimeout(para); window.clearInterval(giro); };
  }, [atraso, g.nome]);
  return (
    <li className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors', mostrado === g.nome && !girando ? 'bg-orange-500/10' : 'bg-muted/40')}>
      <span className="w-6 font-bold tabular-nums">{g.posicao}º</span>
      <span className={cn('truncate', girando ? 'text-muted-foreground' : 'font-semibold')}>{mostrado ?? '…'}</span>
      {!girando && mostrado === g.nome && g.cupons != null && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{g.cupons} cupom{g.cupons === 1 ? '' : 's'}</span>
      )}
    </li>
  );
}
