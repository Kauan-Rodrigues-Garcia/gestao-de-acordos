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
import { AlertTriangle, ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ROTULO_NIVEL, type BlocoDeAba } from '@/lib/permissoes-abas';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';
import { CartaoPermissao, GradeDeCartoes } from './CartaoPermissao';

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
  /** Texto da busca. Vazio mostra tudo. */
  filtro: string;
}

export function BlocoAba({
  bloco, valorDe, alternar, alterada, somenteLeitura, filtro,
}: Props) {
  const [aberto, setAberto] = useState(true);

  const abaLigada = bloco.interruptor ? valorDe(bloco.interruptor.key) : true;
  const niveisLigados = bloco.niveis.filter(n => valorDe(n.key)).length;

  /**
   * A ação está ligada mas não tem onde agir?
   *
   * É o caso das cinco abas internas secundárias do Analítico: elas vivem na
   * visão de setor, e um cargo com alcance «só os próprios» abre a lista
   * individual, que não tem régua de abas. Ligadas, não acontecia nada — e o
   * painel não dizia por quê.
   */
  const semEfeito = (p: PermissaoMeta) =>
    !!p.depende && !p.depende.chaves.some(k => valorDe(k));

  const casa = (p: PermissaoMeta) =>
    !filtro
    || p.label.toLowerCase().includes(filtro)
    || p.descricao.toLowerCase().includes(filtro);

  const acoesVisiveis = bloco.acoes.filter(casa);
  const buscando = filtro.length > 0;
  // Buscando, um bloco sem resultado só ocuparia espaço.
  if (buscando && acoesVisiveis.length === 0
      && !bloco.rotulo.toLowerCase().includes(filtro)) return null;

  const acoesLigadas = bloco.acoes.filter(a => valorDe(a.key)).length;
  const inertes = bloco.acoes.filter(a => valorDe(a.key) && semEfeito(a)).length;

  return (
    <section className={cn(
      'rounded-xl border bg-card overflow-hidden transition-colors',
      abaLigada ? 'border-border' : 'border-dashed border-border',
    )}>
      <header
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b',
          abaLigada ? 'bg-muted/40 border-border' : 'bg-muted/20 border-border/60',
        )}
      >
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
          aria-expanded={aberto}
        >
          <ChevronDown className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            !aberto && '-rotate-90',
          )} />
          <span className={cn(!abaLigada && 'text-muted-foreground')}>{bloco.rotulo}</span>
        </button>

        {/* Selo do estado, para o olho pegar o cartão certo sem ler o resumo. */}
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          abaLigada
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}>
          {abaLigada ? 'ativa' : 'desligada'}
        </span>

        {abaLigada && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {bloco.niveis.length > 0 && `${niveisLigados}/${bloco.niveis.length} alcances`}
            {bloco.niveis.length > 0 && bloco.acoes.length > 0 && ' · '}
            {bloco.acoes.length > 0 && `${acoesLigadas}/${bloco.acoes.length} ações`}
          </span>
        )}

        {inertes > 0 && abaLigada && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {inertes} sem efeito
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {bloco.interruptor ? (
            <>
              <span className="text-[11px] text-muted-foreground">Abre a aba</span>
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
        <div className={cn(!abaLigada && 'opacity-60')}>
          {bloco.niveis.length > 0 && !buscando && (
            <div className="border-b border-border/60 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-xs font-semibold text-foreground">Até onde enxerga aqui</p>
                <p className="text-[11px] text-muted-foreground">
                  cada faixa liga sozinha — ligar duas oferece as duas como filtro na tela
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
                        'rounded-full border px-3 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed',
                        ligado
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
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

          {acoesVisiveis.length > 0 && (
            <GradeDeCartoes>
              {acoesVisiveis.map(a => {
                const inerte = valorDe(a.key) && semEfeito(a) && abaLigada;
                return (
                  <CartaoPermissao
                    key={a.key}
                    permissao={a}
                    ligada={valorDe(a.key)}
                    alterada={alterada(a.key)}
                    esmaecido={!abaLigada}
                    controle={
                      <Switch
                        checked={valorDe(a.key)}
                        disabled={somenteLeitura || !abaLigada}
                        onCheckedChange={() => alternar(a.key)}
                        aria-label={a.label}
                      />
                    }
                    aviso={inerte && (
                      /* Em vez de deixar o admin descobrir sozinho — que foi o
                         que aconteceu —, a linha diz o motivo e oferece o
                         clique que resolve. */
                      <div className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
                        <p className="flex items-start gap-1 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mt-px w-3 h-3 shrink-0" />
                          <span>Ligada, mas sem efeito: {a.depende!.motivo}.</span>
                        </p>
                        {!somenteLeitura && (
                          <button
                            type="button"
                            onClick={() => alternar(a.depende!.chaves[0])}
                            className="mt-1 text-[10px] font-semibold text-amber-700 underline underline-offset-2 hover:no-underline dark:text-amber-300"
                          >
                            Ligar «{rotuloDaChave(a.depende!.chaves[0])}»
                          </button>
                        )}
                      </div>
                    )}
                  />
                );
              })}
            </GradeDeCartoes>
          )}
        </div>
      )}
    </section>
  );
}
