/**
 * src/pages/AdminDiretoExtra.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Aba "Direto e Extra" em Configurações.
 *
 * Permite ativar a lógica "Direto e Extra" em três escopos:
 *   • Setor   — vale para todos os operadores do setor
 *   • Equipe  — vale para todos os operadores da equipe
 *   • Usuário — vale apenas para um operador individual
 *
 * A resolução final é feita em useDiretoExtraConfig usando a ordem
 * usuário → equipe → setor (ver direto_extra.service.ts).
 *
 * Apenas empresas PaguePlay/Bookplay utilizam a lógica, mas a aba é
 * exibida para todas as empresas, pois a tabela é isolada por empresa_id
 * e o service simplesmente retorna vazio nas empresas onde não é usada.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, Building2, Briefcase, Loader2, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { setDiretoExtraConfig } from '@/services/direto_extra.service';

// ─── Tipos locais ───────────────────────────────────────────────────────────
interface SetorItem   { id: string; nome: string; }
interface EquipeItem  { id: string; nome: string; setor_id: string | null; }
interface UsuarioItem {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  setor_id: string | null;
  equipe_id: string | null;
}

export default function AdminDiretoExtra() {
  const { empresa } = useEmpresa();
  const empresaId   = empresa?.id ?? '';

  const { configs, loading: loadingConfigs, refetch } = useDiretoExtraConfig();

  const [setores,    setSetores]    = useState<SetorItem[]>([]);
  const [equipes,    setEquipes]    = useState<EquipeItem[]>([]);
  const [usuarios,   setUsuarios]   = useState<UsuarioItem[]>([]);
  const [loading,    setLoading]    = useState(true);

  // busca por usuário
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [buscaEquipe,  setBuscaEquipe]  = useState('');
  const [buscaSetor,   setBuscaSetor]   = useState('');

  // estado "salvando" por (escopo|id) para bloquear o switch durante a chamada
  const [salvando, setSalvando] = useState<string | null>(null);

  // ── Carrega setores / equipes / usuários da empresa atual ─────────────────
  useEffect(() => {
    if (!empresaId) { setLoading(false); return; }
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const [setoresRes, equipesRes, usuariosRes] = await Promise.all([
          supabase.from('setores')
            .select('id, nome')
            .eq('empresa_id', empresaId)
            .eq('ativo', true)
            .order('nome'),
          supabase.from('equipes')
            .select('id, nome, setor_id')
            .eq('empresa_id', empresaId)
            .order('nome'),
          supabase.from('perfis')
            .select('id, nome, email, perfil, setor_id, equipe_id')
            .eq('empresa_id', empresaId)
            .eq('ativo', true)
            .in('perfil', ['operador', 'lider', 'elite'])
            .order('nome'),
        ]);

        if (cancelado) return;
        if (setoresRes.error)   { console.warn(setoresRes.error);   toast.error('Erro ao carregar setores'); }
        if (equipesRes.error)   { console.warn(equipesRes.error);   toast.error('Erro ao carregar equipes'); }
        if (usuariosRes.error)  { console.warn(usuariosRes.error);  toast.error('Erro ao carregar usuários'); }

        setSetores ((setoresRes.data  as SetorItem[])   ?? []);
        setEquipes ((equipesRes.data  as EquipeItem[])  ?? []);
        setUsuarios((usuariosRes.data as UsuarioItem[]) ?? []);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [empresaId]);

  // ── Mapas de lookup para exibição (nome do setor/equipe por ID) ──────────
  const setorPorId  = useMemo(() => new Map(setores.map(s => [s.id, s.nome])),  [setores]);
  const equipePorId = useMemo(() => new Map(equipes.map(e => [e.id, e.nome])),  [equipes]);

  // ── Index das configs por (escopo, referencia_id) ─────────────────────────
  const configIndex = useMemo(() => {
    const idx = new Map<string, boolean>();
    configs.forEach(c => idx.set(`${c.escopo}:${c.referencia_id}`, c.ativo));
    return idx;
  }, [configs]);

  const isAtivo = (escopo: 'setor' | 'equipe' | 'usuario', id: string): boolean =>
    configIndex.get(`${escopo}:${id}`) ?? false;

  // ── Toggle genérico ───────────────────────────────────────────────────────
  async function toggle(escopo: 'setor' | 'equipe' | 'usuario', id: string, novoValor: boolean) {
    if (!empresaId) return;
    const key = `${escopo}:${id}`;
    setSalvando(key);
    const res = await setDiretoExtraConfig({
      empresaId,
      escopo,
      referenciaId: id,
      ativo: novoValor,
    });
    if (!res.ok) {
      toast.error(`Erro ao salvar: ${res.error ?? 'desconhecido'}`);
    } else {
      toast.success(
        `${escopo === 'setor' ? 'Setor' : escopo === 'equipe' ? 'Equipe' : 'Usuário'} ${novoValor ? 'ativado' : 'desativado'}`,
        { duration: 2000 },
      );
      await refetch();
    }
    setSalvando(null);
  }

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const setoresFiltrados = useMemo(() => {
    const q = buscaSetor.trim().toLowerCase();
    return q ? setores.filter(s => s.nome.toLowerCase().includes(q)) : setores;
  }, [setores, buscaSetor]);

  const equipesFiltradas = useMemo(() => {
    const q = buscaEquipe.trim().toLowerCase();
    return q
      ? equipes.filter(e => {
          const nomeSetor = e.setor_id ? (setorPorId.get(e.setor_id) ?? '') : '';
          return e.nome.toLowerCase().includes(q) || nomeSetor.toLowerCase().includes(q);
        })
      : equipes;
  }, [equipes, buscaEquipe, setorPorId]);

  const usuariosFiltrados = useMemo(() => {
    const q = buscaUsuario.trim().toLowerCase();
    return q
      ? usuarios.filter(u =>
          u.nome.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.perfil.toLowerCase().includes(q),
        )
      : usuarios;
  }, [usuarios, buscaUsuario]);

  // ── Totais ativos por escopo (para badge no header de cada aba) ───────────
  const totais = useMemo(() => ({
    setor:   configs.filter(c => c.escopo === 'setor'   && c.ativo).length,
    equipe:  configs.filter(c => c.escopo === 'equipe'  && c.ativo).length,
    usuario: configs.filter(c => c.escopo === 'usuario' && c.ativo).length,
  }), [configs]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
          <ArrowLeftRight className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Direto e Extra</h2>
          <p className="text-sm text-muted-foreground">
            Ative a lógica <strong>Direto e Extra</strong> por setor, equipe ou usuário.
            Operadores com a lógica ativa podem tabular acordos de NR/inscrição já vinculados
            a outro operador — o novo acordo entra como <strong>Extra</strong>.
          </p>
        </div>
      </div>

      {/* Conteúdo */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração de ativação</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="setor" className="w-full">
            <TabsList className="grid grid-cols-3 mb-4 w-full max-w-lg">
              <TabsTrigger value="setor" className="gap-2 text-xs">
                <Building2 className="w-3.5 h-3.5" />
                Setores
                {totais.setor > 0 && (
                  <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-primary/15 text-primary border border-primary/30">
                    {totais.setor}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipe" className="gap-2 text-xs">
                <Briefcase className="w-3.5 h-3.5" />
                Equipes
                {totais.equipe > 0 && (
                  <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-primary/15 text-primary border border-primary/30">
                    {totais.equipe}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="usuario" className="gap-2 text-xs">
                <Users className="w-3.5 h-3.5" />
                Usuários
                {totais.usuario > 0 && (
                  <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-primary/15 text-primary border border-primary/30">
                    {totais.usuario}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* SETORES */}
            <TabsContent value="setor" className="mt-0 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar setor..."
                  className="pl-9 h-9"
                  value={buscaSetor}
                  onChange={(e) => setBuscaSetor(e.target.value)}
                />
              </div>
              <ListaToggle
                emptyMsg={loading || loadingConfigs ? 'Carregando...' : 'Nenhum setor encontrado.'}
                loading={loading || loadingConfigs}
                items={setoresFiltrados.map(s => ({
                  id: s.id,
                  titulo: s.nome,
                  ativo: isAtivo('setor', s.id),
                  salvando: salvando === `setor:${s.id}`,
                }))}
                onToggle={(id, novo) => toggle('setor', id, novo)}
              />
            </TabsContent>

            {/* EQUIPES */}
            <TabsContent value="equipe" className="mt-0 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar equipe ou setor..."
                  className="pl-9 h-9"
                  value={buscaEquipe}
                  onChange={(e) => setBuscaEquipe(e.target.value)}
                />
              </div>
              <ListaToggle
                emptyMsg={loading || loadingConfigs ? 'Carregando...' : 'Nenhuma equipe encontrada.'}
                loading={loading || loadingConfigs}
                items={equipesFiltradas.map(e => ({
                  id: e.id,
                  titulo: e.nome,
                  subtitulo: e.setor_id ? `Setor: ${setorPorId.get(e.setor_id) ?? '—'}` : 'Sem setor',
                  ativo: isAtivo('equipe', e.id),
                  salvando: salvando === `equipe:${e.id}`,
                }))}
                onToggle={(id, novo) => toggle('equipe', id, novo)}
              />
            </TabsContent>

            {/* USUÁRIOS */}
            <TabsContent value="usuario" className="mt-0 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por nome, e-mail ou perfil..."
                  className="pl-9 h-9"
                  value={buscaUsuario}
                  onChange={(e) => setBuscaUsuario(e.target.value)}
                />
              </div>
              <ListaToggle
                emptyMsg={loading || loadingConfigs ? 'Carregando...' : 'Nenhum usuário encontrado.'}
                loading={loading || loadingConfigs}
                items={usuariosFiltrados.map(u => {
                  const partesMeta: string[] = [];
                  partesMeta.push(u.email);
                  if (u.setor_id)  partesMeta.push(`Setor: ${setorPorId.get(u.setor_id) ?? '—'}`);
                  if (u.equipe_id) partesMeta.push(`Equipe: ${equipePorId.get(u.equipe_id) ?? '—'}`);
                  return {
                    id: u.id,
                    titulo: u.nome,
                    subtitulo: partesMeta.join(' · '),
                    etiqueta: u.perfil,
                    ativo: isAtivo('usuario', u.id),
                    salvando: salvando === `usuario:${u.id}`,
                  };
                })}
                onToggle={(id, novo) => toggle('usuario', id, novo)}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Componente interno: lista com toggle ────────────────────────────────────
interface ListaToggleItem {
  id: string;
  titulo: string;
  subtitulo?: string;
  etiqueta?: string;
  ativo: boolean;
  salvando: boolean;
}

function ListaToggle({
  items, onToggle, emptyMsg, loading,
}: {
  items: ListaToggleItem[];
  onToggle: (id: string, novoValor: boolean) => void;
  emptyMsg: string;
  loading: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8 border border-dashed border-border/60 rounded-lg">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : emptyMsg}
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/60 border border-border/60 rounded-lg overflow-hidden">
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{item.titulo}</p>
              {item.etiqueta && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal capitalize">
                  {item.etiqueta}
                </Badge>
              )}
              {item.ativo && (
                <Badge className="h-4 px-1.5 text-[10px] bg-success/15 text-success border border-success/30">
                  Ativo
                </Badge>
              )}
            </div>
            {item.subtitulo && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitulo}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.salvando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <Switch
              checked={item.ativo}
              disabled={item.salvando}
              onCheckedChange={(v) => onToggle(item.id, v)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
