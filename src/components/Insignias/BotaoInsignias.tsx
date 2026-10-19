/**
 * As insígnias das gincanas no topo do app: as medalhas que a pessoa ganhou,
 * penduradas pela fita na borda de cima da barra, e duas «?» das próximas
 * gincanas. Com o mouse em cima, a placa da gincana (`Placas.tsx`). Quem não
 * participou de uma gincana não vê a medalha dela. A regra está em
 * `insignias.ts`.
 *
 * Este arquivo é leve (entra com o Layout): lê o álbum e guarda o lugar. As
 * medalhas e as placas trazem os desenhos das gincanas e baixam logo depois
 * (`Estante.tsx`); até lá, as fitas das «?» guardam o lugar.
 *
 * Ganhou e ainda não passou o mouse: a medalha pulsa. Pegou o zumbi ou a
 * bruxa agora, ou o chefe caiu e a pessoa ainda não tinha aquela: o álbum
 * relê sozinho (o aviso já chega pela caça — nenhuma assinatura nova).
 *
 * O super_admin tem ainda o botão do pessoal: as insígnias de todo mundo.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCacaAbobora } from '@/components/CacaAbobora/caca';
import { useChefao } from '@/components/CacaAbobora/chefao';
import { useChefona } from '@/components/CacaAbobora/bruxas/chefona/banco';
import {
  INSIGNIAS, insigniaDaCaca, insigniasVistas, marcarInsigniasVistas, novasInsignias,
  type Album, type IdInsignia,
} from './insignias';
import { esquecerAlbuns, lerMeuAlbum } from './banco';
import './insignias.css';

const carregarEstante = comNovaTentativa(() => import('./Estante'));
const Estante = lazy(() => carregarEstante().then(m => ({ default: m.Estante })));
const DoPessoal = lazy(() => carregarEstante().then(m => ({ default: m.DoPessoal })));

/** Espalha a primeira leitura: o app inteiro abre junto de manhã. */
const ESPALHAR_ENTRADA_MS = 8_000;
/** Chefe derrotado: todo mundo que ainda não tinha relê — espalhado. */
const ESPALHAR_CHEFE_MS = 20_000;

interface Props {
  perfilId: string | null | undefined;
  empresaId: string | null | undefined;
  souSuperAdmin: boolean;
}

function useMeuAlbum(perfilId: string | null | undefined) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [carregado, setCarregado] = useState(false);
  const versao = useRef(0);

  const ler = useCallback((esperaMs: number, novo = false) => {
    if (!perfilId) return () => {};
    const minha = ++versao.current;
    const t = setTimeout(() => {
      if (novo) esquecerAlbuns();
      lerMeuAlbum(perfilId)
        .then(a => { if (versao.current === minha) { setAlbum(a); setCarregado(true); } })
        .catch(() => { if (versao.current === minha) setCarregado(true); });
    }, esperaMs);
    return () => clearTimeout(t);
  }, [perfilId]);

  useEffect(() => {
    setAlbum(null);
    setCarregado(false);
    return ler(Math.random() * ESPALHAR_ENTRADA_MS);
  }, [ler]);

  return { album, carregado, ler };
}

/** As fitas das «?» sem a medalha: o lugar enquanto o desenho baixa. */
function Fitas() {
  return (
    <div className="ins-fileira" aria-hidden>
      {['a', 'b'].map(i => (
        <div key={i} className="ins-medalha ins-pendurada ins-misterio" style={{ ['--tam' as string]: '24px', ['--fita' as string]: '#5b5566' }}>
          <div className="ins-fita" />
        </div>
      ))}
    </div>
  );
}

export function BotaoInsignias({ perfilId, empresaId, souSuperAdmin }: Props) {
  const { album, carregado, ler } = useMeuAlbum(perfilId);
  const [vistas, setVistas] = useState<IdInsignia[] | null>(null);

  useEffect(() => { setVistas(perfilId ? insigniasVistas(perfilId) : null); }, [perfilId]);

  const tem = useMemo(() => INSIGNIAS.filter(i => album?.conquistas[i.id]).map(i => i.id), [album]);
  const novas = novasInsignias(tem, vistas);

  const aoVer = useCallback((id: IdInsignia) => {
    if (!perfilId || !tem.includes(id)) return;
    setVistas(v => {
      const proximas = [...new Set([...(v ?? []), id])];
      marcarInsigniasVistas(perfilId, proximas);
      return proximas;
    });
  }, [perfilId, tem]);

  // ── Ganhou agora? (o aviso da caça e dos chefes já chega a todo mundo) ────
  const { rodada } = useCacaAbobora(empresaId);
  const chefao = useChefao();
  const chefona = useChefona();

  const peguei = rodada?.situacao === 'achada' && !!perfilId && rodada.achada_por === perfilId
    ? insigniaDaCaca({ tema: rodada.tema, zumbi: rodada.zumbi })
    : null;
  // Relê também quando já tinha: a placa mostra quantas, o headshot e o tempo.
  const chavePeguei = peguei ? `${rodada?.id}` : null;
  useEffect(() => {
    if (chavePeguei) return ler(1_500, true);
  }, [chavePeguei, ler]);

  const reiCaiu = chefao?.situacao === 'derrotado' && !album?.conquistas.reiDoPop ? chefao.id : null;
  const pantanoCaiu = chefona?.situacao === 'derrotado' && !album?.conquistas.pantano ? chefona.id : null;
  useEffect(() => {
    if (reiCaiu != null || pantanoCaiu != null) return ler(2_000 + Math.random() * ESPALHAR_CHEFE_MS, true);
  }, [reiCaiu, pantanoCaiu, ler]);

  if (!perfilId) return null;

  return (
    // Cede espaço antes de tudo na barra (`shrink-[1000]`): janela estreita ou
    // zoom alto, as medalhas somem do fim (as «?» primeiro) e nunca ficam por
    // cima do Calendário nem empurram o sair para fora (19/10/2026).
    <div className="flex min-w-0 shrink-[1000] items-center gap-1 self-stretch">
      {carregado ? (
        <Suspense fallback={<Fitas />}>
          <Estante album={album} novas={novas} aoVer={aoVer} />
        </Suspense>
      ) : <Fitas />}
      {souSuperAdmin && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Insígnias do pessoal"
              aria-label="Insígnias do pessoal"
              className="ml-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(26rem,calc(100vw-1.5rem))] p-4">
            <Suspense fallback={null}>
              <DoPessoal />
            </Suspense>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
