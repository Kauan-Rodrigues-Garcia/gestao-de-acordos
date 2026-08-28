/**
 * src/pages/AdminLogs/LogDetalhe.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O painel lateral de um evento: quem, quando, onde, o que mudou campo a campo,
 * e o histórico completo do mesmo registro.
 *
 * ## Por que painel lateral e não modal
 * A investigação é comparativa — abre-se um evento, olha-se a lista, abre-se o
 * seguinte. Um modal cobre a lista e obriga a fechar entre um e outro; o painel
 * lateral deixa as duas coisas visíveis, e trocar de evento é um clique na lista
 * que continua ali.
 *
 * ## O histórico do registro
 * A pergunta que sempre segue "quem mudou isto" é "e o que mais aconteceu com
 * isto". Por isso o painel carrega, sob demanda, todos os eventos com o mesmo
 * `registro_id` — a linha de vida daquele acordo, daquele usuário, daquela meta.
 */
import { useEffect, useState } from 'react';
import {
  Clock, User, Building2, Database, Globe, Monitor, Copy, Check,
  History, Loader2, Hash, Route,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import type { LogSistema } from '@/lib/supabase';
import {
  descreverAcao, montarDiferencas, origemLabel, alvoLabel, campoLabel,
  normalizarDescricao,
} from '@/lib/logs-catalogo';
import { fetchHistoricoRegistro } from '@/services/logs.service';
import { SeloCategoria, SeloSeveridade, AvatarAutor } from './comum';
import { iconeDaCategoria, dataHoraCompleta, tempoRelativo } from './formatos';
import { rotuloLocalizacaoIp, type LocalizacaoIp } from '@/services/ipLocalizacao.service';

interface Props {
  log: LogSistema | null;
  aberto: boolean;
  onFechar: () => void;
  /** Filtra a lista pelo campo clicado no diff ("quem mais mexeu em valor"). */
  onFiltrarCampo: (campo: string) => void;
  /** Filtra pelo autor deste evento. */
  onFiltrarAutor: (usuarioId: string) => void;
  localizacaoIp?: LocalizacaoIp;
}

export default function LogDetalhe({
  log, aberto, onFechar, onFiltrarCampo, onFiltrarAutor, localizacaoIp,
}: Props) {
  const [historico, setHistorico] = useState<LogSistema[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // O histórico fecha ao trocar de evento: manter aberto mostraria a linha de
  // vida do registro anterior sob o cabeçalho do novo.
  useEffect(() => {
    setHistoricoAberto(false);
    setHistorico([]);
    setCopiado(false);
  }, [log?.id]);

  async function abrirHistorico() {
    if (!log?.registro_id) return;
    setHistoricoAberto(true);
    if (historico.length > 0) return;
    setCarregandoHistorico(true);
    setHistorico(await fetchHistoricoRegistro(log.registro_id));
    setCarregandoHistorico(false);
  }

  async function copiarJson() {
    if (!log) return;
    const ok = await copiarTexto(
      JSON.stringify(log, null, 2),
      'Evento copiado como JSON',
      'Não foi possível copiar o evento.',
    );
    if (!ok) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  if (!log) return null;

  const Icone = iconeDaCategoria(log.categoria);
  const perfis = log.perfis as { nome?: string; email?: string; foto_url?: string } | undefined;
  const autor = log.usuario_nome ?? perfis?.nome ?? null;
  const email = log.usuario_email ?? perfis?.email ?? null;
  const diferencas = montarDiferencas(log.antes, log.depois, log.campos);
  const detalhes = log.detalhes ?? null;

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0"
        aria-describedby="log-detalhe-desc"
      >
        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <SheetHeader className="px-5 pt-5 pb-4 space-y-2 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <SeloCategoria categoria={log.categoria} />
            <SeloSeveridade severidade={log.severidade} />
            <span className="text-[10px] text-muted-foreground font-mono">{log.acao}</span>
          </div>
          <SheetTitle className="text-base leading-snug flex items-start gap-2">
            <Icone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <span>{normalizarDescricao(log.descricao) || descreverAcao(log.acao)}</span>
          </SheetTitle>
          <SheetDescription id="log-detalhe-desc" className="text-xs">
            {dataHoraCompleta(log.criado_em)} · {tempoRelativo(log.criado_em)}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Autor ───────────────────────────────────────────────────────── */}
          <section>
            <Rotulo>Quem fez</Rotulo>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <AvatarAutor nome={autor} foto={perfis?.foto_url} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {autor ?? 'Sistema (sem pessoa por trás)'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[log.usuario_cargo, email].filter(Boolean).join(' · ') || 'Rotina automática'}
                </p>
              </div>
              {log.usuario_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] shrink-0"
                  onClick={() => { onFiltrarAutor(log.usuario_id as string); onFechar(); }}
                >
                  Ver tudo desta pessoa
                </Button>
              )}
            </div>
            {/* Autor desligado: o nome sobrevive na linha, a junção não. Dizer
                isso evita a leitura errada de "log sem autor". */}
            {log.usuario_nome && !perfis?.nome && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                O perfil deste autor não existe mais no sistema — o nome ficou registrado no
                próprio evento.
              </p>
            )}
          </section>

          {/* ── O que mudou ─────────────────────────────────────────────────── */}
          {diferencas.length > 0 && (
            <section>
              <Rotulo>
                O que mudou
                <span className="ml-1.5 font-normal text-muted-foreground/70">
                  ({diferencas.length} campo{diferencas.length > 1 ? 's' : ''})
                </span>
              </Rotulo>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Campo
                      </th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Antes
                      </th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Depois
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {diferencas.map((d) => (
                      <tr key={d.campo} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-1.5 align-top">
                          <button
                            type="button"
                            onClick={() => { onFiltrarCampo(d.campo); onFechar(); }}
                            className="text-foreground hover:text-primary hover:underline text-left"
                            title={`Ver todos os eventos que mexeram em "${campoLabel(d.campo)}"`}
                          >
                            {d.label}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 align-top text-muted-foreground break-all">
                          {d.novo
                            ? <span className="text-muted-foreground/50 italic">vazio</span>
                            : d.antes}
                        </td>
                        <td className="px-3 py-1.5 align-top break-all">
                          <span className={cn(
                            'font-medium',
                            d.removido ? 'text-muted-foreground/50 italic' : 'text-foreground',
                          )}>
                            {d.removido ? 'removido' : d.depois}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Telefone e documento aparecem mascarados; texto longo é truncado. O registro guarda
                o que basta para auditar, não o dado pessoal inteiro.
              </p>
            </section>
          )}

          {/* ── Alvo e contexto ─────────────────────────────────────────────── */}
          <section>
            <Rotulo>Onde aconteceu</Rotulo>
            <dl className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {log.alvo_rotulo && (
                <Linha icone={Hash} termo="Alvo" valor={log.alvo_rotulo} />
              )}
              {log.alvo_tipo && (
                <Linha icone={Database} termo="Tipo" valor={alvoLabel(log.alvo_tipo)} />
              )}
              {log.tabela && (
                <Linha icone={Database} termo="Tabela" valor={log.tabela} mono />
              )}
              {log.registro_id && (
                <Linha icone={Hash} termo="Registro" valor={log.registro_id} mono />
              )}
              {log.empresas?.nome && (
                <Linha icone={Building2} termo="Empresa" valor={log.empresas.nome} />
              )}
              <Linha icone={Clock} termo="Data e hora" valor={dataHoraCompleta(log.criado_em)} />
              <Linha icone={User} termo="Origem" valor={origemLabel(log.origem)} />
              {log.rota && <Linha icone={Route} termo="Rota" valor={log.rota} mono />}
              {log.ip && <Linha icone={Globe} termo="IP" valor={log.ip} mono />}
              {rotuloLocalizacaoIp(localizacaoIp) && (
                <Linha
                  icone={Globe}
                  termo="Localização aproximada"
                  valor={rotuloLocalizacaoIp(localizacaoIp) as string}
                />
              )}
              {log.user_agent && (
                <Linha icone={Monitor} termo="Navegador" valor={log.user_agent} truncar />
              )}
            </dl>
          </section>

          {/* ── Detalhes extras ─────────────────────────────────────────────── */}
          {detalhes && Object.keys(detalhes).length > 0 && (
            <section>
              <Rotulo>Informações adicionais</Rotulo>
              <dl className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {Object.entries(detalhes).map(([chave, valor]) => (
                  <div key={chave} className="flex items-start gap-3 px-3 py-1.5">
                    <dt className="text-[11px] text-muted-foreground w-32 shrink-0">
                      {campoLabel(chave)}
                    </dt>
                    <dd className="text-[11px] text-foreground break-all flex-1">
                      {typeof valor === 'object' && valor !== null
                        ? JSON.stringify(valor)
                        : String(valor ?? '—')}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* ── Histórico do registro ───────────────────────────────────────── */}
          {log.registro_id && (
            <section>
              {!historicoAberto ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 gap-2 text-xs"
                  onClick={abrirHistorico}
                >
                  <History className="w-3.5 h-3.5" />
                  Ver tudo que já aconteceu com este registro
                </Button>
              ) : (
                <>
                  <Rotulo>Linha de vida deste registro</Rotulo>
                  {carregandoHistorico ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando histórico…
                    </div>
                  ) : historico.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Este é o único evento registrado para o registro.
                    </p>
                  ) : (
                    <ol className="relative border-l border-border ml-2 space-y-3 py-1">
                      {historico.map((h) => (
                        <li key={h.id} className="ml-4 relative">
                          <span
                            className={cn(
                              'absolute -left-[21px] top-1 w-2 h-2 rounded-full border-2 border-background',
                              h.id === log.id ? 'bg-primary' : 'bg-muted-foreground/40',
                            )}
                          />
                          <p className={cn(
                            'text-[11px] leading-snug',
                            h.id === log.id ? 'text-foreground font-medium' : 'text-muted-foreground',
                          )}>
                            {normalizarDescricao(h.descricao) || descreverAcao(h.acao)}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {dataHoraCompleta(h.criado_em)}
                            {h.usuario_nome && ` · ${h.usuario_nome}`}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────────── */}
        <Separator />
        <div className="px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/60 truncate" title={log.id}>
            {log.id}
          </span>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={copiarJson}>
            {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copiado ? 'Copiado' : 'Copiar JSON'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças
// ═══════════════════════════════════════════════════════════════════════════
function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
      {children}
    </h4>
  );
}

function Linha({
  icone: Icone, termo, valor, mono = false, truncar = false,
}: {
  icone: typeof Clock;
  termo: string;
  valor: string;
  mono?: boolean;
  truncar?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-1.5">
      <Icone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <dt className="text-[11px] text-muted-foreground w-24 shrink-0">{termo}</dt>
      <dd
        className={cn(
          'text-[11px] text-foreground flex-1 min-w-0',
          mono && 'font-mono',
          truncar ? 'truncate' : 'break-all',
        )}
        title={valor}
      >
        {valor}
      </dd>
    </div>
  );
}
