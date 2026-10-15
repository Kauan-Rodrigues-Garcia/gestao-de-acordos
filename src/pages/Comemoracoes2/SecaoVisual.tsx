/**
 * SecaoPapel e SecaoEstilo — etapas 3 e 4: a cara do card. `OpcoesFotos`
 * aparece no estilo e também no palco, quando as fotos estão selecionadas.
 *
 * Papel de parede tem etapa própria porque é a escolha que mais muda o card:
 * primeiro o tema (filtro), depois a miniatura. As miniaturas são o próprio
 * fundo, com o título na cor que ele vai ter — o que se vê é o que sai.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EFEITOS, ENTRADAS, FONTES, FORMATOS_FOTO, MODELOS, MOLDURAS, TAMANHOS_FOTO, aplicarModelo,
  modeloDoDesign,
  type EfeitoId, type EntradaId, type FonteId, type FotosCard, type FormatoFoto, type ModeloId,
  type MolduraId, type TamanhoFoto,
} from '@/components/comemoracao2/design';
import {
  PAPEIS_DE_PAREDE, TEMAS, papelDeParede, papeisDoTema, type TemaId,
} from '@/components/comemoracao2/papeisDeParede';
import { Opcoes } from './Etapa';
import type { Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

export function SecaoPapel({ r, mudar }: { r: Rascunho; mudar: MudarRascunho }) {
  const [tema, setTema] = useState<TemaId | 'todos'>(() => papelDeParede(r.design.papel).tema);
  const lista = papeisDoTema(tema);

  return (
    <>
      <div role="tablist" aria-label="Temas" className="flex flex-wrap gap-1">
        {([{ id: 'todos', nome: 'Todos' }, ...TEMAS] as const).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tema === t.id}
            onClick={() => setTema(t.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              tema === t.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}>
            {t.nome}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {lista.map((p) => {
          const ativo = r.design.papel === p.id;
          return (
            <button key={p.id} type="button" onClick={() => mudar((a) => ({ design: { ...a.design, papel: p.id } }))}
              aria-pressed={ativo} aria-label={`Papel de parede ${p.nome}`}
              className="group space-y-1 text-left focus-visible:outline-none">
              <span
                className={cn(
                  'relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl transition-all',
                  'ring-offset-2 ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring',
                  ativo ? 'ring-2 ring-primary' : 'group-hover:scale-[1.03]',
                )}
                style={{ background: p.fundo }}
              >
                <span className="text-lg font-black leading-none"
                  style={{
                    backgroundImage: p.titulo ?? `linear-gradient(${p.tinta},${p.tinta})`,
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  }}>
                  Aa
                </span>
                {ativo && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </span>
              <span className={cn('block truncate text-[11px]', ativo ? 'font-semibold' : 'text-muted-foreground')}>{p.nome}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{PAPEIS_DE_PAREDE.length} papéis de parede. A cor da letra acompanha o fundo.</p>
    </>
  );
}

export function SecaoEstilo({ r, mudar }: { r: Rascunho; mudar: MudarRascunho }) {
  const modelo = modeloDoDesign(r.design);
  const setDesign = (parte: Partial<Rascunho['design']>) => mudar((a) => ({ design: { ...a.design, ...parte } }));

  return (
    <>
      <Opcoes<ModeloId> rotulo={modelo ? 'Arranjo' : 'Arranjo (personalizado — escolha um para reorganizar)'}
        opcoes={MODELOS} valor={modelo}
        onEscolher={(id) => mudar((a) => ({ design: aplicarModelo(a.design, id) }))} />

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Letra do título</p>
        <div role="radiogroup" aria-label="Letra do título" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {FONTES.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={r.design.fonte === f.id}
              onClick={() => setDesign({ fonte: f.id as FonteId })}
              className={cn(
                'rounded-lg border px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                r.design.fonte === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent',
              )}>
              <span className="block text-base leading-tight"
                style={{
                  fontFamily: f.familia, fontWeight: f.peso,
                  fontStyle: f.id === 'elegante' ? 'italic' : 'normal',
                  textTransform: f.maiusculas ? 'uppercase' : 'none',
                }}>
                Meta!
              </span>
              <span className="block text-[10px] opacity-80">{f.nome}</span>
            </button>
          ))}
        </div>
      </div>

      <Opcoes<EntradaId> rotulo="Entrada do título" opcoes={ENTRADAS} valor={r.design.entrada}
        onEscolher={(id) => setDesign({ entrada: id })} />

      <Opcoes<EfeitoId> rotulo="Efeito na chegada" opcoes={EFEITOS} valor={r.design.efeito}
        onEscolher={(id) => setDesign({ efeito: id })} />
      <p className="-mt-1 text-[11px] text-muted-foreground">Ao trocar a entrada ou o efeito, a prévia toca sozinha.</p>

      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <p className="text-xs font-semibold">Fotos de quem bateu</p>
        <OpcoesFotos r={r} mudar={mudar} />
      </div>
    </>
  );
}

/** Amostra da moldura: um círculo com o aro como ele sai no card. */
function AmostraMoldura({ moldura, destaque }: { moldura: MolduraId; destaque: string }) {
  const aro =
    moldura === 'branca'  ? { background: '#FFFFFF', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }
    : moldura === 'dourada' ? { background: 'linear-gradient(135deg,#FFF3B0 0%,#E8B931 35%,#9C6A12 65%,#F8D86A 100%)' }
    : moldura === 'neon'    ? { background: destaque, boxShadow: `0 0 6px 1px ${destaque}` }
    : moldura === 'nenhuma' ? { background: 'transparent' }
    : { background: destaque };
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-[3px]" style={aro}>
      <span className="h-full w-full rounded-full bg-gradient-to-b from-stone-300 to-stone-500" />
    </span>
  );
}

/**
 * Formato, tamanho e moldura das fotos.
 *
 * `compacto` é a versão do palco: cabe na barra embaixo da prévia, ao lado do
 * tamanho do elemento selecionado.
 */
export function OpcoesFotos({ r, mudar, compacto = false }: { r: Rascunho; mudar: MudarRascunho; compacto?: boolean }) {
  const fotos = r.design.fotos;
  const setFotos = (parte: Partial<FotosCard>) =>
    mudar((a) => ({ design: { ...a.design, fotos: { ...a.design.fotos, ...parte } } }));
  const destaque = papelDeParede(r.design.papel).destaque;

  const molduras = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Moldura</p>
      <div role="radiogroup" aria-label="Moldura das fotos" className="flex flex-wrap gap-1.5">
        {MOLDURAS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={fotos.moldura === m.id}
            title={m.descricao} onClick={() => setFotos({ moldura: m.id })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border py-1 pl-1 pr-2 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              fotos.moldura === m.id ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-accent',
            )}>
            <AmostraMoldura moldura={m.id} destaque={destaque} />
            {m.nome}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn(compacto ? 'grid gap-2 sm:grid-cols-[auto_1fr]' : 'space-y-2.5')}>
      <div className={cn(compacto ? 'flex flex-wrap gap-3' : 'space-y-2.5')}>
        <Opcoes<FormatoFoto> rotulo="Formato" opcoes={FORMATOS_FOTO} valor={fotos.formato} colunas={2}
          onEscolher={(id) => setFotos({ formato: id })} />
        <Opcoes<TamanhoFoto> rotulo="Tamanho da foto" opcoes={TAMANHOS_FOTO} valor={fotos.tamanho}
          onEscolher={(id) => setFotos({ tamanho: id })} />
      </div>
      {molduras}
    </div>
  );
}
