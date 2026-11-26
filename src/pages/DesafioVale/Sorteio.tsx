/**
 * O sorteio dos cupons do Pix, setor a setor (23/11/2026). Só super_admin.
 *
 * Cada setor de Pix tem a sua cota de ganhadores (Play 1/2/3 e Receptivo: 3;
 * Playmix: 2; Treinamento: 1). Concorre quem tem cupom (Pix APROVADO no
 * período), mais quem o super_admin adicionar. A Manutenção é ranking (os que
 * mais recebem) — não entra aqui.
 *
 * Desde 26/11/2026 o sorteio é AO VIVO (`MontarSorteioAoVivo` + o palco em
 * `components/DesafioVale/aoVivo`): abre para a plateia escolhida, contagem
 * de 5 s, e o ganhador só é sorteado no banco quando a contagem acaba.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardCopy, Dices, Eye, Radio, Ticket, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import {
  previaDoSorteio, type ConcorrenteDoSorteio, type DetalheVale, type SetorNoVale,
} from '@/services/desafioVale/desafioVale.service';
import { periodo } from '@/services/desafioVale/regras';
import { useSorteioAoVivo } from '@/components/DesafioVale/aoVivo/banco';
import { MontarSorteioAoVivo } from './MontarSorteioAoVivo';

const ROTULO_ESTADO: Record<string, string> = {
  aberto: 'na tela de todos, aguardando você começar',
  contagem: 'contagem rolando',
  revelado: 'ganhadores revelados — encerre para fechar a tela de todos',
};

export function Sorteio({ d }: { d: DetalheVale }) {
  const { show } = useSorteioAoVivo();
  const setores = d.todos_setores.filter(s => s.participa);
  const comPix = setores.filter(s => s.cupom_regra !== 'ranking');
  const deRanking = setores.filter(s => s.cupom_regra === 'ranking');
  if (!d.cupom_ativo || !d.cupom_inicio || !d.cupom_fim) return null;
  const noAr = show && (show.estado === 'aberto' || show.estado === 'contagem' || show.estado === 'revelado') ? show : null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Dices className="h-4 w-4 text-orange-500" aria-hidden /> Sorteio dos cupons — ao vivo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cupons do Pix de {periodo(d.cupom_inicio, d.cupom_fim)} · {d.cupom_pix} Pix aprovados = 1 cupom ·{' '}
        {d.sorteio_por_cupom ? 'cada cupom é uma chance' : 'uma chance por pessoa com pelo menos 1 cupom'} · ninguém ganha duas vezes.
        Em «Sortear ao vivo» você escolhe quem assiste; a tela aparece para todos ao mesmo tempo e o ganhador só é sorteado quando a contagem acaba.
      </p>
      {noAr && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm">
          <Radio className="h-4 w-4 animate-pulse text-red-500" aria-hidden />
          <strong>No ar: {noAr.setor_nome}</strong> · {ROTULO_ESTADO[noAr.estado]} · {Math.max(0, noAr.plateia - 1)} assistindo
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {comPix.map(s => <SorteioDoSetor key={s.setor_id} s={s} bloqueado={!!noAr && noAr.estado !== 'revelado'} />)}
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

function SorteioDoSetor({ s, bloqueado }: { s: SetorNoVale; bloqueado: boolean }) {
  const qtd = s.sorteio_qtd ?? 0;
  const [concorrentes, setConcorrentes] = useState<ConcorrenteDoSorteio[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [montando, setMontando] = useState(false);
  const ganhadores = s.ganhadores ?? [];
  const jaSorteado = ganhadores.length > 0;

  async function verConcorrentes() {
    setOcupado(true);
    try { setConcorrentes(await previaDoSorteio(s.setor_id)); }
    catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
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

      {jaSorteado ? (
        <ol className="mt-2 space-y-1">
          {ganhadores.map(g => (
            <li key={g.perfil_id} className="flex items-center gap-2 rounded-md bg-orange-500/10 px-2 py-1 text-sm">
              <span className="w-6 font-bold tabular-nums">{g.posicao}º</span>
              <span className="truncate font-semibold">{g.nome}</span>
            </li>
          ))}
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
        {jaSorteado && <Button size="sm" variant="outline" onClick={copiar}><ClipboardCopy className="mr-1 h-4 w-4" aria-hidden /> Copiar</Button>}
        <Button size="sm" className={cn(!jaSorteado && 'bg-orange-500 text-white hover:bg-orange-600')} variant={jaSorteado ? 'outline' : 'default'}
          onClick={() => setMontando(true)} disabled={qtd <= 0 || bloqueado}
          title={bloqueado ? 'Já tem um sorteio no ar — encerre antes.' : undefined}>
          <Radio className="mr-1 h-4 w-4" aria-hidden /> {jaSorteado ? 'Sortear de novo ao vivo' : 'Sortear ao vivo'}
        </Button>
      </div>

      {montando && <MontarSorteioAoVivo s={s} jaSorteado={jaSorteado} aberto={montando} onFechar={() => setMontando(false)} />}
    </div>
  );
}
