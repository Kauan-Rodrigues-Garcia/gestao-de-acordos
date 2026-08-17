/**
 * ListaUsuariosUso — a lista de pessoas do monitoramento de uso.
 *
 * Ordenada por TEMPO, do que mais usou para o que menos usou, com as duas
 * operações juntas para quem pode ver as duas. Mostra 10; o resto vem em
 * "ver mais". Busca por nome acima da lista. Clicar numa pessoa abre o detalhe.
 *
 * ## Por que 10, e por que "ver mais" em vez de rolagem infinita
 *
 * A pergunta que a lista responde é "quem está usando mais" — e ela se responde
 * no topo. Os 10 primeiros cabem sem rolar; quem precisa do resto pede. Rolagem
 * infinita transformaria a resposta num varredor.
 *
 * ## A busca filtra o que já veio
 *
 * Não refaz consulta. A agregação já chega inteira do banco (uma linha por
 * pessoa, não por evento), então filtrar em memória é instantâneo e não gasta
 * ida ao servidor por tecla digitada. A busca também ignora acento, porque
 * "sirlei" tem que achar "Sirlei" e "jose" tem que achar "José".
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronDown, Clock, MousePointerClick, CalendarDays,
  Monitor, X, Loader2, Building2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { PERFIL_LABELS } from '@/lib/index';
import { rotuloDaTela } from '@/lib/telas-catalogo';
import {
  buscarDetalhePessoa,
  type UsoPorPessoa, type UsoDetalheTela, type UsoDetalheDia,
} from '@/services/uso.service';
import { numeroBr, tempoRelativo, iniciais, formatarDuracao } from './formatos';

/** Quantas pessoas antes do "ver mais". */
const PAGINA = 10;

/**
 * Texto comparável: sem acento, sem caixa.
 *
 * `NFD` separa a letra do acento e o `replace` joga os acentos fora — assim
 * "jose" acha "José". Sem isso, buscar por nome digitado sem acento não acharia
 * metade das pessoas.
 */
function comparavel(s: string): string {
  // `\p{Diacritic}` em vez da faixa de caracteres combinantes: a faixa é escrita
  // com caracteres invisíveis no editor, que um copiar-colar entre ferramentas
  // corrompe sem deixar rastro. A propriedade Unicode diz a mesma coisa e é
  // legível.
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

interface Props {
  pessoas: UsoPorPessoa[];
  /** Mostrar a coluna de empresa (só faz sentido vendo mais de uma). */
  mostrarEmpresa: boolean;
  desde: string;
  ate: string;
  carregando: boolean;
}

export default function ListaUsuariosUso({
  pessoas, mostrarEmpresa, desde, ate, carregando,
}: Props) {
  const [busca, setBusca]     = useState('');
  const [limite, setLimite]   = useState(PAGINA);
  const [aberta, setAberta]   = useState<UsoPorPessoa | null>(null);

  const filtradas = useMemo(() => {
    const q = comparavel(busca.trim());
    if (!q) return pessoas;
    return pessoas.filter(p => comparavel(p.nome).includes(q));
  }, [pessoas, busca]);

  // Buscar reinicia a paginação: manter "ver mais" de uma lista anterior
  // esconderia resultados da busca nova.
  useEffect(() => { setLimite(PAGINA); }, [busca]);

  const visiveis = filtradas.slice(0, limite);
  const restantes = filtradas.length - visiveis.length;
  const maxSegundos = Math.max(...pessoas.map(p => Number(p.segundos)), 1);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pessoas por tempo de uso
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Do que mais usou para o que menos usou · clique para ver o detalhe
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar pessoa…"
            className="h-8 w-52 pl-8 pr-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {!carregando && filtradas.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {busca
            ? `Ninguém com "${busca}" no nome usou a planilha neste período.`
            : 'Nenhum uso registrado neste período.'}
        </p>
      )}

      {!carregando && filtradas.length > 0 && (
        <>
          <div className="divide-y divide-border/60">
            {visiveis.map((p, i) => {
              const seg = Number(p.segundos);
              return (
                <button
                  key={`${p.usuario_id}-${p.empresa_id}`}
                  type="button"
                  onClick={() => setAberta(p)}
                  className="w-full text-left flex items-center gap-3 py-2.5 px-1 hover:bg-muted/40 rounded-md transition-colors"
                >
                  <span className="text-[11px] font-bold text-muted-foreground w-5 text-right shrink-0 tabular-nums">
                    {/* A posição é da lista COMPLETA quando não há busca; com
                        busca, é a posição dentro do resultado. */}
                    {i + 1}
                  </span>
                  <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                    {iniciais(p.nome)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{p.nome}</span>
                      <span className="text-xs font-mono tabular-nums font-bold shrink-0">
                        {formatarDuracao(seg)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (seg / maxSegundos) * 100)}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {p.cargo && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {PERFIL_LABELS[p.cargo] ?? p.cargo}
                        </Badge>
                      )}
                      {mostrarEmpresa && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5">
                          <Building2 className="w-2.5 h-2.5" /> {p.empresa_nome}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {numeroBr(Number(p.aberturas))} aberturas · {p.dias_ativos} dia(s) ·{' '}
                        {p.telas_usadas} tela(s)
                        {p.ultimo_em && ` · ${tempoRelativo(p.ultimo_em)}`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {restantes > 0 && (
            <button
              type="button"
              onClick={() => setLimite(l => l + PAGINA)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-md border border-dashed border-border transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Ver mais {Math.min(PAGINA, restantes)} de {restantes}
            </button>
          )}
        </>
      )}

      <DetalhePessoa
        pessoa={aberta}
        desde={desde}
        ate={ate}
        onFechar={() => setAberta(null)}
      />
    </Card>
  );
}

// ── Janela de detalhe ────────────────────────────────────────────────────────

function DetalhePessoa({
  pessoa, desde, ate, onFechar,
}: { pessoa: UsoPorPessoa | null; desde: string; ate: string; onFechar: () => void }) {
  const [telas, setTelas] = useState<UsoDetalheTela[]>([]);
  const [dias, setDias]   = useState<UsoDetalheDia[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!pessoa) return;
    let cancelado = false;
    setCarregando(true);
    setTelas([]); setDias([]);
    void buscarDetalhePessoa(pessoa.usuario_id, desde, ate).then(r => {
      if (cancelado) return;
      setTelas(r.telas); setDias(r.dias);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [pessoa, desde, ate]);

  if (!pessoa) return null;

  const maxSeg = Math.max(...telas.map(t => Number(t.segundos)), 1);
  const maxDia = Math.max(...dias.map(d => Number(d.segundos)), 1);
  const totalSeg = telas.reduce((s, t) => s + Number(t.segundos), 0);
  const totalAber = telas.reduce((s, t) => s + Number(t.aberturas), 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="uso-detalhe-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
              {iniciais(pessoa.nome)}
            </span>
            <span className="truncate">{pessoa.nome}</span>
            {pessoa.cargo && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {PERFIL_LABELS[pessoa.cargo] ?? pessoa.cargo}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription id="uso-detalhe-desc" className="text-xs">
            {pessoa.empresa_nome} · uso entre {desde} e {ate}. Tempo conta só com a
            aba em foco.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando detalhe…
          </div>
        ) : telas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma tela registrada para esta pessoa no período.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Números */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { Icone: Clock,              label: 'Tempo total', valor: formatarDuracao(totalSeg) },
                { Icone: MousePointerClick,  label: 'Aberturas',   valor: numeroBr(totalAber) },
                { Icone: CalendarDays,       label: 'Dias ativos', valor: String(pessoa.dias_ativos) },
                { Icone: Monitor,            label: 'Telas',       valor: String(telas.length) },
              ].map(({ Icone, label, valor }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                    <Icone className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className="text-base font-bold font-mono tabular-nums mt-0.5">{valor}</p>
                </div>
              ))}
            </div>

            {/* Série diária */}
            {dias.length > 1 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Por dia
                </p>
                <div className="flex items-end gap-1 h-16">
                  {dias.map(d => (
                    <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full rounded-t bg-primary/70"
                        style={{ height: `${Math.max(3, (Number(d.segundos) / maxDia) * 100)}%` }}
                        title={`${d.dia}: ${formatarDuracao(Number(d.segundos))} · ${d.aberturas} abertura(s)`} />
                      <span className="text-[8px] text-muted-foreground tabular-nums truncate w-full text-center">
                        {d.dia.slice(8, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Telas */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Telas mais usadas
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-2 py-1.5 font-semibold">TELA</th>
                      <th className="text-right px-2 py-1.5 font-semibold">TEMPO</th>
                      <th className="text-right px-2 py-1.5 font-semibold">ABERTURAS</th>
                      <th className="text-right px-2 py-1.5 font-semibold">DIAS</th>
                      <th className="text-right px-2 py-1.5 font-semibold">ÚLTIMA VEZ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telas.map(t => (
                      <tr key={t.tela} className="border-b border-border/50">
                        <td className="px-2 py-1.5 min-w-[160px]">
                          <span className="font-medium" title={t.tela}>{rotuloDaTela(t.tela)}</span>
                          <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                            <div className="h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.max(2, (Number(t.segundos) / maxSeg) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold">
                          {formatarDuracao(Number(t.segundos))}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                          {numeroBr(Number(t.aberturas))}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{t.dias}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {t.ultimo_em ? tempoRelativo(t.ultimo_em) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onFechar}>
            <X className="w-3.5 h-3.5" /> Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
