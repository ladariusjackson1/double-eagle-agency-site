#!/usr/bin/env node
// Check links in the HTML pages: local files, in-page anchors, and external URLs.

import { mkdirSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readSiteUrl, normalizeSiteUrl } from "./apply-site-url.mjs";

const HTML_FILES = ["index.html", "privacy.html", "terms.html"];
const SKIP_RELS = new Set(["preconnect", "dns-prefetch"]);

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function readExceptions(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

function linkKey(url) {
  const parsed = new URL(url);
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return `${parsed.origin}${path}${parsed.search}`;
}

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function collectIds(html) {
  const ids = new Set();
  const attr = /(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  for (const match of stripComments(html).matchAll(attr)) ids.add(match[1] || match[2]);
  return ids;
}

function collectRefs(html, file) {
  const refs = [];
  const tags = stripComments(html).matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g);
  for (const tag of tags) {
    const name = tag[1].toLowerCase();
    const attrs = {};
    for (const attr of tag[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
    }
    const rels = new Set((attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean));
    if ([...rels].some((rel) => SKIP_RELS.has(rel))) continue;

    let value = "";
    if ((name === "a" || name === "link") && attrs.href) value = attrs.href;
    else if (["img", "script", "audio", "video", "source", "iframe"].includes(name) && attrs.src) value = attrs.src;
    if (!value) continue;
    if (/^(?:mailto:|tel:|javascript:|data:)/i.test(value) || value === "#") continue;
    refs.push({ file, value });
  }
  return refs;
}

function localPath(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const cleaned = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const relativePath = cleaned.replace(/^[/\\]+/, "");
  const file = relativePath === "" ? "index.html" : relativePath.endsWith("/") ? `${relativePath}index.html` : relativePath;
  const absolute = normalize(join(root, file));
  if (absolute !== root && !absolute.startsWith(root + sep)) return null;
  return { absolute, display: file };
}

export async function checkLinks({ root, files, exceptions, siteOrigin, fetchImpl }) {
  const errors = [];
  const skipped = [];
  const usedExceptions = new Set();
  const htmlByFile = new Map([...files.entries()].filter(([name, value]) => name.endsWith(".html") && typeof value === "string"));
  const idsByFile = new Map([...htmlByFile.entries()].map(([name, html]) => [name, collectIds(html)]));
  const refs = [];
  for (const [name, html] of htmlByFile) refs.push(...collectRefs(html, name));

  const external = new Map();

  for (const ref of refs) {
    let url;
    try {
      url = new URL(ref.value, `http://local.test/${ref.file}`);
    } catch {
      errors.push(`${ref.file}: cannot parse ${ref.value}`);
      continue;
    }

    const isSite = siteOrigin && (url.origin === siteOrigin || ref.value.startsWith(siteOrigin));
    const isExternal = url.protocol === "http:" || url.protocol === "https:";
    const treatAsLocal = url.origin === "http://local.test" || isSite;

    if (!treatAsLocal && isExternal) {
      const key = linkKey(url.href);
      if (exceptions.some((item) => linkKey(item) === key)) {
        usedExceptions.add(key);
        skipped.push(key);
        continue;
      }
      if (!external.has(key)) external.set(key, []);
      external.get(key).push(ref.file);
      continue;
    }

    if (!treatAsLocal) {
      errors.push(`${ref.file}: unsupported link ${ref.value}`);
      continue;
    }

    const local = localPath(root, url.pathname);
    if (!local) {
      errors.push(`${ref.file}: ${ref.value} escapes the site folder`);
      continue;
    }
    if (!files.has(local.display) && !files.has(local.display.replace(/\\/g, "/"))) {
      errors.push(`${ref.file}: ${ref.value} points at missing ${local.display}`);
      continue;
    }
    if (url.hash && url.hash !== "#") {
      const id = decodeURIComponent(url.hash.slice(1));
      const ids = idsByFile.get(local.display);
      if (ids && !ids.has(id)) errors.push(`${ref.file}: ${ref.value} has no matching id "${id}"`);
    }
  }

  await Promise.all([...external.entries()].map(async ([href, from]) => {
    const failure = await fetchStatus(href, fetchImpl);
    if (failure) errors.push(`${from.join(", ")}: ${href} ${failure}`);
  }));

  for (const item of exceptions) {
    const key = linkKey(item);
    if (!usedExceptions.has(key)) errors.push(`link exception is unused: ${item}`);
  }

  return {
    errors,
    skipped: [...new Set(skipped)],
    checked: refs.length - skipped.length,
  };
}

async function fetchStatus(href, fetchImpl) {
  let last = "request failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl(href, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "DoubleEagleLinkCheck/1.0 (+https://github.com/ladariusjackson1/double-eagle-agency-site)" },
      });
      if (response.status >= 200 && response.status < 400) return "";
      last = `returned HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) return last;
    } catch (error) {
      last = error.name === "AbortError" ? "timed out" : `could not be reached (${error.message})`;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

function readProject(root) {
  const files = new Map();
  const include = new Set([...HTML_FILES, "assets/js/config.js", "robots.txt", "sitemap.xml"]);
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".cache" || entry.name === "node_modules") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const name = relative(root, absolute).split(sep).join("/");
        if (include.has(name) || name.startsWith("assets/") || name === "favicon.ico") {
          files.set(name, readFileSync(absolute));
        }
      }
    }
  }
  walk(root);
  const textFiles = new Map();
  for (const [name, buffer] of files) {
    if (name.endsWith(".html") || name.endsWith(".css") || name.endsWith(".js") || name.endsWith(".txt")) {
      textFiles.set(name, buffer.toString("utf8"));
    } else {
      textFiles.set(name, buffer);
    }
  }
  return textFiles;
}

function cssRefs(css, file) {
  const refs = [];
  for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"'\s]+))\s*\)/g)) {
    const value = match[1] || match[2] || match[3];
    if (!value || value.startsWith("data:")) continue;
    refs.push({ file, value });
  }
  return refs;
}

function configuredUrl(source, key) {
  const match = source.match(new RegExp(`^[ \\t]*${key}:[ \\t]*"([^"]*)"`, "m"));
  return match ? match[1].trim() : "";
}

export async function checkProject(root, { fetchImpl = globalThis.fetch } = {}) {
  const files = readProject(root);
  const config = files.get("assets/js/config.js");
  const origin = normalizeSiteUrl(readSiteUrl(config));
  const exceptions = readExceptions(readFileSync(join(root, "scripts/link-exceptions.txt"), "utf8"));
  const htmlFiles = [...files.entries()].filter(([name, value]) => name.endsWith(".html") && typeof value === "string");
  const index = htmlFiles.find(([name]) => name === "index.html");
  if (index) {
    const extras = ["sampleSiteUrl", "bookingUrl"].map((key) => configuredUrl(config, key)).filter(Boolean);
    const missing = extras.filter((href) => !htmlFiles.some(([, html]) => html.includes(href)));
    if (missing.length) {
      index[1] += missing.map((href) => `<a href="${href}">configured</a>`).join("");
    }
  }
  const result = await checkLinks({
    root,
    files: new Map([...files.entries(), ...htmlFiles]),
    exceptions,
    siteOrigin: origin ? new URL(origin).origin : "",
    fetchImpl,
  });

  for (const [name, value] of files) {
    if (!name.endsWith(".css") || typeof value !== "string") continue;
    for (const ref of cssRefs(value, name)) {
      const url = new URL(ref.value, `http://local.test/${name}`);
      if (url.origin !== "http://local.test") continue;
      const local = localPath(root, url.pathname);
      if (!local || !files.has(local.display)) result.errors.push(`${name}: ${ref.value} points at a missing file`);
      else result.checked += 1;
    }
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function selfTest() {
  const directory = mkdtempSync(join(tmpdir(), "double-eagle-links-"));
  try {
    mkdirSync(join(directory, "assets"));
    mkdirSync(join(directory, "scripts"));
    writeFileSync(join(directory, "assets/site.css"), "body{background:url(\"dot.png\")}");
    writeFileSync(join(directory, "assets/dot.png"), "png");
    writeFileSync(join(directory, "scripts/link-exceptions.txt"), "# note\nhttps://offline.example/demo\n");
    writeFileSync(join(directory, "assets/js-not-used"), "");
    writeFileSync(join(directory, "index.html"), `<!doctype html><html><head>
      <link rel="preconnect" href="https://fonts.example">
      <link rel="stylesheet" href="assets/site.css">
      <script src="assets/app.js"></script>
    </head><body>
      <h1 id="top">Home</h1>
      <a href="privacy.html#main">Privacy</a>
      <a href="#top">Top</a>
      <a href="#missing">Missing</a>
      <a href="mailto:email@yourdomain.com">email</a>
      <a href="https://broken.example/missing">Broken</a>
      <a href="https://ok.example/page">Ok</a>
      <a href="https://offline.example/demo">Demo</a>
      <!-- <img src="assets/not-real.jpg" alt=""> -->
    </body></html>`);
    writeFileSync(join(directory, "privacy.html"), `<!doctype html><html><body><main id="main"><h1>Privacy</h1><a href="./">Home</a></main></body></html>`);
    writeFileSync(join(directory, "assets/app.js"), "");
    const files = new Map();
    function add(name) {
      files.set(name, readFileSync(join(directory, name), "utf8"));
    }
    add("index.html");
    add("privacy.html");
    add("assets/site.css");
    add("assets/dot.png");
    add("assets/app.js");
    const seen = [];
    const result = await checkLinks({
      root: directory,
      files,
      exceptions: ["https://offline.example/demo"],
      siteOrigin: "",
      fetchImpl: async (href) => {
        seen.push(href);
        if (href.includes("broken.example")) return { status: 404 };
        return { status: 200 };
      },
    });
    assert(result.errors.some((error) => error.includes("#missing")), "missing anchors should fail");
    assert(result.errors.some((error) => error.includes("broken.example") && error.includes("404")), "HTTP 404 should fail");
    assert(!result.errors.some((error) => error.includes("offline.example")), "excluded URLs should not fail the run");
    assert(!result.errors.some((error) => error.includes("not-real.jpg")), "links inside comments should be ignored");
    assert(!seen.some((href) => href.includes("fonts.example")), "preconnect hints should not be fetched");
    assert(!seen.some((href) => href.includes("offline.example")), "excluded URLs should not be fetched");
    assert(seen.includes("https://ok.example/page"), "live external links should be fetched");
    const unused = await checkLinks({
      root: directory,
      files,
      exceptions: ["https://unused.example/nope"],
      siteOrigin: "",
      fetchImpl: async () => ({ status: 200 }),
    });
    assert(unused.errors.some((error) => error.includes("unused")), "stale exceptions should fail");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const command = process.argv[2] || "--check";
  if (command === "--self-test") {
    await selfTest();
    console.log("check-links self-test passed");
    return;
  }
  if (command !== "--check") throw new Error("Usage: node scripts/check-links.mjs [--check|--self-test]");
  const result = await checkProject(repoRoot());
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length} known offline link${result.skipped.length === 1 ? "" : "s"}:`);
    for (const href of result.skipped) console.log(`  ${href}`);
  }
  if (result.errors.length) {
    console.error(`Found ${result.errors.length} broken link${result.errors.length === 1 ? "" : "s"}:`);
    for (const error of result.errors) console.error(`  ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Checked ${result.checked} links.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
