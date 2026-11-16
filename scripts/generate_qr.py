"""Create and decode-check the public site QR code; no external QR service.

Optional tools: python -m pip install --no-deps --target runtime/qr-deps
    qrcode==8.2 Pillow==12.0.0 zxing-cpp==2.3.0
Run from WebLoader: python scripts/generate_qr.py https://gerdtanck.github.io/WebLoader/
"""
from pathlib import Path
import json
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'runtime' / 'qr-deps'))
import qrcode
import zxingcpp
from PIL import Image

url = sys.argv[1] if len(sys.argv) > 1 else 'https://gerdtanck.github.io/WebLoader/'
if urlparse(url).scheme != 'https' or not urlparse(url).netloc:
    raise SystemExit('An HTTPS website URL is required.')
target = ROOT / 'artifacts' / 'publication'
target.mkdir(parents=True, exist_ok=True)
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
qr.add_data(url)
qr.make(fit=True)
path = target / 'webloader-qr.png'
qr.make_image(fill_color='black', back_color='white').save(path)
decoded = zxingcpp.read_barcode(Image.open(path))
if decoded is None or decoded.text != url:
    raise SystemExit('QR roundtrip verification failed.')
(target / 'qr-verification.json').write_text(json.dumps({'url': url, 'decoded': decoded.text,
    'format': str(decoded.format), 'image': path.name, 'status': 'passed'}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'image': str(path), 'decoded': decoded.text, 'verified': True}))
