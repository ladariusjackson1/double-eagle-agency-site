#!/usr/bin/env node
// Copy siteUrl from assets/js/config.js into the HTML head, robots.txt, and sitemap.xml.
// The real production domain is not in this repository, so siteUrl stays empty until it is known.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PAGES = [
  { file: "index.html", path: "/", social: true, jsonLd: true },
  { file: "privacy.html", path: "/privacy.html", social: false, jsonLd: false },
  { file: "terms.html", path: "/terms.html", social: false, jsonLd: false },
];

export function readSiteUrl(source) {
  const match = source.match(/^[ \t]*siteUrl:[ \t]*("(?:[^"\\]|\\.)*")[ \t]*,?[ \t]*$/m);
  if (!match) {
    throw new Error('assets/js/config.js needs a siteUrl string, for example siteUrl: "".');
  }
  return JSON.parse(match[1]);
}

export function normalizeSiteUrl(value) {
  if (typeof value !== "string") throw new Error("siteUrl must be a string.");
  const trimmed = value.trim();
  if (trimmed === "") return "";

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('siteUrl must be an absolute http(s) origin, or "" until the domain is known.');
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("siteUrl must use http or https.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("siteUrl must be the origin only, without a login, query, or hash.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("siteUrl must be the origin only, without a path.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "yourdomain.com" || host.endsWith(".yourdomain.com")) {
    throw new Error('siteUrl still uses the yourdomain.com placeholder. Leave it "" until the real domain is known.');
  }
  return `${url.protocol}//${url.host}`;
}

function attrEscape(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function xmlEscape(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBlock(page, origin) {
  const lines = [];
  if (!origin) {
    lines.push("<!-- TODO: set siteUrl in assets/js/config.js. This repository has no production domain yet, so canonical and social URLs are omitted. -->");
  } else {
    const pageUrl = attrEscape(origin + page.path);
    lines.push(`<link rel="canonical" href="${pageUrl}">`);
    if (page.social) {
      const image = attrEscape(`${origin}/assets/img/og-image.png`);
      lines.push(`<meta property="og:url" content="${pageUrl}">`);
      lines.push(`<meta property="og:image" content="${image}">`);
      lines.push(`<meta name="twitter:image" content="${image}">`);
    }
  }
  const inner = lines.map((line) => `  ${line}`).join("\n");
  return `  <!-- SITE_URL -->\n${inner}\n  <!-- /SITE_URL -->\n`;
}

function stringifyJsonLd(data) {
  const area = data.areaServed;
  const areaText = `{ "@type": ${JSON.stringify(area["@type"])}, "name": ${JSON.stringify(area.name)} }`;
  const rows = [
    ["@context", JSON.stringify(data["@context"])],
    ["@type", JSON.stringify(data["@type"])],
    ["name", JSON.stringify(data.name)],
    ["description", JSON.stringify(data.description)],
  ];
  if (data.url) rows.push(["url", JSON.stringify(data.url)]);
  rows.push(["telephone", JSON.stringify(data.telephone)]);
  if (data.image) rows.push(["image", JSON.stringify(data.image)]);
  rows.push(["areaServed", areaText]);
  rows.push(["priceRange", JSON.stringify(data.priceRange)]);
  const body = rows.map(([key, value], index) => {
    const comma = index === rows.length - 1 ? "" : ",";
    return `    ${JSON.stringify(key)}: ${value}${comma}`;
  }).join("\n");
  return `<script type="application/ld+json">\n  {\n${body}\n  }\n  </script>`;
}

function syncJsonLd(html, origin, page) {
  if (!page.jsonLd) return html;
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
  if (!pattern.test(html)) {
    throw new Error(`${page.file} is missing its JSON-LD script.`);
  }
  return html.replace(pattern, (full, body) => {
    const data = JSON.parse(body);
    if (origin) {
      data.url = origin + page.path;
      data.image = `${origin}/assets/img/og-image.png`;
    } else {
      delete data.url;
      delete data.image;
    }
    return stringifyJsonLd(data);
  });
}

export function applyHtml(html, page, origin) {
  let next = html.replace(/\n*[ \t]*<!-- SITE_URL -->[\s\S]*?<!-- \/SITE_URL -->\n*/g, "\n");
  next = next.replace(/^[ \t]*<!-- PLACEHOLDER: replace https:\/\/www\.yourdomain\.com[\s\S]*?-->\n?/m, "");
  next = next.replace(/^[ \t]*<link rel="canonical"[^>]*>\n?/gm, "");
  next = next.replace(/^[ \t]*<meta property="og:url"[^>]*>\n?/gm, "");
  next = next.replace(/^[ \t]*<meta property="og:image"[^>]*>\n?/gm, "");
  next = next.replace(/^[ \t]*<meta name="twitter:image"[^>]*>\n?/gm, "");
  next = syncJsonLd(next, origin, page);

  const theme = /(<meta name="theme-color"[^>]*>)\n+/;
  if (!theme.test(next)) throw new Error(`${page.file} is missing the theme-color meta tag.`);
  const block = renderBlock(page, origin).replace(/\n$/, "");
  next = next.replace(theme, `$1\n\n${block}\n\n`);
  next = next.replace(/<head>[\s\S]*?<\/head>/, (head) => head.replace(/\n{3,}/g, "\n\n"));
  return next;
}

export function renderRobots(origin) {
  const lines = [
    "# Generated from siteUrl in assets/js/config.js by scripts/apply-site-url.mjs.",
  ];
  if (!origin) {
    lines.push("# TODO: siteUrl is empty because this repository has no production domain yet.");
  }
  lines.push("User-agent: *", "Allow: /");
  if (origin) lines.push("", `Sitemap: ${origin}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

export function renderSitemap(origin) {
  const body = origin
    ? ["/", "/privacy.html", "/terms.html"]
      .map((path) => `  <url><loc>${xmlEscape(origin + path)}</loc></url>`)
      .join("\n")
    : "";
  const todo = origin
    ? ""
    : "<!-- TODO: siteUrl in assets/js/config.js is empty. This repository has no production domain yet. -->\n";
  return `<?xml version="1.0" encoding="UTF-8"?>\n${todo}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</urlset>\n`;
}

export function planUpdates(files, configSource) {
  const origin = normalizeSiteUrl(readSiteUrl(configSource));
  const updates = new Map();
  for (const page of PAGES) {
    const current = files.get(page.file);
    if (current == null) throw new Error(`Missing ${page.file}.`);
    updates.set(page.file, applyHtml(current, page, origin));
  }
  updates.set("robots.txt", renderRobots(origin));
  updates.set("sitemap.xml", renderSitemap(origin));
  return updates;
}

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function readRepo(root) {
  const files = new Map();
  for (const name of [...PAGES.map((page) => page.file), "robots.txt", "sitemap.xml", "assets/js/config.js"]) {
    files.set(name, readFileSync(join(root, name), "utf8"));
  }
  return files;
}

function differs(current, next) {
  return [...next.entries()].filter(([name, contents]) => current.get(name) !== contents);
}

export function applyRepo(root, { write }) {
  const files = readRepo(root);
  const updates = planUpdates(files, files.get("assets/js/config.js"));
  const changed = differs(files, updates);
  if (write) {
    for (const [name, contents] of changed) writeFileSync(join(root, name), contents);
  }
  return changed.map(([name]) => name);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function selfTest() {
  const config = 'window.SITE_CONFIG = {\n  siteUrl: "",\n};\n';
  assert(readSiteUrl(config) === "", "empty siteUrl should read as an empty string");
  assert(normalizeSiteUrl("https://Example.com/") === "https://example.com", "origin should be normalized");
  let rejected = false;
  try {
    normalizeSiteUrl("https://www.yourdomain.com");
  } catch {
    rejected = true;
  }
  assert(rejected, "the yourdomain.com placeholder should be rejected");

  const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="theme-color" content="#10243F">
  <!-- PLACEHOLDER: replace https://www.yourdomain.com with your real domain (5 spots on this page) -->
  <link rel="canonical" href="https://www.yourdomain.com/">
  <meta property="og:url" content="https://www.yourdomain.com/">
  <meta property="og:image" content="https://www.yourdomain.com/assets/img/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta name="twitter:image" content="https://www.yourdomain.com/assets/img/og-image.png">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Double Eagle Agency",
    "description": "Talking websites with an AI voice agent for local service businesses.",
    "url": "https://www.yourdomain.com/",
    "telephone": "+1-662-629-1077",
    "image": "https://www.yourdomain.com/assets/img/og-image.png",
    "areaServed": { "@type": "AdministrativeArea", "name": "North Mississippi" },
    "priceRange": "$499 per month"
  }
  </script>
</head>
<body><h1>Never miss another customer call.</h1></body>
</html>
`;
  const indexPage = PAGES[0];
  const cleared = applyHtml(index, indexPage, "");
  assert(!cleared.includes("yourdomain.com"), "empty siteUrl should remove placeholder URLs");
  assert(cleared.includes("TODO: set siteUrl"), "empty siteUrl should leave a TODO in the head");
  assert(cleared.includes("Never miss another customer call."), "page copy should stay in place");
  assert(cleared.includes('"telephone": "+1-662-629-1077"'), "JSON-LD copy should stay in place");
  assert(!/"url":/.test(cleared), "JSON-LD should omit url until a domain is set");
  assert(cleared.includes('property="og:image:width"'), "unrelated meta tags should stay");
  assert(applyHtml(cleared, indexPage, "") === cleared, "applying an empty siteUrl twice should be stable");

  const origin = "https://doubleeagle.example";
  const filled = applyHtml(cleared, indexPage, origin);
  assert(filled.includes(`<link rel="canonical" href="${origin}/">`), "canonical URL should use siteUrl");
  assert(filled.includes(`<meta property="og:url" content="${origin}/">`), "og:url should use siteUrl");
  assert(filled.includes(`<meta property="og:image" content="${origin}/assets/img/og-image.png">`), "og:image should use siteUrl");
  assert(filled.includes(`"url": "${origin}/"`), "JSON-LD url should use siteUrl");
  assert(applyHtml(filled, indexPage, origin) === filled, "applying a set siteUrl twice should be stable");

  const privacy = `<!doctype html>
<html lang="en"><head>
  <meta name="theme-color" content="#10243F">
  <link rel="canonical" href="https://www.yourdomain.com/privacy.html">
</head><body><h1>Privacy Policy</h1></body></html>
`;
  const privacyPage = PAGES[1];
  const privacyOut = applyHtml(privacy, privacyPage, origin);
  assert(privacyOut.includes(`href="${origin}/privacy.html"`), "legal pages should get a canonical URL");
  assert(!privacyOut.includes("og:image"), "legal pages should not gain social image tags");
  assert(privacyOut.includes("<h1>Privacy Policy</h1>"), "legal page copy should stay in place");

  const robots = renderRobots("");
  assert(robots.includes("TODO:"), "robots.txt should carry the TODO while siteUrl is empty");
  assert(!robots.includes("Sitemap:"), "robots.txt should omit Sitemap until siteUrl is set");
  assert(renderRobots(origin).includes(`Sitemap: ${origin}/sitemap.xml`), "robots.txt should publish the sitemap URL");
  const sitemap = renderSitemap(origin);
  assert(sitemap.includes(`<loc>${origin}/</loc>`), "sitemap should list the home page");
  assert(sitemap.includes(`<loc>${origin}/terms.html</loc>`), "sitemap should list the terms page");
  assert(!renderSitemap("").includes("<loc>"), "sitemap should omit locations until siteUrl is set");
}

function main() {
  const command = process.argv[2] || "--write";
  if (command === "--self-test") {
    selfTest();
    console.log("apply-site-url self-test passed");
    return;
  }
  if (command !== "--write" && command !== "--check") {
    throw new Error("Usage: node scripts/apply-site-url.mjs [--write|--check|--self-test]");
  }
  const changed = applyRepo(repoRoot(), { write: command === "--write" });
  if (command === "--check") {
    if (changed.length) {
      console.error("These files do not match siteUrl in assets/js/config.js:");
      for (const name of changed) console.error(`  ${name}`);
      console.error("Run: node scripts/apply-site-url.mjs");
      process.exitCode = 1;
      return;
    }
    console.log("site URLs match assets/js/config.js");
    return;
  }
  if (changed.length === 0) console.log("site URLs already match assets/js/config.js");
  else console.log(changed.map((name) => `updated ${name}`).join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
