/**
 * NovoTicketDialog — abrir um pedido.
 *
 * ## Passos numerados
 *
 * O formulário é lido de cima para baixo, em passos: 1. sobre o que é,
 * 2. o que aconteceu, 3. prints e fotos, 4. prioridade, 5. quem mais precisa
 * saber. Os números dizem a quem abre que o formulário tem fim e em que ponto
 * ele está — e o passo dos prints fica no meio, à vista, porque é o que mais
 * encurta a conversa depois.
 *
 * O formulário muda de forma conforme a categoria: escolher "Trocar senha de
 * usuário" faz aparecer o campo de usuário, "Erro no sistema" faz aparecer a
 * lista de abas. Os campos extras são TODOS opcionais — a definição vive em
 * `categorias.ts`, e a razão de existirem está lá.
 *
 * ## Fotos na abertura
 *
 * Antes, o print só entrava depois, pela conversa. Agora entra aqui: colar
 * (Ctrl+V em qualquer ponto do formulário), arrastar, escolher ou tirar a foto
 * no celular. Os arquivos sobem DEPOIS de o ticket existir — o caminho no balde
 * leva o id dele — e viram a mensagem «do pedido», que a tela mostra dentro do
 * cartão do pedido. Se um arquivo falhar, o ticket já está aberto e a tela diz
 * quantos faltaram, para a pessoa mandar pela conversa.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa } from '@/lib/produto';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  abrirTicket, subirAnexo, enviarMensagem, adicionarParticipantes, listarPessoasParaChamar,
  type AnexoTicket, type PessoaTicket,
} from '@/services/tickets.service';
import { cn } from '@/lib/utils';
import {
  categoriasDoProduto, ABAS_DO_SISTEMA, PRIORIDADES, ORDEM_PRIORIDADE,
  type CampoCategoria, type PrioridadeTicket,
} from './categorias';
import { iconeDaCategoria } from './icones';
import { AreaDeAnexos } from './anexos';
import { arquivosColados, arquivosQueCabem, normalizar } from './arquivos';
import { SeletorDeVariasPessoas } from './pessoas';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Recebe o id do ticket novo: a tela o abre na hora. */
  onCriado: (id: string | null) => void;
}

interface Opcao { id: string; nome: string; foto?: string | null }

export default function NovoTicketDialog({ aberto, onFechar, onCriado }: Props) {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const empresaId = empresa?.id ?? null;

  /*
   * As categorias deste produto.
   *
   * Cobrança e Comercial abrem chamado sobre coisas diferentes: «erro em
   * acordo / tabulação» não quer dizer nada para quem vende, e «divergência no
   * fechamento» não quer dizer nada para quem cobra. Oferecer as duas a todos
   * convida a abrir na categoria errada — trabalho para o atendente e demora
   * para quem abriu.
   */
  const categorias = useMemo(
    () => categoriasDoProduto(produtoDaEmpresa(empresa, tenantSlug)),
    [empresa, tenantSlug],
  );

  const [categoria, setCategoria] = useState('senha');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeTicket>('normal');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [chamados, setChamados] = useState<PessoaTicket[]>([]);
  const [candidatos, setCandidatos] = useState<PessoaTicket[]>([]);
  const [carregandoCandidatos, setCarregandoCandidatos] = useState(false);
  /** «Enviando 2 de 3 fotos…» — subir print de celular leva segundos. */
  const [progresso, setProgresso] = useState<string | null>(null);

  // A lista de quem chamar só é buscada quando o diálogo abre, uma vez.
  useEffect(() => {
    if (!aberto || !empresaId || candidatos.length) return;
    let vivo = true;
    setCarregandoCandidatos(true);
    void listarPessoasParaChamar(empresaId).then(lista => {
      if (!vivo) return;
      setCandidatos(lista.filter(p => p.id !== perfil?.id));
      setCarregandoCandidatos(false);
    });
    return () => { vivo = false; };
  }, [aberto, empresaId, candidatos.length, perfil?.id]);

  const [pessoas, setPessoas] = useState<Opcao[]>([]);
  const [setores, setSetores] = useState<Opcao[]>([]);

  const definicao = useMemo(
    () => categorias.find(c => c.key === categoria),
    [categorias, categoria],
  );

  // Só busca pessoas/setores quando a categoria escolhida pede algum deles —
  // a maioria dos tickets não precisa de nenhuma das duas listas.
  const precisaPessoas = definicao?.campos.some(c => c.tipo === 'usuario') ?? false;
  const precisaSetores = definicao?.campos.some(c => c.tipo === 'setor') ?? false;

  useEffect(() => {
    if (!aberto || !empresaId) return;
    let vivo = true;
    (async () => {
      if (precisaPessoas && !pessoas.length) {
        const { data } = await supabase.from('perfis').select('id, nome, foto_url')
          .eq('empresa_id', empresaId).order('nome');
        if (vivo) setPessoas(((data ?? []) as { id: string; nome: string | null; foto_url: string | null }[])
          .map(p => ({ id: p.id, nome: p.nome ?? '(sem nome)', foto: p.foto_url })));
      }
      if (precisaSetores && !setores.length) {
        const { data } = await supabase.from('setores').select('id, nome')
          .eq('empresa_id', empresaId).eq('ativo', true).order('nome');
        if (vivo) setSetores(((data ?? []) as { id: string; nome: string }[])
          .map(s => ({ id: s.id, nome: s.nome })));
      }
    })();
    return () => { vivo = false; };
  }, [aberto, empresaId, precisaPessoas, precisaSetores, pessoas.length, setores.length]);

  const abasVisiveis = useMemo(
    () => ABAS_DO_SISTEMA.filter(a => !a.permissao || temPermissao(a.permissao)),
    [temPermissao],
  );

  function limpar() {
    setCategoria('senha'); setAssunto(''); setDescricao('');
    setPrioridade('normal'); setCampos({});
    setArquivos([]); setChamados([]); setProgresso(null);
  }

  /** Ctrl+V com print em qualquer ponto do formulário vira anexo. Texto colado segue normal. */
  function colar(e: React.ClipboardEvent) {
    const colados = arquivosColados(e);
    if (!colados.length) return;
    e.preventDefault();
    const bons = arquivosQueCabem(colados, perfil?.perfil);
    if (bons.length) {
      setArquivos(a => [...a, ...bons]);
      toast.success(bons.length > 1 ? `${bons.length} prints anexados.` : 'Print anexado.');
    }
  }

  /**
   * Os anexos do pedido, depois de o ticket existir. Devolve quantos falharam
   * — o ticket já está aberto e não é desfeito por causa de um print.
   */
  async function enviarAnexosDoPedido(ticketId: string): Promise<number> {
    if (!arquivos.length || !empresaId || !perfil?.id) return 0;
    const subidos: AnexoTicket[] = [];
    let falhas = 0;
    for (const [i, f] of arquivos.entries()) {
      setProgresso(`Enviando ${i + 1} de ${arquivos.length} ${arquivos.length > 1 ? 'arquivos' : 'arquivo'}…`);
      try {
        subidos.push(await subirAnexo(f, empresaId, ticketId));
      } catch (e) {
        falhas++;
        console.warn('[tickets] anexo do pedido:', e);
      }
    }
    if (!subidos.length) return falhas;
    const m = await enviarMensagem({
      ticketId,
      autorId: perfil.id,
      autorNome: perfil.nome ?? 'Sem nome',
      autorFoto: (perfil as { foto_url?: string | null }).foto_url ?? null,
      texto: '',
      anexos: subidos,
      doPedido: true,
    });
    return m.erro ? arquivos.length : falhas;
  }

  async function salvar() {
    if (!empresaId || !perfil?.id) return;
    if (!assunto.trim()) { toast.error('Escreva o assunto do ticket (passo 2).'); return; }

    setSalvando(true);
    setProgresso('Abrindo o ticket…');
    try {
      const r = await abrirTicket({
        empresaId,
        // Setor congelado na abertura: o pedido continua sendo do setor de onde
        // saiu, mesmo que a pessoa mude de setor depois.
        setorId: (perfil as { setor_id?: string | null }).setor_id ?? null,
        abertoPor: perfil.id,
        abertoPorNome: perfil.nome ?? 'Sem nome',
        categoria, assunto, descricao, prioridade,
        // Campo vazio não vira chave: o detalhe do ticket lista o que existe, e
        // um punhado de strings vazias só polui a leitura.
        campos: Object.fromEntries(Object.entries(campos).filter(([, v]) => v?.trim())),
      });
      if (r.erro || !r.id) { toast.error(r.erro ?? 'Não foi possível abrir o ticket.'); return; }

      const falhas = await enviarAnexosDoPedido(r.id);

      if (chamados.length) {
        setProgresso('Chamando as pessoas…');
        const p = await adicionarParticipantes(r.id, chamados.map(c => c.id));
        if (p.erro) toast.warning(`Ticket aberto, mas não deu para chamar as pessoas: ${p.erro}`);
      }

      if (falhas) {
        toast.warning(`Ticket aberto, mas ${falhas === 1 ? '1 arquivo não subiu' : `${falhas} arquivos não subiram`}. Mande pela conversa.`);
      } else {
        toast.success('Ticket aberto. Quem atende já foi avisado.');
      }
      limpar(); onCriado(r.id); onFechar();
    } finally { setSalvando(false); setProgresso(null); }
  }

  function campoExtra(c: CampoCategoria) {
    const valor = campos[c.key] ?? '';
    const definir = (v: string) => setCampos(p => ({ ...p, [c.key]: v }));

    // Usuário é busca por digitação, não lista rolável: a empresa tem quase
    // duzentas pessoas, e achar uma num `Select` é rolar até enxergar. Mesmo
    // gesto de "Adicionar responsável" em Solicitar Atendimento.
    if (c.tipo === 'usuario') {
      return <SeletorPessoa pessoas={pessoas} valor={valor} onEscolher={definir} />;
    }
    if (c.tipo === 'setor') {
      return (
        <Select value={valor} onValueChange={definir}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Opcional" /></SelectTrigger>
          <SelectContent className="max-h-64">
            {setores.map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (c.tipo === 'aba') {
      return (
        <Select value={valor} onValueChange={definir}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Opcional" /></SelectTrigger>
          <SelectContent className="max-h-64">
            {abasVisiveis.map(a => <SelectItem key={a.valor} value={a.valor}>{a.valor}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input value={valor} onChange={e => definir(e.target.value)}
        placeholder={c.dica ?? 'Opcional'} className="h-9" />
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0" onPaste={colar}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Novo ticket</DialogTitle>
          <DialogDescription>
            Preencha os passos abaixo. Quanto mais claro o pedido — e com print —, mais rápido ele é
            resolvido. A liderança do seu setor também acompanha.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* A categoria decide os campos — por isso ela vem primeiro e à vista,
              e não escondida numa lista suspensa. */}
          <Passo numero={1} titulo="Sobre o que é?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categorias.map(c => {
                const Icone = iconeDaCategoria(c.key);
                const ativa = c.key === categoria;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => { setCategoria(c.key); setCampos({}); }}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs leading-snug transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      ativa
                        ? 'border-primary bg-primary/[0.08] text-foreground'
                        : 'border-border text-foreground/80 hover:border-primary/40 hover:bg-accent/50',
                    )}
                  >
                    <Icone className={cn('w-4 h-4 mt-px shrink-0', ativa ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="font-medium">{c.label}</span>
                  </button>
                );
              })}
            </div>
            {definicao && (
              <p className="text-[11px] text-muted-foreground">{definicao.descricao}</p>
            )}

            {/* Os campos da categoria logo abaixo dela: é ela que os faz aparecer. */}
            {!!definicao?.campos.length && (
              <div className="mt-3 rounded-lg bg-muted/50 p-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Opcionais, mas poupam perguntas de quem vai atender.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {definicao.campos.map(c => (
                    <div key={c.key} className="space-y-1.5">
                      <Label className="text-xs">{c.label}</Label>
                      {campoExtra(c)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Passo>

          <Passo numero={2} titulo="O que aconteceu?">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-assunto" className="text-xs">Assunto <span className="text-destructive">*</span></Label>
                <Input id="ticket-assunto" value={assunto} onChange={e => setAssunto(e.target.value)}
                  placeholder="Ex.: Acordo do NR 123456 não aparece no analítico" className="h-9" maxLength={140} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-detalhes" className="text-xs">Detalhes</Label>
                <Textarea id="ticket-detalhes" value={descricao} onChange={e => setDescricao(e.target.value)}
                  placeholder={'O que aconteceu?\nO que você já tentou?\nO que precisa que seja feito?'} rows={4} />
              </div>
            </div>
          </Passo>

          <Passo numero={3} titulo="Prints e fotos" dica="Mostre o que está vendo na tela — é o que mais ajuda.">
            <AreaDeAnexos
              arquivos={arquivos}
              onArquivos={novos => setArquivos(a => [...a, ...novos])}
              onRemover={i => setArquivos(a => a.filter((_, j) => j !== i))}
              cargo={perfil?.perfil}
              desabilitado={salvando}
            />
          </Passo>

          <Passo numero={4} titulo="Qual a urgência?">
            <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Prioridade">
              {ORDEM_PRIORIDADE.map(p => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={prioridade === p}
                  onClick={() => setPrioridade(p)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    prioridade === p
                      ? 'bg-foreground text-background font-medium'
                      : cn('hover:bg-accent', PRIORIDADES[p].cor),
                  )}
                >
                  {PRIORIDADES[p].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{AJUDA_PRIORIDADE[prioridade]}</p>
          </Passo>

          <Passo numero={5} titulo="Quem mais precisa acompanhar?" opcional
            dica="As pessoas chamadas veem o ticket, conversam nele e recebem os avisos.">
            <SeletorDeVariasPessoas
              pessoas={candidatos}
              carregando={carregandoCandidatos}
              escolhidos={chamados}
              onMudar={setChamados}
            />
          </Passo>
        </div>

        <DialogFooter className="sticky bottom-0 px-6 py-4 border-t border-border bg-background sm:items-center">
          {progresso && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progresso}
            </span>
          )}
          {!progresso && arquivos.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              {arquivos.length === 1 ? '1 arquivo anexado' : `${arquivos.length} arquivos anexados`}
            </span>
          )}
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Abrir ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Um passo do formulário: número no círculo, título e o conteúdo. */
function Passo({ numero, titulo, dica, opcional, children }: {
  numero: number;
  titulo: string;
  dica?: string;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {numero}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="text-sm font-semibold leading-6">
            {titulo}
            {opcional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>}
          </h3>
          {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * O que cada prioridade quer dizer, na régua de quem atende: é o limite de
 * tempo sem movimento antes de o ticket virar «parado» (`fila.ts`).
 */
const AJUDA_PRIORIDADE: Record<PrioridadeTicket, string> = {
  baixa:   'Dá para esperar a semana.',
  normal:  'Para o dia útil seguinte.',
  alta:    'Precisa andar hoje.',
  urgente: 'A operação está parada por causa disto.',
};

/**
 * Escolher uma pessoa digitando o nome.
 *
 * Escolhido, o campo vira um "chip" com foto e nome, e o X devolve a busca —
 * assim o valor gravado é sempre um nome que existe, em vez de o que a pessoa
 * conseguiu lembrar na hora.
 *
 * A comparação passa por `normalizar`: "Jose" precisa achar "José", senão quem
 * digita sem acento (a maioria) conclui que a pessoa não está cadastrada.
 */
function SeletorPessoa({ pessoas, valor, onEscolher }: {
  pessoas: Opcao[];
  valor: string;
  onEscolher: (nome: string) => void;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicar(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  const escolhida = useMemo(
    () => pessoas.find(p => p.nome === valor) ?? null,
    [pessoas, valor],
  );

  const sugestoes = useMemo(() => {
    const t = normalizar(termo.trim());
    // Sem termo, as primeiras oito: a caixa aberta e vazia não diz o que fazer.
    if (!t) return pessoas.slice(0, 8);
    return pessoas.filter(p => normalizar(p.nome).includes(t)).slice(0, 8);
  }, [pessoas, termo]);

  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
        <Avatar className="w-6 h-6 shrink-0">
          {escolhida?.foto && <AvatarImage src={escolhida.foto} className="object-cover" />}
          <AvatarFallback className="text-[9px] font-bold">
            {valor.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm flex-1 truncate">{valor}</span>
        <Button variant="ghost" size="icon" className="w-6 h-6"
          onClick={() => { onEscolher(''); setTermo(''); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={caixaRef}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        value={termo}
        onChange={e => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        placeholder="Digite o nome… (opcional)"
        className="h-9 pl-8"
      />
      {aberto && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl p-1.5 max-h-56 overflow-y-auto">
          {!pessoas.length && (
            <p className="text-[11px] text-muted-foreground text-center py-3">Carregando…</p>
          )}
          {!!pessoas.length && !sugestoes.length && (
            <p className="text-[11px] text-muted-foreground text-center py-3">
              Nenhum usuário com esse nome.
            </p>
          )}
          {sugestoes.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onEscolher(p.nome); setTermo(''); setAberto(false); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent text-left transition-colors">
              <Avatar className="w-6 h-6 shrink-0">
                {p.foto && <AvatarImage src={p.foto} alt={p.nome} className="object-cover" />}
                <AvatarFallback className="bg-muted text-[9px] font-bold">
                  {p.nome.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs truncate">{p.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
