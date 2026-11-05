import sys, json, asyncio, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent

async def render(title, body, out):
    html = (HERE / "plantilla.html").read_text().replace("{{TITLE}}", title).replace("{{BODY}}", body)
    (HERE / "_tmp.html").write_text(html)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1080}, device_scale_factor=1)
        await pg.goto((HERE / "_tmp.html").as_uri())
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=out, type="jpeg", quality=82)
        await b.close()

if __name__ == "__main__":
    title, body, out = sys.argv[1], sys.argv[2], sys.argv[3]
    asyncio.run(render(title, body, out))
    print(out)
