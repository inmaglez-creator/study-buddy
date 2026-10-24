# Study Buddy

Web estática (HTML + CSS + JS sin dependencias ni compilación) para preparar exámenes desde el móvil. Se publica en GitHub Pages. El contenido vive en `data/` como JSON.

**Idioma**: es para un colegio británico. La interfaz y todo el contenido van en **inglés británico**, salvo las asignaturas del currículo español (`lengua` y `conocimiento-medio`), cuyo contenido va en español.

## Estructura

- `data/cursos.json` — lista de cursos (`id`, `nombre`). El `id` es el nombre de la carpeta en `data/`.
- `data/<curso>/curso.json` — asignaturas (`id`, `nombre`, `icono`, `color`) y exámenes (`id`, `asignatura`, `titulo`, `fecha` AAAA-MM-DD, `temas` opcional: lista de ids de tema; vacío = toda la asignatura).
- `data/<curso>/<asignatura>.json` — `{ "temas": [...] }`. Cada tema:
  - `id` (kebab-case, único en la asignatura), `titulo`
  - `resumen`: lista de líneas. Admite `## Subtítulo`, `- viñeta`, `**negrita**`, `*cursiva*`; línea vacía `""` separa párrafos.
  - `notas`: **notas visuales** (como las de Y6): lista de bloques `{ "seccion": título, "tarjetas": [{ "etiqueta": "emoji + palabra", "titulo", "puntos": [frases cortas] }], "chips": { "titulo", "items": [...] } }`. Admiten `**negrita**`. Puntos cortos y concretos, con ejemplos y números del libro. Se ven en Notes con una pestaña por tema. Si no hay `notas`, se muestra el `resumen`.
  - `tarjetas`: `[{ "p": pregunta, "r": respuesta }]` — el texto de `p` se usa como clave del progreso; no cambiarlo sin motivo.
  - `preguntas`: `{ "tipo": "opcion", "enunciado", "opciones": [...], "correcta": índice desde 0, "explicacion" }` , `{ "tipo": "vf", "enunciado", "correcta": true|false, "explicacion" }` o respuesta corta `{ "tipo": "corta", "enunciado", "pista" (opcional), "claves": [palabras clave], "minimo" (opcional, nº de claves que debe contener; por defecto 1), "modelo": respuesta modelo, "explicacion" }`. La corta se corrige buscando las claves en la respuesta (sin distinguir mayúsculas ni tildes); al corregir se muestra la respuesta modelo y el alumno puede marcar "My answer was right too".
- El progreso del alumno se guarda en `localStorage` del dispositivo (clave `progreso:<curso>`).

## Cómo convertir fotos del libro en un tema

1. Leer todas las fotos y transcribir el contenido. Escribir en inglés británico (en español solo para Lengua y Conocimiento del Medio).
2. Resumen: claro y breve, nivel del curso (Y7 ≈ 11-12 años), con subtítulos y viñetas; palabras clave en negrita.
3. 8–15 tarjetas: definiciones, fechas, vocabulario, fórmulas. Respuestas cortas.
4. Banco de preguntas: **mínimo 60 por examen**, repartidas de forma equilibrada entre sus temas. Mayoría `opcion` (4 opciones), `vf` donde encaje y alguna `corta` (≈10–15 %) para preguntas abiertas. En las cortas, poner muchas claves (sinónimos, singular/plural, raíces como "rubbish", "rat") y `minimo: 2` si se piden dos cosas; la pista orienta sin dar la respuesta. Variar la posición de la correcta (la app las baraja igualmente). Cada una con `explicacion` de una frase. Solo sobre lo que aparece en las fotos. Estilo de examen británico, adaptado a la edad.

## Cada examen tiene 4 recursos

Igual que el hub de Y6 SATs: **▶ Practice online** (test), **🖨 Print PDF** (hoja imprimible con 20 preguntas al azar, casillas, líneas para respuestas cortas y *answer key* en página aparte; se imprime/guarda como PDF desde el navegador — no funciona dentro de la vista previa de claude.ai, sí en GitHub Pages), **📖 Notes** (resúmenes de todos los temas del examen) y **🃏 Flashcards**. Todo sale de los temas: no hay que crear nada aparte por recurso.

## Banco general y examen de fin de curso

- Los temas de cada examen se añaden como temas **de la asignatura** (no del examen). Así cada examen alimenta el banco general de la asignatura.
- Cada asignatura con preguntas tiene automáticamente un **End-of-year exam** (`#/examenes/final-<asignatura>`) que usa todos sus temas, con los mismos 4 recursos. No se apunta en `curso.json`.
- Al añadir un examen pasado, se añade igualmente (con su fecha) para que su contenido entre en el banco.

## Cómo funcionan los tests

- Cada sesión saca **20 preguntas al azar** del banco (`PREGUNTAS_POR_TEST` en `js/app.js`), repartidas por igual entre los temas.
- Opciones en orden aleatorio en cada pregunta.
- Dos modos: **Practice** (corrige cada pregunta al momento) y **Exam** (todas a la vez, botón *Submit* al final; avisa de las no contestadas).
- Al acabar: nota, repaso de fallos con explicación, nuevas preguntas al azar o practicar solo los fallos.
5. Añadir el tema al JSON de la asignatura (crear la asignatura en `curso.json` si no existe) y, si el usuario da la fecha, el examen en `curso.json`.
6. Ejecutar `python herramientas/validar.py` y corregir lo que diga.
7. Borrar el contenido marcado `(EJEMPLO)` cuando haya contenido real.

## Probar en local

`python -m http.server 8765` y abrir http://localhost:8765 (no funciona abriendo `index.html` directamente, por el `fetch` de los JSON).

## Fuentes de información

Las fotos y listas de cada examen están en el repositorio **privado** `inmaglez-creator/study-buddy-fuentes`, clonado en `fuentes-informacion/` (ignorado aquí). Estructura: `year-<n>/<asignatura>/<AAAA-MM-DD>_<examen>/`. No subir nunca esas fotos a este repositorio, que es público.

## Secciones de la web

Inicio · **Exams** (exámenes en curso y pasados) · **End of year** (`#/finales`: un examen global por asignatura con todo su banco) · Progress.

## Contador de visitas y estadísticas

- Cada página muestra abajo sus visitas y las totales. Se cuentan con **Abacus** (`abacus.jasoncameron.dev`, gratis y sin cuenta), espacio `study-buddy-inmaglez`; en local se usa `study-buddy-local`. Clave de cada página: `claveVisita()` en `js/app.js` (`<curso>_<ruta con _>`), más `total`. Una visita por página y sesión del navegador.
- Página oculta **`#/estadisticas`**: tablas de visitas por examen/recurso y por tema, y botón para no contar las visitas de ese dispositivo. No está enlazada; no tiene contraseña.
- Abacus admite 30 peticiones cada 10 s: leer contadores en masa siempre despacio (3 a la vez como máximo).
- Al cambiar el CSS o el JS, subir el número `?v=` en `index.html` para que los navegadores no usen la versión antigua.

## Textos de lectura

Si las preguntas de un tema se basan en un texto, el tema lleva `texto`: `{ "titulo", "intro" (opcional), "parrafos": [...], "fuente", "glosario": [...] (opcional) }`. Se muestra abierto antes del test, las flashcards, las notas y en la hoja imprimible, y plegado ("Show the text") durante el test. **Derechos de autor**: los textos con copyright (novelas modernas, etc.) se resumen con nuestras palabras, indicando la página del libro; solo se transcriben completos los de dominio público.
