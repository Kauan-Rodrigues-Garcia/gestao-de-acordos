/** Um card por módulo: entrada, alcance, abas internas e ações. */
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ROTULO_NIVEL, type BlocoDeAba } from '@/lib/permissoes-abas';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';
import { CartaoPermissao, GradeDeCartoes } from './CartaoPermissao';

function rotuloDaChave(chave: string): string {
  const nivel = chave.split('_escopo_')[1];
  return ROTULO_NIVEL[nivel] ?? chave;
}

interface ControleContexto { disabled: boolean; cabecalho?: boolean }

interface Props {
  bloco: BlocoDeAba;
  /** Valor efetivo, já considerando cargo e eventual exceção por pessoa. */
  valorDe: (chave: string) => boolean;
  alternar?: (chave: string) => void;
  alterada: (chave: string) => boolean;
  somenteLeitura: boolean;
  filtro: string;
  /** Por pessoa usa o seletor herda/sim/não; por cargo cai no Switch padrão. */
  renderControle?: (permissao: PermissaoMeta, contexto: ControleContexto) => ReactNode;
}

export function BlocoAba({
  bloco, valorDe, alternar, alterada, somenteLeitura, filtro, renderControle,
}: Props) {
  // Pedido explícito: todos os cards nascem minimizados.
  const [aberto, setAberto] = useState(false);
  const abaLigada = valorDe(bloco.interruptor.key);
  const buscando = filtro.length > 0;

  // Desligar também recolhe. Ao religar, o card continua fechado — não revive
  // o estado expandido de antes e não surpreende quem está configurando.
  useEffect(() => { if (!abaLigada) setAberto(false); }, [abaLigada]);

  const semEfeito = (p: PermissaoMeta) =>
    !!p.depende && !p.depende.chaves.some(k => valorDe(k));

  const casa = (p: PermissaoMeta) =>
    !filtro || p.label.toLowerCase().includes(filtro)
    || p.descricao.toLowerCase().includes(filtro);

  const niveisVisiveis = bloco.niveis.filter(casa);
  const secoesVisiveis = bloco.secoes
    .map(s => ({ ...s, permissoes: s.permissoes.filter(casa) }))
    .filter(s => s.permissoes.length > 0);

  if (buscando
      && niveisVisiveis.length === 0
      && secoesVisiveis.length === 0
      && !bloco.rotulo.toLowerCase().includes(filtro)
      && !bloco.descricao.toLowerCase().includes(filtro)
      && !casa(bloco.interruptor)) return null;

  const niveisLigados = bloco.niveis.filter(n => valorDe(n.key)).length;
  const acoesLigadas = bloco.acoes.filter(a => valorDe(a.key)).length;
  const inertes = bloco.acoes.filter(a => valorDe(a.key) && semEfeito(a)).length;

  const controleDe = (p: PermissaoMeta, contexto: ControleContexto = { disabled: false }) => {
    if (renderControle) return renderControle(p, contexto);
    return (
      <Switch
        checked={valorDe(p.key)}
        disabled={somenteLeitura || contexto.disabled}
        onCheckedChange={() => alternar?.(p.key)}
        aria-label={p.label}
      />
    );
  };

  const cartao = (p: PermissaoMeta) => {
    const inerte = valorDe(p.key) && semEfeito(p) && abaLigada;
    return (
      <CartaoPermissao
        key={p.key}
        permissao={p}
        ligada={valorDe(p.key)}
        alterada={alterada(p.key)}
        controle={controleDe(p, { disabled: !abaLigada })}
        aviso={inerte && (
          <div className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
            <p className="flex items-start gap-1 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span>Ligada, mas sem efeito: {p.depende!.motivo}.</span>
            </p>
            {!somenteLeitura && !renderControle && (
              <button type="button" onClick={() => alternar?.(p.depende!.chaves[0])}
                className="mt-1 text-[10px] font-semibold text-amber-700 underline underline-offset-2 hover:no-underline dark:text-amber-300">
                Ligar «{rotuloDaChave(p.depende!.chaves[0])}»
              </button>
            )}
          </div>
        )}
      />
    );
  };

  const mostrarConteudo = abaLigada && (aberto || buscando);

  return (
    <section className={cn(
      'overflow-hidden rounded-xl border bg-card transition-colors',
      abaLigada ? 'border-border' : 'border-dashed border-border bg-muted/10',
    )}>
      <header className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3',
        mostrarConteudo && 'border-b border-border',
        abaLigada ? 'bg-muted/40' : 'bg-muted/20',
      )}>
        <button
          type="button"
          disabled={!abaLigada}
          onClick={() => setAberto(v => !v)}
          className="flex min-w-0 items-center gap-2 text-left disabled:cursor-not-allowed"
          aria-expanded={mostrarConteudo}
          title={!abaLigada ? 'Ligue a aba para abrir as configurações internas' : undefined}
        >
          <ChevronDown className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            !mostrarConteudo && '-rotate-90', !abaLigada && 'opacity-35',
          )} />
          <span className="min-w-0">
            <span className={cn('block text-sm font-semibold', !abaLigada && 'text-muted-foreground')}>
              {bloco.rotulo}
            </span>
            <span className="block truncate text-[11px] font-normal text-muted-foreground">
              {bloco.descricao}
            </span>
          </span>
        </button>

        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          abaLigada ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {abaLigada ? 'ativa' : 'desligada'}
        </span>

        {abaLigada && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {bloco.niveis.length > 0 && `${niveisLigados}/${bloco.niveis.length} alcances`}
            {bloco.niveis.length > 0 && bloco.acoes.length > 0 && ' · '}
            {bloco.acoes.length > 0 && `${acoesLigadas}/${bloco.acoes.length} opções`}
          </span>
        )}

        {inertes > 0 && abaLigada && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> {inertes} sem efeito
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Exibir aba</span>
          {controleDe(bloco.interruptor, { disabled: false, cabecalho: true })}
        </div>
      </header>

      {mostrarConteudo && (
        <div>
          {niveisVisiveis.length > 0 && (
            <div className="border-b border-border/60 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-xs font-semibold text-foreground">Até onde enxerga aqui</p>
                <p className="text-[11px] text-muted-foreground">cada alcance pode ser configurado separadamente</p>
              </div>
              {renderControle ? (
                <GradeDeCartoes>{niveisVisiveis.map(cartao)}</GradeDeCartoes>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {niveisVisiveis.map(n => {
                    const nivel = n.key.split('_escopo_')[1];
                    const ligado = valorDe(n.key);
                    return (
                      <button key={n.key} type="button" disabled={somenteLeitura}
                        onClick={() => alternar?.(n.key)} title={n.descricao} aria-pressed={ligado}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed',
                          ligado
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                          alterada(n.key) && 'ring-2 ring-amber-500/60',
                        )}>
                        {ROTULO_NIVEL[nivel] ?? nivel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {secoesVisiveis.map(secao => (
            <div key={secao.rotulo} className="border-b border-border/60 px-4 py-3 last:border-b-0">
              <p className="mb-2 text-xs font-semibold text-foreground">{secao.rotulo}</p>
              <GradeDeCartoes largas={!!renderControle}>
                {secao.permissoes.map(cartao)}
              </GradeDeCartoes>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
