"""Imagen 1080x1350 (post) o 1080x1920 (--format story) para anunciar en redes un artículo nuevo del blog.

Uso:
  python3 redes/render_blog.py --title "¿Cuál es el <em>peso máximo</em> de un camión?" \
    --hook "44 toneladas no son 44 toneladas de mercancía." \
    --lead "Masa máxima, tara, carga útil real..." --date "13 de noviembre de 2026" \
    --minutes 7 --out images/redes/AAAA-MM-DD-blog-slug.jpg

- title: título del artículo (corto, máx ~60 caracteres) con 1-3 palabras clave entre <em></em>.
- hook: frase gancho, máx ~60 caracteres (2 líneas).
- lead: resumen, máx ~150 caracteres (3 líneas).
- tag: etiqueta de la ficha (por defecto "Guía práctica").
"""
import argparse, asyncio, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent

async def render(a):
    t = (HERE / "plantilla-blog.html").read_text(encoding="utf-8")
    for k, v in {"HOOK": a.hook, "TAG": a.tag, "DATE": a.date, "TITLE": a.title, "LEAD": a.lead, "MIN": str(a.minutes), "FORMAT": "story" if a.format == "story" else "", "GO": a.go or ("Toca el enlace del perfil →" if a.format == "story" else "Enlace en la bio →")}.items():
        t = t.replace("{{%s}}" % k, v)
    tmp = HERE / "_tmp_blog.html"; tmp.write_text(t, encoding="utf-8")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1920 if a.format == "story" else 1350}, device_scale_factor=1)
        await pg.goto(tmp.as_uri()); await pg.wait_for_timeout(1500)
        # Aviso si la ficha blanca invade el pie
        over = await pg.evaluate("document.querySelector('.card').getBoundingClientRect().bottom > document.querySelector('.foot').getBoundingClientRect().top - 20")
        await pg.screenshot(path=a.out, type="jpeg", quality=86)
        await b.close()
    tmp.unlink(missing_ok=True)
    print(a.out + ("  ⚠ LA FICHA SE MONTA SOBRE EL PIE: acorta título o lead" if over else ""))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True); ap.add_argument("--hook", required=True)
    ap.add_argument("--lead", required=True); ap.add_argument("--date", required=True)
    ap.add_argument("--minutes", type=int, required=True); ap.add_argument("--tag", default="Guía práctica")
    ap.add_argument("--format", default="post", choices=["post", "story"], help="post 1080x1350 | story 1080x1920")
    ap.add_argument("--go", default="", help="texto del botón del pie (por defecto según formato)")
    ap.add_argument("--out", required=True)
    asyncio.run(render(ap.parse_args()))
