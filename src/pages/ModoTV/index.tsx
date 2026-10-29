/**
 * Modo TV 2 — a montagem (`/modo-tv`). 27/10/2026.
 *
 * Três passos, e só: criar o painel (de um setor ou de uma equipe), escolher
 * as telas prontas na vitrine, conectar a TV pelo código que ela mostra. O
 * resto — números, rodízio, reconexão — a TV faz sozinha.
 *
 * Quem enxerga cada painel é a RLS (`fn_tv_alvo_no_meu_alcance`): liderança
 * no próprio setor e nas equipes que lidera; cúpula, a empresa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Monitor, Plus, Tv } from 'lucide-react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AlvoTv, ConexaoTv, Painel } from './tipos';
import { criarPainel, listarAlvos, listarConexoes, listarPaineis, semMigration } from './servico';
import { Editor } from './Editor';
import { chaveAlvo, estadoDaTv, rotuloAlvo, tvLigada } from './apoio';

export default function ModoTV() {
  const { empresa } = useEmpresa();
  const [paineis, setPaineis] = useState<Painel[]>([]);
  const [alvos, setAlvos] = useState<AlvoTv[]>([]);
  const [conexoes, setConexoes] = useState<ConexaoTv[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [faltaMigration, setFaltaMigration] = useState(false);
  const [criando, setCriando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!empresa?.id) return;
    try {
      const [ps, as] = await Promise.all([listarPaineis(empresa.id), listarAlvos(empresa.id)]);
      setPaineis(ps);
      setAlvos(as);
      setSelecionado(s => (s && ps.some(p => p.id === s)) ? s : (ps[0]?.id ?? null));
      setConexoes(await listarConexoes(ps.map(p => p.id)));
      setFaltaMigration(false);
    } catch (e) {
      if (semMigration(e)) setFaltaMigration(true);
      else toast.error(e instanceof Error ? e.message : 'Erro ao carregar o Modo TV.');
    } finally {
      setCarregando(false);
    }
  }, [empresa?.id]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  // O estado das TVs anda sozinho: relê as conexões a cada 5 s com a tela à
  // vista. É uma consulta pequena (uma linha por TV), e é ela que faz o
  // «Publicar» virar «a TV já está mostrando» sem ninguém recarregar nada.
  const atualizarConexoes = useCallback(() => {
    if (!paineis.length) return;
    listarConexoes(paineis.map(p => p.id)).then(setConexoes, () => {});
  }, [paineis]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') atualizarConexoes();
    }, 5_000);
    return () => clearInterval(t);
  }, [atualizarConexoes]);

  // Cada setor com os seus painéis, e as equipes dentro do setor: nada misturado.
  const grupos = useMemo(() => {
    const nomeSetor = new Map(alvos.map(a => [a.setor_id, a.setor_nome]));
    const porSetor = new Map<string, Painel[]>();
    for (const p of paineis) {
      const k = p.setor_id ?? '';
      porSetor.set(k, [...(porSetor.get(k) ?? []), p]);
    }
    return [...porSetor.entries()]
      .map(([setorId, ps]) => ({ setorId, nome: nomeSetor.get(setorId) ?? 'Setor', paineis: ps }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [paineis, alvos]);

  const alvoPorChave = useMemo(() => new Map(alvos.map(a => [chaveAlvo(a), a])), [alvos]);
  const painel = paineis.find(p => p.id === selecionado) ?? null;
  const alvoDoPainel = painel ? alvoPorChave.get(chaveAlvo({ setor_id: painel.setor_id!, equipe_id: painel.equipe_id ?? null })) ?? null : null;

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-6 w-6" /> Modo TV</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha as telas prontas, conecte a TV pelo código, e ela roda sozinha com os números do relatório.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="#/tv?demo=1" target="_blank" rel="noreferrer"><Monitor className="h-4 w-4 mr-2" />Ver demonstração</a>
            </Button>
            {!faltaMigration && (
              <Button onClick={() => setCriando(true)} disabled={!alvos.length}>
                <Plus className="h-4 w-4 mr-2" />Novo painel
              </Button>
            )}
          </div>
        </div>

        {faltaMigration && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
            <p className="font-semibold">O Modo TV ainda não está no banco.</p>
            <p className="text-muted-foreground mt-1">
              Falta aplicar a migration <code>20261027170000_modo_tv_2.sql</code>. Enquanto isso, a
              demonstração mostra todos os templates com números de exemplo.
            </p>
          </div>
        )}

        {!faltaMigration && !carregando && !paineis.length && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Tv className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-semibold mt-3">Nenhum painel ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              {alvos.length
                ? 'Crie o primeiro painel do seu setor ou da sua equipe.'
                : 'Seu cargo não monta painel de TV. Fale com a liderança do setor.'}
            </p>
            {alvos.length > 0 && (
              <Button className="mt-4" onClick={() => setCriando(true)}><Plus className="h-4 w-4 mr-2" />Novo painel</Button>
            )}
          </div>
        )}

        {paineis.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <nav className="space-y-5">
              {grupos.map(g => (
              <div key={g.setorId} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.nome}</div>
              {g.paineis.map(p => {
                const tvs = conexoes.filter(c => c.painel_id === p.id);
                const online = tvs.filter(c => tvLigada(estadoDaTv(c, p.atualizado_em))).length;
                const alvo = alvoPorChave.get(chaveAlvo({ setor_id: p.setor_id!, equipe_id: p.equipe_id ?? null }));
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelecionado(p.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${p.id === selecionado ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                  >
                    <div className="font-semibold truncate">{p.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{alvo?.equipe_id ? `Equipe ${alvo.equipe_nome}` : 'Setor inteiro'}</div>
                    <div className="text-xs mt-1.5 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      {tvs.length ? `${online} de ${tvs.length} TV${tvs.length > 1 ? 's' : ''} ligada${tvs.length > 1 ? 's' : ''}` : 'Sem TV conectada'}
                      <span className="text-muted-foreground">· {p.telas.length} tela{p.telas.length === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                );
              })}
              </div>
              ))}
            </nav>

            {painel && (
              <Editor
                key={painel.id}
                painel={painel}
                alvo={alvoDoPainel}
                conexoes={conexoes.filter(c => c.painel_id === painel.id)}
                aoMudar={recarregar}
                aoMudarConexoes={atualizarConexoes}
              />
            )}
          </div>
        )}
      </div>

      <DialogNovoPainel
        aberto={criando}
        alvos={alvos}
        empresaId={empresa?.id ?? null}
        aoFechar={() => setCriando(false)}
        aoCriar={async (id) => { setCriando(false); await recarregar(); setSelecionado(id); }}
      />
    </div>
  );
}

function DialogNovoPainel({ aberto, alvos, empresaId, aoFechar, aoCriar }: {
  aberto: boolean; alvos: AlvoTv[]; empresaId: string | null;
  aoFechar: () => void; aoCriar: (id: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [alvo, setAlvo] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setNome('TV do setor'); setAlvo(alvos[0] ? chaveAlvo(alvos[0]) : ''); }
  }, [aberto, alvos]);

  const criar = async () => {
    const a = alvos.find(x => chaveAlvo(x) === alvo);
    if (!a || !empresaId || !nome.trim()) return;
    setSalvando(true);
    try {
      const p = await criarPainel({ nome: nome.trim(), setor_id: a.setor_id, equipe_id: a.equipe_id, empresa_id: empresaId });
      toast.success('Painel criado. Agora escolha as telas.');
      aoCriar(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para criar o painel.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo painel de TV</DialogTitle>
          <DialogDescription>De quem são os números que a TV vai mostrar?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Números de</Label>
            <Select value={alvo} onValueChange={setAlvo}>
              <SelectTrigger><SelectValue placeholder="Escolha o setor ou a equipe" /></SelectTrigger>
              <SelectContent>
                {alvos.map(a => <SelectItem key={chaveAlvo(a)} value={chaveAlvo(a)}>{rotuloAlvo(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nome do painel</Label>
            <Input value={nome} maxLength={60} onChange={e => setNome(e.target.value)} placeholder="Ex.: TV da entrada" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando || !alvo || !nome.trim()}>Criar painel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
