/**
 * NovaIndicacao — o cadastro: digitar contato a contato, ou colar da planilha.
 *
 * Os dois caminhos acabam na MESMA lista de contatos, e por isso moram juntos,
 * em abas: colar é atalho para preencher a lista, e a lista é o que se grava.
 * Antes (até 01/10/2026) eram dois blocos soltos, cada um com o seu parágrafo
 * de instrução — e quem chegava não sabia por onde começar.
 *
 * A lógica de colar, de telefone por contato e de repetida é a mesma de
 * sempre (`@/lib/indicacoes`); o que mudou foi a casca.
 *
 * ## Um contato, vários telefones
 *
 * A gestora aponta cinco números, não um. Cada contato é um cartão — escola,
 * gestora, data — com os números como etiquetas embaixo, e cada número é uma
 * indicação. Enter no telefone abre o próximo; colar a linha inteira em
 * qualquer campo funciona; colar uma célula com vários números abre um campo
 * por número.
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import {
  Building2, UserRound, CalendarDays, Phone, Plus, X, Trash2, ClipboardPaste,
  Keyboard, TriangleAlert, Sparkles, ChevronDown, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  parseColagem, contatoVazio, prontosParaGravar, repetidasNaGrade, telefonesColados,
  type ContatoIndicacao, type ResultadoColagem,
} from '@/lib/indicacoes';
import { salvarLote, type PessoaQueIndica } from '@/services/vendas/indicacoes.service';

function diaCurto(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

/** A grade sempre mostra ao menos um campo de telefone por contato. */
function telefonesDe(c: ContatoIndicacao): string[] {
  return c.telefones.length > 0 ? c.telefones : [''];
}

function contatoEmBranco(c: ContatoIndicacao | undefined): boolean {
  return !!c && c.instituicao.trim() === '' && !c.gestora && c.telefones.every(t => t.trim() === '');
}

type Modo = 'digitar' | 'colar';

interface Props {
  empresaId: string;
  perfilId: string;
  hoje: string;
  /** `editar_indicacoes`: libera gravar em nome de outra pessoa. */
  podeEditar: boolean;
  quemPodeIndicar: readonly PessoaQueIndica[];
  /** Chamado depois de gravar, para a página recarregar a lista. */
  onGravado: () => void;
}

export function NovaIndicacao({ empresaId, perfilId, hoje, podeEditar, quemPodeIndicar, onGravado }: Props) {
  const [modo, setModo] = useState<Modo>('digitar');
  const [grade, setGrade] = useState<ContatoIndicacao[]>([contatoVazio(hoje)]);
  const [colagem, setColagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [verDica, setVerDica] = useState(false);
  /*
   * Em nome de quem a lista vai ser gravada. Vazio = a própria pessoa: sem
   * `editar_indicacoes` o seletor nem aparece, e o banco recusa se alguém
   * mandar outro id por fora.
   */
  const [emNomeDe, setEmNomeDe] = useState('');

  /*
   * O campo de telefone que acabou de nascer (Enter ou «+ número») recebe o
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

  const repetidas = useMemo(() => repetidasNaGrade(grade), [grade]);
  const contatosMarcados = useMemo(
    () => new Set([...repetidas].map(m => Number(m.split(':')[0]))),
    [repetidas],
  );
  const prontas = useMemo(() => prontosParaGravar(grade), [grade]);
  const contatosProntos = grade.filter(c => c.instituicao.trim() !== '').length;

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
    setModo('digitar');
    toast.success(`${r.contatos.length} ${r.contatos.length === 1 ? 'contato passou' : 'contatos passaram'} para a lista. Confira e grave.`);
  }

  /*
   * Linha inteira colada direto num cartão (tem TAB, ou várias escolas numa
   * coluna): passa pelo mesmo leitor da aba de colar, em vez de o campo
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
    if (prontas.length === 0) { toast.error('Preencha ao menos a instituição de um contato.'); return; }
    if (repetidas.size > 0) {
      toast.error('Há indicações repetidas na lista. Tire as marcadas em vermelho antes de gravar.');
      return;
    }

    setSalvando(true);
    const r = await salvarLote({ empresaId, operadorId: emNomeDe || perfilId, itens: prontas });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não deu para gravar.'); return; }

    const d = r.dado!;
    if (d.gravadas > 0) {
      toast.success(`${d.gravadas} ${d.gravadas === 1 ? 'indicação gravada' : 'indicações gravadas'}. Boa! 🎉`);
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
    if (d.gravadas === 0 && d.repetidas.length === 0) toast.info('Nada foi gravado.');

    setGrade([contatoVazio(hoje)]);
    onGravado();
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.05] to-card shadow-sm">
      {/* ── Cabeçalho do bloco ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Sparkles className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold leading-tight">Nova indicação</h2>
            <p className="text-xs text-muted-foreground">Escola, gestora e os telefones que ela passou.</p>
          </div>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1" role="tablist" aria-label="Como cadastrar">
          {([['digitar', 'Digitar', Keyboard], ['colar', 'Colar da planilha', ClipboardPaste]] as const).map(([valor, rotulo, Icone]) => (
            <button
              key={valor} type="button" role="tab" aria-selected={modo === valor}
              onClick={() => setModo(valor)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                modo === valor ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* ── Colar ──────────────────────────────────────────────────────── */}
      {modo === 'colar' && (
        <div className="space-y-3 px-4 pb-4 pt-4 sm:px-5">
          <div className="rounded-xl border border-dashed border-primary/30 bg-background/60 p-3">
            <p className="text-xs text-foreground">
              Copie as linhas do Excel e cole aqui. A ordem das colunas é{' '}
              <strong>escola · gestora · telefone · data · observação</strong>.
            </p>
            <button type="button" onClick={() => setVerDica(v => !v)}
                    className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              <ChevronDown className={cn('h-3 w-3 transition-transform', verDica && 'rotate-180')} />
              {verDica ? 'Esconder detalhes' : 'Vários telefones da mesma escola?'}
            </button>
            {verDica && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                <li>Cada telefone é uma indicação.</li>
                <li>Os outros números podem vir na mesma célula (Alt+Enter) ou nas linhas de baixo, com escola e gestora em branco.</li>
                <li>Separador TAB (Excel) ou <code>;</code>. Sem data, vale hoje.</li>
              </ul>
            )}
          </div>
          <Textarea
            value={colagem}
            onChange={e => setColagem(e.target.value)}
            rows={6}
            placeholder={'Colégio São José\tMaria Clara\t18 93505-6541\t03/09/2026\n\t\t18 93505-9999\n\t\t18 93505-8888'}
            className="bg-background font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={aplicarColagem} disabled={colagem.trim() === ''} className="gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" /> Passar para a lista
            </Button>
          </div>
        </div>
      )}

      {/* ── Digitar: os cartões de contato ─────────────────────────────── */}
      {modo === 'digitar' && (
        <div className="space-y-3 px-4 pb-3 pt-4 sm:px-5">
          {repetidas.size > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">
                Tem número repetido na lista (ou uma escola sem telefone que já aparece em outro cartão).
                Os marcados em vermelho precisam sair — cada indicação conta uma vez só.
              </span>
            </div>
          )}

          {grade.map((contato, ci) => {
            const telefones = telefonesDe(contato);
            const preenchidos = telefones.filter(t => t.trim() !== '').length;
            return (
              <div key={ci}
                   className={cn(
                     'rounded-xl border bg-background p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors',
                     contatosMarcados.has(ci) ? 'border-destructive/50 bg-destructive/5' : 'border-border hover:border-primary/30',
                   )}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Contato {ci + 1}
                    {preenchidos > 1 && <span className="ml-1.5 normal-case tracking-normal text-primary">· {preenchidos} indicações</span>}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Tirar o contato da lista"
                          onClick={() => setGrade(a => a.length === 1 ? [contatoVazio(hoje)] : a.filter((_, k) => k !== ci))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1.6fr_1.2fr_150px]">
                  <label className="relative block">
                    <span className="sr-only">Escola</span>
                    <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={contato.instituicao} placeholder="Escola / instituição"
                           className={cn('pl-8', repetidas.has(`${ci}:*`) && 'border-destructive')}
                           onChange={e => mudarContato(ci, 'instituicao', e.target.value)}
                           onPaste={e => aoColarNoContato(e, ci, true)} />
                  </label>
                  <label className="relative block">
                    <span className="sr-only">Gestora</span>
                    <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={contato.gestora ?? ''} placeholder="Gestora"
                           className="pl-8"
                           onChange={e => mudarContato(ci, 'gestora', e.target.value)}
                           onPaste={e => aoColarNoContato(e, ci, false)} />
                  </label>
                  <label className="relative block">
                    <span className="sr-only">Data da indicação</span>
                    <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input type="date" value={contato.data_indicacao} className="pl-8"
                           onChange={e => mudarContato(ci, 'data_indicacao', e.target.value)} />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {telefones.map((tel, ti) => (
                    <div key={ti}
                         className={cn(
                           'flex items-center rounded-full border bg-muted/30 pl-2.5 pr-0.5',
                           repetidas.has(`${ci}:${ti}`) ? 'border-destructive bg-destructive/10' : 'border-border',
                         )}>
                      <Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        value={tel} placeholder="Telefone" aria-label={`Telefone ${ti + 1}`}
                        ref={el => {
                          if (el) camposDeTelefone.current.set(`${ci}:${ti}`, el);
                          else camposDeTelefone.current.delete(`${ci}:${ti}`);
                        }}
                        className="h-7 w-[124px] bg-transparent px-1.5 text-xs tabular-nums outline-none placeholder:text-muted-foreground"
                        onChange={e => mudarTelefones(ci, t => t.map((v, k) => (k === ti ? e.target.value : v)))}
                        onPaste={e => aoColarTelefone(e, ci, ti)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); novoTelefone(ci, ti); }
                        }}
                      />
                      {telefones.length > 1 && (
                        <button type="button" aria-label="Tirar este telefone"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={() => mudarTelefones(ci, t => t.filter((_, k) => k !== ti))}>
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button"
                          className="flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                          onClick={() => novoTelefone(ci, telefones.length - 1)}>
                    <Plus className="h-3 w-3" /> número
                  </button>
                  <span className="text-[10px] text-muted-foreground">Enter abre o próximo</span>
                </div>
              </div>
            );
          })}

          <button type="button"
                  onClick={() => setGrade(a => [...a, contatoVazio(hoje)])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary">
            <Plus className="h-3.5 w-3.5" /> Outro contato
          </button>
        </div>
      )}

      {/* ── Rodapé: em nome de quem, e gravar ──────────────────────────── */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-background/70 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {podeEditar && quemPodeIndicar.length > 0 && (
            <Select value={emNomeDe || perfilId} onValueChange={setEmNomeDe}>
              <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Em nome de">
                <SelectValue placeholder="Em nome de" />
              </SelectTrigger>
              <SelectContent>
                {quemPodeIndicar.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.id === perfilId
                      ? `${p.nome} (eu)`
                      : `Em nome de ${p.nome}${p.robo ? ' · IA' : ''}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {contatosProntos} {contatosProntos === 1 ? 'contato' : 'contatos'}
            {' · '}{prontas.length} {prontas.length === 1 ? 'indicação' : 'indicações'}
          </span>
        </div>
        <Button onClick={() => void gravar()} disabled={salvando || prontas.length === 0 || repetidas.size > 0} className="gap-1.5">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {salvando ? 'Gravando…' : prontas.length > 0
            ? `Gravar ${prontas.length} ${prontas.length === 1 ? 'indicação' : 'indicações'}`
            : 'Gravar'}
        </Button>
      </div>
    </section>
  );
}
