"""Comprueba que los archivos de data/ tienen el formato correcto.

Uso:  python herramientas/validar.py
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent / "data"
errores = []


def error(archivo, msg):
    errores.append(f"{archivo}: {msg}")


def cargar(ruta):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError:
        error(ruta, "no existe")
    except json.JSONDecodeError as e:
        error(ruta, f"JSON no válido (línea {e.lineno}, columna {e.colno}): {e.msg}")
    return None


def validar_tema(ruta, t, n):
    donde = f"tema {n} ({t.get('id', '¿sin id?')})"
    for campo in ("id", "titulo"):
        if not t.get(campo):
            error(ruta, f"{donde}: falta '{campo}'")
    for k, sec in enumerate(t.get("notas", []), 1):
        if not (sec.get("tarjetas") or sec.get("chips", {}).get("items")):
            error(ruta, f"{donde}, bloque de notas {k}: necesita 'tarjetas' o 'chips.items'")
        for j, n in enumerate(sec.get("tarjetas", []), 1):
            if not (n.get("titulo") or n.get("puntos")):
                error(ruta, f"{donde}, bloque de notas {k}, tarjeta {j}: necesita 'titulo' o 'puntos'")
    for k, c in enumerate(t.get("tarjetas", []), 1):
        if not c.get("p") or not c.get("r"):
            error(ruta, f"{donde}, tarjeta {k}: necesita 'p' y 'r'")
    for k, q in enumerate(t.get("preguntas", []), 1):
        sitio = f"{donde}, pregunta {k}"
        if not q.get("enunciado"):
            error(ruta, f"{sitio}: falta 'enunciado'")
        if q.get("tipo") == "vf":
            if not isinstance(q.get("correcta"), bool):
                error(ruta, f"{sitio}: en verdadero/falso 'correcta' debe ser true o false")
        elif q.get("tipo") == "opcion":
            ops = q.get("opciones", [])
            if len(ops) < 2:
                error(ruta, f"{sitio}: necesita al menos 2 opciones")
            if not isinstance(q.get("correcta"), int) or not 0 <= q["correcta"] < len(ops):
                error(ruta, f"{sitio}: 'correcta' debe ser la posición de la opción buena (empieza en 0)")
        elif q.get("tipo") == "corta":
            claves = q.get("claves", [])
            if not claves or not all(isinstance(k, str) and k.strip() for k in claves):
                error(ruta, f"{sitio}: en respuesta corta 'claves' debe ser una lista de palabras clave")
            if not q.get("modelo"):
                error(ruta, f"{sitio}: en respuesta corta falta 'modelo' (respuesta modelo)")
            minimo = q.get("minimo", 1)
            if not isinstance(minimo, int) or not 1 <= minimo <= len(claves or [1]):
                error(ruta, f"{sitio}: 'minimo' debe ser un número entre 1 y el número de claves")
        else:
            error(ruta, f"{sitio}: 'tipo' debe ser 'opcion', 'vf' o 'corta'")


cursos = cargar(RAIZ / "cursos.json") or {"cursos": []}
for c in cursos["cursos"]:
    carpeta = RAIZ / c["id"]
    ruta_curso = carpeta / "curso.json"
    curso = cargar(ruta_curso)
    if not curso:
        continue
    temas_por_asig = {}
    for a in curso.get("asignaturas", []):
        ruta = carpeta / f"{a['id']}.json"
        datos = cargar(ruta) or {}
        ids = set()
        for n, t in enumerate(datos.get("temas", []), 1):
            validar_tema(ruta, t, n)
            if t.get("id") in ids:
                error(ruta, f"id de tema repetido: {t['id']}")
            ids.add(t.get("id"))
        temas_por_asig[a["id"]] = ids
    ids_examen = set()
    for e in curso.get("examenes", []):
        sitio = f"examen '{e.get('id', '¿sin id?')}'"
        if e.get("id") in ids_examen:
            error(ruta_curso, f"{sitio}: id repetido")
        ids_examen.add(e.get("id"))
        if e.get("asignatura") not in temas_por_asig:
            error(ruta_curso, f"{sitio}: asignatura '{e.get('asignatura')}' no existe")
            continue
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", e.get("fecha", "")):
            error(ruta_curso, f"{sitio}: la fecha debe ser AAAA-MM-DD")
        for t in e.get("temas", []):
            if t not in temas_por_asig[e["asignatura"]]:
                error(ruta_curso, f"{sitio}: el tema '{t}' no existe en {e['asignatura']}")

if errores:
    print("Se han encontrado problemas:\n")
    print("\n".join(f"  - {e}" for e in errores))
    sys.exit(1)
print("Todo correcto ✔")
