/**
 * Montar o sorteio ao vivo de um setor (26/11/2026), só super_admin: quem
 * assiste (o setor, o gestão inteiro ou pessoa a pessoa — qualquer empresa,
 * qualquer regra) e quem mais concorre além dos que têm cupom.
 *
 * Abrir põe o palco na tela de toda a plateia, em «aguardando». A contagem só
 * começa quando o super_admin aperta «Começar a contagem» no palco.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Radio, Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SeletorPessoas } from '@/components/Corrida/admin/SeletorPessoas';
import { lerPessoasDoCadastro } from '@/components/Corrida/admin/pessoas';
import { previaDoSorteio, type SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import { abrirSorteio, mensagemDoErro } from '@/components/DesafioVale/aoVivo/banco';
import { destravarAudio } from '@/components/Corrida/nome';

type Modo = 'setor' | 'todos' | 'escolher';
const NINGUEM: never[] = [];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function MontarSorteioAoVivo({ s, jaSorteado, aberto, onFechar }: {
  s: SetorNoVale; jaSorteado: boolean; aberto: boolean; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const pessoas = useQuery({ queryKey: ['sorteio-vale-pessoas'], queryFn: lerPessoasDoCadastro, enabled: aberto, staleTime: 5 * 60_000 });
  const previa = useQuery({ queryKey: ['sorteio-vale-previa', s.setor_id], queryFn: () => previaDoSorteio(s.setor_id), enabled: aberto });
  const [modo, setModo] = useState<Modo>('setor');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [refazer, setRefazer] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const todas = pessoas.data ?? NINGUEM;
  const doSetor = useMemo(() => todas.filter(p => p.setorId === s.setor_id), [todas, s.setor_id]);
  const plateia = modo === 'setor' ? doSetor.map(p => p.id) : modo === 'todos' ? todas.map(p => p.id) : [...marcados];

  const concorrentes = previa.data ?? NINGUEM;
  const jaConcorre = useMemo(() => new Set(concorrentes.map(c => c.perfil_id)), [concorrentes]);
  const achados = useMemo(() => {
    const b = semAcento(busca.trim());
    if (b.length < 2) return [];
    return todas.filter(p => !jaConcorre.has(p.id) && !extras.has(p.id) && semAcento(p.nome).includes(b)).slice(0, 8);
  }, [busca, todas, jaConcorre, extras]);
  const nomeDe = useMemo(() => new Map(todas.map(p => [p.id, p])), [todas]);

  function escolherModo(m: Modo) {
    setModo(m);
    // «Escolher» começa com o setor marcado: é só somar ou tirar.
    if (m === 'escolher' && marcados.size === 0) setMarcados(new Set(doSetor.map(p => p.id)));
  }

  async function abrir() {
    destravarAudio(); // dentro do clique: o som do palco fica liberado
    setOcupado(true);
    try {
      await abrirSorteio({ setorId: s.setor_id, plateia, extras: [...extras], refazer: jaSorteado && refazer });
      toast.success(`Sorteio do ${s.nome} no ar para ${plateia.length} pessoa${plateia.length === 1 ? '' : 's'}. Aperte «Começar a contagem» quando quiser.`);
      void qc.invalidateQueries({ queryKey: ['desafio-vale-detalhe'] });
      onFechar();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const opcao = (m: Modo, titulo: string, n: number | null) => (
    <button type="button" onClick={() => escolherModo(m)} aria-pressed={modo === m}
      className={cn('rounded-lg border px-3 py-2 text-left text-sm transition-colors', modo === m ? 'border-orange-500 bg-orange-500/10' : 'border-border hover:border-orange-400/60')}>
      <span className="block font-medium">{titulo}</span>
      {n !== null && <span className="text-xs text-muted-foreground">{n} pessoa{n === 1 ? '' : 's'}</span>}
    </button>
  );

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-red-500" aria-hidden /> Sorteio ao vivo · {s.nome}</DialogTitle>
          <DialogDescription>
            {s.sorteio_qtd ?? 0} ganhador{(s.sorteio_qtd ?? 0) === 1 ? '' : 'es'}. Abrir põe a tela do sorteio para quem assiste; a contagem de 5 s só começa quando você apertar. O ganhador só é sorteado no fim da contagem — ninguém sabe antes, nem você.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Quem assiste</h3>
          {pessoas.isLoading ? <p className="text-sm text-muted-foreground">Carregando as pessoas…</p>
            : pessoas.isError ? <p className="text-sm text-destructive">Não carregou: {(pessoas.error as Error).message}</p>
              : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {opcao('setor', `Só o ${s.nome}`, doSetor.length)}
                    {opcao('todos', 'O gestão inteiro', todas.length)}
                    {opcao('escolher', 'Escolher (setor, equipe, pessoa)', modo === 'escolher' ? marcados.size : null)}
                  </div>
                  {modo === 'escolher' && (
                    <SeletorPessoas pessoas={todas} marcados={marcados} onChange={setMarcados} rotulo={n => (n === 1 ? 'pessoa assistindo' : 'pessoas assistindo')} />
                  )}
                  <p className="text-xs text-muted-foreground">Você sempre assiste (com os botões de controle).</p>
                </>
              )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Quem concorre</h3>
          {previa.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
            <div className="flex flex-wrap gap-1.5">
              {concorrentes.map(c => (
                <span key={c.perfil_id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{c.nome} · {c.cupons} cupom{c.cupons === 1 ? '' : 's'}</span>
              ))}
              {[...extras].map(id => (
                <button key={id} type="button" onClick={() => { const n = new Set(extras); n.delete(id); setExtras(n); }} title="Tirar"
                  className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs text-orange-700 hover:bg-destructive/15 dark:text-orange-300">
                  {nomeDe.get(id)?.nome ?? 'Pessoa'} · adicionada <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
              {concorrentes.length + extras.size === 0 && <span className="text-sm text-muted-foreground">Ninguém com cupom ainda.</span>}
            </div>
          )}
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Adicionar alguém para concorrer (1 chance)" className="h-8 pl-7 text-xs" aria-label="Buscar pessoa para concorrer" />
          </div>
          {achados.length > 0 && (
            <ul className="max-w-sm divide-y rounded-md border text-sm">
              {achados.map(p => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
                    onClick={() => { setExtras(new Set(extras).add(p.id)); setBusca(''); }}>
                    <UserPlus className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{p.setor}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {jaSorteado && (
          <label className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <input type="checkbox" checked={refazer} onChange={e => setRefazer(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Este setor já foi sorteado. Sortear de novo: os ganhadores de agora são trocados pelos novos quando a contagem acabar.</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button className="bg-orange-500 text-white hover:bg-orange-600" onClick={abrir}
            disabled={ocupado || !pessoas.data || plateia.length === 0 || (jaSorteado && !refazer) || (s.sorteio_qtd ?? 0) <= 0}>
            <Radio className="mr-1.5 h-4 w-4" aria-hidden /> Abrir para {plateia.length} pessoa{plateia.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
