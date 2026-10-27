/**
 * PontosDeAtencao — quem está ativo e não abre o Gestão há dias.
 *
 * Pedido do Cleber (27/10/2026): o líder vê quem merece atenção e classifica —
 * afastamento (atestado, férias, licença…), desligamento, ou «ignorar», que só
 * zera a contagem. A lista vem pronta do banco (`fn_uso_pontos_de_atencao`),
 * já recortada pelo alcance da aba Usuários.
 *
 * A frase diz o dado, não acusa: «6 dias úteis sem entrar · último acesso
 * 20/10». O rodapé explica o que NÃO conta, para ninguém ler o número como
 * falta.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  buscarPontosDeAtencao, ignorarPontoDeAtencao, type PontoDeAtencao,
} from '@/services/afastamentos.service';
import { rotuloDoUltimoUso } from './afastamento';
import type { PessoaParaAfastar } from './DialogAfastamento';

interface Props {
  /** As empresas da tela — a lista da cobrança junta BookPlay e PaguePlay. */
  empresaIds: readonly string[];
  /** Mostra as ações. Sem a chave, a lista é só leitura. */
  podeAgir: boolean;
  /** Muda quando a tela recarrega (afastou, desligou): a lista relê. */
  versao: number;
  onAfastar: (p: PessoaParaAfastar) => void;
  onDesligar: (operadorId: string) => Promise<void>;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function PontosDeAtencao({ empresaIds, podeAgir, versao, onAfastar, onDesligar }: Props) {
  const chaveEmpresas = empresaIds.join(',');
  const [pontos, setPontos] = useState<PontoDeAtencao[] | null>(null);
  const [disponivel, setDisponivel] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [ignorando, setIgnorando] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [desligando, setDesligando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [releitura, setReleitura] = useState(0);

  useEffect(() => {
    const ids = chaveEmpresas ? chaveEmpresas.split(',') : [];
    if (ids.length === 0) return;
    let vivo = true;
    void Promise.all(ids.map(buscarPontosDeAtencao)).then(rs => {
      if (!vivo) return;
      setDisponivel(rs.every(r => r.disponivel));
      setPontos(rs.flatMap(r => r.pontos).sort((a, b) => b.dias_sem_uso - a.dias_sem_uso || a.nome.localeCompare(b.nome)));
      const erro = rs.find(r => r.erro && r.disponivel)?.erro;
      if (erro) toast.error(erro);
    });
    return () => { vivo = false; };
  }, [chaveEmpresas, versao, releitura]);

  // Sem a migration, a faixa não existe — e não grita.
  if (empresaIds.length === 0 || !disponivel || pontos === null) return null;

  if (pontos.length === 0) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-2.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        Todos os operadores ativos do seu alcance abriram o Gestão nos últimos dias úteis.
      </div>
    );
  }

  async function confirmarIgnorar(p: PontoDeAtencao) {
    if (!comentario.trim()) return;
    setOcupado(p.operador_id);
    try {
      const r = await ignorarPontoDeAtencao(p.empresa_id, p.operador_id, comentario.trim());
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível ignorar.'); return; }
      toast.success(`${p.nome}: contagem zerada. Volta a avisar se ficar mais ${p.limite} dias úteis sem entrar.`);
      setPontos(x => (x ?? []).filter(y => y.operador_id !== p.operador_id));
      setIgnorando(null);
      setComentario('');
      setReleitura(n => n + 1);
    } finally { setOcupado(null); }
  }

  async function confirmarDesligar(p: PontoDeAtencao) {
    setOcupado(p.operador_id);
    try {
      await onDesligar(p.operador_id);
      setDesligando(null);
    } finally { setOcupado(null); }
  }

  const n = pontos.length;

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-warning/40 bg-warning/5" aria-label="Pontos de atenção de uso">
      <button
        type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-warning/10"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {n} {n === 1 ? 'operador merece' : 'operadores merecem'} atenção no uso do Gestão
          </p>
          <p className="text-xs text-muted-foreground">
            Ativos e há 4 dias úteis ou mais sem abrir o sistema (menor aprendiz: 5). Classifique ou ignore.
          </p>
        </div>
        <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold tabular-nums text-warning-foreground">{n}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="border-t border-warning/30 bg-background/60">
          <ul className="divide-y divide-border">
            {pontos.map(p => (
              <li key={p.operador_id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {p.foto_url
                    ? <img src={p.foto_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{iniciais(p.nome)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {p.nome}
                      {p.menor_aprendiz && (
                        <span className="rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground">aprendiz</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.setor_nome, p.equipe_nome].filter(Boolean).join(' · ') || 'Sem setor'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-warning">
                      {p.dias_sem_uso} {p.dias_sem_uso === 1 ? 'dia útil' : 'dias úteis'} sem entrar
                    </p>
                    <p className="text-xs text-muted-foreground">{rotuloDoUltimoUso(p.ultimo_uso)}</p>
                  </div>
                </div>

                {p.ignorado_em && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <MessageSquare className="mt-px h-3 w-3 shrink-0" />
                    Ignorado em {dataCurta(p.ignorado_em)}{p.ignorado_por_nome ? ` por ${p.ignorado_por_nome}` : ''}: «{p.ignorado_comentario}»
                  </p>
                )}

                {podeAgir && ignorando !== p.operador_id && desligando !== p.operador_id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAfastar({ id: p.operador_id, nome: p.nome, empresaId: p.empresa_id })}>
                      Afastar…
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setIgnorando(p.operador_id); setComentario(''); }}>
                      Ignorar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDesligando(p.operador_id)}>
                      Desligar
                    </Button>
                  </div>
                )}

                {ignorando === p.operador_id && (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      rows={2} maxLength={500} autoFocus value={comentario}
                      placeholder="Comentário curto (ex.: conversei, vai voltar a usar)"
                      onChange={e => setComentario(e.target.value)}
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" disabled={!comentario.trim() || ocupado === p.operador_id}
                        onClick={() => void confirmarIgnorar(p)}>
                        {ocupado === p.operador_id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Ignorar e zerar a contagem
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIgnorando(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {desligando === p.operador_id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs">
                    <span className="mr-auto">Desligar {p.nome}? Perde o acesso e os acordos ficam livres para retabulação.</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={ocupado === p.operador_id}
                      onClick={() => void confirmarDesligar(p)}>
                      {ocupado === p.operador_id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Confirmar desligamento
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDesligando(null)}>Cancelar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Conta só dias úteis já terminados (hoje não entra). Não contam: fim de semana, feriado,
            dias com afastamento lançado, dias antes de a conta existir e dias em que o registro de uso
            falhou para todo mundo. Uso = abrir o sistema, navegar, aparecer online ou fazer login.
          </p>
        </div>
      )}
    </section>
  );
}
