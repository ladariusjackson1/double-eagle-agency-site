# Double Eagle Agency site

Plain HTML, CSS and JavaScript. No build step. Netlify serves this folder as is.

## Edit these first

| What | Where |
|---|---|
| Founding spots left, email, phone, sample site link, backup booking link | `assets/js/config.js` |
| GoHighLevel voice agent script | bottom of `index.html`, look for `GOHIGHLEVEL VOICE AGENT EMBED` |
| GoHighLevel booking calendar | `index.html`, look for `GOHIGHLEVEL BOOKING CALENDAR EMBED` |
| Your domain (`https://www.yourdomain.com`) | `index.html` (head), `privacy.html`, `terms.html`, `robots.txt`, `sitemap.xml` |
| Email in the HTML fallback text | search all files for `email@yourdomain.com` |

## Files

- `index.html` landing page
- `privacy.html`, `terms.html` legal pages
- `assets/css/styles.css` all styles
- `assets/js/config.js` settings you edit
- `assets/js/main.js` page behavior (calculator, voice agent button, spots counter)
- `assets/logo.png` original logo; `assets/img/` holds the cropped mark, favicons and share image
- `netlify.toml` Netlify settings
