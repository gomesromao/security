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


  /* ------------------------------------------------- account menu */
  // Who is reading. The gate already guaranteed there is a session, so
  // this is presentation only: an initials disc, and a panel under it
  // with the name and the way out. If the call fails the header simply
  // stays as it was.
  function initialsFrom(name, email) {
    var source = (name || "").trim();
    if (source) {
      var parts = source.split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return (email || "?").charAt(0).toUpperCase();
  }

  function buildAccount(user) {
    var name = user.name || "";
    var email = user.email || "";

    var root = document.createElement("div");
    root.className = "account no-print";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "account-btn";
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Account" + (name ? ", " + name : ""));
    button.title = name || email;
    button.textContent = initialsFrom(name, email);

    var menu = document.createElement("div");
    menu.className = "account-menu";
    menu.hidden = true;

    if (name) {
      var nameEl = document.createElement("p");
      nameEl.className = "account-menu-name";
      nameEl.textContent = name;
      menu.appendChild(nameEl);
    }
    if (email) {
      var emailEl = document.createElement("p");
      emailEl.className = "account-menu-email";
      emailEl.textContent = email;
      menu.appendChild(emailEl);
    }

    var signout = document.createElement("button");
    signout.type = "button";
    signout.className = "account-signout";
    signout.textContent = "Sign out";
    menu.appendChild(signout);

    root.appendChild(button);
    root.appendChild(menu);

    function open(state) {
      menu.hidden = !state;
      button.setAttribute("aria-expanded", state ? "true" : "false");
    }

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      open(menu.hidden);
      if (!menu.hidden) signout.focus();
    });

    // Anywhere else, or Escape, puts it away. Escape hands focus back to
    // the disc so keyboard users are not dropped at the top of the page.
    document.addEventListener("click", function (event) {
      if (!menu.hidden && !root.contains(event.target)) open(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) {
        open(false);
        button.focus();
      }
    });

    signout.addEventListener("click", function () {
      signout.disabled = true;
      signout.textContent = "Signing out...";
      fetch("/api/logout", { method: "POST", credentials: "same-origin" })
        .catch(function () {})
        .then(function () { window.location.replace("/login"); });
    });

    return root;
  }

  function accountMenu() {
    var actions = document.querySelector(".site-header .header-actions");
    if (!actions || !window.fetch) return;

    fetch("/api/me", { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !data.user) return;
        actions.appendChild(buildAccount(data.user));
      })
      .catch(function () {});
  }

  function start() {
    reveal();
    headerLift();
    accountMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
