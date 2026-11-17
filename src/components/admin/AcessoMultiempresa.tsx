/**
 * AcessoMultiempresa — quem enxerga mais de uma visão (empresa do cadastro).
 *
 * ## Para que serve
 *
 * As empresas dividem o banco e são separadas por `empresa_id` + RLS.
 * Atravessar é privilégio de `super_admin` por cargo; esta tela deixa o
 * super_admin liberar nominalmente outras pessoas, empresa por empresa.
 *
 * ## Quem pode receber
 *
 * O cargo que o PAINEL deixa atravessar (chave `acesso_multiempresa_permitido`;
 * administrador por acesso total). Até 17/11/2026 a lista de candidatos tinha
 * «gerência e diretoria» escrito no banco, e um administrador recém-criado
 * (Marcelinho) não aparecia. Hoje candidatos, lista e concessão usam a mesma
 * função: `fn_multiempresa_cargo_permite`.
 *
 * ## Cada empresa aparece pela VISÃO, não pelo nome do cadastro
 *
 * O que muda a tela é a regra de negócio (Nosso produto, Cofen) ou o produto
 * (Comercial, Cantina, RH). BookPlay/PaguePlay é só a marca, pela cidade. Ver
 * `lib/visaoDaEmpresa.ts` e CLAUDE.md, «Cofen não é PaguePlay».
 *
 * ## Só super_admin entra
 *
 * As RPCs conferem `fn_user_is_super_admin()` na primeira linha; a aba nem
 * aparece para os outros, mas não é ali que a segurança mora.
 *
 * ## O que o liberado vê de fato
 *
 * A outra visão COM O PRÓPRIO CARGO. Onde a regra do banco pede setor, o setor
 * de origem não casa com os da outra empresa e a lista vem curta.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, UserPlus, ShieldCheck, Loader2, X, Search, Info, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PERFIL_LABELS, formatDate } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  listarAcessoMultiempresa, listarCandidatosMultiempresa, definirAcessoMultiempresa,
  definirAcessoEmpresa,
  type AcessoMultiempresa as Acesso, type CandidatoMultiempresa,
} from '@/services/acessoMultiempresa.service';
import { fetchEmpresas, fetchVisaoEmpresas } from '@/services/empresas.service';
import { indexarVisoes, type VisaoEmpresa, type VisaoEmpresaBruta } from '@/lib/visaoDaEmpresa';
import { ROTULO_REGRA, ehRegraDoSetor } from '@/lib/regraDoSetor';
import { marcaDaCidade } from '@/lib/marca';
import type { Empresa } from '@/lib/supabase';

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  if (foto) {
    return <img src={foto} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
      {iniciais || '?'}
    </div>
  );
}

function Cargo({ perfil }: { perfil: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      {PERFIL_LABELS[perfil] ?? perfil}
    </span>
  );
}

/** «Play 1 · Nosso produto · BookPlay» — de onde a pessoa é, pela regra e pela marca. */
function origemDoCandidato(c: CandidatoMultiempresa, visaoOrigem: VisaoEmpresa | undefined): string {
  const partes: string[] = [];
  if (c.setor_nome) partes.push(c.setor_nome);
  if (ehRegraDoSetor(c.regra)) partes.push(ROTULO_REGRA[c.regra]);
  else if (visaoOrigem?.titulo) partes.push(visaoOrigem.titulo);
  else if (c.empresa_nome) partes.push(c.empresa_nome);
  const marca = marcaDaCidade(c.cidade);
  if (marca) partes.push(marca.nome);
  return partes.join(' · ') || 'sem empresa';
}

export default function AcessoMultiempresa() {
  const [lista, setLista]           = useState<Acesso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando]     = useState<string | null>(null);

  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [candidatos, setCandidatos]       = useState<CandidatoMultiempresa[] | null>(null);
  const [busca, setBusca]                 = useState('');
  /** Passo 2 do «Adicionar»: a pessoa escolhida e as empresas marcadas. */
  const [escolhido, setEscolhido]         = useState<CandidatoMultiempresa | null>(null);
  const [marcadas, setMarcadas]           = useState<Set<string>>(new Set());

  const [paraRemover, setParaRemover] = useState<Acesso | null>(null);

  // Todas as empresas ativas e a visão de cada uma. Quem abre esta tela é
  // super_admin, então a lista completa é exatamente o que ele precisa marcar.
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [visoesBrutas, setVisoesBrutas] = useState<VisaoEmpresaBruta[]>([]);
  useEffect(() => {
    fetchEmpresas().then(setEmpresas);
    fetchVisaoEmpresas().then(setVisoesBrutas);
  }, []);
  const visoes = useMemo(() => indexarVisoes(visoesBrutas), [visoesBrutas]);
  const rotulo = useCallback(
    (emp: Pick<Empresa, 'id' | 'nome'>) => visoes.get(emp.id)?.titulo || emp.nome,
    [visoes],
  );
  const dica = useCallback((emp: Pick<Empresa, 'id' | 'nome'>) => {
    const v = visoes.get(emp.id);
    return [v?.detalhe, `cadastro: ${emp.nome}`].filter(Boolean).join(' — ');
  }, [visoes]);

  /** A empresa de origem, por id; o nome só serve para o banco antigo. */
  const ehPropria = (emp: Empresa, empresaId: string | null | undefined, empresaNome: string | null) =>
    empresaId ? emp.id === empresaId : emp.nome === empresaNome;

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setLista(await listarAcessoMultiempresa());
    setCarregando(false);
    // A lista de candidatos vira obsoleta a cada mudança: quem foi liberado sai
    // dela. Descartar aqui é mais barato que reconciliar dois estados.
    setCandidatos(null);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  async function abrirDialogo(aberto: boolean) {
    setDialogoAberto(aberto);
    if (!aberto) { setBusca(''); setEscolhido(null); return; }
    if (candidatos) return;
    setCandidatos(await listarCandidatosMultiempresa());
  }

  /**
   * Passo 1 → 2: escolhe a pessoa e já sugere as outras empresas do MESMO
   * produto (um administrador da cobrança costuma precisar de Nosso produto e
   * Cofen). O super_admin ajusta antes de confirmar.
   */
  function escolher(c: CandidatoMultiempresa) {
    const origem = empresas.find(e => ehPropria(e, c.empresa_id, c.empresa_nome));
    const sugestao = new Set(
      empresas
        .filter(e => e.id !== origem?.id && origem?.produto && e.produto === origem.produto)
        .map(e => e.id),
    );
    setEscolhido(c);
    setMarcadas(sugestao);
  }

  async function conceder() {
    if (!escolhido || marcadas.size === 0) return;
    setSalvando(escolhido.usuario_id);
    let erro: string | null = null;
    for (const empresaId of marcadas) {
      const res = await definirAcessoEmpresa(escolhido.usuario_id, empresaId, true);
      // `strict: false`: o TS não estreita união por discriminante booleano —
      // `in` estreita. Mesmo motivo do resto do projeto.
      if ('erro' in res) { erro = res.erro; break; }
    }
    setSalvando(null);
    if (erro) { toast.error(erro); await recarregar(); return; }
    const nomes = empresas.filter(e => marcadas.has(e.id)).map(rotulo).join(', ');
    toast.success(`${escolhido.nome} agora enxerga também: ${nomes}.`);
    setDialogoAberto(false);
    setBusca('');
    setEscolhido(null);
    await recarregar();
  }

  async function revogar(a: Acesso) {
    setSalvando(a.usuario_id);
    const res = await definirAcessoMultiempresa(a.usuario_id, false);
    setSalvando(null);
    setParaRemover(null);
    if ('erro' in res) { toast.error(res.erro); return; }
    toast.success(`${a.nome} volta a ver só a própria visão.`);
    await recarregar();
  }

  /**
   * Liga ou desliga UMA empresa para UMA pessoa.
   *
   * `salvando` guarda `pessoa:empresa` e não só a pessoa: sem isso, marcar uma
   * empresa acenderia o spinner em todas as outras da mesma linha.
   */
  async function alternarEmpresa(a: Acesso, emp: Empresa, liberar: boolean) {
    setSalvando(`${a.usuario_id}:${emp.id}`);
    const res = await definirAcessoEmpresa(a.usuario_id, emp.id, liberar);
    setSalvando(null);
    if ('erro' in res) { toast.error(res.erro); return; }
    toast.success(
      liberar
        ? `${a.nome} passa a enxergar ${rotulo(emp)}.`
        : `${a.nome} deixa de enxergar ${rotulo(emp)}.`,
    );
    await recarregar();
  }

  const candidatosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = candidatos ?? [];
    if (!termo) return base;
    return base.filter(c =>
      c.nome.toLowerCase().includes(termo)
      || (c.email ?? '').toLowerCase().includes(termo)
      || (c.empresa_nome ?? '').toLowerCase().includes(termo)
      || (c.setor_nome ?? '').toLowerCase().includes(termo)
      || (PERFIL_LABELS[c.perfil] ?? c.perfil).toLowerCase().includes(termo));
  }, [candidatos, busca]);

  const liberados = lista.filter(a => !a.e_super_admin);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Acesso entre visões
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Marque, pessoa por pessoa, quais visões ela enxerga além da
                própria — Nosso produto, Cofen, Comercial, Cantina, RH. Quem tem
                ao menos uma ganha o botão de trocar no topo da tela.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => abrirDialogo(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Adicionar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {carregando && (
            <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}

          {!carregando && lista.map(a => {
            const origem = empresas.find(e => ehPropria(e, a.empresa_id, a.empresa_nome));
            const semEfeito = !a.e_super_admin && a.cargo_permite === false;
            return (
            <div key={a.usuario_id} className="rounded-lg border border-border">
              <div className="flex items-center gap-3 p-3">
                <Avatar nome={a.nome} foto={a.foto_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{a.nome}</span>
                    <Cargo perfil={a.perfil} />
                    {(origem || a.empresa_nome) && (
                      <span className="text-[10px] text-muted-foreground">
                        origem: {origem ? rotulo(origem) : a.empresa_nome}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.e_super_admin
                      ? 'Acesso pelo cargo de super admin — não pode ser removido aqui.'
                      : a.concedido_em
                        ? `Liberado por ${a.concedido_por ?? 'alguém que já saiu'} em ${formatDate(a.concedido_em)}`
                        : 'Liberado'}
                  </p>
                  {semEfeito && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      O cargo atual não pode atravessar — a liberação está gravada mas sem efeito.
                    </p>
                  )}
                </div>
                {a.e_super_admin ? (
                  <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive shrink-0"
                    disabled={salvando !== null}
                    onClick={() => setParaRemover(a)}
                  >
                    {salvando === a.usuario_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                    Remover
                  </Button>
                )}
              </div>

              {/*
                As visões, uma a uma. A de origem aparece marcada e travada: o
                acesso a ela vem do cadastro, não de concessão.
              */}
              {!a.e_super_admin && empresas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-12 pr-3 pb-3">
                  {empresas.map(emp => {
                    const propria  = ehPropria(emp, a.empresa_id, a.empresa_nome);
                    const liberada = a.empresas_liberadas.some(x => x.id === emp.id);
                    const ocupado  = salvando === `${a.usuario_id}:${emp.id}`;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        disabled={propria || salvando !== null}
                        onClick={() => alternarEmpresa(a, emp, !liberada)}
                        className={cn(
                          'text-[11px] px-2 py-1 rounded-full border transition-colors',
                          propria
                            ? 'border-border bg-muted text-muted-foreground cursor-default'
                            : liberada
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                        title={propria ? `Visão de origem — vem do cadastro (${emp.nome})` : dica(emp)}
                      >
                        {ocupado && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                        {rotulo(emp)}
                        {propria && ' · origem'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}

          {!carregando && liberados.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              Ninguém liberado além dos super admins. Use «Adicionar» para incluir alguém.
            </p>
          )}

          <div className="flex gap-2 items-start pt-2 text-[11px] text-muted-foreground border-t border-border mt-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              Quem é liberado vê a outra visão <strong>com o próprio cargo</strong>, não
              como super admin. Nas telas em que a regra depende de setor — Acordos, por
              exemplo — o setor de origem não corresponde a nenhum setor da outra visão,
              então a lista vem curta. O acesso cai sozinho se o painel do cargo deixar de
              permitir «Acesso às duas operações».
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Adicionar ─────────────────────────────────────────────────── */}
      <Dialog open={dialogoAberto} onOpenChange={abrirDialogo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {escolhido ? `Quais visões ${escolhido.nome} enxerga?` : 'Liberar acesso a outras visões'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {escolhido
                ? 'Marque as visões além da de origem. Dá para mudar depois na lista.'
                : 'Aparecem os cargos que o painel deixa atravessar (chave «Acesso às duas operações») — administrador, diretoria, gerência e o que mais estiver marcado.'}
            </DialogDescription>
          </DialogHeader>

          {!escolhido && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome, cargo, setor ou e-mail"
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {candidatos === null && (
                  <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                  </div>
                )}
                {candidatos !== null && candidatosFiltrados.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    {candidatos.length === 0
                      ? 'Todo mundo que pode atravessar já tem acesso.'
                      : 'Ninguém encontrado com esse termo.'}
                  </p>
                )}
                {candidatosFiltrados.map(c => {
                  const origem = empresas.find(e => ehPropria(e, c.empresa_id, c.empresa_nome));
                  return (
                    <button
                      key={c.usuario_id}
                      type="button"
                      onClick={() => escolher(c)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2.5 rounded-lg border border-border text-left',
                        'hover:bg-muted/60 transition-colors',
                      )}
                    >
                      <Avatar nome={c.nome} foto={c.foto_url} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{c.nome}</span>
                          <Cargo perfil={c.perfil} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {origemDoCandidato(c, origem ? visoes.get(origem.id) : undefined)}
                          {c.email ? ` · ${c.email}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {escolhido && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {empresas.map(emp => {
                  const propria = ehPropria(emp, escolhido.empresa_id, escolhido.empresa_nome);
                  const marcada = marcadas.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      disabled={propria || salvando !== null}
                      onClick={() => setMarcadas(prev => {
                        const prox = new Set(prev);
                        if (prox.has(emp.id)) prox.delete(emp.id); else prox.add(emp.id);
                        return prox;
                      })}
                      title={dica(emp)}
                      className={cn(
                        'text-xs px-2.5 py-1.5 rounded-full border transition-colors text-left',
                        propria
                          ? 'border-border bg-muted text-muted-foreground cursor-default'
                          : marcada
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {rotulo(emp)}
                      {propria && ' · origem'}
                      {visoes.get(emp.id)?.detalhe && (
                        <span className="block text-[10px] opacity-75">{visoes.get(emp.id)?.detalhe}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  disabled={salvando !== null}
                  onClick={() => setEscolhido(null)}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                </Button>
                <Button
                  size="sm"
                  disabled={salvando !== null || marcadas.size === 0}
                  onClick={conceder}
                >
                  {salvando !== null && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  Liberar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remover ───────────────────────────────────────────────────── */}
      <Dialog open={paraRemover !== null} onOpenChange={a => !a && setParaRemover(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Remover acesso às outras visões?</DialogTitle>
            <DialogDescription className="text-xs">
              {paraRemover && (
                <>
                  <strong>{paraRemover.nome}</strong> volta a ver só a visão de origem, e o
                  botão de trocar some do cabeçalho. Se estiver com outra visão aberta agora,
                  a tela volta para a de origem no próximo carregamento. Dá para liberar de
                  novo depois.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setParaRemover(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive" size="sm"
              disabled={salvando !== null}
              onClick={() => paraRemover && revogar(paraRemover)}
            >
              {salvando !== null && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Remover acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
