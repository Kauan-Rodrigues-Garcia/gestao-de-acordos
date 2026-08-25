/**
 * AcessoMultiempresa — quem enxerga o conteúdo das duas empresas.
 *
 * ## Para que serve
 *
 * `bookplay` e `pagueplay` dividem o banco e são separadas por `empresa_id` +
 * RLS. Atravessar era privilégio exclusivo de `super_admin`. Esta tela deixa o
 * super_admin liberar nominalmente gente de gerência e diretoria — que passa a
 * ver as duas e ganha o botão de trocar de empresa no cabeçalho.
 *
 * ## Só super_admin entra
 *
 * A aba nem aparece para os outros, e não é aí que a segurança mora: as três
 * RPCs conferem `fn_user_is_super_admin()` na primeira linha, e a coluna em
 * `perfis` tem trigger que recusa escrita de quem não for super_admin — inclusive
 * de administrador, que tem UPDATE em `perfis` por outra policy.
 *
 * ## O super_admin aparece na lista e não sai dela
 *
 * O acesso dele vem do cargo, não de uma liberação, e "remover" ali não teria o
 * que remover. Some da lista quando o cargo muda — que é a forma certa.
 *
 * ## O que o liberado vê de fato
 *
 * A outra empresa COM O PRÓPRIO CARGO. Onde a regra do banco pede setor
 * (Acordos, para gerência na BookPlay), o setor da empresa de origem não casa
 * com os setores da outra e a lista vem curta. Diretoria, liberada por cargo na
 * maioria das telas, atravessa inteira. O aviso no rodapé do card diz isso na
 * tela, para ninguém descobrir depois.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, UserPlus, ShieldCheck, Loader2, X, Search, Info } from 'lucide-react';
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
import { fetchEmpresas } from '@/services/empresas.service';
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

export default function AcessoMultiempresa() {
  const [lista, setLista]           = useState<Acesso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando]     = useState<string | null>(null);

  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [candidatos, setCandidatos]       = useState<CandidatoMultiempresa[] | null>(null);
  const [busca, setBusca]                 = useState('');

  const [paraRemover, setParaRemover] = useState<Acesso | null>(null);

  // Todas as empresas ativas. Quem abre esta tela é super_admin, então a lista
  // completa é exatamente o que ele precisa marcar.
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  useEffect(() => { fetchEmpresas().then(setEmpresas); }, []);

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
    if (!aberto) { setBusca(''); return; }
    if (candidatos) return;
    setCandidatos(await listarCandidatosMultiempresa());
  }

  async function conceder(c: CandidatoMultiempresa) {
    setSalvando(c.usuario_id);
    const res = await definirAcessoMultiempresa(c.usuario_id, true);
    setSalvando(null);
    // `strict: false`: o TS não estreita união por discriminante booleano —
    // `in` estreita. Mesmo motivo do resto do projeto.
    if ('erro' in res) { toast.error(res.erro); return; }
    toast.success(`${c.nome} agora enxerga as duas empresas.`);
    setDialogoAberto(false);
    setBusca('');
    await recarregar();
  }

  async function revogar(a: Acesso) {
    setSalvando(a.usuario_id);
    const res = await definirAcessoMultiempresa(a.usuario_id, false);
    setSalvando(null);
    setParaRemover(null);
    // `strict: false`: o TS não estreita união por discriminante booleano —
    // `in` estreita. Mesmo motivo do resto do projeto.
    if ('erro' in res) { toast.error(res.erro); return; }
    toast.success(`${a.nome} volta a ver só ${a.empresa_nome ?? 'a empresa de origem'}.`);
    await recarregar();
  }

  /**
   * Liga ou desliga UMA empresa para UMA pessoa.
   *
   * `salvando` guarda `pessoa:empresa` e não só a pessoa: sem isso, marcar uma
   * empresa acenderia o spinner em todas as outras da mesma linha.
   */
  async function alternarEmpresa(a: Acesso, empresaId: string, liberar: boolean) {
    setSalvando(`${a.usuario_id}:${empresaId}`);
    const res = await definirAcessoEmpresa(a.usuario_id, empresaId, liberar);
    setSalvando(null);
    // `strict: false`: o TS não estreita união por discriminante booleano —
    // `in` estreita. Mesmo motivo do resto do projeto.
    if ('erro' in res) { toast.error(res.erro); return; }
    toast.success(
      liberar
        ? `${a.nome} passa a enxergar ${res.empresa}.`
        : `${a.nome} deixa de enxergar ${res.empresa}.`,
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
      || (c.empresa_nome ?? '').toLowerCase().includes(termo));
  }, [candidatos, busca]);

  const liberados = lista.filter(a => !a.e_super_admin);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Acesso entre empresas
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Marque, pessoa por pessoa, quais empresas ela enxerga além da
                própria. Quem tem ao menos uma ganha o botão de trocar de empresa
                no topo da tela.
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

          {!carregando && lista.map(a => (
            <div
              key={a.usuario_id}
              className="rounded-lg border border-border"
            >
            <div className="flex items-center gap-3 p-3">
              <Avatar nome={a.nome} foto={a.foto_url} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{a.nome}</span>
                  <Cargo perfil={a.perfil} />
                  {a.empresa_nome && (
                    <span className="text-[10px] text-muted-foreground">
                      origem: {a.empresa_nome}
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
            As empresas, uma a uma.
            ───────────────────────
            Até 25/08 esta tela tinha um interruptor só, e ele valia para TODAS
            as empresas — inclusive as que ainda não existiam. Foi assim que duas
            pessoas de diretoria ganharam acesso ao Comercial e ao RH no dia em
            que essas empresas nasceram, sem ninguém decidir.

            A empresa de origem aparece marcada e travada: o acesso a ela vem do
            cadastro, não de concessão, e oferecer um botão para tirá-la sugeriria
            um poder que esta tela não tem.
          */}
            {!a.e_super_admin && empresas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-12 pb-1">
              {empresas.map(emp => {
                const propria  = emp.nome === a.empresa_nome;
                const liberada = a.empresas_liberadas.some(x => x.id === emp.id);
                const ocupado  = salvando === `${a.usuario_id}:${emp.id}`;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    disabled={propria || salvando !== null}
                    onClick={() => alternarEmpresa(a, emp.id, !liberada)}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-full border transition-colors',
                      propria
                        ? 'border-border bg-muted text-muted-foreground cursor-default'
                        : liberada
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                    title={propria ? 'Empresa de origem — vem do cadastro' : undefined}
                  >
                    {ocupado && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                    {emp.nome}
                    {propria && ' · origem'}
                  </button>
                );
              })}
            </div>
          )}
          </div>
          ))}

          {!carregando && liberados.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              Ninguém liberado além dos super admins. Use "Adicionar" para incluir
              gerência ou diretoria.
            </p>
          )}

          <div className="flex gap-2 items-start pt-2 text-[11px] text-muted-foreground border-t border-border mt-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              Quem é liberado vê a outra empresa <strong>com o próprio cargo</strong>, não
              como super admin. Nas telas em que a regra depende de setor — Acordos, por
              exemplo — o setor da empresa de origem não corresponde a nenhum setor da
              outra, então a lista vem curta. Diretoria atravessa inteira. E o acesso cai
              sozinho se o cargo deixar de ser gerência ou diretoria.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Adicionar ─────────────────────────────────────────────────── */}
      <Dialog open={dialogoAberto} onOpenChange={abrirDialogo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Liberar acesso às duas empresas</DialogTitle>
            <DialogDescription className="text-xs">
              Só gerência e diretoria aparecem aqui. Operadores, líderes e
              administradores continuam restritos à empresa de origem.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail ou empresa"
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
                  ? 'Todo mundo de gerência e diretoria já tem acesso.'
                  : 'Ninguém encontrado com esse termo.'}
              </p>
            )}
            {candidatosFiltrados.map(c => (
              <button
                key={c.usuario_id}
                type="button"
                disabled={salvando !== null}
                onClick={() => conceder(c)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-lg border border-border text-left',
                  'hover:bg-muted/60 transition-colors disabled:opacity-60',
                )}
              >
                <Avatar nome={c.nome} foto={c.foto_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.nome}</span>
                    <Cargo perfil={c.perfil} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.empresa_nome ?? 'sem empresa'}{c.email ? ` · ${c.email}` : ''}
                  </p>
                </div>
                {salvando === c.usuario_id && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Remover ───────────────────────────────────────────────────── */}
      <Dialog open={paraRemover !== null} onOpenChange={a => !a && setParaRemover(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Remover acesso às duas empresas?</DialogTitle>
            <DialogDescription className="text-xs">
              {paraRemover && (
                <>
                  <strong>{paraRemover.nome}</strong> volta a ver só{' '}
                  {paraRemover.empresa_nome ?? 'a empresa de origem'}, e o botão de trocar
                  de empresa some do cabeçalho. Se estiver com a outra empresa aberta
                  agora, a tela volta para a de origem no próximo carregamento. Dá para
                  liberar de novo depois.
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
