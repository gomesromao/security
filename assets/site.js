/* ======================================================================
   Coconut VA Security Essentials: small motion layer.
   Two things only, both optional. Nothing here is required for the page
   to be readable, and everything degrades to "already visible".
   ====================================================================== */
(function () {
  "use strict";

  window.__cvMotion = true;   // tells the inline failsafe we made it
  var root = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------------------------------------------------- reveal on scroll */
  // The `js-reveal` class is set inline in <head> so content is only ever
  // hidden when we are certain we can bring it back. No JS, no blank page.
  function reveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (reduced || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("is-in"); });
      return;
    }

    // Stagger siblings inside a group so a row of cards arrives in sequence
    // rather than as one slab. Capped, so a long list never crawls.
    Array.prototype.forEach.call(document.querySelectorAll("[data-reveal-group]"), function (group) {
      Array.prototype.forEach.call(group.querySelectorAll(".reveal"), function (el, i) {
        el.style.setProperty("--reveal-delay", Math.min(i, 5) * 70 + "ms");
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

    Array.prototype.forEach.call(items, function (el) {
      // Anything already on screen at load appears immediately, with no
      // scroll required and no flash of an empty first viewport.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add("is-in");
      } else {
        io.observe(el);
      }
    });
  }

  /* ------------------------------------------------- header lift */
  function headerLift() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var ticking = false;
    function apply() {
      header.classList.toggle("is-lifted", window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  }

  function start() {
    reveal();
    headerLift();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
