/**
 * usePetClima — clima real para o pet reagir (Open-Meteo: gratuita, sem chave).
 *
 * As duas empresas têm gente em Birigui e em Marília/SP, então o usuário
 * escolhe a cidade dele no quartinho (localStorage; padrão Birigui).
 * Consulta a cada 30 min com cache local de 20 min (recarregar a página não
 * refaz a chamada). Qualquer erro degrada para 'ameno' (nenhum efeito visual).
 */
import { useCallback, useEffect, useState } from 'react';

export type PetClima = 'ameno' | 'chuva' | 'tempestade' | 'calor' | 'frio' | 'vento';

export interface CidadeClima {
  id: string;
  nome: string;
  lat: number;
  lon: number;
}

export const CIDADES_CLIMA: CidadeClima[] = [
  { id: 'birigui', nome: 'Birigui', lat: -21.2889, lon: -50.34 },
  { id: 'marilia', nome: 'Marília', lat: -22.2171, lon: -49.9501 },
];

const CIDADE_KEY = 'pet-clima-cidade';
const CACHE_KEY  = 'pet-clima-cache';
const CACHE_TTL_MS   = 20 * 60_000;
const REFETCH_MS     = 30 * 60_000;

export interface ClimaAtual {
  clima: PetClima;
  temperatura: number | null;
  dia: boolean;          // é dia lá fora? (para a janelinha do quartinho)
}

const CLIMA_AMENO: ClimaAtual = { clima: 'ameno', temperatura: null, dia: true };

/** WMO weather code + temperatura + vento → clima do pet. */
function classificar(codigo: number, temperatura: number, ventoKmh: number): PetClima {
  if (codigo >= 95) return 'tempestade';                       // trovoada
  if ((codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return 'chuva';
  if (temperatura >= 31) return 'calor';
  if (temperatura <= 14) return 'frio';
  if (ventoKmh >= 25) return 'vento';
  return 'ameno';
}

export function descricaoClima(c: PetClima): string {
  switch (c) {
    case 'chuva':      return 'chovendo 🌧️';
    case 'tempestade': return 'trovoada ⛈️';
    case 'calor':      return 'calorão 🥵';
    case 'frio':       return 'friozinho 🧣';
    case 'vento':      return 'ventando 🍃';
    default:           return 'tempo bom ✨';
  }
}

interface CacheClima { cidadeId: string; atual: ClimaAtual; ts: number }

function lerCache(cidadeId: string): ClimaAtual | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheClima;
    if (c.cidadeId === cidadeId && Date.now() - c.ts < CACHE_TTL_MS) return c.atual;
  } catch { /* noop */ }
  return null;
}

function salvarCache(cidadeId: string, atual: ClimaAtual): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ cidadeId, atual, ts: Date.now() } satisfies CacheClima));
  } catch { /* noop */ }
}

async function buscarClima(cidade: CidadeClima): Promise<ClimaAtual | null> {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${cidade.lat}&longitude=${cidade.lon}`
      + '&current=temperature_2m,weather_code,wind_speed_10m,is_day'
      + '&timezone=America%2FSao_Paulo';
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const dados = await resp.json() as {
      current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; is_day?: number };
    };
    const c = dados.current;
    if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') return null;
    return {
      clima: classificar(c.weather_code, c.temperature_2m, c.wind_speed_10m ?? 0),
      temperatura: Math.round(c.temperature_2m),
      dia: c.is_day !== 0,
    };
  } catch {
    return null;
  }
}

export interface UsePetClima {
  atual: ClimaAtual;
  cidade: CidadeClima;
  setCidade: (id: string) => void;
}

export function usePetClima(): UsePetClima {
  const [cidadeId, setCidadeId] = useState<string>(() => {
    try {
      const salvo = localStorage.getItem(CIDADE_KEY);
      if (salvo && CIDADES_CLIMA.some(c => c.id === salvo)) return salvo;
    } catch { /* noop */ }
    return CIDADES_CLIMA[0].id;
  });
  const cidade = CIDADES_CLIMA.find(c => c.id === cidadeId) ?? CIDADES_CLIMA[0];

  const [atual, setAtual] = useState<ClimaAtual>(() => lerCache(cidadeId) ?? CLIMA_AMENO);

  useEffect(() => {
    let vivo = true;
    const carregar = async (forcar: boolean) => {
      if (!forcar) {
        const cache = lerCache(cidade.id);
        if (cache) { setAtual(cache); return; }
      }
      const novo = await buscarClima(cidade);
      if (!vivo) return;
      if (novo) {
        setAtual(novo);
        salvarCache(cidade.id, novo);
      }
    };
    void carregar(false);
    const t = setInterval(() => void carregar(true), REFETCH_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [cidade.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const setCidade = useCallback((id: string) => {
    if (!CIDADES_CLIMA.some(c => c.id === id)) return;
    setCidadeId(id);
    try { localStorage.setItem(CIDADE_KEY, id); } catch { /* noop */ }
  }, []);

  return { atual, cidade, setCidade };
}
