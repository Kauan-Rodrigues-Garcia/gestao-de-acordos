/**
 * FaixaMetaBatida — quem bateu a meta do mês, no alto do estúdio.
 *
 * Mesma conta da 1.0 (`pages/Comemoracoes/metaBatida.ts`): 1ª meta individual
 * do mês contra o recebido no Analítico. "Usar" carrega o modelo dourado de
 * meta batida com a pessoa já escolhida; mandar continua sendo decisão de quem
 * monta. Ninguém bateu ainda: a faixa não ocupa espaço.
 */
import { useEffect, useMemo, useState } from 'react';
import { PartyPopper, Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { mesAtual, partesDoMes } from '@/lib/mesReferencia';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import type { Comemoracao, PessoaComemoracao } from '@/services/comemoracoes.service';
import { cruzarMetas, jaComemoradosNoMes, type OperadorMeta } from '@/pages/Comemoracoes/metaBatida';

export function FaixaMetaBatida({
  empresaId, pessoas, comemoracoes, nomeDoMes, onUsar,
}: {
  empresaId:    string;
  pessoas:      PessoaComemoracao[];
  comemoracoes: Comemoracao[];
  nomeDoMes:    string;
  onUsar:       (op: OperadorMeta) => void;
}) {
  const mes = mesAtual();
  const [metas, setMetas] = useState<{ referencia_id: string; meta_valor: number }[] | null>(null);
  const [recebidos, setRecebidos] = useState<{ operador_id: string; total_recebido: number }[]>([]);

  useEffect(() => {
    let vivo = true;
    const { ano, mes: m } = partesDoMes(mes);
    void (async () => {
      const [{ data }, resumo] = await Promise.all([
        supabase.from('metas').select('referencia_id, meta_valor')
          .eq('tipo', 'operador').eq('empresa_id', empresaId).eq('mes', m).eq('ano', ano),
        buscarResumoOperadoresAnalitico(empresaId, mes),
      ]);
      if (!vivo) return;
      setMetas((data ?? []) as { referencia_id: string; meta_valor: number }[]);
      setRecebidos(resumo.data);
    })();
    return () => { vivo = false; };
  }, [empresaId, mes]);

  const bateram = useMemo(
    () => (metas ? cruzarMetas(metas, recebidos, pessoas).filter((o) => o.bateu) : []),
    [metas, recebidos, pessoas],
  );
  const comemorados = useMemo(() => jaComemoradosNoMes(comemoracoes, mes), [comemoracoes, mes]);

  if (bateram.length === 0) return null;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
          <Trophy className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Bateram a meta em {nomeDoMes.toLowerCase()}</p>
          <p className="text-[11px] text-muted-foreground">Toque em alguém para montar a festa.</p>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {bateram.map((op) => (
          <button key={op.id} type="button" onClick={() => onUsar(op)}
            title={comemorados.has(op.id) ? 'Já teve comemoração este mês' : 'Montar a comemoração'}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-card py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition-colors hover:border-amber-500 hover:bg-amber-500/10">
            <Avatar className="h-6 w-6">
              {op.foto_url && <AvatarImage src={op.foto_url} alt="" className="object-cover" />}
              <AvatarFallback className="bg-amber-500 text-[10px] font-bold text-white">{op.nome.charAt(0)}</AvatarFallback>
            </Avatar>
            {op.nome.split(' ')[0]}
            <span className="font-semibold text-amber-700 dark:text-amber-400">{op.pct}%</span>
            {comemorados.has(op.id) && <PartyPopper className="h-3 w-3 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </section>
  );
}
