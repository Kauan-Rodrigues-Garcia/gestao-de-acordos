#!/usr/bin/env node
/**
 * criar-usuarios-receptivo.mjs
 *
 * Cria em lote os usuários do Receptivo usando o MESMO fluxo de signUp que o
 * Admin do app usa (email sintético `usuario@interno.sistema`, senha temporária,
 * metadata que o trigger fn_criar_perfil_novo_usuario converte em perfil).
 *
 * A senha 123456 é TEMPORÁRIA — o sistema pede a troca no 1º acesso.
 * Usuários que já existem (username duplicado) são PULADOS automaticamente.
 *
 * Rodar (na raiz do projeto):
 *   node scripts/criar-usuarios-receptivo.mjs
 *
 * Config por env (opcional):
 *   SENHA_PADRAO=123456   SETOR_ID=<uuid>   DELAY_MS=1500
 *
 * Este arquivo NÃO deve ser commitado — é um utilitário de onboarding one-off.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── Lê .env.local (mesmas variáveis do app) ──────────────────────────────────
function lerEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const linha of txt.split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = lerEnv();

const SUPABASE_URL  = env.VITE_SUPABASE_URL;
const ANON_KEY      = env.VITE_SUPABASE_ANON_KEY;
const EMPRESA_SLUG  = env.VITE_TENANT_SLUG || 'bookplay';
// Setor "Receptivo" da BookPlay (observado na sessão). Se estiver errado, o
// trigger valida e cai para NULL — aí é só ajustar o setor no Admin depois.
const SETOR_ID      = process.env.SETOR_ID || '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
const SENHA_PADRAO  = process.env.SENHA_PADRAO || '123456';
const DELAY_MS      = Number(process.env.DELAY_MS || 1500);

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env.local');
  process.exit(1);
}

// ── Usuários da print (login → cargo) ────────────────────────────────────────
// Mapa: ELITE→elite, LIDERANÇA→lider, SUPORTE RECEPTIVO→gerencia (não há
// "supervisor" nos cargos válidos), demais times/COB→operador.
const USUARIOS = [
  // COB RECEPTIVO — Beatriz
  ['beatriz_rodrigues', 'operador'],
  ['nicolas_santos',    'operador'],
  // ELITE
  ['kauan_teixeira',    'elite'],       // provavelmente já existe → será pulado
  // LIDERANÇA
  ['bryan_queiroz',     'lider'],
  ['luciana_machado',   'lider'],
  ['matheus_costa',     'lider'],
  // SUPORTE RECEPTIVO
  ['supervisao_receptivo', 'gerencia'],
  // TIME DIGITAL
  ['agatha_rocha',      'operador'],
  ['amanda_paulo',      'operador'],
  ['eduarda_lorenzo',   'operador'],
  ['gabriel_oliveira',  'operador'],
  ['jose_victor',       'operador'],
  ['marianne_freitas',  'operador'],
  ['nayara_cruz',       'operador'],
  // TIME HOME OFFICE
  ['fernanda_paliotta', 'operador'],
  ['juliana_itala',     'operador'],
  ['renata_costa',      'operador'],
  ['viviane_antonio',   'operador'],
  // TIME LUCIANA
  ['bianca_s_santos',   'operador'],
  ['eduardo_melo',      'operador'],
  ['eriele_monteiro',   'operador'],
  ['heloisa_camilo',    'operador'],
  ['jeniffer_oliveira', 'operador'],
  ['maria_mazziero',    'operador'],
  ['maria_valeria',     'operador'],
  // TIME MATHEUS
  ['gabriely_alves',    'operador'],
  ['heloisa_lima',      'operador'],
  ['larissa_pereiraa',  'operador'],
  ['layra_carini',      'operador'],
  ['jeniffer_santos',   'operador'],
];

/** "beatriz_rodrigues" → "Beatriz Rodrigues" */
function nomeDeLogin(login) {
  return login.split('_')
    .map(w => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const res = { criados: [], pulados: [], erros: [] };

console.log(`Criando ${USUARIOS.length} usuários em ${EMPRESA_SLUG} (senha temp: ${SENHA_PADRAO})\n`);

for (const [usuario, perfil] of USUARIOS) {
  const email = `${usuario}@interno.sistema`;
  const nome  = nomeDeLogin(usuario);
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password: SENHA_PADRAO,
      options: { data: { nome, perfil, usuario, setor_id: SETOR_ID, empresa_slug: EMPRESA_SLUG } },
    });
    await supabase.auth.signOut().catch(() => {});
    if (error) {
      const dup = /already|registered|exists|duplicate/i.test(error.message);
      if (dup) { res.pulados.push(usuario); console.log(`⏭  ${usuario} — já existe`); }
      else     { res.erros.push([usuario, error.message]); console.log(`❌ ${usuario} — ${error.message}`); }
    } else {
      res.criados.push(usuario); console.log(`✅ ${usuario} (${perfil})`);
    }
  } catch (e) {
    res.erros.push([usuario, String(e?.message ?? e)]);
    console.log(`❌ ${usuario} — ${e?.message ?? e}`);
  }
  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\n== Resumo ==`);
console.log(`✅ criados: ${res.criados.length}`);
console.log(`⏭  pulados (já existiam): ${res.pulados.length}`);
console.log(`❌ erros: ${res.erros.length}`);
if (res.erros.length) console.log('Detalhe dos erros:', res.erros);
