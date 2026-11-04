"""Exports reproductibles : python3 -m pip install cairosvg pillow ; python3 export.py."""
from pathlib import Path
from io import BytesIO
import json
import zipfile
import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
for folder in ('svg', 'png', 'print', 'web', 'desktop'):
    (ROOT / folder).mkdir(exist_ok=True)
INK, MARGIN, PAPER = '#121317', '#8b9bf0', '#fcfcfd'

def svg(background=INK, stem=MARGIN, arms=PAPER, radius=112):
    bg = f'<rect width="1024" height="1024" rx="{radius}" fill="{background}"/>' if background else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title"><title id="title">Kanevas — Marge</title>{bg}<path fill="{stem}" d="M216 144H376V880H216Q168 880 168 832V192Q168 144 216 144Z"/><path fill="{arms}" d="M440 368L664 144H896L552 488H440ZM440 536H552L896 880H664L440 656Z"/></svg>'''

variants = {
    'kanevas-icon': svg(),
    'kanevas-symbol': svg(None),
    'kanevas-on-light': svg(PAPER, MARGIN, INK),
    'kanevas-mono-dark': svg(None, INK, INK),
    'kanevas-mono-white': svg(None, PAPER, PAPER),
}
for name, source in variants.items():
    (ROOT / 'svg' / f'{name}.svg').write_text(source)
    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        raw = cairosvg.svg2png(bytestring=source.encode(), output_width=size*4, output_height=size*4)
        im = Image.open(BytesIO(raw)).convert('RGBA').resize((size, size), Image.Resampling.LANCZOS)
        im.save(ROOT / 'png' / f'{name}-{size}.png')
    cairosvg.svg2pdf(bytestring=source.encode(), write_to=str(ROOT / 'print' / f'{name}.pdf'))
    cairosvg.svg2eps(bytestring=source.encode(), write_to=str(ROOT / 'print' / f'{name}.eps'))

base = Image.open(ROOT / 'png/kanevas-icon-1024.png')
base.save(ROOT / 'desktop/kanevas.icns', format='ICNS')
base.save(ROOT / 'web/favicon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
(ROOT / 'web/favicon.svg').write_text(variants['kanevas-icon'])
for size, name, source in (
    (180,'apple-touch-icon.png',svg(radius=0)),
    (192,'icon-192.png',svg(radius=0)),
    (512,'icon-512.png',svg(radius=0)),
):
    cairosvg.svg2png(bytestring=source.encode(), write_to=str(ROOT/'web'/name), output_width=size,output_height=size)
# Maskable: central 60% bounding square fits inside the guaranteed safe circle.
mask = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#121317"/><g transform="translate(204.8 204.8) scale(.6)">' + variants['kanevas-symbol'].split('</title>')[1].removesuffix('</svg>') + '</g></svg>'
cairosvg.svg2png(bytestring=mask.encode(),write_to=str(ROOT/'web/icon-maskable-512.png'),output_width=512,output_height=512)
manifest = {'name':'Kanevas','short_name':'Kanevas','icons':[
    {'src':'icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},
    {'src':'icon-512.png','sizes':'512x512','type':'image/png','purpose':'any'},
    {'src':'icon-maskable-512.png','sizes':'512x512','type':'image/png','purpose':'maskable'}]}
(ROOT/'web/site.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
base.save(ROOT/'png/kanevas-icon-1024.webp',lossless=True)
flat = Image.new('RGB',base.size,PAPER)
flat.paste(base,mask=base.getchannel('A'))
flat.save(ROOT/'png/kanevas-icon-1024.jpg',quality=95,subsampling=0)
archive = ROOT.parent / 'kanevas-marge.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(ROOT.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(ROOT.parent))
print(f'Export terminé : {ROOT}')
