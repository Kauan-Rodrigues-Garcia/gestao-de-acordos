/**
 * TelaComAbas — uma tela do menu cujas abas são outras telas.
 *
 * ## De onde veio
 *
 * O Mapa de Abas (29/09/2026) juntou telas que respondiam a mesma pergunta em
 * lugares diferentes: Dashboard – ADM e Controle de Números viraram o Núcleo;
 * Fechamento e RH Gestão, o Fechamento do mês; as abas técnicas do Painel
 * Diretoria, Administração › Dados. Em todos os casos a tela de dentro já
 * existia e funcionava — o que mudou foi o endereço. Este componente é a
 * moldura comum, para cada junção não reinventar cabeçalho, régua de abas,
 * `?tab=` e monitoramento.
 *
 * ## As regras
 *
 *   - A aba vem da URL (`?tab=`), para link colado e redirecionamento de rota
 *     antiga caírem no lugar certo.
 *   - Aba sem permissão não aparece, e a URL que a pede cai na primeira aba
 *     liberada — esconder o botão e servir o conteúdo não é permissão.
 *   - Abas visitadas continuam montadas (escondidas), como no Painel Líder:
 *     voltar a uma aba não refaz as consultas dela.
 *   - O monitoramento de uso ganha a aba no nível 1, e a tela de dentro
 *     continua medindo as dela a partir do nível 2 (`NivelBaseUso`).
 *
 * Uma aba pode declarar `instancia`: abas com a mesma instância dividem UM
 * componente montado (o Controle de Números desenha Celulares, Números, Lixeira
 * e Configuração, e remontá-lo a cada troca recarregaria a lista inteira).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NivelBaseUso, useSubAbaUso } from '@/providers/RastreioUsoProvider';

export interface AbaDaTela {
  /** Valor de `?tab=` e do monitoramento de uso. */
  chave: string;
  rotulo: string;
  Icon: LucideIcon;
  /** Falso esconde a aba e recusa a URL que a pede. */
  visivel: boolean;
  /**
   * O conteúdo. Recebe a aba ativa para as abas que dividem instância saberem
   * qual parte desenhar.
   */
  render: (ativa: string) => ReactNode;
  /** Abas com a mesma instância dividem um componente montado. */
  instancia?: string;
  /** Contador ao lado do rótulo. Zero não desenha. */
  badge?: number;
}

interface TelaComAbasProps {
  titulo: string;
  descricao?: string;
  Icon: LucideIcon;
  abas: AbaDaTela[];
  /** Botões à direita do título (ações da tela inteira). */
  acoes?: ReactNode;
  /** Controles logo abaixo da régua, valendo para todas as abas (ex.: mês). */
  barra?: ReactNode;
  /** Enquanto as permissões carregam: não decide aba nenhuma. */
  carregando?: boolean;
  /** Mensagem para quem abriu a tela sem nenhuma aba liberada. */
  semAbas?: string;
}

export function TelaComAbas({
  titulo, descricao, Icon, abas, acoes, barra, carregando, semAbas,
}: TelaComAbasProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const visiveis = useMemo(() => abas.filter(a => a.visivel), [abas]);
  const pedida = searchParams.get('tab');
  const ativa = visiveis.find(a => a.chave === pedida)?.chave ?? visiveis[0]?.chave ?? null;

  const instanciaDe = (a: AbaDaTela) => a.instancia ?? a.chave;
  const ativaAba = visiveis.find(a => a.chave === ativa) ?? null;

  const [visitadas, setVisitadas] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!ativaAba) return;
    const inst = instanciaDe(ativaAba);
    setVisitadas(prev => (prev.has(inst) ? prev : new Set(prev).add(inst)));
  }, [ativaAba]);

  // A última aba vista de cada instância: escondida, ela fica como estava. Só a
  // CHAVE é guardada — a aba em si é relida da lista atual, para o conteúdo
  // escondido não desenhar com as permissões de uma renderização antiga.
  const ultimaDe = useRef(new Map<string, string>());
  if (ativaAba) ultimaDe.current.set(instanciaDe(ativaAba), ativaAba.chave);

  useSubAbaUso(carregando ? null : ativa);

  function trocar(chave: string) {
    const prox = new URLSearchParams(searchParams);
    prox.set('tab', chave);
    setSearchParams(prox, { replace: true });
  }

  // Uma entrada por instância: a primeira aba visível dela desenha o conteúdo.
  const instancias = useMemo(() => {
    const vistas = new Map<string, AbaDaTela>();
    for (const a of visiveis) if (!vistas.has(instanciaDe(a))) vistas.set(instanciaDe(a), a);
    return [...vistas.entries()];
  }, [visiveis]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{titulo}</h1>
              {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
            </div>
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </div>

        {visiveis.length > 1 && (
          <div
            role="group"
            aria-label={`Seções de ${titulo}`}
            className="mx-auto mt-4 flex max-w-[1600px] items-center gap-1 overflow-x-auto border-b border-border"
          >
            {visiveis.map(a => (
              <button
                key={a.chave}
                type="button"
                aria-pressed={ativa === a.chave}
                onClick={() => trocar(a.chave)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  ativa === a.chave
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <a.Icon className="h-3.5 w-3.5" /> {a.rotulo}
                {!!a.badge && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {a.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {barra && <div className="mx-auto mt-3 flex max-w-[1600px] flex-wrap items-center gap-2">{barra}</div>}
      </div>

      {!carregando && ativa === null && (
        <div className="m-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {semAbas ?? `Nenhuma seção de ${titulo} está liberada para o seu cargo.`}
        </div>
      )}

      {ativaAba && instancias.map(([inst, dona]) => {
        const ehAtiva = instanciaDe(ativaAba) === inst;
        if (!ehAtiva && !visitadas.has(inst)) return null;
        const quem = ehAtiva
          ? ativaAba
          : (visiveis.find(a => a.chave === ultimaDe.current.get(inst)) ?? dona);
        return (
          <div key={inst} className={cn(!ehAtiva && 'hidden')}>
            <NivelBaseUso acima={1} ativo={ehAtiva}>
              {quem.render(quem.chave)}
            </NivelBaseUso>
          </div>
        );
      })}
    </div>
  );
}
