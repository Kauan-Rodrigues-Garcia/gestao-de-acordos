/**
 * cpf.ts — reconhecer um CPF onde ele não deveria estar.
 *
 * A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica no banco
 * (migration 20260728b removeu as colunas que existiam). Mas o campo de código
 * do acordo é texto livre, e um operador digitou o CPF do cliente ali — dado
 * pessoal entrando por uma porta que ninguém estava olhando.
 *
 * ## Por que validar o dígito verificador, e não só "tem 11 dígitos"
 *
 * Bloquear todo valor de 11 dígitos seria mais simples e pegaria mais casos —
 * mas bloqueia trabalho legítimo se algum código do ERP tiver esse tamanho, e
 * um bloqueio falso é pior que uma passagem falsa: o operador não consegue
 * tabular e não entende por quê.
 *
 * Conferindo os dígitos verificadores, a chance de um número qualquer de 11
 * dígitos ser confundido com CPF é ~1%. E os códigos reais que o ERP emite
 * (conferidos nos relatórios de julho/2026 das duas empresas) têm 7 ou 8
 * dígitos — bem longe da faixa. O preço é deixar passar um CPF digitado com
 * erro de digitação, que também não é um código válido e cai nas outras
 * checagens.
 */

/** Só os dígitos — o valor pode vir como `123.456.789-09`, com espaços etc. */
export function apenasDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Calcula um dígito verificador de CPF.
 * `pesoInicial` é 10 para o primeiro dígito e 11 para o segundo.
 */
function digitoVerificador(digitos: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < pesoInicial - 1; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  // 10 e 11 viram 0 — é a regra da Receita, não um arredondamento.
  return resto >= 10 ? 0 : resto;
}

/**
 * O valor é um CPF válido?
 *
 * Aceita com ou sem máscara. Sequências de um dígito só (`111.111.111-11`)
 * passam na conta dos verificadores e por isso são recusadas à parte — é o
 * caso clássico que deixa um validador ingênuo aprovar um CPF impossível.
 */
export function ehCpf(valor: unknown): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  return digitoVerificador(d, 10) === Number(d[9])
      && digitoVerificador(d, 11) === Number(d[10]);
}

/** Mensagem única para as telas — a mesma frase em todos os formulários. */
export const ERRO_CPF_NO_CODIGO =
  'Esse número é um CPF. Use o código do cliente no ERP — CPF não pode ser gravado no sistema.';

// ── CPF escondido no meio de um texto ────────────────────────────────────────

/**
 * Candidatos a CPF dentro de um texto livre — em duas varreduras.
 *
 * 1. **Com separador**: `529.982.247-25`, `529 982 247 25`. O formato 3-3-3-2
 *    é específico o bastante para não colar em número vizinho.
 * 2. **Corrida de dígitos**: `\d+` é guloso e devolve a sequência INTEIRA. Um
 *    CNPJ de 14 dígitos chega como 14 e `ehCpf` recusa por tamanho; um CPF
 *    embutido num número maior nunca é recortado. É a fronteira de graça.
 *
 * A versão anterior usava lookbehind (`(?<!\d)`) para essa fronteira. Funciona,
 * mas quebra no Safari anterior ao 16.4 — e não com um bug sutil: é erro de
 * SINTAXE, avaliado quando o módulo carrega, então a tela inteira morre. Não
 * vale o risco por algo que duas passadas resolvem.
 */
const CPF_COM_SEPARADOR = /\d{3}[.\s]\d{3}[.\s]\d{3}[-\s]\d{2}/g;
const CORRIDA_DE_DIGITOS = /\d+/g;

/** Exportado só para o teste conferir que nenhuma delas usa lookbehind. */
export const PADROES_CPF = [CPF_COM_SEPARADOR, CORRIDA_DE_DIGITOS] as const;

/**
 * O texto contém um CPF em algum lugar?
 *
 * Para campos livres — nome do cliente, observações — onde o CPF não é o valor
 * inteiro, mas aparece no meio ("cliente João, CPF 529.982.247-25").
 */
export function contemCpf(texto: unknown): boolean {
  const s = String(texto ?? '');
  if (!s) return false;
  for (const candidato of s.match(CPF_COM_SEPARADOR) ?? []) {
    if (ehCpf(candidato)) return true;
  }
  // `ehCpf` já exige exatamente 11 dígitos, então a corrida maior é recusada
  // sozinha — é justamente isso que impede recortar CPF de dentro de um CNPJ.
  for (const candidato of s.match(CORRIDA_DE_DIGITOS) ?? []) {
    if (ehCpf(candidato)) return true;
  }
  return false;
}

/**
 * Campos do acordo onde a busca por CPF é feita, com o rótulo que o usuário vê.
 *
 * **`whatsapp` está fora de propósito.** Celular brasileiro tem 11 dígitos
 * (DDD + 9), exatamente o tamanho de um CPF: ~1% dos telefones cairia nos
 * dígitos verificadores por acaso e seria recusado como se fosse CPF. Num
 * cadastro de milhares de acordos isso são dezenas de bloqueios falsos, com o
 * operador sem entender por que não consegue salvar um telefone correto. O
 * campo é de telefone, e um CPF ali seria um telefone inválido de todo jeito.
 */
export const CAMPOS_VERIFICADOS_CPF = [
  { campo: 'instituicao',  rotulo: 'Código' },
  { campo: 'nr_cliente',   rotulo: 'NR' },
  { campo: 'nome_cliente', rotulo: 'Nome do cliente' },
  { campo: 'observacoes',  rotulo: 'Observações' },
] as const;

export type CampoVerificadoCpf = (typeof CAMPOS_VERIFICADOS_CPF)[number]['campo'];

/** Registro com os campos de texto do acordo — o mínimo para a checagem. */
export type AcordoVerificavel = Partial<Record<CampoVerificadoCpf, unknown>>;

/** Rótulos dos campos onde há CPF. Vazio = acordo limpo. */
export function camposComCpf(acordo: AcordoVerificavel | null | undefined): string[] {
  if (!acordo) return [];
  return CAMPOS_VERIFICADOS_CPF
    .filter(({ campo }) => contemCpf(acordo[campo]))
    .map(({ rotulo }) => rotulo);
}

/** Atalho para ordenar e destacar a linha na lista. */
export function acordoTemCpf(acordo: AcordoVerificavel | null | undefined): boolean {
  if (!acordo) return false;
  return CAMPOS_VERIFICADOS_CPF.some(({ campo }) => contemCpf(acordo[campo]));
}

/** Aviso exibido na linha da lista, nomeando onde está o CPF. */
export function avisoCpfDoAcordo(acordo: AcordoVerificavel | null | undefined): string | null {
  const campos = camposComCpf(acordo);
  if (!campos.length) return null;
  const onde = campos.length === 1
    ? campos[0]
    : `${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}`;
  return `CPF encontrado em ${onde}. Remova o CPF deste acordo — dado pessoal não pode ficar no sistema, e o acordo será apagado se continuar assim.`;
}
