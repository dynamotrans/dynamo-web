#!/usr/bin/env python3
"""Regenera el listado paginado del blog a partir de los artículos de blog/*.html.

Uso (desde la raíz del repo):
    python3 tools/generar-blog-index.py            # 12 artículos por página
    python3 tools/generar-blog-index.py --per-page 3   # para probar la paginación

Qué hace:
- Lee cada artículo (blog/<slug>.html): título y fecha del JSON-LD Article,
  extracto = el que ya tuviera en el listado o, si es nuevo, su `.lp-lead`.
- Ordena por fecha de publicación (más reciente primero).
- Escribe blog/index.html (página 1) y blog/pagina/<n>.html (páginas 2..N) usando
  blog/index.html como plantilla (cabecera, pie, FAB y cookies idénticos).
- Borra páginas sobrantes y actualiza las URLs /blog/pagina/<n> en sitemap.xml.
Es idempotente: ejecutarlo dos veces seguidas no cambia nada.
"""
import argparse, datetime, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOG = ROOT / "blog"
PAG = BLOG / "pagina"
SITE = "https://www.dynamotrans.com"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
LIST_RE = re.compile(r'<div class="bl-list">.*?\n  </div>\n(?:  <nav class="bl-pag".*?</nav>\n)?', re.S)


def fecha_larga(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def ld_blocks(s):
    return re.findall(r'<script type="application/ld\+json">\n(.*?)\n</script>', s, re.S)


def extractos_actuales():
    """slug -> extracto ya escrito en cualquier página del listado (se respeta)."""
    out, orden = {}, []
    for p in [BLOG / "index.html", *sorted(PAG.glob("*.html"), key=lambda x: int(x.stem))]:
        if not p.exists():
            continue
        for slug, exc in re.findall(r'<a class="bl-item" href="/blog/([a-z0-9-]+)">.*?<p>(.*?)</p>', p.read_text(encoding="utf-8"), re.S):
            if slug not in out:
                out[slug] = exc
                orden.append(slug)
    return out, orden


def leer_articulos():
    exc, orden = extractos_actuales()
    arts = []
    for p in BLOG.glob("*.html"):
        if p.name == "index.html":
            continue
        s = p.read_text(encoding="utf-8")
        art = next((json.loads(b) for b in ld_blocks(s) if '"Article"' in b), None)
        if not art:
            raise SystemExit(f"{p}: sin JSON-LD Article")
        lead = re.search(r'<p class="lp-lead">(.*?)</p>', s, re.S)
        arts.append({
            "slug": p.stem,
            "title": art["headline"],
            "date": art["datePublished"][:10],
            "excerpt": exc.get(p.stem) or (lead.group(1).strip() if lead else art.get("description", "")),
            "prev_pos": orden.index(p.stem) if p.stem in orden else -1,
        })
    # Fecha descendente; empate: el que ya iba antes en el listado (los nuevos, arriba).
    arts.sort(key=lambda a: (a["date"], -a["prev_pos"] if a["prev_pos"] >= 0 else 1), reverse=True)
    return arts


def url_pagina(n):
    return f"{SITE}/blog/" if n == 1 else f"{SITE}/blog/pagina/{n}"


def href_pagina(n):
    return "/blog/" if n == 1 else f"/blog/pagina/{n}"


def html_lista(items):
    out = ['<div class="bl-list">']
    for a in items:
        out.append(f'''    <a class="bl-item" href="/blog/{a["slug"]}">
      <time datetime="{a["date"]}">{fecha_larga(a["date"])}</time>
      <h3>{html.escape(a["title"], quote=False)}</h3>
      <p>{a["excerpt"]}</p>
      <span class="bl-more">Leer la guía →</span>
    </a>''')
    out.append("  </div>\n")
    return "\n".join(out)


def html_paginacion(n, total):
    if total < 2:
        return ""
    parts = ['  <nav class="bl-pag" aria-label="Páginas del blog">']
    if n > 1:
        parts.append(f'    <a class="bl-pag-prev" href="{href_pagina(n - 1)}" rel="prev">← Más recientes</a>')
    nums = []
    for i in range(1, total + 1):
        if i == 1 or i == total or abs(i - n) <= 1:
            nums.append(i)
        elif nums[-1] != "…":
            nums.append("…")
    for i in nums:
        if i == "…":
            parts.append('    <span class="bl-pag-gap">…</span>')
        elif i == n:
            parts.append(f'    <span class="bl-pag-num" aria-current="page">{i}</span>')
        else:
            parts.append(f'    <a class="bl-pag-num" href="{href_pagina(i)}">{i}</a>')
    if n < total:
        parts.append(f'    <a class="bl-pag-next" href="{href_pagina(n + 1)}" rel="next">Anteriores →</a>')
    parts.append("  </nav>\n")
    return "\n".join(parts)


def construir(plantilla, items, n, total, per_page):
    s = plantilla
    # Limpia restos de una pasada anterior (rel prev/next, sufijo de página).
    s = re.sub(r'<link rel="(?:prev|next)" href="[^"]*">\n', "", s)
    base_title = re.search(r"<title>(.*?)</title>", s).group(1)
    base_title = re.sub(r" · Página \d+", "", base_title)
    title = base_title if n == 1 else base_title.replace(" | ", f" · Página {n} | ", 1)
    s = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", s)
    for prop in ('property="og:title"', 'name="twitter:title"'):
        s = re.sub(rf'<meta {prop} content="[^"]*">', f'<meta {prop} content="{title}">', s)
    url = url_pagina(n)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', s)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', s)
    rels = ""
    if n > 1:
        rels += f'<link rel="prev" href="{url_pagina(n - 1)}">\n'
    if n < total:
        rels += f'<link rel="next" href="{url_pagina(n + 1)}">\n'
    s = re.sub(r'(<link rel="canonical" href="[^"]*">\n)', lambda m: m.group(1) + rels, s, count=1)

    # JSON-LD: CollectionPage (nombre, url, ItemList) y BreadcrumbList.
    for b in ld_blocks(s):
        d = json.loads(b)
        if d.get("@type") == "CollectionPage":
            d["name"] = title
            d["url"] = url
            d["mainEntity"] = {"@type": "ItemList", "itemListElement": [
                {"@type": "ListItem", "position": (n - 1) * per_page + i + 1,
                 "url": f"{SITE}/blog/{a['slug']}", "name": a["title"]} for i, a in enumerate(items)]}
        elif d.get("@type") == "BreadcrumbList":
            el = [e for e in d["itemListElement"] if e["position"] <= 2]
            if n > 1:
                el.append({"@type": "ListItem", "position": 3, "name": f"Página {n}", "item": url})
            d["itemListElement"] = el
        else:
            continue
        s = s.replace(b, json.dumps(d, ensure_ascii=False), 1)

    # Migas visibles del hero.
    migas = '<a href="/">Inicio</a> › Blog' if n == 1 else f'<a href="/">Inicio</a> › <a href="/blog/">Blog</a> › Página {n}'
    s = re.sub(r'<p class="lp-breadcrumb">.*?</p>', f'<p class="lp-breadcrumb">{migas}</p>', s, count=1)

    # Encabezado de la lista: "Últimos artículos" en la 1, "Artículos anteriores · página N" en el resto.
    h2 = "Últimos <span>artículos</span>" if n == 1 else f"Artículos <span>anteriores</span> · página {n}"
    s = re.sub(r'(<section class="lp-sec"><div class="lp-wrap">\n  <h2>).*?(</h2>)', lambda m: m.group(1) + h2 + m.group(2), s, count=1)

    nuevo = html_lista(items) + html_paginacion(n, total)
    s, k = LIST_RE.subn(lambda m: nuevo, s, count=1)
    if k != 1:
        raise SystemExit("No encuentro el bloque <div class=\"bl-list\"> en blog/index.html")
    return s


def actualizar_sitemap(total):
    p = ROOT / "sitemap.xml"
    s = p.read_text(encoding="utf-8")
    s2 = re.sub(r"  <url>\n    <loc>https://www\.dynamotrans\.com/blog/pagina/\d+</loc>.*?</url>\n", "", s, flags=re.S)
    hoy = datetime.date.today().isoformat()
    extra = "".join(f"""  <url>
    <loc>{SITE}/blog/pagina/{n}</loc>
    <lastmod>{hoy}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>
""" for n in range(2, total + 1))
    s2 = s2.replace("</urlset>", extra + "</urlset>")
    # No toca lastmod de páginas que ya existían con el mismo número (idempotente en el día).
    if s2 != s:
        p.write_text(s2, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-page", type=int, default=12)
    a = ap.parse_args()
    arts = leer_articulos()
    plantilla = (BLOG / "index.html").read_text(encoding="utf-8")
    total = max(1, -(-len(arts) // a.per_page))
    PAG.mkdir(exist_ok=True)
    for n in range(1, total + 1):
        items = arts[(n - 1) * a.per_page: n * a.per_page]
        out = BLOG / "index.html" if n == 1 else PAG / f"{n}.html"
        out.write_text(construir(plantilla, items, n, total, a.per_page), encoding="utf-8")
    for p in PAG.glob("*.html"):
        if int(p.stem) > total or int(p.stem) < 2:
            p.unlink()
    if not any(PAG.iterdir()):
        PAG.rmdir()
    actualizar_sitemap(total)
    print(f"{len(arts)} artículos · {total} página(s) de {a.per_page}")


if __name__ == "__main__":
    main()
