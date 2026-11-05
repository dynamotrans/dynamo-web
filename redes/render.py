"""Genera la imagen 1080x1080 del post semanal de Dynamo Trans.

Uso:
  python3 redes/render.py --variant v1 --title "¿Grupaje o <em>carga completa</em>?" --body "Texto..." --out images/redes/AAAA-MM-DD-slug.jpg
  python3 redes/render.py --variant v2 --kicker "Capacidad del trailer" --title "<em>33</em>" --body "europalets en un tauliner de 13,30 m..." --out ...
  python3 redes/render.py --variant v3 [--photo alt] --title "..." --body "..." --out ...
  python3 redes/render.py --variant v4 --title "..." --list "Punto 1|Punto 2|Punto 3" --out ...

Variantes:
  v1  tarjeta morada con camión y carretera (titular + texto)
  v2  dato grande sobre navy, con palets (kicker + número + texto)
  v3  foto real de la web con velo morado (titular + texto). --photo alt usa la foto de los dos camiones
  v4  fondo claro con logo a color, lista de 3 puntos y mapa de ruta (titular + list)
"""
import argparse, asyncio, pathlib, html
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent

async def render(a):
    t = (HERE / "plantilla.html").read_text()
    lis = "".join(f"<li>{x.strip()}</li>" for x in a.list.split("|")) if a.list else ""
    logo = "../images/2.png" if a.variant == "v4" else "../images/4.png"
    t = (t.replace("{{VARIANT}}", a.variant).replace("{{PHOTO}}", "alt" if a.photo == "alt" else "")
          .replace("{{LOGO}}", logo).replace("{{KICKER}}", a.kicker or "")
          .replace("{{TITLE}}", a.title or "").replace("{{BODY}}", a.body or "").replace("{{LIST}}", lis))
    tmp = HERE / "_tmp.html"; tmp.write_text(t)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1080}, device_scale_factor=1)
        await pg.goto(tmp.as_uri()); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=a.out, type="jpeg", quality=84)
        await b.close()
    tmp.unlink(missing_ok=True)
    print(a.out)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="v1", choices=["v1", "v2", "v3", "v4"])
    ap.add_argument("--title"); ap.add_argument("--body"); ap.add_argument("--kicker")
    ap.add_argument("--list"); ap.add_argument("--photo", default="")
    ap.add_argument("--out", required=True)
    asyncio.run(render(ap.parse_args()))
