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
import { Search, ChevronDown, Loader2, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PERFIL_LABELS } from '@/lib/index';
import { type UsoPorPessoa } from '@/services/uso.service';
import { numeroBr, tempoRelativo, iniciais, formatarDuracao } from './formatos';
import PerfilPessoa from './PerfilPessoa';

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
                  // A chave era `usuario_id + empresa_id` porque a lista trazia
                  // a mesma pessoa uma vez por operação. Desde a migration
                  // 20260824160000 é uma linha por PESSOA — a empresa saiu da
                  // chave junto com a duplicidade.
                  key={p.usuario_id}
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
                          <Building2 className="w-2.5 h-2.5" />
                          {/* Quem usa as duas operações aparece com as duas. A
                              lista deixou de repetir a pessoa; a informação de
                              onde ela trabalhou vive aqui agora. */}
                          {(p.empresas?.length ?? 0) > 1
                            ? p.empresas!.join(' + ')
                            : p.empresa_nome}
                        </Badge>
                      )}
                      {/* Setor e equipe do cadastro de hoje: são o mesmo eixo
                          dos filtros acima, e sem eles a lista filtrada não
                          diz por que aquelas pessoas estão ali. */}
                      {p.setor_nome && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {p.setor_nome}
                        </Badge>
                      )}
                      {p.equipe_nome && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {p.equipe_nome}
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

      <PerfilPessoa
        pessoa={aberta}
        desde={desde}
        ate={ate}
        onFechar={() => setAberta(null)}
      />
    </Card>
  );
}

