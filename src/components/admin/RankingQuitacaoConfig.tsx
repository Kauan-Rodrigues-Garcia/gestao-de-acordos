/**
 * RankingQuitacaoConfig — onde o Ranking de quitação aparece e como cada setor
 * disputa (06/10/2026; configurável desde 11/11/2026).
 *
 * Por setor: ligar/desligar e, numa janela, em seções numeradas:
 *   1. quem disputa — o setor inteiro, ou cada equipe com o seu ranking;
 *   2. o que conta — valor quitado ou quantidade de quitações, e se vale
 *      tudo o que fecha o contrato ou só o acordo de Quitação (20261112230000);
 *   3. equipes de fora (ex.: Treinamento);
 *   4. prêmios por posição — de 0 a 10, valor e/ou brinde, e o mínimo de
 *      quitações para levar;
 *   5. destaques do mês — mais quitações, maior valor, maior quitação,
 *      equipe campeã, cada um com o seu prêmio.
 *
 * Grava por `fn_ranking_quitacao_definir_setor`, que confere a chave
 * `ranking_quitacao_configurar` e valida tudo de novo no banco. Salvar avisa
 * as TVs e a aba aberta: a mudança aparece na hora nos dois.
 *
 * A janela de um setor (`EditorDoSetor`) também abre na própria aba do
 * ranking, para o líder configurar o do setor dele
 * (`ranking_quitacao_configurar_setor`, 20261112220000).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Medal, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { COLUNAS_SETOR_DO_FILTRO, setoresDosFiltros } from '@/lib/setoresDosFiltros';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useSetoresDoRanking } from '@/pages/Analitico/RankingQuitacao/useSetoresDoRanking';
import { definirSetorDoRanking, type SetorDoRanking } from '@/services/rankingQuitacao/rankingQuitacao.service';
import {
  CATEGORIAS, CONFIG_PADRAO, MAX_POSICOES_PREMIADAS, PREMIOS_PADRAO, configParaGravar, posicoesComPremio, resumoDaConfig,
  type CategoriaConfig, type ConfigRanking,
} from '@/services/rankingQuitacao/ranking';

type Setor = { id: string; nome: string; ativo?: boolean | null; tipo?: string | null };
export type EquipeDoEditor = { id: string; nome: string; setor_id: string; treinamento?: boolean | null };
type Equipe = EquipeDoEditor;

export default function RankingQuitacaoConfig() {
  const { empresa } = useEmpresa();
  const { setores: configurados, carregando, recarregar } = useSetoresDoRanking(empresa?.id);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Setor | null>(null);

  useEffect(() => {
    if (!empresa?.id) return;
    supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO).eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => setSetores(setoresDosFiltros(aplicarOrdemSetores((data as unknown as Setor[] | null) ?? [], empresa.id))));
    supabase.from('equipes').select('id, nome, setor_id, treinamento').eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => setEquipes((data as Equipe[] | null) ?? []));
  }, [empresa?.id]);

  const configDe = (id: string) => configurados.find(c => c.setor_id === id);

  async function ligar(setorId: string, ativo: boolean) {
    if (!empresa?.id) return;
    setSalvando(setorId);
    try {
      await definirSetorDoRanking(empresa.id, setorId, ativo);
      await recarregar();
    } catch (e) {
      toast.error('Não foi possível salvar o Ranking de quitação', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Medal className="w-4 h-4 text-primary" /> Ranking de quitação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Os setores ligados ganham a aba Ranking de quitação no Analítico e a cena no Modo TV — as duas com a
          mesma conta, atualizadas na hora em que o relatório é importado. Em cada setor você escolhe quem
          disputa, o que conta, os prêmios e os destaques do mês.
        </p>
        {carregando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {setores.map(s => {
              const cfg = configDe(s.id);
              const ligado = cfg?.ativo === true;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">{s.nome}</p>
                    {ligado && cfg && (
                      <p className="truncate text-[11px] text-muted-foreground">{resumoDaConfig(cfg.config, posicoesComPremio(cfg.premios, cfg.config.premios_texto))}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {salvando === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {ligado && (
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditando(s)}>
                        <Settings2 className="h-3.5 w-3.5" /> Configurar
                      </Button>
                    )}
                    <Switch
                      checked={ligado}
                      disabled={salvando === s.id}
                      onCheckedChange={v => void ligar(s.id, v)}
                      aria-label={`Ranking de quitação no ${s.nome}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {editando && empresa?.id && (
        <EditorDoSetor
          empresaId={empresa.id}
          setor={editando}
          atual={configDe(editando.id)}
          equipes={equipes.filter(e => e.setor_id === editando.id)}
          onFechar={() => setEditando(null)}
          onSalvo={async () => { await recarregar(); setEditando(null); }}
        />
      )}
    </Card>
  );
}

// ── A janela de um setor ─────────────────────────────────────────────────────

interface LinhaPremio { valor: string; brinde: string }

const textoDoValor = (v: number) => (v ? String(v).replace('.', ',') : '');
const valorDoTexto = (t: string) => {
  const limpo = t.trim().replace(/\s|R\$/g, '');
  if (!limpo) return 0;
  return Number(limpo.replace(/\./g, '').replace(',', '.'));
};

export function EditorDoSetor({ empresaId, setor, atual, equipes, onFechar, onSalvo }: {
  empresaId: string;
  setor: Pick<Setor, 'id' | 'nome'>;
  atual: SetorDoRanking | undefined;
  equipes: Equipe[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const inicial = atual?.config ?? CONFIG_PADRAO;
  const [cfg, setCfg] = useState<ConfigRanking>(inicial);
  const [premios, setPremios] = useState<LinhaPremio[]>(() =>
    (atual?.premios ?? [...PREMIOS_PADRAO]).map((v, i) => ({ valor: textoDoValor(v), brinde: inicial.premios_texto[i] ?? '' })));
  const [minimo, setMinimo] = useState(inicial.minimo_quitacoes ? String(inicial.minimo_quitacoes) : '');
  const [salvando, setSalvando] = useState(false);

  // Os destaques sempre na mesma ordem, com os que nunca foram ligados.
  const categorias = useMemo<CategoriaConfig[]>(() => CATEGORIAS.map(c =>
    cfg.categorias.find(k => k.id === c.id) ?? { id: c.id, ativo: false, premio: null, premio_texto: '' }), [cfg.categorias]);
  const mudarCategoria = (id: CategoriaConfig['id'], mudanca: Partial<CategoriaConfig>) =>
    setCfg(c => ({ ...c, categorias: categorias.map(k => (k.id === id ? { ...k, ...mudanca } : k)) }));

  const mudarPremio = (i: number, mudanca: Partial<LinhaPremio>) =>
    setPremios(ps => ps.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));

  async function salvar() {
    const todos = premios.map(p => valorDoTexto(p.valor));
    if (todos.some(v => !Number.isFinite(v) || v < 0)) {
      toast.error('Confira os prêmios: cada um é um valor em reais (ou vazio, se for só brinde).');
      return;
    }
    // Posições vazias no fim saem sozinhas: tudo vazio = ranking sem prêmio.
    const ate = posicoesComPremio(todos, premios.map(p => p.brinde));
    const usados = premios.slice(0, ate);
    const valores = todos.slice(0, ate);
    const semNada = usados.findIndex((p, i) => valores[i] === 0 && !p.brinde.trim());
    if (semNada >= 0) {
      toast.error(`O ${semNada + 1}º lugar está sem prêmio, mas o ${ate}º tem. Ponha um valor ou brinde no ${semNada + 1}º, ou tire as posições de baixo.`);
      return;
    }
    const min = minimo.trim() ? Number(minimo) : 0;
    if (!Number.isInteger(min) || min < 0 || min > 999) {
      toast.error('O mínimo de quitações é um número inteiro, de 0 a 999.');
      return;
    }
    const categoriasValidas = categorias.map(k => ({ ...k, premio: k.premio != null && Number.isFinite(k.premio) && k.premio > 0 ? k.premio : null }));
    const final: ConfigRanking = {
      ...cfg,
      minimo_quitacoes: min,
      premios_texto: usados.map(p => p.brinde),
      // Só vai o que está ligado ou já teve prêmio: o resto é o padrão.
      categorias: categoriasValidas.filter(k => k.ativo || k.premio != null || k.premio_texto.trim()),
    };
    setSalvando(true);
    try {
      await definirSetorDoRanking(empresaId, setor.id, true, valores, configParaGravar(final, valores.length));
      toast.success('Ranking de quitação salvo', { description: 'A aba e as TVs já mostram a configuração nova.' });
      await onSalvo();
    } catch (e) {
      toast.error('Não foi possível salvar o Ranking de quitação', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  }

  const fora = new Set(cfg.equipes_fora);

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto && !salvando) onFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ranking de quitação · {setor.nome}</DialogTitle>
          <DialogDescription>Vale para a aba do Analítico e para a cena do Modo TV.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Secao numero={1} titulo="Quem disputa">
            <Escolhas
              valor={cfg.disputa}
              onMudar={v => setCfg(c => ({ ...c, disputa: v }))}
              opcoes={[
                { valor: 'setor', rotulo: 'O setor inteiro', dica: 'Um ranking só, com todo mundo do setor.' },
                { valor: 'equipe', rotulo: 'Cada equipe', dica: 'Cada equipe tem o seu ranking e paga a mesma tabela de prêmios.' },
              ]}
            />
          </Secao>

          <Secao numero={2} titulo="O que conta">
            <Escolhas
              valor={cfg.criterio}
              onMudar={v => setCfg(c => ({ ...c, criterio: v }))}
              opcoes={[
                { valor: 'valor', rotulo: 'Valor quitado', dica: 'Soma do recebido no mês dos acordos quitados. Desempata pela quantidade.' },
                { valor: 'quantidade', rotulo: 'Quantidade', dica: 'Número de quitações no mês. Desempata pelo valor.' },
              ]}
            />
            <p className="pt-2 text-xs font-medium text-foreground">O que conta como quitação</p>
            <Escolhas
              valor={cfg.aceita}
              onMudar={v => setCfg(c => ({ ...c, aceita: v }))}
              opcoes={[
                { valor: 'todas', rotulo: 'Tudo o que quita o contrato', dica: 'Acordo de Quitação, Junção que fechou o contrato (troca de plano) e acordo que ficou com saldo zero.' },
                { valor: 'so_quitacao', rotulo: 'Só acordo de Quitação', dica: 'Só o que foi negociado como Quitação. Troca de plano e saldo zerado ficam de fora.' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">A última parcela de boleto parcelado nunca conta. Mudar aqui vale na hora para o que foi importado a partir de 12/11/2026.</p>
          </Secao>

          <Secao numero={3} titulo="Equipes que ficam de fora" dica="Quem é dessas equipes não aparece no ranking nem nos destaques.">
            {equipes.length === 0 ? (
              <p className="text-xs text-muted-foreground">O setor não tem equipes cadastradas.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {equipes.map(e => {
                  const saiu = fora.has(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={saiu}
                      onClick={() => setCfg(c => ({ ...c, equipes_fora: saiu ? c.equipes_fora.filter(x => x !== e.id) : [...c.equipes_fora, e.id] }))}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        saiu ? 'border-border bg-muted text-muted-foreground line-through' : 'border-primary/40 bg-primary/10 text-foreground',
                      )}
                    >
                      {e.nome}{e.treinamento ? ' · treinamento' : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </Secao>

          <Secao numero={4} titulo="Prêmios por posição" dica="Valor em reais, um brinde (ex.: Troféu, Folga), ou os dois. Até 10 posições.">
            <div className="space-y-1.5">
              {premios.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}º</span>
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      inputMode="decimal"
                      className="h-8 pl-8 text-xs tabular-nums"
                      value={p.valor}
                      placeholder="0"
                      onChange={e => mudarPremio(i, { valor: e.target.value })}
                      aria-label={`Prêmio em reais do ${i + 1}º lugar`}
                    />
                  </div>
                  <Input
                    className="h-8 text-xs"
                    value={p.brinde}
                    maxLength={40}
                    placeholder="Brinde (opcional)"
                    onChange={e => mudarPremio(i, { brinde: e.target.value })}
                    aria-label={`Brinde do ${i + 1}º lugar`}
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => setPremios(ps => ps.filter((_, j) => j !== i))}
                    aria-label={`Tirar o prêmio do ${i + 1}º lugar`}
                    disabled={i !== premios.length - 1}
                    title={i !== premios.length - 1 ? 'Tire a partir da última posição' : undefined}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {premios.length === 0 && <p className="text-xs text-muted-foreground">Sem prêmio por posição — o ranking aparece só com as posições, sem valor de prêmio.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="h-8 gap-1.5"
                    disabled={premios.length >= MAX_POSICOES_PREMIADAS}
                    onClick={() => setPremios(ps => [...ps, { valor: '', brinde: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> {premios.length + 1}º lugar
                  </Button>
                  {premios.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setPremios([])}>
                      Sem prêmio
                    </Button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Mínimo para levar o prêmio
                  <Input
                    inputMode="numeric"
                    className="h-8 w-16 text-xs tabular-nums"
                    value={minimo}
                    placeholder="0"
                    onChange={e => setMinimo(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    aria-label="Mínimo de quitações para levar o prêmio da posição"
                  />
                  quitações
                </label>
              </div>
            </div>
          </Secao>

          <Secao numero={5} titulo="Destaques do mês" dica="Prêmios à parte, acima do pódio, na aba e na TV. Quando cada equipe disputa, cada equipe tem os seus (a Equipe campeã é do setor).">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {CATEGORIAS.map(c => {
                const k = categorias.find(x => x.id === c.id)!;
                return (
                  <li key={c.id} className="space-y-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">{c.titulo}</p>
                        <p className="text-[11px] text-muted-foreground">{c.descricao}</p>
                      </div>
                      <Switch checked={k.ativo} onCheckedChange={v => mudarCategoria(c.id, { ativo: v })} aria-label={`Destaque ${c.titulo}`} />
                    </div>
                    {k.ativo && (
                      <div className="flex items-center gap-2">
                        <div className="relative w-28 shrink-0">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                          <Input
                            inputMode="decimal"
                            className="h-8 pl-8 text-xs tabular-nums"
                            defaultValue={k.premio != null ? textoDoValor(k.premio) : ''}
                            placeholder="0"
                            onChange={e => mudarCategoria(c.id, { premio: valorDoTexto(e.target.value) || null })}
                            aria-label={`Prêmio em reais de ${c.titulo}`}
                          />
                        </div>
                        <Input
                          className="h-8 text-xs"
                          value={k.premio_texto}
                          maxLength={40}
                          placeholder="Brinde (opcional)"
                          onChange={e => mudarCategoria(c.id, { premio_texto: e.target.value })}
                          aria-label={`Brinde de ${c.titulo}`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Secao>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ numero, titulo, dica, children }: { numero: number; titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{numero}</span>
          {titulo}
        </h3>
        {dica && <p className="mt-0.5 pl-7 text-[11px] text-muted-foreground">{dica}</p>}
      </div>
      <div className="pl-7">{children}</div>
    </section>
  );
}

function Escolhas<T extends string>({ valor, opcoes, onMudar }: {
  valor: T; opcoes: { valor: T; rotulo: string; dica: string }[]; onMudar: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {opcoes.map(o => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onMudar(o.valor)}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-left transition-colors',
              ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50',
            )}
          >
            <p className="text-sm font-medium text-foreground">{o.rotulo}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{o.dica}</p>
          </button>
        );
      })}
    </div>
  );
}
