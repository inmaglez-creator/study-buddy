# 📚 Exam Prep

**Web:** https://inmaglez-creator.github.io/exam-prep/

Para compartirla, basta con mandar ese enlace. No hace falta cuenta ni contraseña, y cada persona guarda su propio progreso en su móvil u ordenador.

Web para preparar los exámenes desde el móvil. La web y el contenido están en inglés (colegio británico), salvo Lengua y Conocimiento del Medio, que van en español. Por cada asignatura y tema tiene:

- **📖 Resumen** del tema
- **🃏 Tarjetas de repaso**: pregunta por un lado y respuesta por el otro; las que no sabes vuelven a salir.
- **📝 Tests** de opción múltiple y de verdadero/falso, con nota y corrección. También hay tests de toda la asignatura y de cada examen.
- **📅 Exámenes** con cuenta atrás.
- **📈 Progreso** por tema. Se guarda en el propio móvil.

Sirve para varios cursos: se elige el curso arriba a la derecha.

## Publicarla en GitHub Pages (una sola vez)

1. En GitHub, crea un repositorio nuevo (por ejemplo `estudia`).
2. Sube todos los archivos de esta carpeta: **Add file → Upload files**, o con git.
3. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` y pulsa **Save**.
4. Al cabo de un minuto la web estará en `https://<tu-usuario>.github.io/estudia/`.
5. En el móvil, abre esa dirección y añádela a la pantalla de inicio: **Compartir → Añadir a pantalla de inicio** en iPhone, o **⋮ → Añadir a pantalla de inicio** en Android.

Cada vez que subas un cambio a GitHub, la web se actualiza sola en uno o dos minutos.

## Añadir contenido

Todo el contenido está en la carpeta `data/`, en archivos de texto JSON:

```
data/
  cursos.json               ← lista de cursos
  y7/
    curso.json              ← asignaturas y fechas de examen de Year 7
    science.json            ← temas de Science (resumen, tarjetas, preguntas)
    maths.json
    ...
```

- **Con Claude**: pásale las fotos de las páginas del libro y dile de qué asignatura son (y la fecha del examen, si la sabes). El archivo `CLAUDE.md` le explica cómo hacerlo.
- **Con otra IA**: dale las fotos, el archivo `CLAUDE.md` y `data/y7/science.json` como ejemplo, y pídele un tema con el mismo formato.
- **A mano**: copia el tema de ejemplo de `data/y7/science.json` y cambia los textos. En las preguntas de opción, `"correcta"` es la posición de la respuesta buena empezando por **0**.

Después de editar, comprueba que no haya errores:

```bash
python herramientas/validar.py
```

### Añadir un examen

En `data/y7/curso.json`, dentro de `"examenes"`:

```json
{ "id": "maths-fractions", "asignatura": "maths", "titulo": "Fractions test", "fecha": "2026-11-20", "temas": ["fractions"] }
```

Si dejas `"temas": []`, el examen incluye toda la asignatura.

### Añadir otro curso

1. Añade el curso a `data/cursos.json`: `{ "id": "y8", "nombre": "Year 8" }`.
2. Copia la carpeta `data/y7` como `data/y8` y cambia su `curso.json`.

## Probarla en el ordenador

La web no funciona abriendo `index.html` con doble clic. Hay que servirla:

```bash
python -m http.server 8765
```

y abrir http://localhost:8765.
