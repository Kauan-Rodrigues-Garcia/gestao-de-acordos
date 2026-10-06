/**
 * PainelMetaBatida — "quem bateu a meta" no topo da aba Comemorações.
 *
 * Quem bateu fica em verde, para o líder ficar sabendo sem ir ao Dashboard. Cada
 * um tem dois caminhos, porque o pedido foi esse: mandar o modelo pronto como
 * está (Enviar) ou abri-lo no editor para mexer antes (Editar). A regra de quem
 * bateu e o texto do modelo moram em `metaBatida.ts`.
 *
 * Quem tem meta e ainda não bateu aparece recolhido, com a %, para o líder ver
 * quem está chegando — mas só quem bateu ganha os botões.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, FlaskConical, PartyPopper, Pencil, Play, Send, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { mesAtual, partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import type { Comemoracao, PessoaComemoracao } from '@/services/comemoracoes.service';
import { cruzarMetas, jaComemoradosNoMes, type OperadorMeta } from './metaBatida';

interface Props {
  empresaId:    string;
  pessoas:      PessoaComemoracao[];
  comemoracoes: Comemoracao[];
  /** Algum envio em curso — trava os botões para não sair festa dobrada. */
  ocupado:      boolean;
  onEnviar:     (op: OperadorMeta) => void;
  onEditar:     (op: OperadorMeta) => void;
  /** Ensaio só na própria tela (`testeLocal.ts`) — o "Enviar" da simulação. */
  onTestar:     (op: OperadorMeta) => void;
}

/**
 * Simulação de meta batida — SÓ no `npm run dev`.
 *
 * Para ver a seção verde num mês em que ninguém bateu ainda. O localhost fala
 * com o banco de produção, então na simulação o "Enviar" vira "Testar": a festa
 * aparece só na tela de quem clicou e nada é gravado. `import.meta.env.DEV` é
 * falso no build, e o Vite tira o bloco inteiro do bundle de produção.
 */
const PODE_SIMULAR = import.meta.env.DEV;

export function PainelMetaBatida({
  empresaId, pessoas, comemoracoes, ocupado, onEnviar, onEditar, onTestar,
}: Props) {
  const mes = mesAtual();
  const [metas, setMetas] = useState<{ referencia_id: string; meta_valor: number }[] | null>(null);
  const [recebidos, setRecebidos] = useState<{ operador_id: string; total_recebido: number }[]>([]);
  const [verResto, setVerResto] = useState(false);
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    let ativo = true;
    const { ano, mes: m } = partesDoMes(mes);
    void (async () => {
      const [{ data }, resumo] = await Promise.all([
        supabase.from('metas').select('referencia_id, meta_valor')
          .eq('tipo', 'operador').eq('empresa_id', empresaId).eq('mes', m).eq('ano', ano),
        buscarResumoOperadoresAnalitico(empresaId, mes),
      ]);
      if (!ativo) return;
      setMetas((data ?? []) as { referencia_id: string; meta_valor: number }[]);
      setRecebidos(resumo.data);
    })();
    return () => { ativo = false; };
  }, [empresaId, mes]);

  const lista = useMemo(
    () => (metas ? cruzarMetas(metas, recebidos, pessoas) : []),
    [metas, recebidos, pessoas],
  );
  const comemorados = useMemo(() => jaComemoradosNoMes(comemoracoes, mes), [comemoracoes, mes]);
  const reais = useMemo(() => lista.filter((o) => o.bateu), [lista]);
  const resto = useMemo(() => lista.filter((o) => !o.bateu), [lista]);

  // Na simulação, os três primeiros "a caminho" (ou, sem meta nenhuma no mês,
  // as três primeiras pessoas) aparecem como se tivessem batido.
  const simulados: OperadorMeta[] = useMemo(() => {
    if (!simulando) return [];
    const base = resto.length > 0
      ? resto.slice(0, 3)
      : pessoas.slice(0, 3).map((p) => ({ ...p, meta: 0, recebido: 0, pct: 0, bateu: false }));
    return base.map((o, i) => ({ ...o, bateu: true, pct: 118 - i * 7 }));
  }, [simulando, resto, pessoas]);

  const bateram = simulando ? simulados : reais;
  const aCaminho = simulando ? resto.filter((o) => !simulados.some((s) => s.id === o.id)) : resto;

  // Carregando, ou ninguém com meta no mês: a seção não ocupa espaço à toa —
  // a não ser no localhost, onde ela fica para dar acesso à simulação.
  if (!metas || (lista.length === 0 && !PODE_SIMULAR)) return null;

  return (
    <section className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-semibold">Bateram a meta em {rotuloDoMes(mes).split(' ')[0].toLowerCase()}</h2>
          <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">
            {bateram.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            <strong>Enviar</strong> manda o modelo pronto · <strong>Editar</strong> abre no editor
          </p>
          {PODE_SIMULAR && (
            <Button size="sm" variant="outline"
              className="h-6 gap-1 border-dashed px-2 text-[10px]"
              onClick={() => setSimulando((s) => !s)}>
              <FlaskConical className="h-3 w-3" />
              {simulando ? 'Parar simulação' : 'Simular (só localhost)'}
            </Button>
          )}
        </div>
      </div>

      {simulando && (
        <p className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          Simulação: estes cards são de mentira. Aqui o botão é <strong>Testar</strong> — a festa
          aparece só na sua tela e nada é gravado.
        </p>
      )}

      {bateram.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          Ninguém bateu a meta ainda neste mês. Quando bater, aparece aqui em verde.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {bateram.map((op) => {
            const ja = comemorados.has(op.id);
            return (
              <div key={op.id}
                className="flex items-center gap-2.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-2">
                <Avatar className="h-9 w-9 ring-2 ring-emerald-500">
                  {op.foto_url && <AvatarImage src={op.foto_url} alt={op.nome} className="object-cover" />}
                  <AvatarFallback className="bg-emerald-600 text-xs font-bold text-white">
                    {op.nome.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{op.nome}</p>
                  <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {op.pct}% da meta
                    {ja && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground">
                        · <PartyPopper className="h-3 w-3" /> já comemorado
                      </span>
                    )}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="Editar antes de mandar"
                  disabled={ocupado} onClick={() => onEditar(op)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {simulando ? (
                  <Button size="sm"
                    className="h-8 shrink-0 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    title="Mostra só na sua tela — ninguém mais vê"
                    disabled={ocupado} onClick={() => onTestar(op)}>
                    <Play className="h-3.5 w-3.5" /> Testar
                  </Button>
                ) : (
                  <Button size="sm"
                    className="h-8 shrink-0 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    title={ja ? 'Já teve comemoração este mês — dá para mandar outra' : 'Manda o modelo pronto de meta batida'}
                    disabled={ocupado} onClick={() => onEnviar(op)}>
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aCaminho.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerResto((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn('h-3 w-3 transition-transform', verResto && 'rotate-180')} />
            {verResto ? 'Esconder' : 'Ver'} quem ainda está a caminho ({aCaminho.length})
          </button>
          {verResto && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {aCaminho.map((op) => (
                <span key={op.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
                  {op.nome.split(' ')[0]}
                  <span className={cn('font-semibold', op.pct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                    {op.pct}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
