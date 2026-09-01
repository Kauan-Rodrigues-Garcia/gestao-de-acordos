/**
 * ModoTV — a mesa de corte.
 *
 * Prévia à esquerda, no ar à direita, o corte no meio. É o Studio Mode de
 * qualquer software de transmissão, e existe pelo motivo de sempre: ninguém
 * monta cena na frente da plateia.
 *
 * ## O que garante que a prévia não minta
 *
 * Os dois quadros abaixo renderizam o MESMO componente `<Palco>` que o PC da TV
 * renderiza, com as mesmas props. O da direita não é uma reconstrução do estado
 * local: ele vem da mesma RPC que alimenta a parede. Se a mesa e a TV
 * divergirem algum dia, o quadro da direita mostra a divergência em vez de
 * escondê-la.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Tv, Plus, Trash2, Radio, Type, Image, Trophy, Target, ExternalLink,
  Square, Clock, Eye, EyeOff, ChevronUp, ChevronDown, Film, Repeat, PowerOff, Flag, Dices,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { Palco } from './Palco';
import { useModoTV, telaOnline, type Midia, type Cena } from './useModoTV';
import { numero, texto, ligado, type Fonte, type TipoFonte } from './geometria';
import { normalizarSlug } from './slug';
import { PainelAlerta, PainelSorteio, Mosaico, AcoesDaTela } from './PainelEstudio';

const TIPOS: { tipo: TipoFonte; nome: string; Icone: typeof Type }[] = [
  { tipo: 'texto',   nome: 'Texto',   Icone: Type },
  { tipo: 'imagem',  nome: 'Imagem',  Icone: Image },
  { tipo: 'ranking', nome: 'Ranking', Icone: Trophy },
  { tipo: 'meta',    nome: 'Meta',    Icone: Target },
  { tipo: 'fundo',   nome: 'Fundo',   Icone: Square },
  { tipo: 'relogio', nome: 'Relógio', Icone: Clock },
  { tipo: 'video',   nome: 'Vídeo',   Icone: Film },
  { tipo: 'desafio', nome: 'Desafio', Icone: Flag },
  { tipo: 'sorteio', nome: 'Sorteio', Icone: Dices },
];

export default function ModoTV() {
  const { temPermissao } = useCargoPermissoes();
  const tv = useModoTV();
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [nomeCenaNova, setNomeCenaNova] = useState('');
  const [mostrarNovaTela, setMostrarNovaTela] = useState(false);

  const podeEditar = temPermissao('tv_editar_cenas');
  const podeCortar = temPermissao('tv_cortar');
  const podeGerenciarTelas = temPermissao('tv_gerenciar_telas');
  const podeEnviarMidia = temPermissao('tv_enviar_midia');

  const selecionada = tv.fontesDaPrevia.find(f => f.id === selecionadaId) ?? null;
  const cenaAtual = tv.cenas.find(c => c.id === tv.cenaId) ?? null;
  const noArAgora = tv.cenaNoArId === tv.cenaId;

  /*
   * Atalhos de teclado.
   *
   * Numa mesa de transmissão a mão não sai do teclado, e trocar de cena com o
   * mouse é lento justamente na hora em que a pressa importa.
   *
   * A guarda do `tagName` é obrigatória: sem ela, digitar "1" no nome de uma
   * cena trocaria a cena, e apertar Enter num campo mandaria a parede ao ar no
   * meio de uma edição.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (
        alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable
      );
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === 'Escape') { setSelecionadaId(null); return; }

      if (e.key === 'Enter' && podeCortar && tv.cenaId) {
        e.preventDefault();
        void tv.cortar();
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const cena = tv.cenas[Number(e.key) - 1];
        if (cena) { tv.setCenaId(cena.id); setSelecionadaId(null); }
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [tv, podeCortar]);

  if (tv.carregando) {
    return <div className="p-8 text-muted-foreground">Carregando o Modo TV…</div>;
  }

  if (tv.telas.length === 0) {
    return (
      <div className="p-8 max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Modo TV</h1>
        <p className="text-muted-foreground">
          Uma tela é o endereço que fica aberto no PC ligado à TV. Cada setor pode
          ter a sua.
        </p>
        {podeGerenciarTelas ? (
          <NovaTela setores={tv.setores} onCriar={tv.criarTela} />
        ) : (
          <p className="text-muted-foreground">
            Nenhuma tela cadastrada ainda, e você não tem a chave{' '}
            <strong>TV: cadastrar telas</strong> para criar a primeira.
          </p>
        )}
        {tv.erro && <p className="text-sm text-destructive">{tv.erro}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Barra da tela ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3">
        <Tv className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-bold">Modo TV</h1>

        <Select value={tv.telaId ?? undefined} onValueChange={tv.setTelaId}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Escolha a tela" /></SelectTrigger>
          <SelectContent>
            {tv.telas.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tv.tela && (
          <>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                telaOnline(tv.tela.ultimo_sinal)
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${
                telaOnline(tv.tela.ultimo_sinal) ? 'bg-emerald-500' : 'bg-muted-foreground/50'
              }`} />
              {telaOnline(tv.tela.ultimo_sinal) ? 'No ar' : 'Sem sinal'}
            </span>

            <Link
              to={`/tv/${tv.tela.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              /tv/{tv.tela.slug} <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        )}

        {podeGerenciarTelas && tv.tela && (
          <AcoesDaTela tela={tv.tela} onRenomear={tv.renomearTela} onApagar={tv.apagarTela} />
        )}

        {podeGerenciarTelas && (
          <Button
            variant="ghost" size="sm" className="ml-auto"
            onClick={() => setMostrarNovaTela(v => !v)}
          >
            <Plus className="h-4 w-4 mr-1" /> Nova tela
          </Button>
        )}
      </header>

      {mostrarNovaTela && podeGerenciarTelas && (
        <div className="max-w-xl">
          <NovaTela
            setores={tv.setores}
            onCriar={async (nome, slug, setorId) => {
              await tv.criarTela(nome, slug, setorId);
              setMostrarNovaTela(false);
            }}
          />
        </div>
      )}

      {tv.erro && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive flex items-center justify-between">
          <span>{tv.erro}</span>
          <Button variant="ghost" size="sm" onClick={tv.limparErro}>Fechar</Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[190px_1fr_300px]">

        {/* ── Cenas ──────────────────────────────────────────────────────── */}
        <aside className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cenas</Label>
          <div className="space-y-1">
            {tv.cenas.map(c => (
              <button
                key={c.id}
                onClick={() => { tv.setCenaId(c.id); setSelecionadaId(null); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 ${
                  tv.cenaId === c.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'
                }`}
              >
                <span className="truncate">{c.nome}</span>
                {tv.cenaNoArId === c.id && (
                  <Radio className="h-3.5 w-3.5 text-red-500 shrink-0" aria-label="no ar" />
                )}
              </button>
            ))}
          </div>

          {podeEditar && (
            <form
              className="flex gap-1 pt-1"
              onSubmit={e => {
                e.preventDefault();
                if (!nomeCenaNova.trim()) return;
                void tv.criarCena(nomeCenaNova);
                setNomeCenaNova('');
              }}
            >
              <Input
                value={nomeCenaNova}
                onChange={e => setNomeCenaNova(e.target.value)}
                placeholder="Nova cena"
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="secondary" className="h-8 px-2">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          )}

          {podeEditar && cenaAtual && (
            <div className="rounded-md border p-2.5 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Esta cena
              </p>

              <Campo label="Como ela entra">
                <Select
                  value={cenaAtual.transicao}
                  onValueChange={v => { void tv.atualizarCena(cenaAtual.id, { transicao: v as Cena['transicao'] }); }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corte">Corte seco</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="deslize">Deslize</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>

              <div className="flex items-center justify-between">
                <Label className="text-xs">Entra na rotação</Label>
                <Switch
                  checked={cenaAtual.na_rotacao}
                  onCheckedChange={v => { void tv.atualizarCena(cenaAtual.id, { na_rotacao: v }); }}
                />
              </div>

              {cenaAtual.na_rotacao && (
                <Campo label={`Fica ${cenaAtual.duracao_s}s no ar`}>
                  <Slider
                    min={5} max={180} step={5}
                    value={[cenaAtual.duracao_s]}
                    onValueChange={([v]) => { void tv.atualizarCena(cenaAtual.id, { duracao_s: v }); }}
                  />
                </Campo>
              )}

              <div className="flex items-center justify-between">
                <Label className="text-xs" title="Entra quando não há nada no ar">
                  Cena de emergência
                </Label>
                <Switch
                  checked={cenaAtual.emergencia}
                  onCheckedChange={v => { void tv.atualizarCena(cenaAtual.id, { emergencia: v }); }}
                />
              </div>

              <Button
                variant="ghost" size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => { void tv.apagarCena(cenaAtual.id); setSelecionadaId(null); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar cena
              </Button>
            </div>
          )}
        </aside>

        {/* ── Prévia e no ar ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <QuadroPalco
              rotulo="Prévia"
              cor="text-emerald-600 dark:text-emerald-400"
              borda="border-emerald-500/50"
              fontes={tv.fontesDaPrevia}
              selecionadaId={selecionadaId}
              onSelecionar={podeEditar ? setSelecionadaId : undefined}
              arrastavel={podeEditar}
              onMover={tv.moverFonte}
              onSoltarArquivo={podeEditar && podeEnviarMidia ? tv.soltarArquivo : undefined}
              enviando={tv.enviandoImagem}
              vazio="Nenhuma cena escolhida"
            />
            <QuadroPalco
              rotulo="No ar"
              cor="text-red-600 dark:text-red-400"
              borda="border-red-500/60"
              fontes={tv.fontesNoAr}
              vazio="Nada no ar nesta tela"
            />
          </div>

          {/*
            O botão NÃO desativa quando a cena já está no ar.

            Antes desativava, e isso prendia: a pessoa mexia na cena e não tinha
            como publicar a mudança — o botão ficava cinza dizendo "Já está no
            ar" enquanto a parede exibia a versão antiga. Cortar de novo é o
            jeito de empurrar a alteração na hora.
          */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="lg"
              className="px-10 font-bold tracking-wide"
              disabled={!podeCortar || !tv.cenaId || tv.cortando}
              onClick={() => { void tv.cortar(); }}
            >
              {tv.cortando ? 'Mandando…' : noArAgora ? 'ATUALIZAR NO AR' : 'CORTAR PARA O AR'}
            </Button>

            <Button
              size="lg" variant="outline"
              disabled={!podeCortar || tv.cortando || tv.cenaNoArId === null}
              onClick={() => { void tv.cortar(null); }}
            >
              <PowerOff className="h-4 w-4 mr-1.5" /> Tirar do ar
            </Button>

            {tv.tela && (
              <Button
                size="lg"
                variant={tv.tela.rotacao_ativa ? 'default' : 'outline'}
                disabled={!podeCortar}
                onClick={() => { void tv.alternarRotacao(!tv.tela!.rotacao_ativa); }}
                title="A parede troca de cena sozinha, na ordem e na duração de cada uma"
              >
                <Repeat className="h-4 w-4 mr-1.5" />
                {tv.tela.rotacao_ativa ? 'Rotação ligada' : 'Rotação'}
              </Button>
            )}
          </div>

          {tv.tela?.rotacao_ativa && (
            <p className="text-center text-xs text-muted-foreground">
              A fila está no ar. Cortar qualquer cena à mão desliga a rotação.
            </p>
          )}

          {!podeCortar && (
            <p className="text-center text-xs text-muted-foreground">
              Você pode montar a cena, mas não mandá-la ao ar. A chave é <strong>TV: mandar ao ar</strong>.
            </p>
          )}
        </section>

        {/* ── Fontes ─────────────────────────────────────────────────────── */}
        <aside className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fontes</Label>

          {podeEditar && tv.cenaId && (
            <div className="grid grid-cols-2 gap-1">
              {TIPOS.map(({ tipo, nome, Icone }) => (
                <Button
                  key={tipo} variant="secondary" size="sm"
                  className="justify-start h-8 text-xs"
                  onClick={() => { void tv.adicionarFonte(tipo); }}
                >
                  <Icone className="h-3.5 w-3.5 mr-1.5" /> {nome}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {tv.fontesDaPrevia.length === 0 && (
              <p className="text-sm text-muted-foreground">Cena vazia. Some uma fonte acima.</p>
            )}
            {[...tv.fontesDaPrevia].reverse().map(f => (
              <button
                key={f.id}
                onClick={() => setSelecionadaId(f.id)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm ${
                  selecionadaId === f.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                }`}
              >
                {rotuloDaFonte(f)}
              </button>
            ))}
          </div>

          <PainelAlerta onDisparar={tv.dispararAlerta} podeCortar={podeCortar} />

          <PainelSorteio
            sorteio={tv.sorteio}
            onCriar={tv.criarSorteio}
            onSortear={tv.sortear}
            podeCortar={podeCortar}
          />

          {selecionada && podeEditar && (
            <Inspetor
              fonte={selecionada}
              onMudar={(m) => { void tv.atualizarFonte(selecionada.id, m); }}
              onRemover={() => { void tv.removerFonte(selecionada.id); setSelecionadaId(null); }}
              onCamada={(d) => { void tv.moverCamada(selecionada.id, d); }}
              podeEnviarMidia={podeEnviarMidia}
              onEnviarImagem={tv.enviarImagem}
              enviando={tv.enviandoImagem}
              midias={tv.midias}
            />
          )}
        </aside>
      </div>

      <Mosaico
        telas={tv.telas}
        fontesPorTela={tv.fontesPorTela}
        telaAtiva={tv.telaId}
        onEscolher={id => { tv.setTelaId(id); setSelecionadaId(null); }}
      />

      <p className="text-[11px] text-muted-foreground">
        Atalhos: <kbd>1</kbd>–<kbd>9</kbd> escolhem a cena, <kbd>Enter</kbd> manda ao ar,{' '}
        <kbd>Esc</kbd> tira a seleção da fonte.
      </p>
    </div>
  );
}

// ── Cadastro de tela ─────────────────────────────────────────────────────────

function NovaTela({
  setores, onCriar,
}: {
  setores: { id: string; nome: string }[];
  onCriar: (nome: string, slug: string, setorId: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [setorId, setSetorId] = useState<string>('');

  /*
   * O endereço acompanha o nome enquanto ninguém mexeu nele à mão. É o
   * comportamento que dispensa a pessoa de pensar em URL — digita "Recepção" e
   * o endereço vira `recepcao` sozinho.
   */
  const slugEfetivo = normalizarSlug(slug || nome);

  return (
    <form
      className="rounded-md border p-4 space-y-3"
      onSubmit={e => {
        e.preventDefault();
        if (!setorId || !slugEfetivo) return;
        void onCriar(nome, slugEfetivo, setorId);
      }}
    >
      <Campo label="Nome da tela">
        <Input value={nome} onChange={e => setNome(e.target.value)}
               placeholder="TV da Recepção" className="h-9" />
      </Campo>

      <Campo label="Setor dono da tela">
        <Select value={setorId || undefined} onValueChange={setSetorId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
          <SelectContent>
            {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>

      <Campo label="Endereço da TV">
        <Input value={slug} onChange={e => setSlug(e.target.value)}
               placeholder={normalizarSlug(nome) || 'recepcao'} className="h-9" />
      </Campo>

      <p className="text-xs text-muted-foreground">
        No PC ligado à TV, abra{' '}
        <code className="font-mono">/tv/{slugEfetivo || '…'}</code>. É esse endereço
        que fica na parede.
      </p>

      <Button type="submit" size="sm" disabled={!setorId || !slugEfetivo}>
        Criar tela
      </Button>
    </form>
  );
}

// ── Quadro ───────────────────────────────────────────────────────────────────

function QuadroPalco({
  rotulo, cor, borda, fontes, selecionadaId, onSelecionar, arrastavel, onMover,
  onSoltarArquivo, enviando, vazio,
}: {
  rotulo: string;
  cor: string;
  borda: string;
  fontes: Fonte[];
  selecionadaId?: string | null;
  onSelecionar?: (id: string) => void;
  arrastavel?: boolean;
  onMover?: (id: string, x: number, y: number, definitivo: boolean) => void;
  onSoltarArquivo?: (arquivo: File, x: number, y: number) => void | Promise<void>;
  enviando?: boolean;
  vazio: string;
}) {
  const [sobrevoando, setSobrevoando] = useState(false);

  /*
   * Soltar imagem, GIF ou vídeo direto na prévia adiciona a fonte NO PONTO onde
   * o arquivo foi solto. É o caminho curto entre "tenho a arte aqui" e "está na
   * parede" — sem isso são quatro passos até o mesmo resultado.
   */
  const aoSoltar = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSobrevoando(false);
    if (!onSoltarArquivo) return;

    const arquivo = e.dataTransfer.files?.[0];
    if (!arquivo) return;

    const caixa = e.currentTarget.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;
    const x = ((e.clientX - caixa.left) / caixa.width) * 100;
    const y = ((e.clientY - caixa.top) / caixa.height) * 100;

    await onSoltarArquivo(arquivo, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  };

  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-widest mb-1.5 ${cor}`}>{rotulo}</p>
      <div
        className={`relative rounded-md overflow-hidden border-2 bg-[#0a0f13] ${
          sobrevoando ? 'border-sky-400' : borda
        }`}
        style={{ aspectRatio: '16 / 9' }}
        onDragOver={onSoltarArquivo ? e => {
          // Sem o `preventDefault` o navegador ABRE o arquivo numa aba nova, e
          // a mesa some da frente da pessoa.
          e.preventDefault();
          setSobrevoando(true);
        } : undefined}
        onDragLeave={onSoltarArquivo ? () => setSobrevoando(false) : undefined}
        onDrop={onSoltarArquivo ? e => { void aoSoltar(e); } : undefined}
      >
        <Palco
          fontes={fontes}
          selecionadaId={selecionadaId}
          onSelecionar={onSelecionar}
          onMoverFonte={arrastavel ? onMover : undefined}
          aviso={fontes.length === 0 ? vazio : null}
        />

        {(sobrevoando || enviando) && (
          <div className="absolute inset-0 grid place-items-center bg-sky-500/20 pointer-events-none">
            <span className="rounded-full bg-background/90 px-4 py-2 text-sm font-semibold">
              {enviando ? 'Enviando…' : 'Solte para adicionar aqui'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function rotuloDaFonte(f: Fonte): string {
  switch (f.tipo) {
    case 'texto':   return `Texto — "${texto(f.config, 'texto', '')}"`.slice(0, 34);
    case 'imagem':  return 'Imagem';
    case 'ranking': return `Ranking — ${texto(f.config, 'titulo', '')}`.slice(0, 34);
    case 'meta':    return `Meta — ${texto(f.config, 'titulo', '')}`.slice(0, 34);
    default:        return f.tipo;
  }
}

// ── Inspetor ─────────────────────────────────────────────────────────────────

function Inspetor({
  fonte, onMudar, onRemover, onCamada, podeEnviarMidia, onEnviarImagem, enviando, midias,
}: {
  fonte: Fonte;
  onMudar: (m: Partial<Fonte>) => void;
  onRemover: () => void;
  onCamada: (d: 'frente' | 'tras') => void;
  podeEnviarMidia: boolean;
  onEnviarImagem: (a: File) => Promise<{ url: string; tipo: 'imagem' | 'video' } | null>;
  enviando: boolean;
  midias: Midia[];
}) {
  const mudarConfig = (chave: string, valor: unknown) =>
    onMudar({ config: { ...fonte.config, [chave]: valor } });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {rotuloDaFonte(fonte)}
      </p>

      {fonte.tipo === 'texto' && (
        <>
          <Campo label="Texto">
            <Input
              value={texto(fonte.config, 'texto', '')}
              onChange={e => mudarConfig('texto', e.target.value)}
              className="h-8"
            />
          </Campo>
          <Campo label={`Tamanho — ${numero(fonte.config, 'tamanho', 72)}`}>
            <Slider
              min={24} max={220} step={4}
              value={[numero(fonte.config, 'tamanho', 72)]}
              onValueChange={([v]) => mudarConfig('tamanho', v)}
            />
          </Campo>
          <Campo label="Cor">
            <input
              type="color"
              value={texto(fonte.config, 'cor', '#ffffff')}
              onChange={e => mudarConfig('cor', e.target.value)}
              className="h-8 w-full rounded border bg-transparent"
            />
          </Campo>
        </>
      )}

      {(fonte.tipo === 'imagem' || fonte.tipo === 'video') && (
        <>
          {podeEnviarMidia && (
            <Campo label="Enviar do computador">
              <Input
                type="file"
                accept={fonte.tipo === 'video' ? 'video/*' : 'image/*'}
                disabled={enviando}
                className="h-8 text-xs file:text-xs"
                onChange={async e => {
                  const arquivo = e.target.files?.[0];
                  if (!arquivo) return;
                  const enviado = await onEnviarImagem(arquivo);
                  if (enviado) mudarConfig('url', enviado.url);
                  // Limpa o campo para o mesmo arquivo poder ser reenviado.
                  e.target.value = '';
                }}
              />
            </Campo>
          )}

          {/* Biblioteca: o que já foi enviado é reaproveitável em outra cena. */}
          {midias.filter(m => m.tipo === (fonte.tipo === 'video' ? 'video' : 'imagem')).length > 0 && (
            <Campo label="Ou da biblioteca">
              <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
                {midias
                  .filter(m => m.tipo === (fonte.tipo === 'video' ? 'video' : 'imagem'))
                  .map(m => (
                    <button
                      key={m.id}
                      onClick={() => mudarConfig('url', m.url)}
                      title={m.nome}
                      className={`aspect-square rounded border overflow-hidden ${
                        texto(fonte.config, 'url', '') === m.url
                          ? 'ring-2 ring-primary' : 'hover:opacity-80'
                      }`}
                    >
                      {m.tipo === 'video'
                        ? <span className="text-[10px] px-1">vídeo</span>
                        : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                    </button>
                  ))}
              </div>
            </Campo>
          )}

          <Campo label="Ou o endereço">
            <Input
              value={texto(fonte.config, 'url', '')}
              onChange={e => mudarConfig('url', e.target.value)}
              placeholder="https://…"
              className="h-8"
            />
          </Campo>
        </>
      )}

      {/* Mesa de som — só para fonte que tem áudio. */}
      {fonte.tipo === 'video' && (
        <>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Com som</Label>
            <Switch
              checked={fonte.mudo === false}
              onCheckedChange={v => onMudar({ mudo: !v })}
            />
          </div>
          {fonte.mudo === false && (
            <Campo label={`Volume — ${Math.round((fonte.volume ?? 1) * 100)}%`}>
              <Slider min={0} max={1} step={0.05}
                      value={[fonte.volume ?? 1]}
                      onValueChange={([v]) => onMudar({ volume: v })} />
            </Campo>
          )}
          {fonte.mudo === false && (
            <p className="text-[11px] text-muted-foreground">
              No PC da TV o som só sai depois de alguém destravar uma vez, ou com a
              flag <code className="font-mono">--autoplay-policy=no-user-gesture-required</code> no
              atalho do Chrome.
            </p>
          )}
        </>
      )}

      {fonte.tipo === 'ranking' && (
        <>
          <Campo label="Título">
            <Input
              value={texto(fonte.config, 'titulo', '')}
              onChange={e => mudarConfig('titulo', e.target.value)}
              className="h-8"
            />
          </Campo>
          <Campo label={`Quantas pessoas — ${numero(fonte.config, 'quantidade', 5)}`}>
            <Slider
              min={3} max={12} step={1}
              value={[numero(fonte.config, 'quantidade', 5)]}
              onValueChange={([v]) => mudarConfig('quantidade', v)}
            />
          </Campo>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Mostrar valor</Label>
            <Switch
              checked={ligado(fonte.config, 'mostrar_valor', true)}
              onCheckedChange={v => mudarConfig('mostrar_valor', v)}
            />
          </div>
        </>
      )}

      {fonte.tipo === 'meta' && (
        <Campo label="Título">
          <Input
            value={texto(fonte.config, 'titulo', '')}
            onChange={e => mudarConfig('titulo', e.target.value)}
            className="h-8"
          />
        </Campo>
      )}

      {fonte.tipo === 'fundo' && (
        <>
          <Campo label="Cor">
            <input type="color" value={texto(fonte.config, 'cor', '#0d1b24')}
                   onChange={e => mudarConfig('cor', e.target.value)}
                   className="h-8 w-full rounded border bg-transparent" />
          </Campo>
          <Campo label="Segunda cor (degradê)">
            <div className="flex gap-1">
              <input type="color" value={texto(fonte.config, 'cor_2', '#08323d')}
                     onChange={e => mudarConfig('cor_2', e.target.value)}
                     className="h-8 flex-1 rounded border bg-transparent" />
              {/* Sem segunda cor o fundo vira sólido — é assim que se desliga o degradê. */}
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs"
                      onClick={() => mudarConfig('cor_2', '')}>
                Sólido
              </Button>
            </div>
          </Campo>
        </>
      )}

      {fonte.tipo === 'relogio' && (
        <>
          <Campo label={`Tamanho — ${numero(fonte.config, 'tamanho', 120)}`}>
            <Slider min={48} max={320} step={8}
                    value={[numero(fonte.config, 'tamanho', 120)]}
                    onValueChange={([v]) => mudarConfig('tamanho', v)} />
          </Campo>
          <Campo label="Cor">
            <input type="color" value={texto(fonte.config, 'cor', '#ffffff')}
                   onChange={e => mudarConfig('cor', e.target.value)}
                   className="h-8 w-full rounded border bg-transparent" />
          </Campo>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Mostrar segundos</Label>
            <Switch checked={ligado(fonte.config, 'segundos', false)}
                    onCheckedChange={v => mudarConfig('segundos', v)} />
          </div>
        </>
      )}

      {/* Enquadramento — igual para todo tipo de fonte, menos o fundo, que
          cobre o palco inteiro e não tem o que enquadrar. */}
      {fonte.tipo !== 'fundo' && (
        <>
          <Campo label={`Largura — ${fonte.largura}%`}>
            <Slider
              min={5} max={100} step={1}
              value={[fonte.largura]}
              onValueChange={([v]) => onMudar({ largura: v })}
            />
          </Campo>
          <Campo label={`Escala — ${fonte.escala.toFixed(2)}×`}>
            <Slider
              min={0.2} max={3} step={0.05}
              value={[fonte.escala]}
              onValueChange={([v]) => onMudar({ escala: v })}
            />
          </Campo>
        </>
      )}

      <div className="flex items-center gap-1 pt-1">
        <Button variant="secondary" size="sm" className="h-8 px-2 flex-1"
                onClick={() => onCamada('tras')} title="Mandar para trás">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="sm" className="h-8 px-2 flex-1"
                onClick={() => onCamada('frente')} title="Trazer para a frente">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary" size="sm" className="h-8 px-2 flex-1"
          onClick={() => onMudar({ visivel: fonte.visivel === false })}
          title={fonte.visivel === false ? 'Mostrar' : 'Esconder'}
        >
          {fonte.visivel === false
            ? <EyeOff className="h-3.5 w-3.5" />
            : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {fonte.tipo !== 'fundo' && (
        <p className="text-[11px] text-muted-foreground">
          Arraste a fonte na prévia para posicionar. Ela encaixa sozinha no meio
          e nos terços.
        </p>
      )}

      <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive"
              onClick={onRemover}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover fonte
      </Button>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
