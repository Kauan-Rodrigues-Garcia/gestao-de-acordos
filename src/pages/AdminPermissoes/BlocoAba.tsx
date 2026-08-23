/**
 * BlocoAba — tudo que um cargo pode fazer numa aba, num cartão só.
 *
 * A ordem dentro do cartão é a da dependência, e não a do alfabeto:
 *
 *   1. o interruptor da aba — desligado, o resto não vale nada;
 *   2. o ALCANCE, que responde "até onde ele enxerga aqui";
 *   3. as abas internas e as ações.
 *
 * Com a aba desligada, os controles de baixo aparecem apagados em vez de
 * sumirem. Sumir esconderia a configuração que continua gravada, e religar a
 * aba a traz de volta inteira — quem não visse isso acharia que perdeu o que
 * tinha ajustado.
 *
 * Os níveis são chips independentes, e não uma escada. É assim que o modelo
 * funciona: um cargo pode ter "só os próprios" e "do setor" sem ter "da
 * equipe". Um seletor único mentiria sobre isso.
 */
import { AlertTriangle, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ROTULO_NIVEL, type BlocoDeAba } from '@/lib/permissoes-abas';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';

/** «analitico_escopo_setor» → «Do setor», para o atalho falar a língua da tela. */
function rotuloDaChave(chave: string): string {
  const nivel = chave.split('_escopo_')[1];
  return ROTULO_NIVEL[nivel] ?? chave;
}

interface Props {
  bloco: BlocoDeAba;
  valorDe: (chave: string) => boolean;
  alternar: (chave: string) => void;
  alterada: (chave: string) => boolean;
  somenteLeitura: boolean;
}

export function BlocoAba({ bloco, valorDe, alternar, alterada, somenteLeitura }: Props) {
  const [aberto, setAberto] = useState(true);

  const abaLigada = bloco.interruptor ? valorDe(bloco.interruptor.key) : true;
  const niveisLigados = bloco.niveis.filter(n => valorDe(n.key)).length;
  const acoesLigadas  = bloco.acoes.filter(a => valorDe(a.key)).length;

  /**
   * A acao esta ligada mas nao tem onde agir?
   *
   * E o caso das cinco abas internas secundarias do Analitico: elas vivem na
   * visao de setor, e um cargo com alcance «so os proprios» abre a lista
   * individual, que nao tem regua de abas. Ligadas, nao acontecia nada — e o
   * painel nao dizia por que.
   */
  const semEfeito = (p: PermissaoMeta) =>
    !!p.depende && !p.depende.chaves.some(k => valorDe(k));

  const inertes = bloco.acoes.filter(a => valorDe(a.key) && semEfeito(a)).length;

  /** O resumo do cabeçalho: o que essa aba faz por este cargo, em uma linha. */
  const resumo = !abaLigada
    ? 'aba desligada'
    : [
        bloco.niveis.length > 0
          ? (niveisLigados > 0
              ? `${niveisLigados} de ${bloco.niveis.length} alcances`
              : 'sem alcance')
          : null,
        bloco.acoes.length > 0 ? `${acoesLigadas} de ${bloco.acoes.length} ações` : null,
        inertes > 0 ? `${inertes} sem efeito` : null,
      ].filter(Boolean).join(' · ');

  return (
    <section className={cn(
      'rounded-xl border bg-card overflow-hidden transition-colors',
      abaLigada ? 'border-border' : 'border-border/60',
    )}>
      <header className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border">
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
          aria-expanded={aberto}
        >
          {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className={cn(!abaLigada && 'text-muted-foreground')}>{bloco.rotulo}</span>
        </button>

        <span className="text-[11px] text-muted-foreground">{resumo}</span>

        <div className="ml-auto flex items-center gap-2">
          {bloco.interruptor ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                {abaLigada ? 'Abre a aba' : 'Não abre'}
              </span>
              <Switch
                checked={abaLigada}
                disabled={somenteLeitura}
                onCheckedChange={() => alternar(bloco.interruptor!.key)}
                aria-label={`Abrir a aba ${bloco.rotulo}`}
              />
            </>
          ) : (
            <span
              className="flex items-center gap-1 text-[11px] text-muted-foreground"
              title="O Dashboard é a tela inicial: o login e os redirecionamentos apontam para ela. Desligá-la trancaria a pessoa fora do sistema."
            >
              <Lock className="w-3 h-3" /> sempre aberta
            </span>
          )}
        </div>
      </header>

      {aberto && (
        <div className={cn('divide-y divide-border/60', !abaLigada && 'opacity-50')}>
          {bloco.niveis.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-foreground">Até onde enxerga aqui</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                Cada faixa liga sozinha. Ligar duas oferece as duas como opção de
                filtro na tela.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bloco.niveis.map(n => {
                  const nivel = n.key.split('_escopo_')[1];
                  const ligado = valorDe(n.key);
                  return (
                    <button
                      key={n.key}
                      type="button"
                      disabled={somenteLeitura || !abaLigada}
                      onClick={() => alternar(n.key)}
                      title={n.descricao}
                      aria-pressed={ligado}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:cursor-not-allowed',
                        ligado
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50',
                        alterada(n.key) && 'ring-2 ring-amber-500/60',
                      )}
                    >
                      {ROTULO_NIVEL[nivel] ?? nivel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {bloco.acoes.length > 0 && (
            <ul className="divide-y divide-border/60">
              {bloco.acoes.map((a: PermissaoMeta) => (
                <li
                  key={a.key}
                  className={cn(
                    'flex items-start gap-4 px-4 py-2.5',
                    alterada(a.key) && 'bg-amber-500/5 border-l-2 border-l-amber-500',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">{a.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>

                    {/* Ligada e sem ter onde agir. Em vez de deixar o admin
                        descobrir sozinho — que foi o que aconteceu —, a linha
                        diz o motivo e oferece o clique que resolve. */}
                    {valorDe(a.key) && semEfeito(a) && abaLigada && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-[11px] text-amber-700 dark:text-amber-300">
                          Ligada, mas sem efeito: {a.depende!.motivo}.
                        </span>
                        {!somenteLeitura && (
                          <button
                            type="button"
                            onClick={() => alternar(a.depende!.chaves[0])}
                            className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                          >
                            Ligar «{rotuloDaChave(a.depende!.chaves[0])}»
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <Switch
                    className="shrink-0 mt-0.5"
                    checked={valorDe(a.key)}
                    disabled={somenteLeitura || !abaLigada}
                    onCheckedChange={() => alternar(a.key)}
                    aria-label={a.label}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
