/**
 * vite-plugins/cdn-prefix-images.ts
 *
 * Plugin Vite que reescreve referências a imagens do diretório public/images
 * para apontar para um CDN externo, quando a variável CDN_IMG_PREFIX estiver
 * definida no ambiente de build.
 *
 * Uso:
 *   CDN_IMG_PREFIX=https://cdn.example.com npm run build
 *
 * Suporta reescrita em:
 *   - HTML (atributos src, href, srcset)
 *   - JSX/TSX (atributos src, href, srcSet via AST Babel)
 *   - CSS/SCSS/SASS/LESS (url())
 *
 * Depende de:
 *   @babel/parser, @babel/traverse, @babel/generator, @babel/types
 */

import { type Plugin } from 'vite';
import fs from 'node:fs/promises';
import nodePath from 'node:path';

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

// CJS/ESM interop para as libs Babel
const traverse: typeof _traverse.default = (
  (_traverse as unknown as { default: typeof _traverse.default }).default ?? _traverse
) as typeof _traverse.default;

const generate: typeof _generate.default = (
  (_generate as unknown as { default: typeof _generate.default }).default ?? _generate
) as typeof _generate.default;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function isAbsoluteUrl(p: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(p) || p.startsWith('data:') || p.startsWith('blob:');
}

/**
 * Normaliza referências relativas ou absolutas para o formato canônico
 * '/images/...' (com barra inicial).
 */
function normalizeRef(p: string): string {
  let s = p.trim();
  if (isAbsoluteUrl(s)) return s;
  s = s.replace(/^(\.\/)+/, '');
  while (s.startsWith('../')) s = s.slice(3);
  if (s.startsWith('/')) s = s.slice(1);
  if (!s.startsWith('images/')) return p; // fora da pasta images → sem alteração
  return '/' + s; // canônico: '/images/...'
}

/**
 * Converte um caminho de imagem para a URL do CDN, se o arquivo existir
 * na coleção de imagens do diretório public/.
 */
function toCDN(p: string, cdn: string, imageSet: Set<string>): string {
  const n = normalizeRef(p);
  if (isAbsoluteUrl(n)) return n;
  if (!n.startsWith('/images/')) return p;
  if (!imageSet.has(n)) return p;
  const base = cdn.endsWith('/') ? cdn : cdn + '/';
  return base + n.slice(1); // 'https://cdn/.../images/foo.png'
}

function rewriteSrcsetList(value: string, cdn: string, imageSet: Set<string>): string {
  return value
    .split(',')
    .map((part) => {
      const [url, desc] = part.trim().split(/\s+/, 2);
      const out = toCDN(url, cdn, imageSet);
      return desc ? `${out} ${desc}` : out;
    })
    .join(', ');
}

function rewriteHtml(html: string, cdn: string, imageSet: Set<string>): string {
  // src / href
  html = html.replace(
    /(src|href)\s*=\s*(['"])([^'"]+)\2/g,
    (_m, k, q, p) => `${k}=${q}${toCDN(p, cdn, imageSet)}${q}`
  );
  // srcset
  html = html.replace(
    /(srcset)\s*=\s*(['"])([^'"]+)\2/g,
    (_m, k, q, list) => `${k}=${q}${rewriteSrcsetList(list, cdn, imageSet)}${q}`
  );
  return html;
}

function rewriteCssUrls(code: string, cdn: string, imageSet: Set<string>): string {
  return code.replace(
    /url\((['"]?)([^'")]+)\1\)/g,
    (_m, q, p) => `url(${q}${toCDN(p, cdn, imageSet)}${q})`
  );
}

function rewriteJsxAst(
  code: string,
  id: string,
  cdn: string,
  imageSet: Set<string>,
  debug: boolean
): string | null {
  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  let rewrites = 0;

  traverse(ast, {
    JSXAttribute(path) {
      const name = (path.node.name as t.JSXIdentifier).name;
      const isSrc = name === 'src' || name === 'href';
      const isSrcSet = name === 'srcSet' || name === 'srcset';
      if (!isSrc && !isSrcSet) return;

      const val = path.node.value;
      if (!val) return;

      if (t.isStringLiteral(val)) {
        const before = val.value;
        val.value = isSrc
          ? toCDN(val.value, cdn, imageSet)
          : rewriteSrcsetList(val.value, cdn, imageSet);
        if (val.value !== before) rewrites++;
        return;
      }

      if (t.isJSXExpressionContainer(val) && t.isStringLiteral(val.expression)) {
        const before = val.expression.value;
        val.expression.value = isSrc
          ? toCDN(val.expression.value, cdn, imageSet)
          : rewriteSrcsetList(val.expression.value, cdn, imageSet);
        if (val.expression.value !== before) rewrites++;
      }
    },

    StringLiteral(path) {
      // pula chaves de objetos: { "image": "..." }
      if (t.isObjectProperty(path.parent) && path.parentKey === 'key' && !path.parent.computed)
        return;
      // pula import/export sources
      if (
        t.isImportDeclaration(path.parent) ||
        t.isExportAllDeclaration(path.parent) ||
        t.isExportNamedDeclaration(path.parent)
      )
        return;
      // pula dentro de atributo JSX (já tratado acima)
      if (path.findParent((p) => p.isJSXAttribute())) return;

      const before = path.node.value;
      const after = toCDN(before, cdn, imageSet);
      if (after !== before) {
        path.node.value = after;
        rewrites++;
      }
    },

    TemplateLiteral(path) {
      // trata template sem expressões: `"/images/foo.png"`
      if (path.node.expressions.length) return;
      const raw = path.node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
      const after = toCDN(raw, cdn, imageSet);
      if (after !== raw) {
        path.replaceWith(t.stringLiteral(after));
        rewrites++;
      }
    },
  });

  if (!rewrites) return null;
  const out = generate(ast, { retainLines: true, sourceMaps: false }, code).code;
  if (debug) console.log(`[cdn] ${id} → ${rewrites} rewrites`);
  return out;
}

/**
 * Percorre recursivamente o diretório public/images e popula o Set de caminhos.
 */
async function collectPublicImagesFrom(dir: string, imageSet: Set<string>): Promise<void> {
  const imagesDir = nodePath.join(dir, 'images');
  const stack = [imagesDir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: Awaited<ReturnType<typeof fs.readdir>> = [];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue; // diretório images/ pode não existir
    }
    for (const ent of entries) {
      const full = nodePath.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        const rel = nodePath.relative(dir, full).split(nodePath.sep).join('/');
        const canonical = '/' + rel; // '/images/...'
        imageSet.add(canonical);
        imageSet.add(canonical.slice(1)); // variante sem barra inicial
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin exportado
// ---------------------------------------------------------------------------

/**
 * Plugin Vite: reescreve referências a imagens do diretório public/images
 * para um CDN externo quando CDN_IMG_PREFIX está definido.
 *
 * @example
 * // vite.config.ts
 * import { cdnPrefixImages } from './vite-plugins/cdn-prefix-images';
 * export default defineConfig({ plugins: [cdnPrefixImages()] });
 */
export function cdnPrefixImages(): Plugin {
  const DEBUG = process.env.CDN_IMG_DEBUG === '1';
  let publicDir = '';
  const imageSet = new Set<string>();

  return {
    name: 'cdn-prefix-images-existing',
    apply: 'build',
    enforce: 'pre', // executa antes do @vitejs/plugin-react

    configResolved(cfg) {
      publicDir = cfg.publicDir;
      if (DEBUG) console.log('[cdn] publicDir =', publicDir);
    },

    async buildStart() {
      await collectPublicImagesFrom(publicDir, imageSet);
      if (DEBUG) console.log('[cdn] images found:', imageSet.size);
    },

    transformIndexHtml(html) {
      const cdn = process.env.CDN_IMG_PREFIX;
      if (!cdn) return html;
      const out = rewriteHtml(html, cdn, imageSet);
      if (DEBUG) console.log('[cdn] transformIndexHtml done');
      return out;
    },

    transform(code, id) {
      const cdn = process.env.CDN_IMG_PREFIX;
      if (!cdn) return null;

      if (/\.(jsx|tsx)$/.test(id)) {
        const out = rewriteJsxAst(code, id, cdn, imageSet, DEBUG);
        return out ? { code: out, map: null } : null;
      }

      if (/\.(css|scss|sass|less|styl)$/i.test(id)) {
        const out = rewriteCssUrls(code, cdn, imageSet);
        return out === code ? null : { code: out, map: null };
      }

      return null;
    },
  };
}
