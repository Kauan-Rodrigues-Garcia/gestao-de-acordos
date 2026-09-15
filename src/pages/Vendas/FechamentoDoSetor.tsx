/**
 * Fechamento do Setor — onde foi parar cada real do retrato do mês.
 *
 * ## A tela existe para poder dar errado
 *
 * Um painel que só mostra o número do setor é fácil de fazer e impossível de
 * conferir: quando ele discorda do ERP, não há por onde começar. Esta tela
 * mostra as PARCELAS e afirma que elas somam o total — e quando não somam, diz
 * isso em cima, antes de qualquer número bonito.
 *
 * É a mesma lição do 59 da cobrança: o que resolveu a briga entre as telas não
 * foi somar melhor, foi escrever «total − colchão = soma dos setores» num lugar
 * que pudesse falhar em voz alta.
 *
 * ## As duas falhas não são a mesma coisa, e a tela as separa
 *
 * «Os destinos não somam o total» é defeito de código — a função SQL ganhou um
 * estado que o `CASE` dela não previu. Não há o que a liderança faça.
 *
 * «O gravado não bate com o retrato» é rotina: a carga entrou e a projeção
 * ainda não rodou. O conserto é um botão na aba Importar. Tratar as duas com o
 * mesmo alarme vermelho ensinaria a ignorar os dois.
 *
 * ## O robô aparece, e aparece somando
 *
 * A venda da automação é confirmada, assinada e entrou no caixa do setor — ela
 * conta. O que a tela faz é mostrá-la à parte, para que «o setor fez X» e «as
 * pessoas fizeram Y» sejam duas leituras visíveis, e não uma escondendo a
 * outra.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scale, Building2, Bot, Users, TriangleAlert, CircleCheck, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { formatBRL } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  EXPLICACAO_DO_DESTINO, fatiaDaAutomacao,
  type Fechamento, type Igualdade, type LinhaFechamento,
} from '@/lib/vendasFechamento';
import { buscarFechamentoDoSetor } from '@/services/vendas/fechamentoSetor.service';

interface Setor { id: string; nome: string }

/** Uma parcela: rótulo, contagem e os dois valores. */
function Parcela({ linha, destaque, explicacao }: {
  linha: LinhaFechamento; destaque?: boolean; explicacao?: string;
}) {
  const vazia = linha.linhas === 0;
  return (
    <div className={cn(
      'rounded-lg border p-3 sm:p-4',
      destaque ? 'border-primary/40 bg-primary/5' : 'border-border',
      vazia && !destaque && 'opacity-60',
    )}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={cn('text-sm', destaque ? 'font-semibold' : 'font-medium')}>
          {linha.rotulo}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {linha.linhas} {linha.linhas === 1 ? 'venda' : 'vendas'}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn('tabular-nums', destaque ? 'text-xl font-bold' : 'text-lg font-semibold')}>
          {formatBRL(linha.valor_na_regua)}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          na régua · {linha.linhas_na_regua} de {linha.linhas}
        </span>
      </div>
      <div className="mt-0.5 tabular-nums text-xs text-muted-foreground">
        {formatBRL(linha.valor)} no bruto
      </div>
      {explicacao && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explicacao}</p>
      )}
    </div>
  );
}

/** O farol de uma igualdade. Verde some; vermelho explica. */
function Farol({ igualdade, quandoFecha, quandoFalha, rotina }: {
  igualdade: Igualdade; quandoFecha: string; quandoFalha: string; rotina?: boolean;
}) {
  if (!igualdade.aplicavel) return null;

  if (igualdade.fecha) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span className="text-sm text-success">{quandoFecha}</span>
      </div>
    );
  }

  const Icone = rotina ? Info : TriangleAlert;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border p-3',
      rotina ? 'border-warning/30 bg-warning/10' : 'border-destructive/30 bg-destructive/10',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', rotina ? 'text-warning' : 'text-destructive')} />
      <div className={cn('text-sm', rotina ? 'text-warning' : 'text-destructive')}>
        <p>{quandoFalha}</p>
        <p className="mt-1 tabular-nums text-xs opacity-90">
          Diferença: {igualdade.diferencaLinhas} {Math.abs(igualdade.diferencaLinhas) === 1 ? 'venda' : 'vendas'}
          {' · '}{formatBRL(igualdade.diferencaValor)}
        </p>
      </div>
    </div>
  );
}

export default function FechamentoDoSetor() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();
  const empresaId = empresa?.id ?? null;

  /*
   * O mesmo portão que a RPC aplica, adiantado aqui.
   *
   * Não é a trava — a trava é `fn_vendas_fechamento_do_setor`, que é
   * SECURITY DEFINER e recusa sozinha. Isto existe para que quem não alcança
   * leia POR QUE, em vez de ver uma tela vazia ou um erro de banco.
   */
  const escopo = escopoEfetivo('vendas', temPermissao);
  const alcanca = escopo === 'setor' || escopo === 'todos_setores';

  const [setores, setSetores] = useState<Setor[]>([]);
  const [setorId, setSetorId] = useState<string | null>(null);
  const [dado, setDado] = useState<Fechamento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Os setores da empresa. A RLS de `setores` já recorta; o portão de verdade
  // é o da RPC, que recusa setor fora do alcance com mensagem própria.
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from('setores').select('id, nome')
        .eq('empresa_id', empresaId).order('nome');
      if (!vivo) return;
      const lista = (data ?? []) as Setor[];
      setSetores(lista);
      // Um setor só: escolher por quem olha seria cerimônia sem escolha.
      setSetorId(atual => atual ?? (lista.length === 1 ? lista[0].id : null));
    })();
    return () => { vivo = false; };
  }, [empresaId]);

  const carregar = useCallback(async () => {
    if (!alcanca) { setDado(null); return; }
    if (!empresaId || !setorId) { setDado(null); return; }
    setCarregando(true);
    const r = await buscarFechamentoDoSetor({ empresaId, setorId, mes });
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); setDado(null); return; }
    setErro(null);
    setDado(r.dado);
  }, [alcanca, empresaId, setorId, mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  const nomeDoSetor = useMemo(
    () => setores.find(s => s.id === setorId)?.nome ?? '',
    [setores, setorId],
  );

  const doSetor = dado?.destinos.find(d => d.destino === 'deste_setor') ?? null;
  const fatiaIa = dado ? fatiaDaAutomacao(dado) : 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">Fechamento do Setor</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Onde foi parar cada real do retrato de {rotuloDoMes(mes)}. As parcelas abaixo
          são exclusivas e somam o total — e quando não somam, esta tela avisa antes
          de mostrar qualquer número.
        </p>
        {alcanca && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={setorId ?? ''} onValueChange={v => setSetorId(v || null)}>
            <SelectTrigger className="w-[260px]">
              <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Escolha o setor" />
            </SelectTrigger>
            <SelectContent>
              {setores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SeletorMes mes={mes} onChange={setMes} />
        </div>
        )}
      </header>

      {!alcanca && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>Esta tela mostra a conta do setor inteiro, e seu acesso em Vendas
               alcança menos que isso.</p>
            <p className="mt-1">
              Não existe versão recortada dela: a graça é que as parcelas SOMEM o
              total, e uma fatia individual não soma nada. Quem cuida das permissões
              pode liberar o alcance de setor em Vendas.
            </p>
          </div>
        </div>
      )}

      {alcanca && erro && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span className="text-sm text-destructive">{erro}</span>
        </div>
      )}

      {alcanca && !setorId && !erro && (
        <p className="text-sm text-muted-foreground">Escolha um setor para ver a conta.</p>
      )}

      {carregando && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!carregando && dado && !dado.temRetrato && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>Não há retrato geral vigente para {rotuloDoMes(mes)}.</p>
            <p className="mt-1">
              Sem ele não há o que conferir: a conta do setor é derivada do relatório
              geral do mês. Carregue-o na aba <strong>Importar Vendas</strong>.
            </p>
          </div>
        </div>
      )}

      {!carregando && dado?.temRetrato && doSetor && (
        <>
          {/* ── Os faróis vêm antes dos números, e não depois ─────────────── */}
          <section className="space-y-2">
            <Farol
              igualdade={dado.destinosSomam}
              quandoFecha="As cinco parcelas somam o retrato do mês, ao centavo."
              quandoFalha="As parcelas NÃO somam o retrato. Há venda em um estado que o fechamento não classifica — isto é defeito de código, não de cadastro."
            />
            <Farol
              igualdade={dado.gravadoBate}
              rotina
              quandoFecha="O que está gravado em Vendas é exatamente o que o retrato atribui a este setor."
              quandoFalha="O retrato e o que está gravado em Vendas discordam. Normalmente é a projeção que ainda não rodou depois da última carga — rode-a na aba Importar Vendas."
            />
            <Farol
              igualdade={dado.equipesSomam}
              quandoFecha="As equipes somam a parcela do setor."
              quandoFalha="As equipes não somam a parcela do setor — alguém ficou fora de toda equipe e fora do «Sem equipe»."
            />
          </section>

          {/* ── O retrato inteiro ────────────────────────────────────────── */}
          {dado.total && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                O retrato de {rotuloDoMes(mes)}, empresa toda
              </h2>
              <Parcela linha={dado.total} />
            </section>
          )}

          {/* ── Para onde foi ────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              Para onde foi — cinco gavetas, sem sobra
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dado.destinos.map(d => (
                <Parcela
                  key={d.destino}
                  linha={{ ...d, rotulo: d.rotulo || d.destino }}
                  destaque={d.destino === 'deste_setor'}
                  explicacao={EXPLICACAO_DO_DESTINO[d.destino]}
                />
              ))}
            </div>
          </section>

          {/* ── Dentro do setor ──────────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Dentro de {nomeDoSetor} — {formatBRL(doSetor.valor_na_regua)} na régua
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{dado.pessoas.rotulo}</span>
                </div>
                <div className="mt-1.5 tabular-nums text-xl font-bold">
                  {formatBRL(dado.pessoas.valor_na_regua)}
                </div>
                <div className="tabular-nums text-xs text-muted-foreground">
                  {dado.pessoas.linhas_na_regua} de {dado.pessoas.linhas} vendas na régua
                </div>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{dado.automacao.rotulo}</span>
                  <Badge variant="outline" className="tabular-nums text-[11px]">
                    {fatiaIa.toFixed(1)}% do setor
                  </Badge>
                </div>
                <div className="mt-1.5 tabular-nums text-xl font-bold">
                  {formatBRL(dado.automacao.valor_na_regua)}
                </div>
                <div className="tabular-nums text-xs text-muted-foreground">
                  {dado.automacao.linhas_na_regua} de {dado.automacao.linhas} vendas na régua
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Conta no setor como qualquer venda — confirmada e assinada é confirmada
                  e assinada. Fica à parte só para que o número das pessoas seja legível.
                </p>
              </div>
            </div>

            {dado.equipes.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Equipe</th>
                      <th className="px-3 py-2 text-right font-medium">Vendas</th>
                      <th className="px-3 py-2 text-right font-medium">Na régua</th>
                      <th className="px-3 py-2 text-right font-medium">Bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dado.equipes.map(e => (
                      <tr key={e.chave ?? e.rotulo} className="border-t border-border">
                        <td className="px-3 py-2">
                          {e.rotulo}
                          {e.chave === 'sem_equipe' && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              liderança sem equipe própria, automação e desligados
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {e.linhas_na_regua} <span className="text-muted-foreground">/ {e.linhas}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatBRL(e.valor_na_regua)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatBRL(e.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
