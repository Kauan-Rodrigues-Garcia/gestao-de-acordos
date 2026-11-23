/**
 * Desafio do Vale — a tela do super_admin (23/11/2026).
 *
 *   • liberar para a operação (antes disso só o super_admin vê, em prévia);
 *   • o % de cada setor (o 59 do setor ÷ a meta do setor), o % manual
 *     (fechamento oficial) por cima, e quais setores participam;
 *   • confirmar o fechamento: o % congela e o prêmio vira o final;
 *   • período, médias, faixas do vale e os Cupons do Pix;
 *   • a lista de quem ganhou (para pagar), com os cupons de cada um.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCopy, Eye, Lock, Plus, RefreshCw, Ticket, Trash2, Unlock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAuth } from '@/hooks/useAuth';
import { useDesafioVale, useProjecaoDoVale, useSinalDoDesafioVale } from '@/hooks/useDesafioVale';
import { GavetaDesafioVale } from '@/components/DesafioVale/GavetaDesafioVale';
import {
  apagarResultadoVale, buscarDetalheVale, fecharVale, gravarResultadoVale, liberarVale, recalcularVale, salvarConfigVale, salvarSetorVale,
  type ConfigDoVale, type DetalheVale, type FaixaVale, type ResultadoVale, type SetorNoVale,
} from '@/services/desafioVale/desafioVale.service';
import {
  faixaDoSetor, faixaPiso, faixasOrdenadas, pctCortado, periodo, reais, textoDaFaixa,
} from '@/services/desafioVale/regras';
import { montarResultadoVale } from '@/services/desafioVale/resultado';
import { brl, hojeEmSaoPaulo, horaCurta, lerValorEmReais, medias } from '@/services/desafioCobranca/regras';
import { VerComo } from './VerComo';
import { Sorteio } from './Sorteio';
import { QuemViu } from '@/components/DesafioVale/QuemViu';
import { ArteObrigatoria, ESPERA_DA_ARTE } from '@/components/DesafioVale/ArteObrigatoria';

const CHAVE = ['desafio-vale-detalhe'];
const caixa = 'rounded-xl border border-border bg-card p-4';

export default function DesafioValePagina() {
  useSinalDoDesafioVale(true, [CHAVE, ['desafio-vale']]);
  const q = useQuery({ queryKey: CHAVE, queryFn: buscarDetalheVale, refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: false });
  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando o desafio…</p>;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Desafio do Vale</h1>
        <p className="mt-2 text-sm text-destructive">Não deu para carregar: {(q.error as Error).message}</p>
        <p className="mt-2 text-sm text-muted-foreground">Se a migration <code>20261123120000_desafio_vale</code> ainda não foi colada no SQL Editor, é ela que cria o desafio de 23 a 30/11.</p>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Desafio do Vale</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nenhum desafio ativo.</p>
      </div>
    );
  }
  return <ComProjecao d={q.data} />;
}

/** O % de cada setor pela projeção do mês — o mesmo que a operação vê. */
function ComProjecao({ d }: { d: DetalheVale }) {
  const p = useProjecaoDoVale(d, hojeEmSaoPaulo()) ?? d;
  return <Painel d={p} />;
}

function useRecarregar() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: CHAVE }), qc.invalidateQueries({ queryKey: ['desafio-vale'] })]);
}

function Painel({ d }: { d: DetalheVale }) {
  const [vendo, setVendo] = useState(false);
  const atual = useDesafioVale(true);
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-300">
            <Ticket className="h-4 w-4" aria-hidden /> Campanha especial · só super admin
          </p>
          <h1 className="mt-1 text-2xl font-bold">{d.titulo} · {d.premio_nome}</h1>
          <p className="text-sm text-muted-foreground">
            {periodo(d.inicio, d.fim)} · {medias(d.medias)}
            {d.cupom_ativo && d.cupom_inicio && d.cupom_fim ? ` · cupons do Pix de ${periodo(d.cupom_inicio, d.cupom_fim)} (${d.cupom_pix} Pix aprovados = 1 cupom)` : ' · cupons desligados'}
          </p>
        </div>
        <Button variant="outline" onClick={() => setVendo(true)} disabled={!atual.data}>
          <Eye className="mr-1.5 h-4 w-4" aria-hidden /> Ver a gaveta
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Liberacao d={d} />
        <Fechamento d={d} />
      </div>
      <CartaoQuemViu d={d} atual={atual.data ?? null} />
      <VerComo d={d} atual={atual.data} />
      <Setores d={d} />
      <Ganhadores d={d} />
      <Sorteio d={d} />
      <Configuracao d={d} />

      {atual.data && <GavetaDesafioVale d={atual.data} aberta={vendo} onFechar={() => setVendo(false)} />}
    </main>
  );
}

/** A arte obrigatória: quem já leu (fechou com «Bora pra cima») e a prévia da janela. */
function CartaoQuemViu({ d, atual }: { d: DetalheVale; atual: import('@/services/desafioVale/desafioVale.service').DesafioVale | null }) {
  const [vendo, setVendo] = useState(false);
  return (
    <section className={caixa}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 font-semibold"><Eye className="h-4 w-4" aria-hidden /> Quem viu a arte</h2>
        <Button variant="outline" size="sm" onClick={() => setVendo(true)} disabled={!atual}>Ver como aparece</Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {d.liberado
          ? `Liberado o desafio, a arte abre sozinha para cada pessoa ao entrar no Gestão e só fecha no «Bora pra cima!» (libera em ${ESPERA_DA_ARTE} segundos). Cada «Bora pra cima» conta aqui.`
          : `Quando você liberar, a arte abre sozinha para cada pessoa ao entrar no Gestão e só fecha no «Bora pra cima!» (libera em ${ESPERA_DA_ARTE} segundos).`}
      </p>
      {d.liberado && <div className="mt-3"><QuemViu /></div>}
      {vendo && atual && <ArteObrigatoria d={atual} chaveAbertura={null} previa onConfirmou={() => setVendo(false)} />}
    </section>
  );
}

function Liberacao({ d }: { d: DetalheVale }) {
  const recarregar = useRecarregar();
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  async function trocar() {
    setSalvando(true);
    try {
      await liberarVale(d.id, !d.liberado);
      await recarregar();
      toast.success(d.liberado ? 'Desafio escondido da operação.' : 'Desafio liberado: a operação já vê a pílula.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); setConfirmar(false); }
  }
  return (
    <section className={caixa}>
      <h2 className="flex items-center gap-2 font-semibold">
        {d.liberado ? <Unlock className="h-4 w-4 text-success" aria-hidden /> : <Lock className="h-4 w-4 text-warning" aria-hidden />}
        {d.liberado ? 'Liberado para a operação' : 'Prévia: só você vê'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {d.liberado
          ? `Os setores marcados veem a pílula e a gaveta${d.liberado_em ? ` desde ${new Date(d.liberado_em).toLocaleString('pt-BR')}` : ''}.`
          : 'Ninguém da operação vê nada ainda. Confira a gaveta, os setores e as faixas antes.'}
      </p>
      <Button className="mt-3" variant={d.liberado ? 'outline' : 'default'} onClick={() => setConfirmar(true)} disabled={salvando}>
        {d.liberado ? 'Esconder da operação' : 'Liberar para a operação'}
      </Button>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.liberado ? 'Esconder o desafio?' : 'Liberar o desafio?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {d.liberado
                ? 'A pílula e a gaveta somem para a operação. Nada é apagado.'
                : `Todos dos ${d.todos_setores.filter(s => s.participa).length} setores marcados passam a ver o desafio e os cupons, e a aba Pix destaca os Pix do período.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={trocar}>{d.liberado ? 'Esconder' : 'Liberar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Fechamento({ d }: { d: DetalheVale }) {
  const recarregar = useRecarregar();
  const { empresa } = useEmpresa();
  const { perfil } = useAuth();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  async function recalcular() {
    setOcupado(true);
    try { await recalcularVale(d.id); await recarregar(); toast.success('% dos setores refeito pelo 59 vigente.'); }
    catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }
  /**
   * Grava o resultado de cada pessoa (médias, vale, cupons) com o % já
   * congelado. Depois disso a virada do mês — mudança de setor, Analítico
   * relido — não muda mais o que cada um vê.
   */
  async function gravarResultado() {
    const congelado = await buscarDetalheVale();
    if (!congelado || !empresa?.id) throw new Error('Não deu para ler o desafio para gravar o resultado.');
    const linhas = await montarResultadoVale(congelado, empresa.id);
    await gravarResultadoVale(d.id, linhas, perfil?.id ?? null);
    await recarregar();
    toast.success(`Resultado gravado: ${linhas.length} pessoas, ${linhas.filter(l => l.bateu).length} com o vale.`);
  }
  async function fechar() {
    setOcupado(true);
    try {
      if (d.fechado_em) {
        await apagarResultadoVale(d.id);
        await fecharVale(d.id, false);
        await recarregar();
        toast.success('Fechamento desfeito: o % volta a seguir o 59 e o resultado volta a ser provisório.');
      } else {
        await recalcularVale(d.id);
        await fecharVale(d.id, true);
        await gravarResultado();
      }
    } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); setConfirmar(false); }
  }
  async function regravar() {
    setOcupado(true);
    try { await gravarResultado(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  }
  return (
    <section className={caixa}>
      <h2 className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className={cn('h-4 w-4', d.fechado_em ? 'text-success' : 'text-muted-foreground')} aria-hidden />
        {d.fechado_em ? 'Fechamento confirmado' : 'Fechamento do mês'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {d.fechado_em
          ? `Congelado em ${new Date(d.fechado_em).toLocaleString('pt-BR')}: o % dos setores não segue mais o 59.`
          : <>O % segue o 59 de hora em hora{d.calculado_lote ? <> (último: relatório das {horaCurta(d.calculado_lote)})</> : null}. Depois do dia {d.fim.slice(8, 10)}/{d.fim.slice(5, 7)}, confira e confirme.</>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!d.fechado_em && (
          <Button variant="outline" onClick={recalcular} disabled={ocupado}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', ocupado && 'animate-spin')} aria-hidden /> Recalcular agora
          </Button>
        )}
        <Button variant={d.fechado_em ? 'outline' : 'default'} onClick={() => setConfirmar(true)} disabled={ocupado}>
          {d.fechado_em ? 'Desfazer o fechamento' : 'Confirmar o fechamento'}
        </Button>
        {d.fechado_em && (
          <Button variant="outline" onClick={regravar} disabled={ocupado}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', ocupado && 'animate-spin')} aria-hidden /> Gravar o resultado de novo
          </Button>
        )}
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.fechado_em ? 'Desfazer o fechamento?' : 'Confirmar o fechamento?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {d.fechado_em
                ? 'O % dos setores volta a ser relido do 59 a cada lote, e o prêmio volta a aparecer como provisório.'
                : 'O % de cada setor (o manual, quando digitado) fica congelado e o resultado de cada pessoa (médias, vale e cupons) é gravado: a gaveta passa a mostrar o final, e a virada do mês não muda mais nada. Confirme depois do último 59 do mês (pagamento com data de novembro ainda pode chegar no dia 1º). Dá para desfazer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={fechar}>{d.fechado_em ? 'Desfazer' : 'Confirmar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Setores({ d }: { d: DetalheVale }) {
  return (
    <section className={caixa}>
      <h2 className="font-semibold">Setores e o % do mês</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Realizado = o 59 do setor (a mesma atribuição do Painel Diretoria) ÷ a meta do setor na aba Metas. Projeção = onde o setor fecha no ritmo de hoje
        (a conta do Painel, com os dias úteis do setor) — é ela que decide o vale durante o mês. O % manual é o fechamento oficial e ganha dos dois; com o
        fechamento confirmado, vale o realizado. Setor Cofen não sai do 59: digite o % dele.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">Setor</th>
              <th className="py-2 pr-3">Participa</th>
              <th className="py-2 pr-3 text-right">Recebido · meta</th>
              <th className="py-2 pr-3 text-right">Realizado</th>
              <th className="py-2 pr-3 text-right">Projeção</th>
              <th className="py-2 pr-3">% manual</th>
              <th className="py-2 pr-3">2ª parte</th>
              <th className="py-2 text-right">Vale</th>
            </tr>
          </thead>
          <tbody>
            {d.todos_setores.map(s => <LinhaSetor key={s.setor_id} d={d} s={s} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LinhaSetor({ d, s }: { d: DetalheVale; s: SetorNoVale }) {
  const recarregar = useRecarregar();
  const [manual, setManual] = useState(s.pct_manual === null ? '' : String(s.pct_manual).replace('.', ','));
  const [salvando, setSalvando] = useState(false);
  const faixa = faixaDoSetor(s.pct, d.faixas);
  async function salvar(patch: Partial<{ participa: boolean; pct_manual: number | null; cupom_regra: 'pix' | 'ranking'; cupom_ranking_qtd: number; sorteio_qtd: number }>) {
    setSalvando(true);
    try {
      await salvarSetorVale(d.id, { setor_id: s.setor_id, participa: s.participa, pct_manual: s.pct_manual, ...patch });
      await recarregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  }
  function salvarManual() {
    const t = manual.trim().replace('%', '');
    const v = t === '' ? null : Number(t.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0)) { toast.error('Digite um % válido, ex.: 97,5'); return; }
    if (v === s.pct_manual) return;
    void salvar({ pct_manual: v });
  }
  return (
    <tr className={cn('border-b border-border/50', !s.participa && 'opacity-60')}>
      <td className="py-2 pr-3">
        <span className="font-medium">{s.nome}</span>
        <span className="block text-xs text-muted-foreground">{s.cidade ?? '—'}{s.regra === 'cofen' ? ' · regra Cofen' : ''}</span>
      </td>
      <td className="py-2 pr-3">
        <Switch checked={s.participa} disabled={salvando} onCheckedChange={(v) => salvar({ participa: v })} aria-label={`${s.nome} participa`} />
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground">
        {s.recebido !== null ? brl(s.recebido) : '—'}<br />{s.meta ? brl(s.meta) : 'sem meta'}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{s.pct_auto !== null ? `${pctCortado(s.pct_auto)}%` : '—'}</td>
      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{s.origem === 'projecao' && s.pct !== null ? `${pctCortado(s.pct)}%` : '—'}</td>
      <td className="py-2 pr-3">
        <Input
          value={manual} onChange={(e) => setManual(e.target.value)} onBlur={salvarManual}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="—" className="h-8 w-24" disabled={salvando} aria-label={`% manual de ${s.nome}`}
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs" disabled={salvando}
            value={s.cupom_regra ?? 'pix'} aria-label={`2ª parte de ${s.nome}`}
            onChange={(e) => salvar({ cupom_regra: e.target.value as 'pix' | 'ranking' })}
          >
            <option value="pix">Cupons do Pix</option>
            <option value="ranking">Ranking</option>
          </select>
          {s.cupom_regra === 'ranking' ? (
            <select
              className="h-8 rounded-md border border-input bg-background px-1 text-xs" disabled={salvando}
              value={s.cupom_ranking_qtd ?? 2} aria-label={`Quantos ganham em ${s.nome}`}
              onChange={(e) => salvar({ cupom_ranking_qtd: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>top {n}</option>)}
            </select>
          ) : (
            <select
              className={cn('h-8 rounded-md border border-input bg-background px-1 text-xs', !s.sorteio_qtd && s.participa && 'border-destructive text-destructive')}
              disabled={salvando} value={s.sorteio_qtd ?? 0} aria-label={`Quantos sorteados em ${s.nome}`}
              onChange={(e) => salvar({ sorteio_qtd: Number(e.target.value) })}
            >
              <option value={0}>sorteia —</option>
              {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>sorteia {n}</option>)}
            </select>
          )}
        </div>
      </td>
      <td className="py-2 text-right font-semibold tabular-nums">
        {faixa ? reais(faixa.valor) : <span className="text-xs font-normal text-muted-foreground">mín. {reais(faixaPiso(d.faixas)?.valor ?? 0)}</span>}
        {s.origem === 'manual' && <span className="block text-[10px] font-normal uppercase text-muted-foreground">manual</span>}
      </td>
    </tr>
  );
}

/** A lista para pagar: quem bateu as médias, setor a setor, e os cupons de cada um. */
function Ganhadores({ d }: { d: DetalheVale }) {
  const { empresa } = useEmpresa();
  const [lista, setLista] = useState<ResultadoVale[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  async function montar() {
    if (!empresa?.id) return;
    setCarregando(true);
    try { setLista(await montarResultadoVale(d, empresa.id)); }
    catch (e) { toast.error((e as Error).message); } finally { setCarregando(false); }
  }
  const mostrar = (lista ?? []).filter(g => g.bateu || g.cupons > 0 || g.pix_pendentes > 0 || !!g.ranking_posicao);
  const ganhadores = mostrar.filter(g => g.valor > 0);
  const total = ganhadores.reduce((s, g) => s + g.valor, 0);
  function copiar() {
    const linhas = ['Setor\tEquipe\tOperador\tMédias\tRecebido\tVale\tCupons\tPix pendentes\tRanking',
      ...mostrar.map(g => [g.setor_nome ?? '—', g.equipe_nome ?? '—', g.nome, g.medias.toLocaleString('pt-BR'), brl(g.feito),
        g.valor ? reais(g.valor) : '—', g.cupons, g.pix_pendentes, g.ranking_posicao ? `${g.ranking_posicao}º` : '—'].join('\t'))];
    void copiarTexto(linhas.join('\n'), 'Lista copiada — cole numa planilha.');
  }
  return (
    <section className={caixa}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 font-semibold"><Users className="h-4 w-4" aria-hidden /> Quem ganhou</h2>
        <Button variant="outline" onClick={montar} disabled={carregando}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', carregando && 'animate-spin')} aria-hidden /> {lista ? 'Montar de novo' : 'Montar a lista'}
        </Button>
        {lista && <Button variant="outline" onClick={copiar}><ClipboardCopy className="mr-1.5 h-4 w-4" aria-hidden /> Copiar</Button>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Lê o Analítico de cada setor que participa (pode levar alguns segundos). {d.fechado_em ? 'Fechamento confirmado: a gaveta de cada um mostra o resultado gravado.' : 'Valores provisórios até confirmar o fechamento.'}
        {' '}Depois do fim, quem é de qual setor sai do retrato de {d.fim.slice(5, 7)}/{d.fim.slice(0, 4)}.
      </p>
      {lista && (
        <>
          <p className="mt-3 text-sm"><strong>{ganhadores.length}</strong> bateram as {medias(d.medias)} · total em vales: <strong>{reais(total)}</strong></p>
          <div className="mt-2 max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Operador</th><th className="py-2 pr-3">Setor · equipe</th>
                  <th className="py-2 pr-3 text-right">Médias</th><th className="py-2 pr-3 text-right">Vale</th><th className="py-2 text-right">Cupons</th>
                </tr>
              </thead>
              <tbody>
                {mostrar.map(g => (
                  <tr key={g.perfil_id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium">{g.nome}</td>
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">{g.setor_nome ?? '—'}{g.equipe_nome ? ` · ${g.equipe_nome}` : g.meta === null ? ' · só cupons' : ''}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{g.meta === null ? '—' : g.medias.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{g.valor ? reais(g.valor) : '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {g.ranking_posicao ? <span className="font-semibold text-success">{g.ranking_posicao}º no ranking</span>
                        : <>{g.cupons}{g.pix_pendentes ? <span className="text-xs text-warning"> +{g.pix_pendentes} pend.</span> : null}</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Configuracao({ d }: { d: DetalheVale }) {
  const recarregar = useRecarregar();
  const [c, setC] = useState<ConfigDoVale>({
    titulo: d.titulo, premio_nome: d.premio_nome, inicio: d.inicio, fim: d.fim, medias: d.medias,
    faixas: faixasOrdenadas(d.faixas), cupom_ativo: d.cupom_ativo, cupom_inicio: d.cupom_inicio, cupom_fim: d.cupom_fim,
    cupom_pix: d.cupom_pix, cupom_premio: d.cupom_premio, sorteio_por_cupom: d.sorteio_por_cupom === true,
  });
  const [salvando, setSalvando] = useState(false);
  const muda = <K extends keyof ConfigDoVale>(k: K, v: ConfigDoVale[K]) => setC(x => ({ ...x, [k]: v }));
  const mudaFaixa = (i: number, f: Partial<FaixaVale>) => setC(x => ({ ...x, faixas: x.faixas.map((y, j) => (j === i ? { ...y, ...f } : y)) }));

  async function salvar() {
    if (!c.titulo.trim() || !c.inicio || !c.fim || c.fim < c.inicio) { toast.error('Confira o título e o período.'); return; }
    if (!(c.medias > 0)) { toast.error('As médias precisam ser maiores que zero.'); return; }
    if (c.faixas.length === 0 || c.faixas.some(f => !(f.valor >= 0) || !(f.pct >= 0))) { toast.error('Confira as faixas.'); return; }
    if (c.cupom_ativo && (!c.cupom_inicio || !c.cupom_fim || c.cupom_fim < c.cupom_inicio)) { toast.error('Confira o período dos cupons.'); return; }
    setSalvando(true);
    try {
      await salvarConfigVale(d.id, { ...c, faixas: faixasOrdenadas(c.faixas), titulo: c.titulo.trim(), premio_nome: c.premio_nome.trim() || 'vale' });
      await recarregar();
      toast.success('Configuração salva.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  }

  const rotulo = 'mb-1 block text-xs font-medium text-muted-foreground';
  return (
    <section className={caixa}>
      <h2 className="font-semibold">Configuração</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2"><span className={rotulo}>Título</span><Input value={c.titulo} onChange={e => muda('titulo', e.target.value)} /></label>
        <label className="sm:col-span-2"><span className={rotulo}>Nome do prêmio</span><Input value={c.premio_nome} onChange={e => muda('premio_nome', e.target.value)} /></label>
        <label><span className={rotulo}>Início</span><Input type="date" value={c.inicio} onChange={e => muda('inicio', e.target.value)} /></label>
        <label><span className={rotulo}>Fim</span><Input type="date" value={c.fim} onChange={e => muda('fim', e.target.value)} /></label>
        <label><span className={rotulo}>Médias para ganhar</span>
          <Input inputMode="decimal" value={String(c.medias).replace('.', ',')} onChange={e => muda('medias', Number(e.target.value.replace(',', '.')) || 0)} />
        </label>
      </div>

      <h3 className="mt-5 text-sm font-semibold">Faixas do vale (pelo % do setor no fechamento)</h3>
      <div className="mt-2 space-y-2">
        {c.faixas.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">setor com</span>
            <Input className="h-8 w-20" inputMode="decimal" value={String(f.pct)} onChange={e => mudaFaixa(i, { pct: Number(e.target.value.replace(',', '.')) || 0 })} aria-label="% mínimo" />
            <span className="text-muted-foreground">% ou mais → vale de R$</span>
            <Input className="h-8 w-24" inputMode="decimal" value={String(f.valor).replace('.', ',')}
              onChange={e => mudaFaixa(i, { valor: lerValorEmReais(e.target.value) ?? 0 })} aria-label="Valor do vale" />
            <span className="text-xs text-muted-foreground">({textoDaFaixa(f, faixasOrdenadas(c.faixas))})</span>
            <Button variant="ghost" size="sm" onClick={() => setC(x => ({ ...x, faixas: x.faixas.filter((_, j) => j !== i) }))} disabled={c.faixas.length <= 1} aria-label="Tirar a faixa">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setC(x => ({ ...x, faixas: [...x.faixas, { pct: 0, valor: 0 }] }))} disabled={c.faixas.length >= 6}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Faixa
        </Button>
        <p className="text-xs text-muted-foreground">O % é cortado, não arredondado: 99,6% fica na faixa dos 90%. Deixe uma faixa com 0% como o piso.</p>
      </div>

      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold">
        <Switch checked={c.cupom_ativo} onCheckedChange={v => muda('cupom_ativo', v)} aria-label="Cupons do Pix ligados" /> Cupons do Pix
      </h3>
      <div className={cn('mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4', !c.cupom_ativo && 'opacity-50')}>
        <label><span className={rotulo}>De</span><Input type="date" value={c.cupom_inicio ?? ''} onChange={e => muda('cupom_inicio', e.target.value || null)} disabled={!c.cupom_ativo} /></label>
        <label><span className={rotulo}>Até</span><Input type="date" value={c.cupom_fim ?? ''} onChange={e => muda('cupom_fim', e.target.value || null)} disabled={!c.cupom_ativo} /></label>
        <label><span className={rotulo}>Pix aprovados por cupom</span>
          <Input inputMode="numeric" value={String(c.cupom_pix)} onChange={e => muda('cupom_pix', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={!c.cupom_ativo} />
        </label>
        <label><span className={rotulo}>Para que serve o cupom (aparece na gaveta)</span>
          <Input value={c.cupom_premio} placeholder="ex.: sorteio de hot dog" onChange={e => muda('cupom_premio', e.target.value)} disabled={!c.cupom_ativo} />
        </label>
      </div>
      <label className={cn('mt-3 flex items-center gap-2 text-sm', !c.cupom_ativo && 'opacity-50')}>
        <Switch checked={c.sorteio_por_cupom} onCheckedChange={v => muda('sorteio_por_cupom', v)} disabled={!c.cupom_ativo} aria-label="Cada cupom é uma chance" />
        {c.sorteio_por_cupom ? 'No sorteio, cada cupom é uma chance (quem tem mais cupons, mais chances)' : 'No sorteio, uma chance por pessoa com pelo menos 1 cupom'}
      </label>
      <p className="mt-2 text-xs text-muted-foreground">Conta o dia em que o Pix foi registrado na aba Pix Automático; só vira cupom depois de aprovado pelo líder.</p>

      <Button className="mt-4" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar configuração'}</Button>
    </section>
  );
}
