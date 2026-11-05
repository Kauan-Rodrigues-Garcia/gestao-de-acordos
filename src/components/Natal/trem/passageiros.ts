/**
 * A fila do trenzinho e os passageiros de cada viagem.
 *
 * Quem quer viajar se inscreve UMA vez (clicando na estação) e entra em todos
 * os sorteios. Cada viagem leva até cinco, sorteados de surpresa, e ninguém
 * repete no mesmo dia. O sorteio é do banco e fica gravado (migration
 * 20261104120100): a primeira pergunta pela viagem sorteia, as outras leem —
 * mesma viagem, mesmas pessoas para todo mundo. A chave de cada viagem é o
 * minuto da partida (`chaveDoSorteio`).
 *
 * Guardado por chave enquanto a página está aberta: a viagem não muda de
 * passageiros, e cada uma é pedida uma vez só.
 *
 * Só no `npm run dev`, se as funções ainda não existem no banco, tudo sai
 * daqui mesmo: a inscrição fica no `localStorage`, e o sorteio usa as pessoas
 * que o login enxerga como se todas estivessem na fila (cada dia uma ordem,
 * cinco por viagem, sem repetir). Em produção, sem as funções, o trem anda vazio.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { urlDoAnexo, urlDoAnexoEmCache } from '@/services/chat/chat.service';
import { ouvirFotoMudou } from '@/lib/fotoDoPerfil';
import { recarregarAgenda } from './agenda';

export interface Sorteado {
  id: string;
  nome: string;
  setor: string | null;
  /** Como está no cadastro (caminho no storage ou URL). */
  foto: string | null;
}

const porChave = new Map<number, Sorteado[]>();
const pedindo = new Set<number>();
const ouvintes = new Set<() => void>();
const avisar = () => { for (const f of ouvintes) f(); };

const semFuncao = (msg: string) => /fn_natal_trem|could not find|does not exist/i.test(msg);

// ── O sorteio local (só no dev, sem as funções no banco) ─────────────────────

/** FNV-1a: o embaralhamento do sorteio local. */
function espalhar(texto: string) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

let elencoLocal: Promise<Sorteado[]> | null = null;
let avisouLocal = false;

function lerElencoLocal(): Promise<Sorteado[]> {
  elencoLocal ??= Promise.all([
    supabase.from('perfis').select('id, nome, foto_url, setor_id, ativo, arquivado, situacao'),
    supabase.from('setores').select('id, nome'),
  ]).then(([pessoas, setores]) => {
    const setor = new Map((setores.data ?? []).map(s => [s.id, s.nome]));
    return (pessoas.data ?? [])
      .filter(p => p.ativo && !p.arquivado && p.situacao !== 'desligado' && p.foto_url?.trim())
      .map(p => ({ id: p.id, nome: p.nome, setor: p.setor_id ? setor.get(p.setor_id) ?? null : null, foto: p.foto_url }));
  });
  return elencoLocal;
}

/** O dia ordena todo mundo uma vez; cada viagem do dia leva os cinco seguintes. */
async function sortearAqui(chave: number) {
  const elenco = await lerElencoLocal();
  const dia = new Date(chave * 60_000 - 3 * 3_600_000).toISOString().slice(0, 10);
  const inicioDoDia = Math.floor(Date.parse(`${dia}T03:00:00Z`) / 60_000);
  const ordem = [...elenco].sort((a, b) => espalhar(`${dia}:${a.id}`) - espalhar(`${dia}:${b.id}`));
  const viagemDoDia = Math.floor((chave - inicioDoDia) / 5);    // ~uma viagem a cada 5 min
  // A lista dá a volta quando acaba (sem isso, à tarde a viagem caía além do fim e saía vazia).
  const inicio = ordem.length ? (viagemDoDia * 5) % ordem.length : 0;
  porChave.set(chave, [...ordem, ...ordem].slice(inicio, inicio + Math.min(5, ordem.length)));
  if (!avisouLocal) {
    avisouLocal = true;
    console.info('[trem de Natal] sorteio local (dev): as funções fn_natal_trem_* ainda não estão no banco.');
  }
}

// ── Os passageiros ───────────────────────────────────────────────────────────

interface LinhaDoBanco { ordem: number; perfil_id: string; nome: string; foto_url: string | null; setor_nome: string | null }

async function pedir(chave: number) {
  if (porChave.has(chave) || pedindo.has(chave)) return;
  pedindo.add(chave);
  try {
    const { data, error } = await rpcSemTipo<LinhaDoBanco[]>('fn_natal_trem_passageiros', { p_chave: chave });
    if (error) {
      if (import.meta.env.DEV && semFuncao(error.message)) await sortearAqui(chave);
      else console.warn('[trem de Natal] passageiros:', error.message);
      return;
    }
    porChave.set(chave, (data ?? []).map(l => ({ id: l.perfil_id, nome: l.nome, setor: l.setor_nome, foto: l.foto_url })));
  } finally {
    pedindo.delete(chave);
    avisar();
  }
}

/** Só o laboratório (`lab-trem.html`, sem login nem banco): passageiros de mentira por chave. */
export function semearParaLaboratorio(chave: number, lista: Sorteado[]) {
  porChave.set(chave, lista);
  avisar();
}

/** Os sorteados da viagem, na ordem de embarque (`undefined` enquanto chega; trem parado, `null` e nada a pedir). */
export function usePassageiros(chave: number | null): Sorteado[] | undefined {
  const [, setVersao] = useState(0);
  useEffect(() => {
    if (chave === null) return;
    const f = () => setVersao(v => v + 1);
    ouvintes.add(f);
    void pedir(chave);
    return () => { ouvintes.delete(f); };
  }, [chave]);
  return chave === null ? undefined : porChave.get(chave);
}

// ── A inscrição na fila ──────────────────────────────────────────────────────

/**
 * `temFoto`: a pessoa tem foto de perfil? Sem foto, não entra na fila nem é
 * sorteada (Cleber, 05/11/2026; migration 20261105090000). Lida do banco na
 * hora — e de novo quando a foto muda e quando o mural abre.
 */
export interface Inscricao { inscrito: boolean; total: number | null; temFoto: boolean }

interface LinhaDaInscricao { inscrito: boolean; total: number | null; tem_foto?: boolean | null }

/** O banco recusou a entrada porque a pessoa está sem foto. */
export class SemFotoDePerfil extends Error {}

const CHAVE_LOCAL = 'natal:trem:inscrito-dev';
const inscritoLocal = () => {
  try { return localStorage.getItem(CHAVE_LOCAL) === '1'; } catch { return false; }
};

/** Sem a coluna `tem_foto` (o banco antes de 20261105090000, ou o dev sem as funções): lê a própria foto. */
async function minhaFoto(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('perfis').select('foto_url').eq('id', user.id).maybeSingle();
  return Boolean(data?.foto_url?.trim());
}

async function lerInscricao(): Promise<Inscricao> {
  const { data, error } = await rpcSemTipo<LinhaDaInscricao[]>('fn_natal_trem_inscricao', {});
  if (error) {
    if (import.meta.env.DEV && semFuncao(error.message)) return { inscrito: inscritoLocal(), total: null, temFoto: await minhaFoto() };
    return { inscrito: false, total: null, temFoto: await minhaFoto() };
  }
  return paraInscricao(data?.[0], false);
}

async function paraInscricao(l: LinhaDaInscricao | undefined, inscrito: boolean): Promise<Inscricao> {
  return {
    inscrito: l?.inscrito ?? inscrito,
    total: l?.total ?? 0,
    temFoto: typeof l?.tem_foto === 'boolean' ? l.tem_foto : await minhaFoto(),
  };
}

/**
 * Estou na fila? Entrar e sair. `total` é quantos estão na fila (sem o banco,
 * `null`). `reler` busca de novo (o mural chama ao abrir).
 */
export function useInscricao(): { inscricao: Inscricao | null; mudando: boolean; mudar: (entrar: boolean) => Promise<void>; reler: () => void } {
  const [inscricao, setInscricao] = useState<Inscricao | null>(null);
  const [mudando, setMudando] = useState(false);
  const vivo = useRef(true);

  const reler = useCallback(() => {
    void lerInscricao().then(i => { if (vivo.current) setInscricao(i); });
  }, []);

  useEffect(() => {
    vivo.current = true;
    reler();
    // Pôs a foto agora (ou tirou): a fila sabe na hora, sem F5.
    const parar = ouvirFotoMudou(reler);
    return () => { vivo.current = false; parar(); };
  }, [reler]);

  const mudar = useCallback(async (entrar: boolean) => {
    setMudando(true);
    try {
      const { data, error } = await rpcSemTipo<LinhaDaInscricao[]>('fn_natal_trem_inscrever', { p_entrar: entrar });
      if (error) {
        if (/SEM_FOTO/.test(error.message)) {
          reler();
          throw new SemFotoDePerfil(error.message);
        }
        if (import.meta.env.DEV && semFuncao(error.message)) {
          const temFoto = await minhaFoto();
          if (entrar && !temFoto) throw new SemFotoDePerfil('SEM_FOTO');
          try { localStorage.setItem(CHAVE_LOCAL, entrar ? '1' : '0'); } catch { /* modo privado */ }
          if (vivo.current) setInscricao({ inscrito: inscritoLocal(), total: null, temFoto });
          return;
        }
        throw new Error(error.message);
      }
      const nova = await paraInscricao(data?.[0], entrar);
      if (vivo.current) setInscricao(nova);
      // A fila mudou: a primeira viagem pode ter acabado de completar os cinco.
      void recarregarAgenda();
    } finally {
      if (vivo.current) setMudando(false);
    }
  }, [reler]);

  return { inscricao, mudando, mudar, reler };
}

/** As fotos em URL de verdade (o cadastro guarda o caminho no storage). */
export function useFotosResolvidas(caminhos: readonly (string | null)[]): (string | null)[] {
  const [resolvidas, setResolvidas] = useState<Record<string, string | null>>({});
  const juntos = caminhos.join('|');
  useEffect(() => {
    let vivo = true;
    for (const c of juntos.split('|')) {
      if (!c || /^(https?:|data:|blob:)/i.test(c) || urlDoAnexoEmCache(c)) continue;
      void urlDoAnexo(c).then(url => { if (vivo) setResolvidas(r => ({ ...r, [c]: url })); });
    }
    return () => { vivo = false; };
  }, [juntos]);
  return caminhos.map(c => {
    if (!c) return null;
    if (/^(https?:|data:|blob:)/i.test(c)) return c;
    return urlDoAnexoEmCache(c) ?? resolvidas[c] ?? null;
  });
}
