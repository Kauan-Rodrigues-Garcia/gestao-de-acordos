/**
 * NovoTicketDialog — abrir um pedido.
 *
 * O formulário muda de forma conforme a categoria: escolher "Trocar senha de
 * usuário" faz aparecer o campo de usuário, "Erro no sistema" faz aparecer a
 * lista de abas. Os campos extras são TODOS opcionais — a definição vive em
 * `categorias.ts`, e a razão de existirem está lá.
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
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { abrirTicket } from '@/services/tickets.service';
import {
  CATEGORIAS, ABAS_DO_SISTEMA, PRIORIDADES,
  type CampoCategoria, type PrioridadeTicket,
} from './categorias';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onCriado: () => void;
}

interface Opcao { id: string; nome: string; foto?: string | null }

export default function NovoTicketDialog({ aberto, onFechar, onCriado }: Props) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const empresaId = empresa?.id ?? null;

  const [categoria, setCategoria] = useState('senha');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeTicket>('normal');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const [pessoas, setPessoas] = useState<Opcao[]>([]);
  const [setores, setSetores] = useState<Opcao[]>([]);

  const definicao = useMemo(() => CATEGORIAS.find(c => c.key === categoria), [categoria]);

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
  }

  async function salvar() {
    if (!empresaId || !perfil?.id) return;
    if (!assunto.trim()) { toast.error('Escreva o assunto do ticket.'); return; }

    setSalvando(true);
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
      if (r.erro) { toast.error(r.erro); return; }
      toast.success('Ticket aberto. Quem atende já foi notificado.');
      limpar(); onCriado(); onFechar();
    } finally { setSalvando(false); }
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
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo ticket</DialogTitle>
          <DialogDescription>
            A liderança do seu setor acompanha este ticket. Os campos extras são opcionais —
            o que faltar dá para conversar no chat, com print e áudio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={v => { setCategoria(v); setCampos({}); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {CATEGORIAS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {definicao && (
              <p className="text-[11px] text-muted-foreground">{definicao.descricao}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Assunto</Label>
            <Input value={assunto} onChange={e => setAssunto(e.target.value)}
              placeholder="Uma frase que diga o pedido" className="h-9" maxLength={140} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Detalhes</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="O que aconteceu, o que já tentou, o que precisa" rows={4} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Prioridade</Label>
            <Select value={prioridade} onValueChange={v => setPrioridade(v as PrioridadeTicket)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORIDADES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!!definicao?.campos.length && (
            <div className="rounded-md border border-border p-3 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Informações adicionais — opcionais, mas encurtam a conversa.
              </p>
              {definicao.campos.map(c => (
                <div key={c.key} className="space-y-1.5">
                  <Label className="text-xs">{c.label}</Label>
                  {campoExtra(c)}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
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

/** \u0300-\u036f: as marcas de acento que o NFD separa da letra. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
