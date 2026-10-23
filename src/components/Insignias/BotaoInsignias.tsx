/**
 * As insígnias das gincanas no topo do app: as medalhas que a pessoa ganhou,
 * penduradas pela fita na borda de cima da barra, e duas «?» das próximas
 * gincanas. Com o mouse em cima, a placa da gincana (`Placas.tsx`). Quem não
 * participou de uma gincana não vê a medalha dela. A regra está em
 * `insignias.ts`.
 *
 * Este arquivo é leve (entra com o Layout): lê o álbum e guarda o lugar. As
 * medalhas trazem os desenhos das gincanas e baixam logo que o app abre
 * (`Estante.tsx`); até lá, as fitas das «?» guardam o lugar.
 *
 * Carregar NA HORA (19/10/2026, «estão demorando para carregar»): a barra
 * começa pelo álbum guardado no navegador (`albumGuardado`) e desenha sem
 * esperar dado nenhum. A leitura do banco vem depois e só atualiza: espalhada
 * em 3–12 s quando já havia álbum guardado (ninguém vê a espera, e o app que
 * abre junto de manhã não lê junto), quase imediata no primeiro acesso.
 *
 * Ganhou e ainda não passou o mouse: a medalha pulsa.
 *
 * Desde 20/10/2026 a Caça e os chefes estão no arquivo morto (decisão do
 * Cleber) e o álbum voltou sozinho: mostra o que as gincanas já gravaram no
 * banco. Os desenhos que ele usa foram copiados para `desenhos/`; a releitura
 * ao vivo (pegou o zumbi, o chefe caiu) saiu junto com a Caça.
 *
 * O super_admin tem ainda o botão do pessoal: as insígnias de todo mundo.
 *
 * O Cavalo da Guerra (23/10/2026): quando ele cai, a medalha sai dele e voa até
 * aqui (`Corrida/guerra/palcoGuerra.js`, evento `insignia-ganha`). Ela já
 * aparece, nova (pulsando), e a leitura do banco confirma logo depois.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  INSIGNIAS, albumGuardado, guardarAlbum, insigniasVistas, marcarInsigniasVistas, novasInsignias,
  type Album, type IdInsignia,
} from './insignias';
import { esquecerAlbuns, lerMeuAlbum } from './banco';
import './insignias.css';

const carregarEstante = comNovaTentativa(() => import('./Estante'));
const Estante = lazy(() => carregarEstante().then(m => ({ default: m.Estante })));
const DoPessoal = lazy(() => comNovaTentativa(() => import('./Pessoal'))().then(m => ({ default: m.DoPessoal })));

/** Com álbum guardado: a leitura que só atualiza vem espalhada (o app inteiro abre junto de manhã). */
const ATUALIZAR_DE_MS = 3_000;
const ATUALIZAR_ESPALHADO_MS = 9_000;
/** Primeiro acesso (nada guardado): quase na hora — é o que a pessoa está esperando. */
const PRIMEIRA_LEITURA_MS = 800;

interface Props {
  perfilId: string | null | undefined;
  souSuperAdmin: boolean;
}

function useMeuAlbum(perfilId: string | null | undefined) {
  const [album, setAlbum] = useState<Album | null>(() => (perfilId ? albumGuardado(perfilId) : null));
  const versao = useRef(0);

  const ler = useCallback((esperaMs: number) => {
    if (!perfilId) return () => {};
    const minha = ++versao.current;
    const t = setTimeout(() => {
      lerMeuAlbum(perfilId)
        .then(a => {
          guardarAlbum(perfilId, a);
          if (versao.current === minha) setAlbum(a);
        })
        .catch(() => { /* fica o guardado; a próxima leitura tenta de novo */ });
    }, esperaMs);
    return () => clearTimeout(t);
  }, [perfilId]);

  useEffect(() => {
    if (!perfilId) { setAlbum(null); return; }
    const guardado = albumGuardado(perfilId);
    setAlbum(guardado);
    return ler(guardado
      ? ATUALIZAR_DE_MS + Math.random() * ATUALIZAR_ESPALHADO_MS
      : Math.random() * PRIMEIRA_LEITURA_MS);
  }, [perfilId, ler]);

  // A medalha chegou voando (o chefe caiu nesta tela): aparece já; o banco confirma em seguida.
  useEffect(() => {
    if (!perfilId) return;
    let desligar = () => {};
    const aoGanhar = (ev: Event) => {
      const id = (ev as CustomEvent<{ id?: IdInsignia }>).detail?.id;
      if (!id || !INSIGNIAS.some(i => i.id === id)) return;
      const agora = new Date().toISOString();
      setAlbum(a => {
        const base: Album = a ?? { usuario: perfilId, nome: '', foto: null, setor: null, conquistas: {} };
        if (base.conquistas[id]) return base;
        return { ...base, conquistas: { ...base.conquistas, [id]: { vezes: 1, primeiraEm: agora, ultimaEm: agora, desenho: null, headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0 } } };
      });
      esquecerAlbuns(); desligar(); desligar = ler(4_000);
    };
    window.addEventListener('insignia-ganha', aoGanhar);
    return () => { window.removeEventListener('insignia-ganha', aoGanhar); desligar(); };
  }, [perfilId, ler]);

  return album;
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

export function BotaoInsignias({ perfilId, souSuperAdmin }: Props) {
  const album = useMeuAlbum(perfilId);
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

  if (!perfilId) return null;

  return (
    // Cede espaço antes de tudo na barra (`shrink-[1000]`): janela estreita ou
    // zoom alto, as medalhas somem do fim (as «?» primeiro) e nunca ficam por
    // cima do Calendário nem empurram o sair para fora (19/10/2026).
    <div className="flex min-w-0 shrink-[1000] items-center gap-1 self-stretch">
      {/* Desenha já, com o que tiver (o guardado, ou só as «?»): o pedaço das
          medalhas começa a baixar aqui, em paralelo com a leitura. */}
      <Suspense fallback={<Fitas />}>
        <Estante album={album} novas={novas} aoVer={aoVer} />
      </Suspense>
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
