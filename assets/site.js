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


  /* ------------------------------------------------- account chip */
  // Who is reading. The gate already guaranteed there is a session, so
  // this is presentation only: a name to greet, and a way out. If the
  // call fails the header simply stays as it was.
  function accountChip() {
    var actions = document.querySelector(".site-header .header-actions");
    if (!actions || !window.fetch) return;

    fetch("/api/me", { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !data.user) return;

        var who = data.user.name || data.user.email || "";
        var wrap = document.createElement("div");
        wrap.className = "account-chip no-print";

        if (who) {
          var label = document.createElement("span");
          label.className = "account-name hide-sm";
          label.textContent = who.split(" ")[0];
          label.title = data.user.email || who;
          wrap.appendChild(label);
        }

        var out = document.createElement("button");
        out.type = "button";
        out.className = "btn btn-ghost btn-sm";
        out.textContent = "Sign out";
        out.addEventListener("click", function () {
          out.disabled = true;
          out.textContent = "Signing out...";
          fetch("/api/logout", { method: "POST", credentials: "same-origin" })
            .catch(function () {})
            .then(function () { window.location.replace("/login"); });
        });
        wrap.appendChild(out);

        actions.appendChild(wrap);
      })
      .catch(function () {});
  }

  function start() {
    reveal();
    headerLift();
    accountChip();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
