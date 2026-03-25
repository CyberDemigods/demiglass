/**
 * DemiGlass.js v6.1.0
 *
 * Apple-style Liquid Glass effect for the web.
 * Frosted translucent elements with backdrop blur, SVG refraction
 * (feDisplacementMap), color absorption, directional edge lighting,
 * specular highlights, and depth shadows.
 *
 * Author: CyberDemigods
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DemiGlass = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var clamp = function(v, lo, hi) { return Math.min(Math.max(v, lo), hi); };
  var lerp  = function(a, b, t) { return a + (b - a) * t; };

  // ── SVG refraction filter factory ──────────────────────
  // Uses feTurbulence at very low frequency for smooth, lens-like
  // displacement — NOT noisy high-freq blur.
  var _filterId = 0;

  // Vignette SVG data URI — black center (0), white edges (1)
  // Used for edge-only refraction: turbulence masked so center = neutral
  function vignetteURI(innerStop, outerStop) {
    var i = innerStop || 25;
    var o = outerStop || 85;
    return "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'>" +
      "<defs><radialGradient id='v'>" +
      "<stop offset='" + i + "%' stop-color='black'/>" +
      "<stop offset='" + o + "%' stop-color='white'/>" +
      "</radialGradient></defs>" +
      "<rect width='1' height='1' fill='url(#v)'/></svg>"
    );
  }

  // Lens displacement map — smooth radial gradient for convex lens effect.
  // Center = rgb(128,128,128) = neutral (no displacement).
  // Edges shift outward: R channel goes 0.5→0 (left push), G channel 0.5→0 (up push)
  // on the left/top side, and 0.5→1 on right/bottom — creating a magnifying distortion.
  // For simplicity we use two overlapping gradients with different centers.
  function lensMapURI(innerStop, outerStop) {
    var i = innerStop || 40;
    var o = outerStop || 95;
    // Neutral gray in center, white at edges
    // The displacement map works as: pixel_offset = (channel_value - 0.5) * scale
    // So gray(128)=0 offset, white(255)=+max, black(0)=-max
    // A radial gradient gray→white pushes pixels OUTWARD from center = magnify edges
    return "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
      "<defs>" +
      "<radialGradient id='lx' cx='40%' cy='50%' r='55%'>" +
        "<stop offset='" + i + "%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + o + "%' stop-color='rgb(64,128,128)'/>" +
      "</radialGradient>" +
      "<radialGradient id='rx' cx='60%' cy='50%' r='55%'>" +
        "<stop offset='" + i + "%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + o + "%' stop-color='rgb(192,128,128)'/>" +
      "</radialGradient>" +
      "<radialGradient id='ty' cx='50%' cy='40%' r='55%'>" +
        "<stop offset='" + i + "%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + o + "%' stop-color='rgb(128,64,128)'/>" +
      "</radialGradient>" +
      "<radialGradient id='by' cx='50%' cy='60%' r='55%'>" +
        "<stop offset='" + i + "%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + o + "%' stop-color='rgb(128,192,128)'/>" +
      "</radialGradient>" +
      "</defs>" +
      "<rect width='200' height='200' fill='rgb(128,128,128)'/>" +
      "<rect width='200' height='200' fill='url(#lx)' opacity='0.5'/>" +
      "<rect width='200' height='200' fill='url(#rx)' opacity='0.5'/>" +
      "<rect width='200' height='200' fill='url(#ty)' opacity='0.5'/>" +
      "<rect width='200' height='200' fill='url(#by)' opacity='0.5'/>" +
      "</svg>"
    );
  }

  // Simple edge-only lens: neutral center, ring displacement at edges
  function edgeLensURI(innerStop, outerStop) {
    var i = innerStop || 40;
    var o = outerStop || 90;
    return "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
      "<defs>" +
      "<radialGradient id='e'>" +
        "<stop offset='0%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + i + "%' stop-color='rgb(128,128,128)'/>" +
        "<stop offset='" + ((i + o) / 2) + "%' stop-color='rgb(160,160,160)'/>" +
        "<stop offset='" + o + "%' stop-color='rgb(96,96,96)'/>" +
        "<stop offset='100%' stop-color='rgb(128,128,128)'/>" +
      "</radialGradient>" +
      "</defs>" +
      "<rect width='200' height='200' fill='url(#e)'/>" +
      "</svg>"
    );
  }

  function makeRefractionFilter(opts) {
    var id = 'lgr' + (++_filterId);
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    svg.setAttribute('aria-hidden', 'true');

    var freq = opts.refractionFreq || 0.008;
    var octaves = opts.refractionOctaves || 1;
    var seed = Math.floor(Math.random() * 999);
    var scale = opts.refraction || 0;
    var edge = opts.edgeRefraction || false;
    var lens = opts.lensRefraction || false;
    var edgeLens = opts.edgeLensRefraction || false;
    var edgeInner = opts.edgeInner || 25;
    var edgeOuter = opts.edgeOuter || 85;

    var filterBody;

    if (edgeLens) {
      // ── Edge lens: smooth radial displacement ring at edges, perfectly neutral center
      // No turbulence — pure geometric lens distortion
      filterBody =
        '<feImage href="' + edgeLensURI(edgeInner, edgeOuter) + '" ' +
        'preserveAspectRatio="none" result="lens"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="lens" ' +
        'scale="' + scale + '" xChannelSelector="R" yChannelSelector="G"/>';
    } else if (lens) {
      // ── Full lens: smooth radial displacement map, center neutral, edges push outward
      filterBody =
        '<feImage href="' + lensMapURI(edgeInner, edgeOuter) + '" ' +
        'preserveAspectRatio="none" result="lens"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="lens" ' +
        'scale="' + scale + '" xChannelSelector="R" yChannelSelector="G"/>';
    } else if (edge) {
      // ── Edge turbulence: random warp masked to edges via vignette
      filterBody =
        '<feTurbulence type="turbulence" baseFrequency="' + freq + '" ' +
        'numOctaves="' + octaves + '" seed="' + seed + '" result="warp"/>' +
        '<feImage href="' + vignetteURI(edgeInner, edgeOuter) + '" ' +
        'preserveAspectRatio="none" result="vig"/>' +
        '<feComposite in="warp" in2="vig" operator="arithmetic" ' +
        'k1="1" k2="0" k3="-0.5" k4="0.5" result="edgeWarp"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="edgeWarp" ' +
        'scale="' + scale + '" xChannelSelector="R" yChannelSelector="G"/>';
    } else {
      // ── Full turbulence (uniform across whole area)
      filterBody =
        '<feTurbulence type="turbulence" baseFrequency="' + freq + '" ' +
        'numOctaves="' + octaves + '" seed="' + seed + '" result="warp"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="warp" ' +
        'scale="' + scale + '" xChannelSelector="R" yChannelSelector="G"/>';
    }

    svg.innerHTML =
      '<filter id="' + id + '" x="-20%" y="-20%" width="140%" height="140%" ' +
      'color-interpolation-filters="sRGB">' + filterBody + '</filter>';

    document.body.appendChild(svg);

    return {
      id: id,
      svg: svg,
      disp: svg.querySelector('feDisplacementMap'),
      turb: svg.querySelector('feTurbulence'),
    };
  }

  // =================================================================
  //  GlassSlider
  // =================================================================

  function GlassSlider(container, opts) {
    this.container = typeof container === 'string'
      ? document.querySelector(container) : container;
    if (!this.container) return;

    var d = {
      min: 0, max: 100, value: 50, step: 1,
      orientation: 'horizontal',
      trackThickness: 6,
      thumbWidth: 96, thumbHeight: 56,
      // Backdrop blur
      blur: 6,
      saturate: 1.4,
      brightness: 1.06,
      // Refraction (SVG displacement)
      refraction: 0,            // displacement scale in px (0 = off)
      refractionFreq: 0.008,    // turbulence frequency (lower = smoother waves)
      refractionOctaves: 1,     // turbulence complexity (1 = smooth, 2+ = more detail)
      edgeRefraction: false,    // true = turbulence only at edges, clear center
      lensRefraction: false,    // true = smooth convex lens (no turbulence)
      edgeLensRefraction: false,// true = smooth lens ring at edges, perfect center
      edgeInner: 25,            // % radius where edge effect starts
      edgeOuter: 85,            // % radius where edge effect is full
      // Motion dynamics
      motionBlurBoost: 4,
      motionSaturateBoost: 0.3,
      motionRefractionBoost: 0, // extra refraction px at full speed
      dragRefraction: false,    // true = refraction only while dragging, fades to 0 on release
      lensDecay: 0.88,
      // Appearance
      specular: 0.35,
      tint: 'rgba(255,255,255,0.04)',
      borderColor: 'rgba(255,255,255,0.45)',
      borderWidth: 1,
      borderTopColor: null,
      shadow: true,
      fillColor: 'transparent',
      trackBg: 'transparent',
      onChange: null,
    };

    this.o = {};
    for (var k in d) this.o[k] = opts && opts[k] !== undefined ? opts[k] : d[k];

    this.value = this.o.value;
    this.dragging = false;
    this.velocity = 0;
    this.prevPct = (this.value - this.o.min) / (this.o.max - this.o.min);
    this.motionIntensity = 0;
    this.dragIntensity = 0;   // 0..1, ramps to 1 on drag, decays to 0 on release
    this.raf = null;
    this.destroyed = false;
    this.mx = 0.5; this.my = 0.3;
    this._filter = null;

    this._build();
    this._bindEvents();
    this._setPos();
    this._tick = this._tick.bind(this);
    this.raf = requestAnimationFrame(this._tick);
  }

  GlassSlider.prototype._build = function() {
    var o = this.o;
    var isV = o.orientation === 'vertical';

    // ── Create SVG refraction filter if refraction > 0
    if (o.refraction > 0 || o.motionRefractionBoost > 0 || o.lensRefraction || o.edgeLensRefraction) {
      this._filter = makeRefractionFilter(o);
    }

    // ── Track
    this.track = document.createElement('div');
    this.track.style.cssText =
      'position:relative;cursor:pointer;touch-action:none;overflow:visible;' +
      'background:' + o.trackBg + ';' +
      (isV
        ? 'width:100%;height:100%;'
        : 'width:100%;height:' + Math.max(o.trackThickness, o.thumbHeight + 20) + 'px;');

    // ── Fill
    this.fill = document.createElement('div');
    this.fill.style.cssText =
      'position:absolute;pointer-events:none;transition:none;' +
      'background:' + o.fillColor + ';' +
      (isV
        ? 'left:0;right:0;bottom:0;height:0;'
        : 'top:0;left:0;bottom:0;width:0;');

    // ── Thumb — the glass capsule
    this.thumb = document.createElement('div');
    var bdFilter = this._buildBackdropFilter(o.blur, o.saturate, o.brightness);
    this.thumb.style.cssText =
      'position:absolute;cursor:grab;z-index:10;' +
      'border-radius:9999px;' +
      'width:' + o.thumbWidth + 'px;height:' + o.thumbHeight + 'px;' +
      'transition:transform 0.15s cubic-bezier(.4,0,.2,1), box-shadow 0.2s;' +
      '-webkit-backdrop-filter:' + bdFilter + ';' +
      'backdrop-filter:' + bdFilter + ';' +
      'background:' + o.tint + ';' +
      (o.shadow
        ? 'box-shadow:0 2px 8px rgba(0,0,0,0.10), 0 6px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.08);'
        : '') +
      (isV
        ? 'left:50%;transform:translate(-50%,50%);'
        : 'top:50%;transform:translate(-50%,-50%);');

    // ── Border
    this.thumbBorder = document.createElement('div');
    var baseAlpha = this._parseBorderAlpha();
    var topColor = o.borderTopColor || 'rgba(255,255,255,' + Math.min(1, baseAlpha * 1.8).toFixed(2) + ')';
    this.thumbBorder.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
      'border:' + o.borderWidth + 'px solid ' + o.borderColor + ';' +
      'border-top-color:' + topColor + ';' +
      'border-bottom-color:rgba(255,255,255,' + Math.max(0.05, baseAlpha * 0.4).toFixed(2) + ');';

    // ── Specular
    this.thumbSpec = document.createElement('div');
    this.thumbSpec.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
      'opacity:' + o.specular + ';' +
      'background:linear-gradient(170deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 30%, transparent 55%);';

    // ── Inner shadow
    this.thumbInner = document.createElement('div');
    this.thumbInner.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
      'box-shadow:inset 0 -1px 3px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.06);';

    // Assemble
    this.thumb.appendChild(this.thumbBorder);
    this.thumb.appendChild(this.thumbSpec);
    this.thumb.appendChild(this.thumbInner);
    this.track.appendChild(this.fill);
    this.track.appendChild(this.thumb);
    this.container.appendChild(this.track);
  };

  GlassSlider.prototype._parseBorderAlpha = function() {
    var m = this.o.borderColor.match(/[\d.]+(?=\))/);
    return m ? parseFloat(m[0]) : 0.45;
  };

  GlassSlider.prototype._buildBackdropFilter = function(blur, sat, bright) {
    var parts = [];
    if (this._filter) {
      parts.push('url(#' + this._filter.id + ')');
    }
    parts.push('blur(' + blur.toFixed(1) + 'px)');
    parts.push('saturate(' + sat.toFixed(2) + ')');
    parts.push('brightness(' + bright + ')');
    return parts.join(' ');
  };

  GlassSlider.prototype._bindEvents = function() {
    var self = this;
    var isV = self.o.orientation === 'vertical';

    function start(e) {
      e.preventDefault();
      self.dragging = true;
      self.thumb.style.cursor = 'grabbing';
      self.thumb.style.transform = isV
        ? 'translate(-50%,50%) scale(1.04)'
        : 'translate(-50%,-50%) scale(1.04)';
      if (self.o.shadow) {
        self.thumb.style.boxShadow =
          '0 4px 12px rgba(0,0,0,0.14), 0 10px 28px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.10)';
      }
      doMove(e.touches ? e.touches[0] : e);
    }

    function doMove(e) {
      var r = self.track.getBoundingClientRect();
      var pct;
      if (isV) {
        pct = clamp(1 - ((e.clientY - r.top) / r.height), 0, 1);
      } else {
        pct = clamp((e.clientX - r.left) / r.width, 0, 1);
      }
      self.velocity = Math.abs(pct - self.prevPct) * 100;
      self.prevPct = pct;

      var o = self.o;
      var steps = Math.round((pct * (o.max - o.min)) / o.step);
      self.value = clamp(o.min + steps * o.step, o.min, o.max);
      self._setPos();
      if (o.onChange) o.onChange(self.value);
    }

    function move(e) {
      if (!self.dragging) return;
      doMove(e.touches ? e.touches[0] : e);
    }

    function end() {
      if (!self.dragging) return;
      self.dragging = false;
      self.thumb.style.cursor = 'grab';
      self.thumb.style.transform = isV
        ? 'translate(-50%,50%)'
        : 'translate(-50%,-50%)';
      if (self.o.shadow) {
        self.thumb.style.boxShadow =
          '0 2px 8px rgba(0,0,0,0.10), 0 6px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.08)';
      }
    }

    this.track.addEventListener('mousedown', start);
    this.track.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);

    this.thumb.addEventListener('mousemove', function(e) {
      var r = self.thumb.getBoundingClientRect();
      self.mx = clamp((e.clientX - r.left) / r.width, 0, 1);
      self.my = clamp((e.clientY - r.top) / r.height, 0, 1);
    });

    this._cleanup = function() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchend', end);
    };
  };

  GlassSlider.prototype._setPos = function() {
    var o = this.o;
    var pct = ((this.value - o.min) / (o.max - o.min)) * 100;
    if (o.orientation === 'vertical') {
      this.fill.style.height = pct + '%';
      this.thumb.style.bottom = pct + '%';
    } else {
      this.fill.style.width = pct + '%';
      this.thumb.style.left = pct + '%';
    }
  };

  GlassSlider.prototype._tick = function(ts) {
    if (this.destroyed) return;
    var o = this.o;

    // ── Motion intensity (0..1)
    var targetIntensity = clamp(this.velocity / 2, 0, 1);
    if (targetIntensity > this.motionIntensity) {
      this.motionIntensity = lerp(this.motionIntensity, targetIntensity, 0.6);
    } else {
      this.motionIntensity = lerp(this.motionIntensity, targetIntensity, 1 - o.lensDecay);
    }

    if (!this.dragging) {
      this.velocity *= 0.82;
    } else {
      this.velocity *= 0.6;
    }

    var mi = this.motionIntensity;

    // ── Drag intensity: ramps up when dragging, decays on release
    var dragTarget = this.dragging ? 1 : 0;
    if (dragTarget > this.dragIntensity) {
      this.dragIntensity = lerp(this.dragIntensity, dragTarget, 0.25); // fast ramp up
    } else {
      this.dragIntensity = lerp(this.dragIntensity, dragTarget, 0.08); // smooth fade out
    }
    // Snap to 0 when very close (avoid eternal tiny values)
    if (this.dragIntensity < 0.001) this.dragIntensity = 0;

    // ── Update SVG displacement scale
    if (this._filter) {
      var dynRefraction = o.refraction;
      if (o.dragRefraction) {
        dynRefraction = o.refraction * this.dragIntensity;
      }
      if (o.motionRefractionBoost > 0) {
        dynRefraction += mi * o.motionRefractionBoost;
      }
      this._filter.disp.setAttribute('scale', dynRefraction.toFixed(1));
    }

    // ── Dynamic backdrop-filter
    var dynBlur = o.blur + mi * o.motionBlurBoost;
    var dynSat = o.saturate + mi * o.motionSaturateBoost;
    var filterVal = this._buildBackdropFilter(dynBlur, dynSat, o.brightness);
    this.thumb.style.webkitBackdropFilter = filterVal;
    this.thumb.style.backdropFilter = filterVal;

    // ── Specular
    var t = ts * 0.001;
    var sx, sy;
    if (this.dragging) {
      sx = 30 + this.mx * 40;
      sy = 15 + this.my * 30;
    } else {
      sx = 42 + Math.sin(t * 0.2) * 8;
      sy = 22 + Math.cos(t * 0.18) * 5;
    }
    var specAlpha = 0.35 + mi * 0.3;
    this.thumbSpec.style.background =
      'linear-gradient(' + (165 + (sx - 50) * 0.3).toFixed(0) + 'deg, ' +
      'rgba(255,255,255,' + specAlpha.toFixed(2) + ') 0%, ' +
      'rgba(255,255,255,0.06) 30%, transparent 55%)';

    // ── Border brightness reacts to motion
    var baseAlpha = this._parseBorderAlpha();
    var edgeBoost = mi * 0.25;
    var topA = clamp(baseAlpha * 1.8 + edgeBoost, 0, 1).toFixed(3);
    var sideA = clamp(baseAlpha + edgeBoost * 0.5, 0, 1).toFixed(3);
    var botA = clamp(baseAlpha * 0.4 + edgeBoost * 0.2, 0, 1).toFixed(3);
    this.thumbBorder.style.borderTopColor = 'rgba(255,255,255,' + topA + ')';
    this.thumbBorder.style.borderLeftColor = 'rgba(255,255,255,' + sideA + ')';
    this.thumbBorder.style.borderRightColor = 'rgba(255,255,255,' + sideA + ')';
    this.thumbBorder.style.borderBottomColor = 'rgba(255,255,255,' + botA + ')';

    // ── Tint reacts to motion
    var baseTint = this.getTintAlpha();
    var tintAlpha = baseTint + mi * 0.04;
    this.thumb.style.background = 'rgba(255,255,255,' + tintAlpha.toFixed(3) + ')';

    this.raf = requestAnimationFrame(this._tick);
  };

  GlassSlider.prototype.setValue = function(v) {
    this.value = clamp(v, this.o.min, this.o.max);
    this._setPos();
  };

  /**
   * Zmienia przezroczystość tła thumba (tint alpha).
   * @param {number} alpha — 0 (w pełni przezroczysty) do 1 (biały)
   */
  GlassSlider.prototype.setTint = function(alpha) {
    this._tintAlpha = clamp(alpha, 0, 1);
    this.o.tint = 'rgba(255,255,255,' + this._tintAlpha.toFixed(3) + ')';
  };

  /** Zwraca bieżącą wartość tint alpha */
  GlassSlider.prototype.getTintAlpha = function() {
    if (this._tintAlpha !== undefined) return this._tintAlpha;
    // Parse from initial tint
    var m = this.o.tint.match(/[\d.]+(?=\))/);
    return m ? parseFloat(m[0]) : 0.04;
  };

  GlassSlider.prototype.destroy = function() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._cleanup) this._cleanup();
    if (this._filter) this._filter.svg.remove();
    this.container.innerHTML = '';
  };

  // =================================================================
  //  GlassElement (panele, navbary, karty)
  // =================================================================

  function GlassElement(el, opts) {
    this.el = el;
    var d = {
      blur: 12,
      saturate: 1.8,
      brightness: 1.05,
      refraction: 0,
      refractionFreq: 0.008,
      refractionOctaves: 1,
      borderRadius: 20,
      specular: 0.35,
      edgeLight: 0.5,
      border: true,
      shadow: true,
      tint: 'rgba(255,255,255,0.06)',
      interactive: true,
    };
    this.o = {};
    for (var k in d) this.o[k] = opts && opts[k] !== undefined ? opts[k] : d[k];

    this.mx = 0.5; this.my = 0.5;
    this.tmx = 0.5; this.tmy = 0.5;
    this.hover = false;
    this.raf = null;
    this.destroyed = false;
    this._filter = null;

    this._build();
    this._bind();
    this._tick = this._tick.bind(this);
    this.raf = requestAnimationFrame(this._tick);
  }

  GlassElement.prototype._build = function() {
    var o = this.o;
    var s = this.el.style;
    if (!s.position || s.position === 'static') s.position = 'relative';
    s.overflow = 'hidden';
    s.borderRadius = o.borderRadius + 'px';
    s.background = o.tint;
    this.el.classList.add('demiglass');

    // SVG refraction
    if (o.refraction > 0) {
      this._filter = makeRefractionFilter(o);
    }

    var bdParts = [];
    if (this._filter) bdParts.push('url(#' + this._filter.id + ')');
    bdParts.push('blur(' + o.blur + 'px) saturate(' + o.saturate + ') brightness(' + o.brightness + ')');
    var bd = bdParts.join(' ');
    s.webkitBackdropFilter = bd;
    s.backdropFilter = bd;

    if (o.shadow) {
      s.boxShadow = '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)';
    }

    // Specular
    this.spec = document.createElement('div');
    this.spec.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:5;' +
      'opacity:' + o.specular + ';' +
      'background:linear-gradient(170deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.06) 30%, transparent 55%);';

    // Border
    if (o.border) {
      this.borderEl = document.createElement('div');
      this.borderEl.style.cssText =
        'position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:6;' +
        'border:0.5px solid rgba(255,255,255,0.18);' +
        'border-top-color:rgba(255,255,255,0.35);' +
        'border-bottom-color:rgba(255,255,255,0.06);';
    }

    // Inner shadow
    this.innerShadow = document.createElement('div');
    this.innerShadow.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:4;' +
      'box-shadow:inset 0 -1px 3px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.05);';

    this.el.appendChild(this.spec);
    this.el.appendChild(this.innerShadow);
    if (this.borderEl) this.el.appendChild(this.borderEl);
  };

  GlassElement.prototype._bind = function() {
    if (!this.o.interactive) return;
    var self = this;
    this._onMove = function(e) {
      var r = self.el.getBoundingClientRect();
      self.tmx = clamp((e.clientX - r.left) / r.width, 0, 1);
      self.tmy = clamp((e.clientY - r.top) / r.height, 0, 1);
    };
    this._onEnter = function() { self.hover = true; };
    this._onLeave = function() { self.hover = false; self.tmx = 0.5; self.tmy = 0.5; };
    this.el.addEventListener('mousemove', this._onMove);
    this.el.addEventListener('mouseenter', this._onEnter);
    this.el.addEventListener('mouseleave', this._onLeave);
  };

  GlassElement.prototype._tick = function(ts) {
    if (this.destroyed) return;
    var t = ts * 0.001;
    this.mx = lerp(this.mx, this.tmx, 0.1);
    this.my = lerp(this.my, this.tmy, 0.1);

    var sx = this.hover ? (30 + this.mx * 40) : (45 + Math.sin(t * 0.2) * 8);
    this.spec.style.background =
      'linear-gradient(' + (165 + (sx - 50) * 0.4).toFixed(0) + 'deg, ' +
      'rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 30%, transparent 55%)';

    if (this.borderEl) {
      var el = this.o.edgeLight;
      var ly = this.hover ? this.my : 0.35;
      var tA = (0.25 + (1 - ly) * el * 0.3).toFixed(3);
      var bA = (0.04 + ly * el * 0.08).toFixed(3);
      this.borderEl.style.borderTopColor = 'rgba(255,255,255,' + tA + ')';
      this.borderEl.style.borderBottomColor = 'rgba(255,255,255,' + bA + ')';
    }

    this.raf = requestAnimationFrame(this._tick);
  };

  GlassElement.prototype.update = function(opts) {
    for (var k in opts) this.o[k] = opts[k];
  };

  GlassElement.prototype.destroy = function() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._onMove) {
      this.el.removeEventListener('mousemove', this._onMove);
      this.el.removeEventListener('mouseenter', this._onEnter);
      this.el.removeEventListener('mouseleave', this._onLeave);
    }
    [this.spec, this.innerShadow, this.borderEl].forEach(function(e) { if (e) e.remove(); });
    if (this._filter) this._filter.svg.remove();
    this.el.classList.remove('demiglass');
  };

  // =================================================================
  //  Public API
  // =================================================================

  var instances = new Map();

  return {
    version: '6.1.0',

    setBackground: function() {},

    slider: function(container, opts) {
      return new GlassSlider(container, opts);
    },

    init: function(target, opts) {
      var els = typeof target === 'string'
        ? document.querySelectorAll(target)
        : target instanceof NodeList ? target : [target];
      var res = [];
      els.forEach(function(el) {
        var inst = new GlassElement(el, opts);
        var id = 'lg_' + Math.random().toString(36).slice(2, 8);
        el._lgId = id;
        instances.set(id, inst);
        res.push(inst);
      });
      return res.length === 1 ? res[0] : res;
    },

    destroy: function(target) {
      var els = typeof target === 'string' ? document.querySelectorAll(target) : [target];
      els.forEach(function(el) {
        if (el._lgId && instances.has(el._lgId)) {
          instances.get(el._lgId).destroy();
          instances.delete(el._lgId);
          delete el._lgId;
        }
      });
    },

    destroyAll: function() {
      instances.forEach(function(i) { i.destroy(); });
      instances.clear();
    },
  };
});
