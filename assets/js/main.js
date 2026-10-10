(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Settings from config.js ---------- */
  if (cfg.phoneDisplay) $$("[data-phone]").forEach(function (el) { el.textContent = cfg.phoneDisplay; });
  if (cfg.phoneLink) $$("[data-phone], [data-phone-link]").forEach(function (el) { el.href = "tel:" + cfg.phoneLink; });
  if (cfg.email) {
    $$("[data-email]").forEach(function (el) { el.textContent = cfg.email; el.href = "mailto:" + cfg.email; });
    $$("[data-email-link]").forEach(function (el) { el.href = "mailto:" + cfg.email; });
  }
  if (cfg.sampleSiteUrl) {
    $$("[data-sample-link]").forEach(function (el) { el.href = cfg.sampleSiteUrl; });
    $$("[data-sample-host]").forEach(function (el) { el.textContent = cfg.sampleSiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""); });
  }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Founding spots counter ---------- */
  var left = Number(cfg.foundingSpotsLeft);
  var total = Number(cfg.foundingSpotsTotal) || 3;
  if (!isNaN(left)) {
    $$("[data-spots-left]").forEach(function (el) { el.textContent = left; });
    $$("[data-spots-total]").forEach(function (el) { el.textContent = total; });
    if (left <= 0) {
      var card = $("[data-price-card]");
      if (card) card.classList.add("is-full");
      var title = $("[data-founding-title]");
      if (title) title.textContent = "All founding spots are taken";
      $$(".founding-count").forEach(function (el) { el.hidden = true; });
      var claim = $("[data-claim-btn]");
      if (claim) claim.textContent = "Book a call";
      var fine = $("[data-founding-fine]");
      if (fine) fine.hidden = true;
      var line = $(".spots-line");
      if (line) line.hidden = true;
    }
  }

  /* ---------- Header: border on scroll, mobile menu ---------- */
  var header = $(".site-header");
  var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var toggle = $(".menu-toggle");
  var nav = $("#site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open);
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    $$("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  /* ---------- Hero: the example call plays out once on load ---------- */
  var steps = $$(".call-card [data-step]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  steps.forEach(function (el, i) {
    if (reduce) { el.classList.add("is-in"); return; }
    setTimeout(function () { el.classList.add("is-in"); }, 350 + i * 750);
  });

  /* ---------- Missed call calculator ---------- */
  var jobInput = $("#job-value");
  var missed = $("#missed");
  var missedOut = $("#missed-out");
  var rate = $("#close-rate");
  var PRICE = 499;
  var WEEKS_PER_MONTH = 52 / 12;
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };

  function calc() {
    var value = Number(String(jobInput.value).replace(/[^0-9.]/g, "")) || 0;
    var calls = Number(missed.value);
    var jobs = calls * Number(rate.value) * WEEKS_PER_MONTH;
    var total = value * jobs;
    missedOut.textContent = calls;

    $("#calc-total").textContent = money(total);
    var roundedJobs = Math.round(jobs);
    $("#calc-jobs").textContent = jobs < 0.5
      ? "Less than one job a month. Lucky you."
      : "That's about " + roundedJobs + (roundedJobs === 1 ? " job" : " jobs") + " a month.";

    var months = Math.floor(value / PRICE);
    var compare = $("#calc-compare");
    if (months >= 2) {
      compare.innerHTML = "My service is <strong>$499 a month</strong>. One saved job covers " + months + " months of it.";
    } else if (months === 1) {
      compare.innerHTML = "My service is <strong>$499 a month</strong>. One saved job covers a full month of it.";
    } else {
      compare.innerHTML = "My service is <strong>$499 a month</strong>, all in.";
    }
  }

  if (jobInput && missed && rate) {
    jobInput.addEventListener("input", calc);
    jobInput.addEventListener("blur", function () {
      var v = Number(String(jobInput.value).replace(/[^0-9.]/g, "")) || 0;
      jobInput.value = Math.round(v).toLocaleString("en-US");
    });
    missed.addEventListener("input", calc);
    rate.addEventListener("change", calc);
    calc();
  }

  /* ---------- "Talk to my AI now": open the GoHighLevel voice agent ---------- */
  var dialog = $("#agent-dialog");

  function tryOpenWidget() {
    // GoHighLevel / LeadConnector widget API
    var lc = window.leadConnector && window.leadConnector.chatWidget;
    if (lc && typeof lc.openWidget === "function") { lc.openWidget(); return true; }
    // Fallback: click the widget's own launcher bubble
    var host = document.querySelector("chat-widget");
    var root = host && (host.shadowRoot || host);
    var launcher = root && root.querySelector(".lc_text-widget--bubble, [class*='launcher'], button");
    if (launcher) { launcher.click(); return true; }
    return false;
  }

  function showFallback() {
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else window.location.hash = "book";
  }

  function openAgent() {
    if (tryOpenWidget()) return;
    // The widget script may still be loading. Give it up to 3 seconds.
    var widgetScript = document.querySelector("script[src*='leadconnectorhq'], script[src*='msgsndr'], script[data-widget-id]");
    if (!widgetScript) { showFallback(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (tryOpenWidget()) { clearInterval(timer); }
      else if (tries >= 15) { clearInterval(timer); showFallback(); }
    }, 200);
  }

  $$("[data-open-agent]").forEach(function (btn) { btn.addEventListener("click", openAgent); });
  $$("[data-close-dialog]").forEach(function (el) {
    el.addEventListener("click", function () { if (dialog) dialog.close(); });
  });
  if (dialog) {
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  // Mark the page once the GoHighLevel widget is on it (used to make room on phones)
  var widgetCheck = setInterval(function () {
    if (document.querySelector("chat-widget")) {
      document.documentElement.classList.add("has-widget");
      clearInterval(widgetCheck);
    }
  }, 500);
  setTimeout(function () { clearInterval(widgetCheck); }, 20000);

  /* ---------- Booking: hide the backup box once the calendar embed is in ---------- */
  var embed = $("#booking-embed");
  var booking = $("#booking");
  function checkEmbed() {
    if (embed && embed.querySelector("iframe")) booking.classList.add("has-embed");
  }
  checkEmbed();
  window.addEventListener("load", checkEmbed);

  if (cfg.bookingUrl) {
    var backup = $("[data-booking-backup]");
    if (backup) {
      backup.hidden = false;
      backup.querySelector("a").href = cfg.bookingUrl;
    }
  }
})();
