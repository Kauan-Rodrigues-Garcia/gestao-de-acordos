/**
 * Importa nome/instituição/telefone da base "basao" (ERP BookPlay) para
 * public.profissionais, para o autopreenchimento por NR no formulário de
 * novo acordo da BookPlay (o mesmo autocomplete que já existe na PaguePlay
 * pelo campo "Código").
 *
 * Fonte: Y:\Cobranca\Multiplay\OPERADORES\Cleber Junior\Base\basao\basao_202609.csv
 * (~1 milhão de linhas, ";" como separador). Lida linha a linha via stream —
 * nunca carrega o arquivo inteiro em memória.
 *
 * Colunas usadas (índice 0-based, conferido contra o cabeçalho e uma linha
 * de amostra em 2026-09-09):
 *   2   CodCli  -> profissionais.codigo    (= NR usado na tabulação)
 *   3   Cliente -> profissionais.nome
 *   51  Empresa -> profissionais.instituicao (só se bater com uma das 4
 *                  opções conhecidas de INSTITUICOES_OPTIONS; senão NULL —
 *                  decisão: não inventar vínculo com texto ruidoso da base)
 *   228 Fone1   -> profissionais.telefone  (já vem formatado no arquivo)
 *
 * CodCli/Cliente estão nas duas primeiras colunas de dado (posições 3-4 de
 * 586) — qualquer desalinhamento de linhas corrompidas na base legada
 * afeta colunas bem mais à frente, não essas duas.
 *
 * Modo padrão: dry-run (só conta e imprime estatísticas, não grava nada).
 * Só grava de verdade com --aplicar.
 *
 * Uso:
 *   node --env-file=.env.local supabase/scripts/importar_profissionais_bookplay.mjs
 *   node --env-file=.env.local supabase/scripts/importar_profissionais_bookplay.mjs --aplicar
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const CSV_PATH = String.raw`Y:\Cobranca\Multiplay\OPERADORES\Cleber Junior\Base\basao\basao_202609.csv`;
const EMPRESA_ID_BOOKPLAY = '9bed94cd-605d-4d43-9afb-352c72b05c50';
const INSTITUICOES_VALIDAS = ['MUNDIAL EDITORA', 'BOOKPLAY', 'FACULDADE BOOKPLAY', 'FACULDADE PLAY'];
// Compara ignorando espaços — a base tem variantes tipo "FaculdadePlay" sem
// espaço; nenhuma das 4 opções colide entre si depois de remover espaços,
// então isso só recupera essas variantes, sem risco de confundir com outra
// marca (Pagueplay, Editora Brasil, UniversidadePlay continuam sem match).
const INSTITUICOES_SEM_ESPACO = new Map(
  INSTITUICOES_VALIDAS.map((v) => [v.replace(/\s+/g, ''), v]),
);
const IDX_COD_CLI = 2;
const IDX_CLIENTE = 3;
const IDX_EMPRESA = 51;
const IDX_FONE1 = 228;
const MIN_CAMPOS = 500; // cabeçalho tem 586 colunas; linha bem mais curta = fragmento/linha corrompida
const TAMANHO_LOTE = 500;

const aplicar = process.argv.includes('--aplicar');

async function main() {
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let supabase = null;
  if (aplicar) {
    if (url !== 'https://vfrvvoetidtsqbbhdkmj.supabase.co' || !serviceKey) {
      throw new Error('Configuração Supabase ausente ou projeto diferente do esperado.');
    }
    supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  const registros = new Map(); // codigo -> { nome, instituicao, telefone }

  let linhasLidas = 0;
  let linhasIgnoradas = 0;
  let pendente = '';

  const rl = createInterface({
    input: createReadStream(CSV_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let primeira = true;
  for await (const linhaBruta of rl) {
    if (primeira) { primeira = false; continue; } // cabeçalho

    // Aspas em quantidade ímpar = campo citado com quebra de linha literal
    // dentro dele; junta com a próxima linha antes de processar essa linha.
    const linha = pendente ? `${pendente}\n${linhaBruta}` : linhaBruta;
    const aspas = (linha.match(/"/g) ?? []).length;
    if (aspas % 2 !== 0) { pendente = linha; continue; }
    pendente = '';

    linhasLidas++;
    if (linhasLidas % 100000 === 0) {
      console.info(`... ${linhasLidas} linhas lidas, ${registros.size} códigos únicos até aqui`);
    }

    const campos = linha.split(';');
    if (campos.length < MIN_CAMPOS) { linhasIgnoradas++; continue; }

    const codigo = campos[IDX_COD_CLI]?.trim();
    const nome = campos[IDX_CLIENTE]?.trim();
    if (!codigo || !nome) { linhasIgnoradas++; continue; }

    const empresaBruta = (campos[IDX_EMPRESA] ?? '').trim().toUpperCase();
    const instituicao = INSTITUICOES_SEM_ESPACO.get(empresaBruta.replace(/\s+/g, '')) ?? null;
    const telefone = (campos[IDX_FONE1] ?? '').trim() || null;

    // Várias linhas por cliente (parcelas); a última lida para o código
    // vence — não há um critério de "mais recente" confiável no arquivo.
    registros.set(codigo, { nome, instituicao, telefone });
  }

  const total = registros.size;
  const comInstituicao = [...registros.values()].filter((r) => r.instituicao).length;
  console.info(JSON.stringify({
    linhasLidas,
    linhasIgnoradas,
    codigosUnicos: total,
    comInstituicaoReconhecida: comInstituicao,
    semInstituicaoReconhecida: total - comInstituicao,
    modo: aplicar ? 'APLICANDO' : 'DRY-RUN (use --aplicar para gravar)',
  }, null, 2));

  if (!aplicar) return;

  const entradas = [...registros.entries()];
  let gravados = 0;
  for (let i = 0; i < entradas.length; i += TAMANHO_LOTE) {
    const lote = entradas.slice(i, i + TAMANHO_LOTE).map(([codigo, r]) => ({
      empresa_id: EMPRESA_ID_BOOKPLAY,
      codigo,
      nome: r.nome,
      instituicao: r.instituicao,
      telefone: r.telefone,
    }));
    const { error } = await supabase
      .from('profissionais')
      .upsert(lote, { onConflict: 'empresa_id,codigo' });
    if (error) throw new Error(`Lote ${i}-${i + lote.length}: ${error.message}`);
    gravados += lote.length;
    if (gravados % 5000 === 0 || gravados === entradas.length) {
      console.info(`... ${gravados}/${entradas.length} gravados`);
    }
  }

  console.info(JSON.stringify({ gravados }, null, 2));
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
