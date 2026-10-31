/**
 * SeloDoMes — Fechamento › Selo do mês: os números OFICIAIS de um mês fechado.
 *
 * O selo é gravado pelo banco na virada (dia 1º, 00:02) e de novo nos dias 2 a
 * 5 se o relatório do último dia mudar algum número; nunca é alterado — cada
 * correção é uma versão nova, com motivo (`services/fechamento/selo.service`).
 * Até 31/10/2026 ele existia e ninguém o via.
 *
 * O que aparece segue o alcance da aba Fechamento: com setor em foco, o setor,
 * as equipes dele e as pessoas dele — pelo lugar guardado no selo, que é onde
 * cada um estava NAQUELE mês.
 *
 * «Selar de novo» é só do super admin (o banco recusa o resto), e pede motivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Loader2, ShieldCheck, History, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { KpiTile } from '@/components/KpiTile';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { formatBRL } from '@/lib/money';
import { mesFechado } from '@/lib/fechamentoMes';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  buscarNumerosDoSelo, listarVersoesDoSelo, numerosDoAlcance, selarDeNovo,
  type NivelSelo, type NumeroSelo, type VersaoSelo,
} from '@/services/fechamento/selo.service';

const NIVEIS: readonly AbaSegmentada<NivelSelo>[] = [
  { key: 'setor', label: 'Setores', Icon: ShieldCheck },
  { key: 'equipe', label: 'Equipes', Icon: ShieldCheck },
  { key: 'operador', label: 'Pessoas', Icon: ShieldCheck },
];

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function pctMeta(n: NumeroSelo): string {
  if (!n.meta || n.meta <= 0) return '—';
  return `${((n.recebido / n.meta) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function SeloDoMes(props: {
  empresaId: string;
  mes: string;
  /** Setor em foco (o alcance da aba); `null` = todos. */
  setorId: string | null;
  /** Só o super admin sela à mão. */
  podeSelar: boolean;
}) {
  const { empresaId, mes, setorId, podeSelar } = props;
  const fechado = mesFechado(mes);

  const [versoes, setVersoes] = useState<VersaoSelo[] | null>(null);
  const [versao, setVersao] = useState<number | null>(null);
  const [numeros, setNumeros] = useState<NumeroSelo[]>([]);
  const [nivel, setNivel] = useState<NivelSelo>('setor');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [selando, setSelando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!fechado || !empresaId) { setVersoes([]); return; }
    let vivo = true;
    setCarregando(true); setErro(null);
    listarVersoesDoSelo(empresaId, mes)
      .then(v => { if (!vivo) return; setVersoes(v); setVersao(v[0]?.versao ?? null); })
      .catch(e => { if (vivo) { setErro(String(e?.message ?? e)); setVersoes([]); } })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [empresaId, mes, fechado, recarga]);

  useEffect(() => {
    if (!versao) { setNumeros([]); return; }
    let vivo = true;
    buscarNumerosDoSelo(empresaId, mes, versao)
      .then(n => { if (vivo) setNumeros(n); })
      .catch(e => { if (vivo) setErro(String(e?.message ?? e)); });
    return () => { vivo = false; };
  }, [empresaId, mes, versao]);

  const linhas = useMemo(() => numerosDoAlcance(numeros, nivel, setorId), [numeros, nivel, setorId]);
  const vigente = versoes?.find(v => v.versao === versao) ?? null;
  const totalDoAlcance = useMemo(() => {
    const doSetor = numerosDoAlcance(numeros, 'setor', setorId);
    return {
      recebido: doSetor.reduce((s, n) => s + n.recebido, 0),
      ho: doSetor.reduce((s, n) => s + n.recebidoHo, 0),
      meta: doSetor.reduce((s, n) => s + (n.meta ?? 0), 0),
    };
  }, [numeros, setorId]);

  const selar = useCallback(async () => {
    const m = motivo.trim();
    if (!m) { toast.error('Diga o motivo — ele fica gravado junto da versão.'); return; }
    setSelando(true);
    const { versao: nova, erro: falha } = await selarDeNovo(empresaId, mes, m);
    setSelando(false);
    if (falha) { toast.error(`Não foi possível selar: ${falha}`); return; }
    if (nova && versoes?.[0] && nova === versoes[0].versao) {
      toast.info('Nenhum número mudou — a versão vigente continua valendo.');
    } else {
      toast.success(`Selado: versão ${nova}.`);
    }
    setMotivo('');
    setRecarga(r => r + 1);
  }, [empresaId, mes, motivo, versoes]);

  if (!fechado) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          {rotuloDoMes(mes)} ainda está aberto. O selo é gravado à 00:02 do dia 1º, quando o mês
          fecha, e refeito nos dias 2 a 5 se o relatório do último dia mudar algum número.
        </p>
      </div>
    );
  }

  if (carregando && !versoes) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (erro) {
    return <p className="text-sm text-destructive">Não foi possível ler o selo: {erro}</p>;
  }

  if (versoes && versoes.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <Stamp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p>{rotuloDoMes(mes)} não tem selo. Os meses até setembro/2026 fecharam antes de o selo existir.</p>
          {podeSelar && <BlocoSelar motivo={motivo} onMotivo={setMotivo} selando={selando} onSelar={selar} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile rotulo="Recebido (selo)" valor={formatBRL(totalDoAlcance.recebido)} tom="primario" Icon={ShieldCheck} />
        <KpiTile rotulo="H.O." valor={formatBRL(totalDoAlcance.ho)} tom="neutro" Icon={ShieldCheck} />
        <KpiTile rotulo="Meta" valor={totalDoAlcance.meta ? formatBRL(totalDoAlcance.meta) : '—'} tom="neutro" Icon={ShieldCheck} />
        <KpiTile
          rotulo="Versão"
          valor={vigente ? `v${vigente.versao} · ${dataHora(vigente.seladoEm)}` : '—'}
          sub={vigente?.origem === 'manual' ? `à mão por ${vigente.seladoPorNome ?? 'super admin'}` : 'automática'}
          tom="sucesso" Icon={History}
        />
      </div>

      {versoes && versoes.length > 1 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Versões</p>
          <ul className="space-y-1 text-xs">
            {versoes.map(v => (
              <li key={v.versao}>
                <button
                  type="button"
                  onClick={() => setVersao(v.versao)}
                  className={cn('w-full rounded-md px-2 py-1 text-left hover:bg-muted/50',
                    v.versao === versao && 'bg-muted font-medium')}
                >
                  v{v.versao} · {dataHora(v.seladoEm)} · {v.origem === 'manual' ? `à mão (${v.seladoPorNome ?? '—'})` : 'automática'}
                  {v.motivo ? ` — ${v.motivo}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AbasSegmentadas abas={NIVEIS} ativa={nivel} onTrocar={k => setNivel(k as NivelSelo)} rotulo="Nível do selo" />

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{nivel === 'setor' ? 'Setor' : nivel === 'equipe' ? 'Equipe' : 'Pessoa'}</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="px-3 py-2 text-right font-medium">H.O.</th>
              <th className="px-3 py-2 text-right font-medium">Pagamentos</th>
              {nivel === 'operador' && <th className="px-3 py-2 text-right font-medium">Ajuste</th>}
              <th className="px-3 py-2 text-right font-medium">Meta</th>
              <th className="px-3 py-2 text-right font-medium">% da meta</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nada neste recorte.</td></tr>
            )}
            {linhas.map(n => (
              <tr key={n.alvoId} className="border-t border-border">
                <td className="px-3 py-1.5">{n.nome ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(n.recebido)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(n.recebidoHo)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{n.pagamentos}</td>
                {nivel === 'operador' && (
                  <td className="px-3 py-1.5 text-right font-mono">{n.ajuste ? formatBRL(n.ajuste) : '—'}</td>
                )}
                <td className="px-3 py-1.5 text-right font-mono">{n.meta ? formatBRL(n.meta) : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{pctMeta(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        O selo não muda: é o número que fechou o mês. Relatório importado depois da virada entra numa
        versão nova (automática até o dia 5; depois, só pelo super admin, com motivo).
      </p>

      {podeSelar && <BlocoSelar motivo={motivo} onMotivo={setMotivo} selando={selando} onSelar={selar} />}
    </div>
  );
}

function BlocoSelar(props: {
  motivo: string; onMotivo: (v: string) => void; selando: boolean; onSelar: () => void;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-xs font-medium">Selar de novo (super admin)</p>
      <p className="text-[11px] text-muted-foreground">
        Recalcula o mês com o que está no banco agora. Só nasce versão nova se algum número mudou.
      </p>
      <Textarea
        value={props.motivo}
        onChange={e => props.onMotivo(e.target.value)}
        placeholder="Motivo (fica gravado): ex. relatório de 31/10 importado no dia 6"
        className="min-h-[60px] text-xs"
      />
      <Button size="sm" onClick={props.onSelar} disabled={props.selando || !props.motivo.trim()}>
        {props.selando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Stamp className="mr-1.5 h-3.5 w-3.5" />}
        Selar de novo
      </Button>
    </div>
  );
}
