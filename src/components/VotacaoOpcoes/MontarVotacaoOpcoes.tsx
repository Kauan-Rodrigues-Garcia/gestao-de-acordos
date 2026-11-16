/**
 * MontarVotacaoOpcoes — Configurações › Eventos e gincanas › «Votação de
 * opções» (16/11/2026): montar e liberar.
 *
 *   1. o texto: título, pergunta e as opções (título, emoji, resumo, «como
 *      funciona», itens, foto) — vem com a de dezembro (prêmios × happy hour);
 *   2. quem vota: cargos, setores, equipes, pessoa por pessoa (`publico.ts`);
 *   3. «Ver como fica» (a tela de verdade, sem gravar) e «Liberar».
 *
 * O rascunho fica neste navegador; só vai para o banco ao liberar.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Eye, Loader2, Plus, RotateCcw, Search, Send, Trash2, UserPlus, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { FotoLider } from '@/components/VotacaoLideres/FotoLider';
import { nomeCurto } from '@/components/VotacaoLideres/cedula';
import type { EquipeDaVotacao, GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import { faltaMigration, liberar as liberarNoBanco, mensagemDoErro, type DadosParaLiberar } from './banco';
import {
  MAX_OPCOES, MIN_OPCOES, VOTACAO_DEZEMBRO, conteudoDoRascunho, novoIdDeOpcao, opcoesParaGravar, problemasDoConteudo,
  type ConteudoDaVotacao, type OpcaoDaVotacao,
} from './opcoes';
import { montarPublico, publicoPadrao, resumoDoPublico, type RascunhoPublico } from './publico';
import { TelaVotacaoOpcoes } from './TelaVotacaoOpcoes';

const CHAVE = 'votacao-opcoes:rascunho:v1';
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ehLista = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

interface Rascunho { conteudo: ConteudoDaVotacao; publico: RascunhoPublico }
const padrao = (): Rascunho => ({ conteudo: structuredClone(VOTACAO_DEZEMBRO), publico: publicoPadrao() });

function lerRascunho(): Rascunho {
  const base = padrao();
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return base;
    const r = JSON.parse(bruto) as Partial<Rascunho>;
    const p = (r.publico ?? {}) as Partial<RascunhoPublico>;
    const lista = (k: keyof RascunhoPublico) => (ehLista(p[k]) ? p[k] as string[] : base.publico[k]);
    return {
      conteudo: conteudoDoRascunho(r.conteudo) ?? base.conteudo,
      publico: {
        cargos: lista('cargos'), setores: lista('setores'), equipesFora: lista('equipesFora'),
        fora: lista('fora'), voltaram: lista('voltaram'), incluidos: lista('incluidos'),
      },
    };
  } catch { return base; }
}

const titulo3 = 'text-sm font-semibold';
const chip = (ativo: boolean) => cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60');
const dica = (p: Participante) => `${p.nome} — ${PERFIL_LABELS[p.perfil] ?? p.perfil} · ${p.setor}${p.empresa ? ` · ${p.empresa}` : ''}`;
const linhas = (t: string) => t.split('\n');

function EditorDaOpcao({ opcao, indice, podeTirar, onMudar, onTirar }: {
  opcao: OpcaoDaVotacao; indice: number; podeTirar: boolean; onMudar: (o: Partial<OpcaoDaVotacao>) => void; onTirar: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opção {indice + 1}</p>
        {podeTirar && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={onTirar}>
            <Trash2 className="h-3.5 w-3.5" /> Tirar
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Input value={opcao.emoji} onChange={e => onMudar({ emoji: e.target.value.slice(0, 8) })} className="h-9 w-14 text-center text-lg" aria-label={`Emoji da opção ${indice + 1}`} />
        <Input value={opcao.titulo} onChange={e => onMudar({ titulo: e.target.value.slice(0, 80) })} placeholder="Título" className="h-9" aria-label={`Título da opção ${indice + 1}`} />
      </div>
      <Textarea value={opcao.resumo} onChange={e => onMudar({ resumo: e.target.value.slice(0, 240) })} rows={2} placeholder="Resumo (uma ou duas frases)" className="text-sm" aria-label={`Resumo da opção ${indice + 1}`} />
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Como funciona — uma linha cada</span>
        <Textarea value={opcao.detalhes.join('\n')} onChange={e => onMudar({ detalhes: linhas(e.target.value) })} rows={3} className="text-sm" />
      </label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Título da lista</span>
          <Input value={opcao.rotuloItens} onChange={e => onMudar({ rotuloItens: e.target.value.slice(0, 60) })} placeholder="Ex.: Ideias de prêmios" className="h-9 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Itens em etiquetas — um por linha (vazio: não aparece)</span>
          <Textarea value={opcao.itens.join('\n')} onChange={e => onMudar({ itens: linhas(e.target.value) })} rows={3} className="text-sm" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Foto — link da imagem (vazio: aparece o emoji)</span>
        <Input value={opcao.foto ?? ''} onChange={e => onMudar({ foto: e.target.value || null })} placeholder="https://…" className="h-9 text-sm" />
      </label>
    </div>
  );
}

interface Props {
  dados: { pessoas: Participante[]; grupos: GrupoDaVotacao[]; equipes: EquipeDaVotacao[] };
  onLiberada: () => void;
  /** Laboratório: troca o banco por outra coisa. */
  liberar?: (d: DadosParaLiberar) => Promise<unknown>;
}

export function MontarVotacaoOpcoes({ dados, onLiberada, liberar = liberarNoBanco }: Props) {
  const [r, setR] = useState<Rascunho>(lerRascunho);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* só na tela */ } }, [r]);
  const c = r.conteudo;
  const pub = r.publico;
  const mudarConteudo = (p: Partial<ConteudoDaVotacao>) => setR(a => ({ ...a, conteudo: { ...a.conteudo, ...p } }));
  const mudarPublico = (p: Partial<RascunhoPublico>) => setR(a => ({ ...a, publico: { ...a.publico, ...p } }));
  const alternar = (k: 'cargos' | 'equipesFora' | 'fora' | 'voltaram', id: string) =>
    mudarPublico({ [k]: pub[k].includes(id) ? pub[k].filter(x => x !== id) : [...pub[k], id] });
  const mudarOpcao = (i: number, p: Partial<OpcaoDaVotacao>) => mudarConteudo({ opcoes: c.opcoes.map((o, j) => (j === i ? { ...o, ...p } : o)) });

  const m = useMemo(() => montarPublico(dados, pub), [dados, pub]);
  const [verLista, setVerLista] = useState(false);
  const [buscaLista, setBuscaLista] = useState('');
  const [buscaIncluir, setBuscaIncluir] = useState('');
  const [vendo, setVendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [liberando, setLiberando] = useState(false);

  const nomeDoSetor = useMemo(() => new Map(dados.grupos.flatMap(g => g.setores.map(s => [s.id, s.nome] as const))), [dados.grupos]);
  const idsEleitores = useMemo(() => new Set(m.eleitores.map(p => p.id)), [m.eleitores]);
  const achados = useMemo(() => {
    const termo = semAcento(buscaIncluir.trim());
    if (termo.length < 2) return [];
    return dados.pessoas.filter(p => !idsEleitores.has(p.id) && semAcento(p.nome).includes(termo)).slice(0, 8);
  }, [buscaIncluir, dados.pessoas, idsEleitores]);
  const listaPorBloco = useMemo(() => {
    const termo = semAcento(buscaLista.trim());
    const blocos = new Map<string, Participante[]>();
    for (const p of m.doFiltro) {
      if (termo && !semAcento(p.nome).includes(termo)) continue;
      const k = `${p.setor} · ${m.equipeDe(p)}`;
      blocos.set(k, [...(blocos.get(k) ?? []), p]);
    }
    return [...blocos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [m, buscaLista]);

  const problemas = [...problemasDoConteudo(c), ...(m.eleitores.length ? [] : ['Escolha quem vota: marque setores (e equipes) ou inclua pessoas à mão.'])];
  const opcoesLimpa = useMemo(() => opcoesParaGravar(c.opcoes), [c.opcoes]);

  const fazerLiberar = async () => {
    setLiberando(true);
    try {
      await liberar({
        titulo: c.titulo.trim().slice(0, 120), pergunta: c.pergunta.trim().slice(0, 300), opcoes: opcoesLimpa,
        eleitores: m.eleitores.map(p => p.id), publico: resumoDoPublico(m, pub),
      });
      toast.success('Votação liberada', { description: `${m.eleitores.length} pessoas vão ver a votação na tela.` });
      setConfirmando(false);
      onLiberada();
    } catch (e) {
      toast.error('Não deu para liberar', {
        description: faltaMigration(e) ? 'O banco ainda não tem a votação de opções (migration 20261116190000).' : mensagemDoErro(e),
      });
    } finally {
      setLiberando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. O texto */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={titulo3}>1. A votação</h3>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => mudarConteudo(structuredClone(VOTACAO_DEZEMBRO))}>
            <RotateCcw className="h-3.5 w-3.5" /> Voltar ao texto de dezembro
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Título (aparece no aviso)</span>
            <Input value={c.titulo} onChange={e => mudarConteudo({ titulo: e.target.value.slice(0, 120) })} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Pergunta (no alto da tela)</span>
            <Input value={c.pergunta} onChange={e => mudarConteudo({ pergunta: e.target.value.slice(0, 300) })} className="h-9" />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {c.opcoes.map((o, i) => (
            <EditorDaOpcao key={o.id} opcao={o} indice={i} podeTirar={c.opcoes.length > MIN_OPCOES}
              onMudar={p => mudarOpcao(i, p)} onTirar={() => mudarConteudo({ opcoes: c.opcoes.filter((_, j) => j !== i) })} />
          ))}
        </div>
        {c.opcoes.length < MAX_OPCOES && (
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => mudarConteudo({ opcoes: [...c.opcoes, { id: novoIdDeOpcao(c.opcoes.map(o => o.id)), titulo: '', emoji: '⭐', resumo: '', foto: null, detalhes: [], rotuloItens: '', itens: [] }] })}>
            <Plus className="h-4 w-4" /> Mais uma opção
          </Button>
        )}
      </section>

      {/* 2. Quem vota */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={titulo3}>2. Quem vota <span className="font-normal text-muted-foreground">· {m.eleitores.length} {m.eleitores.length === 1 ? 'pessoa' : 'pessoas'}</span></h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cargos que votam">
            {m.cargos.map(({ cargo, total }) => (
              <button key={cargo} type="button" className={chip(pub.cargos.includes(cargo))} aria-pressed={pub.cargos.includes(cargo)}
                onClick={() => alternar('cargos', cargo)}>
                {PERFIL_LABELS[cargo] ?? cargo} <span className="opacity-70">{total}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Escolha os cargos, marque um setor ou vários; dentro de cada setor as equipes vêm todas marcadas — toque para tirar uma equipe inteira.
          Para um operador só, ou alguém de fora, use «Incluir pessoa». O número é quantos têm os cargos escolhidos.
        </p>
        <div className="space-y-2.5 rounded-lg border p-2.5">
          {m.grupos.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Nenhum setor tem alguém com esses cargos.</p>}
          {m.grupos.map(g => {
            const ids = g.setores.map(s => s.id);
            const todos = ids.every(id => m.marcados.has(id));
            return (
              <div key={g.chave}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.rotulo}</p>
                  <button type="button" className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => { const n = new Set(m.marcados); ids.forEach(id => (todos ? n.delete(id) : n.add(id))); mudarPublico({ setores: [...n] }); }}>
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Setores de ${g.rotulo}`}>
                  {g.setores.map(s => {
                    const ativo = m.marcados.has(s.id);
                    return (
                      <button key={s.id} type="button" className={chip(ativo)} aria-pressed={ativo}
                        onClick={() => mudarPublico({ setores: ativo ? [...m.marcados].filter(x => x !== s.id) : [...m.marcados, s.id] })}>
                        {s.nome} <span className="opacity-70">{m.porSetor.get(s.id) ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {m.marcados.size > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipes dos setores marcados</p>
            {[...m.equipesPorSetor.entries()].map(([setorId, equipes]) => (
              <div key={setorId} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 min-w-[90px] text-xs font-medium">{nomeDoSetor.get(setorId) ?? 'Setor'}</span>
                {equipes.map(e => {
                  const dentro = !pub.equipesFora.includes(e.chave);
                  return (
                    <button key={e.chave} type="button" className={chip(dentro)} aria-pressed={dentro} onClick={() => alternar('equipesFora', e.chave)}>
                      {e.nome} <span className="opacity-70">{e.total}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {m.contas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2.5 text-xs">
            <span className="text-muted-foreground">Contas que não parecem pessoa (ficam fora):</span>
            {m.contas.map(({ p, motivo }) => {
              const voltou = pub.voltaram.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => alternar('voltaram', p.id)} aria-pressed={voltou} title={`${dica(p)} · ${motivo}`}
                  className={cn('rounded-full border px-2 py-0.5', voltou ? 'border-primary bg-primary/10' : 'text-muted-foreground line-through opacity-70 hover:opacity-100')}>
                  {p.nome}
                </button>
              );
            })}
          </div>
        )}

        {/* Incluir à mão */}
        <div className="space-y-1.5">
          <div className="relative max-w-md">
            <UserPlus className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={buscaIncluir} onChange={e => setBuscaIncluir(e.target.value)} placeholder="Incluir pessoa pelo nome (2 letras ou mais)"
              className="h-9 pl-8 text-sm" aria-label="Incluir pessoa" />
          </div>
          {buscaIncluir.trim().length >= 2 && (
            <ul className="max-w-md divide-y overflow-hidden rounded-lg border">
              {achados.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Ninguém com esse nome fora da lista.</li>}
              {achados.map(p => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() => { mudarPublico({ incluidos: [...pub.incluidos.filter(x => x !== p.id), p.id], fora: pub.fora.filter(x => x !== p.id) }); setBuscaIncluir(''); }}>
                    <FotoLider lider={p} className="h-7 w-7 text-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.nome}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{PERFIL_LABELS[p.perfil] ?? p.perfil} · {p.setor}</span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {m.incluidos.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Incluídos à mão">
              {m.incluidos.map(p => (
                <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 py-0.5 pl-0.5 pr-1 text-xs" title={dica(p)}>
                  <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                  <span className="text-[10px] text-muted-foreground">· {p.setor}</span>
                  <button type="button" onClick={() => mudarPublico({ incluidos: pub.incluidos.filter(x => x !== p.id) })} aria-label={`Tirar ${p.nome}`}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* A lista, pessoa por pessoa */}
        {m.doFiltro.length > 0 && (
          <div className="rounded-lg border">
            <button type="button" onClick={() => setVerLista(v => !v)} aria-expanded={verLista}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40">
              <span>Ver a lista pelo filtro e tirar alguém ({m.doFiltro.length}{pub.fora.length ? ` · ${pub.fora.length} tirados` : ''})</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', verLista && 'rotate-180')} />
            </button>
            {verLista && (
              <div className="space-y-2.5 border-t p-2.5">
                <div className="relative max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={buscaLista} onChange={e => setBuscaLista(e.target.value)} placeholder="Buscar na lista" className="h-8 pl-8 text-xs" aria-label="Buscar na lista" />
                </div>
                {listaPorBloco.map(([bloco, pessoas]) => (
                  <div key={bloco}>
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{bloco}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pessoas.map(p => {
                        const conta = m.contas.some(x => x.p.id === p.id) && !pub.voltaram.includes(p.id);
                        const fora = conta || pub.fora.includes(p.id);
                        return (
                          <button key={p.id} type="button" disabled={conta} onClick={() => alternar('fora', p.id)} aria-pressed={!fora}
                            title={`${dica(p)}${fora ? ' (fora)' : ''}`}
                            className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors',
                              fora ? 'border-dashed text-muted-foreground line-through opacity-60' : 'bg-card hover:border-primary/60')}>
                            <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Ver e liberar */}
      <section className="space-y-2.5">
        <h3 className={titulo3}>3. Ver e liberar</h3>
        {problemas.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">
            {problemas.map(p => <li key={p}>• {p}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setVendo(true)} disabled={problemasDoConteudo(c).length > 0}>
            <Eye className="h-4 w-4" /> Ver como fica
          </Button>
          <Button className="gap-1.5" disabled={problemas.length > 0} onClick={() => setConfirmando(true)}>
            <Send className="h-4 w-4" /> Liberar para {m.eleitores.length} {m.eleitores.length === 1 ? 'pessoa' : 'pessoas'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ao liberar, a votação abre sozinha na tela de cada pessoa da lista (uma vez por sessão) e fica um botão no pé da tela até ela votar.
          A lista fica congelada: quem entrar no cadastro depois não recebe.
        </p>
      </section>

      {vendo && (
        <TelaVotacaoOpcoes demo titulo={c.titulo} pergunta={c.pergunta} opcoes={opcoesLimpa} rotuloFechar="Fechar a demonstração"
          onFechar={() => setVendo(false)} />
      )}

      <AlertDialog open={confirmando} onOpenChange={o => { if (!liberando) setConfirmando(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar «{c.titulo.trim()}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {m.eleitores.length} {m.eleitores.length === 1 ? 'pessoa vai' : 'pessoas vão'} ver a votação na tela, com {c.opcoes.length} opções:{' '}
              {opcoesLimpa.map(o => o.titulo).join(' ou ')}. Depois de liberada, o texto e a lista não mudam; dá para encerrar, reabrir ou cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={liberando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={liberando} onClick={e => { e.preventDefault(); void fazerLiberar(); }}>
              {liberando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
