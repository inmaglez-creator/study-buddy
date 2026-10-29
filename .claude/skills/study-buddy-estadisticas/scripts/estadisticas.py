"""Lee los contadores de visitas de Study Buddy y los imprime como tablas en Markdown.

Uso: python estadisticas.py [carpeta-del-proyecto] [curso]
Los contadores están en Abacus (abacus.jasoncameron.dev), espacio "study-buddy-inmaglez".
Las claves se forman igual que claveVisita() en js/app.js: <curso>_<partes de la ruta unidas por _>.
"""
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# Por defecto, la raíz del repositorio (este script está en .claude/skills/<skill>/scripts/)
PROYECTO = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[4])
CURSO = sys.argv[2] if len(sys.argv) > 2 else "y7"
URL = "https://abacus.jasoncameron.dev/get/study-buddy-inmaglez/"


def clave(*partes):
    texto = "_".join([CURSO, *(partes or ["inicio"])])
    return re.sub(r"[^A-Za-z0-9_.-]", "-", texto)[:64]


def leer(k):
    # El servicio admite 30 peticiones cada 10 s y a veces se queda colgado:
    # tiempo de espera corto y varios reintentos.
    for _ in range(4):
        try:
            with urllib.request.urlopen(URL + k, timeout=6) as r:
                return json.load(r)["value"]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 0
            time.sleep(4 if e.code == 429 else 1)
        except Exception:
            time.sleep(1)
    return None


datos = PROYECTO / "data" / CURSO
curso = json.loads((datos / "curso.json").read_text(encoding="utf-8"))
asignaturas = []
for a in curso["asignaturas"]:
    f = datos / f"{a['id']}.json"
    temas = json.loads(f.read_text(encoding="utf-8")).get("temas", []) if f.exists() else []
    asignaturas.append({**a, "temas": temas})

examenes = [(e["id"], e["titulo"]) for e in curso.get("examenes", [])]
examenes += [(f"final-{a['id']}", f"{a['nombre']} — End-of-year exam")
             for a in asignaturas if any(t.get("preguntas") for t in a["temas"])]

RECURSOS = [("test", "Practice"), ("imprimir", "Print"), ("notas", "Notes"), ("tarjetas", "Flashcards")]
SUBTEMAS = [((), "Topic"), (("resumen",), "Notes"), (("tarjetas",), "Flashcards"), (("test",), "Quiz")]
PRINCIPALES = [((), "Home"), (("examenes",), "Exams"), (("finales",), "End of year"), (("progreso",), "Progress")]

claves = {"total"} | {clave(*p) for p, _ in PRINCIPALES}
claves |= {clave("examenes", i, r) for i, _ in examenes for r, _ in RECURSOS}
for a in asignaturas:
    claves.add(clave("a", a["id"]))
    claves |= {clave("a", a["id"], "t", t["id"], *p) for t in a["temas"] for p, _ in SUBTEMAS}

# Tres a la vez: tarda un par de minutos sin pasarse del límite.
orden = sorted(claves)
with ThreadPoolExecutor(3) as ex:
    v = dict(zip(orden, ex.map(leer, orden)))

n = lambda k: "?" if v[k] is None else str(v[k])
suma = lambda ks: sum(v[k] or 0 for k in ks)

print(f"## Study Buddy · {CURSO}\n")
print(f"**Total visits:** {n('total')}  ")
print(" · ".join(f"{nombre}: {n(clave(*p))}" for p, nombre in PRINCIPALES))

print("\n## Exams\n")
print("| Exam | " + " | ".join(r for _, r in RECURSOS) + " | Total |")
print("|---|" + "---:|" * (len(RECURSOS) + 1))
for i, titulo in examenes:
    ks = [clave("examenes", i, r) for r, _ in RECURSOS]
    print(f"| {titulo} | " + " | ".join(n(k) for k in ks) + f" | **{suma(ks)}** |")

print("\n## Subjects and topics\n")
for a in asignaturas:
    if not a["temas"]:
        continue
    filas = []
    for t in a["temas"]:
        ks = [clave("a", a["id"], "t", t["id"], *p) for p, _ in SUBTEMAS]
        filas.append((t["titulo"], ks))
    total = suma([k for _, ks in filas for k in ks])
    print(f"### {a['nombre']} — subject page {n(clave('a', a['id']))}, topics {total}\n")
    print("| Topic | " + " | ".join(s for _, s in SUBTEMAS) + " | Total |")
    print("|---|" + "---:|" * (len(SUBTEMAS) + 1))
    for titulo, ks in filas:
        print(f"| {titulo} | " + " | ".join(n(k) for k in ks) + f" | **{suma(ks)}** |")
    print()

fallos = sum(1 for x in v.values() if x is None)
if fallos:
    print(f"\n⚠ {fallos} contadores no se pudieron leer (?).")
