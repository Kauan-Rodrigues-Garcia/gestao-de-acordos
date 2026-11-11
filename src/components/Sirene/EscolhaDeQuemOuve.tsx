/**
 * EscolhaDeQuemOuve — «para quem» a sirene toca (refeito em 11/11/2026).
 *
 * Antes eram duas caixinhas apertadas, uma com os setores e outra com TODAS as
 * equipes da empresa misturadas, em letra miúda. Agora:
 *   - duas opções grandes: «Todos» ou «Escolher»; nada vem escolhido;
 *   - cada setor é uma linha: marcar = o setor inteiro; a seta abre as equipes
 *     dele, para escolher só algumas;
 *   - busca por setor ou equipe, e os escolhidos aparecem em etiquetas com «×».
 * Só apresentação: a regra está em `quemOuve.ts`.
 */
import { useState } from 'react';
import { Check, ChevronDown, Search, Users, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  NINGUEM, TODOS, agruparPorSetor, alternarEquipe, alternarSetor,
  type Alvo, type EquipeDaSirene, type SetorDaSirene,
} from './quemOuve';

interface Props {
  setores: readonly SetorDaSirene[];
  equipes: readonly EquipeDaSirene[];
  valor: Alvo;
  onMudar: (a: Alvo) => void;
  /** Prefixo dos ids (dois seletores na mesma tela). */
  id: string;
}

export function EscolhaDeQuemOuve({ setores, equipes, valor, onMudar, id }: Props) {
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const grupos = agruparPorSetor(setores, equipes, busca);
  const buscando = busca.trim() !== '';
  const nomeDoSetor = (sid: string | null) => setores.find(s => s.id === sid)?.nome;
  const escolhidos = valor.setores.length + valor.equipes.length;

  const abrir = (sid: string) => setAbertos(a => {
    const n = new Set(a);
    if (n.has(sid)) n.delete(sid); else n.add(sid);
    return n;
  });

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Para quem toca" className="grid gap-2 sm:grid-cols-2">
        {([
          [true, 'Todos', 'Todos os setores e equipes da empresa'],
          [false, 'Escolher', 'Só os setores ou equipes que eu marcar'],
        ] as const).map(([todos, titulo, texto]) => {
          const ativo = valor.todos === todos;
          return (
            <button
              key={titulo} type="button" role="radio" aria-checked={ativo}
              onClick={() => onMudar(todos ? { ...TODOS } : (valor.todos ? { ...NINGUEM } : valor))}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                ativo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
              )}
            >
              <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', ativo ? 'border-primary bg-primary' : 'border-muted-foreground/50')}>
                {ativo && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{texto}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!valor.todos && (
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          {/* O que já está escolhido, com «×» para tirar. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {escolhidos === 0 ? (
              <span className="text-xs text-warning">Nada escolhido ainda: marque um setor inteiro ou abra o setor e marque as equipes.</span>
            ) : (
              <>
                {valor.setores.map(sid => (
                  <Etiqueta key={sid} texto={nomeDoSetor(sid) ?? 'Setor de outra empresa'} detalhe="setor inteiro"
                    onTirar={() => onMudar({ ...valor, setores: valor.setores.filter(s => s !== sid) })} />
                ))}
                {valor.equipes.map(eid => {
                  const e = equipes.find(x => x.id === eid);
                  return (
                    <Etiqueta key={eid} texto={e?.nome ?? 'Equipe de outra empresa'} detalhe={nomeDoSetor(e?.setor_id ?? null) ?? 'equipe'}
                      onTirar={() => onMudar({ ...valor, equipes: valor.equipes.filter(x => x !== eid) })} />
                  );
                })}
                <button type="button" onClick={() => onMudar({ ...NINGUEM })}
                  className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Limpar
                </button>
              </>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar setor ou equipe"
              aria-label="Buscar setor ou equipe" className="h-9 pl-8" id={`${id}-busca`} />
          </div>

          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-label="Setores e equipes">
            {grupos.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {buscando ? 'Nenhum setor ou equipe com esse nome.' : 'Nenhum setor cadastrado.'}
              </li>
            )}
            {grupos.map(g => {
              const sid = g.setor?.id ?? '__sem_setor__';
              const inteiro = !!g.setor && valor.setores.includes(g.setor.id);
              const marcadas = g.equipes.filter(e => valor.equipes.includes(e.id)).length;
              const aberto = buscando || abertos.has(sid) || !g.setor;
              return (
                <li key={sid}>
                  <div className={cn('flex items-center gap-2 px-3 py-2', inteiro && 'bg-primary/5')}>
                    {g.setor ? (
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <Checkbox checked={inteiro} onCheckedChange={() => onMudar(alternarSetor(valor, g.setor!.id, equipes))}
                          aria-label={`Setor ${g.setor.nome} inteiro`} />
                        <span className="min-w-0 truncate text-sm font-medium">{g.setor.nome}</span>
                        {inteiro
                          ? <span className="shrink-0 text-[11px] text-primary">setor inteiro</span>
                          : marcadas > 0 && <span className="shrink-0 text-[11px] text-primary">{marcadas} de {g.equipes.length} {g.equipes.length === 1 ? 'equipe' : 'equipes'}</span>}
                      </label>
                    ) : (
                      <span className="flex flex-1 items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> Equipes sem setor
                      </span>
                    )}
                    {g.setor && g.equipes.length > 0 && !buscando && (
                      <button type="button" onClick={() => abrir(sid)} aria-expanded={aberto}
                        aria-label={`${aberto ? 'Fechar' : 'Ver'} as equipes de ${g.setor.nome}`}
                        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {g.equipes.length} {g.equipes.length === 1 ? 'equipe' : 'equipes'}
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} />
                      </button>
                    )}
                    {g.setor && g.equipes.length === 0 && <span className="shrink-0 text-[11px] text-muted-foreground">sem equipes</span>}
                  </div>
                  {aberto && g.equipes.length > 0 && (
                    <div className="grid gap-x-4 gap-y-0.5 bg-muted/30 px-3 py-2 pl-9 sm:grid-cols-2">
                      {g.equipes.map(e => {
                        const marcada = inteiro || valor.equipes.includes(e.id);
                        return (
                          <label key={e.id} className={cn('flex items-center gap-2 rounded px-1 py-1 text-sm', inteiro ? 'cursor-default text-muted-foreground' : 'cursor-pointer hover:bg-muted')}>
                            <Checkbox checked={marcada} disabled={inteiro} onCheckedChange={() => onMudar(alternarEquipe(valor, e))}
                              aria-label={`Equipe ${e.nome}`} />
                            <span className="truncate">{e.nome}</span>
                          </label>
                        );
                      })}
                      {inteiro && <p className="col-span-full pt-1 text-[11px] text-muted-foreground">O setor inteiro já está marcado: todas as equipes dele ouvem.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Etiqueta({ texto, detalhe, onTirar }: { texto: string; detalhe: string; onTirar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-1 text-xs">
      <Check className="h-3 w-3 text-primary" aria-hidden="true" />
      <span className="font-medium">{texto}</span>
      <span className="text-muted-foreground">· {detalhe}</span>
      <button type="button" onClick={onTirar} aria-label={`Tirar ${texto}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
