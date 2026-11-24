/**
 * pessoas.tsx — escolher gente: para quem transferir e quem chamar.
 *
 * ## Duas perguntas diferentes
 *
 *   • **Transferir** troca o DONO. É uma pessoa só, e só entre quem atende —
 *     transferir para quem não atende deixaria o ticket com um responsável que
 *     não consegue mexer nele. Vai com recado opcional, porque quem recebe um
 *     ticket no meio do caminho precisa saber em que pé está.
 *   • **Chamar pessoas** soma PARTICIPANTES. Várias de uma vez, de qualquer
 *     setor: o líder do outro setor envolvido, o colega que entende do assunto.
 *     Participante vê, conversa e recebe aviso; não muda estado nem dono.
 *
 * As duas usam a mesma lista com busca (`ListaDePessoas`): digitar o nome é
 * mais rápido do que rolar duzentas pessoas, e «Jose» precisa achar «José».
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { PessoaTicket } from '@/services/tickets.service';
import { iniciais } from './fila';
import { normalizar, rotuloCargo } from './arquivos';

export function AvatarPessoa({ nome, foto, className }: { nome: string | null; foto?: string | null; className?: string }) {
  return (
    <Avatar className={cn('w-7 h-7 shrink-0', className)}>
      {foto && <AvatarImage src={foto} alt={nome ?? ''} className="object-cover" />}
      <AvatarFallback className="text-[10px] font-semibold">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Busca + lista. `marcados` decide o visual (um ou vários), `bloqueados` são
 * os que aparecem mas não se escolhem — com a frase do porquê.
 */
export function ListaDePessoas({
  pessoas, carregando, marcados, onAlternar, bloqueados, autoFocus = true, alturaMax = 'max-h-72',
}: {
  pessoas: PessoaTicket[];
  carregando: boolean;
  marcados: Set<string>;
  onAlternar: (p: PessoaTicket) => void;
  bloqueados?: Map<string, string>;
  autoFocus?: boolean;
  alturaMax?: string;
}) {
  const [termo, setTermo] = useState('');
  const visiveis = useMemo(() => {
    const t = normalizar(termo.trim());
    const lista = t ? pessoas.filter(p => normalizar(p.nome).includes(t)) : pessoas;
    return lista.slice(0, 80);
  }, [pessoas, termo]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={termo} onChange={e => setTermo(e.target.value)} autoFocus={autoFocus}
          placeholder="Digite o nome…" className="h-9 pl-8" aria-label="Buscar pessoa" />
      </div>
      <div className={cn('overflow-y-auto rounded-lg border border-border divide-y divide-border', alturaMax)}>
        {carregando && (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando pessoas…
          </p>
        )}
        {!carregando && !visiveis.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {termo ? 'Ninguém com esse nome.' : 'Ninguém disponível.'}
          </p>
        )}
        {!carregando && visiveis.map(p => {
          const marcado = marcados.has(p.id);
          const motivo = bloqueados?.get(p.id);
          return (
            <button key={p.id} type="button" disabled={!!motivo}
              onClick={() => onAlternar(p)}
              aria-pressed={marcado}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                marcado ? 'bg-primary/[0.08]' : 'hover:bg-accent/60',
                motivo && 'opacity-60 cursor-not-allowed hover:bg-transparent',
              )}>
              <AvatarPessoa nome={p.nome} foto={p.foto} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{p.nome}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {motivo ?? rotuloCargo(p.perfil)}
                </span>
              </span>
              <span className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}>
                {marcado && <Check className="w-3 h-3" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Chips de quem já foi escolhido, com X. */
export function ChipsDePessoas({ pessoas, onTirar }: { pessoas: PessoaTicket[]; onTirar: (id: string) => void }) {
  if (!pessoas.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {pessoas.map(p => (
        <span key={p.id}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background pl-0.5 pr-1 text-xs">
          <AvatarPessoa nome={p.nome} foto={p.foto} className="w-6 h-6" />
          <span className="max-w-[10rem] truncate">{p.nome}</span>
          <button type="button" onClick={() => onTirar(p.id)} aria-label={`Tirar ${p.nome}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ── Transferir ───────────────────────────────────────────────────────────────

export function TransferirDialog({
  aberto, onFechar, pessoas, carregando, responsavelAtualId, meuId, numero, onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  pessoas: PessoaTicket[];
  carregando: boolean;
  responsavelAtualId: string | null;
  meuId: string | null;
  numero: number;
  onConfirmar: (p: { para: PessoaTicket; recado: string; continuarAcompanhando: boolean }) => Promise<boolean>;
}) {
  const [escolhido, setEscolhido] = useState<PessoaTicket | null>(null);
  const [recado, setRecado] = useState('');
  const [continuar, setContinuar] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setEscolhido(null); setRecado(''); setContinuar(true); }
  }, [aberto]);

  const bloqueados = useMemo(() => {
    const m = new Map<string, string>();
    if (responsavelAtualId) m.set(responsavelAtualId, 'Já está com o ticket');
    return m;
  }, [responsavelAtualId]);

  // «Continuar acompanhando» só faz sentido para quem está largando o ticket.
  const largandoOMeu = !!meuId && responsavelAtualId === meuId && escolhido?.id !== meuId;

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    try {
      const ok = await onConfirmar({ para: escolhido, recado, continuarAcompanhando: largandoOMeu && continuar });
      if (ok) onFechar();
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" /> Transferir o ticket #{numero}
          </DialogTitle>
          <DialogDescription>
            Escolha quem passa a cuidar dele. Só aparecem pessoas que atendem tickets.
          </DialogDescription>
        </DialogHeader>

        <ListaDePessoas
          pessoas={pessoas}
          carregando={carregando}
          marcados={new Set(escolhido ? [escolhido.id] : [])}
          onAlternar={p => setEscolhido(atual => (atual?.id === p.id ? null : p))}
          bloqueados={bloqueados}
        />

        <div className="space-y-1.5">
          <Label htmlFor="recado-transferencia" className="text-xs">
            Recado para {escolhido ? escolhido.nome.split(' ')[0] : 'quem recebe'} <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Textarea id="recado-transferencia" value={recado} onChange={e => setRecado(e.target.value)} rows={2}
            placeholder="Em que pé está, o que falta fazer…" />
        </div>

        {largandoOMeu && (
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <Checkbox checked={continuar} onCheckedChange={v => setContinuar(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">Continuar acompanhando</span>
              <span className="block text-muted-foreground">Você vira participante e segue recebendo os avisos.</span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!escolhido || salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {escolhido ? `Transferir para ${escolhido.nome.split(' ')[0]}` : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Chamar pessoas ───────────────────────────────────────────────────────────

export function ChamarPessoasDialog({
  aberto, onFechar, pessoas, carregando, jaNoTicket, numero, onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  pessoas: PessoaTicket[];
  carregando: boolean;
  /** id → motivo («Abriu o ticket», «Já participa», «Responsável»). */
  jaNoTicket: Map<string, string>;
  numero: number;
  onConfirmar: (escolhidos: PessoaTicket[]) => Promise<boolean>;
}) {
  const [escolhidos, setEscolhidos] = useState<PessoaTicket[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (aberto) setEscolhidos([]); }, [aberto]);

  function alternar(p: PessoaTicket) {
    setEscolhidos(atual => (atual.some(x => x.id === p.id) ? atual.filter(x => x.id !== p.id) : [...atual, p]));
  }

  async function confirmar() {
    if (!escolhidos.length) return;
    setSalvando(true);
    try {
      const ok = await onConfirmar(escolhidos);
      if (ok) onFechar();
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Chamar pessoas para o #{numero}
          </DialogTitle>
          <DialogDescription>
            Quem você chamar passa a ver o ticket, pode conversar nele e recebe os avisos. Dá para
            escolher várias pessoas de uma vez, de qualquer setor.
          </DialogDescription>
        </DialogHeader>

        <ChipsDePessoas pessoas={escolhidos} onTirar={id => setEscolhidos(a => a.filter(p => p.id !== id))} />

        <ListaDePessoas
          pessoas={pessoas}
          carregando={carregando}
          marcados={new Set(escolhidos.map(p => p.id))}
          onAlternar={alternar}
          bloqueados={jaNoTicket}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!escolhidos.length || salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {escolhidos.length > 1 ? `Chamar ${escolhidos.length} pessoas` : 'Chamar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Seletor de várias pessoas embutido num formulário (o de abertura): chips em
 * cima, busca embaixo — sem abrir outra janela por cima do diálogo.
 */
export function SeletorDeVariasPessoas({ pessoas, carregando, escolhidos, onMudar, bloqueados }: {
  pessoas: PessoaTicket[];
  carregando: boolean;
  escolhidos: PessoaTicket[];
  onMudar: (lista: PessoaTicket[]) => void;
  bloqueados?: Map<string, string>;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="space-y-2">
      <ChipsDePessoas pessoas={escolhidos} onTirar={id => onMudar(escolhidos.filter(p => p.id !== id))} />
      {aberto ? (
        <ListaDePessoas
          pessoas={pessoas}
          carregando={carregando}
          marcados={new Set(escolhidos.map(p => p.id))}
          onAlternar={p => onMudar(escolhidos.some(x => x.id === p.id)
            ? escolhidos.filter(x => x.id !== p.id)
            : [...escolhidos, p])}
          bloqueados={bloqueados}
          alturaMax="max-h-52"
        />
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAberto(true)}>
          <UserPlus className="w-3.5 h-3.5" /> {escolhidos.length ? 'Chamar mais alguém' : 'Chamar pessoas'}
        </Button>
      )}
    </div>
  );
}
