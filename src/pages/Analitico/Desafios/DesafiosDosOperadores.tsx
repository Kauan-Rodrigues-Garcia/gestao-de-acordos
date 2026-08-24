/**
 * DesafiosDosOperadores — onde o líder distribui o desafio de cada operador.
 *
 * ## Por que isto substituiu o campo de texto
 *
 * A primeira versão pedia as metas num `textarea`, no formato `login = valor`.
 * Funciona para quem tem a planilha aberta ao lado e sabe o login de cor —
 * ninguém. Errar um login não dava erro: a pessoa simplesmente não entrava na
 * campanha, e o líder só descobria quando alguém reclamasse de não estar no
 * ranking.
 *
 * Agora a lista vem do banco, agrupada por equipe, com foto e nome. Digitar o
 * valor ao lado da pessoa é a única forma de não errar de pessoa.
 *
 * O modo "colar em bloco" continua ali, escondido atrás de um botão, porque
 * colar 27 valores de uma planilha é legítimo e é como a primeira campanha
 * nasceu. Ele agora AVISA qual login não casou com ninguém, em vez de engolir.
 *
 * ## Atalhos que o líder pediria de qualquer jeito
 *
 * Aplicar o mesmo valor a uma equipe inteira, e limpar a equipe. Uma campanha
 * costuma ter dois ou três patamares de valor, não vinte e sete.
 *
 * ## O total por equipe é PROJEÇÃO
 *
 * Está aqui para o líder ver quanto a equipe soma enquanto distribui — é
 * controle e projeção, não um alvo da equipe. Quem tem desafio é o operador.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Search, Users, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { PessoaDesafio } from '@/services/desafios/types';
import { AvatarParticipante } from './AvatarParticipante';
import {
  aplicarBlocoDeMetas, valorDigitado, type ValoresPorPessoa,
} from './metasDoDesafio';

interface Props {
  pessoas: PessoaDesafio[];
  carregando: boolean;
  valores: ValoresPorPessoa;
  onChange: (valores: ValoresPorPessoa) => void;
}

interface Grupo {
  equipeId: string;
  equipeNome: string;
  pessoas: PessoaDesafio[];
}

export function DesafiosDosOperadores({ pessoas, carregando, valores, onChange }: Props) {
  const [busca, setBusca] = useState('');
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [blocoAberto, setBlocoAberto] = useState(false);
  const [bloco, setBloco] = useState('');
  const [naoCasaram, setNaoCasaram] = useState<string[]>([]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pessoas;
    return pessoas.filter(p =>
      p.nome.toLowerCase().includes(termo)
      || (p.usuario ?? '').toLowerCase().includes(termo)
      || p.equipeNome.toLowerCase().includes(termo));
  }, [pessoas, busca]);

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const p of filtradas) {
      const id = p.equipeId ?? '__sem_equipe__';
      const g = mapa.get(id);
      if (g) g.pessoas.push(p);
      else mapa.set(id, {
        equipeId: id,
        equipeNome: p.equipeId ? p.equipeNome : 'Sem equipe',
        pessoas: [p],
      });
    }
    return [...mapa.values()].sort((a, b) => a.equipeNome.localeCompare(b.equipeNome, 'pt-BR'));
  }, [filtradas]);

  /** Quantos e quanto, no geral. É o número que o líder confere no fim. */
  const resumo = useMemo(() => {
    let total = 0;
    let comDesafio = 0;
    for (const p of pessoas) {
      const v = valorDigitado(valores[p.id]);
      if (v > 0) { total += v; comDesafio += 1; }
    }
    return { total, comDesafio };
  }, [pessoas, valores]);

  function definir(pessoaId: string, texto: string) {
    onChange({ ...valores, [pessoaId]: texto });
  }

  /** Mesmo valor para a equipe inteira — dois ou três patamares é o normal. */
  function aplicarNaEquipe(grupo: Grupo, texto: string) {
    const novo = { ...valores };
    for (const p of grupo.pessoas) novo[p.id] = texto;
    onChange(novo);
  }

  function limparEquipe(grupo: Grupo) {
    const novo = { ...valores };
    for (const p of grupo.pessoas) delete novo[p.id];
    onChange(novo);
  }

  /** Colar em bloco. A regra mora em `metasDoDesafio`, testada sem React. */
  function aplicarBloco() {
    const { valores: novos, naoCasaram: orfaos } =
      aplicarBlocoDeMetas(bloco, pessoas, valores);
    onChange(novos);
    setNaoCasaram(orfaos);
    if (!orfaos.length) setBlocoAberto(false);
  }

  function alternar(equipeId: string) {
    setRecolhidas(atual => {
      const proximo = new Set(atual);
      if (proximo.has(equipeId)) proximo.delete(equipeId);
      else proximo.add(equipeId);
      return proximo;
    });
  }

  if (carregando) {
    return (
      <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
        Carregando os operadores…
      </div>
    );
  }

  if (!pessoas.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Nenhum operador disponível. Verifique se a migration dos Desafios foi
        aplicada e se o seu cargo tem a permissão de configurar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Busca + resumo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, login ou equipe"
            className="h-9 pl-8"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5"
          onClick={() => setBlocoAberto(a => !a)}>
          <Wand2 className="h-3.5 w-3.5" /> Colar em bloco
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium text-foreground">
          {resumo.comDesafio} de {pessoas.length} com desafio
        </span>
        <span className="text-muted-foreground">
          Soma dos desafios: <strong className="text-foreground">{formatBRL(resumo.total)}</strong>
        </span>
        <span className="text-muted-foreground">
          Quem ficar sem valor não entra na campanha.
        </span>
      </div>

      {/* Colar em bloco */}
      {blocoAberto && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Textarea
            rows={6}
            value={bloco}
            onChange={e => setBloco(e.target.value)}
            className="font-mono text-xs"
            placeholder={'kauan_teixeira = 40857,14\nthiago_alves = 15714,29'}
          />
          <p className="text-[11px] text-muted-foreground">
            Uma linha por pessoa, <code>login = valor</code>. Aceita também
            <code> login: valor</code> e colunas separadas por tabulação —
            colar direto da planilha funciona.
          </p>
          {naoCasaram.length > 0 && (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              Sem operador com este login: {naoCasaram.join(', ')}. Confira a
              grafia — esses valores não foram aplicados.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={aplicarBloco}>Aplicar</Button>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => { setBlocoAberto(false); setNaoCasaram([]); }}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* A lista, por equipe */}
      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {grupos.map(grupo => {
          const recolhida = recolhidas.has(grupo.equipeId);
          const somaEquipe = grupo.pessoas.reduce((s, p) => s + valorDigitado(valores[p.id]), 0);
          return (
            <div key={grupo.equipeId} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-2 py-1.5">
                <button type="button" onClick={() => alternar(grupo.equipeId)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                    recolhida && '-rotate-90',
                  )} />
                  <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-semibold text-foreground">
                    {grupo.equipeNome}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    ({grupo.pessoas.length})
                  </span>
                </button>

                {/* Projeção da equipe: soma dos desafios de quem está nela. */}
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatBRL(somaEquipe)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    aria-label={`Aplicar valor a toda a equipe ${grupo.equipeNome}`}
                    placeholder="valor p/ todos"
                    className="h-7 w-[110px] text-xs"
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const alvo = e.currentTarget;
                      if (alvo.value.trim()) aplicarNaEquipe(grupo, alvo.value.trim());
                      alvo.value = '';
                    }}
                  />
                  <Button type="button" variant="ghost" size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => limparEquipe(grupo)}>
                    Limpar
                  </Button>
                </div>
              </div>

              {!recolhida && (
                <ul className="divide-y divide-border">
                  {grupo.pessoas.map(p => {
                    const valor = valores[p.id] ?? '';
                    const semDesafio = valorDigitado(valor) <= 0;
                    return (
                      <li key={p.id} className="flex items-center gap-2 px-2 py-1.5">
                        <AvatarParticipante
                          nome={p.nome} fotoUrl={p.fotoUrl} className="h-7 w-7 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{p.nome}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {p.usuario ?? 'sem login'}
                            {p.situacao !== 'ativo' && ` · ${p.situacao}`}
                          </p>
                        </div>
                        <Input
                          inputMode="decimal"
                          value={valor}
                          onChange={e => definir(p.id, e.target.value)}
                          placeholder="—"
                          aria-label={`Desafio de ${p.nome}`}
                          className={cn(
                            'h-7 w-[120px] shrink-0 text-right text-xs tabular-nums',
                            semDesafio && 'text-muted-foreground',
                          )}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {!grupos.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhum operador encontrado para «{busca}».
          </p>
        )}
      </div>
    </div>
  );
}

export default DesafiosDosOperadores;
