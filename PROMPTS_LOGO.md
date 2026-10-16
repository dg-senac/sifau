# SIFAU — Prompts para geração da logo

Prompts prontos para copiar e colar em geradores de imagem (Midjourney, Flux, DALL·E, Ideogram, Firefly, Leonardo…).
Estão em **inglês** de propósito: os modelos seguem instruções de tipografia e estilo com mais precisão em inglês. A explicação de cada bloco está em português.

---

> **Atualização:** a marca do SIFAU **já existe e está implementada em código**
> (`src/lib/marca.ts`), com a tipografia real do aplicativo: símbolo, marca
> horizontal, marca vertical, versão de uma cor, ícone do sistema e os recursos
> do Android. Os prompts abaixo continuam valendo como **referência de direção
> visual** — úteis se você quiser uma versão desenhada por um designer. Se for
> esse o caso, peça a partir do desenho atual (`public/logo-*.svg`) em vez de
> começar do zero: assim a marca não se divide em duas.

## 0. DNA visual que a logo precisa respeitar

Extraído do próprio app, para a logo nascer combinando com o produto:

| Elemento | Valor atual no app |
|---|---|
| Marca já usada | Ícone `ShieldCheck` (escudo com check) dentro de um quadrado arredondado — tela de login, `AuthScreen.tsx` |
| Gradiente da marca | `#1569db` → `#07357d` (diagonal 145°) |
| Azul principal | `#0d428b` |
| Azul de ação | `#1766d1` |
| Azuis claros | `#e7f0ff`, `#eaf2fe` |
| Fundo do app | `#f5f8fc`, com gradiente `#f7fbff` → `#eaf3ff` na tela de login |
| Verde (sucesso) | `#2aaf75` |
| Âmbar (alerta) | `#f0a428` |
| Tipografia de títulos | Space Grotesk, pesos 500–700 |
| Tipografia de texto | DM Sans |
| Tagline usada no app | "Fiscalização urbana inteligente" |
| Contexto | Fiscalização ambiental e urbana municipal (Recife/PE) |

**Diretriz de conceito:** manter a linhagem do escudo (continuidade com o que já está no app), fundindo com sinalização urbana — malha de ruas, pin de mapa, skyline, folha/água. Nada de martelo de juiz, nada de balança, nada de símbolo genérico de "governo".

---

## 1. Bloco compartilhado (cole junto de qualquer um dos prompts)

> **STYLE:** flat vector logo, minimalist, geometric, Swiss design, high contrast, solid shapes, thick even strokes, designed to stay legible at 24 px. Palette strictly limited to deep navy `#07357d`, royal blue `#1766d1`, vivid blue `#1569db`, soft blue tint `#e7f0ff`, and one small accent of green `#2aaf75`. Clean geometric sans-serif, uppercase, wide letter-spacing, similar to Space Grotesk. Professional government-grade branding, trustworthy, modern, precise.
>
> **NEGATIVE:** no photorealism, no 3D, no bevel, no emboss, no drop shadow, no glossy plastic, no gradient mesh, no lens flare, no mockup, no business card, no presentation slide, no watermark, no signature, no extra text, no misspelled letters, no cluttered detail, no clipart, no scales of justice, no gavel, no laurel wreath.

---

## 2. Logo HORIZONTAL — para a tela de login

**Uso:** `AuthScreen.tsx` — cabeçalho de marca acima do card de login. O container tem no máximo **420 px** de largura, então a logo precisa ler bem entre **200 e 260 px**.

```
A horizontal logo lockup for a municipal urban inspection system called "SIFAU".

Composition: the symbol on the LEFT, the wordmark on the RIGHT, vertically centered on a shared baseline, with clear space between them roughly equal to half the symbol's width.

Symbol: a modern geometric shield with a bold checkmark cut out of it, fused with urban-map language — inside the shield, a subtle simplified street grid with one street highlighted, and a single map-pin notch at the bottom tip. The shield is filled with a linear gradient from vivid blue #1569db (top-left) to deep navy #07357d (bottom-right). The checkmark and grid lines are knocked out in pure white. Simple, iconic, readable as a silhouette.

Wordmark: the text "SIFAU" in a clean geometric sans-serif, uppercase, weight 700, wide letter-spacing, in solid deep navy #0d428b, perfectly kerned and correctly spelled S-I-F-A-U.

Wordmark height approximately 45% of the symbol height, so the symbol leads and the text supports.

Proportions: wide horizontal lockup, aspect ratio 4:1. Symbol and text share one optical center line. Generous margins.

Background: pure white, flat, with a faint rectangular safe area of very light blue #e7f0ff behind the lockup to show clear space. No other elements.

STYLE: flat vector logo, minimalist, geometric, high contrast, solid shapes, legible at 24 px, strict palette of #07357d / #1766d1 / #1569db / #e7f0ff, clean geometric sans-serif, professional government-grade branding, trustworthy, modern, precise.

NEGATIVE: no photorealism, no 3D, no bevel, no drop shadow, no glossy plastic, no mockup, no business card, no presentation slide, no watermark, no extra text, no misspelled letters, no cluttered detail, no scales of justice, no gavel.
```

---

## 3. Logo VERTICAL — com o nome SIFAU

**Uso:** splash do Android, hero da landing page, cabeçalho vertical, tela de abertura. Formato empilhado, símbolo acima e nome abaixo.

```
A vertical stacked logo for a municipal urban inspection system called "SIFAU".

Composition: the symbol centered on TOP, the wordmark "SIFAU" centered directly BELOW it, and the tagline "Fiscalização urbana inteligente" in a smaller line BELOW the wordmark. All three elements centered on a single vertical axis. Vertical aspect ratio 1:1.25.

Symbol: a modern geometric shield with a bold checkmark cut out of it, fused with urban-map language — inside the shield, a subtle simplified street grid with one street highlighted, and a single map-pin notch at the bottom tip. Filled with a linear gradient from vivid blue #1569db (top-left) to deep navy #07357d (bottom-right). Checkmark and grid knocked out in pure white. Rounded-square container with softly rounded corners, like an app icon, generous internal padding. Simple and iconic.

Wordmark: "SIFAU" in a clean geometric sans-serif, uppercase, weight 700, wide letter-spacing, solid deep navy #0d428b, perfectly spelled S-I-F-A-U, correctly kerned.
Tagline: "Fiscalização urbana inteligente" in the same sans-serif family, weight 400, small size, medium letter-spacing, muted grey-blue #7890ae. Tagline width approximately 90% of the wordmark width.

Background: pure white and completely flat. No other elements, no decorations, no border.

STYLE: flat vector logo, minimalist, geometric, high contrast, solid shapes, legible at 24 px, strict palette of #07357d / #1766d1 / #1569db / #e7f0ff, clean geometric sans-serif, professional government-grade branding, trustworthy, modern, precise.

NEGATIVE: no photorealism, no 3D, no bevel, no drop shadow, no glossy plastic, no mockup, no presentation slide, no watermark, no extra text beyond the tagline, no misspelled letters, no cluttered detail, no scales of justice, no gavel.
```

---

## 4. Bônus — os outros ativos que o app precisa

Você vai precisar deles na mesma hora em que a logo existir. Mesmo DNA, formatos diferentes:

### 4.1 Ícone do app (Android `mipmap-*`, favicon, PWA)
```
A single app icon, square 1:1, of a modern geometric shield with a bold white checkmark knocked out of it, fused with a subtle simplified street grid inside and a small map-pin notch at the bottom tip. The shield fills the icon with a linear gradient from vivid blue #1569db at the top-left to deep navy #07357d at the bottom-right. Rounded-square icon shape with generous padding, no text at all, nothing else in the frame. Must stay instantly readable at 48x48 pixels as a solid silhouette.
STYLE: flat vector icon, minimalist, geometric, high contrast, no text, no letters.
NEGATIVE: no text, no letters, no words, no 3D, no bevel, no drop shadow, no glossy plastic, no photorealistic scene, no mockup, no device frame, no watermark.
```

### 4.2 Splash screen (Android `drawable-port-*`)
```
A minimal splash screen: solid deep navy background #07357d, with the SIFAU shield symbol perfectly centered, drawn in white and vivid blue #1569db only, occupying about 25% of the screen height. Large balanced empty margins on every side, absolutely no text, no tagline, no branding line, no other graphic element.
STYLE: flat vector, minimalist, high contrast, geometric emblem, mobile app splash screen, clean and calm.
NEGATIVE: no text, no words, no letters, no photo, no 3D, no bevel, no drop shadow, no UI mockup, no phone frame, no watermark.
```

### 4.3 Logo monocromática (PDF de auto de infração, documentos impressos)
```
The SIFAU shield symbol with a checkmark and street grid, rendered as a single-color flat vector in solid black #000000 on a plain white background. No gradients, no tints, no grey tones, pure black and white only, thin crisp strokes, clean silhouette, no text.
STYLE: flat monochrome vector icon, print-ready, high contrast, one ink color.
NEGATIVE: no color, no gradient, no 3D, no bevel, no drop shadow, no text, no grey halftone, no watermark.
```

### 4.4 Favicon / marca de habilidade (se for para PWA)
```
A tiny simplified version of the SIFAU shield: the shield silhouette with only the white checkmark inside, no street grid, no extra detail at all. Filled with the blue gradient #1569db to #07357d. Square 1:1, maximum simplicity so it stays legible at 16 to 32 pixels, no text.
NEGATIVE: no text, no letters, no fine detail, no 3D, no shadow, no watermark.
```

---

## 5. Como usar — e o ajuste profissional que faz diferença

**A ordem importa.** Geradores de imagem erram letras com frequência — "SIFAU" costuma virar "SIFAU" ok, mas "Fiscalização urbana inteligente" quase sempre sai com letra torta. O fluxo que dá resultado consistente:

1. **Gere o SÍMBOLO com IA** (prompt 4.1 ou a parte "Symbol" dos prompts 2 e 3). É onde a IA é realmente boa: forma, silhueta, equilíbrio.
2. **Escolha a melhor entre 4 a 6 gerações.** Julgue primeiro **em miniatura a 48 px**: se não for reconhecível aí, descarte — não importa o quão bonita esteja grande.
3. **Reconstrua o símbolo em vetor.** Peça ao seu designer (ou a uma ferramenta de vetorização) para redesenhar o símbolo escolhido como SVG de verdade — traçado limpo, não bitmap traçado.
4. **Componha o wordmark com a fonte real.** Escreva "SIFAU" em **Space Grotesk 700** (é a fonte que o app já usa nos títulos, e é gratuita no Google Fonts), com `letter-spacing: 0.04em`, na cor `#0d428b`. Isso garante o alinhamento tipográfico perfeito e a coerência com o app — coisa que a IA não entrega.
5. **Monte os lockups** a partir de símbolo SVG + wordmark em texto real. Agora você tem logo de verdade, editável e escalável, não uma imagem chapada.

**Parâmetros práticos por ferramenta:**
- **Midjourney:** acrescente `--style raw --ar 4:1` (horizontal, item 2) ou `--style raw --ar 4:5` (vertical, item 3). `--no text` se quiser só o símbolo.
- **DALL·E / Ideogram:** peça explicitamente *"flat vector logo, white background"*; Ideogram é o mais confiável em texto.
- **Flux / Leonardo:** use o prompt como está; `guidance` entre 3,5 e 5 costuma dar traço mais limpo.

**Se você aceitar um conselho de marca:** o símbolo mais forte aqui não é o escudo isolado — é o **escudo com a malha urbana dentro**. Ele diz duas coisas ao mesmo tempo ("é fiscalização" + "é cidade") e ninguém no setor usa isso. Vale investir as tentativas nele.

---

## 6. Checklist antes de aprovar a logo

- [ ] Reconhecível em **48 px** (é o teste que reprova 90% das logos)
- [ ] Funciona em **preto e branco** (vai para PDF e impresso — item 4.3)
- [ ] Paleta bate com `#0d428b` / `#1766d1` / `#1569db` do app
- [ ] "SIFAU" escrito corretamente, com kerning uniforme
- [ ] Lê bem sobre **branco** (login) e sobre **navy** (splash)
- [ ] Você tem o **SVG editável**, não só PNG
- [ ] **Não** parece logo de escritório de advocacia nem de banco
