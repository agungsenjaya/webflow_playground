/**
 * embed.js — Webflow port of the React App.tsx coverflow tutorial slider.
 *
 * Consumes `window.tutorialsData[]` emitted per-item by the (hidden) Webflow
 * Collection List embed. Re-implements every interaction in vanilla JS + GSAP:
 *   - 3D coverflow layout (tarot arc) with first-load stagger + drag/keyboard nav
 *   - Material / Scale filters (toggle, mutually exclusive)
 *   - New/Old category switch with 3D flip + gravity arc
 *   - Vimeo dialog with autoplaying main + 3-item sliding sidebar
 *   - Language state defaults to "en" (no toggle UI — videos.en is used)
 *
 * All selectors here MUST match the class names you place on elements in the
 * Webflow Designer (see template.html / GUIDE.md for the reference layout).
 */
(function () {
  "use strict";

  // -----------------------------------------
  // Coverflow layout constants — tarot spread on a table (flat arc)
  // (mirror App.tsx lines 23-29)
  // -----------------------------------------
  var CF_ANGLE_STEP = 0.11; // radians between cards along the arc
  var CF_CENTER_SCALE = 1.3; // active card is bigger
  var CF_NEIGHBOR_SCALE = 0.92; // first neighbor baseline scale
  // Asymmetric visible window: 4 left + 1 active + 3 right = 8 total.
  var CF_VISIBLE_LEFT = 4;
  var CF_VISIBLE_RIGHT = 3;

  // -----------------------------------------
  // Video panel flip constants — 3D flip between New/Old labels
  // (mirror App.tsx lines 34-36)
  // -----------------------------------------
  var FLIP_DURATION = 0.5; // seconds for one flip
  var FLIP_PERSPECTIVE = 1000; // 3D depth
  var FLIP_LIFT = -10; // px the card rises mid-flip (gravity arc)

  // Max number of sidebar thumbnails shown at once (App.tsx line 66)
  var SIDEBAR_MAX = 3;

  // Append an autoplay query param safely (mirror App.tsx lines 45-46).
  function withAutoplay(url) {
    return url.indexOf("?") >= 0 ? url + "&autoplay=1" : url + "?autoplay=1";
  }

  // -----------------------------------------
  // State (mirror App.tsx useState lines 53-63)
  // -----------------------------------------
  var state = {
    activeIndex: 4, // default center card ("Protecting My Land")
    isDialogOpen: false,
    language: "en", // "en" | "es"
    activeVideoUrl: "", // currently-playing main video URL in dialog
    isMaterialsVisible: false,
    isScalesVisible: false,
    videoMode: "new", // "new" | "old"
    activeMaterial: null, // normalized material key or null
    activeScale: null, // "bust" | "54mm" | "75mm" or null
    videoOffset: 0, // sidebar window start index
  };

  var tutorials = []; // raw data from window.tutorialsData
  var cards = []; // filtered view (by videoMode + material + scale)
  var cardEls = []; // DOM card elements, indexed same as `cards`
  var isFirstLoad = true;

  // Drag tracking refs
  var isDragging = false;
  var startX = 0;

  // -----------------------------------------
  // Build filtered `cards` from `tutorials` (mirror useMemo line 71-82).
  // Materials are pre-normalized by the Webflow embed, so we compare directly.
  // -----------------------------------------
  function recomputeCards() {
    cards = tutorials.filter(function (t) {
      if (t.category !== state.videoMode) return false;
      if (state.activeMaterial && t.materials.indexOf(state.activeMaterial) === -1)
        return false;
      if (state.activeScale && t.scales.indexOf(state.activeScale) === -1)
        return false;
      return true;
    });
  }

  // Clamp activeIndex into the (possibly shrunken) cards range.
  function clampActiveIndex() {
    if (cards.length === 0) {
      state.activeIndex = 0;
      return;
    }
    if (state.activeIndex >= cards.length) state.activeIndex = cards.length - 1;
    if (state.activeIndex < 0) state.activeIndex = 0;
  }

  // -----------------------------------------
  // Build / rebuild the card DOM inside .coverflow-container.
  // Creates one element per filtered card, mirrors App.tsx lines 836-863.
  // -----------------------------------------
  var containerEl = null;
  function buildCards() {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    cardEls = [];
    cards.forEach(function (card, index) {
      var el = document.createElement("div");
      el.className = "coverflow-card";
      // (position, size, 3d, hover handled by .coverflow-card in styles.css)

      var img = document.createElement("img");
      img.src = card.img;
      img.alt = card.title;
      img.draggable = false;
      // (object-fit/position/pointer-events handled by .coverflow-card img)
      el.appendChild(img);

      el.addEventListener("click", function () {
        if (index !== state.activeIndex) {
          state.activeIndex = index;
          updateCarouselPositions();
        }
      });

      containerEl.appendChild(el);
      cardEls.push(el);
    });
  }

  // -----------------------------------------
  // Coverflow transform math (mirror updateCarouselPositions line 140-271).
  // -----------------------------------------
  function updateCarouselPositions() {
    var length = cards.length;
    if (length === 0) return; // no data yet
    var radius = window.innerWidth * 0.87;

    // Pre-calculate positions for every card.
    var transforms = cards.map(function (_, i) {
      var diff = i - state.activeIndex;
      if (diff > length / 2) diff -= length;
      else if (diff < -length / 2) diff += length;

      var absDiff = Math.abs(diff);
      var isVisible =
        diff === 0
          ? true
          : diff < 0
            ? absDiff <= CF_VISIBLE_LEFT
            : absDiff <= CF_VISIBLE_RIGHT;

      var theta = diff * CF_ANGLE_STEP;
      var x = radius * Math.sin(theta);
      var y = radius * (1 - Math.cos(theta));
      var rotation = theta * (180 / Math.PI);
      var scale =
        diff === 0 ? CF_CENTER_SCALE : CF_NEIGHBOR_SCALE - (absDiff - 1) * 0.05;
      var opacity = isVisible ? 1 : 0;
      var zIndex = diff === 0 ? 100 : 90 - absDiff * 10;

      return {
        i: i,
        diff: diff,
        isVisible: isVisible,
        x: x,
        y: y,
        rotation: rotation,
        scale: scale,
        opacity: opacity,
        zIndex: zIndex,
      };
    });

    if (isFirstLoad) {
      // 1. Instantly hide all cards, reset rotations, set z-index.
      transforms.forEach(function (t) {
        var el = cardEls[t.i];
        if (!el) return;
        gsap.set(el, {
          zIndex: t.zIndex,
          pointerEvents: t.isVisible ? "auto" : "none",
          rotateY: 0,
          rotateX: 0,
          z: 0,
          opacity: 0,
        });
      });

      // 2. Visible cards only.
      var visible = transforms.filter(function (t) {
        return t.isVisible;
      });
      var maxDistance = Math.max.apply(
        null,
        visible.map(function (t) {
          return Math.abs(t.diff);
        }),
      );

      // 3. Fall from above, outer cards first, active card last.
      visible.forEach(function (t) {
        var el = cardEls[t.i];
        if (!el) return;
        var distanceToCenter = Math.abs(t.diff);
        var delayStep = 0.15;
        var calculatedDelay = (maxDistance - distanceToCenter) * delayStep;

        gsap.fromTo(
          el,
          { x: t.x, y: -900, rotation: 0, scale: t.scale, opacity: 1 },
          {
            x: t.x,
            y: t.y,
            rotation: t.rotation,
            scale: t.scale,
            opacity: 1,
            duration: 2.0,
            delay: calculatedDelay,
            ease: "power2.out",
            overwrite: "auto",
            onComplete: function () {
              if (t.diff === 0) isFirstLoad = false;
            },
          },
        );
      });
    } else {
      // Normal updates (drag / arrow navigation).
      transforms.forEach(function (t) {
        var el = cardEls[t.i];
        if (!el) return;
        gsap.set(el, {
          zIndex: t.zIndex,
          pointerEvents: t.isVisible ? "auto" : "none",
          rotateY: 0,
          rotateX: 0,
          z: 0,
        });
        gsap.to(el, {
          x: t.x,
          y: t.y,
          rotation: t.rotation,
          scale: t.scale,
          opacity: t.opacity,
          duration: 0.65,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
    }
  }

  // -----------------------------------------
  // Navigation helpers (mirror line 280-324).
  // -----------------------------------------
  function goPrev() {
    if (cards.length === 0) return;
    state.activeIndex = (state.activeIndex - 1 + cards.length) % cards.length;
    updateCarouselPositions();
  }
  function goNext() {
    if (cards.length === 0) return;
    state.activeIndex = (state.activeIndex + 1) % cards.length;
    updateCarouselPositions();
  }

  function handleDragStart(clientX) {
    isDragging = true;
    startX = clientX;
  }
  function handleDragMove(clientX) {
    if (!isDragging) return;
    var threshold = Math.max(30, window.innerWidth * 0.026);
    var delta = clientX - startX;
    if (delta > threshold) {
      goPrev(); // swipe right -> previous
      isDragging = false;
    } else if (delta < -threshold) {
      goNext(); // swipe left -> next
      isDragging = false;
    }
  }
  function handleDragEnd() {
    isDragging = false;
  }

  // -----------------------------------------
  // Filters (mirror handleMaterialFilterClick / handleScaleFilterClick,
  // lines 373-386).
  // -----------------------------------------
  function applyMaterialFilter(material) {
    state.activeMaterial =
      state.activeMaterial === material ? null : material;
    state.activeScale = null; // mutual exclusion
    state.activeIndex = 0; // filtered list may be shorter
    recomputeCards();
    buildCards();
    updateCarouselPositions();
    syncMaterialMarkers();
    syncScaleMarkers();
  }
  function applyScaleFilter(scale) {
    state.activeScale = state.activeScale === scale ? null : scale;
    state.activeMaterial = null; // mutual exclusion
    state.activeIndex = 0;
    recomputeCards();
    buildCards();
    updateCarouselPositions();
    syncMaterialMarkers();
    syncScaleMarkers();
  }

  // Adjust marker positions to indicate active filter (mirror inline styles
  // in App.tsx for .skin/.metal/... and .bust/.75mm/.54mm).
  function syncMaterialMarkers() {
    var mats = ["skin", "metal", "fabric", "terrain", "leather", "hair"];
    mats.forEach(function (m) {
      var el = document.querySelector("." + m);
      if (!el) return;
      el.style.objectPosition =
        state.activeMaterial === m ? "center 60%" : "center 10%";
    });
  }
  // NOTE: marker classes are letter-leading (.scale-bust / .scale-54mm /
  // .scale-75mm) to avoid CSS-escape fragility on digit-leading names.
  function syncScaleMarkers() {
    var scs = [
      { key: "bust", cls: "scale-bust" },
      { key: "54mm", cls: "scale-54mm" },
      { key: "75mm", cls: "scale-75mm" },
    ];
    scs.forEach(function (s) {
      var el = document.querySelector("." + s.cls);
      if (!el) return;
      el.style.marginLeft = state.activeScale === s.key ? "0" : "-1.5vw";
    });
  }

  // -----------------------------------------
  // Materials / Scales trigger reveal (mirror handleMaterialsTriggerClick /
  // handleScalesTriggerClick, lines 391-512).
  // -----------------------------------------
  function toggleMaterials() {
    gsap.fromTo(
      ".materials",
      { scale: 1 },
      {
        scale: 0.9,
        x: -30,
        y: 40,
        duration: 0.35,
        ease: "power1.out",
        yoyo: true,
        repeat: 1,
        overwrite: "auto",
      },
    );
    var targetClasses = [".skin", ".metal", ".fabric", ".terrain", ".leather", ".hair"];
    gsap.killTweensOf(targetClasses.join(","));
    if (state.isMaterialsVisible) {
      gsap.to(targetClasses.slice().reverse(), {
        opacity: 0,
        y: 120,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: function () {
          state.isMaterialsVisible = false;
        },
      });
    } else {
      gsap.fromTo(
        targetClasses,
        { opacity: 0, y: 120 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: function () {
            state.isMaterialsVisible = true;
          },
        },
      );
    }
  }

  function toggleScales() {
    gsap.fromTo(
      ".scales",
      { scale: 1 },
      {
        scale: 0.9,
        x: -80,
        y: -40,
        duration: 0.35,
        ease: "power1.out",
        yoyo: true,
        repeat: 1,
        overwrite: "auto",
      },
    );
    var targetClasses = [".scale-bust", ".scale-54mm", ".scale-75mm"];
    gsap.killTweensOf(targetClasses.join(","));
    if (state.isScalesVisible) {
      gsap.to(targetClasses.slice().reverse(), {
        opacity: 0,
        x: -120,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: function () {
          state.isScalesVisible = false;
        },
      });
    } else {
      gsap.fromTo(
        targetClasses,
        { opacity: 0, x: -120 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: function () {
            state.isScalesVisible = true;
          },
        },
      );
    }
  }

  // -----------------------------------------
  // New/Old switch — 3D flip + gravity arc (mirror handleSwitchVideosClick,
  // lines 521-565).
  // -----------------------------------------
  function switchVideos() {
    gsap.killTweensOf(".new-videos, .old-videos");

    var goingToOld = state.videoMode === "new";
    var dir = goingToOld ? "+=180" : "-=180";
    var hideEl = goingToOld ? ".new-videos" : ".old-videos";
    var showEl = goingToOld ? ".old-videos" : ".new-videos";
    var half = FLIP_DURATION / 2;

    gsap.set(hideEl, { pointerEvents: "none" });

    // Swap category immediately and re-filter in parallel with the flip.
    isFirstLoad = true;
    state.activeIndex = 4;
    state.activeMaterial = null;
    state.activeScale = null;
    state.videoMode = goingToOld ? "old" : "new";
    recomputeCards();
    clampActiveIndex();
    buildCards();
    updateCarouselPositions();
    syncMaterialMarkers();
    syncScaleMarkers();

    var tl = gsap.timeline({
      overwrite: "auto",
      onComplete: function () {
        gsap.set(showEl, { pointerEvents: "auto" });
      },
    });
    tl.to(
      ".new-videos, .old-videos",
      { rotateY: dir, duration: FLIP_DURATION, ease: "power2.inOut" },
      0,
    );
    tl.to(
      ".new-videos, .old-videos",
      { y: FLIP_LIFT, duration: half, ease: "power2.out" },
      0,
    );
    tl.to(
      ".new-videos, .old-videos",
      { y: 0, duration: half, ease: "power2.in" },
      half,
    );
  }

  // -----------------------------------------
  // Dialog (mirror openDialog/closeDialog lines 329-367 + IIFE 870-1032).
  // -----------------------------------------
  var dialogOverlayEl = null;
  var dialogContainerEl = null;
  var mainIframeEl = null;
  var sidebarEl = null;

  function currentVideoList() {
    var t = cards[state.activeIndex];
    if (!t) return [];
    return state.language === "en" ? t.videos.en : t.videos.es;
  }

  function openDialog() {
    var list = currentVideoList();
    if (!list || list.length === 0) {
      alert("Tutorial videos for this model are not linked yet.");
      return;
    }
    state.activeVideoUrl = list[0];
    state.videoOffset = 0;
    state.isDialogOpen = true;
    renderDialog();
    dialogOverlayEl.style.display = "flex";
    requestAnimationFrame(function () {
      gsap.fromTo(
        dialogContainerEl,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" },
      );
    });
  }

  function closeDialog() {
    gsap.to(dialogContainerEl, {
      scale: 0.8,
      opacity: 0,
      duration: 0.25,
      ease: "power2.in",
      onComplete: function () {
        state.isDialogOpen = false;
        dialogOverlayEl.style.display = "none";
        // Stop any playing video by clearing the main iframe src.
        if (mainIframeEl) mainIframeEl.src = "about:blank";
      },
    });
  }

  // Render the dialog body for the current tutorial/language/offset.
  // Mirrors the IIFE in App.tsx lines 870-1032.
  function renderDialog() {
    if (!dialogOverlayEl) return;
    var list = currentVideoList();
    var mainSrc = state.activeVideoUrl || (list.length > 0 ? list[0] : "");
    var sidebarVideos = list.filter(function (v) {
      return v !== mainSrc;
    });
    var maxOffset = Math.max(0, sidebarVideos.length - SIDEBAR_MAX);
    var safeOffset = Math.min(state.videoOffset, maxOffset);
    var window_ = sidebarVideos.slice(safeOffset, safeOffset + SIDEBAR_MAX);

    // Main iframe
    if (mainIframeEl) {
      mainIframeEl.src = mainSrc ? withAutoplay(mainSrc) : "about:blank";
    }

    // Sidebar
    if (sidebarEl) {
      sidebarEl.innerHTML = "";
      if (window_.length === 0 && mainSrc) {
        var ph = document.createElement("div");
        ph.className = "sidebar-placeholder";
        ph.textContent = "Single Video Tutorial";
        sidebarEl.appendChild(ph);
      } else {
        window_.forEach(function (url) {
          var item = document.createElement("div");
          item.className = "sidebar-item";
          item.addEventListener("click", function () {
            state.activeVideoUrl = url;
            renderDialog();
          });

          var ifr = document.createElement("iframe");
          ifr.src = url;
          ifr.title = "vimeo-player-sidebar";
          ifr.setAttribute("frameborder", "0");
          ifr.setAttribute("scrolling", "no");
          ifr.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
          item.appendChild(ifr);

          var overlay = document.createElement("div");
          overlay.className = "sidebar-item-overlay";
          var play = document.createElement("div");
          play.className = "sidebar-play-btn";
          var svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          svg.setAttribute("viewBox", "0 0 24 24");
          var path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          path.setAttribute("d", "M8 5v14l11-7z");
          svg.appendChild(path);
          play.appendChild(svg);
          overlay.appendChild(play);
          item.appendChild(overlay);

          sidebarEl.appendChild(item);
        });
      }
    }

    // Nav button disabled states (mirror App.tsx opacity logic).
    var navTop = dialogOverlayEl.querySelector(".navigation-top");
    var navBottom = dialogOverlayEl.querySelector(".navigation-bottom");
    if (navTop) {
      var topDisabled = safeOffset === 0;
      navTop.style.opacity = topDisabled ? "0.3" : "1";
      navTop.style.pointerEvents = topDisabled ? "none" : "auto";
    }
    if (navBottom) {
      var botDisabled = safeOffset >= maxOffset;
      navBottom.style.opacity = botDisabled ? "0.3" : "1";
      navBottom.style.pointerEvents = botDisabled ? "none" : "auto";
    }

    // Wire nav arrows (need current maxOffset in closure).
    navTop && (navTop.onclick = function () {
      state.videoOffset = Math.max(0, state.videoOffset - 1);
      renderDialog();
    });
    navBottom && (navBottom.onclick = function () {
      state.videoOffset = Math.min(maxOffset, state.videoOffset + 1);
      renderDialog();
    });

    // Localized button images (mirror App.tsx lines 992-1018).
    var lang = state.language;
    setImgByLang(".dialog-btn-subscribe", lang, "Subscribe");
    setImgByLang(".dialog-btn-buy", lang, "buy video");
    setImgByLang(".dialog-btn-comments", lang, "comments");
  }

  // Swap a dialog button image src between EN/ES asset variants.
  function setImgByLang(selector, lang, label) {
    var el = document.querySelector(selector);
    if (!el || !el.dataset.enSrc) return;
    el.src = lang === "en" ? el.dataset.enSrc : el.dataset.esSrc;
  }

  // -----------------------------------------
  // Language: state.language is fixed to "en" (toggle UI removed per request).
  // The dialog still picks videos.en / videos.es based on this value and
  // swaps localized button images, but there's no longer a way to flip it.
  // -----------------------------------------

  // -----------------------------------------
  // Wire up static UI elements (chrome buttons).
  // -----------------------------------------
  function bindChrome() {
    // Filter triggers.
    on(".materials-trigger", "click", toggleMaterials);
    on(".scales-trigger", "click", toggleScales);
    on(".switch-videos-trigger", "click", switchVideos);

    // Material filter buttons.
    on(".materials-skin", "click", function () { applyMaterialFilter("skin"); });
    on(".materials-metal", "click", function () { applyMaterialFilter("metal"); });
    on(".materials-fabric", "click", function () { applyMaterialFilter("fabric"); });
    on(".materials-terrain", "click", function () { applyMaterialFilter("terrain"); });
    on(".materials-leather", "click", function () { applyMaterialFilter("leather"); });
    on(".materials-hair", "click", function () { applyMaterialFilter("hair"); });

    // Scale filter buttons.
    on(".scales-bust", "click", function () { applyScaleFilter("bust"); });
    on(".scales-54mm", "click", function () { applyScaleFilter("54mm"); });
    on(".scales-75mm", "click", function () { applyScaleFilter("75mm"); });

    // Nav arrows (App.tsx lines 794-812): prev | open-dialog | next.
    on(".nav-prev", "click", goPrev);
    on(".nav-next", "click", goNext);
    on(".nav-open", "click", openDialog);

    // Dialog close.
    on(".dialog-close-zone", "click", closeDialog);
    on(".dialog-overlay", "click", function (e) {
      if (e.target === dialogOverlayEl) closeDialog();
    });

    // Drag / swipe on the coverflow container (App.tsx lines 828-834).
    if (containerEl) {
      containerEl.addEventListener("mousedown", function (e) { handleDragStart(e.clientX); });
      containerEl.addEventListener("mousemove", function (e) { handleDragMove(e.clientX); });
      containerEl.addEventListener("mouseup", handleDragEnd);
      containerEl.addEventListener("mouseleave", handleDragEnd);
      containerEl.addEventListener("touchstart", function (e) { handleDragStart(e.touches[0].clientX); }, { passive: true });
      containerEl.addEventListener("touchmove", function (e) { handleDragMove(e.touches[0].clientX); }, { passive: true });
      containerEl.addEventListener("touchend", handleDragEnd);
    }
  }

  // Event binder — binds to ALL matches (handles duplicates) and warns loudly
  // if nothing matches, so missing elements aren't a silent no-op.
  function on(selector, evt, handler) {
    var els = document.querySelectorAll(selector);
    if (els.length === 0) {
      console.warn("[embed.js] No element matches '" + selector + "' — " + evt + " handler not attached");
      return;
    }
    els.forEach(function (el) { el.addEventListener(evt, handler); });
  }

  // -----------------------------------------
  // Keyboard navigation (mirror App.tsx lines 281-292, 585-591).
  // -----------------------------------------
  function bindKeyboard() {
    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape" && state.isDialogOpen) closeDialog();
    });
    window.addEventListener("resize", function () {
      updateCarouselPositions();
    });
  }

  // -----------------------------------------
  // Initial hidden states (mirror gsap.set in useEffect, lines 94-126).
  // -----------------------------------------
  function setInitialStates() {
    // Hide material markers.
    gsap.set(".skin, .metal, .fabric, .terrain, .leather, .hair", {
      opacity: 0,
      y: 100,
    });
    // Hide scale markers (moving to the left).
    gsap.set(".scale-bust, .scale-54mm, .scale-75mm", {
      opacity: 0,
      x: -120,
    });
    // 3D flip setup for New/Old labels.
    gsap.set(".new-videos, .old-videos", {
      backfaceVisibility: "hidden",
      transformStyle: "preserve-3d",
      transformOrigin: "center center",
      transformPerspective: FLIP_PERSPECTIVE,
    });
    gsap.set(".old-videos", { rotateY: 180, pointerEvents: "none" });
    gsap.set(".new-videos", { rotateY: 0, pointerEvents: "auto" });

    // Dialog hidden by default.
    if (dialogOverlayEl) dialogOverlayEl.style.display = "none";
  }

  // -----------------------------------------
  // Boot.
  // -----------------------------------------
  function init() {
    containerEl = document.querySelector(".coverflow-container");
    dialogOverlayEl = document.querySelector(".dialog-overlay");
    dialogContainerEl = document.querySelector(".dialog-container");
    mainIframeEl = document.querySelector(".dialog-main-iframe");
    sidebarEl = document.querySelector(".dialog-sidebar");

    // Pull data emitted by the Webflow Collection List embed.
    tutorials = Array.isArray(window.tutorialsData) ? window.tutorialsData : [];

    if (tutorials.length === 0) {
      console.warn("[embed.js] window.tutorialsData is empty — check the Collection List embed.");
    }

    recomputeCards();
    clampActiveIndex();
    setInitialStates();
    buildCards();
    bindChrome();
    bindKeyboard();
    updateCarouselPositions();
  }

  // Wait for DOM (and GSAP) before initializing. Webflow renders the
  // Collection List server-side, so tutorialsData is populated by the time
  // DOMContentLoaded fires.
  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }
  whenReady(function () {
    if (typeof window.gsap === "undefined") {
      console.error("[embed.js] GSAP not found. Add the GSAP library in Webflow (Page Settings → Custom Code) before this script.");
      return;
    }
    // Give the collection list scripts a tick to populate tutorialsData.
    setTimeout(init, 0);
  });
})();
