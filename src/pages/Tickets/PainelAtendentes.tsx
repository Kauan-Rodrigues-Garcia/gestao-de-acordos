/**
 * PainelAtendentes — a chave da aba e a lista de quem resolve.
 *
 * Duas coisas na mesma caixa porque são a mesma decisão administrativa: quem
 * entra nesta tela, e quem manda nela.
 *
 * A CHAVE (`liberado_para_lideranca`) nasce desligada. No dia do deploy só
 * administrador enxerga a aba — o suficiente para conferir em produção, com
 * dados de verdade, antes de a liderança inteira encontrar uma tela nova sem
 * aviso. Ligar é um clique, e desligar também.
 *
 * A LISTA autoriza quem não é administrador a atender. Administrador e super
 * admin já atendem por cargo e não aparecem aqui: adicioná-los seria sugerir
 * que dá para removê-los, e não dá.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { Loader2, Plus, Trash2, ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  listarAtendentes, autorizarAtendente, revogarAtendente, definirLiberacaoDaAba,
  type Atendente,
} from '@/services/tickets.service';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  liberado: boolean;
  onMudou: () => void;
}

interface Pessoa { id: string; nome: string; perfil: string | null }

export default function PainelAtendentes({ aberto, onFechar, liberado, onMudou }: Props) {
  /*
   * Virar a chave da aba e autorizar atendente eram `administrador` escrito
   * dentro do RLS. Agora sao a mesma chave do painel que a policy pergunta —
   * o botao e o banco passam a concordar por construcao.
   */
  const { temPermissao } = useCargoPermissoes();
  const podeAdministrar = temPermissao('administrar_sistema');
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto || !empresaId) return;
    let vivo = true;
    (async () => {
      const [lista, { data }] = await Promise.all([
        listarAtendentes(empresaId),
        supabase.from('perfis').select('id, nome, perfil')
          .eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
      ]);
      if (!vivo) return;
      setAtendentes(lista);
      setPessoas(((data ?? []) as { id: string; nome: string | null; perfil: string | null }[])
        .map(p => ({ id: p.id, nome: p.nome ?? '(sem nome)', perfil: p.perfil })));
    })();
    return () => { vivo = false; };
  }, [aberto, empresaId]);

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    const jaTem = new Set(atendentes.map(a => a.perfilId));
    return pessoas
      .filter(p => !jaTem.has(p.id)
        && p.perfil !== 'administrador' && p.perfil !== 'super_admin'
        && p.nome.toLowerCase().includes(t))
      .slice(0, 6);
  }, [busca, pessoas, atendentes]);

  async function virarChave(valor: boolean) {
    if (!podeAdministrar) return;
    if (!empresaId) return;
    setSalvando(true);
    const r = await definirLiberacaoDaAba(empresaId, valor, perfil?.id ?? null);
    setSalvando(false);
    if (r.erro) { toast.error(r.erro); return; }
    toast.success(valor
      ? 'Aba liberada: a liderança já vê os tickets.'
      : 'Aba fechada: só administradores e autorizados veem.');
    onMudou();
  }

  async function autorizar(p: Pessoa) {
    if (!podeAdministrar) return;
    if (!empresaId) return;
    const r = await autorizarAtendente(empresaId, p.id, perfil?.id ?? null);
    if (r.erro) { toast.error(r.erro); return; }
    setAtendentes(await listarAtendentes(empresaId));
    setBusca('');
    toast.success(`${p.nome} agora resolve tickets.`);
    onMudou();
  }

  async function revogar(a: Atendente) {
    if (!podeAdministrar) return;
    if (!empresaId) return;
    const r = await revogarAtendente(empresaId, a.perfilId);
    if (r.erro) { toast.error(r.erro); return; }
    setAtendentes(await listarAtendentes(empresaId));
    onMudou();
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Quem vê e quem resolve
          </DialogTitle>
          <DialogDescription>
            A aba começa fechada. Enquanto isso, só administradores e as pessoas autorizadas
            abaixo enxergam os tickets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="pr-3">
              <Label className="text-sm">Liberar a aba para a liderança</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ligado, todo líder, elite, gerência e diretoria passa a ver a aba — cada setor
                com os tickets do próprio setor.
              </p>
            </div>
            <Switch checked={liberado} disabled={salvando}
              onCheckedChange={virarChave} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Autorizados a resolver tickets</Label>
            <div className="relative">
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar pessoa para autorizar…" className="h-9" />
              {sugestoes.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                  {sugestoes.map(p => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center gap-2"
                      onClick={() => autorizar(p)}>
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                      {p.nome}
                      <span className="text-xs text-muted-foreground">{p.perfil}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ul className="space-y-1">
              {atendentes.map(a => (
                <li key={a.perfilId}
                  className="flex items-center gap-2 rounded border border-border px-3 py-1.5">
                  <span className="text-sm flex-1 truncate">{a.nome}</span>
                  <span className="text-[11px] text-muted-foreground">{a.perfil}</span>
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive"
                    onClick={() => revogar(a)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
              {!atendentes.length && (
                <li className="text-xs text-muted-foreground">
                  Ninguém além dos administradores, que já resolvem por cargo.
                </li>
              )}
            </ul>
          </div>

          {salvando && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> salvando…
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
