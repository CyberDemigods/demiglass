# DemiGlass

Apple-style Liquid Glass effect for the web. Frosted translucent elements with backdrop blur, SVG refraction, color absorption, directional edge lighting, specular highlights, and depth shadows.

**Zero dependencies. Pure vanilla JS. ~8KB minified.**

[Live Demo](https://glass.cyberdemigods.com)

![DemiGlass Preview](https://img.shields.io/badge/version-6.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Backdrop blur & saturation** — frosted glass look using native `backdrop-filter`
- **SVG refraction** — real pixel displacement via `feDisplacementMap` (turbulence or smooth lens)
- **Edge-only refraction** — distortion at the edges, perfectly clear center (like real glass)
- **Drag-reactive refraction** — effect appears only while interacting, fades on release
- **Motion dynamics** — blur, saturation, and refraction intensify with movement speed
- **Directional edge lighting** — brighter top border simulating overhead light
- **Specular highlights** — animated gleam that follows cursor position
- **Tint control** — adjustable transparency at runtime via `setTint()` / `getTintAlpha()`
- **Slider component** — horizontal & vertical, with glass capsule thumb
- **Panel component** — apply glass effect to any DOM element
- Works on Chrome, Edge, Safari, Firefox

---

## Quick Start

### CDN

```html
<script src="https://unpkg.com/demiglass@6.1.0/demiglass.js"></script>
```

### npm

```bash
npm install demiglass
```

```js
const DemiGlass = require('demiglass');
```

---

## Usage

### Glass Slider

```html
<div id="my-slider"></div>

<script src="demiglass.js"></script>
<script>
  DemiGlass.slider('#my-slider', {
    value: 50,
    thumbWidth: 96,
    thumbHeight: 56,
    blur: 6,
    saturate: 1.4,
    refraction: 40,
    edgeLensRefraction: true,
    edgeInner: 45,
    edgeOuter: 85,
    onChange: function(v) {
      console.log('Value:', v);
    }
  });
</script>
```

### Glass Panel

```html
<div id="my-card">
  <h3>Hello</h3>
  <p>Content behind frosted glass</p>
</div>

<script>
  DemiGlass.init('#my-card', {
    blur: 12,
    saturate: 1.6,
    borderRadius: 16,
    specular: 0.3,
    refraction: 8,
    edgeLensRefraction: true
  });
</script>
```

---

## API Reference

### `DemiGlass.slider(selector, options)`

Creates a glass slider component. Returns a slider instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `min` | number | `0` | Minimum value |
| `max` | number | `100` | Maximum value |
| `value` | number | `50` | Initial value |
| `step` | number | `1` | Step increment |
| `orientation` | string | `'horizontal'` | `'horizontal'` or `'vertical'` |
| `thumbWidth` | number | `96` | Thumb width in px |
| `thumbHeight` | number | `56` | Thumb height in px |
| `blur` | number | `6` | Backdrop blur in px |
| `saturate` | number | `1.4` | Backdrop saturation multiplier |
| `brightness` | number | `1.06` | Backdrop brightness multiplier |
| `refraction` | number | `0` | SVG displacement scale in px (0 = off) |
| `refractionFreq` | number | `0.008` | Turbulence frequency (lower = smoother) |
| `refractionOctaves` | number | `1` | Turbulence complexity |
| `edgeRefraction` | boolean | `false` | Turbulence only at edges |
| `lensRefraction` | boolean | `false` | Smooth convex lens distortion |
| `edgeLensRefraction` | boolean | `false` | Smooth lens ring at edges, clean center |
| `edgeInner` | number | `25` | % radius where edge effect starts |
| `edgeOuter` | number | `85` | % radius where edge effect is full |
| `dragRefraction` | boolean | `false` | Refraction only while dragging |
| `motionBlurBoost` | number | `4` | Extra blur px at full drag speed |
| `motionSaturateBoost` | number | `0.3` | Extra saturation at full drag speed |
| `motionRefractionBoost` | number | `0` | Extra refraction px at full drag speed |
| `lensDecay` | number | `0.88` | How fast effects fade (0-1, higher = slower) |
| `specular` | number | `0.35` | Specular highlight intensity |
| `tint` | string | `'rgba(255,255,255,0.04)'` | Background tint color |
| `borderColor` | string | `'rgba(255,255,255,0.45)'` | Border color |
| `borderWidth` | number | `1` | Border width in px |
| `shadow` | boolean | `true` | Enable drop shadow |
| `fillColor` | string | `'transparent'` | Track fill color |
| `trackBg` | string | `'transparent'` | Track background color |
| `onChange` | function | `null` | Callback `function(value)` |

#### Slider instance methods

```js
var slider = DemiGlass.slider('#s', { value: 50 });

slider.setValue(75);          // Set value programmatically
slider.setTint(0.1);          // Set tint alpha (0 = transparent, 1 = white)
slider.getTintAlpha();        // Get current tint alpha
slider.destroy();             // Clean up
```

---

### `DemiGlass.init(selector, options)`

Applies glass effect to existing DOM elements. Returns a GlassElement instance (or array).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `blur` | number | `12` | Backdrop blur in px |
| `saturate` | number | `1.8` | Backdrop saturation multiplier |
| `brightness` | number | `1.05` | Backdrop brightness multiplier |
| `refraction` | number | `0` | SVG displacement scale (0 = off) |
| `refractionFreq` | number | `0.008` | Turbulence frequency |
| `refractionOctaves` | number | `1` | Turbulence complexity |
| `edgeLensRefraction` | boolean | `false` | Smooth lens at edges |
| `borderRadius` | number | `20` | Border radius in px |
| `specular` | number | `0.35` | Specular highlight intensity |
| `edgeLight` | number | `0.5` | Edge lighting intensity |
| `border` | boolean | `true` | Show border |
| `shadow` | boolean | `true` | Show drop shadow |
| `tint` | string | `'rgba(255,255,255,0.06)'` | Tint overlay |
| `interactive` | boolean | `true` | Specular follows mouse |

---

### `DemiGlass.destroy(selector)`

Removes glass effect from elements.

### `DemiGlass.destroyAll()`

Removes all glass effects.

---

## Refraction Modes Explained

### No refraction (`refraction: 0`)
Pure `backdrop-filter` blur + saturation. Clean frosted glass look.

### Full turbulence (default when `refraction > 0`)
Random wave distortion across the entire element. Good for water/crystal effects.

### Edge turbulence (`edgeRefraction: true`)
Turbulence masked to the edges via radial vignette. Center is mostly clear.

### Lens refraction (`lensRefraction: true`)
Smooth convex lens distortion using radial gradients. No randomness — purely geometric.

### Edge lens (`edgeLensRefraction: true`) — recommended
Smooth lens ring at the edges with a **perfectly clear center**. Closest to the Apple Liquid Glass look. Center pixels are mathematically untouched (displacement map = neutral gray).

### Drag-only (`dragRefraction: true`)
Combine with any mode above. Refraction ramps up when the user drags, smoothly fades to zero on release.

---

## Examples

### Apple-style slider (recommended settings)

```js
DemiGlass.slider('#slider', {
  thumbWidth: 108, thumbHeight: 62,
  blur: 0,
  refraction: 40,
  edgeLensRefraction: true,
  edgeInner: 45, edgeOuter: 85,
  dragRefraction: true,
  tint: 'rgba(255,255,255,0.01)',
  borderColor: 'rgba(255,255,255,0.18)',
  borderWidth: 0.5
});
```

### Frosted card

```js
DemiGlass.init('.card', {
  blur: 12,
  saturate: 1.6,
  borderRadius: 20,
  tint: 'rgba(255,255,255,0.04)'
});
```

### Control Center vertical slider

```js
DemiGlass.slider('#volume', {
  orientation: 'vertical',
  thumbWidth: 64, thumbHeight: 80,
  blur: 8, saturate: 1.5
});
```

---

## Browser Support

| Browser | Backdrop blur | SVG Refraction |
|---------|:---:|:---:|
| Chrome 76+ | Yes | Yes |
| Edge 79+ | Yes | Yes |
| Safari 14+ | Yes | Yes |
| Firefox 103+ | Yes | Yes |

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Forged by [CyberDemigods](https://cyberdemigods.com)
