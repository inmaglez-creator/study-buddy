"""Convierte fotos (HEIC del iPhone, JPG, PNG) en JPG de 1600 px numeradas, listas para leer.

Uso:
    python convertir_fotos.py <carpeta_salida> <foto1> <foto2> ...

Las fotos se numeran 01.jpg, 02.jpg… en el orden en que se pasan (ordénalas por nombre
si vienen del iPhone: el nombre lleva la hora). Respeta la orientación EXIF.
"""
import subprocess
import sys
from pathlib import Path

try:
    import pillow_heif
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "--user", "-q", "pillow-heif"], check=True)
    import site
    sys.path.append(site.getusersitepackages())
    import pillow_heif

from PIL import Image, ImageOps

pillow_heif.register_heif_opener()


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    salida = Path(sys.argv[1])
    salida.mkdir(parents=True, exist_ok=True)
    fallos = []
    for i, ruta in enumerate(sys.argv[2:], 1):
        try:
            im = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB")
            im.thumbnail((1600, 1600))
            im.save(salida / f"{i:02d}.jpg", quality=85)
        except Exception as e:  # una foto rota no debe parar el resto
            fallos.append(f"{ruta}: {e}")
    print(f"Convertidas {len(sys.argv) - 2 - len(fallos)} fotos en {salida}")
    for f in fallos:
        print("  FALLO", f)


if __name__ == "__main__":
    main()
