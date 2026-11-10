/* ==========================================================================
   Course pages: one HTML file per course, named <course page address>.html
   (for example ai-fluency-for-the-workplace.html). Each file names its course
   in <body data-course="..."> and carries its own title, description and
   social tags in <head>, so search engines see a unique page per course.
   Text: the page's own HTML (inside <div id="course-root">). Edit it directly; this script keeps it.
   assets/js/course-content.js fills a page only when its #course-root is empty (a new page shell).
   Live from the LMS: course title, price, whether enrollment is open, and the
   session list. Enroll Now opens the LMS sign up with this course chosen.
   ========================================================================== */
(function () {
  "use strict";
  var S = window.MCSite;
  var PAGES = window.MC_COURSE_PAGES || {};
  var SHARED = window.MC_COURSE_SHARED || {};
  var CFG = S.cfg;
  var esc = S.esc, icon = S.icon;
  var root = document.getElementById("course-root");
  /* The course comes from <body data-course>; ?c= is still read as a fallback. */
  var key = document.body.getAttribute("data-course") || new URLSearchParams(location.search).get("c") || "";

  function contentFor(k) {
    for (var id in PAGES) if (id === k || PAGES[id].slug === k) return { id: id, page: PAGES[id] };
    return null;
  }
  var found = contentFor(key);

  /* The page already has its content (every course page does): keep it as written and only add the
     live LMS data: title, price, session list and the Enroll Now links. */
  if (root && root.children.length) {
    if (!found) found = { id: key, page: { title: ((document.querySelector("[data-live-title]") || {}).textContent || "").trim() || document.title } };
    S.wireLinks(document);
    wireTabs();
    S.fetchCourse(found.id).then(function (live) { applyLive(live); }, function () { applyLive(undefined, true); });
    return;
  }

  /* No course page yet: the catalog's details window shows the course instead. */
  if (!found) {
    S.fetchCourse(key).then(function (live) {
      if (live && contentFor(live.id)) { found = contentFor(live.id); render(found, live); return; }
      if (live) { location.replace("courses.html#course-" + encodeURIComponent(live.id)); return; }
      notFound();
    }, notFound);
    return;
  }

  render(found, undefined);
  S.fetchCourse(found.id).then(function (live) { applyLive(live); }, function () { applyLive(undefined, true); });

  function notFound() {
    root.innerHTML = '<div class="container" style="padding:200px 24px 120px;position:relative;z-index:2;text-align:center">' +
      '<h1 style="font-size:40px">This course page is not available</h1>' +
      '<p class="section-lead" style="margin:0 auto 26px">It may have moved, or the course is not open yet.</p>' +
      '<a class="btn" href="courses.html">View All Courses ' + icon("arrow", "arrow") + '</a></div>';
    document.getElementById("course-footer").innerHTML = footerHTML();
  }

  /* ---------- Page ---------- */
  function render(f, live) {
    var id = f.id, P = f.page;
    var title = P.title;
    var catKey = P.program || { "AI Foundations": "foundations", "Build with AI": "build", "AI for Your Domain": "domain" }[P.category] || "foundations";
    document.title = title + " | USAII® AI Micro Credentials";

    var html = '' +
      '<div class="container course-layout">' +
        '<div class="course-main">' +
          '<ol class="crumb" aria-label="Breadcrumb"><li><a href="courses.html">Micro Credentials</a></li><li><a href="courses.html?program=' + catKey + '">' + esc(P.category) + '</a></li><li><span aria-current="page" data-live-title>' + esc(title) + '</span></li></ol>' +

          '<section class="course-hero" aria-labelledby="course-title">' +
            '<p class="hero-eyebrow">' + esc(P.hero.eyebrow) + '</p>' +
            '<h1 id="course-title" data-live-title>' + esc(title) + '</h1>' +
            '<p class="course-line2">' + esc(P.hero.line2) + '</p>' +
            '<p class="hero-sub">' + esc(P.hero.body) + '</p>' +
            '<div class="hero-ctas">' +
              '<a class="btn btn-lg btn-shine" href="' + esc(S.urls.signup(id)) + '" data-enroll>Enroll Now ' + icon("arrow", "arrow") + '</a>' +
              '<a class="btn btn-outline btn-lg" href="#curriculum">View Curriculum</a>' +
            '</div>' +
            '<ul class="course-stats">' + P.hero.stats.map(function (s) { return '<li><strong>' + esc(s.value) + '</strong><span>' + esc(s.label) + '</span></li>'; }).join("") + '</ul>' +
            '<ul class="badge-row">' + P.hero.badges.map(function (b, i) { return '<li>' + icon(["spark", "clock", "award"][i % 3]) + esc(b) + '</li>'; }).join("") + '</ul>' +
          '</section>' +

          '<nav class="course-tabs" aria-label="On this page">' + SHARED.tabs.map(function (t) { return '<a href="#' + t[0] + '">' + esc(t[1]) + '</a>'; }).join("") + '</nav>' +

          overviewHTML(P) + frameworkHTML(P) + curriculumHTML(P, id) + earnHTML(P) + faqHTML(P) +
        '</div>' +
        '<aside class="course-aside" id="enroll" aria-label="Enroll">' + enrollHTML(P, id, title) + '</aside>' +
      '</div>' +
      finalHTML(P, id) +
      '<div class="mobile-enroll" role="region" aria-label="Enroll"><div><strong data-live-price>…</strong><span>' + esc(SHARED.priceLine[0]) + '</span></div><a class="btn btn-sm" href="' + esc(S.urls.signup(id)) + '" data-enroll>Enroll Now ' + icon("arrow", "arrow") + '</a></div>';

    root.innerHTML = html;
    document.body.classList.add("has-mobile-enroll");
    document.getElementById("course-footer").innerHTML = footerHTML();
    S.wireLinks(document);
    wireTabs();
    if (live !== undefined) applyLive(live);
  }

  function overviewHTML(P) {
    var o = P.overview;
    return '<section class="c-section" id="overview" aria-labelledby="ov-title">' +
      '<span class="kicker">' + esc(o.eyebrow) + '</span>' +
      '<h2 id="ov-title">' + esc(o.headline) + '</h2>' +
      (o.grid ? '<ul class="ov-grid">' + o.grid.map(function (g) { return '<li><h3>' + esc(g[0]) + '</h3><p>' + esc(g[1]) + '</p></li>'; }).join("") + '</ul>' : '') +
      '<div class="ov-blocks">' + o.blocks.map(function (b) { return '<div class="ov-block"><h3>' + esc(b.label) + '</h3><p>' + esc(b.text) + '</p></div>'; }).join("") + '</div>' +
    '</section>';
  }

  function frameworkHTML(P) {
    var fw = P.framework;
    return '<section class="c-section" id="framework" aria-labelledby="fw-title">' +
      '<span class="kicker">' + esc(fw.eyebrow) + '</span>' +
      '<h2 id="fw-title">' + esc(fw.headline) + '</h2>' +
      '<p class="lead">' + esc(fw.subhead) + '</p>' +
      '<div class="fw-head" aria-hidden="true">' + fw.columns.map(function (c, i) { return '<span' + (i === 2 ? ' style="text-align:right"' : '') + '>' + esc(c) + '</span>'; }).join("") + '</div>' +
      '<ul class="fw-rows">' + fw.rows.map(function (r) {
        return '<li class="fw-row"><span class="fw-stage">' + esc(r[0]) + '</span><p>' + esc(r[1]) + '</p><span class="fw-days">' + (/ to /.test(r[2]) ? 'Days ' : 'Day ') + esc(r[2]) + '</span></li>';
      }).join("") + '</ul>' +
      (fw.callout ? '<div class="callout is-principle">' + icon("shield") + '<p>' + esc(fw.callout) + '</p></div>' : '') +
    '</section>';
  }

  function curriculumHTML(P, id) {
    var cu = P.curriculum;
    var who = (cu.workedExample.match(/Follow (\w)/) || [])[1] || "";
    return '<section class="c-section" id="curriculum" aria-labelledby="cu-title">' +
      (cu.eyebrow ? '<span class="kicker">' + esc(cu.eyebrow) + '</span>' : '') +
      '<h2 id="cu-title">' + esc(cu.headline) + '</h2>' +
      '<p class="format-intro">' + esc(cu.formatIntro) + '</p>' +
      '<ul class="format-steps">' + cu.format.map(function (f) {
        var m = f.match(/^(\d+) minute (.+)$/);
        return '<li><strong>' + esc(m ? m[1] : "") + ' min</strong><span>' + esc(m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : f) + '</span></li>';
      }).join("") + '</ul>' +
      '<div class="worked"><span class="who" aria-hidden="true">' + esc(who) + '</span><p>' + esc(cu.workedExample) + '</p></div>' +
      '<div class="sessions" id="live-sessions" hidden></div>' +
      '<a class="btn" href="' + esc(S.urls.signup(id)) + '" data-enroll>Enroll Now ' + icon("arrow", "arrow") + '</a>' +
    '</section>';
  }

  function earnHTML(P) {
    var e = P.earn;
    return '<section class="c-section" id="credential" aria-labelledby="earn-title">' +
      '<span class="kicker">' + esc(e.eyebrow) + '</span>' +
      '<h2 id="earn-title">' + esc(e.headline) + '</h2>' +
      '<p class="lead">' + esc(e.body) + '</p>' +
      '<h3 class="sub-h">What you submit</h3>' +
      '<ul class="submit-list">' + e.submit.map(function (r) { return '<li><strong>' + esc(r[0]) + '</strong><span>' + esc(r[1]) + '</span></li>'; }).join("") + '</ul>' +
      '<h3 class="sub-h">' + esc(e.stepsTitle || "How to earn") + '</h3>' +
      '<ol class="earn-steps">' + e.steps.map(function (s, i) { return '<li><span class="n">Step ' + (i + 1) + '</span>' + esc(s) + '</li>'; }).join("") + '</ol>' +
      '<ul class="chips" aria-label="Rubric dimensions" style="margin:0 0 22px">' + SHARED.dimensions.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join("") + '</ul>' +
      (e.gate ? '<div class="callout">' + icon("target") + '<p>' + esc(e.gate) + '</p></div>' : '') +
      '<div class="turnaround">' + icon("clock") + '<p>' + esc(SHARED.supporting) + '</p></div>' +
      '<p class="fine-print">' + esc(SHARED.finePrint) + '</p>' +
      '<ul class="features">' + SHARED.features.map(function (f, i) { return '<li>' + icon(["globe", "briefcase", "target", "clock", "shield", "infinity"][i]) + esc(f) + '</li>'; }).join("") + '</ul>' +
    '</section>';
  }

  function faqHTML(P) {
    return '<section class="c-section" id="faq" aria-labelledby="faq-title">' +
      '<h2 id="faq-title">' + esc(P.faqTitle) + '</h2>' +
      '<div class="c-faq">' + P.faq.map(function (q) {
        return '<details class="faq-item"><summary>' + esc(q[0]) + '<span class="pm" aria-hidden="true"></span></summary><div class="faq-answer"><p>' + esc(q[1]) + '</p></div></details>';
      }).join("") + '</div>' +
    '</section>';
  }

  function enrollHTML(P, id, title) {
    var link = P.enroll.link;
    var linkHTML = link && link.courseId
      ? '<a class="enroll-link" href="' + esc(pageUrl(link.courseId)) + '">' + esc(link.label) + '</a>'
      : '';
    return '<div class="enroll-card beam"><div class="beam-inner">' +
      '<h2 data-live-title>' + esc(title) + '</h2>' +
      '<div class="enroll-price"><strong data-live-price>…</strong></div>' +
      '<ul class="enroll-meta">' + SHARED.priceLine.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>' +
      '<ul class="enroll-includes">' + P.enroll.includes.map(function (t) { return '<li>' + icon("ok") + esc(t) + '</li>'; }).join("") + '</ul>' +
      '<a class="btn btn-block btn-lg" href="' + esc(S.urls.signup(id)) + '" data-enroll>Enroll Now ' + icon("arrow", "arrow") + '</a>' +
      '<p class="enroll-status" data-enroll-status>New learners create an account first, then enroll in the USAII® LMS.</p>' +
      linkHTML +
    '</div></div>';
  }

  function finalHTML(P, id) {
    var f = P.final, st = f.strip;
    var strip = st.text
      ? '<span>' + esc(st.label) + ':</span><strong>' + esc(st.text) + '</strong><a class="link-arrow" href="' + esc(pageUrl(st.courseId)) + '">' + esc(st.link) + ' ' + icon("arrow", "arrow") + '</a>'
      : '<a class="link-arrow" href="' + esc(st.href) + '">' + esc(st.link) + ' ' + icon("arrow", "arrow") + '</a>';
    return '<section class="course-final" aria-labelledby="final-title">' +
      '<div class="aurora" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
      '<div class="container">' +
        '<span class="kicker">' + esc(f.kicker) + '</span>' +
        '<h2 id="final-title">' + esc(f.headline) + '</h2>' +
        (f.body ? '<p class="final-body">' + esc(f.body) + '</p>' : '') +
        '<div class="btns">' +
          '<a class="btn btn-lg" href="' + esc(S.urls.signup(id)) + '" data-enroll>Enroll Now ' + icon("arrow", "arrow") + '</a>' +
        '</div>' +
        '<div class="next-strip">' + strip + '</div>' +
      '</div>' +
    '</section>';
  }

  function footerHTML() {
    var ft = SHARED.footer;
    return '<div class="container">' +
      '<div class="footer-grid" style="grid-template-columns:4fr 4fr 4fr">' +
        '<div class="footer-brand" style="grid-column:auto">' +
          '<a class="brand" href="index.html"><img class="brand-logo" src="assets/img/usaii-ai-micro-credentials-logo-white.png" alt="USAII® AI Micro Credentials" width="328" height="47"></a>' +
          '<p>AI For Everyone | Self Paced Online Learning | Global Credentialing Asset</p>' +
        '</div>' +
        '<div><h6>Contact</h6><ul class="footer-contact"><li>Address: ' + esc(ft.address) + '</li><li>Email: <a href="mailto:' + esc(ft.email) + '">' + esc(ft.email) + '</a></li></ul></div>' +
        '<div><h6>Links</h6><ul class="footer-links">' + ft.links.map(function (l) {
          var href = CFG[l[1]] || l[1];
          var ext = /^https?:/.test(href);
          return '<li><a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + icon("arrow", "arrow") + esc(l[0]) + '</a></li>';
        }).join("") + '</ul></div>' +
      '</div>' +
      '<div class="footer-bottom"><span>© 2026 USAII®. All rights reserved.</span><nav aria-label="Legal"><a href="https://www.usaii.org/privacy-policy" data-href="privacyUrl" target="_blank" rel="noopener">Privacy Policy</a><a href="https://www.usaii.org/terms-of-use" data-href="termsUrl" target="_blank" rel="noopener">Terms of Use</a></nav></div>' +
    '</div>';
  }

  function pageUrl(courseId) {
    var p = PAGES[courseId];
    return p ? p.slug + ".html" : "courses.html#course-" + encodeURIComponent(courseId);
  }

  /* ---------- Live data from the LMS ---------- */
  function applyLive(live, failed) {
    var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    if (live) {
      // Title and price as the admin set them in the LMS.
      all("[data-live-title]").forEach(function (el) { el.textContent = live.title; });
      document.title = live.title + " | USAII® AI Micro Credentials";
      all("[data-live-price]").forEach(function (el) { el.innerHTML = S.priceInner(live); el.classList.remove("is-muted"); });
      all("[data-enroll]").forEach(function (a) { a.setAttribute("href", S.urls.signup(live.id)); });
      renderSessions(live);
      return;
    }
    if (failed) {
      // The LMS could not be reached: enrolling still works, the price shows there.
      all("[data-live-price]").forEach(function (el) { el.innerHTML = S.priceInner(null); el.classList.toggle("is-muted", !S.currentPrice(null)); });
      return;
    }
    // Not published in the LMS yet: no enrollment; offer Get More Details instead.
    all("[data-live-price]").forEach(function (el) { el.textContent = "Enrollment opens soon"; el.classList.add("is-muted"); });
    all("[data-enroll]").forEach(function (a) {
      a.setAttribute("href", "#");
      a.setAttribute("data-lead-open", "");
      a.setAttribute("data-lead-course", found.id);
      a.setAttribute("data-lead-source", "Course page: " + found.page.title + " (not open yet)");
      a.innerHTML = "Get More Details " + icon("arrow", "arrow");
    });
    var st = document.querySelector("[data-enroll-status]");
    if (st) st.textContent = "Enrollment for this course opens soon. Leave your details and we will tell you first.";
  }

  function renderSessions(live) {
    var box = document.getElementById("live-sessions");
    if (!box || !live.modules || !live.modules.length) return;
    var count = live.modules.reduce(function (n, m) { return n + m.lessons.length; }, 0);
    box.innerHTML = '<div class="sessions-head"><span>The ' + count + ' sessions</span><span class="live">Updated from the course</span></div>' +
      live.modules.map(function (m) {
        return '<div class="sessions-mod">' + esc(m.title) + '</div><ol>' + m.lessons.map(function (l) {
          return '<li><span>' + esc(l.title) + '</span><span>' + (l.minutes ? esc(l.minutes) + ' min' : '') + '</span></li>';
        }).join("") + '</ol>';
      }).join("");
    box.hidden = false;
  }

  /* ---------- In page tabs ---------- */
  function wireTabs() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".course-tabs a"));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
    function update() {
      var y = window.scrollY + 180, cur = 0;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top + window.scrollY <= y) cur = i; });
      links.forEach(function (a, i) { a.setAttribute("aria-current", String(i === cur)); });
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }
})();
