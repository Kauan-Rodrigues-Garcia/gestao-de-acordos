/**
 * Mestre59Detalhe — o que abre quando você clica num grupo.
 *
 * Responde três perguntas, nesta ordem:
 *
 *   1. **De onde vem esse dinheiro?** O que é do próprio setor e o que outro
 *      setor cobrou para ele, separado em Integral e Extra. A coluna `soma` diz
 *      quais entram no total — o Extra vindo de fora não entra.
 *   2. **Quais equipes?** Só as que têm valor no mês. Cada uma abre nos
 *      operadores, e cada operador abre nos NRs (ver `Mestre59Equipe`).
 *      Vincular equipe do relatório à equipe do sistema exige o SETOR já
 *      vinculado, porque é ele que define quais equipes são candidatas.
 *   3. **Quem está no lugar errado?** Depois das equipes vinculadas, quem o
 *      relatório põe numa equipe e o cadastro põe em outra.
 *
 * ## O Extra que vem de fora não soma
 *
 * Um pagamento pode ter dois operadores, um direto e um extra. Quando um deles
 * é do receptivo, o ERP emite a mesma cobrança nas duas pernas — `Integral` em
 * quem cobrou direto, `Extra` no receptivo. Somar o Extra no destino contaria o
 * mesmo dinheiro duas vezes; ele aparece marcado «não soma», porque saber que
 * ele existe importa, e contá-lo não.
 *
 * ## A regra do zero
 *
 * Origem zerada e equipe zerada NÃO aparecem. A lista responde «de onde vem», e
 * R$ 0,00 não é resposta — é ruído que empurra o que importa para baixo. Quem
 * sumiu do relatório está no histórico, que é onde se procura por isso.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, ArrowDownLeft, ArrowUpRight, HelpCircle, Users, AlertTriangle, ChevronRight,
  UserCheck, UserX, CornerDownRight, Globe, ArrowRightLeft,
  HeartPulse, Link2, Link2Off, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarOrigensDoGrupo, buscarResumoEquipes, buscarOperadoresDivergentes,
  buscarVinculoOperadores, vincularEquipe, moverEquipe,
  type GrupoDoMestre, type OrigemDoGrupo, type EquipeDoMestre, type OperadorDivergente,
  type VinculoOperadores, type EstadoVinculo, type ProblemaOperador, type DestinoEquipe,
} from '@/services/mestre/mestre.service';
import { Mestre59Equipe } from './Mestre59Equipe';

interface Props {
  empresaId: string;
  mes: string;
  grupo: GrupoDoMestre;
  /** Recarrega a lista de grupos do pai — vincular equipe não muda totais,
   *  mas mudar o setor do grupo invalida as equipes candidatas. */
  aoMudar?: () => void;
}

interface EquipeDoSetor { id: string; nome: string }

const ROTULO_ORIGEM: Record<OrigemDoGrupo['origem'], string> = {
  proprio:      'Do próprio setor',
  contribuicao: 'Cobrado por outro setor para este',
  para_outro:   'Deste setor, carimbado para outro',
  sem_destino:  'Destino não reconhecido',
  // Fora do total pela mesma regra do 58, que guarda essas linhas em
  // `analitico_colchao_fora_meta` em vez de somá-las na meta.
  colchao_fora: 'Colchão fora da meta (não soma)',
};

const PROBLEMA: Record<ProblemaOperador, { rotulo: string; grave: boolean }> = {
  sem_cadastro:  { rotulo: 'não existe no cadastro',       grave: true  },
  sem_equipe:    { rotulo: 'sem equipe no cadastro',       grave: true  },
  equipe_errada: { rotulo: 'em outra equipe no cadastro',  grave: true  },
  setor_errado:  { rotulo: 'em outro setor no cadastro',   grave: false },
};

export function Mestre59Detalhe({ empresaId, mes, grupo, aoMudar }: Props) {
  const cod = grupo.cod_grupo_filtro;

  const [origens, setOrigens]         = useState<OrigemDoGrupo[] | null>(null);
  const [equipes, setEquipes]         = useState<EquipeDoMestre[] | null>(null);
  const [divergentes, setDivergentes] = useState<OperadorDivergente[]>([]);
  const [pessoas, setPessoas]         = useState<Record<string, VinculoOperadores>>({});
  const [doSetor, setDoSetor]         = useState<EquipeDoSetor[]>([]);
  /** Todos os setores da empresa — os destinos possíveis de uma equipe. */
  const [todosSetores, setTodosSetores] = useState<EquipeDoSetor[]>([]);
  const [salvando, setSalvando]       = useState<string | null>(null);
  const [movendo, setMovendo]         = useState<string | null>(null);
  /** Equipe cuja lista de operadores está aberta. Uma por vez. */
  const [equipeAberta, setEquipeAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [o, e, d, v] = await Promise.all([
      buscarOrigensDoGrupo(empresaId, mes, cod).catch(() => [] as OrigemDoGrupo[]),
      buscarResumoEquipes(empresaId, mes, cod).catch(() => [] as EquipeDoMestre[]),
      buscarOperadoresDivergentes(empresaId, mes, cod).catch(() => [] as OperadorDivergente[]),
      buscarVinculoOperadores(empresaId, mes, cod).catch(() => [] as VinculoOperadores[]),
    ]);
    setOrigens(o); setEquipes(e); setDivergentes(d);
    setPessoas(Object.fromEntries(v.map(x => [x.nome_subgrupo, x])));
  }, [empresaId, mes, cod]);

  useEffect(() => { void carregar(); }, [carregar]);

  // As equipes candidatas saem do SETOR vinculado ao grupo. Sem setor não há
  // candidata — e a função do banco recusa o vínculo, então a tela não deve
  // oferecer o que seria negado.
  useEffect(() => {
    if (!grupo.setor_id) { setDoSetor([]); return; }
    let cancel = false;
    void supabase.from('equipes').select('id, nome').eq('setor_id', grupo.setor_id).order('nome')
      .then(({ data }) => { if (!cancel) setDoSetor((data as EquipeDoSetor[]) ?? []); });
    return () => { cancel = true; };
  }, [grupo.setor_id]);

  // Os destinos possíveis são TODOS os setores da empresa, e não só os que têm
  // grupo no relatório: a equipe está no lugar errado justamente quando o setor
  // certo não aparece no arquivo (o Digital, por exemplo).
  useEffect(() => {
    let cancel = false;
    void supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome')
      .then(({ data }) => { if (!cancel) setTodosSetores((data as EquipeDoSetor[]) ?? []); });
    return () => { cancel = true; };
  }, [empresaId]);

  const mover = useCallback(async (
    subgrupo: string, destino: DestinoEquipe, setorId: string | null,
  ) => {
    setMovendo(subgrupo);
    try {
      await moverEquipe({ empresaId, codGrupo: cod, subgrupo, destino, setorId });
      await carregar();
      // Mover muda o total do grupo e o de outro setor — o pai precisa recarregar.
      aoMudar?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível mover o recebimento.');
    } finally {
      setMovendo(null);
    }
  }, [empresaId, cod, carregar, aoMudar]);

  const aplicar = useCallback(async (
    subgrupo: string, estado: EstadoVinculo, equipeId: string | null,
  ) => {
    setSalvando(subgrupo);
    try {
      await vincularEquipe({ empresaId, codGrupo: cod, subgrupo, estado, equipeId });
      await carregar();
      aoMudar?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível vincular a equipe.');
    } finally {
      setSalvando(null);
    }
  }, [empresaId, cod, carregar, aoMudar]);

  const { times, naoTimes } = useMemo(() => ({
    times:    (equipes ?? []).filter(e => e.e_equipe),
    naoTimes: (equipes ?? []).filter(e => !e.e_equipe),
  }), [equipes]);

  return (
    <div className="space-y-4 py-1">

      {/* ── De onde vem ───────────────────────────────────────────────────── */}
      <section>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          De onde vem o recebimento
        </h4>
        {origens === null ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : origens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem movimento neste mês.</p>
        ) : (
          <div className="rounded-lg border border-border/40 bg-background/60 divide-y divide-border/25">
            {origens.map((o, i) => (
              <div key={i} className={cn('flex items-center gap-3 px-3 py-2 text-xs',
                !o.soma && 'bg-muted/25')}>
                <span className={cn('shrink-0',
                  o.origem === 'contribuicao' ? (o.soma ? 'text-success' : 'text-muted-foreground')
                    : o.origem === 'para_outro' ? 'text-muted-foreground'
                    : o.origem === 'sem_destino' ? 'text-destructive'
                    : 'text-muted-foreground')}>
                  {o.origem === 'contribuicao' ? <ArrowDownLeft className="w-3.5 h-3.5" />
                    : o.origem === 'para_outro' ? <ArrowUpRight className="w-3.5 h-3.5" />
                    : o.origem === 'sem_destino' ? <HelpCircle className="w-3.5 h-3.5" />
                    : <span className="block w-3.5 h-3.5 rounded-sm bg-muted-foreground/30" />}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={cn('font-medium', o.soma ? 'text-foreground' : 'text-muted-foreground')}>
                    {ROTULO_ORIGEM[o.origem]}
                  </span>
                  {o.rotulo && o.origem !== 'proprio' && (
                    <span className="text-muted-foreground"> · {o.rotulo}</span>
                  )}
                  {o.cod_outro && (
                    <span className="font-mono text-[10px] ml-1.5 px-1 rounded bg-muted text-muted-foreground">
                      {o.cod_outro}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0',
                  o.tipo === 'Extra' ? 'text-chart-4 border-chart-4/40' : 'text-muted-foreground')}>
                  {o.tipo}
                </Badge>
                {!o.soma && (
                  <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                    não soma
                  </Badge>
                )}
                <span className="text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                  {o.linhas.toLocaleString('pt-BR')}
                </span>
                <span className={cn('tabular-nums shrink-0 w-28 text-right',
                  o.soma ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {formatBRL(o.valor)}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-3 py-2 text-xs bg-muted/40">
              <span className="flex-1 font-semibold text-foreground">Total do setor</span>
              <span className="tabular-nums font-bold text-foreground w-28 text-right">
                {formatBRL(grupo.recebido_total)}
              </span>
            </div>
          </div>
        )}
        {grupo.contrib_extra > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            O <strong>Extra</strong> que outro setor cobrou para este <strong>não soma</strong>:
            é a segunda perna de um pagamento que este setor já tem como direto. O ERP emite as
            duas — rateio de comissão, não transferência. Só o <strong>Integral</strong> entra,
            porque esse o setor não tem.
          </p>
        )}
        {grupo.para_outros_integral + grupo.para_outros_extra > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Este setor cobrou {formatBRL(grupo.para_outros_integral + grupo.para_outros_extra)} carimbado
            para outros — e isso <strong>continua no total dele</strong>. Nada sai daqui.
          </p>
        )}
      </section>

      {/* ── Atestado ──────────────────────────────────────────────────────── */}
      {grupo.atestado_valor > 0 && (
        <div className="rounded-lg border border-chart-4/30 bg-chart-4/5 px-3 py-2.5 flex items-start gap-2.5">
          <HeartPulse className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">{formatBRL(grupo.atestado_valor)}</span>{' '}
            vêm de <span className="font-mono text-[11px]">ATESTADOS|FERIAS</span> — recebimento de quem
            estava afastado. <strong>Conta no total do setor</strong>; aparece aqui só para não ficar diluído.
          </p>
        </div>
      )}

      {/* ── Equipes ───────────────────────────────────────────────────────── */}
      <section>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Equipes com movimento no mês
        </h4>

        {!grupo.setor_id && (times.length > 0) && (
          <p className="text-[11px] text-warning mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Vincule o <strong>setor</strong> deste grupo primeiro — é ele que define quais equipes
            podem ser escolhidas.
          </p>
        )}

        {equipes === null ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : times.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma equipe com valor neste mês.</p>
        ) : (
          <div className="rounded-lg border border-border/40 bg-background/60 divide-y divide-border/25">
            {times.map(e => {
              const p = pessoas[e.nome_subgrupo];
              const abertaAqui = equipeAberta === e.nome_subgrupo;
              return (
              <div key={e.nome_subgrupo}>
              <div className="flex items-center gap-3 px-3 py-2 text-xs flex-wrap">
                <button type="button"
                  onClick={() => setEquipeAberta(abertaAqui ? null : e.nome_subgrupo)}
                  className="flex items-center gap-1.5 min-w-[14ch] flex-1 text-left group">
                  <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform',
                    abertaAqui && 'rotate-90')} />
                  <span className="font-medium text-foreground truncate group-hover:underline">
                    {e.nome_subgrupo}
                  </span>
                </button>
                {/* Quantos operadores da equipe casaram com o cadastro pelo
                    login. Casamento automático, calculado — nada é gravado. */}
                {p && (
                  <span className={cn('tabular-nums shrink-0 inline-flex items-center gap-1',
                    p.sem_cadastro > 0 ? 'text-warning' : 'text-success')}>
                    {p.sem_cadastro > 0
                      ? <UserX className="w-3 h-3" />
                      : <UserCheck className="w-3 h-3" />}
                    {p.vinculados}/{p.operadores} no cadastro
                  </span>
                )}
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {e.cobradoras} pessoa{e.cobradoras !== 1 ? 's' : ''}
                </span>
                {e.extra_valor > 0 && (
                  <Badge variant="outline" className="text-[10px] text-chart-4 border-chart-4/40 shrink-0">
                    Extra {formatBRL(e.extra_valor)}
                  </Badge>
                )}
                {/* Já fora do valor ao lado. Mostrado porque some do total, e a
                    régua é a do 58 — não uma escolha desta tela. */}
                {e.colchao_fora > 0 && (
                  <Badge variant="outline"
                    className="text-[10px] text-muted-foreground border-border/60 shrink-0"
                    title="Colchão fora da janela de exceção. O 58 guarda essas linhas em tabela separada e não as soma em meta nenhuma.">
                    + {formatBRL(e.colchao_fora)} fora da meta
                  </Badge>
                )}
                <span className="tabular-nums font-semibold text-foreground shrink-0 w-28 text-right">
                  {formatBRL(e.recebido)}
                </span>
                <div className="flex items-center gap-1.5 w-[220px] shrink-0">
                  <Select
                    value={e.estado === 'vinculado' ? (e.equipe_id ?? '') : e.estado === 'ignorado' ? '__ignorado__' : '__novo__'}
                    disabled={salvando === e.nome_subgrupo || !grupo.setor_id}
                    onValueChange={v => {
                      if (v === '__novo__')          void aplicar(e.nome_subgrupo, 'novo', null);
                      else if (v === '__ignorado__') void aplicar(e.nome_subgrupo, 'ignorado', null);
                      else                           void aplicar(e.nome_subgrupo, 'vinculado', v);
                    }}
                  >
                    <SelectTrigger className={cn('h-7 text-[11px] rounded-lg',
                      e.estado === 'novo' && grupo.setor_id && 'border-warning/50 text-warning')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__novo__">
                        <span className="flex items-center gap-1.5 text-warning">
                          <Link2Off className="w-3 h-3" /> Sem vínculo
                        </span>
                      </SelectItem>
                      <SelectItem value="__ignorado__">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <EyeOff className="w-3 h-3" /> Ignorar
                        </span>
                      </SelectItem>
                      {doSetor.length === 0
                        ? <SelectItem value="__vazio__" disabled>Nenhuma equipe neste setor</SelectItem>
                        : doSetor.map(q => (
                            <SelectItem key={q.id} value={q.id}>
                              <span className="flex items-center gap-1.5">
                                <Link2 className="w-3 h-3" /> {q.nome}
                              </span>
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  {salvando === e.nome_subgrupo && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Onde este recebimento CONTA. Separado do vínculo de equipe
                    de propósito: uma coisa é dizer «esta equipe do relatório é
                    aquela do sistema», outra é dizer «este dinheiro não é deste
                    setor». A segunda muda total; a primeira, não. */}
                <div className="flex items-center gap-1.5 w-[240px] shrink-0">
                  <Select
                    value={e.destino === 'outro_setor' ? (e.destino_setor_id ?? '') : e.destino}
                    disabled={movendo === e.nome_subgrupo}
                    onValueChange={v => {
                      if (v === 'proprio' || v === 'somente_geral') void mover(e.nome_subgrupo, v, null);
                      else void mover(e.nome_subgrupo, 'outro_setor', v);
                    }}
                  >
                    <SelectTrigger className={cn('h-7 text-[11px] rounded-lg',
                      e.destino !== 'proprio' && 'border-chart-4/50 text-chart-4')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proprio">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <CornerDownRight className="w-3 h-3" /> Conta neste setor
                        </span>
                      </SelectItem>
                      <SelectItem value="somente_geral">
                        <span className="flex items-center gap-1.5 text-chart-4">
                          <Globe className="w-3 h-3" /> Sai daqui · só no geral
                        </span>
                      </SelectItem>
                      {todosSetores
                        .filter(s => s.id !== grupo.setor_id)
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-1.5">
                              <ArrowRightLeft className="w-3 h-3" /> Move para {s.nome}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {movendo === e.nome_subgrupo && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                  )}
                </div>
              </div>

              {abertaAqui && (
                <div className="px-3 pb-3">
                  <Mestre59Equipe
                    empresaId={empresaId} mes={mes} codGrupo={cod}
                    subgrupo={e.nome_subgrupo}
                    equipeVinculada={e.estado === 'vinculado' ? e.equipe_nome : null}
                  />
                </div>
              )}
              </div>
              );
            })}
          </div>
        )}

        {/* Rótulos que não são equipe: atestado, liderança, supervisão e o
            vazio. Não se vinculam a time nenhum — oferecer o seletor de equipe
            aqui seria convidar ao erro —, mas o dinheiro é real e pode estar no
            setor errado como qualquer outro. Por isso o destino vale para eles
            também: `COBRANÇA - GERAL` tem R$ 653 mil sob rótulo vazio. */}
        {naoTimes.length > 0 && (
          <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 divide-y divide-border/25">
            {naoTimes.map(e => (
              <div key={e.nome_subgrupo || '(vazio)'}
                className="flex items-center gap-3 px-3 py-1.5 text-xs flex-wrap">
                <span className="text-muted-foreground flex-1 min-w-[14ch] truncate">
                  {e.nome_subgrupo || <span className="italic">sem equipe informada</span>}
                </span>
                <span className="tabular-nums font-medium text-foreground shrink-0 w-28 text-right">
                  {formatBRL(e.recebido)}
                </span>
                <div className="flex items-center gap-1.5 w-[240px] shrink-0">
                  <Select
                    value={e.destino === 'outro_setor' ? (e.destino_setor_id ?? '') : e.destino}
                    disabled={movendo === e.nome_subgrupo}
                    onValueChange={v => {
                      if (v === 'proprio' || v === 'somente_geral') void mover(e.nome_subgrupo, v, null);
                      else void mover(e.nome_subgrupo, 'outro_setor', v);
                    }}
                  >
                    <SelectTrigger className={cn('h-7 text-[11px] rounded-lg',
                      e.destino !== 'proprio' && 'border-chart-4/50 text-chart-4')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proprio">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <CornerDownRight className="w-3 h-3" /> Conta neste setor
                        </span>
                      </SelectItem>
                      <SelectItem value="somente_geral">
                        <span className="flex items-center gap-1.5 text-chart-4">
                          <Globe className="w-3 h-3" /> Sai daqui · só no geral
                        </span>
                      </SelectItem>
                      {todosSetores
                        .filter(s => s.id !== grupo.setor_id)
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-1.5">
                              <ArrowRightLeft className="w-3 h-3" /> Move para {s.nome}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {movendo === e.nome_subgrupo && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(grupo.saiu_outro_setor + grupo.saiu_somente_geral) > 0 && (
          <p className="text-[11px] text-chart-4 mt-2">
            {formatBRL(grupo.saiu_outro_setor + grupo.saiu_somente_geral)} saíram do total deste
            setor por decisão de destino
            {grupo.saiu_outro_setor > 0 && <> — {formatBRL(grupo.saiu_outro_setor)} foram para outro setor</>}
            {grupo.saiu_somente_geral > 0 && <> — {formatBRL(grupo.saiu_somente_geral)} contam só no geral</>}.
            As linhas não mudaram de lugar no relatório; mudou onde elas contam.
          </p>
        )}
      </section>

      {/* ── Divergências de cadastro ──────────────────────────────────────── */}
      {divergentes.length > 0 && (
        <section>
          <h4 className="text-[11px] uppercase tracking-wider text-warning font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {divergentes.length} pessoa{divergentes.length !== 1 ? 's' : ''} fora do lugar
          </h4>
          <div className="rounded-lg border border-warning/30 bg-warning/5 divide-y divide-warning/15">
            {divergentes.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs flex-wrap">
                <span className="font-mono text-[11px] text-foreground shrink-0">{d.cobradora}</span>
                {d.perfil_nome && <span className="text-muted-foreground truncate">{d.perfil_nome}</span>}
                <span className={cn('shrink-0', PROBLEMA[d.problema]?.grave ? 'text-warning' : 'text-muted-foreground')}>
                  {PROBLEMA[d.problema]?.rotulo ?? d.problema}
                </span>
                <span className="text-muted-foreground shrink-0">
                  relatório: <strong className="text-foreground">{d.nome_subgrupo}</strong>
                  {d.equipe_atual && <> · cadastro: <strong className="text-foreground">{d.equipe_atual}</strong></>}
                </span>
                <span className="tabular-nums text-muted-foreground ml-auto shrink-0">
                  {formatBRL(d.recebido)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Comparação entre o que o relatório diz e o cadastro de <em>hoje</em>. Corrigir é na aba
            Usuários — esta tela só aponta.
          </p>
        </section>
      )}
    </div>
  );
}

export default Mestre59Detalhe;
