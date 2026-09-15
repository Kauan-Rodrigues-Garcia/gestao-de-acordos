/**
 * Indicações — o cadastro manual, o ranking e o gráfico.
 *
 * ## Colar vem antes de digitar
 *
 * Quem volta de uma visita volta com oito nomes, e quase sempre já os tem numa
 * planilha. Por isso a caixa de colar é o caminho principal e a grade é o
 * ajuste fino — não o contrário. A ordem das colunas fica escrita ao lado da
 * caixa, porque adivinhar por conteúdo erraria em «Colégio 24 de Maio».
 *
 * ## A repetida é avisada duas vezes, de propósito
 *
 * Antes de mandar, a grade marca em vermelho o que se repete dentro dela
 * mesma. Depois de mandar, o banco devolve as que já existiam com QUEM as
 * indicou e QUANDO — e é essa segunda que resolve a dúvida real: «essa escola
 * já é de alguém?». Só «duplicada» não responderia nada.
 *
 * ## O gráfico é de CSS, e é de propósito
 *
 * Barra por dia não precisa de biblioteca, e as variáveis de cor deste projeto
 * são `oklch` — `hsl(var(--x))` apaga o gráfico sem erro nenhum, defeito que já
 * custou caro aqui. Sem biblioteca não há como cair nessa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Handshake, Trash2, Plus, ClipboardPaste, TriangleAlert, Info, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { supabase } from '@/lib/supabase';
import { niveisLiberados, type NivelEscopo } from '@/lib/permissoes-escopo';
import { cn } from '@/lib/utils';
import {
  parseColagem, itemVazio, prontosParaGravar, repetidasNaGrade,
  type ItemIndicacao,
} from '@/lib/indicacoes';
import {
  buscarIndicacoes, buscarRanking, buscarPorDia, salvarLote, excluirIndicacao,
  type Indicacao, type LinhaRanking, type PontoDoDia,
} from '@/services/vendas/indicacoes.service';

/** Primeiro e último dia do mês `yyyy-MM`, como o banco os espera. */
function limitesDoMes(mes: string): { de: string; ate: string } {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

function hojeISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function diaCurto(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

const ROTULO_DO_NIVEL: Record<NivelEscopo, string> = {
  individual:    'Só as minhas',
  equipe:        'Minha equipe',
  setor:         'Meu setor',
  todos_setores: 'Todos',
};

export default function Indicacoes() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const empresaId = empresa?.id ?? null;
  const podeCriar = temPermissao('criar_indicacoes');
  const podeExcluir = temPermissao('excluir_indicacoes');
  const hoje = useMemo(hojeISO, []);

  const [itens, setItens] = useState<Indicacao[]>([]);
  const [ranking, setRanking] = useState<LinhaRanking[]>([]);
  const [porDia, setPorDia] = useState<PontoDoDia[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [grade, setGrade] = useState<ItemIndicacao[]>([itemVazio(hojeISO())]);
  const [colagem, setColagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { de, ate } = useMemo(() => limitesDoMes(mes), [mes]);

  /*
   * O filtro de alcance.
   *
   * A RLS já corta o TETO — ninguém vê além do que o cargo alcança. O que este
   * filtro faz é ESTREITAR dentro disso: o líder que enxerga o setor inteiro
   * também precisa poder olhar só a própria equipe. Sem ele, os quatro níveis
   * seriam quatro interruptores que a pessoa não consegue observar, que é o
   * defeito que o contrato `catálogo ↔ código` existe para pegar.
   *
   * ⚠️ Estreitar aqui NÃO é segurança: o teto é o do banco. Se o cliente
   * escolhesse «todos» sem ter o nível, a lista continuaria vindo recortada.
   */
  const niveis = useMemo(
    () => niveisLiberados('indicacoes', temPermissao),
    [temPermissao],
  );
  const maisAmplo = niveis.length > 0 ? niveis[niveis.length - 1] : null;
  const [nivel, setNivel] = useState<NivelEscopo | null>(null);
  const alcance = nivel ?? maisAmplo;

  /*
   * As equipes que contam como «minha»: a do cadastro e as que a pessoa LIDERA.
   * Mesma regra de `fn_vendas_equipe_que_credita` — líder credita a equipe que
   * lidera, e olhar só `perfil.equipe_id` deixaria o líder sem equipe nenhuma.
   */
  const [minhasEquipes, setMinhasEquipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!perfil?.id) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from('equipe_lideres').select('equipe_id').eq('lider_id', perfil.id);
      if (!vivo) return;
      const ids = (data ?? []).map(l => String(l.equipe_id));
      if (perfil.equipe_id) ids.push(String(perfil.equipe_id));
      setMinhasEquipes(new Set(ids));
    })();
    return () => { vivo = false; };
  }, [perfil?.id, perfil?.equipe_id]);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const [lista, rk, dias] = await Promise.all([
      buscarIndicacoes({ empresaId, de, ate }),
      buscarRanking({ empresaId, de, ate }),
      buscarPorDia({ empresaId, de, ate }),
    ]);
    setCarregando(false);

    setDisponivel(lista.disponivel);
    if (!lista.disponivel) { setItens([]); setRanking([]); setPorDia([]); return; }

    setItens(lista.itens);
    setRanking(rk.dado ?? []);
    setPorDia(dias.dado ?? []);
  }, [empresaId, de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const repetidas = useMemo(() => repetidasNaGrade(grade), [grade]);
  const prontas = useMemo(() => prontosParaGravar(grade), [grade]);

  /*
   * `setor` e `todos_setores` não filtram nada aqui: a RLS já entregou
   * exatamente esse recorte. Filtrar de novo por `setor_id === perfil.setor_id`
   * esconderia as linhas de quem tem mais de um setor.
   */
  const noAlcance = useCallback(
    (linha: { operador_id: string; equipe_id: string | null }) => {
      if (alcance === 'individual') return linha.operador_id === perfil?.id;
      if (alcance === 'equipe') return linha.equipe_id !== null && minhasEquipes.has(linha.equipe_id);
      return true;
    },
    [alcance, perfil?.id, minhasEquipes],
  );

  const itensVisiveis   = useMemo(() => itens.filter(noAlcance), [itens, noAlcance]);
  const rankingVisivel  = useMemo(() => ranking.filter(noAlcance), [ranking, noAlcance]);

  function aplicarColagem() {
    const r = parseColagem(colagem, hoje);
    if (r.itens.length === 0) {
      toast.error('Nada para colar — a primeira coluna precisa ser a instituição.');
      return;
    }
    // Substitui as linhas em branco e acrescenta às preenchidas: colar duas
    // vezes seguidas deve somar, não apagar o que já estava.
    setGrade(atual => [...prontosParaGravar(atual), ...r.itens, itemVazio(hoje)]);
    setColagem('');

    if (r.ignoradas.length > 0) {
      toast.warning(
        `${r.ignoradas.length} ${r.ignoradas.length === 1 ? 'linha ficou' : 'linhas ficaram'} de fora por não ter instituição `
        + `(linha ${r.ignoradas.map(i => i.linha).join(', ')}).`,
      );
    }
    if (r.repetidasNaColagem.length > 0) {
      toast.warning(`Repetida na própria colagem: ${r.repetidasNaColagem.join(', ')}.`);
    }
  }

  function mudar(i: number, campo: keyof ItemIndicacao, valor: string) {
    setGrade(atual => atual.map((item, k) =>
      k === i ? { ...item, [campo]: valor === '' && campo !== 'instituicao' ? null : valor } : item,
    ));
  }

  async function gravar() {
    if (!empresaId || !perfil?.id) return;
    if (prontas.length === 0) { toast.error('Nenhuma instituição preenchida.'); return; }
    if (repetidas.size > 0) {
      toast.error('Há instituições repetidas na lista. Tire as marcadas em vermelho antes de gravar.');
      return;
    }

    setSalvando(true);
    const r = await salvarLote({ empresaId, operadorId: perfil.id, itens: prontas });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não deu para gravar.'); return; }

    const d = r.dado!;
    if (d.gravadas > 0) {
      toast.success(`${d.gravadas} ${d.gravadas === 1 ? 'indicação gravada' : 'indicações gravadas'}.`);
    }
    for (const rep of d.repetidas) {
      toast.warning(
        `«${rep.instituicao}» já foi indicada por ${rep.ja_indicada_por} em ${diaCurto(String(rep.em))}.`,
        { duration: 9000 },
      );
    }
    if (d.gravadas === 0 && d.repetidas.length === 0) {
      toast.info('Nada foi gravado.');
    }

    setGrade([itemVazio(hoje)]);
    void carregar();
  }

  async function apagar(id: string, nome: string) {
    const r = await excluirIndicacao(id);
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para excluir.'); return; }
    toast.success(`«${nome}» saiu do ranking.`);
    void carregar();
  }

  const maiorDia = Math.max(1, ...porDia.map(p => p.quantidade));
  const maiorRank = Math.max(1, ...rankingVisivel.map(r => r.quantidade));
  const total = itensVisiveis.length;

  if (!disponivel) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>A aba Indicações ainda não foi instalada neste banco.</p>
            <p className="mt-1">
              Falta aplicar a migration
              {' '}<code className="text-xs">20260915200000_vendas_fase7_indicacoes.sql</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">Indicações</h1>
          <Badge variant="outline" className="tabular-nums">{total} em {rotuloDoMes(mes)}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Instituição, gestora, telefone e data. É a única aba do Comercial sem
          relatório de origem — tudo aqui foi alguém que digitou.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorMes mes={mes} onChange={setMes} />
          {/* Um nível só não é escolha — mostrar o botão sozinho seria enfeite. */}
          {niveis.length > 1 && (
            <div className="flex overflow-hidden rounded-lg border border-border">
              {niveis.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNivel(n)}
                  className={cn(
                    'px-3 py-1.5 text-xs transition-colors',
                    alcance === n
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {ROTULO_DO_NIVEL[n]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {podeCriar && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <ClipboardPaste className="h-4 w-4 text-muted-foreground" aria-hidden />
            Colar da planilha
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Uma linha por indicação, nesta ordem:{' '}
            <strong>instituição · gestora · telefone · data · observação</strong>.
            Separador TAB (Excel) ou <code>;</code>. Sem data, vale hoje.
          </p>
          <Textarea
            value={colagem}
            onChange={e => setColagem(e.target.value)}
            rows={4}
            placeholder={'Colégio São José\tMaria Fátima\t(14) 99999-0000\t03/09/2026'}
            className="font-mono text-xs"
          />
          <Button size="sm" variant="secondary" onClick={aplicarColagem} disabled={colagem.trim() === ''}>
            Passar para a lista
          </Button>
        </section>
      )}

      {podeCriar && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">
              A lista ({prontas.length} {prontas.length === 1 ? 'pronta' : 'prontas'})
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost"
                      onClick={() => setGrade(a => [...a, itemVazio(hoje)])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Linha
              </Button>
              <Button size="sm" onClick={gravar}
                      disabled={salvando || prontas.length === 0 || repetidas.size > 0}>
                {salvando ? 'Gravando…' : `Gravar ${prontas.length}`}
              </Button>
            </div>
          </div>

          {repetidas.size > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">
                A mesma instituição aparece mais de uma vez na lista. As duas estão
                marcadas — contar duas vezes é o que tornaria o ranking sem sentido.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {grade.map((item, i) => (
              <div key={i}
                   className={cn(
                     'grid gap-2 rounded-lg border p-2 sm:grid-cols-[2fr_1.5fr_1fr_auto_auto]',
                     repetidas.has(i) ? 'border-destructive/50 bg-destructive/5' : 'border-border',
                   )}>
                <Input value={item.instituicao} placeholder="Instituição"
                       onChange={e => mudar(i, 'instituicao', e.target.value)} />
                <Input value={item.gestora ?? ''} placeholder="Gestora"
                       onChange={e => mudar(i, 'gestora', e.target.value)} />
                <Input value={item.telefone ?? ''} placeholder="Telefone"
                       onChange={e => mudar(i, 'telefone', e.target.value)} />
                <Input type="date" value={item.data_indicacao} className="w-[150px]"
                       onChange={e => mudar(i, 'data_indicacao', e.target.value)} />
                <Button size="icon" variant="ghost" aria-label="Tirar da lista"
                        onClick={() => setGrade(a => a.length === 1 ? [itemVazio(hoje)] : a.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {porDia.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Por dia</h2>
          <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 88 }}>
            {porDia.map(p => (
              <div key={p.dia} className="flex w-9 shrink-0 flex-col items-center gap-1">
                <span className="tabular-nums text-[10px] text-muted-foreground">{p.quantidade}</span>
                <div className="w-full rounded-t bg-primary"
                     style={{ height: `${(p.quantidade / maiorDia) * 56}px` }}
                     title={`${p.quantidade} em ${diaCurto(p.dia)}`} />
                <span className="tabular-nums text-[10px] text-muted-foreground">{diaCurto(p.dia)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden />
          Quem mais indicou
        </h2>
        {rankingVisivel.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {carregando ? 'Carregando…' : `Nenhuma indicação em ${rotuloDoMes(mes)}.`}
          </p>
        ) : (
          <div className="space-y-1.5">
            {rankingVisivel.map((r, i) => (
              <div key={r.operador_id} className="flex items-center gap-3">
                <span className="w-6 shrink-0 tabular-nums text-right text-xs text-muted-foreground">
                  {i + 1}º
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{r.operador_nome}</span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold">{r.quantidade}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary"
                         style={{ width: `${(r.quantidade / maiorRank) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{r.equipe_nome}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-muted-foreground">
          As indicações de {rotuloDoMes(mes)}
        </h2>
        {itensVisiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {carregando ? 'Carregando…' : 'Nada neste mês.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Instituição</th>
                  <th className="px-3 py-2 text-left font-medium">Gestora</th>
                  <th className="px-3 py-2 text-left font-medium">Telefone</th>
                  <th className="px-3 py-2 text-left font-medium">Indicou</th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  {podeExcluir && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {itensVisiveis.map(item => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2">{item.instituicao}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.gestora ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{item.telefone ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.perfis?.nome ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {diaCurto(item.data_indicacao)}
                    </td>
                    {podeExcluir && (
                      <td className="px-1 py-2">
                        <Button size="icon" variant="ghost" aria-label="Excluir"
                                onClick={() => void apagar(item.id, item.instituicao)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
