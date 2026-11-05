/**
 * DivisoesDoSetor — cadastro das divisões de um setor (05/11/2026).
 *
 * Um setor que tem metas separadas, como o Receptivo com «0800» e «Time a
 * vencer», continua sendo um setor só. Aqui se diz:
 *
 *   • quais são as divisões;
 *   • em que divisão cada EQUIPE está (quem está na equipe vem junto — a
 *     composição continua sendo feita na aba Equipes);
 *   • quais LOGINS do relatório recebem sem equipe e somam em cada divisão
 *     (pagueplay_play1, pagueplay_jornadaplay…).
 *
 * Nada aqui muda o total do setor: o que não estiver em divisão nenhuma
 * aparece como «Sem divisão» no Dashboard. Ver `services/setores/divisoes.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, X, AlertTriangle, Users, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useDivisoes } from '@/hooks/useDivisoes';
import {
  divisoesDoSetor, recebedoresSemCadastro,
} from '@/services/setores/divisoes';
import {
  criarDivisao, definirDivisaoDaEquipe, definirRecebedor, excluirDivisao,
  removerRecebedor, renomearDivisao,
} from '@/services/setores/divisoes.service';

const SEM = '__sem__';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  empresaId: string;
  setor: { id: string; nome: string } | null;
}

export function DivisoesDoSetor({ aberto, onFechar, empresaId, setor }: Props) {
  const { perfil } = useAuth();
  const { divisoes: todas, perfilPorUsuario, disponivel, carregando, invalidar } = useDivisoes();
  const divisoes = useMemo(() => divisoesDoSetor(todas, setor?.id), [todas, setor?.id]);

  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  const [novaDivisao, setNovaDivisao] = useState('');
  const [novoLogin, setNovoLogin] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !setor) return;
    let cancelado = false;
    void supabase.from('equipes').select('id, nome')
      .eq('empresa_id', empresaId).eq('setor_id', setor.id).order('nome')
      .then(({ data }) => { if (!cancelado) setEquipes((data ?? []) as { id: string; nome: string }[]); });
    return () => { cancelado = true; };
  }, [aberto, setor, empresaId]);

  const divisaoDaEquipe = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of divisoes) for (const e of d.equipes) m.set(e, d.id);
    return m;
  }, [divisoes]);

  async function executar(acao: () => Promise<string | null>, ok?: string) {
    setOcupado(true);
    try {
      const erro = await acao();
      if (erro) { toast.error(erro); return false; }
      if (ok) toast.success(ok);
      invalidar();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionarDivisao() {
    if (!setor || !novaDivisao.trim()) return;
    const ordem = divisoes.length ? Math.max(...divisoes.map(d => d.ordem)) + 1 : 1;
    const ok = await executar(() => criarDivisao({
      empresaId, setorId: setor.id, nome: novaDivisao, ordem, criadoPor: perfil?.id,
    }), 'Divisão criada');
    if (ok) setNovaDivisao('');
  }

  async function adicionarLogin(divisaoId: string) {
    if (!setor) return;
    const login = (novoLogin[divisaoId] ?? '').trim();
    if (!login) return;
    const ok = await executar(() => definirRecebedor({
      empresaId, setorId: setor.id, divisaoId, usuario: login,
    }));
    if (ok) setNovoLogin(p => ({ ...p, [divisaoId]: '' }));
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Divisões {setor ? `de ${setor.nome}` : ''}</DialogTitle>
          <DialogDescription>
            Metas separadas dentro do mesmo setor (ex.: 0800 e Time a vencer). É só um recorte:
            o total do setor não muda, cada pessoa e cada login somam em uma divisão só, e o que
            não estiver em nenhuma aparece como «Sem divisão».
          </DialogDescription>
        </DialogHeader>

        {!disponivel && !carregando ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p>
              As divisões ainda não existem no banco. Aplique a migration
              <code className="mx-1 text-xs">20261105120500_divisoes_do_setor.sql</code>
              e abra de novo.
            </p>
          </div>
        ) : carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {/* ── As divisões ── */}
            <section className="space-y-2">
              {divisoes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este setor não tem divisões. Crie a primeira abaixo.
                </p>
              )}
              {divisoes.map(d => {
                const semCadastro = recebedoresSemCadastro(d, perfilPorUsuario);
                return (
                  <div key={d.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        defaultValue={d.nome}
                        className="h-8 text-sm font-medium"
                        disabled={ocupado}
                        onBlur={e => {
                          const nome = e.target.value.trim();
                          if (nome && nome !== d.nome) void executar(() => renomearDivisao(d.id, nome));
                        }}
                      />
                      {confirmarExclusao === d.id ? (
                        <>
                          <Button size="sm" variant="destructive" className="h-8" disabled={ocupado}
                            onClick={() => void executar(() => excluirDivisao(d.id), 'Divisão removida')
                              .then(() => setConfirmarExclusao(null))}>
                            Remover
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmarExclusao(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Remover divisão" onClick={() => setConfirmarExclusao(d.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {confirmarExclusao === d.id && (
                      <p className="text-xs text-muted-foreground">
                        As equipes e os logins saem da divisão; a meta dela deixa de aparecer.
                        Ninguém sai do setor e nenhum recebimento é apagado.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground mr-1">Recebem sem equipe:</span>
                      {d.recebedores.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">nenhum</span>
                      )}
                      {d.recebedores.map(u => (
                        <span key={u} className={
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ' +
                          (semCadastro.includes(u) ? 'border-dashed border-border text-muted-foreground' : 'border-border')
                        } title={semCadastro.includes(u)
                          ? 'Sem conta no sistema: soma na divisão pelo login do relatório'
                          : 'Tem conta no sistema com esse login'}>
                          {u}
                          <button type="button" disabled={ocupado} aria-label={`Tirar ${u}`}
                            onClick={() => setor && void executar(() => removerRecebedor(setor.id, u))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <Input
                        value={novoLogin[d.id] ?? ''}
                        onChange={e => setNovoLogin(p => ({ ...p, [d.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') void adicionarLogin(d.id); }}
                        placeholder="login do relatório"
                        className="h-7 w-44 text-xs"
                        disabled={ocupado}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={ocupado || !(novoLogin[d.id] ?? '').trim()}
                        onClick={() => void adicionarLogin(d.id)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    {semCadastro.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Sem conta no sistema: {semCadastro.join(', ')}. Soma na divisão pelo login do
                        relatório — não precisa criar usuário.
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-2">
                <Input
                  value={novaDivisao}
                  onChange={e => setNovaDivisao(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void adicionarDivisao(); }}
                  placeholder="Nome da nova divisão (ex.: 0800)"
                  className="h-8 text-sm"
                  disabled={ocupado}
                />
                <Button size="sm" className="h-8 gap-1" disabled={ocupado || !novaDivisao.trim()}
                  onClick={() => void adicionarDivisao()}>
                  <Plus className="w-3.5 h-3.5" /> Divisão
                </Button>
              </div>
            </section>

            {/* ── As equipes ── */}
            {divisoes.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Users className="w-4 h-4" /> Equipes do setor
                </h3>
                <p className="text-xs text-muted-foreground">
                  Quem está na equipe (membros, líder e clones que contam) soma na divisão dela.
                </p>
                {equipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma equipe neste setor.</p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {equipes.map(eq => (
                      <div key={eq.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm truncate">{eq.nome}</span>
                        <Select
                          value={divisaoDaEquipe.get(eq.id) ?? SEM}
                          disabled={ocupado}
                          onValueChange={v => void executar(() => definirDivisaoDaEquipe({
                            empresaId, equipeId: eq.id, divisaoId: v === SEM ? null : v,
                          }))}
                        >
                          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM}>Sem divisão</SelectItem>
                            {divisoes.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
