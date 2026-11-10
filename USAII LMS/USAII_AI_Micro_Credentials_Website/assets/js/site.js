/* ==========================================================================
   USAII® AI Micro Credentials website: behaviour (no dependencies)
   --------------------------------------------------------------------------
   Live from the LMS (see assets/js/config.js):
   - Catalog: GET  <lmsUrl>/api/public/catalog   (published courses, prices)
   - Enquiry: POST <lmsUrl>/api/public/enquiries (Get More Details)
   - Sign In: <lmsUrl>/#/login     Enroll / Sign up: <lmsUrl>/#/login?course=<id> (the LMS front page: Learner and Admin sign in)
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.MC_CONFIG || {};
  var CATS = window.MC_CATEGORIES || {};
  var STATIC = window.MC_COURSES || [];
  var PAGES = window.MC_COURSE_PAGES || {};
  var COUNTRIES = window.MC_COUNTRIES || [];
  var SPECS = CFG.courseSpecs || { hours: 10, sessions: 10, videos: 5 };
  var LMS = String(CFG.lmsUrl || "").replace(/\/+$/, "");
  var API = LMS + "/api/public";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(name, cls) {
    return '<svg class="' + (cls || "") + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  /* ---------- Where things go in the LMS ---------- */
  var urls = {
    login: function () { return LMS + "/#/login"; },
    signup: function (courseId) { return LMS + "/#/login" + (courseId ? "?course=" + encodeURIComponent(courseId) : ""); },
    /* A course's own page, when it has one (assets/js/course-content.js): <course page address>.html */
    page: function (c) {
      var p = c && PAGES[c.id];
      return p ? p.slug + ".html" : null;
    }
  };

  /* Price in the LMS payment currency. USD reads "US$49" as in the course documents. */
  function fmtPrice(amount, currency) {
    if (amount === 0) return "Free";
    if (amount == null || isNaN(amount)) return CFG.priceUnavailable || "Price at enrollment";
    var cur = currency || "USD";
    var out;
    try {
      out = new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: amount % 1 ? 2 : 0, minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
    } catch (e) {
      out = cur + " " + amount;
    }
    return out;
  }

  /* The price shown for a course: the selling price struck out, then the current price.
     Both come from the LMS admin portal (Course details: Selling price and Current price). When the LMS
     cannot be reached, config.js pricing is used instead. The selling price shows only when it is higher. */
  var PRICING = CFG.pricing || {};
  function currentPrice(c) {
    if (c && c.live && c.price != null && !isNaN(c.price)) return { amount: Number(c.price), currency: c.currency || "USD" };
    if (PRICING.price != null && PRICING.price !== "" && !isNaN(PRICING.price)) return { amount: Number(PRICING.price), currency: PRICING.currency || "USD" };
    return null;
  }
  function sellingPrice(c) {
    /* A live course carries the LMS selling price (null when the admin left it empty). An older LMS
       without the setting sends nothing: then the config.js price is used. */
    var v = c && c.live && c.listPrice !== undefined ? c.listPrice : PRICING.listPrice;
    return v == null || v === "" || isNaN(v) ? null : Number(v);
  }
  /* Inner HTML for any price spot. Without a price: the priceUnavailable text. */
  function priceInner(c) {
    var now = currentPrice(c);
    if (!now) return esc(CFG.priceUnavailable || "Price at enrollment");
    var list = sellingPrice(c);
    var was = list != null && list > now.amount
      ? '<s class="price-was"><span class="visually-hidden">Original price </span>' + esc(fmtPrice(list, now.currency)) + '</s><span class="visually-hidden">Current price </span>'
      : '';
    return was + '<span class="price-now">' + esc(fmtPrice(now.amount, now.currency)) + '</span>';
  }

  /* ---------- Talking to the LMS ---------- */
  function fetchJSON(url, opts, timeoutMs) {
    opts = opts || {};
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 9000) : null;
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error || "The request failed (" + res.status + ").");
          err.status = res.status;
          throw err;
        }
        return body;
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      var err = new Error("network");
      err.network = true;
      err.cause = e;
      throw err;
    });
  }
  /* The LMS answers 503 for a few seconds while it starts: wait and try again. */
  function fetchWithRetry(url, opts, tries) {
    return fetchJSON(url, opts).catch(function (e) {
      if (e.status === 503 && (tries || 0) < 4) {
        return new Promise(function (r) { setTimeout(r, 2500); }).then(function () { return fetchWithRetry(url, opts, (tries || 0) + 1); });
      }
      throw e;
    });
  }

  function staticById(id) { return STATIC.filter(function (c) { return c.id === id; })[0]; }

  /* Live text in the site's house style (config: noHyphens). */
  function tidy(text) {
    if (text == null) return text;
    var t = String(text);
    if (CFG.noHyphens === false) return t;
    return t.replace(/\s+[\u2013\u2014-]{1,2}\s+/g, ": ").replace(/([A-Za-z0-9\u00C0-\u024F])[\u2010\u2011\u2013-]+(?=[A-Za-z0-9\u00C0-\u024F])/g, "$1 ");
  }

  /* A published course from the LMS, with the extra detail text kept on this site. */
  function merge(live, currency) {
    var s = staticById(live.id) || {};
    return {
      id: live.id,
      slug: live.slug || s.slug || live.id,
      num: live.number || s.num || null,
      cat: CATS[live.category] ? live.category : (s.cat || "foundations"),
      title: tidy(live.title),
      tagline: tidy(live.tagline || s.tagline || live.subtitle || ""),
      summary: tidy(live.summary || s.summary || ""),
      build: tidy(live.youBuild || s.build || ""),
      needs: tidy(live.needs || null),
      framework: tidy(live.takeaway || s.framework || ""),
      doing: s.doing || "",
      suited: tidy(live.suited || s.suited || ""),
      listPrice: live.listPrice,
      description: live.description || "",
      price: live.price,
      free: !!live.free,
      access: live.access,
      currency: currency || "USD",
      sessions: live.sessions || SPECS.sessions,
      live: true
    };
  }
  function fromStatic(s) {
    var o = {};
    for (var k in s) o[k] = s[k];
    o.price = null; o.live = false; o.currency = "USD"; o.sessions = SPECS.sessions;
    return o;
  }

  var catalogPromise = null;
  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetchWithRetry(API + "/catalog", { headers: { Accept: "application/json" }, cache: "no-store" }).then(function (data) {
      return { live: true, currency: data.currency || "USD", courses: (data.courses || []).map(function (c) { return merge(c, data.currency); }) };
    }).catch(function (e) {
      if (window.console) console.warn("[USAII] Could not load live courses from " + API + "/catalog. Check lmsUrl in assets/js/config.js.", e);
      return { live: false, currency: "USD", courses: STATIC.map(fromStatic) };
    });
    return catalogPromise;
  }
  /* One course with its sessions; null when it is not published. */
  function fetchCourse(key) {
    return fetchWithRetry(API + "/catalog/" + encodeURIComponent(key), { cache: "no-store" }).then(function (d) {
      var c = merge(d.course, d.currency);
      c.modules = (d.course.modules || []).map(function (m) {
        return { title: tidy(m.title), lessons: (m.lessons || []).map(function (l) { return { title: tidy(l.title), minutes: l.minutes }; }) };
      });
      c.questions = d.course.questions;
      return c;
    }, function (e) {
      if (e.status === 404) return null;
      throw e;
    });
  }

  var CATALOG = { live: false, courses: [] };
  function findCourse(id) { return CATALOG.courses.filter(function (c) { return c.id === id; })[0] || (CATALOG.live ? null : fromStaticMaybe(id)); }
  function fromStaticMaybe(id) { var s = staticById(id); return s ? fromStatic(s) : null; }

  /* ---------- Config driven links ---------- */
  function wireLinks(root) {
    $$("[data-href]", root).forEach(function (a) {
      var key = a.getAttribute("data-href");
      if (CFG[key]) a.setAttribute("href", CFG[key]);
    });
    $$("[data-lms]", root).forEach(function (a) {
      var kind = a.getAttribute("data-lms");
      a.setAttribute("href", kind === "signup" ? urls.signup(a.getAttribute("data-course")) : urls.login());
    });
  }

  /* ==========================================================================
     Catalog cards
     ========================================================================== */
  function cardHTML(c) {
    var page = urls.page(c);
    var details = page ? 'href="' + esc(page) + '"' : 'href="#course-' + esc(c.id) + '" data-details="' + esc(c.id) + '"';
    var hasPrice = !!currentPrice(c);
    var facts = [["Practical takeaway", c.framework], ["Best suited for", c.suited], ["Tools", c.needs]].filter(function (f) { return f[1]; });
    return '' +
      '<article class="course-card" id="course-' + esc(c.id) + '" data-cat="' + esc(c.cat) + '">' +
        '<div class="card-meta"><span class="card-cat" data-cat="' + esc(c.cat) + '">' + esc(CATS[c.cat]) + '</span>' + (c.num ? '<span class="card-num">Course ' + esc(c.num) + '</span>' : '') + '</div>' +
        '<h3><a ' + details + '>' + esc(c.title) + '</a></h3>' +
        '<p class="card-tagline">' + esc(c.tagline) + '</p>' +
        (c.summary ? '<p class="card-summary">' + esc(c.summary) + '</p>' : '') +
        (facts.length ? '<dl class="card-facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join("") + '</dl>' : '') +
        '<ul class="card-specs" aria-label="Course specs">' +
          '<li>' + icon("clock") + 'About ' + SPECS.hours + ' hours</li>' +
          '<li>' + icon("sessions") + c.sessions + ' sessions</li>' +
          '<li>' + icon("video") + SPECS.videos + ' videos</li>' +
        '</ul>' +
        '<div class="card-bottom">' +
          '<div class="price-row"><div><span class="price-label">Individual Access</span><span class="price-value' + (hasPrice ? '' : ' is-muted') + '">' + priceInner(c) + '</span></div>' + (hasPrice ? '<span class="price-tag">One time</span>' : '') + '</div>' +
          '<div class="card-ctas">' +
            '<a class="btn btn-outline btn-sm" ' + details + ' aria-label="Explore ' + esc(c.title) + '">Explore Course</a>' +
            '<a class="btn btn-sm" href="' + esc(urls.signup(c.id)) + '" aria-label="Enroll now in ' + esc(c.title) + '">Enroll Now</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function skeletons(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += '<div class="course-card is-skeleton" aria-hidden="true"><div class="sk" style="width:55%;height:22px"></div><div class="sk" style="width:90%;height:44px"></div><div class="sk" style="width:100%;height:40px"></div><div class="sk" style="width:100%;height:64px"></div><div class="sk" style="width:70%;height:16px"></div><div class="sk" style="width:100%;height:42px;margin-top:auto"></div></div>';
    }
    return out;
  }

  var grid = $("#course-grid");
  var tabs = $$(".filter-tab");
  var countEl = $("#catalog-count");
  var currentFilter = "all";

  function applyFilter(f) {
    if (!CATS[f] && f !== "all") f = "all";
    currentFilter = f;
    var shown = 0;
    tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t.getAttribute("data-filter") === f)); });
    $$(".course-card", grid).forEach(function (card) {
      var match = f === "all" || card.getAttribute("data-cat") === f;
      card.hidden = !match;
      if (match) shown++;
    });
    if (countEl && CATALOG.courses.length) countEl.textContent = "Showing " + shown + " of " + CATALOG.courses.length + " courses";
  }

  function renderCatalog() {
    if (!grid) return;
    var list = CATALOG.courses;
    tabs.forEach(function (t) {
      var f = t.getAttribute("data-filter");
      var n = f === "all" ? list.length : list.filter(function (c) { return c.cat === f; }).length;
      var badge = t.querySelector(".count");
      if (badge) badge.textContent = n;
    });
    var note = $("#catalog-note");
    if (note) {
      note.hidden = CATALOG.live || !!currentPrice(null);
      if (!CATALOG.live) $("span", note).textContent = "Showing the full catalog. Your price is shown when you enroll in the USAII® LMS.";
    }
    if (!list.length) {
      grid.innerHTML = '<div class="catalog-empty"><h3>New courses open soon</h3><p>Leave your details and the USAII® team will tell you as soon as enrollment opens.</p><button type="button" class="btn" data-lead-open data-lead-source="Catalog: no courses open">Get More Details ' + icon("arrow", "arrow") + '</button></div>';
      if (countEl) countEl.textContent = "No courses open right now";
      return;
    }
    grid.innerHTML = list.map(cardHTML).join("");
    applyFilter(currentFilter);
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () { applyFilter(t.getAttribute("data-filter")); });
  });
  var programParam = new URLSearchParams(location.search).get("program");
  if (programParam) currentFilter = programParam;

  /* ==========================================================================
     Windows (course details and Get More Details)
     ========================================================================== */
  var openModalEl = null;
  var lastFocus = null;
  function showModal(modal, focusEl) {
    if (openModalEl && openModalEl !== modal) hideModal(true);
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    openModalEl = modal;
    setTimeout(function () { (focusEl || $(".modal-close", modal)).focus(); }, 30);
  }
  function hideModal(silent) {
    if (!openModalEl) return;
    openModalEl.classList.remove("is-open");
    openModalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    openModalEl = null;
    if (!silent && lastFocus) lastFocus.focus();
    if (/^#course-/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
  }

  function openDetails(id) {
    var modal = $("#course-modal");
    var c = findCourse(id);
    if (!c) return;
    var page = urls.page(c);
    if (page) { location.href = page; return; }
    if (!modal) return;
    $("#m-cat", modal).textContent = CATS[c.cat];
    $("#m-title", modal).textContent = c.title;
    $("#m-tagline", modal).textContent = c.tagline;
    $("#m-build", modal).textContent = c.build;
    $("#m-framework", modal).textContent = c.framework;
    $("#m-doing", modal).textContent = c.doing;
    $("#m-suited", modal).textContent = c.suited;
    $("#m-framework", modal).parentNode.hidden = !c.framework;
    $("#m-doing", modal).parentNode.hidden = !c.doing;
    $("#m-suited", modal).parentNode.hidden = !c.suited;
    $("#m-needs-row", modal).hidden = !c.needs;
    $("#m-needs", modal).textContent = c.needs || "";
    $("#m-price", modal).innerHTML = priceInner(c);
    $("#m-apply", modal).setAttribute("href", urls.signup(c.id));
    showModal(modal);
  }

  document.addEventListener("click", function (e) {
    var d = e.target.closest("[data-details]");
    if (d) { e.preventDefault(); openDetails(d.getAttribute("data-details")); return; }
    var lead = e.target.closest("[data-lead-open]");
    if (lead && !lead.closest("[data-lead-slot]")) {
      e.preventDefault();
      openLead({ source: lead.getAttribute("data-lead-source") || "Website", courseId: lead.getAttribute("data-lead-course") || "", title: lead.getAttribute("data-lead-title") || "" });
      return;
    }
    if (e.target.closest("[data-close-modal]") || (openModalEl && e.target === openModalEl)) hideModal();
  });
  document.addEventListener("keydown", function (e) {
    if (!openModalEl) return;
    if (e.key === "Escape") { hideModal(); return; }
    if (e.key === "Tab") {
      var f = $$('a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), select', openModalEl).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  function openFromHash() {
    var m = location.hash.match(/^#course-(.+)$/);
    if (m) setTimeout(function () { openDetails(decodeURIComponent(m[1])); }, 150);
  }

  /* ==========================================================================
     Get More Details form (hero card, and a window elsewhere)
     ========================================================================== */
  var leadCount = 0;
  /* The brochure for each course: assets/brochures/<course page address>.pdf (config: brochures overrides). */
  function brochureUrl(c) {
    var map = CFG.brochures || {};
    var page = PAGES[c.id];
    return map[c.id] || ("assets/brochures/" + ((page && page.slug) || c.slug || c.id) + ".pdf");
  }
  /* Is the brochure file there yet? Checked on a web server only (opened from a computer, it just tries). */
  function brochureExists(href) {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve(true);
    return fetch(href, { method: "HEAD", cache: "no-store" }).then(function (r) { return r.ok; }, function () { return true; });
  }
  function brochureCourses() {
    return (CATALOG.courses.length ? CATALOG.courses : STATIC.map(fromStatic));
  }

  function leadFormHTML(o) {
    var n = ++leadCount;
    var brochure = o.mode === "brochure";
    var id = function (f) { return "lead" + n + "-" + f; };
    var field = function (key, label, type, auto, extra) {
      return '<div class="field' + (extra && extra.full ? " field-full" : "") + '"><label for="' + id(key) + '">' + label + ' <span class="req" aria-hidden="true">*</span></label>' +
        '<input id="' + id(key) + '" name="' + key + '" type="' + type + '" autocomplete="' + auto + '" required' + (extra && extra.mode ? ' inputmode="' + extra.mode + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + ' maxlength="' + (extra && extra.max || 120) + '"></div>';
    };
    var countries = '<option value="">Select your country</option>' + COUNTRIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("");
    /* Brochure: "Select the Micro Credential", type to search the courses */
    var courseField = !brochure ? '' :
      '<div class="field field-full"><label for="' + id("course") + '">Select the Micro Credential <span class="req" aria-hidden="true">*</span></label>' +
      '<input id="' + id("course") + '" name="course" type="text" list="' + id("courses") + '" autocomplete="off" placeholder="Type to search, for example AI for HR" required>' +
      '<datalist id="' + id("courses") + '">' + brochureCourses().map(function (c) { return '<option value="' + esc(c.title) + '"></option>'; }).join("") + '</datalist></div>';
    return '' +
      '<form class="lead-form" novalidate data-mode="' + (brochure ? "brochure" : "lead") + '" data-collapsed="' + (o.collapsed ? "true" : "false") + '" data-source="' + esc(o.source || "Website") + '" data-course="' + esc(o.courseId || "") + '">' +
        '<div class="lead-top"><span class="lead-ico">' + icon(brochure ? "download" : "spark") + '</span><div><h2' + (o.titleId ? ' id="' + o.titleId + '"' : '') + '>' + esc(o.title || (brochure ? "Download Brochure" : "Get more details")) + '</h2><p>' + esc(o.intro || (brochure ? "Choose a micro credential and get its brochure with the course details." : "Course details, pricing and team options, sent to you by the USAII® team.")) + '</p></div></div>' +
        '<ul class="lead-points">' +
          (brochure
            ? '<li>' + icon("ok") + 'Course overview and outcomes</li><li>' + icon("ok") + 'Framework and session plan</li><li>' + icon("ok") + 'How to earn the certificate</li>'
            : '<li>' + icon("ok") + 'Course curriculum and outcomes</li><li>' + icon("ok") + 'Pricing and enrollment</li><li>' + icon("ok") + 'Options for teams and organizations</li>') +
        '</ul>' +
        '<div class="lead-fields">' + courseField +
          field("name", "Name", "text", "name", { max: 120 }) +
          field("email", "Email Address", "email", "email", { mode: "email", max: 200 }) +
          field("mobile", "Mobile Number", "tel", "tel", { mode: "tel", ph: "With country code", max: 40 }) +
          field("organization", "Organization Name", "text", "organization", { max: 160 }) +
          field("designation", "Designation", "text", "organization-title", { max: 120 }) +
          '<div class="field"><label for="' + id("country") + '">Country <span class="req" aria-hidden="true">*</span></label><select id="' + id("country") + '" name="country" autocomplete="country-name" required>' + countries + '</select></div>' +
          '<div class="hp" aria-hidden="true"><label for="' + id("website") + '">Website</label><input id="' + id("website") + '" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
        '</div>' +
        '<p class="lead-alert" role="alert" hidden></p>' +
        '<button type="submit" class="btn btn-block btn-lg">' + (brochure ? 'Download Brochure ' + icon("download", "dl-ico") : 'Get More Details ' + icon("arrow", "arrow")) + '</button>' +
        (o.collapsed ? '<p class="lead-foot" hidden><button type="button" data-lead-cancel>Close the form</button></p>' : '') +
      '</form>';
  }

  var RULES = {
    name: function (v) { return v.length >= 2 ? "" : "Enter your name."; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Enter a valid email address."; },
    mobile: function (v) { var d = v.replace(/\D/g, ""); return d.length >= 7 && d.length <= 15 && !/[^\d\s()+.]/.test(v) ? "" : "Enter a valid mobile number."; },
    organization: function (v) { return v ? "" : "Enter your organization name."; },
    designation: function (v) { return v ? "" : "Enter your designation."; },
    country: function (v) { return v ? "" : "Choose your country."; }
  };
  function setError(form, name, msg) {
    var input = form.elements[name];
    var wrap = input.closest(".field");
    var err = $(".err", wrap);
    wrap.classList.toggle("has-error", !!msg);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg && !err) {
      err = document.createElement("span");
      err.className = "err";
      err.id = input.id + "-err";
      wrap.appendChild(err);
      input.setAttribute("aria-describedby", err.id);
    }
    if (err) err.textContent = msg || "";
  }

  function wireLeadForm(form) {
    if (form.elements.course) form.elements.course.addEventListener("input", function () {
      var el = form.elements.course, v = el.value.trim().toLowerCase();
      if (el.getAttribute("aria-invalid") === "true" && brochureCourses().some(function (c) { return c.title.toLowerCase() === v; })) setError(form, "course", "");
    });
    var btn = $('button[type="submit"]', form);
    var alertEl = $(".lead-alert", form);
    var foot = $(".lead-foot", form);
    Object.keys(RULES).forEach(function (k) {
      var el = form.elements[k];
      el.addEventListener(k === "country" ? "change" : "blur", function () { if (el.value || el.getAttribute("aria-invalid") === "true") setError(form, k, RULES[k](el.value.trim())); });
      /* An error clears as soon as the value is fixed. */
      el.addEventListener("input", function () { if (el.getAttribute("aria-invalid") === "true" && !RULES[k](el.value.trim())) setError(form, k, ""); });
    });
    var cancel = $("[data-lead-cancel]", form);
    if (cancel) cancel.addEventListener("click", function () {
      form.setAttribute("data-collapsed", "true");
      if (foot) foot.hidden = true;
      alertEl.hidden = true;
      btn.focus();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      /* First press of "Get More Details" opens the form; the next one sends it. */
      if (form.getAttribute("data-collapsed") === "true") {
        form.setAttribute("data-collapsed", "false");
        if (foot) foot.hidden = false;
        setTimeout(function () { form.elements.name.focus(); }, 60);
        return;
      }
      alertEl.hidden = true;
      var data = {};
      var firstBad = null;
      Object.keys(RULES).forEach(function (k) {
        var v = form.elements[k].value.trim();
        data[k] = v;
        var msg = RULES[k](v);
        setError(form, k, msg);
        if (msg && !firstBad) firstBad = form.elements[k];
      });
      var picked = null;
      if (form.elements.course) {
        var typed = form.elements.course.value.trim().toLowerCase();
        picked = brochureCourses().filter(function (c) { return c.title.toLowerCase() === typed; })[0] ||
          (typed.length > 2 ? brochureCourses().filter(function (c) { return c.title.toLowerCase().indexOf(typed) > -1; }) : []).filter(function (c, i, all) { return all.length === 1; })[0] || null;
        setError(form, "course", picked ? "" : "Choose a micro credential from the list.");
        if (!picked && !firstBad) firstBad = form.elements.course;
        if (picked) form.elements.course.value = picked.title;
      }
      if (firstBad) { firstBad.focus(); return; }
      data.website = form.elements.website.value;
      if (picked) form.setAttribute("data-course", picked.id);
      data.source = form.getAttribute("data-source") || "Website";
      var course = form.getAttribute("data-course");
      if (course) data.courseId = course;

      btn.disabled = true;
      btn.classList.add("is-busy");
      var label = btn.innerHTML;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending';
      fetchWithRetry(API + "/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function () { return picked ? brochureExists(brochureUrl(picked)) : true; })
        .then(function (exists) {
          var first = data.name.split(" ")[0];
          if (picked && !exists) {
            /* This course's PDF is not in assets/brochures yet: a short note instead of an error page. */
            form.outerHTML = '<div class="lead-done" role="status">' +
              '<span class="ok">' + icon("done") + '</span>' +
              '<h3>Thank you, ' + esc(first) + '</h3>' +
              '<p>The brochure for <strong>' + esc(picked.title) + '</strong> is coming soon. The USAII® team will send it to you.</p>' +
            '</div>';
          } else if (picked) {
            /* Brochure: the download starts now, and a link stays in case the browser blocks it. */
            var href = brochureUrl(picked);
            var a = document.createElement("a");
            a.href = href; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
            form.outerHTML = '<div class="lead-done" role="status">' +
              '<span class="ok">' + icon("done") + '</span>' +
              '<h3>Thank you, ' + esc(first) + '</h3>' +
              '<p>Your brochure for <strong>' + esc(picked.title) + '</strong> is downloading.</p>' +
              '<a class="btn" href="' + esc(href) + '" download>Download again ' + icon("download", "dl-ico") + '</a>' +
            '</div>';
            return;
          }
          form.outerHTML = '<div class="lead-done" role="status">' +
            '<span class="ok">' + icon("done") + '</span>' +
            '<h3>Thank you, ' + esc(first) + '</h3>' +
            '<p>The USAII® team has your details and will contact you at <strong>' + esc(data.email) + '</strong>.</p>' +
            '<a class="btn" href="courses.html">Explore AI Micro Credentials ' + icon("arrow", "arrow") + '</a>' +
          '</div>';
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.classList.remove("is-busy");
          btn.innerHTML = label;
          alertEl.textContent = err.network ? "Your details were not sent: the connection failed. Check your internet connection and try again." : err.message;
          alertEl.hidden = false;
        });
    });
  }

  function renderLeadSlots() {
    /* Download Brochure form on the home page banner: assets/js/config.js brochureForm: true */
    var heroGrid = $(".hero .hero-grid");
    if (CFG.brochureForm && heroGrid && !$("[data-lead-slot]", heroGrid)) {
      heroGrid.classList.remove("is-single");
      heroGrid.insertAdjacentHTML("beforeend", '<aside class="lead-card beam" aria-label="Download a brochure"><div class="beam-inner" data-lead-slot="hero" data-mode="brochure" data-source="Home: brochure download"></div></aside>');
    }
    $$("[data-lead-slot]").forEach(function (slot) {
      if (slot.getAttribute("data-lead-slot") === "modal") return;
      slot.innerHTML = leadFormHTML({ collapsed: true, mode: slot.getAttribute("data-mode") || "lead", source: slot.getAttribute("data-source") || "Home: hero", courseId: slot.getAttribute("data-course") || "", titleId: "lead-title" });
      wireLeadForm($("form", slot));
    });
  }

  function openLead(o) {
    var modal = $("#lead-modal");
    if (!modal) return;
    var slot = $("[data-lead-slot]", modal);
    slot.innerHTML = leadFormHTML({ collapsed: false, source: o.source, courseId: o.courseId, title: o.title || "Get more details", intro: o.intro, titleId: "lead-modal-title" });
    wireLeadForm($("form", slot));
    showModal(modal, $("input[name=name]", slot));
  }

  /* ==========================================================================
     Header, particles, back to top
     ========================================================================== */
  var header = $(".site-header");
  var toTop = $(".back-to-top");
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("is-stuck", y > 140);
    if (toTop) toTop.classList.toggle("is-visible", y > 700);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  var toggle = $(".nav-toggle");
  var nav = $("#main-nav");
  var mobileQuery = window.matchMedia("(max-width: 1139.98px)");
  function closeNav() {
    if (!nav) return;
    nav.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    $$(".nav-item.open").forEach(function (li) { li.classList.remove("open"); });
  }
  if (toggle && nav) toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-item.has-dropdown > .nav-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      if (!mobileQuery.matches) return;
      e.preventDefault();
      var li = link.parentElement;
      link.setAttribute("aria-expanded", String(li.classList.toggle("open")));
    });
  });
  $$("#main-nav a").forEach(function (a) {
    a.addEventListener("click", function () { if (mobileQuery.matches && !a.matches(".has-dropdown > .nav-link")) closeNav(); });
  });
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", closeNav);

  $$(".particles").forEach(function (box) {
    var colors = ["#1F6BFF", "#8B3DFF", "#00C2FF", "#00C77F"];
    var html = "";
    for (var i = 0; i < 16; i++) {
      var c = colors[i % 4];
      html += '<span class="particle" style="left:' + ((i * 41) % 100) + "%;bottom:" + ((i * 17) % 30) + "%;animation-delay:" + ((i * 0.9) % 10).toFixed(1) + "s;animation-duration:" + (10 + ((i * 7) % 8)) + "s;background:" + c + ";box-shadow:0 0 10px " + c + '"></span>';
    }
    box.innerHTML = html;
  });

  /* ==========================================================================
     Vision video (config: visionVideo)
     ========================================================================== */
  (function () {
    var box = $("#vision-video");
    var v = CFG.visionVideo || {};
    if (!box || !(v.src || v.embedUrl)) return;
    if (v.embedUrl) {
      box.innerHTML = '<iframe src="' + esc(v.embedUrl) + '" title="The Vision Behind the USAII® aLMS, Dr. Milton Mattox, CEO, USAII®" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    } else {
      box.innerHTML = '<video controls preload="metadata" playsinline' + (v.poster ? ' poster="' + esc(v.poster) + '"' : '') + '><source src="' + esc(v.src) + '">' +
        (v.captions ? '<track kind="captions" srclang="en" label="English" src="' + esc(v.captions) + '" default>' : '') + '</video>';
    }
  })();

  /* ==========================================================================
     Start
     ========================================================================== */
  wireLinks(document);
  renderLeadSlots();
  if (grid) grid.innerHTML = skeletons(4);

  loadCatalog().then(function (cat) {
    CATALOG = cat;
    /* The brochure list shows the course names as they are in the LMS now. */
    $$(".lead-form datalist").forEach(function (dl) {
      dl.innerHTML = brochureCourses().map(function (c) { return '<option value="' + esc(c.title) + '"></option>'; }).join("");
    });
    renderCatalog();
    openFromHash();
    document.dispatchEvent(new CustomEvent("mc:catalog", { detail: cat }));
  });
  window.addEventListener("hashchange", openFromHash);

  /* ==========================================================================
     Links to a section of this page ("#how-it-works", "#faq" ...)
     They always scroll on this page, even when the page is served at another address or a site
     framework adds a <base> tag (which would otherwise send "#faq" to a different page). Until the
     visitor scrolls, the section stays in view while the course catalog and other late content
     load above it (browsers without scroll anchoring, such as Safari, would otherwise drift).
     ========================================================================== */
  var follow = null;
  var calmMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function scrollToSection(id, smooth) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: smooth && !calmMotion ? "smooth" : "auto", block: "start" });
    return true;
  }
  function followSection(id) { follow = { id: id, until: Date.now() + 8000 }; }
  ["wheel", "touchstart", "keydown"].forEach(function (type) {
    window.addEventListener(type, function () { follow = null; }, { passive: true });
  });
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (follow && Date.now() < follow.until) scrollToSection(follow.id, false);
      else follow = null;
    }).observe(document.body);
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.hasAttribute("data-details") || a.hasAttribute("data-lead-open") || a.target === "_blank") return;
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "#" || href.length < 2) return;
    var id = decodeURIComponent(href.slice(1));
    var target = document.getElementById(id);
    if (!target || /^course-/.test(id)) return;
    e.preventDefault();
    if (history.pushState) history.pushState(null, "", location.pathname + location.search + "#" + encodeURIComponent(id));
    scrollToSection(id, true);
    if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (err) { /* older browsers */ }
    followSection(id);
  });
  /* Arriving from another page with a section in the address (index.html#faq) */
  if (location.hash.length > 1 && !/^#course-/.test(location.hash)) {
    var startId = decodeURIComponent(location.hash.slice(1));
    if (document.getElementById(startId)) followSection(startId);
  }

  /* For the course pages (assets/js/course-page.js) */
  window.MCSite = {
    urls: urls, fmtPrice: fmtPrice, priceInner: priceInner, currentPrice: currentPrice, esc: esc, icon: icon, loadCatalog: loadCatalog, fetchCourse: fetchCourse,
    openLead: openLead, wireLinks: wireLinks, staticById: staticById, tidy: tidy, cfg: CFG
  };
})();
