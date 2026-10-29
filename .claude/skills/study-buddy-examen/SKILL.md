---
name: study-buddy-examen
description: Convierte fotos de un libro o de un examen del cole (HEIC del iPhone, JPG o PNG) en contenido para la web Study Buddy (notas visuales, tarjetas, banco de 60+ preguntas y examen con fecha) y lo publica en GitHub Pages. Úsalo siempre que Inma pase fotos de un tema o examen y diga de qué asignatura es ("te paso las fotos del examen de History", "ahora el de science del 20/11", "añade este tema a Study Buddy", "mete estas fotos en la web de exámenes"), aunque no mencione "Study Buddy", "skill" ni "web". También para añadir un examen o una fecha nueva, o una asignatura o curso nuevo a esa web.
---

# Study Buddy: de fotos del libro a la web

Study Buddy es una web estática de repaso para un colegio **británico**:
- **Carpeta**: la raíz de este repositorio. Se trabaja igual en el PC (carpeta `Preparar-Exámenes`) que en la nube (Claude Code web, desde el móvil).
- **Web publicada**: https://inmaglez-creator.github.io/study-buddy/
- **Repositorio**: `inmaglez-creator/study-buddy` (público), rama `main`

**En la nube** (las fotos llegan adjuntas al chat desde el móvil) cambian tres cosas, que se indican en cada paso: no hay navegador para probar la web, no está la carpeta privada `fuentes-informacion/` y hay que llevar los cambios a `main` para que la web se actualice.

Cada examen de la web ofrece 4 recursos (Practice online, Print PDF, Notes, Flashcards) y alimenta el **End-of-year exam** de su asignatura. Todo sale de los temas de `data/`, así que el trabajo consiste en escribir buenos temas.

Antes de empezar, lee el `CLAUDE.md` de la carpeta. Contiene el formato exacto de los JSON y las reglas de contenido. Si algo de este skill contradice el `CLAUDE.md`, manda el `CLAUDE.md`, porque es el que se mantiene al día con el código.

## 1. Qué hace falta saber

- **Asignatura**: la dice el usuario. Si las fotos no cuadran con lo que dice (ya pasó: dijo "Science" y era un libro de Maths), **para y pregunta** antes de generar nada. Un banco de 60 preguntas de la asignatura equivocada es mucho trabajo tirado.
- **Fecha del examen** (AAAA-MM-DD). Si no la dice, pregúntala; si no la sabe, se crea el tema sin examen.
- **Curso**: por defecto `y7`. Si es otro, mira `data/cursos.json` y crea la carpeta del curso si no existe.

## 2. Convertir y leer las fotos

Las fotos del iPhone vienen en HEIC y no se pueden leer directamente. Conviértelas a JPG en el scratchpad con el script del skill, pasándole las rutas de las fotos:

```bash
python .claude/skills/study-buddy-examen/scripts/convertir_fotos.py "<scratchpad>/fotos-<asignatura>" "<foto1.heic>" "<foto2.heic>" ...
```

El script instala `pillow-heif` si falta (`pip install --user pillow-heif`). No lo ejecutes con `python -I`, porque así no ve los paquetes instalados con `--user`. Después lee **todas** las JPG. Las preguntas tienen que salir solo de lo que aparece en las fotos, y una foto sin leer es contenido que falta.

Mientras lees, apunta:
- **La estructura del libro**: unidades y apartados (1.1, 1.2…). Normalmente, un apartado o unidad es un tema.
- **Los "Key words"**, los ejemplos resueltos, los ejercicios y el "Check your Progress". Los ejercicios son una mina de preguntas, pero en las fotos no vienen las soluciones: **calcúlalas tú y compruébalas**.
- **Los errores en lo que ha escrito el alumno**. Si hay respuestas marcadas como correctas que no lo son, usa la versión correcta y avisa al usuario. Por ejemplo, en la tabla de cuadriláteros de Maths había varios fallos con ✓.
- **Las páginas que faltan**, por ejemplo cuando se salta una página de introducción. Menciónalo en el resumen final.

## 3. Escribir el contenido

Escribe en el archivo de la asignatura, `data/<curso>/<asignatura>.json`, **añadiendo** temas sin borrar los que ya hay: el banco de fin de curso depende de que se acumulen. Si un tema ya existe (mismo apartado del libro), amplíalo en lugar de duplicarlo.

**Idioma**: inglés británico. Solo `lengua` y `conocimiento-medio` van en español.

Para cada tema:
- **`resumen`**: texto corto. Sirve de respaldo.
- **`notas`**: notas **visuales**, que son lo que más se ve. Se organizan en bloques con título, y cada bloque lleva tarjetas con `etiqueta` (emoji y palabra), `titulo` y 2–4 `puntos` cortos con los ejemplos y los números del libro. Usa `chips` para listas rápidas: vocabulario, pasos, órdenes de cosas, partes de algo. Una tarjeta por concepto; si tiene más de 4 puntos, conviene partirla.
- **`tarjetas`**: 8–12 por tema, con respuestas cortas.
- **`preguntas`**:
  - **Cantidad**: el examen completo debe sumar **60 o más**, repartidas entre sus temas (unas 15–20 por tema).
  - **Tipos**: la mayoría de opción múltiple (`opcion`, 4 opciones), algunas de verdadero/falso (`vf`) y 2 de respuesta corta (`corta`) por tema.
  - **Explicación**: cada pregunta lleva una `explicacion` de una frase.
  - **Opciones**: la app baraja el orden, así que da igual en qué posición pongas la correcta.
  - **Respuestas cortas**: pon muchas `claves`, incluidos sinónimos y raíces ("mitochondri" acepta mitochondria y mitochondrion). Usa `minimo` cuando se piden varias cosas ("Name TWO…"). Las claves numéricas se comparan como número completo. Evita palabras clave que también encajen en una respuesta mal planteada: por ejemplo, "no cell wall" no lo detecta si el alumno escribe "doesn't have a cell wall"; mejor usar "wall".
- **Calidad**: nivel de la edad (Y7 son 11–12 años) y estilo de examen británico. Los distractores deben ser plausibles, no absurdos.

**Antes de crear un examen nuevo**, mira si ya está apuntado en `curso.json` con `"temas": []`. Los exámenes próximos se apuntan en cuanto se conocen, y en la web salen como "Revision materials coming soon". Si ya está, no lo dupliques: rellena su lista de `temas` con los ids de los temas nuevos y corrige la fecha si hace falta. Con la lista vacía, el examen incluiría todos los temas de la asignatura.

Si no está, añádelo a `data/<curso>/curso.json`, dentro de `examenes`:
```json
{ "id": "<asignatura>-<tema-corto>", "asignatura": "<id>", "titulo": "<Subject> test · <Unit…>", "fecha": "AAAA-MM-DD", "temas": ["<ids de los temas>"] }
```
Si la asignatura no existe en `curso.json`, añádela con su `id`, `nombre`, `icono` y `color`, y crea su JSON.

## 4. Comprobar

1. Ejecuta `python herramientas/validar.py` y corrige todo lo que señale.
2. Cuenta las preguntas por tema y por tipo con un pequeño script, y confirma que el examen suma 60 o más.
3. Prueba la web en local: `python -m http.server <puerto>` lanzado **desde la carpeta del proyecto** (ejecutado en segundo plano). Ábrela en el navegador integrado y comprueba que se ven las notas del examen (pestañas y bloques) y que el test en modo Exam saca 20 preguntas.
   - **Si ves contenido antiguo**, revisa dos cosas: que no haya otro servidor en ese puerto sirviendo otra carpeta, y que el navegador no esté usando la caché (fuerza la recarga con `fetch(..., {cache: 'reload'})`).
   - **En la nube**, sin navegador: con el servidor en marcha, comprueba con `curl` que `index.html` y el JSON nuevo responden 200, y fíate de `validar.py` y del recuento.

## 5. Publicar

El usuario ya ha autorizado publicar el contenido de los exámenes en este repositorio.

```bash
git add -A
git commit -m "Add <Subject> <unit> (<fecha>)"
git push
```

Termina el mensaje del commit con la línea de co-autoría que indique el sistema. Después espera a que Pages reconstruya la web: `gh api repos/inmaglez-creator/study-buddy/pages --jq .status` debe dar `built`. Comprueba con `curl` que el JSON nuevo responde 200.

**En la nube** la sesión trabaja en una rama propia. Haz el commit en esa rama y después intenta llevarlo a `main` (`git push origin HEAD:main`). Si no te deja, abre una PR hacia `main` y dile a Inma que la fusione en GitHub (botón «Merge»). La web no cambia hasta que el cambio esté en `main`.

Nunca subas al repositorio de la web (que es **público**) `y6_sats_landing_3.html`, las fotos ni nada de `.claude/` salvo `.claude/skills/`. Tampoco escribas en los skills rutas del PC ni datos personales.

### Guardar las fuentes (repositorio privado)

Las fotos y listas de "lo que entra" se guardan en el repositorio **privado** `inmaglez-creator/study-buddy-fuentes`, clonado en la subcarpeta `fuentes-informacion/` del proyecto (ignorada por el repo de la web):

1. Copia las JPG convertidas (y las imágenes que lleguen por el chat) a `fuentes-informacion/year-<n>/<asignatura>/<AAAA-MM-DD>_<examen>/`, numeradas en orden. Si hay una lista de lo que entra, guárdala como `what-to-study.txt`.
2. Añade una fila a la tabla de `fuentes-informacion/README.md`.
3. Desde `fuentes-informacion/`: `git add -A`, commit y `git push`.

Nunca hagas público ese repositorio: tiene páginas con derechos de autor y trabajo de la alumna.

**En la nube** `fuentes-informacion/` no existe: no guardes las fotos en ningún otro sitio (y menos en el repositorio de la web). Avisa a Inma en el resumen final de que las fuentes de ese examen quedan pendientes de guardar desde el PC.

## 6. Contar el resultado

Responde en español, breve:
- **Qué se ha añadido**: una tabla con tema, número de preguntas y número de tarjetas, más el total.
- **Avisos**: errores encontrados en el libro o en lo que escribió el alumno, páginas que faltan, y preguntas que no salen directamente de las fotos.
- **Enlace**: https://inmaglez-creator.github.io/study-buddy/ (se actualiza en 1–2 minutos).
