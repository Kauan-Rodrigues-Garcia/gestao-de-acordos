/**
 * Campanhas de WhatsApp — a aba do operador (07/10/2026, migration 20261007150000).
 *
 * O líder libera a campanha na Campanha Fácil; a parte de cada operador chega
 * aqui, uma mensagem por contato. O operador envia direto pelo WhatsApp (Web ou
 * o app do computador), pode editar a mensagem de um contato só, e fica
 * registrado o que já saiu e o que não deu para enviar.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Check, CheckCircle2, Clock, Copy, Inbox, Loader2, Monitor, Pencil, RotateCcw, Search, Send, Undo2, X, XCircle,
  Globe, History, Layers, Repeat, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { EnvioResumo } from '@/pages/CampanhaFacil/campanhaFacilEnvios.service';
import { useCampanhasWhatsapp } from './useCampanhasWhatsapp';
import { DialogoMesmaAba, DialogoTrocarApp } from './AjudaWhatsapp';
import { HistoricoOperador } from './HistoricoOperador';
import {
  filtrar, proximoPendente, telefoneLegivel, textoDoContato,
  type Contato, type Filtro, type ModoAbrir,
} from './whatsapp';

const POR_PAGINA = 60;

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Nome de cliente em caixa alta vira «Maria da Silva». */
function nomeBonito(nome: string): string {
  const minusc = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return nome.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && minusc.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

export default function CampanhasWhatsapp() {
  const w = useCampanhasWhatsapp();
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [editando, setEditando] = useState<Contato | null>(null);
  const [ajuda, setAjuda] = useState<'mesma-aba' | 'trocar-app' | null>(null);
  const [aba, setAba] = useState<'enviar' | 'historico'>('enviar');
  const lotesAtuais = useMemo(() => new Set(w.campanhas.map((c) => c.lote_id)), [w.campanhas]);

  // Outra campanha ou outro filtro: volta ao começo da lista.
  useEffect(() => { setLimite(POR_PAGINA); }, [w.selecionada?.id, filtro, busca]);

  const lista = useMemo(() => filtrar(w.contatos, filtro, busca), [w.contatos, filtro, busca]);
  const proximo = useMemo(() => proximoPendente(w.contatos), [w.contatos]);
  const { contagem } = w;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campanhas de WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            As campanhas que o líder liberou para você. Enviar abre a conversa com a mensagem pronta; Copiar serve para
            enviar à mão. As duas contam como enviada.
          </p>
        </div>
        {aba === 'enviar' && (
        <div className="flex flex-col items-end gap-1.5">
          <SeletorModo modo={w.modo} onChange={w.setModo} />
          {w.modo === 'web' ? (
            <button
              type="button" onClick={() => setAjuda('mesma-aba')}
              className={cn(
                'inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline',
                w.mesmaAba ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {w.mesmaAba
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Sempre na mesma aba</>
                : <><Layers className="h-3.5 w-3.5" /> Abre uma aba nova a cada envio? Resolver</>}
            </button>
          ) : (
            <button
              type="button" onClick={() => setAjuda('trocar-app')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <Repeat className="h-3.5 w-3.5" /> Escolher ou trocar o aplicativo
            </button>
          )}
        </div>
        )}
      </header>

      <div role="tablist" aria-label="Campanhas" className="flex gap-1 border-b border-border">
        {([
          ['enviar', 'Para enviar', <Send key="i" className="h-4 w-4" />],
          ['historico', 'Meu histórico', <History key="i" className="h-4 w-4" />],
        ] as const).map(([v, rotulo, icone]) => (
          <button
            key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              aba === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {icone}{rotulo}
            {v === 'enviar' && w.campanhas.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-xs tabular-nums text-primary">{w.campanhas.length}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'historico' ? (
        <HistoricoOperador
          votosAtuais={w.avaliacoes}
          lotesAtuais={lotesAtuais}
          onAbrir={(loteId) => {
            const c = w.campanhas.find((x) => x.lote_id === loteId);
            if (!c) return false;
            w.selecionar(c.id);
            setAba('enviar');
            return true;
          }}
        />
      ) : w.carregando ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas campanhas…
        </div>
      ) : w.campanhas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="rounded-full bg-muted p-4"><Inbox className="h-7 w-7 text-muted-foreground" /></div>
            <div>
              <p className="font-semibold">Nenhuma campanha no momento</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Quando o líder liberar uma campanha para você, ela aparece aqui e você recebe uma notificação.
                As que já passaram ficam em «Meu histórico».
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ── As campanhas ── */}
          <nav aria-label="Campanhas" className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {w.campanhas.length} {w.campanhas.length === 1 ? 'campanha' : 'campanhas'}
            </p>
            {w.campanhas.map((c) => (
              <CartaoCampanha
                key={c.id} c={c} ativa={c.id === w.selecionada?.id} onClick={() => w.selecionar(c.id)}
                voto={w.avaliacoes.get(c.lote_id)}
              />
            ))}
          </nav>

          {/* ── A campanha aberta ── */}
          {w.selecionada && (
            <section className="min-w-0 space-y-4">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold" title={w.selecionada.titulo}>{w.selecionada.titulo}</h2>
                      <p className="text-xs text-muted-foreground">
                        {w.selecionada.criado_por_nome ? `Liberada por ${w.selecionada.criado_por_nome} · ` : ''}
                        {quando(w.selecionada.criado_em)} · disponível até {quando(w.selecionada.expira_em)}
                        {w.selecionada.repasse && ' · repasse de quem faltou'}
                      </p>
                    </div>
                    <Button
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={!proximo}
                      onClick={() => { if (proximo) w.enviar(proximo); }}
                      title={proximo ? `Abrir a conversa com ${nomeBonito(proximo.nome)}` : undefined}
                    >
                      <Send className="h-4 w-4" />
                      {proximo ? 'Enviar a próxima' : contagem.pendentes > 0 ? 'Pendentes sem número' : 'Tudo enviado'}
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>
                        <strong className="tabular-nums">{contagem.enviados.toLocaleString('pt-BR')}</strong>
                        <span className="text-muted-foreground"> de {contagem.total.toLocaleString('pt-BR')} enviadas</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">{pct(contagem.enviados, contagem.total)}%</span>
                    </div>
                    <Progress value={pct(contagem.enviados, contagem.total)} className="h-2" />
                  </div>

                  <AvaliacaoCampanha
                    voto={w.avaliacoes.get(w.selecionada.lote_id)}
                    onVotar={(bom) => void w.avaliar(w.selecionada!.lote_id, bom)}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <div role="tablist" aria-label="Situação" className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
                      <Aba ativo={filtro === 'pendentes'} onClick={() => setFiltro('pendentes')} icone={<Clock className="h-3.5 w-3.5" />} rotulo="Pendentes" n={contagem.pendentes} />
                      <Aba ativo={filtro === 'enviados'} onClick={() => setFiltro('enviados')} icone={<CheckCircle2 className="h-3.5 w-3.5" />} rotulo="Enviadas" n={contagem.enviados} />
                      <Aba ativo={filtro === 'nao_enviados'} onClick={() => setFiltro('nao_enviados')} icone={<XCircle className="h-3.5 w-3.5" />} rotulo="Não enviadas" n={contagem.naoEnviados} />
                      <Aba ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} rotulo="Todas" n={contagem.total} />
                    </div>
                    <div className="relative ml-auto w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={busca} onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar nome, contrato ou número" aria-label="Buscar contato"
                        className="h-9 pl-8 text-sm"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {w.carregandoContatos ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando mensagens…
                </div>
              ) : lista.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {busca.trim() ? 'Nenhum contato encontrado.'
                    : filtro === 'pendentes' ? 'Nenhuma mensagem pendente. Bom trabalho!'
                    : filtro === 'enviados' ? 'Nenhuma mensagem enviada ainda.'
                    : filtro === 'nao_enviados' ? 'Nenhuma mensagem marcada como não enviada.'
                    : 'Esta campanha está vazia.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {lista.slice(0, limite).map((c) => (
                    <LinhaContato
                      key={c.id} c={c} proximo={c.id === proximo?.id}
                      onEnviar={() => w.enviar(c)}
                      onEnviar2={() => w.enviar(c, 2)}
                      onCopiar={() => void w.copiar(c)}
                      onEditar={() => setEditando(c)}
                      onNaoDeu={() => void w.marcar(c, 'nao_enviado')}
                      onVoltar={() => void w.marcar(c, 'pendente')}
                    />
                  ))}
                  {lista.length > limite && (
                    <li className="pt-2 text-center">
                      <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                        Mostrar mais ({(lista.length - limite).toLocaleString('pt-BR')} restantes)
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {editando && (
        <DialogoEditar
          c={editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (texto) => { await w.salvarMensagem(editando, texto); setEditando(null); }}
          onCopiou={() => w.marcarEnviada(editando)}
        />
      )}
      {ajuda === 'mesma-aba' && <DialogoMesmaAba instalado={w.mesmaAba} onFechar={() => setAjuda(null)} />}
      {ajuda === 'trocar-app' && <DialogoTrocarApp onFechar={() => setAjuda(null)} />}
    </div>
  );
}

function SeletorModo({ modo, onChange }: { modo: ModoAbrir; onChange: (m: ModoAbrir) => void }) {
  const opcoes: { v: ModoAbrir; rotulo: string; icone: JSX.Element }[] = [
    { v: 'web', rotulo: 'WhatsApp Web', icone: <Globe className="h-3.5 w-3.5" /> },
    { v: 'app', rotulo: 'App do computador', icone: <Monitor className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Abrir no</span>
      <div role="radiogroup" aria-label="Onde abrir o WhatsApp" className="flex rounded-lg border border-border p-0.5">
        {opcoes.map((o) => (
          <button
            key={o.v} type="button" role="radio" aria-checked={modo === o.v} onClick={() => onChange(o.v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              modo === o.v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icone} {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * «Joinha verde: a campanha teve bom retorno. Mãozinha vermelha: não teve.»
 * Clicar no que já está marcado tira o voto. O líder vê só a contagem.
 */
function AvaliacaoCampanha({ voto, onVotar }: { voto: boolean | undefined; onVotar: (bom: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-sm">
        <span className="font-medium">Como foi o retorno desta campanha?</span>
        <span className="block text-xs text-muted-foreground">
          {voto === undefined ? 'Sua avaliação vai para o líder.' : 'Avaliação enviada ao líder. Pode trocar quando quiser.'}
        </span>
      </p>
      <div className="ml-auto flex gap-2" role="group" aria-label="Avaliar o retorno da campanha">
        <Button
          type="button" variant="outline" size="sm" aria-pressed={voto === true} onClick={() => onVotar(true)}
          className={cn(
            'h-9 gap-1.5',
            voto === true
              ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white'
              : 'text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400',
          )}
        >
          <ThumbsUp className="h-4 w-4" /> Bom retorno
        </Button>
        <Button
          type="button" variant="outline" size="sm" aria-pressed={voto === false} onClick={() => onVotar(false)}
          className={cn(
            'h-9 gap-1.5',
            voto === false
              ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white'
              : 'text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400',
          )}
        >
          <ThumbsDown className="h-4 w-4" /> Sem retorno
        </Button>
      </div>
    </div>
  );
}

function CartaoCampanha({ c, ativa, onClick, voto }: {
  c: EnvioResumo; ativa: boolean; onClick: () => void; voto: boolean | undefined;
}) {
  const total = c.progresso.total || c.qtd;
  const feito = c.progresso.enviados;
  const completa = total > 0 && feito >= total;
  return (
    <button
      type="button" onClick={onClick} aria-current={ativa ? 'true' : undefined}
      className={cn(
        'w-full space-y-2.5 rounded-xl border p-3.5 text-left transition-colors',
        ativa ? 'border-primary/60 bg-primary/5 shadow-sm' : 'border-border bg-card hover:bg-accent/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{c.titulo}</p>
        {completa && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Concluída" />}
      </div>
      <Progress value={pct(feito, total)} className="h-1.5" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {feito.toLocaleString('pt-BR')}/{total.toLocaleString('pt-BR')} enviadas
          {voto === true && <ThumbsUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-label="Você avaliou: bom retorno" />}
          {voto === false && <ThumbsDown className="h-3 w-3 text-red-600 dark:text-red-400" aria-label="Você avaliou: sem retorno" />}
        </span>
        <span>{quando(c.criado_em)}</span>
      </div>
    </button>
  );
}

function Aba({ ativo, onClick, rotulo, n, icone }: {
  ativo: boolean; onClick: () => void; rotulo: string; n: number; icone?: JSX.Element;
}) {
  return (
    <button
      type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
        ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icone}{rotulo}
      <span className={cn('rounded px-1 tabular-nums', ativo ? 'bg-muted' : '')}>{n.toLocaleString('pt-BR')}</span>
    </button>
  );
}

function LinhaContato({ c, proximo, onEnviar, onEnviar2, onCopiar, onEditar, onNaoDeu, onVoltar }: {
  c: Contato; proximo: boolean;
  onEnviar: () => void; onEnviar2: () => void; onCopiar: () => void;
  onEditar: () => void; onNaoDeu: () => void; onVoltar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const texto = textoDoContato(c);
  const fone = telefoneLegivel(c.whatsapp, c.telefone);
  const fone2 = telefoneLegivel(c.whatsapp2, c.telefone2);
  const enviado = c.status === 'enviado';
  const naoDeu = c.status === 'nao_enviado';

  return (
    <li
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        proximo ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-border',
        enviado && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{nomeBonito(c.nome) || 'Sem nome'}</p>
            {enviado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Enviada{c.enviado_em ? ` ${quando(c.enviado_em)}` : ''}
              </span>
            )}
            {naoDeu && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <XCircle className="h-3 w-3" /> Não deu para enviar
              </span>
            )}
            {c.mensagem_editada !== null && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Mensagem editada</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Campo rotulo="Contrato (NR)" valor={c.contrato} />
            <Campo rotulo="Empresa" valor={c.empresa_cliente} />
            <Campo rotulo="WhatsApp" valor={fone} />
            <Campo rotulo="Fone 2" valor={fone2} />
          </dl>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {naoDeu ? (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onVoltar} title="Voltar para pendente">
              <Undo2 className="h-3.5 w-3.5" /> Desfazer
            </Button>
          ) : !enviado && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={onNaoDeu}>
              <X className="h-3.5 w-3.5" /> Não deu
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button
            variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onCopiar}
            title="Copiar a mensagem para enviar à mão. Conta como enviada."
          >
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
          {c.whatsapp2 && (
            <Button
              variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEnviar2}
              title={`Abrir a conversa no Fone 2 (${fone2})`}
            >
              <Send className="h-3.5 w-3.5" /> Fone 2
            </Button>
          )}
          <Button
            size="sm"
            className={cn('h-8 gap-1.5 text-xs', !enviado && 'bg-emerald-600 text-white hover:bg-emerald-700')}
            variant={enviado ? 'outline' : 'default'}
            disabled={!c.whatsapp}
            title={c.whatsapp ? undefined : 'Sem número de WhatsApp válido'}
            onClick={onEnviar}
          >
            <Send className="h-3.5 w-3.5" /> {enviado ? 'Enviar de novo' : 'Enviar'}
          </Button>
        </div>
      </div>

      {/* Só dá para copiar pelo botão Copiar: copiar conta como enviada. */}
      <button
        type="button" onClick={() => setAberta((a) => !a)}
        onCopy={(e) => e.preventDefault()}
        className="mt-3 block w-full select-none rounded-lg bg-muted/40 px-3 py-2.5 text-left text-sm leading-relaxed text-foreground/90 hover:bg-muted/60"
        aria-expanded={aberta}
      >
        <span className={cn('whitespace-pre-wrap', !aberta && 'line-clamp-2')}>{texto || 'Mensagem vazia'}</span>
      </button>
    </li>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="truncate tabular-nums">{valor?.trim() || '—'}</dd>
    </div>
  );
}

function DialogoEditar({ c, onFechar, onSalvar, onCopiou }: {
  c: Contato; onFechar: () => void; onSalvar: (texto: string | null) => Promise<void>;
  /** Copiou o texto da caixa: conta como enviada, igual ao botão Copiar. */
  onCopiou: () => void;
}) {
  const [texto, setTexto] = useState(textoDoContato(c));
  const [salvando, setSalvando] = useState(false);
  const mudou = texto !== textoDoContato(c);

  async function salvar(valor: string | null) {
    setSalvando(true);
    try { await onSalvar(valor); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar mensagem</DialogTitle>
          <DialogDescription>
            Só para {nomeBonito(c.nome) || 'este contato'}. As outras mensagens da campanha não mudam.
            Copiar o texto daqui conta como enviada.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onCopy={onCopiou} onCut={onCopiou}
          rows={9} className="resize-y text-sm leading-relaxed" autoFocus
        />
        <DialogFooter className="gap-2 sm:justify-between">
          {c.mensagem_editada !== null ? (
            <Button variant="ghost" className="gap-1.5" disabled={salvando} onClick={() => void salvar(null)}>
              <RotateCcw className="h-4 w-4" /> Voltar à original
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button disabled={salvando || !mudou || !texto.trim()} onClick={() => void salvar(texto)}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
