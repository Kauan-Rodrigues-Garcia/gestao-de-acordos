/**
 * Mestre59 — a aba do relatório 59, dentro do Painel Diretoria.
 *
 * ## O que ela faz, e o que ela deliberadamente NÃO faz
 *
 * Importa o relatório mestre, lista os grupos que vieram nele e deixa ligar
 * cada grupo a um setor do sistema. Só isso.
 *
 * **Ela não escreve em `analitico_recebimentos`, não mexe em meta, não muda
 * nenhum número que alguém já vê.** É fase de conferência: o mestre roda em
 * paralelo até o número estar provado, e só depois vira fonte. Publicar antes
 * um total que ainda pode mudar é pior do que não publicar — número visto uma
 * vez vira referência mesmo depois de corrigido.
 *
 * ## O vínculo é pelo CÓDIGO
 *
 * A lista mostra `CodGrupoFiltro` em destaque, e não é decoração. Medido em
 * 04/09/2026: 16 códigos e 16 nomes em correspondência 1-para-1 exata, e o
 * código sobrevive à troca de liderança — `COB PLAY 1 - PAOLA` vira outro texto
 * quando a Paola sair, o código 25 continua 25.
 *
 * ## Por que "sem vínculo" fica no topo, em destaque
 *
 * A primeira carga entra com tudo `novo`, de propósito: ninguém adivinha o
 * setor por você. Sem um aviso grande, essa tela pareceria pronta enquanto o
 * dinheiro inteiro está fora de qualquer setor. O banner existe para que o
 * estado incompleto seja impossível de confundir com o estado final.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, RefreshCw, Loader2, Link2, Link2Off, EyeOff, History,
  FileSpreadsheet, AlertTriangle, CheckCircle2, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { parseMestre59, agruparPorGrupoFiltro, type LinhaMestre59 } from '@/services/mestre/mestre59Parser';
import {
  importarMestre59, buscarResumoGrupos, buscarResumoEquipes, buscarLotes, buscarEventos,
  vincularGrupo,
  type GrupoDoMestre, type EquipeDoMestre, type LoteDoMestre, type EventoDoMestre,
  type ProgressoCarga, type EstadoVinculo,
} from '@/services/mestre/mestre.service';

interface Props {
  empresaId: string;
  /** 'yyyy-MM'. Vem do seletor de mês do painel. */
  mes: string;
}

interface Setor { id: string; nome: string }

/** Prévia do arquivo, antes de subir. Nada foi gravado ainda. */
interface Previa {
  arquivoNome: string;
  conteudo: string;
  linhas: LinhaMestre59[];
  mes: string;
  total: number;
  descartadas: number;
  erros: string[];
  grupos: { cod: string; nome: string; linhas: number; recebido: number; equipes: number }[];
}

const ROTULO_EVENTO: Record<string, string> = {
  lote_promovido:   'Carga promovida',
  lote_descartado:  'Carga descartada',
  grupo_novo:       'Grupo novo no relatório',
  grupo_sumiu:      'Grupo sumiu do relatório',
  grupo_voltou:     'Grupo voltou ao relatório',
  equipe_nova:      'Equipe nova',
  equipe_sumiu:     'Equipe sumiu',
  equipe_voltou:    'Equipe voltou',
  vinculo_definido: 'Vínculo definido',
  vinculo_alterado: 'Vínculo alterado',
  vinculo_removido: 'Vínculo removido',
  grupo_ignorado:   'Grupo marcado como ignorado',
};

/** Eventos que merecem cor de atenção — mudança de rótulo mexe em número. */
const EVENTO_ALERTA = new Set(['grupo_sumiu', 'equipe_sumiu', 'grupo_novo', 'equipe_nova']);

export function Mestre59({ empresaId, mes }: Props) {
  const [setores, setSetores]   = useState<Setor[]>([]);
  const [grupos, setGrupos]     = useState<GrupoDoMestre[]>([]);
  const [lotes, setLotes]       = useState<LoteDoMestre[]>([]);
  const [eventos, setEventos]   = useState<EventoDoMestre[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const [previa, setPrevia]     = useState<Previa | null>(null);
  const [lendo, setLendo]       = useState(false);
  const [progresso, setProgresso] = useState<ProgressoCarga | null>(null);
  const [salvandoCod, setSalvandoCod] = useState<string | null>(null);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [equipes, setEquipes]     = useState<Record<string, EquipeDoMestre[]>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Carga da tela ─────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [g, l, e, s] = await Promise.all([
        buscarResumoGrupos(empresaId, mes),
        buscarLotes(empresaId, mes),
        buscarEventos(empresaId),
        supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome'),
      ]);
      setGrupos(g);
      setLotes(l);
      setEventos(e);
      setSetores((s.data as Setor[]) ?? []);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Trocar de mês invalida a prévia: ela foi montada para outro período, e
  // subi-la aqui gravaria o retrato no mês errado.
  useEffect(() => { setPrevia(null); setExpandido(null); setEquipes({}); }, [mes]);

  // ── Leitura do arquivo ────────────────────────────────────────────────────

  const escolherArquivo = useCallback(async (arq: File) => {
    setLendo(true);
    setPrevia(null);
    try {
      const conteudo = await arq.text();
      const r = parseMestre59(conteudo);

      if (r.colunasFaltando.length > 0) {
        toast.error(`O arquivo não parece o relatório 59: faltam ${r.colunasFaltando.join(', ')}.`);
        return;
      }
      if (r.mes === null) {
        toast.error(r.erros[0] ?? 'Não foi possível determinar o mês do arquivo.');
        return;
      }
      if (r.linhas.length === 0) {
        toast.error('O arquivo não tem nenhuma linha válida.');
        return;
      }

      setPrevia({
        arquivoNome: arq.name,
        conteudo,
        linhas: r.linhas,
        mes: r.mes,
        total: r.totalRecebido,
        descartadas: r.descartadas,
        erros: r.erros,
        grupos: agruparPorGrupoFiltro(r.linhas).map(g => ({
          cod: g.cod_grupo_filtro, nome: g.nome_grupo_filtro,
          linhas: g.linhas, recebido: g.recebido, equipes: g.equipes.length,
        })),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, []);

  const confirmar = useCallback(async () => {
    if (!previa) return;
    setProgresso({ enviadas: 0, total: previa.linhas.length, fase: 'abrindo' });
    try {
      const r = await importarMestre59({
        empresaId,
        mes: previa.mes,
        arquivoNome: previa.arquivoNome,
        conteudo: previa.conteudo,
        linhas: previa.linhas,
        onProgresso: setProgresso,
      });
      const mudancas = [
        r.grupos_novos    ? `${r.grupos_novos} grupo(s) novo(s)` : null,
        r.grupos_sumiram  ? `${r.grupos_sumiram} sumiram` : null,
        r.equipes_novas   ? `${r.equipes_novas} equipe(s) nova(s)` : null,
        r.equipes_sumiram ? `${r.equipes_sumiram} equipe(s) sumiram` : null,
      ].filter(Boolean);
      toast.success(
        `Retrato de ${r.mes} substituído: ${r.linhas.toLocaleString('pt-BR')} linhas, ${formatBRL(r.total_recebido)}.`
        + (mudancas.length ? ` ${mudancas.join(' · ')}.` : ''),
      );
      setPrevia(null);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao importar.');
    } finally {
      setProgresso(null);
    }
  }, [previa, empresaId, carregar]);

  // ── Vínculo ───────────────────────────────────────────────────────────────

  const aplicarVinculo = useCallback(async (
    cod: string, estado: EstadoVinculo, setorId: string | null,
  ) => {
    setSalvandoCod(cod);
    try {
      await vincularGrupo({ empresaId, codGrupo: cod, estado, setorId });
      // Atualiza só a linha mexida: recarregar a tela inteira aqui perderia a
      // posição de rolagem no meio de dezesseis decisões seguidas.
      setGrupos(gs => gs.map(g => g.cod_grupo_filtro === cod
        ? { ...g, estado, setor_id: setorId, setor_nome: setores.find(s => s.id === setorId)?.nome ?? null }
        : g));
      buscarEventos(empresaId).then(setEventos).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o vínculo.');
    } finally {
      setSalvandoCod(null);
    }
  }, [empresaId, setores]);

  const abrirEquipes = useCallback(async (cod: string) => {
    if (expandido === cod) { setExpandido(null); return; }
    setExpandido(cod);
    if (equipes[cod]) return;
    try {
      const lista = await buscarResumoEquipes(empresaId, mes, cod);
      setEquipes(e => ({ ...e, [cod]: lista }));
    } catch {
      setEquipes(e => ({ ...e, [cod]: [] }));
    }
  }, [expandido, equipes, empresaId, mes]);

  // ── Somas do cabeçalho ────────────────────────────────────────────────────

  const resumo = useMemo(() => {
    const totalMes    = grupos.reduce((s, g) => s + g.recebido, 0);
    const semVinculo  = grupos.filter(g => g.estado === 'novo');
    const ignorados   = grupos.filter(g => g.estado === 'ignorado');
    const vinculados  = grupos.filter(g => g.estado === 'vinculado');
    return {
      totalMes,
      semVinculoValor: semVinculo.reduce((s, g) => s + g.recebido, 0),
      semVinculoQtd:   semVinculo.length,
      ignoradoValor:   ignorados.reduce((s, g) => s + g.recebido, 0),
      vinculadoValor:  vinculados.reduce((s, g) => s + g.recebido, 0),
      vinculadoQtd:    vinculados.length,
      linhas:          grupos.reduce((s, g) => s + g.linhas, 0),
    };
  }, [grupos]);

  const loteVigente = lotes.find(l => l.estado === 'vigente') ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Faixa de contexto: esta aba não move número de ninguém ─────────── */}
      <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Fase de conferência.</span>{' '}
          O relatório 59 vive aqui em paralelo e <strong>não alimenta</strong> nenhuma tela,
          meta ou projeção ainda. O vínculo de cada grupo com um setor é feito à mão,
          pelo <span className="font-mono text-[11px]">CodGrupoFiltro</span> — o código
          sobrevive à troca de liderança, o nome não.
        </p>
      </div>

      {/* ── Importar ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Relatório mestre 59</h3>
              <p className="text-[11px] text-muted-foreground">
                {loteVigente
                  ? <>Retrato vigente de {mes}: {loteVigente.linhas.toLocaleString('pt-BR')} linhas · {formatBRL(loteVigente.total_recebido)} · carregado em {new Date(loteVigente.importado_em).toLocaleString('pt-BR')}</>
                  : <>Nenhuma carga em {mes} ainda.</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void escolherArquivo(f); }}
            />
            <Button variant="outline" size="sm" className="rounded-xl h-9"
              onClick={() => void carregar()} disabled={carregando || !!progresso}>
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', carregando && 'animate-spin')} />
              Atualizar
            </Button>
            <Button size="sm" className="rounded-xl h-9"
              onClick={() => inputRef.current?.click()} disabled={lendo || !!progresso}>
              {lendo ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              {lendo ? 'Lendo arquivo…' : 'Importar CSV'}
            </Button>
          </div>
        </div>

        {/* Prévia: nada foi gravado enquanto isto está na tela. */}
        {previa && (
          <div className="px-5 py-4 border-b border-border/40 bg-muted/20 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  {previa.arquivoNome}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {previa.linhas.length.toLocaleString('pt-BR')} linhas · {formatBRL(previa.total)} ·{' '}
                  mês <span className="font-mono">{previa.mes}</span> · {previa.grupos.length} grupos
                  {previa.descartadas > 0 && <> · <span className="text-destructive">{previa.descartadas} descartada(s)</span></>}
                </p>
                {previa.mes !== mes && (
                  <p className="text-xs text-warning mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    O arquivo é de <strong>{previa.mes}</strong> e o painel está em <strong>{mes}</strong>.
                    A carga vai para {previa.mes}, que é o mês das linhas.
                  </p>
                )}
                {loteVigente && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Isto <strong>substitui</strong> o retrato atual de {previa.mes} por completo.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-9"
                  onClick={() => setPrevia(null)} disabled={!!progresso}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-9 rounded-xl" onClick={() => void confirmar()} disabled={!!progresso}>
                  {progresso ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  {progresso
                    ? (progresso.fase === 'promovendo'
                        ? 'Trocando o retrato…'
                        : `Enviando ${progresso.enviadas.toLocaleString('pt-BR')} / ${progresso.total.toLocaleString('pt-BR')}`)
                    : 'Confirmar e substituir'}
                </Button>
              </div>
            </div>

            {progresso && (
              <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
                <div className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round((progresso.enviadas / Math.max(1, progresso.total)) * 100)}%` }} />
              </div>
            )}

            {previa.erros.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-destructive font-medium">
                  {previa.erros.length} problema(s) na leitura
                </summary>
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground font-mono text-[11px]">
                  {previa.erros.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Somas do mês vigente. */}
        {!previa && (
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {carregando ? (
              <>{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</>
            ) : (
              <>
                <Tile rotulo="Total do relatório" valor={formatBRL(resumo.totalMes)}
                  sub={`${resumo.linhas.toLocaleString('pt-BR')} linhas`} />
                <Tile rotulo="Vinculado a setor" valor={formatBRL(resumo.vinculadoValor)}
                  sub={`${resumo.vinculadoQtd} grupo(s)`} tom="ok" />
                <Tile rotulo="Sem vínculo" valor={formatBRL(resumo.semVinculoValor)}
                  sub={`${resumo.semVinculoQtd} grupo(s)`} tom={resumo.semVinculoValor > 0 ? 'alerta' : undefined} />
                <Tile rotulo="Ignorado" valor={formatBRL(resumo.ignoradoValor)} sub="fora da conta" />
              </>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {erro}
        </div>
      )}

      {/* ── Grupos ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-foreground">
            Grupos do relatório <span className="text-muted-foreground font-normal">({grupos.length})</span>
          </h3>
          {resumo.semVinculoQtd > 0 && (
            <Badge variant="outline" className="text-warning border-warning/40 bg-warning/5 text-[11px]">
              {formatBRL(resumo.semVinculoValor)} sem destino
            </Badge>
          )}
        </div>

        {carregando ? (
          <div className="p-5 space-y-2">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : grupos.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma carga do 59 em {mes}. Importe o CSV para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-5 py-2.5">Código · rótulo no relatório</th>
                  <th className="text-right font-semibold px-3 py-2.5">Linhas</th>
                  <th className="text-right font-semibold px-3 py-2.5">Recebido</th>
                  <th className="text-right font-semibold px-3 py-2.5">Colchão</th>
                  <th className="text-right font-semibold px-3 py-2.5">Extra</th>
                  <th className="text-left font-semibold px-3 py-2.5 w-[280px]">Setor do sistema</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => {
                  const aberto = expandido === g.cod_grupo_filtro;
                  const ausente = g.linhas === 0;
                  return (
                    // A `key` fica no Fragment, não nas `<tr>`: o React exige a
                    // chave no elemento mais externo que o `map` devolve, e uma
                    // linha que expande produz duas `<tr>` irmãs.
                    <Fragment key={g.cod_grupo_filtro}>
                      <tr
                        className={cn('border-b border-border/25 hover:bg-accent/20 transition-colors',
                          ausente && 'opacity-60')}>
                        <td className="px-5 py-2.5">
                          <button type="button" onClick={() => void abrirEquipes(g.cod_grupo_filtro)}
                            className="text-left group">
                            <span className="inline-flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary tabular-nums">
                                {g.cod_grupo_filtro}
                              </span>
                              <span className="font-medium text-foreground group-hover:underline">
                                {g.nome_no_relatorio || g.nome_cadastrado || '—'}
                              </span>
                            </span>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {ausente
                                ? <span className="text-warning">não veio neste mês</span>
                                : <>{g.equipes} equipe(s) · {g.cobradoras} cobradora(s) · {g.dias} dia(s)</>}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {g.linhas.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                          {formatBRL(g.recebido)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                          {g.colchao_valor > 0 ? formatBRL(g.colchao_valor) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                          {g.extra_valor > 0 ? formatBRL(g.extra_valor) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={g.estado === 'vinculado' ? (g.setor_id ?? '') : g.estado === 'ignorado' ? '__ignorado__' : '__novo__'}
                              disabled={salvandoCod === g.cod_grupo_filtro}
                              onValueChange={v => {
                                if (v === '__novo__')     void aplicarVinculo(g.cod_grupo_filtro, 'novo', null);
                                else if (v === '__ignorado__') void aplicarVinculo(g.cod_grupo_filtro, 'ignorado', null);
                                else                      void aplicarVinculo(g.cod_grupo_filtro, 'vinculado', v);
                              }}
                            >
                              <SelectTrigger className={cn('h-8 text-xs rounded-lg',
                                g.estado === 'novo' && 'border-warning/50 text-warning')}>
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
                                {setores.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <span className="flex items-center gap-1.5">
                                      <Link2 className="w-3 h-3" /> {s.nome}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {salvandoCod === g.cod_grupo_filtro && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {aberto && (
                        <tr className="bg-muted/25 border-b border-border/25">
                          <td colSpan={6} className="px-5 py-3">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                              SubgrupoEquipe neste grupo
                            </p>
                            {!equipes[g.cod_grupo_filtro] ? (
                              <Skeleton className="h-8 rounded-lg" />
                            ) : equipes[g.cod_grupo_filtro].length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhuma equipe informada nas linhas deste grupo.</p>
                            ) : (
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {equipes[g.cod_grupo_filtro].map(e => (
                                  <div key={e.nome_subgrupo || '(vazio)'}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5">
                                    <span className="text-xs text-foreground truncate">
                                      {e.nome_subgrupo || <span className="italic text-muted-foreground">(sem equipe)</span>}
                                    </span>
                                    <span className="text-xs tabular-nums font-medium text-muted-foreground shrink-0">
                                      {formatBRL(e.recebido)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Histórico</h3>
          <span className="text-[11px] text-muted-foreground">
            rótulo que aparece, some ou muda de vínculo
          </span>
        </div>
        {carregando ? (
          <div className="p-5 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
        ) : eventos.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Sem eventos ainda.
          </div>
        ) : (
          <ul className="divide-y divide-border/25 max-h-[360px] overflow-y-auto">
            {eventos.map(ev => (
              <li key={ev.id} className="px-5 py-2.5 flex items-start gap-3 text-xs">
                <span className={cn('mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                  EVENTO_ALERTA.has(ev.tipo) ? 'bg-warning' : 'bg-muted-foreground/40')} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{ROTULO_EVENTO[ev.tipo] ?? ev.tipo}</span>
                  {ev.cod_grupo_filtro && (
                    <span className="font-mono text-[10px] ml-1.5 px-1 py-0.5 rounded bg-muted text-muted-foreground">
                      {ev.cod_grupo_filtro}
                    </span>
                  )}
                  {ev.rotulo && <span className="text-muted-foreground ml-1.5 truncate">{ev.rotulo}</span>}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {new Date(ev.criado_em).toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Cargas do mês ───────────────────────────────────────────────────── */}
      {lotes.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40">
            <h3 className="text-sm font-bold text-foreground">Cargas de {mes}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              O hash é do conteúdo do arquivo. Dois hashes iguais = o ERP reescreveu sem dado novo.
            </p>
          </div>
          <ul className="divide-y divide-border/25">
            {lotes.map(l => (
              <li key={l.id} className="px-5 py-2.5 flex items-center gap-3 text-xs flex-wrap">
                <Badge variant="outline" className={cn('text-[10px] shrink-0',
                  l.estado === 'vigente'     && 'text-success border-success/40 bg-success/5',
                  l.estado === 'substituido' && 'text-muted-foreground',
                  l.estado === 'descartado'  && 'text-destructive border-destructive/30',
                  l.estado === 'aberto'      && 'text-warning border-warning/40')}>
                  {l.estado}
                </Badge>
                <span className="font-medium text-foreground truncate max-w-[240px]">{l.arquivo_nome}</span>
                <span className="text-muted-foreground tabular-nums">
                  {l.linhas.toLocaleString('pt-BR')} linhas · {formatBRL(l.total_recebido)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{l.arquivo_hash.slice(0, 12)}</span>
                <span className="text-muted-foreground ml-auto tabular-nums shrink-0">
                  {new Date(l.importado_em).toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ rotulo, valor, sub, tom }: {
  rotulo: string; valor: string; sub: string; tom?: 'ok' | 'alerta';
}) {
  return (
    <div className={cn('rounded-xl border px-3.5 py-2.5',
      tom === 'alerta' ? 'border-warning/40 bg-warning/5'
        : tom === 'ok' ? 'border-success/30 bg-success/5'
        : 'border-border/40 bg-background/50')}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{rotulo}</p>
      <p className={cn('text-base font-bold tabular-nums mt-0.5',
        tom === 'alerta' ? 'text-warning' : tom === 'ok' ? 'text-success' : 'text-foreground')}>
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export default Mestre59;
