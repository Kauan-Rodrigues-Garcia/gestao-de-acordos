"""
Gera o ícone do app (PWA) — variante C, aprovada em 30/09/2026.

A mão é a mesma dos logos (`public/logo-bookplay.png`), pintada num degradê
«bagunçado» de azul (BookPlay) e verde (PaguePlay), sobre um fundo liso e
escuro de azul para verde. Um ícone só para as duas empresas.

Uso, da raiz do repositório:

    pip install pillow numpy
    python docs/mobile/gerar-icone.py

Saída:
    docs/mobile/icone-C-1024.png          referência em alta
    public/icons/app-192.png              manifest, purpose "any"
    public/icons/app-512.png              manifest, purpose "any"
    public/icons/app-512-maskable.png     manifest, purpose "maskable"
    public/icons/apple-touch-180.png      iPhone (tela de início)
    public/icons/badge-96.png             barra de status do Android (só a mão, branca)

A semente é fixa: rodar de novo produz os mesmos arquivos.
"""
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / 'public' / 'icons'
S = 1024

rng = np.random.default_rng(7)
logo = Image.open(RAIZ / 'public' / 'logo-bookplay.png').convert('RGBA')

# ── Degradê bagunçado: manchas gaussianas + tendência diagonal + ondulação ──
yy, xx = np.mgrid[0:S, 0:S] / S
campo = np.zeros((S, S))
for _ in range(14):
    cx, cy = 0.15 + 0.7 * rng.random(2)
    r = 0.07 + rng.random() * 0.12
    w = rng.choice([-1, 1])
    campo += w * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))
campo += 0.6 * (xx - yy)
campo += 0.35 * np.sin(xx * 14 + np.cos(yy * 11) * 2.5)
# Normaliza pelo miolo, onde a mão fica: metade azul, metade verde.
miolo = campo[int(S * .2):int(S * .8), int(S * .2):int(S * .8)]
t = np.clip((campo - np.median(miolo)) / (2.2 * miolo.std()) + 0.5, 0, 1)[..., None]

AZUL_CLARO, VERDE_CLARO = np.array([0x38, 0xbd, 0xf8], float), np.array([0x4a, 0xde, 0x5a], float)
AZUL_ESCURO, VERDE_ESCURO = np.array([0x0a, 0x2a, 0x4a], float), np.array([0x0b, 0x3a, 0x1e], float)

mao = Image.fromarray((AZUL_CLARO * (1 - t) + VERDE_CLARO * t).astype(np.uint8), 'RGB')
d = np.clip((xx + yy) / 2, 0, 1)[..., None]
fundo = Image.fromarray((AZUL_ESCURO * (1 - d) + VERDE_ESCURO * d).astype(np.uint8), 'RGB')


def mascara_da_mao(escala: float) -> Image.Image:
    """Canal alfa do logo, centralizado, ocupando `escala` do quadro."""
    n = int(S * escala)
    alfa = logo.resize((n, n), Image.LANCZOS).split()[3]
    m = Image.new('L', (S, S), 0)
    m.paste(alfa, ((S - n) // 2, (S - n) // 2))
    return m


def icone(escala: float) -> Image.Image:
    im = fundo.copy()
    im.paste(mao, (0, 0), mascara_da_mao(escala))
    return im


def salvar(im: Image.Image, lado: int, nome: str) -> None:
    im.resize((lado, lado), Image.LANCZOS).save(SAIDA / nome, optimize=True)


SAIDA.mkdir(parents=True, exist_ok=True)

normal = icone(0.72)
normal.save(RAIZ / 'docs' / 'mobile' / 'icone-C-1024.png')
salvar(normal, 192, 'app-192.png')
salvar(normal, 512, 'app-512.png')
salvar(normal, 180, 'apple-touch-180.png')

# Maskable: o Android recorta até um círculo de 80% do lado. A mão encolhe
# para caber inteira nessa zona segura.
salvar(icone(0.58), 512, 'app-512-maskable.png')

# Badge: o Android usa só o alfa (silhueta). Mão branca, fundo transparente,
# grande no quadro para não sumir nos 24 dp da barra.
badge = Image.new('RGBA', (S, S), (255, 255, 255, 0))
badge.putalpha(mascara_da_mao(0.96))
salvar(badge, 96, 'badge-96.png')
