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
import { Megaphone, Dices, LayoutGrid, Play, Trash2, Pencil, RotateCcw } from 'lucide-react';
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

/**
 * O painel de jogos — roleta, bingo e sorteio de pessoa.
 *
 * ## Por que um painel só para os três
 *
 * Eles compartilham a mesma mesa: o jogo é ABERTO uma vez e depois CONDUZIDO
 * várias — girar, sortear número, anunciar bingo, reiniciar. Três painéis
 * separados repetiriam a condução três vezes e divergiriam na segunda mudança.
 *
 * O que cada um tem de próprio é a montagem da lista, e é só isso que muda por
 * aba aqui dentro.
 *
 * ## O resultado nunca é decidido aqui
 *
 * Todo botão chama uma RPC. O servidor sorteia, grava e a parede lê. Ver
 * `Jogos.tsx` para o porquê — em resumo: sorteio decidido no navegador é
 * sorteio escolhido por quem abre o console.
 */
export function PainelSorteio({
  sorteio, pessoasDoSetor, onCriar, onSortear, onEncerrarBingo, onReiniciar, podeCortar,
}: {
  sorteio: DadosSorteio | null;
  /** Gente ativa do setor da tela, para o sorteio de pessoa. */
  pessoasDoSetor: { id: string; nome: string; foto_url: string | null }[];
  onCriar: (
    tipo: 'roleta' | 'bingo' | 'sorteio',
    titulo: string,
    participantes: unknown[] | null,
    config: Record<string, unknown>,
  ) => void | Promise<void>;
  onSortear: () => void | Promise<void>;
  onEncerrarBingo: (quem: string) => void | Promise<void>;
  onReiniciar: () => void | Promise<void>;
  podeCortar: boolean;
}) {
  const [aba, setAba] = useState<'roleta' | 'bingo' | 'sorteio'>('roleta');
  const [titulo, setTitulo] = useState('');
  const [itens, setItens] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [removerAoSair, setRemoverAoSair] = useState(true);
  const [layout, setLayout] = useState<'classica' | 'neon' | 'sobria'>('classica');
  const [ate, setAte] = useState(75);
  const [vencedorBingo, setVencedorBingo] = useState('');

  const historico = sorteio?.resultado?.historico ?? [];
  const numeros = sorteio?.resultado?.numeros ?? [];
  const bingoFeito = sorteio?.resultado?.bingo;
  const ehBingo = sorteio?.tipo === 'bingo';

  const alternar = (id: string) => setMarcados(atual => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });

  const abrir = () => {
    if (aba === 'sorteio') {
      const escolhidas = pessoasDoSetor.filter(p => marcados.has(p.id));
      void onCriar('sorteio', titulo, escolhidas.length ? escolhidas : null, { remover_ao_sair: removerAoSair });
    } else if (aba === 'bingo') {
      void onCriar('bingo', titulo, null, { ate });
    } else {
      const lista = itens.split('\n').map(l => l.trim()).filter(Boolean);
      void onCriar('roleta', titulo, lista.length ? lista : null, { remover_ao_sair: removerAoSair, layout });
    }
    setTitulo('');
  };

  return (
    <div className="rounded-md border p-3 space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Dices className="h-3.5 w-3.5" /> Jogos
      </p>

      {/* ── O jogo em andamento ───────────────────────────────────────────── */}
      {sorteio ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{sorteio.titulo}</p>
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {sorteio.tipo}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {ehBingo
              ? `${numeros.length} de ${sorteio.config?.ate ?? 75} números sorteados · rodada ${sorteio.resultado?.rodada ?? 1}`
              : `${sorteio.participantes.length} na lista · ${historico.length} já ${historico.length === 1 ? 'saiu' : 'saíram'}`}
          </p>

          {bingoFeito && (
            <p className="rounded bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Bingo de {bingoFeito.quem}
            </p>
          )}

          <Button
            size="sm" className="w-full"
            disabled={!podeCortar || !!bingoFeito}
            onClick={() => { void onSortear(); }}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {ehBingo ? 'Sortear o próximo número' : 'Girar'}
          </Button>

          {ehBingo && !bingoFeito && (
            <div className="flex gap-1">
              <Input
                value={vencedorBingo}
                onChange={e => setVencedorBingo(e.target.value)}
                placeholder="Quem bateu"
                className="h-8 text-xs"
              />
              <Button
                size="sm" variant="secondary" className="shrink-0 text-xs"
                disabled={!podeCortar || !vencedorBingo.trim()}
                onClick={() => { void onEncerrarBingo(vencedorBingo); setVencedorBingo(''); }}
              >
                BINGO!
              </Button>
            </div>
          )}

          {/*
            O histórico é a memória do jogo, e ele existe porque a pergunta
            «quem já saiu?» aparece toda vez — e ninguém anota.
          */}
          {historico.length > 0 && (
            <div className="max-h-28 space-y-0.5 overflow-y-auto rounded border bg-background p-1.5">
              {[...historico].reverse().map((g, i) => (
                <p key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
                    {historico.length - i}
                  </span>
                  <span className="truncate">
                    {typeof g.item === 'string' ? g.item : g.item?.nome}
                  </span>
                </p>
              ))}
            </div>
          )}

          {ehBingo && numeros.length > 0 && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Saíram: {numeros.join(', ')}
            </p>
          )}

          <Button
            size="sm" variant="ghost" className="w-full text-xs"
            disabled={!podeCortar}
            onClick={() => { void onReiniciar(); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {ehBingo ? 'Nova rodada' : 'Devolver todos à lista'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum jogo aberto neste setor.</p>
      )}

      {/* ── Abrir um jogo ─────────────────────────────────────────────────── */}
      <div className="space-y-2 border-t pt-2.5">
        <div className="flex gap-1">
          {(['roleta', 'bingo', 'sorteio'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setAba(t)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-semibold capitalize ${
                aba === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'sorteio' ? 'pessoa' : t}
            </button>
          ))}
        </div>

        <Input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder={aba === 'bingo' ? 'Título do bingo' : aba === 'sorteio' ? 'Título do sorteio' : 'Título da roleta'}
          className="h-8"
        />

        {aba === 'roleta' && (
          <>
            <textarea
              value={itens}
              onChange={e => setItens(e.target.value)}
              placeholder={'Um item por linha\nFolga na sexta\nCafé por conta da casa\nVale-lanche'}
              rows={5}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            />
            <p className="text-[11px] text-muted-foreground">
              Em branco, entra o setor inteiro.
            </p>
            <div className="flex gap-1">
              {(['classica', 'neon', 'sobria'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayout(l)}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] capitalize ${
                    layout === l ? 'border-primary text-primary font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </>
        )}

        {aba === 'sorteio' && (
          <div className="max-h-44 space-y-0.5 overflow-y-auto rounded border p-1.5">
            {pessoasDoSetor.length === 0 && (
              <p className="p-1 text-xs text-muted-foreground">Ninguém ativo neste setor.</p>
            )}
            {pessoasDoSetor.map(p => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={marcados.has(p.id)}
                  onChange={() => alternar(p.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-sky-500"
                />
                {p.foto_url
                  ? <img src={p.foto_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  : <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />}
                <span className="truncate text-xs">{p.nome}</span>
              </label>
            ))}
            {pessoasDoSetor.length > 0 && (
              <p className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                {marcados.size === 0
                  ? 'Nenhum marcado — entra o setor inteiro.'
                  : `${marcados.size} marcado(s).`}
              </p>
            )}
          </div>
        )}

        {aba === 'bingo' && (
          <div className="space-y-1">
            <Label className="text-xs">Vai até o número</Label>
            <Input
              type="number" min={10} max={99}
              value={String(ate)}
              onChange={e => setAte(Math.max(10, Math.min(99, Number(e.target.value) || 75)))}
              className="h-8"
            />
          </div>
        )}

        {aba !== 'bingo' && (
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={removerAoSair}
              onChange={e => setRemoverAoSair(e.target.checked)}
              className="h-3.5 w-3.5 accent-sky-500"
            />
            Quem sair não volta a concorrer
          </label>
        )}

        <Button
          size="sm" className="w-full"
          disabled={!podeCortar || !titulo.trim()}
          onClick={abrir}
        >
          Abrir {aba === 'sorteio' ? 'sorteio' : aba}
        </Button>

        {!podeCortar && (
          <p className="text-[11px] text-muted-foreground">
            Abrir e conduzir jogo pede a chave <strong>TV: mandar ao ar</strong>.
          </p>
        )}
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
