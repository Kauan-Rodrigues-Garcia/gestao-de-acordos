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
 * ## Um contato, vários telefones
 *
 * A gestora aponta cinco números, não um. A grade é por CONTATO — escola,
 * gestora, data — com os números embaixo, e cada número é uma indicação.
 * Colar a linha inteira funciona em qualquer campo da grade, e colar uma
 * célula com vários números no campo de telefone abre um campo por número.
 *
 * ## A repetida é avisada duas vezes, de propósito
 *
 * Antes de mandar, a grade marca em vermelho o número que se repete dentro
 * dela mesma. Depois de mandar, o banco devolve os que já existiam com QUEM os
 * indicou e QUANDO — e é essa segunda que resolve a dúvida real: «esse contato
 * já é de alguém?». Só «duplicada» não responderia nada.
 *
 * ## Corrigir e cadastrar por outro são a mesma chave
 *
 * `editar_indicacoes` libera as duas coisas, e as duas aparecem juntas: o
 * seletor «em nome de» acima da lista e o lápis em cada linha. O erro mais
 * provável de quem cadastra pelo operador é escolher a pessoa errada — por isso
 * a correção deixa trocar QUEM indicou, e não só o texto.
 *
 * ## O gráfico é de CSS, e é de propósito
 *
 * Barra por dia não precisa de biblioteca, e as variáveis de cor deste projeto
 * são `oklch` — `hsl(var(--x))` apaga o gráfico sem erro nenhum, defeito que já
 * custou caro aqui. Sem biblioteca não há como cair nessa.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { Handshake, Trash2, Plus, ClipboardPaste, TriangleAlert, Info, Trophy, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
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
  parseColagem, contatoVazio, prontosParaGravar, repetidasNaGrade, telefonesColados,
  agruparPorContato,
  type ContatoIndicacao, type ResultadoColagem,
} from '@/lib/indicacoes';
import {
  buscarIndicacoes, buscarRanking, buscarPorDia, salvarLote, excluirIndicacao,
  corrigirIndicacao, buscarQuemPodeIndicar,
  type Indicacao, type LinhaRanking, type PontoDoDia, type PessoaQueIndica,
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

/** O que o diálogo de correção edita. Texto vazio vira nulo ao gravar. */
interface Correcao {
  id: string;
  operadorId: string;
  instituicao: string;
  gestora: string;
  telefone: string;
  dataIndicacao: string;
  observacao: string;
}

function textoOuNulo(v: string): string | null {
  return v.trim() === '' ? null : v;
}

/** A grade sempre mostra ao menos um campo de telefone por contato. */
function telefonesDe(c: ContatoIndicacao): string[] {
  return c.telefones.length > 0 ? c.telefones : [''];
}

function contatoEmBranco(c: ContatoIndicacao | undefined): boolean {
  return !!c && c.instituicao.trim() === '' && !c.gestora && c.telefones.every(t => t.trim() === '');
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
  // Corrigir E cadastrar em nome de outra pessoa. O banco confere de novo.
  const podeEditar = temPermissao('editar_indicacoes');
  const hoje = useMemo(hojeISO, []);

  const [itens, setItens] = useState<Indicacao[]>([]);
  const [ranking, setRanking] = useState<LinhaRanking[]>([]);
  const [porDia, setPorDia] = useState<PontoDoDia[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [grade, setGrade] = useState<ContatoIndicacao[]>([contatoVazio(hojeISO())]);
  const [colagem, setColagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  /*
   * O campo de telefone que acabou de nascer (Enter ou «+ Telefone») recebe o
   * foco depois do render. `autoFocus` não serve: com chave por posição, o
   * campo inserido no meio reaproveita um elemento que já existia.
   */
  const camposDeTelefone = useRef(new Map<string, HTMLInputElement>());
  const [focar, setFocar] = useState<string | null>(null);
  useEffect(() => {
    if (focar === null) return;
    camposDeTelefone.current.get(focar)?.focus();
    setFocar(null);
  }, [focar, grade]);

  /*
   * Em nome de quem a lista vai ser gravada. Vazio = a própria pessoa: sem
   * `editar_indicacoes` o seletor nem aparece, e o banco recusa se alguém
   * mandar outro id por fora.
   */
  const [quemPodeIndicar, setQuemPodeIndicar] = useState<PessoaQueIndica[]>([]);
  const [emNomeDe, setEmNomeDe] = useState<string>('');
  const [correcao, setCorrecao] = useState<Correcao | null>(null);
  const [corrigindo, setCorrigindo] = useState(false);

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

  useEffect(() => {
    if (!podeEditar || !empresaId) return;
    let vivo = true;
    void buscarQuemPodeIndicar(empresaId).then(lista => { if (vivo) setQuemPodeIndicar(lista); });
    return () => { vivo = false; };
  }, [podeEditar, empresaId]);

  const repetidas = useMemo(() => repetidasNaGrade(grade), [grade]);
  const contatosMarcados = useMemo(
    () => new Set([...repetidas].map(m => Number(m.split(':')[0]))),
    [repetidas],
  );
  const prontas = useMemo(() => prontosParaGravar(grade), [grade]);
  const contatosProntos = grade.filter(c => c.instituicao.trim() !== '').length;

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
  const gruposVisiveis  = useMemo(() => agruparPorContato(itensVisiveis), [itensVisiveis]);

  function avisarIgnoradas(r: ResultadoColagem) {
    if (r.ignoradas.length === 0) return;
    toast.warning(
      `${r.ignoradas.length} ${r.ignoradas.length === 1 ? 'linha ficou' : 'linhas ficaram'} de fora: `
      + `sem instituição e sem contato acima de onde herdá-la (linha ${r.ignoradas.map(i => i.linha).join(', ')}).`,
    );
  }

  function aplicarColagem() {
    const r = parseColagem(colagem, hoje);
    avisarIgnoradas(r);
    if (r.contatos.length === 0) {
      toast.error('Nada para colar — a primeira coluna precisa ser a instituição.');
      return;
    }
    // Substitui os contatos em branco e acrescenta aos preenchidos: colar duas
    // vezes seguidas deve somar, não apagar o que já estava.
    setGrade(atual => [...atual.filter(c => c.instituicao.trim() !== ''), ...r.contatos, contatoVazio(hoje)]);
    setColagem('');
  }

  /*
   * Linha inteira colada direto na grade (tem TAB, ou várias escolas numa
   * coluna): passa pelo mesmo leitor da caixa de colar, em vez de o campo
   * engolir tudo como um nome só. Toma o lugar do contato se ele estava em
   * branco; senão entra logo abaixo.
   */
  function colarLinhas(ci: number, texto: string) {
    const r = parseColagem(texto, hoje);
    avisarIgnoradas(r);
    if (r.contatos.length === 0) return;
    setGrade(atual => {
      const corte = contatoEmBranco(atual[ci]) ? ci : ci + 1;
      return [...atual.slice(0, corte), ...r.contatos, ...atual.slice(ci + 1)];
    });
  }

  function aoColarNoContato(e: ClipboardEvent<HTMLInputElement>, ci: number, aceitaColuna: boolean) {
    const texto = e.clipboardData.getData('text/plain');
    if (texto.includes('\t') || (aceitaColuna && texto.trim().includes('\n'))) {
      e.preventDefault();
      colarLinhas(ci, texto);
    }
  }

  function aoColarTelefone(e: ClipboardEvent<HTMLInputElement>, ci: number, ti: number) {
    const texto = e.clipboardData.getData('text/plain');
    if (texto.includes('\t')) {
      e.preventDefault();
      colarLinhas(ci, texto);
      return;
    }
    // Célula com Alt+Enter, ou a coluna de números: um campo por número.
    const numeros = telefonesColados(texto);
    if (numeros.length > 1) {
      e.preventDefault();
      mudarTelefones(ci, t => [...t.slice(0, ti), ...numeros, ...t.slice(ti + 1)]);
    }
  }

  function mudarContato(ci: number, campo: 'instituicao' | 'gestora' | 'data_indicacao', valor: string) {
    setGrade(atual => atual.map((c, k) =>
      k === ci ? { ...c, [campo]: campo === 'gestora' && valor === '' ? null : valor } : c,
    ));
  }

  function mudarTelefones(ci: number, mudar: (telefones: string[]) => string[]) {
    setGrade(atual => atual.map((c, k) => {
      if (k !== ci) return c;
      const novos = mudar(telefonesDe(c));
      return { ...c, telefones: novos.length > 0 ? novos : [''] };
    }));
  }

  function novoTelefone(ci: number, depoisDe: number) {
    mudarTelefones(ci, t => [...t.slice(0, depoisDe + 1), '', ...t.slice(depoisDe + 1)]);
    setFocar(`${ci}:${depoisDe + 1}`);
  }

  async function gravar() {
    if (!empresaId || !perfil?.id) return;
    if (prontas.length === 0) { toast.error('Nenhuma instituição preenchida.'); return; }
    if (repetidas.size > 0) {
      toast.error('Há indicações repetidas na lista. Tire as marcadas em vermelho antes de gravar.');
      return;
    }

    setSalvando(true);
    const r = await salvarLote({ empresaId, operadorId: emNomeDe || perfil.id, itens: prontas });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não deu para gravar.'); return; }

    const d = r.dado!;
    if (d.gravadas > 0) {
      toast.success(`${d.gravadas} ${d.gravadas === 1 ? 'indicação gravada' : 'indicações gravadas'}.`);
    }
    for (const rep of d.repetidas) {
      const quando = `${rep.ja_indicada_por} em ${diaCurto(String(rep.em))}`;
      toast.warning(
        rep.telefone
          ? `O telefone ${rep.telefone} já foi indicado por ${quando} (${rep.na_instituicao ?? rep.instituicao}).`
          : `«${rep.instituicao}» já foi indicada por ${quando}.`,
        { duration: 9000 },
      );
    }
    if (d.gravadas === 0 && d.repetidas.length === 0) {
      toast.info('Nada foi gravado.');
    }

    setGrade([contatoVazio(hoje)]);
    void carregar();
  }

  function abrirCorrecao(item: Indicacao) {
    setCorrecao({
      id: item.id,
      operadorId: item.operador_id,
      instituicao: item.instituicao,
      gestora: item.gestora ?? '',
      telefone: item.telefone ?? '',
      dataIndicacao: item.data_indicacao,
      observacao: item.observacao ?? '',
    });
  }

  async function gravarCorrecao() {
    if (!correcao) return;
    if (correcao.instituicao.trim() === '') { toast.error('A instituição não pode ficar vazia.'); return; }
    if (correcao.dataIndicacao === '') { toast.error('A data da indicação é obrigatória.'); return; }

    setCorrigindo(true);
    const r = await corrigirIndicacao({
      id: correcao.id,
      operadorId: correcao.operadorId,
      instituicao: correcao.instituicao,
      gestora: textoOuNulo(correcao.gestora),
      telefone: textoOuNulo(correcao.telefone),
      dataIndicacao: correcao.dataIndicacao,
      observacao: textoOuNulo(correcao.observacao),
    });
    setCorrigindo(false);

    // Nome que já é de outra linha volta com quem e quando — o diálogo fica
    // aberto para a pessoa ajustar, em vez de perder o que digitou.
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para corrigir.', { duration: 9000 }); return; }
    toast.success('Indicação corrigida.');
    setCorrecao(null);
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
            Nesta ordem:{' '}
            <strong>instituição · gestora · telefone · data · observação</strong>.
            Separador TAB (Excel) ou <code>;</code>. Sem data, vale hoje.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Cada telefone é uma indicação. Os outros números do mesmo contato podem vir na
            mesma célula (Alt+Enter) ou nas linhas de baixo, com instituição e gestora em branco.
          </p>
          <Textarea
            value={colagem}
            onChange={e => setColagem(e.target.value)}
            rows={5}
            placeholder={'Colégio São José\tMaria Clara\t18 93505-6541\t03/09/2026\n\t\t18 93505-9999\n\t\t18 93505-8888'}
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
              A lista ({contatosProntos} {contatosProntos === 1 ? 'contato' : 'contatos'}
              {' · '}{prontas.length} {prontas.length === 1 ? 'indicação' : 'indicações'})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {podeEditar && quemPodeIndicar.length > 0 && (
                <Select value={emNomeDe || perfil?.id || ''} onValueChange={setEmNomeDe}>
                  <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Em nome de">
                    <SelectValue placeholder="Em nome de" />
                  </SelectTrigger>
                  <SelectContent>
                    {quemPodeIndicar.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.id === perfil?.id ? `${p.nome} (eu)` : `Em nome de ${p.nome}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="ghost"
                      onClick={() => setGrade(a => [...a, contatoVazio(hoje)])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Contato
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
                Há indicação repetida na lista: o mesmo telefone duas vezes, ou uma escola
                sem telefone que já aparece noutra linha. Estão marcadas — contar duas vezes
                é o que tornaria o ranking sem sentido.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {grade.map((contato, ci) => {
              const telefones = telefonesDe(contato);
              const preenchidos = telefones.filter(t => t.trim() !== '').length;
              return (
                <div key={ci}
                     className={cn(
                       'space-y-2 rounded-lg border p-2',
                       contatosMarcados.has(ci) ? 'border-destructive/50 bg-destructive/5' : 'border-border',
                     )}>
                  <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_auto_auto]">
                    <Input value={contato.instituicao} placeholder="Instituição"
                           className={cn(repetidas.has(`${ci}:*`) && 'border-destructive')}
                           onChange={e => mudarContato(ci, 'instituicao', e.target.value)}
                           onPaste={e => aoColarNoContato(e, ci, true)} />
                    <Input value={contato.gestora ?? ''} placeholder="Gestora"
                           onChange={e => mudarContato(ci, 'gestora', e.target.value)}
                           onPaste={e => aoColarNoContato(e, ci, false)} />
                    <Input type="date" value={contato.data_indicacao} className="w-[150px]"
                           onChange={e => mudarContato(ci, 'data_indicacao', e.target.value)} />
                    <Button size="icon" variant="ghost" aria-label="Tirar o contato da lista"
                            onClick={() => setGrade(a => a.length === 1 ? [contatoVazio(hoje)] : a.filter((_, k) => k !== ci))}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {telefones.map((tel, ti) => (
                      <div key={ti} className="flex items-center">
                        <Input value={tel} placeholder="Telefone"
                               ref={el => {
                                 if (el) camposDeTelefone.current.set(`${ci}:${ti}`, el);
                                 else camposDeTelefone.current.delete(`${ci}:${ti}`);
                               }}
                               className={cn(
                                 'h-8 w-[160px] text-xs tabular-nums',
                                 repetidas.has(`${ci}:${ti}`) && 'border-destructive',
                               )}
                               onChange={e => mudarTelefones(ci, t => t.map((v, k) => (k === ti ? e.target.value : v)))}
                               onPaste={e => aoColarTelefone(e, ci, ti)}
                               onKeyDown={e => {
                                 if (e.key === 'Enter') { e.preventDefault(); novoTelefone(ci, ti); }
                               }} />
                        {telefones.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-7" aria-label="Tirar este telefone"
                                  onClick={() => mudarTelefones(ci, t => t.filter((_, k) => k !== ti))}>
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" className="h-8 text-xs"
                            onClick={() => novoTelefone(ci, telefones.length - 1)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Telefone
                    </Button>
                    {preenchidos > 1 && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {preenchidos} indicações
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
                  {(podeEditar || podeExcluir) && <th className="w-20" />}
                </tr>
              </thead>
              <tbody>
                {/* Um bloco por contato: escola e gestora uma vez, os números embaixo. */}
                {gruposVisiveis.flatMap(grupo => grupo.map((item, k) => (
                  <tr key={item.id} className={cn('border-border', k === 0 ? 'border-t' : 'border-t border-dashed')}>
                    {k === 0 && (
                      <>
                        <td rowSpan={grupo.length} className="px-3 py-2 align-top">
                          {item.instituicao}
                          {grupo.length > 1 && (
                            <Badge variant="secondary" className="ml-2 tabular-nums">{grupo.length}</Badge>
                          )}
                        </td>
                        <td rowSpan={grupo.length} className="px-3 py-2 align-top text-muted-foreground">
                          {item.gestora ?? '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{item.telefone ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.perfis?.nome ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {diaCurto(item.data_indicacao)}
                    </td>
                    {(podeEditar || podeExcluir) && (
                      <td className="whitespace-nowrap px-1 py-2">
                        {podeEditar && (
                          <Button size="icon" variant="ghost" aria-label="Corrigir"
                                  onClick={() => abrirCorrecao(item)}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                        {podeExcluir && (
                          <Button size="icon" variant="ghost" aria-label="Excluir"
                                  onClick={() => void apagar(
                                    item.id,
                                    item.telefone ? `${item.telefone} (${item.instituicao})` : item.instituicao,
                                  )}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={correcao !== null} onOpenChange={o => { if (!o && !corrigindo) setCorrecao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir indicação</DialogTitle>
            <DialogDescription>
              O telefone é o que impede contar a mesma indicação duas vezes: se virar o
              número de outra já cadastrada, a correção é recusada. Sem telefone, a
              indicação é a própria escola — e ela não pode já ter outra linha.
            </DialogDescription>
          </DialogHeader>
          {correcao && (
            <div className="grid gap-2">
              <Input value={correcao.instituicao} placeholder="Instituição"
                     onChange={e => setCorrecao({ ...correcao, instituicao: e.target.value })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={correcao.gestora} placeholder="Gestora"
                       onChange={e => setCorrecao({ ...correcao, gestora: e.target.value })} />
                <Input value={correcao.telefone} placeholder="Telefone"
                       onChange={e => setCorrecao({ ...correcao, telefone: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="date" value={correcao.dataIndicacao}
                       onChange={e => setCorrecao({ ...correcao, dataIndicacao: e.target.value })} />
                {quemPodeIndicar.length > 0 && (
                  <Select value={correcao.operadorId}
                          onValueChange={v => setCorrecao({ ...correcao, operadorId: v })}>
                    <SelectTrigger aria-label="Quem indicou"><SelectValue placeholder="Quem indicou" /></SelectTrigger>
                    <SelectContent>
                      {/* Quem indicou pode ter saído da casa — continua na lista para a
                          correção não trocar a pessoa sem ninguém pedir. */}
                      {!quemPodeIndicar.some(p => p.id === correcao.operadorId) && (
                        <SelectItem value={correcao.operadorId}>
                          {itens.find(i => i.id === correcao.id)?.perfis?.nome ?? 'Quem indicou'}
                        </SelectItem>
                      )}
                      {quemPodeIndicar.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Textarea value={correcao.observacao} placeholder="Observação" rows={2}
                        onChange={e => setCorrecao({ ...correcao, observacao: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCorrecao(null)} disabled={corrigindo}>Cancelar</Button>
            <Button onClick={() => void gravarCorrecao()} disabled={corrigindo}>
              {corrigindo ? 'Gravando…' : 'Gravar correção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
