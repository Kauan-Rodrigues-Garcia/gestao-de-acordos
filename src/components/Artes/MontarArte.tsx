/**
 * MontarArte — montar e lançar uma arte para todos (17/11/2026, super_admin).
 *
 *   1. o modelo (Deu a louca na gerente, Parabéns, Recado, Imagem própria);
 *   2. o texto — cada modelo já vem preenchido;
 *   3. as cores;
 *   4. para quem: todo mundo ou os setores marcados;
 *   5. quando: começa agora ou numa hora marcada; termina no fim de hoje, numa
 *      hora marcada ou só quando encerrar.
 *
 * Ao lado, a prévia do jeito que vai abrir na tela das pessoas.
 */
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ImagePlus, Loader2, Megaphone } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { copiarImagemDoElemento } from '@/lib/copiarImagem';
import type { GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import { ArteCard, ArteEscalada } from './ArteCard';
import { enviarImagem, mensagemDoErro, type DadosParaLancar } from './banco';
import {
  MODELOS, TEMAS, camposFaltando, fimDeHojeLocal, limparConteudo, modeloPorId, paraDatetimeLocal,
  type ConteudoDaArte, type ModeloDeArte, type TemaDaArte,
} from './modelos';

type Quando = 'agora' | 'marcado';
type Termino = 'hoje' | 'marcado' | 'nunca';

interface Props {
  dados: { pessoas: Participante[]; grupos: GrupoDaVotacao[] };
  onLancar: (d: DadosParaLancar) => Promise<unknown>;
  onLancada?: () => void;
  /** Laboratório: no lugar do envio para o storage. */
  enviar?: (f: File) => Promise<string>;
}

const passo = 'space-y-2.5';
const tituloDoPasso = 'flex items-center gap-2 text-sm font-semibold';
const numero = 'grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary';

export function MontarArte({ dados, onLancar, onLancada, enviar = enviarImagem }: Props) {
  const [modelo, setModelo] = useState<ModeloDeArte>('deu-a-louca');
  // Um rascunho por modelo: trocar de modelo e voltar não perde o que foi escrito.
  const [rascunhos, setRascunhos] = useState<Record<string, ConteudoDaArte>>(() => Object.fromEntries(MODELOS.map(m => [m.id, { ...m.padrao }])));
  const [temas, setTemas] = useState<Record<string, TemaDaArte>>(() => Object.fromEntries(MODELOS.map(m => [m.id, m.temaPadrao])));
  const [todos, setTodos] = useState(true);
  const [setores, setSetores] = useState<Set<string>>(new Set());
  const [quando, setQuando] = useState<Quando>('agora');
  const [inicio, setInicio] = useState(() => paraDatetimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [termino, setTermino] = useState<Termino>('hoje');
  const [fim, setFim] = useState(fimDeHojeLocal);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const foto = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const def = modeloPorId(modelo) ?? MODELOS[0];
  const conteudo = rascunhos[modelo];
  const tema = temas[modelo];
  const mudar = (campo: string, valor: string) => setRascunhos(r => ({ ...r, [modelo]: { ...r[modelo], [campo]: valor } }));

  const porSetor = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of dados.pessoas) if (p.setorId) m.set(p.setorId, (m.get(p.setorId) ?? 0) + 1);
    return m;
  }, [dados.pessoas]);
  const quantos = todos ? dados.pessoas.length : [...setores].reduce((s, id) => s + (porSetor.get(id) ?? 0), 0);

  const faltam = camposFaltando(def, conteudo);
  // `blob:` só no laboratório (envio de mentira); no app a imagem é https do storage.
  const aceitaBlob = enviar !== enviarImagem;
  const imagemRuim = modelo === 'imagem' && !/^https:\/\//i.test(conteudo.imagem ?? '') && !(aceitaBlob && (conteudo.imagem ?? '').startsWith('blob:'));
  const inicioIso = quando === 'marcado' ? new Date(inicio).toISOString() : null;
  const fimIso = termino === 'nunca' ? null : new Date(termino === 'hoje' ? fimDeHojeLocal() : fim).toISOString();
  const periodoRuim = !!fimIso && new Date(fimIso) <= new Date(inicioIso ?? Date.now());
  const problema = faltam.length ? `Falta preencher: ${faltam.join(', ')}.`
    : imagemRuim ? 'Envie a imagem (ou cole um link https).'
    : !todos && setores.size === 0 ? 'Marque pelo menos um setor.'
    : periodoRuim ? 'O fim precisa ser depois do início.'
    : null;

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    setEnviando(true);
    try {
      mudar('imagem', await enviar(f));
      toast.success('Imagem enviada.');
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  async function copiar() {
    if (!foto.current) return;
    setCopiando(true);
    try {
      const r = await copiarImagemDoElemento(foto.current, `${def.id}.png`, TEMAS[tema].fundo);
      toast.success(r === 'copiado' ? 'Imagem copiada. É só colar no WhatsApp.' : 'Imagem baixada.');
    } catch {
      toast.error('Não deu para gerar a imagem.');
    } finally {
      setCopiando(false);
    }
  }

  async function lancar() {
    setLancando(true);
    try {
      const limpo = limparConteudo(def, conteudo);
      await onLancar({
        titulo: def.tituloDe(limpo).slice(0, 120), modelo, conteudo: limpo, tema,
        setores: todos ? null : [...setores], inicio: inicioIso, fim: fimIso,
      });
      toast.success(quando === 'agora' ? 'Arte lançada! Já vai abrir na tela de todo mundo.' : 'Arte agendada.');
      setConfirmar(false);
      onLancada?.();
    } catch (e) {
      toast.error(`Não lançou: ${mensagemDoErro(e)}`);
    } finally {
      setLancando(false);
    }
  }

  const campo = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const opcao = (ativo: boolean) => cn('rounded-lg border px-3 py-2 text-left text-sm transition-colors', ativo ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className={passo}>
          <h4 className={tituloDoPasso}><span className={numero}>1</span> Modelo</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODELOS.map(m => (
              <button key={m.id} type="button" aria-pressed={m.id === modelo} onClick={() => setModelo(m.id)} className={opcao(m.id === modelo)}>
                <span className="flex items-center gap-2 font-medium"><span aria-hidden>{m.emoji}</span>{m.nome}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{m.descricao}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={passo}>
          <h4 className={tituloDoPasso}><span className={numero}>2</span> Texto</h4>
          {modelo === 'imagem' && (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={e => { void escolherArquivo(e.target.files?.[0]); }} />
              <Button type="button" variant="outline" size="sm" onClick={() => arquivo.current?.click()} disabled={enviando}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Enviar imagem
              </Button>
              <span className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF, até 8 MB. Ou cole o link abaixo.</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {def.campos.map(f => (
              <label key={f.id} className={cn('text-sm', (f.longo || f.id === 'imagem') && 'sm:col-span-2')}>
                <span className="flex justify-between gap-2">
                  <span>{f.id === 'imagem' ? 'Link da imagem' : f.rotulo}{f.opcional && <span className="text-muted-foreground"> (opcional)</span>}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{(conteudo[f.id] ?? '').length}/{f.max}</span>
                </span>
                {f.longo
                  ? <textarea className={cn(campo, 'h-20 py-2')} value={conteudo[f.id] ?? ''} maxLength={f.max} placeholder={f.dica} onChange={e => mudar(f.id, e.target.value)} />
                  : <Input className="mt-1 h-9" value={conteudo[f.id] ?? ''} maxLength={f.max} placeholder={f.dica ?? (f.id === 'imagem' ? 'https://…' : undefined)} onChange={e => mudar(f.id, e.target.value)} />}
              </label>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRascunhos(r => ({ ...r, [modelo]: { ...def.padrao } }))}>
            Voltar ao texto do modelo
          </Button>
        </section>

        <section className={passo}>
          <h4 className={tituloDoPasso}><span className={numero}>3</span> Cores</h4>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cores da arte">
            {(Object.keys(TEMAS) as TemaDaArte[]).map(id => (
              <button key={id} type="button" role="radio" aria-checked={id === tema} onClick={() => setTemas(t => ({ ...t, [modelo]: id }))}
                className={cn('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm', id === tema ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                <span aria-hidden className="h-6 w-6 rounded-full border" style={{ background: `linear-gradient(135deg, ${TEMAS[id].fundo} 50%, ${TEMAS[id].destaque} 50%)` }} />
                {TEMAS[id].nome}
              </button>
            ))}
          </div>
        </section>

        <section className={passo}>
          <h4 className={tituloDoPasso}><span className={numero}>4</span> Para quem</h4>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={todos} onClick={() => setTodos(true)} className={opcao(todos)}>Todo mundo</button>
            <button type="button" aria-pressed={!todos} onClick={() => setTodos(false)} className={opcao(!todos)}>Setores escolhidos</button>
          </div>
          {!todos && (
            <div className="space-y-3 rounded-lg border p-3">
              {dados.grupos.map(g => (
                <div key={g.chave}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.rotulo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.setores.map(s => {
                      const marcado = setores.has(s.id);
                      return (
                        <button key={s.id} type="button" aria-pressed={marcado}
                          onClick={() => setSetores(atual => { const n = new Set(atual); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                          className={cn('rounded-full border px-2.5 py-1 text-xs', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40')}>
                          {s.nome} <span className="tabular-nums opacity-70">· {porSetor.get(s.id) ?? 0}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Vai abrir na tela de <strong className="text-foreground">{quantos}</strong> {quantos === 1 ? 'pessoa' : 'pessoas'} (cadastro ativo), uma vez para cada.</p>
        </section>

        <section className={passo}>
          <h4 className={tituloDoPasso}><span className={numero}>5</span> Quando</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 text-sm">
              <p>Começa</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={quando === 'agora'} onClick={() => setQuando('agora')} className={opcao(quando === 'agora')}>Agora</button>
                <button type="button" aria-pressed={quando === 'marcado'} onClick={() => setQuando('marcado')} className={opcao(quando === 'marcado')}>Em hora marcada</button>
              </div>
              {quando === 'marcado' && <input type="datetime-local" className={campo} value={inicio} onChange={e => setInicio(e.target.value)} aria-label="Começa em" />}
            </div>
            <div className="space-y-1.5 text-sm">
              <p>Sai do ar</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={termino === 'hoje'} onClick={() => setTermino('hoje')} className={opcao(termino === 'hoje')}>Fim de hoje</button>
                <button type="button" aria-pressed={termino === 'marcado'} onClick={() => setTermino('marcado')} className={opcao(termino === 'marcado')}>Em hora marcada</button>
                <button type="button" aria-pressed={termino === 'nunca'} onClick={() => setTermino('nunca')} className={opcao(termino === 'nunca')}>Só ao encerrar</button>
              </div>
              {termino === 'marcado' && <input type="datetime-local" className={campo} value={fim} onChange={e => setFim(e.target.value)} aria-label="Sai do ar em" />}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Quem entrar enquanto a arte estiver no ar também vê. Fora do ar, ninguém mais vê.</p>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="button" onClick={() => setConfirmar(true)} disabled={!!problema}>
            <Megaphone className="mr-2 h-4 w-4" /> {quando === 'agora' ? 'Lançar para todos' : 'Agendar'}
          </Button>
          {problema && <p className="text-sm text-muted-foreground" role="status">{problema}</p>}
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia</p>
        <div className="mx-auto max-w-[340px] rounded-[22px] bg-black/80 p-3">
          <ArteEscalada modelo={modelo} conteudo={conteudo} tema={tema} />
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { void copiar(); }} disabled={copiando}>
          {copiando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />} Copiar imagem (para o WhatsApp)
        </Button>
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <ArteCard ref={foto} modelo={modelo} conteudo={conteudo} tema={tema} />
        </div>
      </aside>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{quando === 'agora' ? 'Lançar a arte agora?' : 'Agendar a arte?'}</AlertDialogTitle>
            <AlertDialogDescription>
              «{def.tituloDe(conteudo)}» vai abrir sozinha na tela de {todos ? 'todo mundo' : `${setores.size} ${setores.size === 1 ? 'setor' : 'setores'}`} ({quantos} pessoas),
              {quando === 'agora' ? ' a partir de agora' : ` a partir de ${new Date(inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
              {fimIso ? `, até ${new Date(fimIso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ', até você encerrar'}.
              Dá para encerrar antes no painel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lancando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={lancando} onClick={e => { e.preventDefault(); void lancar(); }}>
              {lancando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {quando === 'agora' ? 'Lançar' : 'Agendar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
