import Lenis from 'lenis';
import { sound } from './audio.js';
import { setupTerminal } from './terminal.js';
import { WarpWorld } from './warp.js';

const THEME_KEY = 'aether:theme';
// When true, a light OS preference opens the DAYLIGHT palette on a first visit.
// Set to false to always open on MIDNIGHT and only use the stored choice.
const FOLLOW_SYSTEM_THEME = true;

// Global App State
class AetherApp {
  constructor() {
    this.lenis = null;
    this.scrollProgress = 0;
    this.backdropImage = document.getElementById('space-backdrop-image');
    this.backdropAvif = document.getElementById('space-backdrop-avif');
    this.backdropWebp = document.getElementById('space-backdrop-webp');
    this.backdropElement = document.getElementById('space-backdrop');
    this.backdropSource = '';
    this.backdropRequest = 0;
    this.scrollVelocity = 0;
    this.maxScroll = 1;
    this.activeSection = 'hero';
    this.countersTriggered = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduced-motion', this.reducedMotion);
    this.mqMobile = window.matchMedia('(max-width: 768px)');
    this.mqStackDesktop = window.matchMedia('(max-width: 1024px)');
    // Reading MediaQueryList.matches forces a style/layout flush when styles
    // are dirty, which is exactly the state a scroll frame leaves behind.
    // Cache the result and refresh it only when the query actually changes.
    this.isMobile = this.mqMobile.matches;
    this.isStackDesktop = this.mqStackDesktop.matches;
    this.mqMobile.addEventListener('change', (e) => { this.isMobile = e.matches; });
    this.mqStackDesktop.addEventListener('change', (e) => { this.isStackDesktop = e.matches; });
    this.nativeScrollHandler = () =>
      this.onScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
    this.nativeScrollAttached = false;

    // Scroll work is batched into a single animation frame.
    this.scrollFrame = null;
    this.pendingScroll = 0;
    this.pendingLimit = 1;

    // Cached element references and layout metrics (no per-frame DOM queries).
    this.els = {};
    this.metrics = { sections: new Map() };

    // Aperture Canvas context
    this.apertureCanvas = document.getElementById('aperture-canvas');
    this.apertureCtx = this.apertureCanvas ? this.apertureCanvas.getContext('2d') : null;
    this.aperturePhase = 0;
    this.oscilloscopeFrame = null;
    this.oscilloscopeRunning = false;
    this.canvasCssWidth = 0;
    this.canvasCssHeight = 0;
    this.canvasObserver = null;

    this.refreshAccentColours();

    this.init();
  }

  init() {
    this.cacheElements();
    this.setupMotionPreference();
    this.setupSmoothScroll();
    this.setupPhotoBackdrop();
    this.setupCursor();
    this.setupHeaderHUD();
    this.setupReveal();
    this.setupAnimationPausing();
    this.setupApertureOscilloscope();
    this.observeCanvasVisibility();
    this.setupHorizontalTrack();
    this.watchReelImages();
    this.setupCardTilt();
    this.setupInteractiveCards();
    this.setupStackDeck();
    this.setupCounters();
    this.setupTheme();
    this.setupTerminalModule();
    this.setupWarpFinale();
    this.setupWarpWorld();
    this.setupKeyboardShortcuts();
    this.updateClock();
    this.refreshMetrics();
    this.onScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
    this.restoreHashTarget();

    // Layout can shift after webfonts swap in; keep cached metrics honest.
    if (document.fonts?.ready) document.fonts.ready.then(() => this.refreshMetrics());
    window.addEventListener('load', () => this.refreshMetrics(), { once: true });

    // Recalculate dimensions on resize (debounced)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      this.maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.isMobile = this.mqMobile.matches;
        this.isStackDesktop = this.mqStackDesktop.matches;
        this.refreshMetrics();
        this.sizeApertureCanvas();
        this.onScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
      }, 120);
    });
  }

  // Honor an incoming chapter link (/#telemetry-section) once layout is ready.
  restoreHashTarget() {
    const id = window.location.hash.slice(1);
    if (!id || !this.els.sections[id]) return;
    const el = this.els.sections[id];
    requestAnimationFrame(() => {
      this.refreshMetrics();
      const metric = this.sectionMetric(id);
      const top = metric ? metric.top : el.offsetTop;
      if (this.lenis) this.lenis.scrollTo(top, { immediate: true, force: true });
      else window.scrollTo({ top, behavior: 'auto' });
      this.onScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
    });
  }

  // Cache every element the scroll pipeline touches, so no frame performs a query.
  cacheElements() {
    this.els = {
      progressBar: document.getElementById('progress-bar'),
      percentageTag: document.getElementById('scroll-percentage-tag'),
      velocityVal: document.getElementById('velocity-val'),
      navLinks: Array.from(document.querySelectorAll('.hud-nav .nav-link')),
      scrubNodes: Array.from(document.querySelectorAll('.scrub-node')),
      heroRows: [
        document.getElementById('hero-row-1'),
        document.getElementById('hero-row-2'),
        document.getElementById('hero-row-3'),
      ],
      heroDesc: document.getElementById('hero-desc'),
      widgetLeft: document.getElementById('widget-left'),
      widgetRight: document.getElementById('widget-right'),
      heroSceneImg: document.querySelector('.hero-scene img'),
      apertureIris: document.getElementById('aperture-iris'),
      wings: [
        document.getElementById('wing-tl'),
        document.getElementById('wing-tr'),
        document.getElementById('wing-bl'),
        document.getElementById('wing-br'),
      ],
      stepFill1: document.getElementById('step-fill-1'),
      stepFill2: document.getElementById('step-fill-2'),
      step2: document.getElementById('step-2'),
      step3: document.getElementById('step-3'),
      phaseTitle: document.getElementById('aperture-phase-title'),
      phaseVal: document.getElementById('aperture-phase-val'),
      horizontalTrack: document.getElementById('horizontal-track'),
      meterFill: document.getElementById('horizontal-meter-fill'),
      meterVal: document.getElementById('horizontal-meter-val'),
      pips: Array.from(document.querySelectorAll('.card-pips .pip-btn')),
      scrubThumb: document.getElementById('scrub-thumb'),
      stackCards: [
        document.getElementById('stack-card-1'),
        document.getElementById('stack-card-2'),
        document.getElementById('stack-card-3'),
      ],
      sections: [
        'hero', 'aperture-section', 'horizontal-section', 'stack-section',
        'telemetry-section', 'console-section', 'cta-section',
      ].reduce((acc, id) => {
        const el = document.getElementById(id);
        if (el) acc[id] = el;
        return acc;
      }, {}),
    };
  }

  // Section offsets/heights are read once per layout change, not once per frame.
  refreshMetrics() {
    const map = new Map();
    Object.entries(this.els.sections || {}).forEach(([id, el]) => {
      map.set(id, { top: el.offsetTop, height: el.offsetHeight });
    });
    this.metrics.sections = map;

    // The stack cards are sticky, so their position during scroll is derived
    // from their document offset. Caching it here removes three
    // getBoundingClientRect() calls per frame (a measured hot spot).
    const scrollY = window.scrollY || 0;
    const cards = this.els.stackCards || [];
    this.stackCardTops = cards.map((card) =>
      card ? card.getBoundingClientRect().top + scrollY : null
    );
    this.stackStickyTop = cards[0]
      ? parseFloat(getComputedStyle(cards[0]).top) || 120
      : 120;
    this.lastStackScales = [null, null, null];
  }

  sectionMetric(id) {
    const metric = this.metrics.sections.get(id);
    if (metric && metric.height > 0) return metric;
    // Self-heal if a cached metric was taken before layout settled.
    const el = this.els.sections?.[id];
    if (!el) return metric || null;
    const live = { top: el.offsetTop, height: el.offsetHeight };
    this.metrics.sections.set(id, live);
    return live;
  }

  // 1. Initialize Lenis Smooth Scrolling
  setupSmoothScroll() {
    if (this.reducedMotion) {
      this.attachNativeScroll();
    } else {
      this.lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 2.0,
      });

      const raf = (time) => {
        this.lenis?.raf(time);
        if (this.lenis) requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);

      this.lenis.on('scroll', (e) => {
        this.scrollVelocity = e.velocity || 0;
        this.onScroll(e.scroll, e.limit);
      });
    }

    // Anchor smooth jump
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId && targetId !== '#') {
          e.preventDefault();
          const targetEl = document.querySelector(targetId);
          if (targetEl) {
            if (this.lenis) this.lenis.scrollTo(targetEl, { offset: -60, duration: 1.4 });
            else targetEl.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth' });
            sound.playClick();
          }
        }
      });
    });

    // Side scrub nodes
    document.querySelectorAll('.scrub-node').forEach((node) => {
      node.addEventListener('click', () => {
        const targetId = node.getAttribute('data-target');
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          if (this.lenis) this.lenis.scrollTo(targetEl, { offset: -60, duration: 1.4 });
          else targetEl.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth' });
          sound.playClick();
        }
      });
    });
  }

  refreshAccentColours() {
    const styles = getComputedStyle(document.documentElement);
    this.accentColour = styles.getPropertyValue('--accent').trim() || '#f0c987';
    this.secondaryColour = styles.getPropertyValue('--purple').trim() || '#b3a4f0';
  }

  attachNativeScroll() {
    if (this.nativeScrollAttached) return;
    this.nativeScrollAttached = true;
    window.addEventListener('scroll', this.nativeScrollHandler, { passive: true });
  }

  detachNativeScroll() {
    if (!this.nativeScrollAttached) return;
    this.nativeScrollAttached = false;
    window.removeEventListener('scroll', this.nativeScrollHandler);
  }

  setupMotionPreference() {
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotionQuery.addEventListener('change', (event) => {
      this.reducedMotion = event.matches;
      document.body.classList.toggle('reduced-motion', this.reducedMotion);

      if (this.reducedMotion) {
        this.lenis?.stop();
        this.stopOscilloscope();
        this.attachNativeScroll();
        document.querySelectorAll('.stack-card').forEach((card) => {
          card.style.position = 'relative';
          card.style.top = 'auto';
        });
      } else {
        this.detachNativeScroll();
        this.lenis?.start();
        this.setupApertureOscilloscope();
        this.setupPhotoBackdrop();
        document.querySelectorAll('.stack-card').forEach((card) => {
          card.style.removeProperty('position');
          card.style.removeProperty('top');
        });
      }
      this.onScroll(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
      window.dispatchEvent(new Event('resize'));
    });
  }

  setupPhotoBackdrop() {
    if (!this.backdropImage || !this.backdropElement) return;
    const reveal = () => this.backdropElement.classList.add('is-ready');
    if (this.backdropImage.complete && this.backdropImage.naturalWidth) reveal();
    else this.backdropImage.addEventListener('load', reveal, { once: true });

    this.preloadBackdrops();
  }

  // Chapter backdrops swap as the visitor scrolls. Fetching and decoding a
  // full-bleed AVIF at that moment blocked the main thread for up to ~650ms
  // (measured), right when the chapter arrives. Warm every variant while the
  // page is idle instead; the swap then comes straight from the image cache.
  preloadBackdrops() {
    const bases = [
      'nasa-earth-horizon',
      'nasa-aurora-horizon',
      'nasa-iss-exterior',
      'nasa-solar-array',
      'nasa-carina-nebula',
    ];

    const warm = () => {
      const width = this.backdropWidthFor(window.innerWidth, window.devicePixelRatio || 1);
      bases.forEach((base) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = `/assets/${base}-${width}.avif`;
        // decode() resolves once the bitmap is ready to paint.
        if (typeof img.decode === 'function') img.decode().catch(() => {});
      });
    };

    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
    else setTimeout(warm, 1500);
  }

  // Mirrors how the browser picks a candidate from a srcset so the preloaded
  // file is the one that actually gets used (no double download).
  backdropWidthFor(viewportWidth, dpr) {
    const widths = [640, 1024, 1440, 1920];
    const target = Math.min(1920, Math.round(viewportWidth * dpr));
    for (const w of widths) if (w >= target) return w;
    return widths[widths.length - 1];
  }

  applyBackdropSource(base, { avif = true } = {}) {
    const { backdropAvif: avifSrc, backdropWebp: webpSrc, backdropImage: img } = this;
    if (avifSrc) {
      avifSrc.srcset = avif
        ? ['-640.avif 640w', '-1024.avif 1024w', '-1440.avif 1440w', '-1920.avif 1920w']
            .map((s) => `/assets/${base}${s}`)
            .join(', ')
        : '';
    }
    if (webpSrc) {
      webpSrc.srcset = ['-640.webp 640w', '-1024.webp 1024w', '-1440.webp 1440w', '-1920.webp 1920w']
        .map((s) => `/assets/${base}${s}`)
        .join(', ');
    }
    if (img) {
      img.src = `/assets/${base}.jpg`;
      img.style.opacity = '';
    }
  }

  updatePhotoBackdrop(scroll) {
    if (!this.backdropImage) return;

    const chapters = [
      { id: 'hero', base: 'nasa-earth-horizon' },
      { id: 'aperture-section', base: 'nasa-aurora-horizon' },
      { id: 'horizontal-section', base: 'nasa-iss-exterior' },
      { id: 'stack-section', base: 'nasa-solar-array' },
      { id: 'telemetry-section', base: 'nasa-aurora-horizon' },
      { id: 'console-section', base: 'nasa-earth-horizon' },
      { id: 'cta-section', base: 'nasa-carina-nebula' },
    ];

    const marker = scroll + window.innerHeight * 0.5;
    let nextBase = chapters[0].base;
    for (const chapter of chapters) {
      const metric = this.sectionMetric(chapter.id);
      if (metric && marker >= metric.top) nextBase = chapter.base;
    }

    const width = this.backdropWidthFor(window.innerWidth, window.devicePixelRatio || 1);
    const key = `${nextBase}@${width}`;
    if (key === this.backdropSource) return;
    const requestId = ++this.backdropRequest;
    this.backdropSource = key;
    this.backdropImage.style.opacity = '0';

    const preload = new Image();
    preload.onload = () => {
      if (requestId !== this.backdropRequest) return;
      this.applyBackdropSource(nextBase);
    };
    preload.onerror = () => {
      if (requestId !== this.backdropRequest) return;
      this.applyBackdropSource(nextBase, { avif: false });
      this.backdropImage.style.opacity = '';
    };
    preload.src = `/assets/${nextBase}-${width}.avif`;
  }

  // 3. Custom Magnetic Cursor
  setupCursor() {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    const label = document.getElementById('cursor-label');

    if (!dot || !ring) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let rafId = null;

    // The spring only needs frames while it is actually catching up. Running a
    // permanent rAF loop wrote a transform every frame forever, which kept
    // style recalculation hot even when the page was completely idle.
    const settle = () => {
      const dx = mouseX - ringX;
      const dy = mouseY - ringY;
      if (Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12) {
        ringX = mouseX;
        ringY = mouseY;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
        rafId = null;
        return;
      }
      ringX += dx * 0.15;
      ringY += dy * 0.15;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      rafId = requestAnimationFrame(settle);
    };

    const followPointer = () => {
      if (rafId === null) rafId = requestAnimationFrame(settle);
    };

    // A custom cursor only makes sense for a precise pointer with motion allowed.
    if (this.reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      followPointer();
    }, { passive: true });

    // Hover interactions
    const interactiveElements = document.querySelectorAll('a, button, input, [data-cursor]');
    interactiveElements.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        ring.classList.add('active');
        const customText = el.getAttribute('data-cursor') || '';
        if (label) label.textContent = customText;
      });

      el.addEventListener('mouseleave', () => {
        ring.classList.remove('active');
        if (label) label.textContent = '';
      });
    });
  }

  // 4. Header HUD & Progress Bar
  setupHeaderHUD() {
    const audioBtn = document.getElementById('audio-toggle');
    const audioLabel = document.getElementById('audio-label');

    const reflectAudioState = (isActive) => {
      if (audioBtn) {
        audioBtn.classList.toggle('active', isActive);
        audioBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }
      if (audioLabel) audioLabel.textContent = isActive ? 'AUDIO: ON' : 'AUDIO: OFF';
    };

    if (audioBtn) {
      audioBtn.addEventListener('click', () => reflectAudioState(sound.toggle()));
    }

    sound.onStateChange(reflectAudioState);

    // Show the stored preference; playback still waits for a user gesture.
    reflectAudioState(sound.preferredOn);

    let unlocked = false;
    const unlock = (event) => {
      if (unlocked) return;
      if (event.target?.closest?.('#audio-toggle')) return;
      unlocked = true;
      sound.startIfPreferred();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // No drone synthesis in a background tab.
    document.addEventListener('visibilitychange', () => sound.setPageHidden(document.hidden));
  }

  // Chrome recalculates style for every running CSS animation on every frame,
  // even for transform/opacity. Most of this page's ambient animation lives in
  // sections that are off screen, so pause those.
  //
  // Pausing is applied to the animated element itself rather than to a section
  // subtree: a wildcard (.paused *) selector invalidates every descendant on
  // each toggle, which measured worse than leaving the animations running.
  setupAnimationPausing() {
    if (this.reducedMotion || !('IntersectionObserver' in window)) return;
    if (typeof document.getAnimations !== 'function') return;

    const targets = new Set();
    for (const animation of document.getAnimations()) {
      const el = animation.effect && animation.effect.target;
      if (el && el.nodeType === 1) targets.add(el);
    }
    if (!targets.size) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.style.animationPlayState = entry.isIntersecting ? '' : 'paused';
      });
    }, { rootMargin: '150px 0px' });

    targets.forEach((el) => observer.observe(el));
  }

  setupReveal() {
    const revealItems = document.querySelectorAll(
      '.hero-eyebrow, .hero-title, .hero-description, .hero-actions, .hero-widgets, .scroll-prompt, .aperture-header, .aperture-core-wrapper, .stack-intro, .stack-card, .telemetry-header, .counter-card, .console-header-block, .terminal-window, .cta-inner > .badge-pill, .cta-headline, .cta-desc, .cta-actions'
    );

    revealItems.forEach((item, index) => {
      item.dataset.reveal = '';
      item.style.setProperty('--reveal-order', String(index % 4));
    });

    if (this.reducedMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    document.body.classList.add('motion-ready');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px 0px 0px' });

    revealItems.forEach((item) => observer.observe(item));
  }

  // 5. Global Scroll Handler — writes are batched into one animation frame.
  onScroll(scroll, limit) {
    this.pendingScroll = scroll;
    this.pendingLimit = limit || 1;
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.renderScrollFrame();
    });
  }

  renderScrollFrame() {
    const scroll = this.pendingScroll;
    this.maxScroll = this.pendingLimit || 1;
    this.scrollProgress = Math.max(0, Math.min(1, scroll / this.maxScroll));

    this.updatePhotoBackdrop(scroll);

    // Top progress bar — write only when the value actually changes. Setting
    // these every frame forced a style recalc 60x/second for no visual gain.
    const pct = Math.round(this.scrollProgress * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      if (this.els.progressBar) this.els.progressBar.style.width = `${pct}%`;
      if (this.els.percentageTag) this.els.percentageTag.textContent = `${pct.toString().padStart(2, '0')}%`;
    }

    // Velocity readout
    const velocity = Math.abs(Math.round(this.scrollVelocity * 10));
    if (velocity !== this.lastVelocity) {
      this.lastVelocity = velocity;
      if (this.els.velocityVal) this.els.velocityVal.textContent = `${velocity}`;
    }

    // Section ScrollSpy
    this.updateActiveSection(scroll);

    // Section 1: Hero Parallax
    this.updateHeroParallax(scroll);

    // Section 2: Pinned Aperture
    this.updateApertureSection(scroll);

    // Section 3: Horizontal Reel
    this.updateHorizontalSection(scroll);

    // Section 4: Stacking Deck
    this.updateStackDeck(scroll);
  }

  updateActiveSection(scroll) {
    const marker = scroll + window.innerHeight * 0.42;
    let current = 'hero';

    for (const [secId, metric] of this.metrics.sections) {
      if (marker >= metric.top && marker < metric.top + metric.height) current = secId;
    }

    if (current !== this.activeSection) {
      this.activeSection = current;
      if (!this.reducedMotion) sound.playTick(1400);

      // Keep the URL shareable without adding a history entry per chapter.
      if (history.replaceState) history.replaceState(null, '', `#${current}`);

      this.els.navLinks.forEach((link) => {
        const isActive = link.getAttribute('href') === `#${current}`;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });

      this.els.scrubNodes.forEach((node) => {
        node.classList.toggle('active', node.getAttribute('data-target') === `#${current}`);
      });

      // The fixed rail would sit on top of the horizontally scrolling cards.
      document.body.classList.toggle('hide-side-rail', current === 'horizontal-section');

      const order = Array.from(this.metrics.sections.keys());
      const activeIndex = order.indexOf(current);
      const thumb = this.els.scrubThumb;
      if (thumb && activeIndex >= 0) {
        thumb.style.top = `${(activeIndex / Math.max(1, order.length - 1)) * 100}%`;
      }
    }
  }

  // Hero Parallax Animation
  updateHeroParallax(scroll) {
    if (this.reducedMotion) return;
    const [row1, row2, row3] = this.els.heroRows;
    const { heroDesc: desc, widgetLeft: wLeft, widgetRight: wRight, heroSceneImg: heroScene } = this.els;

    const heroHeight = window.innerHeight * 1.4;
    const p = Math.min(1, Math.max(0, scroll / heroHeight));
    const compact = this.isMobile;

    // Whenever p is pinned at 0 or 1 the transforms are constant, so skip the
    // whole block. This keeps the page quiet at the top and below the hero.
    const cacheKey = `${p.toFixed(4)}|${compact}`;
    if (cacheKey === this.lastHeroKey) return;
    this.lastHeroKey = cacheKey;
    const scale1 = compact ? 1 : 1 + p * 0.15;
    const scale2 = compact ? 1 : 1 + p * 0.1;

    if (row1) row1.style.transform = `translate3d(0, ${-p * 120}px, 0) scale(${scale1})`;
    if (row2) row2.style.transform = `translate3d(0, ${-p * 70}px, 0) scale(${scale2})`;
    if (row3) row3.style.transform = `translate3d(0, ${-p * 30}px, 0)`;

    if (desc) desc.style.opacity = `${Math.max(0, 1 - p * 2.2)}`;

    // Parallax flyout on widgets
    if (wLeft) wLeft.style.transform = `translate3d(${-p * 140}px, ${p * 50}px, 0) rotate(${-p * 5}deg)`;
    if (wRight) wRight.style.transform = `translate3d(${p * 140}px, ${p * 50}px, 0) rotate(${p * 5}deg)`;
    if (heroScene) heroScene.style.transform = `scale(${1.035 + p * 0.045}) translate3d(0, ${p * 2}%, 0)`;
  }

  // Section 2: Pinned Aperture Progression
  updateApertureSection(scroll) {
    const metric = this.sectionMetric('aperture-section');
    if (!metric) return;

    const total = metric.height - window.innerHeight;
    if (total <= 0) return;

    const p = Math.max(0, Math.min(1, (scroll - metric.top) / total));
    const cacheKey = p.toFixed(5);
    if (cacheKey === this.lastApertureKey) return;
    this.lastApertureKey = cacheKey;

    // Animate Iris blade
    const iris = this.els.apertureIris;
    if (iris) iris.setAttribute('r', String(140 - p * 50));

    // 4 Corner Wings Fly-In
    const wingProgress = Math.max(0, Math.min(1, (p - 0.15) / 0.5));
    const offs = [
      [-40 * (1 - wingProgress), -40 * (1 - wingProgress)],
      [40 * (1 - wingProgress), -40 * (1 - wingProgress)],
      [-40 * (1 - wingProgress), 40 * (1 - wingProgress)],
      [40 * (1 - wingProgress), 40 * (1 - wingProgress)],
    ];
    this.els.wings.forEach((wing, i) => {
      if (!wing) return;
      const [dx, dy] = offs[i];
      wing.style.opacity = `${wingProgress}`;
      wing.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    // Step trackers
    if (this.els.stepFill1) this.els.stepFill1.style.width = `${Math.min(100, Math.max(0, (p / 0.5) * 100))}%`;
    if (this.els.stepFill2) this.els.stepFill2.style.width = `${Math.min(100, Math.max(0, ((p - 0.5) / 0.5) * 100))}%`;

    if (this.els.step2) this.els.step2.classList.toggle('active', p >= 0.5);
    if (this.els.step3) this.els.step3.classList.toggle('active', p >= 0.9);

    // Readout status — the strings change far more slowly than the scroll
    // position, so compare before writing to avoid a recalc every frame.
    const phaseTitle = this.els.phaseTitle;
    const phaseVal = this.els.phaseVal;

    if (phaseTitle && phaseVal) {
      let title;
      let value;
      if (p < 0.35) {
        title = 'POLARIZING';
        value = `SIGNAL: ${(12.0 + p * 8).toFixed(1)} THz`;
      } else if (p < 0.75) {
        title = 'COUPLING';
        value = `LOCK: ${(94 + p * 5).toFixed(1)}%`;
      } else {
        title = 'SYNCHRONIZED';
        value = 'LOCKED // OPTIMAL';
      }
      if (title !== this.lastPhaseTitle) {
        this.lastPhaseTitle = title;
        phaseTitle.textContent = title;
      }
      if (value !== this.lastPhaseVal) {
        this.lastPhaseVal = value;
        phaseVal.textContent = value;
      }
    }
  }

  // The reel's panels live outside the viewport inside a transformed track, so
  // Chrome's lazy loader keeps deferring their images long after the chapter
  // is on screen — the media boxes paint empty. Promote them to eager while
  // the chapter is still one viewport away so they are decoded on arrival.
  // The reel's panels sit outside the viewport inside a transformed track, so
  // Chrome's lazy loader defers their images until the chapter is on screen and
  // the media boxes paint empty. Warm them during idle instead — staggered, so
  // five decodes do not land in a single frame (which measured as a stall).
  watchReelImages() {
    const section = document.getElementById('horizontal-section');
    if (!section) return;
    const images = Array.from(section.querySelectorAll('.card-media img'));
    if (!images.length) return;

    const promoted = new Set();
    const promote = (img) => {
      if (promoted.has(img)) return;
      promoted.add(img);
      img.loading = 'eager';
      if (typeof img.decode === 'function') img.decode().catch(() => {});
    };

    const warm = () => {
      images.forEach((img, index) => setTimeout(() => promote(img), index * 140));
    };

    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 1200);

    // Safety net: if the chapter arrives first, promote whatever is left.
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        images.forEach((img) => promote(img));
        observer.disconnect();
      }, { rootMargin: '100% 0px' });
      observer.observe(section);
    }
  }

  // Section 2 Oscilloscope Canvas
  // The backing store is sized to the device pixel ratio, otherwise the
  // waveform is upscaled from 220x220 and looks soft on retina screens.
  sizeApertureCanvas() {
    const canvas = this.apertureCanvas;
    if (!canvas || !this.apertureCtx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    this.apertureCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvasCssWidth = rect.width;
    this.canvasCssHeight = rect.height;
  }

  setupApertureOscilloscope() {
    if (!this.apertureCanvas || !this.apertureCtx) return;
    if (this.reducedMotion) {
      this.stopOscilloscope();
      return;
    }
    if (this.oscilloscopeRunning) return;

    this.sizeApertureCanvas();
    this.oscilloscopeRunning = true;

    const render = () => {
      this.aperturePhase += 0.04 + Math.abs(this.scrollVelocity) * 0.01;
      const ctx = this.apertureCtx;
      const w = this.canvasCssWidth;
      const h = this.canvasCssHeight;
      if (!w || !h) {
        this.oscilloscopeRunning = false;
        return;
      }

      ctx.clearRect(0, 0, w, h);

      // Draw glowing sine waves
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.accentColour || '#f0c987';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x * 0.05 + this.aperturePhase) * 25 * Math.sin(x * 0.02);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Secondary purple harmonic wave
      ctx.strokeStyle = this.secondaryColour || '#b3a4f0';
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.cos(x * 0.08 - this.aperturePhase * 1.5) * 16;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (this.oscilloscopeRunning && !this.reducedMotion) {
        this.oscilloscopeFrame = requestAnimationFrame(render);
      } else {
        this.oscilloscopeRunning = false;
      }
    };
    this.oscilloscopeFrame = requestAnimationFrame(render);
  }

  stopOscilloscope() {
    this.oscilloscopeRunning = false;
    if (this.oscilloscopeFrame) cancelAnimationFrame(this.oscilloscopeFrame);
    this.oscilloscopeFrame = null;
    if (this.apertureCtx) {
      this.apertureCtx.clearRect(0, 0, this.canvasCssWidth, this.canvasCssHeight);
    }
  }

  // The waveform only deserves frames while chapter 02 is actually on screen.
  observeCanvasVisibility() {
    if (!('IntersectionObserver' in window) || !this.apertureCanvas) return;

    this.canvasObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) this.setupApertureOscilloscope();
      else this.stopOscilloscope();
    }, { threshold: 0.01 });
    this.canvasObserver.observe(this.apertureCanvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopOscilloscope();
      else this.setupApertureOscilloscope();
    });
  }

  // Section 3: Horizontal Reel & Interactive Navigation
  setupHorizontalTrack() {
    const prevBtn = document.getElementById('h-prev-btn');
    const nextBtn = document.getElementById('h-next-btn');
    const pips = document.querySelectorAll('.pip-btn');
    const section = document.getElementById('horizontal-section');

    const totalSteps = 6; // Intro + five system components
    const track = this.els.horizontalTrack;
    const isTouchLayout = () => this.reducedMotion || this.isMobile;

    const scrollToStep = (index) => {
      if (isTouchLayout() && track) {
        track.children[index]?.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        return;
      }
      if (!section || !this.lenis) return;
      const start = section.offsetTop;
      const total = section.offsetHeight - window.innerHeight;
      const targetP = Math.max(0, Math.min(1, index / (totalSteps - 1)));
      const targetScroll = start + targetP * total;
      this.lenis.scrollTo(targetScroll, { duration: this.reducedMotion ? 0 : 1.2 });
      sound.playClick();
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (isTouchLayout() && track) {
          track.scrollBy({ left: -track.clientWidth * 0.8, behavior: this.reducedMotion ? 'auto' : 'smooth' });
          return;
        }
        const currentP = this.getCurrentHorizontalProgress();
        const currentIndex = Math.round(currentP * (totalSteps - 1));
        const prevIndex = Math.max(0, currentIndex - 1);
        scrollToStep(prevIndex);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (isTouchLayout() && track) {
          track.scrollBy({ left: track.clientWidth * 0.8, behavior: this.reducedMotion ? 'auto' : 'smooth' });
          return;
        }
        const currentP = this.getCurrentHorizontalProgress();
        const currentIndex = Math.round(currentP * (totalSteps - 1));
        const nextIndex = Math.min(totalSteps - 1, currentIndex + 1);
        scrollToStep(nextIndex);
      });
    }

    pips.forEach((pip) => {
      pip.addEventListener('click', () => {
        const idx = parseInt(pip.getAttribute('data-index'), 10) || 0;
        scrollToStep(idx);
      });
    });

    const syncTrackLayout = () => {
      if (!section || !track) return;
      // Cached: the scroll handler must not measure the track every frame.
      this.trackScrollWidth = track.scrollWidth;
      if (isTouchLayout()) {
        section.style.height = 'auto';
      } else {
        section.style.height = `${window.innerHeight + Math.max(0, track.scrollWidth - window.innerWidth)}px`;
      }
      this.refreshMetrics();
    };

    syncTrackLayout();
    window.addEventListener('resize', syncTrackLayout);

    track?.addEventListener('scroll', () => {
      if (!isTouchLayout()) return;
      const max = track.scrollWidth - track.clientWidth;
      const progress = max > 0 ? track.scrollLeft / max : 0;
      this.updateHorizontalMeter(progress);
    }, { passive: true });

    track?.addEventListener('scrollend', () => {
      if (!isTouchLayout()) return;
      const trackBounds = track.getBoundingClientRect();
      const center = trackBounds.left + trackBounds.width / 2;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      Array.from(track.children).forEach((panel, index) => {
        const bounds = panel.getBoundingClientRect();
        const distance = Math.abs(bounds.left + bounds.width / 2 - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      this.updateHorizontalMeter(nearestIndex / Math.max(1, totalSteps - 1));
    }, { passive: true });
  }

  getCurrentHorizontalProgress() {
    const metric = this.sectionMetric('horizontal-section');
    if (!metric) return 0;
    const total = metric.height - window.innerHeight;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, (window.scrollY - metric.top) / total));
  }

  updateHorizontalSection(scroll) {
    const track = this.els.horizontalTrack;
    if (!track) return;

    if (this.isMobile) {
      track.style.transform = 'none';
      return;
    }

    const metric = this.sectionMetric('horizontal-section');
    if (!metric) return;
    const total = metric.height - window.innerHeight;
    if (total <= 0) return;

    const p = Math.max(0, Math.min(1, (scroll - metric.top) / total));
    const cacheKey = p.toFixed(5);
    if (cacheKey === this.lastHorizontalKey) return;
    this.lastHorizontalKey = cacheKey;

    const maxTrackScroll = (this.trackScrollWidth || track.scrollWidth) - window.innerWidth;
    if (maxTrackScroll > 0) {
      const xTranslate = -p * maxTrackScroll;
      track.style.transform = `translate3d(${xTranslate}px, 0, 0)`;
    }

    this.updateHorizontalMeter(p);
  }

  updateHorizontalMeter(progress) {
    const p = Math.max(0, Math.min(1, progress));
    const fill = this.els.meterFill;
    const val = this.els.meterVal;

    // Quantise before writing: this runs on every scroll frame.
    const fillPct = Math.round(Math.max(10, p * 100));
    if (fill && fillPct !== this.lastMeterPct) {
      this.lastMeterPct = fillPct;
      fill.style.width = `${fillPct}%`;
    }

    const activePipIndex = Math.min(5, Math.round(p * 5));
    if (val && activePipIndex !== this.lastPipIndex) {
      val.textContent = `${String(activePipIndex).padStart(2, '0')} / 05`;
    }
    if (activePipIndex === this.lastPipIndex) return;
    this.lastPipIndex = activePipIndex;

    this.els.pips.forEach((pip, idx) => {
      const isActive = idx === activePipIndex;
      pip.classList.toggle('active', isActive);
      if (isActive) pip.setAttribute('aria-current', 'step');
      else pip.removeAttribute('aria-current');
    });
  }

  // 3D Card Tilt Effect on Mouse Move
  setupCardTilt() {
    if (window.matchMedia('(pointer: coarse)').matches || this.reducedMotion) return;
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      });
    });
  }

  // Interactive Card Controls (Sliders and signal beacons)
  setupInteractiveCards() {
    // Sliders
    const sliders = document.querySelectorAll('.spec-slider');
    sliders.forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const targetId = slider.getAttribute('data-target');
        const target = document.getElementById(targetId);
        if (target) {
          target.textContent = `${e.target.value}% OPTIMAL`;
          sound.playTick(1600);
        }
      });
    });

    // Action Beacons
    const buttons = document.querySelectorAll('.card-action-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const feedback = btn.parentElement.querySelector('.beacon-feedback');
        if (feedback) {
          feedback.textContent = 'SIGNAL SENT…';
          feedback.style.color = this.accentColour || '#f0c987';
          if (!this.reducedMotion) sound.playChord(440, 'triangle');

          setTimeout(() => {
            feedback.textContent = 'TRACE COMPLETE';
            feedback.style.color = getComputedStyle(document.documentElement).getPropertyValue('--signal-ok').trim() || '#a9cfb6';
          }, 600);
        }
      });
    });

  }

  // Section 4: Stacking Deck
  setupStackDeck() {
    // Handled in updateStackDeck
  }

  updateStackDeck(scroll) {
    if (this.reducedMotion || this.isStackDesktop) return;

    const metric = this.sectionMetric('stack-section');
    if (!metric) return;
    // Skip the whole section when it is off screen.
    if (scroll + window.innerHeight < metric.top || scroll > metric.top + metric.height) return;

    const cards = this.els.stackCards;
    const tops = this.stackCardTops;
    const stickyTop = this.stackStickyTop || 120;

    cards.forEach((card, idx) => {
      if (!card || !tops) return;
      const docTop = tops[idx];
      if (docTop == null) return;

      // A sticky element sits at max(stickyTop, natural position).
      const rectTop = Math.max(stickyTop, docTop - scroll);
      const scale = rectTop <= 140
        ? Math.max(0.9, 1 - idx * 0.03 - (140 - rectTop) * 0.0003)
        : 1;

      // Skip redundant transform writes.
      const rounded = Math.round(scale * 1000) / 1000;
      if (rounded === this.lastStackScales[idx]) return;
      this.lastStackScales[idx] = rounded;
      card.style.transform = `scale(${rounded})`;
    });
  }

  // Interface palette: switchable, remembered, and seeded from the OS setting.
  setupTheme() {
    const modes = ['midnight', 'ember', 'polar', 'daylight'];
    const modeBtns = Array.from(document.querySelectorAll('.mode-btn'));
    const profileCopy = {
      midnight: 'MIDNIGHT // deep indigo with warm gold accents.',
      ember: 'EMBER // warm oxblood, copper, and ember light.',
      polar: 'POLAR // cold slate, ice, and pale blue.',
      daylight: 'DAYLIGHT // warm paper, dark ink, and teal.',
    };
    const tones = { midnight: 220, ember: 330, polar: 440, daylight: 290 };

    const applyTheme = (mode, { persist = true } = {}) => {
      if (!modes.includes(mode)) return;
      document.body.classList.remove('theme-midnight', 'theme-ember', 'theme-polar', 'theme-daylight');
      document.body.classList.add(`theme-${mode}`);

      modeBtns.forEach((btn) => {
        const isActive = btn.getAttribute('data-mode') === mode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      const note = document.querySelector('.concept-note');
      if (note) {
        note.textContent = `${profileCopy[mode]} Illustrative readings from a speculative system, not live telemetry.`;
      }

      this.refreshAccentColours();
      if (persist) {
        try {
          localStorage.setItem(THEME_KEY, mode);
        } catch (_) {
          /* storage unavailable — the theme simply is not remembered */
        }
      }
    };

    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        applyTheme(mode);
        if (!this.reducedMotion) {
          sound.playChord(tones[mode] || 220, mode === 'ember' ? 'sawtooth' : 'sine');
        }
      });
    });

    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (_) {
      /* ignore */
    }
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const fallback = FOLLOW_SYSTEM_THEME && prefersLight ? 'daylight' : 'midnight';
    applyTheme(modes.includes(stored) ? stored : fallback, { persist: false });
  }

  // Section 5: Telemetry Counters with Animated Interpolation
  setupCounters() {
    const section = document.getElementById('telemetry-section');
    if (!section) return;

    const revealCounters = () => {
      if (this.countersTriggered) return;
      this.countersTriggered = true;
      if (this.reducedMotion) {
        document.querySelectorAll('.counter-val').forEach((el) => {
          const target = parseFloat(el.getAttribute('data-target')) || 0;
          const decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
          el.textContent = decimals ? target.toFixed(decimals) : Math.round(target).toLocaleString();
        });
      } else {
        this.animateCounters();
        if (!this.reducedMotion) sound.playChord(220, 'sine');
      }
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) revealCounters();
        });
      }, { threshold: 0.25 });
      observer.observe(section);
    } else {
      revealCounters();
    }
  }

  animateCounters() {
    const counterElements = document.querySelectorAll('.counter-val');
    counterElements.forEach((el) => {
      const target = parseFloat(el.getAttribute('data-target')) || 0;
      const decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
      if (this.reducedMotion) {
        el.textContent = decimals === 0 ? Math.round(target).toLocaleString() : target.toFixed(decimals);
        return;
      }

      const duration = 2000;
      const startTime = performance.now();

      const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Ease out expo
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = target * ease;

        if (decimals === 0) {
          el.textContent = Math.round(current).toLocaleString();
        } else {
          el.textContent = current.toFixed(decimals);
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      };
      requestAnimationFrame(update);
    });
  }

  // Section 6: Sci-Fi Terminal
  setupTerminalModule() {
    const terminalEl = document.querySelector('.terminal-window');
    setupTerminal(terminalEl, () => {
      // Callback when 'warp' command entered
      const cta = document.getElementById('cta-section');
      if (!cta) return;
      if (this.lenis) this.lenis.scrollTo(cta, { duration: this.reducedMotion ? 0 : 1.8 });
      else cta.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth' });
    });
  }

  // Section 7: Warp Jump & Confetti
  setupWarpFinale() {
    const warpBtn = document.getElementById('warp-btn');
    const statusPanel = document.getElementById('warp-engine-status');

    if (warpBtn) {
      warpBtn.addEventListener('click', () => {
        this.warpTrigger = warpBtn;
        if (!this.reducedMotion) sound.playWarp();
        if (statusPanel) {
          statusPanel.textContent = 'BEACON TRANSMITTED // SIGNAL OUTBOUND';
          statusPanel.style.color = this.accentColour || '#f0c987';
        }

        // A restrained beacon pulse acknowledges the outgoing signal.
        if (!this.reducedMotion) this.triggerParticleBurst(warpBtn);

        // …and the signal answers by opening the world it came from.
        this.openWarpWorld();
      });
    }

    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      backToTop.addEventListener('click', () => {
        if (this.lenis) this.lenis.scrollTo(0, { duration: this.reducedMotion ? 0 : 1.6 });
        else window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
        if (!this.reducedMotion) sound.playClick();
      });
    }
  }

  // SIGNAL SPACE — the immersive world the signal opens.
  setupWarpWorld() {
    const world = document.getElementById('warp-world');
    const canvas = document.getElementById('warp-canvas');
    const exitBtn = document.getElementById('warp-exit');
    const velEl = document.getElementById('warp-vel');
    const distEl = document.getElementById('warp-dist');
    const sigEl = document.getElementById('warp-sig');
    const coordsEl = document.getElementById('warp-coords');
    const warpLinkBtn = document.getElementById('warp-link-btn');
    if (!world || !canvas) return;

    // The header's WARP LINK opens the world directly.
    warpLinkBtn?.addEventListener('click', () => {
      this.warpTrigger = warpLinkBtn;
      if (!this.reducedMotion) sound.playWarp();
      this.openWarpWorld();
    });

    this.warpWorld = new WarpWorld({
      canvas,
      onOpen: () => {
        world.hidden = false;
        requestAnimationFrame(() => world.classList.add('is-open'));
        document.body.classList.add('warp-open');
        this.lenis?.stop();
        exitBtn?.focus();
      },
      onClose: () => {
        world.classList.remove('is-open');
        document.body.classList.remove('warp-open');
        this.lenis?.start();
        setTimeout(() => { world.hidden = true; }, 900);
        this.warpTrigger?.focus();
      },
      onUnavailable: () => {
        // No WebGL: report it in the page instead of a hidden overlay.
        const status = document.getElementById('warp-engine-status');
        if (status) {
          status.textContent = 'WARP LINK // WEBGL UNAVAILABLE';
          status.style.color = this.accentColour || '#f0c987';
        }
        console.warn('[warp] WebGL is unavailable on this device');
      },
      onExit: () => this.closeWarpWorld(),
      onTick: ({ speed, travel, look }) => {
        if (velEl) velEl.textContent = `${(speed * 0.42 + 0.02).toFixed(3)}c`;
        if (distEl) distEl.textContent = `${(travel * 0.0000042).toFixed(4)} AU`;
        if (sigEl) sigEl.textContent = `LOCKED ${Math.round(72 + speed * 27)}%`;
        if (coordsEl) {
          coordsEl.textContent = `RA ${(17 + look.x * 2.4).toFixed(2)}h · DEC ${(-29 + look.y * 9).toFixed(2)}°`;
        }
      },
    });

    // Keep the page behind the world from scrolling while the wheel travels.
    world.addEventListener('wheel', (event) => {
      if (!this.warpWorld?.active) return;
      event.preventDefault();
    }, { passive: false });

    exitBtn?.addEventListener('click', () => this.closeWarpWorld());
  }

  openWarpWorld() {
    this.warpWorld?.open();
  }

  closeWarpWorld() {
    this.warpWorld?.close();
  }

  triggerParticleBurst(btn) {
    const rect = btn.getBoundingClientRect();
    const burstCount = 40;

    for (let i = 0; i < burstCount; i++) {
      const p = document.createElement('div');
      p.style.position = 'fixed';
      p.style.width = '4px';
      p.style.height = '4px';
      p.style.borderRadius = '50%';
      p.style.backgroundColor = i % 2 === 0 ? '#b9d9cf' : '#c2c7d8';
      p.style.left = `${rect.left + rect.width / 2}px`;
      p.style.top = `${rect.top + rect.height / 2}px`;
      p.style.pointerEvents = 'none';
      p.style.zIndex = '9999';

      document.body.appendChild(p);

      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 120;
      const targetX = Math.cos(angle) * dist;
      const targetY = Math.sin(angle) * dist;

      if (this.reducedMotion) {
        p.remove();
        continue;
      }

      p.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${targetX}px, ${targetY}px) scale(0)`, opacity: 0 }
      ], {
        duration: 600 + Math.random() * 250,
        easing: 'cubic-bezier(0, .9, .57, 1)'
      }).onfinish = () => p.remove();
    }
  }

  // Keyboard shortcut: Spacebar toggles ambient audio
  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.warpWorld?.active) return;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(e.target.tagName) && !e.target.isContentEditable) {
        e.preventDefault();
        sound.toggle();
      }
    });
  }

  // Live UTC Clock in Footer
  updateClock() {
    const clockEl = document.getElementById('system-live-time');
    const tick = () => {
      const now = new Date();
      const yr = now.getUTCFullYear();
      const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
      const da = String(now.getUTCDate()).padStart(2, '0');
      const hr = String(now.getUTCHours()).padStart(2, '0');
      const mi = String(now.getUTCMinutes()).padStart(2, '0');
      const se = String(now.getUTCSeconds()).padStart(2, '0');

      if (clockEl) {
        clockEl.textContent = `UTC: ${yr}.${mo}.${da} // ${hr}:${mi}:${se}`;
      }
    };
    setInterval(tick, 1000);
    tick();
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new AetherApp();
  // Dev-only handle for profiling/debugging; stripped from production builds.
  if (import.meta.env?.DEV) window.__aether = app;
});
