/* Hermes Agent — Engineering Wiki: client-side enhancements.
   Pure vanilla JS, no dependencies, works from file:// fully offline.
   Progressive enhancement: every feature degrades gracefully if its
   prerequisite (e.g. window.__WIKI_INDEX__) is absent. */
(function () {
  "use strict";

  // Canonical page order — drives prev/next pagination and search grouping.
  var PAGES = [
    { file: "index.html",            title: "Overview" },
    { file: "architecture.html",     title: "Architecture" },
    { file: "self-improvement.html", title: "Self-Improvement" },
    { file: "internals.html",        title: "Internals" },
    { file: "providers-auth.html",   title: "Providers & Auth" },
    { file: "faq.html",              title: "FAQ" }
  ];

  function currentFile() {
    var p = location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  /* ---------------- Heading anchor links ----------------
     Section ids already exist (sidebar TOC links to them). Give each
     heading a hover "#" that deep-links to its section. */
  function initHeadingAnchors() {
    var sections = document.querySelectorAll("main section[id]");
    sections.forEach(function (sec) {
      var h = sec.querySelector("h2, h3");
      if (!h || h.querySelector(".anchor")) return;
      var a = document.createElement("a");
      a.className = "anchor";
      a.href = "#" + sec.id;
      a.setAttribute("aria-label", "Link to this section");
      a.textContent = "#";
      h.appendChild(a);
    });
  }

  /* ---------------- Copy-to-clipboard on code blocks ----------------
     Skip mermaid <pre> (it gets replaced by an <svg>). */
  function initCopyButtons() {
    var blocks = document.querySelectorAll("pre");
    blocks.forEach(function (pre) {
      if (pre.classList.contains("mermaid")) return;
      if (pre.parentElement && pre.parentElement.classList.contains("codewrap")) return;
      var wrap = document.createElement("div");
      wrap.className = "codewrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.textContent = "Copy";
      btn.addEventListener("click", function () {
        var text = pre.innerText;
        var done = function () {
          btn.textContent = "Copied";
          btn.classList.add("ok");
          setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else { fallback(); }
        function fallback() {
          var ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (e) {}
          document.body.removeChild(ta);
        }
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------------- Prev / next pagination ---------------- */
  function initPrevNext() {
    var main = document.querySelector("main");
    if (!main) return;
    var i = PAGES.findIndex(function (p) { return p.file === currentFile(); });
    if (i < 0) return;
    var prev = PAGES[i - 1], next = PAGES[i + 1];
    if (!prev && !next) return;
    var nav = document.createElement("nav");
    nav.className = "pager";
    nav.innerHTML =
      (prev ? '<a class="pager-prev" href="' + prev.file + '"><span class="pager-dir">← Previous</span>' +
              '<span class="pager-title">' + esc(prev.title) + "</span></a>" : "<span></span>") +
      (next ? '<a class="pager-next" href="' + next.file + '"><span class="pager-dir">Next →</span>' +
              '<span class="pager-title">' + esc(next.title) + "</span></a>" : "<span></span>");
    main.appendChild(nav);
  }

  /* ---------------- Mobile "On this page" TOC ----------------
     The sidebar is display:none under 860px; surface its links via a
     toggle button injected under the page title. */
  function initMobileTOC() {
    var sidebar = document.querySelector(".sidebar ul");
    var title = document.querySelector("main .page-title");
    if (!sidebar || !title) return;
    var btn = document.createElement("button");
    btn.className = "mobile-toc-toggle";
    btn.type = "button";
    btn.textContent = "On this page ▾";
    var panel = document.createElement("div");
    panel.className = "mobile-toc";
    panel.innerHTML = "<ul>" + sidebar.innerHTML + "</ul>";
    btn.addEventListener("click", function () {
      var open = panel.classList.toggle("open");
      btn.textContent = "On this page " + (open ? "▴" : "▾");
    });
    panel.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { panel.classList.remove("open"); btn.textContent = "On this page ▾"; }
    });
    // On the landing page the title is wrapped in .hero — anchor the toggle after it.
    var anchor = title.closest(".hero") || title;
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  /* ---------------- Offline client-side search ----------------
     Index is provided by search-index.js as window.__WIKI_INDEX__:
       [{ u:url, p:pageTitle, t:sectionTitle, a:anchorId, x:plaintext }]
     If the index is missing the box still renders but reports it. */
  function initSearch() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    var box = document.createElement("div");
    box.className = "search";
    box.innerHTML =
      '<input type="search" class="search-input" placeholder="Search the wiki…  ( / )" ' +
      'aria-label="Search the wiki" autocomplete="off" spellcheck="false">' +
      '<div class="search-results" role="listbox" hidden></div>';
    topbar.appendChild(box);

    var input = box.querySelector(".search-input");
    var panel = box.querySelector(".search-results");
    var index = Array.isArray(window.__WIKI_INDEX__) ? window.__WIKI_INDEX__ : null;
    var active = -1, current = [];

    function tokens(q) {
      return q.toLowerCase().split(/\s+/).filter(Boolean);
    }
    function score(entry, toks) {
      var hay = (entry.t + " " + entry.x).toLowerCase();
      var title = entry.t.toLowerCase();
      var s = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (hay.indexOf(t) < 0) return -1;  // every token must appear
        // term frequency: a section that discusses the term repeatedly outranks
        // a summary that merely name-drops it once (capped so one word can't dominate).
        var count = 0, from = 0, at;
        while ((at = hay.indexOf(t, from)) >= 0) { count++; from = at + t.length; }
        s += Math.min(count, 6);
        if (title.indexOf(t) >= 0) s += 8;  // section-title hits rank highest
      }
      return s;
    }
    function snippet(text, toks) {
      var low = text.toLowerCase(), at = -1;
      for (var i = 0; i < toks.length; i++) { var j = low.indexOf(toks[i]); if (j >= 0) { at = j; break; } }
      if (at < 0) at = 0;
      var start = Math.max(0, at - 40);
      var frag = (start > 0 ? "…" : "") + text.slice(start, start + 160) + "…";
      frag = esc(frag);
      toks.forEach(function (t) {
        var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
        frag = frag.replace(re, "<mark>$1</mark>");
      });
      return frag;
    }
    function render(results, q) {
      current = results; active = -1;
      if (!q) { panel.hidden = true; panel.innerHTML = ""; return; }
      if (!index) {
        panel.hidden = false;
        panel.innerHTML = '<div class="search-empty">Search index not built. Run the wiki build to generate search-index.js.</div>';
        return;
      }
      if (!results.length) {
        panel.hidden = false;
        panel.innerHTML = '<div class="search-empty">No matches for “' + esc(q) + '”</div>';
        return;
      }
      var toks = tokens(q);
      panel.hidden = false;
      panel.innerHTML = results.map(function (r, i) {
        var href = r.u + (r.a ? "#" + r.a : "");
        return '<a class="search-hit" role="option" data-i="' + i + '" href="' + href + '">' +
          '<span class="search-hit-page">' + esc(r.p) + "</span>" +
          '<span class="search-hit-title">' + esc(r.t) + "</span>" +
          '<span class="search-hit-snip">' + snippet(r.x, toks) + "</span></a>";
      }).join("");
    }
    function run(q) {
      if (!index || !q.trim()) { render([], q); return; }
      var toks = tokens(q);
      var ranked = [];
      for (var i = 0; i < index.length; i++) {
        var s = score(index[i], toks);
        if (s >= 0) ranked.push({ e: index[i], s: s });
      }
      ranked.sort(function (a, b) { return b.s - a.s; });
      render(ranked.slice(0, 12).map(function (r) { return r.e; }), q);
    }
    function setActive(n) {
      var hits = panel.querySelectorAll(".search-hit");
      if (!hits.length) return;
      active = (n + hits.length) % hits.length;
      hits.forEach(function (h, i) { h.classList.toggle("active", i === active); });
      hits[active].scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("input", function () { run(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Enter") {
        var hits = panel.querySelectorAll(".search-hit");
        var pick = hits[active >= 0 ? active : 0];
        if (pick) { e.preventDefault(); location.href = pick.getAttribute("href"); }
      } else if (e.key === "Escape") { input.value = ""; render([], ""); input.blur(); }
    });
    document.addEventListener("click", function (e) {
      if (!box.contains(e.target)) { panel.hidden = true; }
    });
    input.addEventListener("focus", function () { if (input.value) run(input.value); });

    // "/" anywhere focuses search (unless already typing in a field).
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); input.focus();
      }
    });
  }

  ready(function () {
    try { initHeadingAnchors(); } catch (e) {}
    try { initCopyButtons(); } catch (e) {}
    try { initPrevNext(); } catch (e) {}
    try { initMobileTOC(); } catch (e) {}
    try { initSearch(); } catch (e) {}
  });
})();
