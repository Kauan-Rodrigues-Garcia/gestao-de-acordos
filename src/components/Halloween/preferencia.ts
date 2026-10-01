/**
 * preferencia.ts — quem vê o Halloween, e se já recebeu as boas-vindas.
 *
 * ## A regra (01/10/2026)
 *
 * O tema vale para todo mundo durante outubro (a temporada) — DEPOIS que o
 * super_admin libera em Configurações (`liberacao.ts`): até lá, só ele vê. A
 * pessoa pode
 * desligar pelo botão de tema, sem aviso — e a escolha é dela, não da máquina.
 * Na primeira vez que entra na temporada, recebe uma mensagem que fecha o mês
 * anterior e apresenta o tema; só uma vez.
 *
 * ## Onde fica guardado
 *
 * Duas colunas em `perfis` — `halloween_desligado` e
 * `halloween_boas_vindas_em` (migration 20261001140000) — no mesmo molde de
 * `tour_visto_em`: troca de PC ou de navegador e a escolha continua. O
 * `localStorage` é o atalho que responde na hora e a reserva enquanto a
 * migration não está aplicada: gravar numa coluna que ainda não existe só
 * devolve erro, e a tela segue pelo navegador.
 *
 * Quem entra como outra pessoa (impersonação) não grava nada no perfil dela.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { getTodayISO } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useHalloweenLiberado } from './liberacao';

/**
 * Quem vê o tema, se a pessoa não desligou.
 *
 * Antes da liberação (`halloween_liberacao`, ver `liberacao.ts`), só o
 * super_admin — para validar sem ninguém mais perceber. Depois, todo mundo.
 */
export function podeVerHalloween(cargo: string | null | undefined, liberado: boolean): boolean {
  return liberado || cargo === 'super_admin';
}

/**
 * Reabrir a mensagem para validar: `?hw-boas-vindas` no endereço. Só para quem
 * já vê o tema — não é uma porta para mostrar o Halloween a mais ninguém.
 */
export function pediuBoasVindasNaUrl(busca: string = window.location.search): boolean {
  return new URLSearchParams(busca).has('hw-boas-vindas');
}

/** Pede ao `Layout` para abrir a mensagem agora (o «Ver a mensagem» de Configurações). */
export const EVENTO_ABRIR_BOAS_VINDAS = 'hw-abrir-boas-vindas';
export const abrirBoasVindasHalloween = () => { window.dispatchEvent(new Event(EVENTO_ABRIR_BOAS_VINDAS)); };

/** Outubro, no fuso de São Paulo. Pura, para os testes passarem a data. */
export function temporadaHalloween(hojeISO: string = getTodayISO()): boolean {
  return hojeISO.slice(5, 7) === '10';
}

const EVENTO = 'hw-preferencia';
const chaveDesligado = (id: string) => `hw-desligado:${id}`;
const chaveBoasVindas = (id: string) => `hw-boas-vindas:${id}`;

function ler(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', aviso);
  };
}

/** Cliente sem tipo: as duas colunas ainda não estão em `database.types.ts`. */
interface Consulta extends PromiseLike<{ error: { message: string } | null }> {
  update(valores: unknown): Consulta;
  eq(coluna: string, valor: string): Consulta;
  is(coluna: string, valor: null): Consulta;
}
const perfis = () => (supabase.from as unknown as (t: string) => Consulta)('perfis');

/**
 * Decide a partir do que se sabe. Exportada para os testes.
 *
 * O navegador responde primeiro: é onde a escolha desta sessão acabou de ser
 * gravada. Sem nada nele, vale o perfil — é o caso da máquina nova.
 */
export function resolverHalloween(p: {
  temporada: boolean;
  podeVer: boolean;
  localDesligado: string | null;
  localBoasVindas: string | null;
  perfilDesligado: boolean | null | undefined;
  perfilBoasVindas: string | null | undefined;
}) {
  const desligado = p.localDesligado !== null ? p.localDesligado === '1' : p.perfilDesligado === true;
  const boasVindasVistas = p.localBoasVindas !== null || !!p.perfilBoasVindas;
  const disponivel = p.temporada && p.podeVer;
  return {
    /** Temporada aberta para esta pessoa — é o que mostra o interruptor. */
    disponivel,
    desligado,
    ligado: disponivel && !desligado,
    boasVindasPendentes: disponivel && !desligado && !boasVindasVistas,
  };
}

interface PerfilHalloween {
  halloween_desligado?: boolean | null;
  halloween_boas_vindas_em?: string | null;
}

export function useHalloween() {
  const { user, perfil } = useAuth();
  const { empresa } = useEmpresa();
  const liberado = useHalloweenLiberado(empresa?.id);
  const id = user?.id ?? null;

  // Uma string só, para o React comparar por valor e não redesenhar à toa.
  const instantaneo = useSyncExternalStore(
    assinar,
    () => (id ? `${ler(chaveDesligado(id)) ?? '-'}|${ler(chaveBoasVindas(id)) ?? '-'}` : '-|-'),
  );
  const [d, b] = instantaneo.split('|');
  const doPerfil = perfil as (typeof perfil & PerfilHalloween) | null;

  const estado = resolverHalloween({
    temporada: temporadaHalloween(),
    podeVer: podeVerHalloween(perfil?.perfil, liberado),
    localDesligado: d === '-' ? null : d,
    localBoasVindas: b === '-' ? null : b,
    perfilDesligado: doPerfil?.halloween_desligado,
    perfilBoasVindas: doPerfil?.halloween_boas_vindas_em,
  });

  const perfilId = perfil?.id ?? null;

  const definirDesligado = useCallback((desligar: boolean) => {
    if (!id) return;
    gravar(chaveDesligado(id), desligar ? '1' : '0');
    if (perfilId && !getImpersonacaoAtiva()) {
      // O construtor do supabase só dispara a requisição no `then`. Erro
      // (coluna ainda não criada) é engolido: o navegador já guardou.
      perfis().update({ halloween_desligado: desligar }).eq('id', perfilId).then((): void => undefined);
    }
  }, [id, perfilId]);

  const marcarBoasVindasVistas = useCallback(() => {
    if (!id) return;
    gravar(chaveBoasVindas(id), new Date().toISOString());
    if (perfilId && !getImpersonacaoAtiva()) {
      // Só a primeira data fica — igual ao tutorial.
      perfis().update({ halloween_boas_vindas_em: new Date().toISOString() })
        .eq('id', perfilId).is('halloween_boas_vindas_em', null).then((): void => undefined);
    }
  }, [id, perfilId]);

  return { ...estado, liberado, definirDesligado, marcarBoasVindasVistas };
}
