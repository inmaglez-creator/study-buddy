---
name: study-buddy-estadisticas
description: Consulta las visitas de la web Study Buddy (contador por página, examen, recurso y tema) y las resume en español. Úsalo siempre que Inma pregunte por visitas, estadísticas, uso o quién está usando Study Buddy ("¿cuántas visitas tiene la web?", "dame las estadísticas", "¿qué examen se usa más?", "¿lo están usando mis amigas?", "¿cuánto ha estudiado la gente el de History?"), aunque no diga "Study Buddy" ni "skill". También si pregunta dónde está la página de estadísticas o cómo dejar de contar sus propias visitas.
---

# Study Buddy: estadísticas de visitas

La web https://inmaglez-creator.github.io/study-buddy/ cuenta las visitas con **Abacus** (servicio gratuito sin cuenta, `abacus.jasoncameron.dev`, espacio `study-buddy-inmaglez`). Cada página suma **una visita por sesión del navegador**. Las visitas desde `localhost` van a otro espacio (`study-buddy-local`) y no cuentan.

Las claves de los contadores se forman como `claveVisita()` en `js/app.js`: `<curso>_<ruta con _>` (por ejemplo `y7_examenes_maths-section-1_test`, `y7_a_history_t_battle-of-hastings_resumen`, `y7_inicio`), y existe además el contador `total`. Si cambia `claveVisita()` o las rutas, actualiza `scripts/estadisticas.py`.

## Cómo responder

1. Ejecuta el script desde la raíz del repositorio (en el PC o en la nube). Lee los JSON del proyecto para saber qué páginas existen y consulta todos los contadores:
   ```bash
   python .claude/skills/study-buddy-estadisticas/scripts/estadisticas.py . y7
   ```
   Si hay más cursos en `data/cursos.json`, ejecútalo para cada uno. Tarda 2–3 minutos (el servicio limita a 30 peticiones cada 10 s), así que lánzalo en segundo plano. Un `?` significa que el contador no se pudo leer; si salen todos así, el servicio está caído o la red lo bloquea: dilo.
2. **Responde en español, breve.** Primero el total y lo que destaca: qué exámenes y recursos se usan más, qué temas no ha mirado nadie, y si hay un examen próximo con pocas visitas. Después, solo si las pide o son útiles, las tablas. No pegues tablas llenas de ceros: resume ("ningún tema de German tiene visitas todavía").
3. Recuerda que **se cuentan sesiones, no personas**, y que sus propias visitas suman salvo que haya pulsado "Don't count my visits on this device" en ese dispositivo.

## Página de estadísticas en la web

Inma también puede verlas ella misma en **https://inmaglez-creator.github.io/study-buddy/#/estadisticas**. Esa página no está enlazada en la web, pero no tiene contraseña: cualquiera que lea el código en GitHub podría encontrarla. Solo muestra números, sin datos personales. Al final de la página está el botón para que no cuenten las visitas de ese dispositivo.

Si quiere estadísticas privadas con contraseña y por días, la alternativa es **GoatCounter** (gratis). Tendría que crearse ella la cuenta; después se añade su script a `index.html`.
