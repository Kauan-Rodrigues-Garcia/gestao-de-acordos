/**
 * PainelLixeira — o que foi excluído do Controle de Números, e o caminho de volta.
 *
 * ## Organizada pelo que a pessoa procura
 *
 * Quem abre a lixeira quer achar UMA coisa: «o número que excluí ontem», «o
 * aparelho que alguém apagou de manhã». Por isso a lista é uma linha do tempo
 * por dia — o quando é o que a memória guarda —, com busca por número,
 * aparelho, setor e quem excluiu.
 *
 * ## O aparelho e os números dele são um bloco
 *
 * Excluir um aparelho leva os números junto, no mesmo lote. Mostrá-los soltos
 * faria seis linhas parecerem seis exclusões. Aqui o aparelho é o cartão, e os
 * números do lote moram dentro dele: restaurar o aparelho traz todos, e cada
 * número ainda pode voltar sozinho — o aparelho volta junto, sem os outros.
 *
 * ## Nada sai sozinho
 *
 * Não há prazo. Sai ao restaurar, ou por «Excluir de vez» de quem tem
 * `numeros_lixeira_esvaziar`. A cópia inteira fica no banco; esta tela lista o
 * resumo e busca a trilha só quando alguém abre o histórico.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArchiveRestore, History, Loader2, RotateCcw, Search, Smartphone, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EtiquetaSituacao, EtiquetaPosse } from '@/components/numeros/EtiquetasNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  restaurarDaLixeira, excluirDaLixeira, esvaziarLixeira, type LixeiraNumeroRow,
} from '@/services/numeros/numeros.service';
import { cn } from '@/lib/utils';

type Recorte = 'tudo' | 'numeros' | 'aparelhos';

/** Uma linha da linha do tempo: um número solto, ou um aparelho com o lote dele. */
type Entrada =
  | { tipo: 'numero'; item: LixeiraNumeroRow; saiuComAparelho: boolean }
  | { tipo: 'celular'; item: LixeiraNumeroRow; numeros: LixeiraNumeroRow[]; totalNoLote: number };

export interface PainelLixeiraProps {
  empresaId: string;
  itens: LixeiraNumeroRow[];
  loading: boolean;
  erro: string | null;
  podeEsvaziar: boolean;
  /** Algo voltou ou saiu de vez — as listas do módulo precisam reler. */
  onMudou: () => void;
  /** `itemId` é o id na lixeira: a trilha guardada é lida de lá. */
  onVerHistorico: (itemId: string, numero: string) => void;
}

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** «Hoje», «Ontem», ou a data por extenso. */
function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const dias = Math.round((inicioDoDia(new Date()) - inicioDoDia(d)) / 86_400_000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function nomeDoItem(item: LixeiraNumeroRow): string {
  return item.tipo === 'celular' ? item.celular_identificacao : mascararNumero(item.numero ?? '');
}

/**
 * O item casa com a busca?
 *
 * Busca só com dígitos procura no NÚMERO, sem máscara: `(18) 9999` e `189999`
 * acham o mesmo chip. Com letras, procura no aparelho, no setor, em quem estava
 * com o número e em quem excluiu — «Celular 05» não pode achar todo número que
 * tenha `05` no meio.
 */
function casaComBusca(item: LixeiraNumeroRow, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  if (/^[\d\s()+-]+$/.test(q)) {
    const digitos = q.replace(/\D/g, '');
    return digitos.length > 0 && !!item.numero?.includes(digitos);
  }
  return [item.celular_identificacao, item.setor_nome, item.operador_nome, item.excluido_por_nome]
    .some(campo => campo?.toLowerCase().includes(q));
}

function montarEntradas(itens: LixeiraNumeroRow[], recorte: Recorte, busca: string): Entrada[] {
  const aparelhoDoLote = new Set(itens.filter(i => i.tipo === 'celular').map(i => i.lote_id));

  if (recorte === 'numeros') {
    return itens
      .filter(i => i.tipo === 'numero' && casaComBusca(i, busca))
      .map(item => ({ tipo: 'numero' as const, item, saiuComAparelho: aparelhoDoLote.has(item.lote_id) }));
  }

  const numerosDoLote = new Map<string, LixeiraNumeroRow[]>();
  for (const i of itens) {
    if (i.tipo !== 'numero' || !aparelhoDoLote.has(i.lote_id)) continue;
    numerosDoLote.set(i.lote_id, [...(numerosDoLote.get(i.lote_id) ?? []), i]);
  }

  const entradas: Entrada[] = [];
  for (const item of itens) {
    if (item.tipo === 'celular') {
      const doLote = (numerosDoLote.get(item.lote_id) ?? [])
        .sort((a, b) => (a.numero ?? '').localeCompare(b.numero ?? ''));
      // O aparelho casou: mostra o lote inteiro. Só um número casou: mostra
      // o aparelho com aquele número, para a pessoa ver onde ele está.
      const aparelhoCasa = casaComBusca(item, busca);
      const numeros = aparelhoCasa ? doLote : doLote.filter(n => casaComBusca(n, busca));
      if (aparelhoCasa || numeros.length > 0) {
        entradas.push({ tipo: 'celular', item, numeros, totalNoLote: doLote.length });
      }
    } else if (recorte === 'tudo' && !aparelhoDoLote.has(item.lote_id) && casaComBusca(item, busca)) {
      entradas.push({ tipo: 'numero', item, saiuComAparelho: false });
    }
  }
  return entradas;
}

export function PainelLixeira({
  empresaId, itens, loading, erro, podeEsvaziar, onMudou, onVerHistorico,
}: PainelLixeiraProps) {
  const [busca, setBusca]     = useState('');
  const [recorte, setRecorte] = useState<Recorte>('tudo');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Entrada | null>(null);
  const [confirmarEsvaziar, setConfirmarEsvaziar] = useState(false);
  const [esvaziando, setEsvaziando] = useState(false);

  const totalNumeros   = itens.filter(i => i.tipo === 'numero').length;
  const totalAparelhos = itens.length - totalNumeros;

  const dias = useMemo(() => {
    const grupos: { chave: string; rotulo: string; entradas: Entrada[] }[] = [];
    // `itens` chega do mais recente para o mais antigo, então o dia muda em
    // sequência e basta comparar com o grupo anterior.
    for (const e of montarEntradas(itens, recorte, busca)) {
      const d = new Date(e.item.excluido_em);
      const chave = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.chave === chave) ultimo.entradas.push(e);
      else grupos.push({ chave, rotulo: rotuloDoDia(e.item.excluido_em), entradas: [e] });
    }
    return grupos;
  }, [itens, recorte, busca]);

  async function restaurar(item: LixeiraNumeroRow, levaJunto = 0) {
    setOcupado(item.id);
    const r = await restaurarDaLixeira(item.id);
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível restaurar.'); return; }
    toast.success(item.tipo === 'celular'
      ? `${item.celular_identificacao} voltou${
          levaJunto > 0 ? ` com ${levaJunto} ${levaJunto === 1 ? 'número' : 'números'}` : ''}.`
      : `${mascararNumero(item.numero ?? '')} voltou para ${item.celular_identificacao}.`);
    onMudou();
  }

  async function excluirDeVez() {
    if (!paraExcluir) return;
    const { item } = paraExcluir;
    setOcupado(item.id);
    const r = await excluirDaLixeira(item.id);
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir de vez.'); return; }
    toast.success(`${nomeDoItem(item)} saiu da lixeira de vez.`);
    setParaExcluir(null);
    onMudou();
  }

  async function esvaziar() {
    setEsvaziando(true);
    const r = await esvaziarLixeira(empresaId);
    setEsvaziando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível esvaziar a lixeira.'); return; }
    toast.success('A lixeira foi esvaziada.');
    setConfirmarEsvaziar(false);
    onMudou();
  }

  const quemExcluiu = (item: LixeiraNumeroRow) => (
    <p
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
      title={`Excluído em ${new Date(item.excluido_em).toLocaleString('pt-BR')}`}
    >
      {item.excluido_por_nome ?? 'Alguém'} · {hora(item.excluido_em)}
    </p>
  );

  const botaoExcluirDeVez = (entrada: Entrada) => podeEsvaziar && (
    <Button
      size="icon" variant="ghost"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      disabled={ocupado === entrada.item.id}
      onClick={() => setParaExcluir(entrada)}
      title="Excluir de vez"
      aria-label={`Excluir ${nomeDoItem(entrada.item)} de vez`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  const linhaDoNumero = (item: LixeiraNumeroRow, dentroDoAparelho: boolean, saiuComAparelho = false) => {
    const trabalhando = ocupado === item.id;
    const detalhe = [
      dentroDoAparelho ? null : item.celular_identificacao,
      dentroDoAparelho ? null : item.setor_nome,
      item.operador_nome ? `estava com ${item.operador_nome}` : null,
      saiuComAparelho ? 'saiu junto com o aparelho' : null,
    ].filter(Boolean).join(' · ');

    return (
      <div className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3',
        dentroDoAparelho ? 'py-2 sm:pl-14' : 'py-2.5',
      )}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-medium tabular-nums">
              {mascararNumero(item.numero ?? '')}
            </span>
            {item.situacao && <EtiquetaSituacao situacao={item.situacao} />}
            {item.posse && <EtiquetaPosse posse={item.posse} />}
          </div>
          {detalhe && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detalhe}</p>}
        </div>

        {!dentroDoAparelho && quemExcluiu(item)}

        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="ghost" className="h-8 w-8"
            onClick={() => onVerHistorico(item.id, item.numero ?? '')}
            title="Ver histórico"
            aria-label={`Histórico de ${mascararNumero(item.numero ?? '')}`}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            size="sm" variant="outline" className="h-8"
            disabled={trabalhando}
            onClick={() => void restaurar(item)}
            title={dentroDoAparelho
              ? 'Restaura só este número. O aparelho volta junto, sem os outros.'
              : undefined}
          >
            {trabalhando
              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
            {dentroDoAparelho ? 'Só este' : 'Restaurar'}
          </Button>
          {botaoExcluirDeVez({ tipo: 'numero', item, saiuComAparelho })}
        </div>
      </div>
    );
  };

  const cartaoDoAparelho = (entrada: Extract<Entrada, { tipo: 'celular' }>) => {
    const { item, numeros, totalNoLote } = entrada;
    const trabalhando = ocupado === item.id;
    const resumo = item.quantidade_numeros === 0
      ? 'estava vazio'
      : totalNoLote === item.quantidade_numeros
        ? `${totalNoLote} ${totalNoLote === 1 ? 'número foi' : 'números foram'} junto`
        : `${totalNoLote} de ${item.quantidade_numeros} números ainda na lixeira`;

    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-muted/40 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.celular_identificacao}</p>
            <p className="truncate text-xs text-muted-foreground">
              {['Aparelho', item.setor_nome, resumo].filter(Boolean).join(' · ')}
            </p>
          </div>

          {quemExcluiu(item)}

          <div className="flex items-center gap-1">
            <Button
              size="sm" variant="outline" className="h-8"
              disabled={trabalhando}
              onClick={() => void restaurar(item, totalNoLote)}
            >
              {trabalhando
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              {totalNoLote > 0 ? `Restaurar com ${totalNoLote}` : 'Restaurar'}
            </Button>
            {botaoExcluirDeVez(entrada)}
          </div>
        </div>

        {numeros.length > 0 && (
          <ul className="divide-y border-t">
            {numeros.map(n => <li key={n.id}>{linhaDoNumero(n, true)}</li>)}
          </ul>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    );
  }

  const recortes: { valor: Recorte; rotulo: string; quantos: number }[] = [
    { valor: 'tudo',      rotulo: 'Tudo',      quantos: itens.length },
    { valor: 'numeros',   rotulo: 'Números',   quantos: totalNumeros },
    { valor: 'aparelhos', rotulo: 'Aparelhos', quantos: totalAparelhos },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tudo o que foi excluído em Celulares e Números fica aqui, com o histórico.
          Restaurar devolve do jeito que estava — nada sai sozinho.
        </p>
        {podeEsvaziar && itens.length > 0 && (
          <Button
            size="sm" variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmarEsvaziar(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Esvaziar lixeira
          </Button>
        )}
      </div>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {itens.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ArchiveRestore className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">A lixeira está vazia.</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              O que for excluído em Celulares ou Números aparece aqui, com o
              histórico, e pode ser restaurado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Número, aparelho, setor ou quem excluiu"
                className="h-9 pl-8"
                aria-label="Buscar na lixeira"
              />
            </div>
            <div role="radiogroup" aria-label="O que mostrar" className="inline-flex rounded-md border bg-background p-0.5">
              {recortes.map(r => (
                <button
                  key={r.valor} type="button" role="radio" aria-checked={recorte === r.valor}
                  onClick={() => setRecorte(r.valor)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    recorte === r.valor
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.rotulo} <span className="tabular-nums opacity-70">{r.quantos}</span>
                </button>
              ))}
            </div>
          </div>

          {dias.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {busca.trim() ? `Nada na lixeira com «${busca.trim()}».` : 'Nada neste recorte.'}
            </p>
          ) : (
            <div className="space-y-6">
              {dias.map(dia => (
                <section key={dia.chave} aria-label={dia.rotulo}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {dia.rotulo}
                    </h3>
                    <span className="text-[11px] tabular-nums text-muted-foreground/80">
                      {dia.entradas.length} {dia.entradas.length === 1 ? 'exclusão' : 'exclusões'}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  {/* A linha do tempo: o trilho tracejado é o dia, e cada ponto uma
                      exclusão. Aparelho ganha ponto na cor primária — é a exclusão
                      que levou outras junto. */}
                  <ol className="relative space-y-2 border-l border-dashed border-border pl-4 sm:ml-1">
                    {dia.entradas.map(e => (
                      <li key={e.item.id} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -left-[21.5px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-background',
                            e.tipo === 'celular' ? 'bg-primary/70' : 'bg-muted-foreground/50',
                          )}
                        />
                        {e.tipo === 'celular'
                          ? cartaoDoAparelho(e)
                          : (
                            <div className="rounded-lg border bg-card">
                              {linhaDoNumero(e.item, false, e.saiuComAparelho)}
                            </div>
                          )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog open={paraExcluir !== null} onOpenChange={a => { if (!a) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {paraExcluir ? nomeDoItem(paraExcluir.item) : 'este item'} de vez?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Sai da lixeira e não dá mais para restaurar. O histórico vai junto.</p>
                {paraExcluir?.tipo === 'celular' && (
                  <p>
                    Os números deste aparelho que estão na lixeira saem também: sem o
                    aparelho, eles não teriam para onde voltar.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={ocupado !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={e => { e.preventDefault(); void excluirDeVez(); }}
            >
              Excluir de vez
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarEsvaziar} onOpenChange={a => { if (!a && !esvaziando) setConfirmarEsvaziar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esvaziar a Lixeira de Números?</AlertDialogTitle>
            <AlertDialogDescription>
              {itens.length === 1 ? 'O item' : `Os ${itens.length} itens`} da lixeira{' '}
              {itens.length === 1 ? 'sai' : 'saem'} de vez, com o histórico. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={esvaziando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={esvaziando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={e => { e.preventDefault(); void esvaziar(); }}
            >
              {esvaziando ? 'Esvaziando...' : 'Esvaziar lixeira'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
