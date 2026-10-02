/**
 * AdminCargos — o cadastro de cargos e as regras de negócio de cada um.
 *
 * ## Para que serve
 *
 * As fases 2 a 6 da reorganização (02/10/2026) tiraram o cargo das listas
 * escritas no código e o puseram em `public.cargos`, com os atributos que
 * respondem as perguntas de negócio: pertence a setor, conta no recebimento,
 * lidera equipe, tem acesso total. Faltava onde mexer nisso sem migration.
 * Esta aba é esse lugar: criar cargo, renomear, mudar nível e regras, desativar.
 *
 * ## Quem manda é o banco
 *
 * Escrever em `cargos` é só para super_admin (policies de 20261002173500), e o
 * gatilho `fn_cargos_guarda` (20261003120000) recusa o que deixaria o cadastro
 * incoerente: trocar o identificador, mexer no Super Admin, trocar a regra de
 * setor de um cargo com gente dentro. A tela desliga esses controles antes,
 * para ninguém descobrir pelo erro.
 *
 * O que cada cargo ENXERGA continua no painel de Permissões, por empresa. Cargo
 * novo nasce sem permissão nenhuma.
 */
import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Pencil, Loader2, Info, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PERFIL_COLORS } from '@/lib/index';
import { slugDoNome, type Cargo } from '@/lib/cargos';
import { useCargos } from '@/hooks/useCargos';
import { cn } from '@/lib/utils';

type Regra = 'pertence_a_setor' | 'conta_no_recebimento' | 'lidera_equipe' | 'acesso_total';

/** As regras de negócio, na ordem e nas palavras em que aparecem na tela. */
const REGRAS: { chave: Regra; titulo: string; explica: string }[] = [
  {
    chave: 'pertence_a_setor',
    titulo: 'Pertence a um setor',
    explica: 'Desligado, a pessoa fica sem setor e vê a empresa inteira, como a diretoria.',
  },
  {
    chave: 'conta_no_recebimento',
    titulo: 'Conta no recebimento',
    explica: 'Entra no ranking, nos quartis e no filtro de operadores; o recebimento dela soma no time.',
  },
  {
    chave: 'lidera_equipe',
    titulo: 'Lidera equipe',
    explica: 'Pode ser líder de equipe. Sem contar no recebimento, abre a visão da equipe no celular.',
  },
  {
    chave: 'acesso_total',
    titulo: 'Acesso total',
    explica: 'Vê e faz tudo, sem passar pelo painel de permissões. Só para administração.',
  },
];

interface Formulario {
  nome: string;
  nivel: string;
  pertence_a_setor: boolean;
  conta_no_recebimento: boolean;
  lidera_equipe: boolean;
  acesso_total: boolean;
  ativo: boolean;
}

const VAZIO: Formulario = {
  nome: '', nivel: '', pertence_a_setor: true, conta_no_recebimento: false,
  lidera_equipe: false, acesso_total: false, ativo: true,
};

function doCargo(c: Cargo): Formulario {
  return {
    nome: c.nome, nivel: c.nivel === null ? '' : String(c.nivel),
    pertence_a_setor: c.pertence_a_setor, conta_no_recebimento: c.conta_no_recebimento,
    lidera_equipe: c.lidera_equipe, acesso_total: c.acesso_total, ativo: c.ativo,
  };
}

/** Quantas pessoas há em cada cargo — a regra de setor só muda em cargo vazio. */
function usePessoasPorCargo(versao: number): Record<string, number> {
  const [contagem, setContagem] = useState<Record<string, number>>({});
  useEffect(() => {
    let vivo = true;
    supabase.from('perfis').select('perfil').then(({ data }) => {
      if (!vivo || !data) return;
      const c: Record<string, number> = {};
      for (const r of data as { perfil: string }[]) c[r.perfil] = (c[r.perfil] ?? 0) + 1;
      setContagem(c);
    });
    return () => { vivo = false; };
  }, [versao]);
  return contagem;
}

export default function AdminCargos({ podeEditar }: { podeEditar: boolean }) {
  const { cargos, recarregar } = useCargos();
  const [versao, setVersao] = useState(0);
  const pessoas = usePessoasPorCargo(versao);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Cargo | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const ordenados = useMemo(() => [...cargos].sort((a, b) => a.ordem - b.ordem), [cargos]);

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setAberto(true);
  }
  function abrirEdicao(c: Cargo) {
    setEditando(c);
    setForm(doCargo(c));
    setAberto(true);
  }

  const ehSuperAdmin = editando?.slug === 'super_admin';
  const temGente = !!editando && (pessoas[editando.slug] ?? 0) > 0;
  const slugNovo = editando ? editando.slug : slugDoNome(form.nome);
  const slugRepetido = !editando && cargos.some(c => c.slug === slugNovo);
  const nivelInvalido = form.nivel.trim() !== '' && !/^\d{1,2}$/.test(form.nivel.trim());
  const podeSalvar = form.nome.trim().length >= 2 && !!slugNovo && !slugRepetido && !nivelInvalido;

  function travada(r: Regra): string | null {
    if (ehSuperAdmin && (r === 'acesso_total' || r === 'pertence_a_setor')) return 'O Super Admin não muda.';
    if (r === 'pertence_a_setor' && temGente) return 'Tem gente neste cargo: mude o cargo delas antes.';
    if (r === 'pertence_a_setor' && editando?.exige_tipo_setor) return 'Cargo exclusivo do Núcleo.';
    return null;
  }

  async function salvar() {
    if (!podeSalvar) return;
    if (form.acesso_total && !(editando?.acesso_total)
        && !confirm(`Dar acesso total a ${form.nome.trim()}? Quem tiver este cargo verá e fará tudo.`)) return;
    setSalvando(true);
    const campos = {
      nome: form.nome.trim(),
      nivel: form.nivel.trim() === '' ? null : Number(form.nivel),
      pertence_a_setor: form.pertence_a_setor,
      conta_no_recebimento: form.conta_no_recebimento,
      lidera_equipe: form.lidera_equipe,
      acesso_total: form.acesso_total,
      ativo: form.ativo,
    };
    try {
      if (editando) {
        const { error } = await supabase.from('cargos').update(campos).eq('slug', editando.slug);
        if (error) throw error;
        toast.success(`Cargo ${campos.nome} salvo.`);
      } else {
        const ordem = Math.max(0, ...cargos.map(c => c.ordem)) + 1;
        const { error } = await supabase.from('cargos').insert({ ...campos, slug: slugNovo, ordem });
        if (error) throw error;
        toast.success(`Cargo ${campos.nome} criado. Defina o que ele pode em Permissões > Por cargo.`);
      }
      setAberto(false);
      await recarregar();
      setVersao(v => v + 1);
    } catch (e) {
      toast.error('Não foi possível salvar. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" /> Cargos
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Os cargos valem para todas as empresas. Aqui ficam as regras de negócio de cada um;
              o que cada cargo enxerga fica em Permissões, por empresa.
            </p>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={abrirNovo} className="gap-1.5 shrink-0">
              <Plus className="w-4 h-4" /> Novo cargo
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {ordenados.map(c => (
            <div
              key={c.slug}
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center',
                !c.ativo && 'opacity-60',
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium',
                  PERFIL_COLORS[c.slug] ?? 'bg-muted/10 text-muted-foreground border-border',
                )}>
                  {c.nome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {pessoas[c.slug] ?? 0} pessoa(s)
                  {c.nivel !== null && <> · nível {c.nivel}</>}
                </span>
                {!c.ativo && <Badge variant="outline" className="text-[10px]">Desativado</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!c.pertence_a_setor && <Badge variant="secondary" className="text-[10px]">Sem setor</Badge>}
                {c.exige_tipo_setor === 'nucleo' && <Badge variant="secondary" className="text-[10px]">Só no Núcleo</Badge>}
                {c.conta_no_recebimento && <Badge variant="secondary" className="text-[10px]">Conta no recebimento</Badge>}
                {c.lidera_equipe && <Badge variant="secondary" className="text-[10px]">Lidera equipe</Badge>}
                {c.acesso_total && <Badge variant="secondary" className="text-[10px]">Acesso total</Badge>}
                {podeEditar && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => abrirEdicao(c)}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!podeEditar && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5" /> Só o Super Admin cria e edita cargos.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={o => { if (!o) setAberto(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${editando.nome}` : 'Novo cargo'}</DialogTitle>
            <DialogDescription className="text-xs">
              {editando
                ? 'O nome muda em todo o app. O identificador interno continua o mesmo.'
                : 'O cargo novo nasce sem permissões. Depois de criar, defina o que ele vê em Permissões > Por cargo.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                {!editando && form.nome.trim() && (
                  <p className={cn('text-[11px]', slugRepetido ? 'text-destructive' : 'text-muted-foreground')}>
                    {slugRepetido ? 'Já existe um cargo com esse nome.' : `Identificador: ${slugNovo}`}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nível</Label>
                <Input
                  inputMode="numeric" value={form.nivel} placeholder="—"
                  onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))}
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Nível é a posição na hierarquia: quanto maior, mais alto (Operador 1, Super Admin 7).
            </p>

            <div className="space-y-2">
              {REGRAS.map(r => {
                const motivo = travada(r.chave);
                return (
                  <div key={r.chave} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.titulo}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{motivo ?? r.explica}</p>
                    </div>
                    <Switch
                      checked={form[r.chave]}
                      disabled={!!motivo}
                      onCheckedChange={v => setForm(f => ({ ...f, [r.chave]: v }))}
                    />
                  </div>
                );
              })}
              <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Ativo</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {ehSuperAdmin
                      ? 'O Super Admin não muda.'
                      : 'Desativado, o cargo some da escolha no cadastro de usuário. Quem já está nele continua.'}
                  </p>
                </div>
                <Switch
                  checked={form.ativo} disabled={ehSuperAdmin}
                  onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
                />
              </div>
            </div>

            {editando?.exige_tipo_setor === 'nucleo' && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Este cargo só existe no setor Núcleo, e o Núcleo só aceita este cargo.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={!podeSalvar || salvando} className="gap-1.5">
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              {editando ? 'Salvar' : 'Criar cargo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
