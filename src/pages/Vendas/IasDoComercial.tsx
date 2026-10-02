/**
 * IasDoComercial — a aba «IAs» de Usuários, só no Comercial (01/10/2026).
 *
 * Lista os logins de inteligência artificial (`perfis.robo`) com o tipo e o
 * vínculo de cada um, e deixa quem tem `vincular_ias_vendas` definir o tipo,
 * vincular, trocar e desvincular.
 *
 * ## Cada setor vê as suas (02/10/2026)
 *
 * A lista vem recortada pelo alcance da aba (`ias_escopo_setor` ou
 * `ias_escopo_todos_setores`, card Usuários em Permissões): a Performance não
 * vê mais as IAs de Vendas BookPlay. O operador oferecido no vínculo é do
 * setor da IA; quem alcança todos os setores pode abrir a lista inteira. O
 * banco confere o mesmo (`fn_vendas_ias_alcanca_setor`).
 *
 * ## O que o vínculo faz
 *
 * A venda da IA confirmada dentro do período do vínculo passa a contar para o
 * operador vinculado e para a equipe dele. Sem vínculo, conta só no setor. A
 * venda em si nunca muda — ver `@/lib/vendasIa` —, e por isso trocar ou
 * desvincular é seguro: o total geral não se mexe, só muda em quem a linha
 * aparece.
 *
 * ## Mês inteiro ou a partir da data
 *
 * Quem troca escolhe. «Mês inteiro» leva o mês escolhido inteiro para a nova
 * pessoa (o vínculo começa no dia 1); «a partir da data» divide o mês. Os dois
 * substituem tudo daquele dia em diante — o banco garante que a IA nunca tem
 * dois donos na mesma data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Link2, Unlink, Plus, Search, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { formatDate, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { inicioDoMes, vinculoVigente, type IaDoCadastro } from '@/lib/vendasIa';
import {
  buscarIasDaAba, buscarTiposDeIa, criarTipoDeIa, definirTipoDaIa,
  esquecerCadastroDeIas, vincularIa, type TipoDeIa,
} from '@/services/vendas/iaVendas.service';
import { buscarPessoasDoPlacar, type PessoaComAusencia } from '@/services/vendas/placar.service';

const SEM_TIPO = '__sem_tipo__';

type Modo = 'mes' | 'data';

interface EmEdicao {
  ia: IaDoCadastro;
  /** `true` = desvincular; `false` = vincular ou trocar. */
  desvincular: boolean;
}

function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** "outubro de 2026" — para o rótulo da opção «mês inteiro». */
function rotuloDoMes(data: string): string {
  const [ano, mes] = data.split('-').map(Number);
  if (!ano || !mes) return '';
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function IasDoComercial() {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;
  const { temPermissao } = useCargoPermissoes();
  const podeEditar = temPermissao('vincular_ias_vendas');
  const veTodosSetores = useMemo(
    () => niveisLiberados('ias', temPermissao).includes('todos_setores'),
    [temPermissao],
  );

  const [ias, setIas] = useState<IaDoCadastro[]>([]);
  const [tipos, setTipos] = useState<TipoDeIa[]>([]);
  const [pessoas, setPessoas] = useState<PessoaComAusencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [novoTipo, setNovoTipo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [edicao, setEdicao] = useState<EmEdicao | null>(null);
  const [operador, setOperador] = useState<string>('');
  const [modo, setModo] = useState<Modo>('mes');
  const [data, setData] = useState<string>(getTodayISO());
  // Quem alcança todos os setores pode vincular a IA a alguém de outro setor.
  const [outrosSetores, setOutrosSetores] = useState(false);

  const hoje = getTodayISO();

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    esquecerCadastroDeIas(empresaId);
    const [cadastro, listaTipos, placar] = await Promise.all([
      buscarIasDaAba(empresaId),
      buscarTiposDeIa(empresaId),
      buscarPessoasDoPlacar(empresaId),
    ]);
    setIas(cadastro.ias);
    setErro(cadastro.erro);
    setTipos(listaTipos);
    setPessoas(placar.pessoas);
    setCarregando(false);
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Quem pode receber ESTA IA: gente, não desligada, e do setor dela.
   *
   * IA sem setor, ou «outros setores» marcado por quem alcança todos, abre a
   * lista inteira — com o setor ao lado do nome para não confundir.
   */
  const operadores = useMemo(() => {
    const setorDaIa = edicao?.ia.setorId ?? null;
    const todos = !setorDaIa || (veTodosSetores && outrosSetores);
    return pessoas
      .filter(p => !p.robo && p.situacao !== 'desligado')
      .filter(p => todos || p.setor_id === setorDaIa)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, edicao, veTodosSetores, outrosSetores]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return ias;
    return ias.filter(ia => {
      const vigente = vinculoVigente(ia, hoje);
      return normalizar(`${ia.nome} ${ia.usuario} ${ia.tipoNome ?? ''} ${vigente?.operadorNome ?? ''}`)
        .includes(termo);
    });
  }, [ias, busca, hoje]);

  const contagem = useMemo(() => ({
    total: ias.length,
    vinculadas: ias.filter(ia => vinculoVigente(ia, hoje)).length,
    semTipo: ias.filter(ia => !ia.tipoId).length,
  }), [ias, hoje]);

  const abrir = (ia: IaDoCadastro, desvincular: boolean) => {
    setEdicao({ ia, desvincular });
    setOperador(desvincular ? '' : (vinculoVigente(ia, hoje)?.operadorId ?? ''));
    setModo('mes');
    setData(hoje);
    setOutrosSetores(false);
  };

  const desde = modo === 'mes' ? inicioDoMes(data) : data;

  const confirmar = async () => {
    if (!edicao || !empresaId || !data) return;
    if (!edicao.desvincular && !operador) { toast.error('Escolha o operador.'); return; }
    setSalvando(true);
    const r = await vincularIa({
      empresaId,
      iaId: edicao.ia.id,
      operadorId: edicao.desvincular ? null : operador,
      desde,
    });
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o vínculo.'); return; }
    toast.success(edicao.desvincular
      ? `${edicao.ia.nome} desvinculada a partir de ${formatDate(desde)}.`
      : `${edicao.ia.nome} vinculada a partir de ${formatDate(desde)}.`);
    setEdicao(null);
    void carregar();
  };

  const trocarTipo = async (ia: IaDoCadastro, valor: string) => {
    if (!empresaId) return;
    const r = await definirTipoDaIa({ empresaId, iaId: ia.id, tipoId: valor === SEM_TIPO ? null : valor });
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível trocar o tipo.'); return; }
    void carregar();
  };

  const adicionarTipo = async () => {
    if (!empresaId || !novoTipo.trim()) return;
    setSalvando(true);
    const r = await criarTipoDeIa(empresaId, novoTipo);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível criar o tipo.'); return; }
    toast.success(`Tipo «${novoTipo.trim()}» criado.`);
    setNovoTipo('');
    void carregar();
  };

  if (!empresaId) return null;

  return (
    <div className="space-y-4 p-1">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4 text-primary" /> Logins de IA
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A venda de uma IA vinculada conta para o operador e para a equipe dele, uma vez só no
            total. Sem vínculo, conta só para o setor. Desvincular ou trocar não apaga nada: o valor
            volta para a IA, ou passa para a outra pessoa.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar IA, login ou operador" className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">{contagem.total} IAs</span>
        <span className="rounded-md border border-border px-2 py-1">{contagem.vinculadas} vinculadas hoje</span>
        {contagem.semTipo > 0 && (
          <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-warning">
            {contagem.semTipo} sem tipo definido
          </span>
        )}
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {erro}
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando IAs…
        </div>
      ) : visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {ias.length === 0
            ? (veTodosSetores
              ? 'Nenhum login marcado como IA. Marque em Usuários → editar → «Este login é automação».'
              : 'Nenhuma IA no seu setor. Marque em Usuários → editar → «Este login é automação».')
            : 'Nenhuma IA encontrada para essa busca.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">IA</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Vinculada a</th>
                <th className="px-3 py-2 text-left font-medium">Histórico</th>
                {podeEditar && <th className="px-3 py-2 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(ia => {
                const vigente = vinculoVigente(ia, hoje);
                return (
                  <tr key={ia.id} className="border-t border-border/70 align-middle">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{ia.nome}</span>
                        <span className="rounded border border-primary/30 bg-primary/10 px-1 text-[9px] font-bold text-primary">IA</span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {ia.usuario}{ia.setorNome ? ` · ${ia.setorNome}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {podeEditar ? (
                        <Select value={ia.tipoId ?? SEM_TIPO} onValueChange={v => void trocarTipo(ia, v)}>
                          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_TIPO}>Sem tipo</SelectItem>
                            {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={cn('text-xs', !ia.tipoNome && 'text-muted-foreground')}>
                          {ia.tipoNome ?? 'Sem tipo'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {vigente ? (
                        <>
                          <p className="text-sm">{vigente.operadorNome ?? 'Operador'}</p>
                          <p className="text-[11px] text-muted-foreground">desde {formatDate(vigente.desde)}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem vínculo · conta só no setor</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                      {ia.vinculos.length === 0 ? '—' : (
                        <ul className="space-y-0.5">
                          {ia.vinculos.slice(-3).map(v => (
                            <li key={`${v.desde}-${v.operadorId}`}>
                              {v.operadorNome ?? 'Operador'}: {formatDate(v.desde)} → {v.ate ? formatDate(v.ate) : 'hoje'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {podeEditar && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => abrir(ia, false)}>
                            <Link2 className="h-3 w-3" /> {vigente ? 'Trocar' : 'Vincular'}
                          </Button>
                          {vigente && (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => abrir(ia, true)}>
                              <Unlink className="h-3 w-3" /> Desvincular
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tipos ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-3">
        <p className="text-xs font-medium">Tipos de IA</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tipos.map(t => (
            <span key={t.id} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs">{t.nome}</span>
          ))}
          {tipos.length === 0 && <span className="text-xs text-muted-foreground">Nenhum tipo cadastrado.</span>}
        </div>
        {podeEditar && (
          <div className="mt-2.5 flex max-w-sm gap-2">
            <Input
              value={novoTipo} onChange={e => setNovoTipo(e.target.value)} maxLength={40}
              placeholder="Novo tipo (ex.: Campanha)" className="h-8 text-xs"
              onKeyDown={e => { if (e.key === 'Enter') void adicionarTipo(); }}
            />
            <Button size="sm" className="h-8 gap-1" disabled={!novoTipo.trim() || salvando} onClick={() => void adicionarTipo()}>
              <Plus className="h-3.5 w-3.5" /> Criar
            </Button>
          </div>
        )}
      </div>

      {/* ── Vincular / trocar / desvincular ─────────────────────────────── */}
      <Dialog open={edicao !== null} onOpenChange={aberto => { if (!aberto) setEdicao(null); }}>
        <DialogContent className="sm:max-w-md">
          {edicao && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {edicao.desvincular ? 'Desvincular' : vinculoVigente(edicao.ia, hoje) ? 'Trocar vínculo de' : 'Vincular'} {edicao.ia.nome}
                </DialogTitle>
                <DialogDescription>
                  {edicao.desvincular
                    ? 'Daquela data em diante, as vendas da IA voltam a contar só para o setor.'
                    : 'As vendas da IA passam a contar para o operador escolhido e para a equipe dele.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {!edicao.desvincular && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Operador</Label>
                    <Select value={operador} onValueChange={setOperador}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha quem leva o crédito" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {operadores.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}{p.equipe_nome ? ` · ${p.equipe_nome}` : ''}
                            {p.setor_id !== edicao.ia.setorId && p.setor_nome ? ` · ${p.setor_nome}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {operadores.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Ninguém ativo no setor {edicao.ia.setorNome ?? 'desta IA'}.
                      </p>
                    )}
                    {veTodosSetores && edicao.ia.setorId && (
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox" checked={outrosSetores}
                          onChange={e => setOutrosSetores(e.target.checked)}
                        />
                        Mostrar operadores de outros setores
                      </label>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 text-sm" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Vale a partir de quando?</Label>
                  {([
                    ['mes', `Mês inteiro — ${rotuloDoMes(data)}`, `Desde ${formatDate(inicioDoMes(data))}: o mês todo ${edicao.desvincular ? 'deixa de contar para a pessoa' : 'vai para a nova pessoa'}.`],
                    ['data', `A partir de ${data ? formatDate(data) : 'uma data'}`, 'Vendas confirmadas antes dessa data continuam onde estavam.'],
                  ] as const).map(([valor, titulo, ajuda]) => (
                    <button
                      key={valor} type="button" onClick={() => setModo(valor)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        modo === valor ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                      )}
                    >
                      <p className="text-sm font-medium">{titulo}</p>
                      <p className="text-[11px] text-muted-foreground">{ajuda}</p>
                    </button>
                  ))}
                </div>

                <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  Vale de <strong>{data ? formatDate(desde) : '—'}</strong> em diante e substitui qualquer
                  vínculo desta IA a partir desse dia. O total do setor não muda.
                </p>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
                <Button
                  onClick={() => void confirmar()}
                  disabled={salvando || !data || (!edicao.desvincular && !operador)}
                  variant={edicao.desvincular ? 'destructive' : 'default'}
                >
                  {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {edicao.desvincular ? 'Desvincular' : 'Salvar vínculo'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
