/**
 * PainelEstudio.tsx — o que fica embaixo da mesa.
 *
 * Três coisas que não pertencem à montagem da cena, mas à OPERAÇÃO dela:
 * disparar alerta, conduzir sorteio e olhar todas as telas de uma vez.
 *
 * Separado de `index.tsx` porque a mesa já é grande, e porque estes três painéis
 * mudam por motivos diferentes do editor de cena.
 */
import { useState } from 'react';
import { Megaphone, Dices, LayoutGrid, Play, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palco } from './Palco';
import { telaOnline, type Tela } from './useModoTV';
import type { DadosSorteio, Fonte } from './geometria';

// ── Alerta ───────────────────────────────────────────────────────────────────

export function PainelAlerta({
  onDisparar, podeCortar,
}: {
  onDisparar: (titulo: string, mensagem?: string, midia?: string, som?: string, dur?: number) => void | Promise<void>;
  podeCortar: boolean;
}) {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="rounded-md border p-3 space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Megaphone className="h-3.5 w-3.5" /> Alerta ao vivo
      </p>

      <Input value={titulo} onChange={e => setTitulo(e.target.value)}
             placeholder="Fulano bateu a meta!" className="h-8" />
      <Input value={mensagem} onChange={e => setMensagem(e.target.value)}
             placeholder="Mensagem (opcional)" className="h-8" />

      <Button
        size="sm" className="w-full"
        disabled={!podeCortar || !titulo.trim() || enviando}
        onClick={async () => {
          setEnviando(true);
          await onDisparar(titulo, mensagem || undefined, undefined, undefined, 10);
          setEnviando(false);
          setTitulo(''); setMensagem('');
        }}
      >
        {enviando ? 'Disparando…' : 'Disparar na parede'}
      </Button>

      <p className="text-[11px] text-muted-foreground">
        Entra por cima da cena, fica 10 segundos e sai sozinho. Não interrompe a
        rotação.
      </p>
    </div>
  );
}

// ── Sorteio ──────────────────────────────────────────────────────────────────

export function PainelSorteio({
  sorteio, onCriar, onSortear, podeCortar,
}: {
  sorteio: DadosSorteio | null;
  onCriar: (tipo: 'roleta' | 'bingo', titulo: string) => void | Promise<void>;
  onSortear: () => void | Promise<void>;
  podeCortar: boolean;
}) {
  const [titulo, setTitulo] = useState('');
  const numeros = sorteio?.resultado?.numeros ?? [];
  const vencedor = sorteio?.resultado?.vencedor;

  return (
    <div className="rounded-md border p-3 space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Dices className="h-3.5 w-3.5" /> Sorteio
      </p>

      {sorteio ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{sorteio.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {sorteio.tipo === 'bingo'
              ? `${numeros.length} números sorteados`
              : `${sorteio.participantes.length} concorrendo`}
          </p>

          {vencedor && (
            <p className="text-sm">
              Ganhou: <strong className="text-emerald-600 dark:text-emerald-400">{vencedor}</strong>
            </p>
          )}

          {/* A roleta gira UMA vez. Girar de novo reescreveria o vencedor de um
              sorteio já feito, e a parede passaria a mostrar outro nome. */}
          <Button
            size="sm" className="w-full"
            disabled={!podeCortar || (sorteio.tipo === 'roleta' && !!vencedor)}
            onClick={() => { void onSortear(); }}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {sorteio.tipo === 'bingo'
              ? 'Sortear próximo número'
              : vencedor ? 'Já foi girada' : 'Girar a roleta'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum sorteio aberto neste setor.</p>
      )}

      <div className="pt-1 space-y-1.5 border-t">
        <Input value={titulo} onChange={e => setTitulo(e.target.value)}
               placeholder="Título do novo sorteio" className="h-8" />
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" className="flex-1 text-xs"
                  disabled={!podeCortar || !titulo.trim()}
                  onClick={() => { void onCriar('roleta', titulo); setTitulo(''); }}>
            Nova roleta
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 text-xs"
                  disabled={!podeCortar || !titulo.trim()}
                  onClick={() => { void onCriar('bingo', titulo); setTitulo(''); }}>
            Novo bingo
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Entram todos do setor. A lista é congelada na abertura, e quem sorteou
          e quando fica registrado.
        </p>
      </div>
    </div>
  );
}

// ── Mosaico ──────────────────────────────────────────────────────────────────

/**
 * Todas as telas de uma vez.
 *
 * Serve para a pergunta que a mesa sozinha não responde: "as outras estão
 * certas?". Cada quadro é o mesmo `<Palco>`, alimentado pela mesma RPC que
 * alimenta aquela parede — não é uma reconstrução.
 */
export function Mosaico({
  telas, fontesPorTela, telaAtiva, onEscolher,
}: {
  telas: Tela[];
  fontesPorTela: Record<string, Fonte[]>;
  telaAtiva: string | null;
  onEscolher: (id: string) => void;
}) {
  if (telas.length < 2) return null;

  return (
    <section className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <LayoutGrid className="h-3.5 w-3.5" /> Todas as telas
      </Label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {telas.map(t => (
          <button
            key={t.id}
            onClick={() => onEscolher(t.id)}
            className={`text-left rounded-md border-2 overflow-hidden ${
              telaAtiva === t.id ? 'border-primary' : 'border-border hover:border-muted-foreground/40'
            }`}
          >
            <div className="relative bg-[#0a0f13]" style={{ aspectRatio: '16 / 9' }}>
              <Palco fontes={fontesPorTela[t.id] ?? []}
                     aviso={(fontesPorTela[t.id] ?? []).length === 0 ? 'Nada no ar' : null} />
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="text-xs font-medium truncate">{t.nome}</span>
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                telaOnline(t.ultimo_sinal) ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              }`} title={telaOnline(t.ultimo_sinal) ? 'No ar' : 'Sem sinal'} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Gerenciar a tela ─────────────────────────────────────────────────────────

export function AcoesDaTela({
  tela, onRenomear, onApagar,
}: {
  tela: Tela;
  onRenomear: (id: string, nome: string) => void | Promise<void>;
  onApagar: (id: string) => void | Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(tela.nome);
  const [confirmando, setConfirmando] = useState(false);

  if (editando) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={e => { e.preventDefault(); void onRenomear(tela.id, nome); setEditando(false); }}
      >
        <Input value={nome} onChange={e => setNome(e.target.value)} className="h-8 w-44" autoFocus />
        <Button type="submit" size="sm" className="h-8">Salvar</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8"
                onClick={() => { setNome(tela.nome); setEditando(false); }}>
          Cancelar
        </Button>
      </form>
    );
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2">
        {/*
          O texto diz o que REALMENTE acontece. "Apagar" desativa: o histórico
          de quem cortou o quê continua, e o endereço não volta a ficar livre
          para outra tela — senão o PC daquela sala passaria a exibir a parede
          de outro setor sem ninguém ter tocado nele.
        */}
        <span className="text-xs text-muted-foreground">
          Aposentar <strong>{tela.nome}</strong>? O endereço <code className="font-mono">/tv/{tela.slug}</code> para de funcionar.
        </span>
        <Button size="sm" variant="destructive" className="h-8"
                onClick={() => { void onApagar(tela.id); setConfirmando(false); }}>
          Aposentar
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button size="sm" variant="ghost" className="h-8 px-2" title="Renomear"
              onClick={() => setEditando(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive"
              title="Aposentar tela" onClick={() => setConfirmando(true)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
