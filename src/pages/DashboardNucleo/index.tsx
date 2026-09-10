/**
 * DashboardNucleo — a porta de entrada de quem trabalha no Núcleo.
 *
 * ## Por que não é o Dashboard da cobrança
 *
 * O Dashboard mede recebimento, acordo pago, ticket médio e meta do mês. O
 * Núcleo de Inteligência e Gestão não cobra: ele compra números de WhatsApp por
 * site, aquece cada um e distribui os que ficaram prontos aos setores que
 * cobram. Nenhum daqueles números diz nada sobre esse trabalho — para quem é do
 * Núcleo, o Dashboard abria com tudo zerado, porque a RLS não lhe entrega acordo
 * nenhum.
 *
 * A troca acontece em `PainelDeEntrada` (App.tsx): a rota `/` é a mesma, e o que
 * ela desenha muda. **O Dashboard da cobrança não é tocado** — Play 1, Play 2,
 * Play 3 e os demais setores continuam com a tela de sempre, byte por byte.
 *
 * ## O que ele mede, e por que só isto
 *
 * Só o que o módulo de Números já controla. Nada foi inventado para encher
 * espaço, e não há tabela nem coluna nova por causa desta tela — ela é uma
 * leitura diferente de `useControleNumeros`, o mesmo hook que a área de Controle
 * de Números usa.
 *
 * A ordem das seções segue a urgência de quem abre a tela às sete da manhã:
 *
 *   1. o que voltou dos setores e espera tratamento — é a única coisa aqui que
 *      alguém está esperando, e ela vem antes de qualquer contagem;
 *   2. o funil: aquecendo → pronto para liberar → nos setores;
 *   3. o que exige atenção: banidos, etiquetados, aparelhos cheios;
 *   4. a distribuição por setor, que responde «quem está com quantos».
 *
 * ## Sem estado próprio
 *
 * Nenhum `useState`. Tudo é derivado da lista que o hook entrega, e a lista
 * chega recortada pela RLS — quem abre esta tela é do Núcleo, e o Núcleo enxerga
 * os números da empresa inteira. Uma pessoa que não seja do Núcleo nunca chega
 * aqui (`PainelDeEntrada` não a manda), e se chegasse veria zeros.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Smartphone, Hash, Flame, CheckCircle2, Send,
  Ban, Tag, ArrowRight, Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { useControleNumeros } from '@/hooks/useControleNumeros';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  ETIQUETAS, ETIQUETA_LABELS, MOTIVO_LABELS, TRATAMENTO_LABELS,
  LIMITE_POR_CELULAR, etiquetasConhecidas,
  type Etiqueta, type MotivoRetorno,
} from '@/services/numeros/numerosRegras';
import type { NumeroRow } from '@/services/numeros/numeros.service';

/** Um número grande com o rótulo embaixo. A unidade de leitura desta tela. */
function Indicador({
  icone: Icone, rotulo, valor, detalhe, tom = 'neutro',
}: {
  icone: React.ElementType;
  rotulo: string;
  valor: number;
  detalhe?: string;
  tom?: 'neutro' | 'aquecendo' | 'pronto' | 'grave';
}) {
  const cores = {
    neutro:    'text-muted-foreground',
    aquecendo: 'text-warning',
    pronto:    'text-success',
    grave:     'text-destructive',
  }[tom];

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <Icone className={cn('mt-0.5 h-5 w-5 shrink-0', cores)} />
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tabular-nums">{valor}</p>
          <p className="mt-1 text-sm text-foreground">{rotulo}</p>
          {detalhe && (
            <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardNucleo() {
  const {
    aparelhos, numeros, celulares, nomeDoSetor, loading, erro,
  } = useControleNumeros();

  const nomeDoCelular = useMemo(() => {
    const mapa = new Map(celulares.map(c => [c.id, c.identificacao]));
    return (id: string) => mapa.get(id) ?? '—';
  }, [celulares]);

  /*
   * Uma passada só pela lista.
   *
   * Seis `filter` encadeados percorreriam os mesmos números seis vezes. Com
   * duzentos chips a diferença não se sente, e a intenção fica mais clara junta:
   * é UM retrato do acervo, e não seis perguntas soltas.
   */
  const retrato = useMemo(() => {
    const porSetor = new Map<string, { total: number; comOperador: number }>();
    const porEtiqueta = new Map<Etiqueta, number>();
    const porMotivo = new Map<MotivoRetorno, number>();
    const esperando: NumeroRow[] = [];
    const tratando: NumeroRow[] = [];

    let aquecendo = 0, prontos = 0, banidos = 0;
    let noNucleo = 0, nosSetores = 0, comOperador = 0;

    for (const n of numeros) {
      if (n.situacao === 'em_aquecimento') aquecendo++;
      if (n.situacao === 'banido') banidos++;

      if (n.posse === 'nucleo') {
        noNucleo++;
        // «Pronto para liberar» é o que a tela promete, então é a mesma conta
        // que `podeLiberarAoSetor` faz: ativo, no Núcleo e sem tratamento em
        // aberto. Contar só `ativo` prometeria liberações que a RPC recusaria.
        if (n.situacao === 'ativo' && n.tratamento === null) prontos++;
      } else {
        nosSetores++;
        if (n.operador_id !== null) comOperador++;

        const s = porSetor.get(n.setor_id) ?? { total: 0, comOperador: 0 };
        s.total++;
        if (n.operador_id !== null) s.comOperador++;
        porSetor.set(n.setor_id, s);
      }

      if (n.tratamento === 'pendente')     esperando.push(n);
      if (n.tratamento === 'em_andamento') tratando.push(n);
      if (n.tratamento !== null && n.motivo_retorno) {
        porMotivo.set(n.motivo_retorno, (porMotivo.get(n.motivo_retorno) ?? 0) + 1);
      }

      for (const e of etiquetasConhecidas(n.etiquetas)) {
        porEtiqueta.set(e, (porEtiqueta.get(e) ?? 0) + 1);
      }
    }

    return {
      aquecendo, prontos, banidos, noNucleo, nosSetores, comOperador,
      semOperador: nosSetores - comOperador,
      esperando, tratando, porSetor, porEtiqueta, porMotivo,
    };
  }, [numeros]);

  const aparelhosCheios = aparelhos.filter(a => a.cheio).length;
  const vagasLivres = aparelhos.reduce((soma, a) => soma + (a.celular.ativo ? a.vagas : 0), 0);

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const pendentes = retrato.esperando.length + retrato.tratando.length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Núcleo de Inteligência e Gestão</h1>
          <p className="text-sm text-muted-foreground">
            {numeros.length} {numeros.length === 1 ? 'número' : 'números'} em{' '}
            {celulares.length} {celulares.length === 1 ? 'aparelho' : 'aparelhos'}.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to={ROUTE_PATHS.CONTROLE_NUMEROS}>
            Controle de Números <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </header>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {/* ── 1. A fila de trabalho, antes de qualquer contagem ──────────────── */}
      {pendentes > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {pendentes === 1
                ? '1 número voltou de um setor'
                : `${pendentes} números voltaram dos setores`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[...retrato.porMotivo.entries()].map(([motivo, quantos]) => (
                <Badge key={motivo} variant="outline"
                       className="border-destructive/25 bg-destructive/10 text-destructive">
                  {MOTIVO_LABELS[motivo]}: {quantos}
                </Badge>
              ))}
              {retrato.tratando.length > 0 && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  <Wrench className="mr-1 h-3 w-3" />
                  {TRATAMENTO_LABELS.em_andamento}: {retrato.tratando.length}
                </Badge>
              )}
            </div>

            {/*
              Cinco, e não a lista inteira: isto é um aviso, não a tela de
              trabalho. Quem vai tratar abre o Controle de Números, onde estão as
              ações. Despejar duzentas linhas aqui faria rolar a página para
              chegar ao resto do painel.
            */}
            <ul className="space-y-1 text-sm">
              {retrato.esperando.slice(0, 5).map(n => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{mascararNumero(n.numero)}</span>
                  <span className="text-muted-foreground">
                    {nomeDoCelular(n.celular_id)} · {nomeDoSetor(n.setor_id)}
                    {n.motivo_retorno ? ` · ${MOTIVO_LABELS[n.motivo_retorno]}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {retrato.esperando.length > 5 && (
              <p className="text-xs text-muted-foreground">
                e mais {retrato.esperando.length - 5}.
              </p>
            )}

            <Button asChild size="sm" variant="outline">
              <Link to={ROUTE_PATHS.CONTROLE_NUMEROS}>Tratar agora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── 2. O funil ─────────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          icone={Flame} tom="aquecendo"
          rotulo="Em aquecimento" valor={retrato.aquecendo}
          detalhe="Ainda não podem sair do Núcleo"
        />
        <Indicador
          icone={CheckCircle2} tom="pronto"
          rotulo="Prontos para liberar" valor={retrato.prontos}
          detalhe="Ativos, no Núcleo, sem tratamento em aberto"
        />
        <Indicador
          icone={Send}
          rotulo="Nos setores" valor={retrato.nosSetores}
          detalhe={`${retrato.comOperador} com operador · ${retrato.semOperador} aguardando distribuição`}
        />
        <Indicador
          icone={Hash}
          rotulo="No Núcleo" valor={retrato.noNucleo}
          detalhe={`de ${numeros.length} cadastrados`}
        />
      </section>

      {/* ── 3. O que pede atenção ──────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador
          icone={Ban} tom={retrato.banidos > 0 ? 'grave' : 'neutro'}
          rotulo="Banidos" valor={retrato.banidos}
          detalhe="Não voltam a circular"
        />
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm text-foreground">Etiquetas em uso</p>
              {retrato.porEtiqueta.size === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum número etiquetado.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ETIQUETAS.filter(e => retrato.porEtiqueta.has(e)).map(e => (
                    <Badge key={e} variant="outline"
                           className="border-primary/30 bg-primary/10 text-primary">
                      {ETIQUETA_LABELS[e]}: {retrato.porEtiqueta.get(e)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Indicador
          icone={Smartphone}
          rotulo="Vagas livres nos aparelhos" valor={vagasLivres}
          detalhe={
            aparelhosCheios > 0
              ? `${aparelhosCheios} ${aparelhosCheios === 1 ? 'aparelho cheio' : 'aparelhos cheios'} `
                + `(${LIMITE_POR_CELULAR} números cada)`
              : `${LIMITE_POR_CELULAR} números por aparelho`
          }
        />
      </section>

      {/* ── 4. Quem está com quantos ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Distribuição pelos setores</CardTitle>
        </CardHeader>
        <CardContent>
          {retrato.porSetor.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum número liberado a setor ainda. Um número sai do Núcleo
              quando está ativo — e volta se o setor relançar.
            </p>
          ) : (
            <ul className="divide-y">
              {[...retrato.porSetor.entries()]
                .sort((a, b) => b[1].total - a[1].total)
                .map(([setorId, contagem]) => (
                  <li key={setorId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="truncate text-sm">{nomeDoSetor(setorId)}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {contagem.comOperador} de {contagem.total} distribuídos
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
