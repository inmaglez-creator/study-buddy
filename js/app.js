'use strict';

const app = document.getElementById('app');
const selectorCurso = document.getElementById('selector-curso');
const estado = { cursos: [], curso: null };

// ---------- Utilidades ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
}

function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

async function cargarJSON(ruta) {
  const r = await fetch(ruta, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${ruta} (${r.status})`);
  return r.json();
}

const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

// Markdown mínimo para los resúmenes: "## título", "- lista", "**negrita**", "*cursiva*".
function markdown(texto) {
  const lineas = (Array.isArray(texto) ? texto.join('\n') : String(texto ?? '')).split('\n');
  let html = '';
  let parrafo = [];
  let enLista = false;
  const cerrarParrafo = () => {
    if (parrafo.length) html += `<p>${inline(parrafo.join(' '))}</p>`;
    parrafo = [];
  };
  const cerrarLista = () => {
    if (enLista) html += '</ul>';
    enLista = false;
  };
  for (const bruta of lineas) {
    const l = bruta.trim();
    if (l.startsWith('## ')) {
      cerrarParrafo(); cerrarLista();
      html += `<h3>${inline(l.slice(3))}</h3>`;
    } else if (/^[-•] /.test(l)) {
      cerrarParrafo();
      if (!enLista) { html += '<ul>'; enLista = true; }
      html += `<li>${inline(l.slice(2))}</li>`;
    } else if (!l) {
      cerrarParrafo(); cerrarLista();
    } else {
      cerrarLista();
      parrafo.push(l);
    }
  }
  cerrarParrafo(); cerrarLista();
  return html;
}

// ---------- Fechas ----------

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const diasHasta = iso => Math.round((fecha(iso) - hoy()) / 86400000);
const fmtFecha = iso => fecha(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- Datos ----------

const asignatura = id => estado.curso.asignaturas.find(a => a.id === id);
const tema = (a, id) => a?.temas.find(t => t.id === id);
// El examen de fin de curso de cada asignatura no se apunta en curso.json:
// junta todos los temas (y por tanto todo el banco de preguntas) de la asignatura.
const PREFIJO_FINAL = 'final-';

const examenFinal = a => ({
  id: PREFIJO_FINAL + a.id,
  asignatura: a.id,
  titulo: `${a.nombre} — End-of-year exam`,
  final: true,
  temas: [],
});

function examen(id) {
  const real = (estado.curso.examenes || []).find(e => e.id === id);
  if (real) return real;
  const a = id.startsWith(PREFIJO_FINAL) ? asignatura(id.slice(PREFIJO_FINAL.length)) : null;
  return a ? examenFinal(a) : undefined;
}

const examenesOrdenados = () => [...(estado.curso.examenes || [])]
  .filter(e => asignatura(e.asignatura))
  .sort((x, y) => x.fecha.localeCompare(y.fecha));

function temasDeExamen(e) {
  const a = asignatura(e.asignatura);
  if (!e.temas?.length) return a.temas;
  return e.temas.map(id => tema(a, id)).filter(Boolean);
}

const tieneNotas = t => Boolean(t.notas?.length || t.resumen);

const preguntasDe = (temas) => temas.flatMap(t => t.preguntas || []);

const tarjetasDe = (a, temas) => temas.flatMap(t =>
  (t.tarjetas || []).map(c => ({ ...c, asig: a.id, tema: t.id }))
);

async function cargarCursos() {
  estado.cursos = (await cargarJSON('data/cursos.json')).cursos;
  selectorCurso.innerHTML = estado.cursos
    .map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
}

async function cambiarCurso(id) {
  const curso = await cargarJSON(`data/${id}/curso.json`);
  curso.asignaturas = await Promise.all(curso.asignaturas.map(async a => {
    try {
      const datos = await cargarJSON(`data/${id}/${a.id}.json`);
      return { ...a, temas: datos.temas || [] };
    } catch (e) {
      console.warn(e);
      return { ...a, temas: [] };
    }
  }));
  estado.curso = curso;
  selectorCurso.value = id;
  guardar('cursoActivo', id);
}

// ---------- Progreso (se guarda en este dispositivo) ----------

const claveProgreso = () => `progreso:${estado.curso.id}`;

function progresoTema(asigId, temaId) {
  const p = leer(claveProgreso()) || {};
  return { leido: false, sabidas: [], mejorNota: null, ...(p[asigId]?.[temaId]) };
}

function actualizarTema(asigId, temaId, cambio) {
  const p = leer(claveProgreso()) || {};
  const t = { leido: false, sabidas: [], mejorNota: null, ...(p[asigId]?.[temaId]) };
  cambio(t);
  p[asigId] = { ...(p[asigId] || {}), [temaId]: t };
  guardar(claveProgreso(), p);
}

function porcentajeTema(a, t) {
  const p = progresoTema(a.id, t.id);
  const partes = [];
  if (tieneNotas(t)) partes.push(p.leido ? 1 : 0);
  if (t.tarjetas?.length) partes.push(t.tarjetas.filter(c => p.sabidas.includes(c.p)).length / t.tarjetas.length);
  if (t.preguntas?.length) partes.push((p.mejorNota ?? 0) / 100);
  if (!partes.length) return 0;
  return Math.round(partes.reduce((s, x) => s + x, 0) / partes.length * 100);
}

function porcentajeAsignatura(a) {
  if (!a.temas.length) return 0;
  return Math.round(a.temas.reduce((s, t) => s + porcentajeTema(a, t), 0) / a.temas.length);
}

// ---------- Piezas de interfaz ----------

const barra = pct => `<div class="barra"><i style="width:${pct}%"></i></div>`;
const volver = (href, texto) => `<a class="volver" href="${href}">← ${esc(texto)}</a>`;

function cuenta(d) {
  if (d < 0) return '<div class="cuenta"><b>✓</b><small>done</small></div>';
  if (d === 0) return '<div class="cuenta hoy"><b>TODAY</b><small>good luck!</small></div>';
  return `<div class="cuenta ${d <= 7 ? 'pronto' : ''}"><b>${d}</b><small>${d === 1 ? 'day' : 'days'}</small></div>`;
}

function tarjetaExamen(e) {
  const a = asignatura(e.asignatura);
  const temas = temasDeExamen(e);
  const nPreguntas = preguntasDe(temas).length;
  const hayTarjetas = tarjetasDe(a, temas).length > 0;
  const hayNotas = temas.some(tieneNotas);
  const activo = condicion => condicion ? '' : 'desactivado';
  const base = `#/examenes/${esc(e.id)}`;
  return `
    <div class="tarjeta examen" style="--c:${esc(a.color)}">
      <div class="fila">
        <div class="crece">
          <b>${e.final ? '🏆' : esc(a.icono)} ${esc(e.titulo || a.nombre)}</b>
          <div class="suave pequeño">${esc(a.nombre)} · ${e.final ? 'Everything from the year so far' : fmtFecha(e.fecha)}</div>
          <div class="pequeño suave">
            ${!temas.length ? '📷 Revision materials coming soon' : !e.final && temas.length <= 2
              ? `Topics: ${temas.map(t => esc(t.titulo.split(' · ').pop())).join(', ')}`
              : `${temas.length} ${temas.length === 1 ? 'topic' : 'topics'}`}
            ${temas.length ? `· ${nPreguntas} ${nPreguntas === 1 ? 'question' : 'questions'}` : ''}
          </div>
        </div>
        ${e.final ? '' : cuenta(diasHasta(e.fecha))}
      </div>
      <div class="acciones recursos">
        <a class="boton principal ${activo(nPreguntas)}" href="${base}/test">▶ Practice online</a>
        <a class="boton ${activo(nPreguntas)}" href="${base}/imprimir">🖨 Print PDF</a>
        <a class="boton ${activo(hayNotas)}" href="${base}/notas">📖 Notes</a>
        <a class="boton ${activo(hayTarjetas)}" href="${base}/tarjetas">🃏 Flashcards</a>
      </div>
    </div>`;
}

const listaDe = e => e.final ? '#/finales' : '#/examenes';

const finalesDisponibles = () => estado.curso.asignaturas.filter(a => preguntasDe(a.temas).length).map(examenFinal);

// ---------- Vistas ----------

function vistaInicio() {
  const proximos = examenesOrdenados().filter(e => diasHasta(e.fecha) >= 0).slice(0, 3);
  app.innerHTML = `
    <h1>${esc(estado.curso.nombre)}</h1>
    ${proximos.length ? `<h2>Upcoming exams</h2><div class="lista">${proximos.map(tarjetaExamen).join('')}</div>` : ''}
    <h2>Subjects</h2>
    <div class="rejilla">
      ${estado.curso.asignaturas.map(a => {
        const pct = porcentajeAsignatura(a);
        const n = a.temas.length;
        return `
          <a class="tarjeta asignatura" style="--c:${esc(a.color)}" href="#/a/${esc(a.id)}">
            <div class="icono">${esc(a.icono)}</div>
            <div class="nombre">${esc(a.nombre)}</div>
            <div class="suave pequeño">${n} ${n === 1 ? 'topic' : 'topics'}${n ? ` · ${pct}%` : ''}</div>
            ${barra(pct)}
          </a>`;
      }).join('')}
    </div>
    <h2>Parents</h2>
    <a class="tarjeta fila subir-fotos" href="#/upload">
      <div class="icono" aria-hidden="true">📷</div>
      <div class="crece">
        <div class="nombre">Send exam photos</div>
        <div class="suave pequeño">Upload photos of what the exam covers and we'll make the notes, flashcards and practice test. You'll need the access code.</div>
      </div>
    </a>`;
}

function vistaExamenes() {
  const todos = examenesOrdenados();
  const proximos = todos.filter(e => diasHasta(e.fecha) >= 0);
  const pasados = todos.filter(e => diasHasta(e.fecha) < 0).reverse();
  app.innerHTML = `
    <h1>Exams</h1>
    ${proximos.length
      ? `<div class="lista">${proximos.map(tarjetaExamen).join('')}</div>`
      : '<p class="vacio">No upcoming exams yet.</p>'}
    ${pasados.length ? `<h2>Past exams</h2><div class="lista">${pasados.map(tarjetaExamen).join('')}</div>` : ''}`;
}

function vistaFinales() {
  const finales = finalesDisponibles();
  app.innerHTML = `
    <h1>🏆 End-of-year exams</h1>
    <p class="suave">One exam per subject with everything from the year so far. Every topic you add goes into these question banks.</p>
    ${finales.length
      ? `<div class="lista">${finales.map(tarjetaExamen).join('')}</div>`
      : '<p class="vacio">No subjects with questions yet.</p>'}`;
}

function vistaAsignatura(a) {
  const examenes = examenesOrdenados().filter(e => e.asignatura === a.id && diasHasta(e.fecha) >= 0);
  const hayPreguntas = preguntasDe(a.temas).length > 0;
  app.innerHTML = `
    ${volver('#/', 'Home')}
    <h1>${esc(a.icono)} ${esc(a.nombre)}</h1>
    ${examenes.length ? `<div class="lista">${examenes.map(tarjetaExamen).join('')}</div>` : ''}
    <h2>Topics</h2>
    ${a.temas.length ? `
      <div class="lista" style="--c:${esc(a.color)}">
        ${a.temas.map((t, i) => {
          const pct = porcentajeTema(a, t);
          return `
            <a class="tarjeta" href="#/a/${esc(a.id)}/t/${esc(t.id)}">
              <div class="fila">
                <div class="crece"><b>${i + 1}. ${esc(t.titulo)}</b></div>
                <span class="etiqueta ${pct === 100 ? 'ok' : ''}">${pct}%</span>
              </div>
              ${barra(pct)}
            </a>`;
        }).join('')}
      </div>
      ${hayPreguntas ? `<h2>End-of-year exam</h2><div class="lista">${tarjetaExamen(examenFinal(a))}</div>` : ''}
    ` : '<p class="vacio">No topics yet.</p>'}`;
}

function vistaTema(a, t) {
  const p = progresoTema(a.id, t.id);
  const nTarjetas = t.tarjetas?.length || 0;
  const nSabidas = (t.tarjetas || []).filter(c => p.sabidas.includes(c.p)).length;
  const nPreguntas = t.preguntas?.length || 0;
  const base = `#/a/${esc(a.id)}/t/${esc(t.id)}`;
  app.innerHTML = `
    ${volver(`#/a/${esc(a.id)}`, a.nombre)}
    <h1>${esc(t.titulo)}</h1>
    <div class="lista">
      <a class="tarjeta modo ${tieneNotas(t) ? '' : 'desactivado'}" href="${base}/resumen">
        <span class="icono">📖</span>
        <div class="crece"><b>Notes</b><div class="estado">${tieneNotas(t) ? (p.leido ? 'Read ✓' : 'Not read yet') : 'Not available'}</div></div>
      </a>
      <a class="tarjeta modo ${nTarjetas ? '' : 'desactivado'}" href="${base}/tarjetas">
        <span class="icono">🃏</span>
        <div class="crece"><b>Flashcards</b><div class="estado">${nTarjetas ? `${nSabidas} of ${nTarjetas} known` : 'Not available'}</div></div>
      </a>
      <a class="tarjeta modo ${nPreguntas ? '' : 'desactivado'}" href="${base}/test">
        <span class="icono">📝</span>
        <div class="crece"><b>Quiz</b><div class="estado">${nPreguntas ? `${nPreguntas} questions${p.mejorNota !== null ? ` · best score ${p.mejorNota}%` : ''}` : 'Not available'}</div></div>
      </a>
    </div>`;
}

function vistaResumen(a, t) {
  app.classList.add('ancho');
  const base = `#/a/${esc(a.id)}/t/${esc(t.id)}`;
  const pintar = () => {
    const leido = progresoTema(a.id, t.id).leido;
    app.innerHTML = `
      ${volver(base, t.titulo)}
      <h1>📖 ${esc(t.titulo)}</h1>
      <div style="--c:${esc(a.color)}">${notasHTML(t)}</div>
      <div class="acciones">
        <button class="boton ${leido ? '' : 'principal'} ancho" id="leido">${leido ? 'Read ✓' : '✓ Mark as read'}</button>
        ${t.tarjetas?.length ? `<a class="boton ancho" href="${base}/tarjetas">Next: flashcards →</a>` : ''}
      </div>`;
    document.getElementById('leido').addEventListener('click', () => {
      actualizarTema(a.id, t.id, p => { p.leido = !p.leido; });
      pintar();
    });
  };
  pintar();
}

function vistaProgreso() {
  const asigs = estado.curso.asignaturas.filter(a => a.temas.length);
  app.innerHTML = `
    <h1>Progress</h1>
    <p class="suave pequeño">Progress is saved on this device.</p>
    ${asigs.length ? asigs.map(a => `
      <h2>${esc(a.icono)} ${esc(a.nombre)} · ${porcentajeAsignatura(a)}%</h2>
      <div class="lista" style="--c:${esc(a.color)}">
        ${a.temas.map(t => {
          const p = progresoTema(a.id, t.id);
          const n = t.tarjetas?.length || 0;
          const s = (t.tarjetas || []).filter(c => p.sabidas.includes(c.p)).length;
          return `
            <a class="tarjeta" href="#/a/${esc(a.id)}/t/${esc(t.id)}">
              <b>${esc(t.titulo)}</b>
              <div class="suave pequeño">
                📖 ${p.leido ? 'read' : 'not read'} · 🃏 ${s}/${n} · 📝 ${p.mejorNota !== null ? `${p.mejorNota}%` : 'not done'}
              </div>
              ${barra(porcentajeTema(a, t))}
            </a>`;
        }).join('')}
      </div>`).join('') : '<p class="vacio">No topics in this year group yet.</p>'}
    <div class="acciones"><button class="boton ancho" id="borrar">Reset progress for this year</button></div>`;
  const borrar = document.getElementById('borrar');
  borrar.addEventListener('click', () => {
    if (!borrar.dataset.confirmar) {
      borrar.dataset.confirmar = '1';
      borrar.textContent = 'Tap again to delete everything';
      return;
    }
    try { localStorage.removeItem(claveProgreso()); } catch { /* sin almacenamiento */ }
    render();
  });
}

// ---------- Test ----------

const normalizar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'");

// Respuesta corta: correcta si contiene al menos `minimo` de las palabras clave.
// Las claves numéricas tienen que aparecer como número completo ("5" no vale dentro de "25").
function evaluarCorta(q, texto) {
  const t = normalizar(texto);
  const contiene = clave => {
    const k = normalizar(clave);
    if (/^-?\d+([.,]\d+)?$/.test(k)) return new RegExp(`(^|[^\\d.,])${k.replace(/[.]/g, '\\.')}(?![\\d]|[.,]\\d)`).test(t);
    return t.includes(k);
  };
  return q.claves.filter(contiene).length >= (q.minimo || 1);
}

// Una respuesta es: índice de opción (opcion/vf) o { texto, ok } (corta).
const esCorrecta = (q, r) => q.tipo === 'corta' ? r?.ok === true : r === q.correcta;

function prepararPregunta(q) {
  if (q.tipo === 'corta') {
    return { original: q, tipo: 'corta', enunciado: q.enunciado, pista: q.pista, claves: q.claves, minimo: q.minimo, modelo: q.modelo, explicacion: q.explicacion };
  }
  if (q.tipo === 'vf') {
    return { original: q, tipo: 'opcion', enunciado: q.enunciado, opciones: ['True', 'False'], correcta: q.correcta ? 0 : 1, explicacion: q.explicacion };
  }
  const orden = barajar(q.opciones.map((_, k) => k));
  return {
    original: q,
    tipo: 'opcion',
    enunciado: q.enunciado,
    opciones: orden.map(k => q.opciones[k]),
    correcta: orden.indexOf(q.correcta),
    explicacion: q.explicacion,
  };
}

function mensajeNota(nota) {
  if (nota >= 90) return 'Excellent! 🏆';
  if (nota >= 70) return 'Great job! 💪';
  if (nota >= 50) return 'Pass – keep revising 👍';
  return 'Needs a bit more revision 📖';
}

const PREGUNTAS_POR_TEST = 20;

// Elige hasta `max` preguntas repartidas por igual entre los grupos (uno por tema).
function elegirPreguntas(grupos, max = PREGUNTAS_POR_TEST) {
  const colas = barajar(grupos.filter(g => g.length).map(g => barajar(g)));
  const elegidas = [];
  while (elegidas.length < max && colas.some(c => c.length)) {
    for (const c of colas) {
      if (c.length && elegidas.length < max) elegidas.push(c.shift());
    }
  }
  return barajar(elegidas);
}

// Exámenes por partes (`partes` en curso.json). Una parte con `lectura: true` saca UN texto
// al azar entre sus temas con `texto` y hace preguntas solo de ese texto, como en un examen real;
// las demás partes reparten sus preguntas entre sus temas.
const PREGUNTAS_POR_PARTE = 10;

function partesDeExamen(e) {
  const a = asignatura(e.asignatura);
  return (e.partes || []).map(p => ({ ...p, temas: (p.temas || []).map(id => tema(a, id)).filter(Boolean) }));
}

let ultimoTexto = null;

// Devuelve las secciones de una tanda: [{ titulo, textos: [temas], qs: [preguntas] }].
function tandaPorPartes(partes, sel) {
  const elegidas = sel === null ? partes : [partes[sel]];
  const max = elegidas.length > 1 ? PREGUNTAS_POR_PARTE : PREGUNTAS_POR_TEST;
  return elegidas.map(p => {
    if (p.lectura) {
      const conTexto = p.temas.filter(t => t.texto && t.preguntas?.length);
      const opciones = conTexto.length > 1 ? conTexto.filter(t => t.id !== ultimoTexto) : conTexto;
      const t = barajar(opciones)[0];
      if (!t) return { titulo: p.titulo, textos: [], qs: [] };
      ultimoTexto = t.id;
      // Se respeta el orden de las preguntas del texto (van siguiendo la lectura).
      const qs = t.preguntas.length > max
        ? barajar(t.preguntas.map((_, k) => k)).slice(0, max).sort((x, y) => x - y).map(k => t.preguntas[k])
        : t.preguntas;
      return { titulo: p.titulo, textos: [t], qs };
    }
    return { titulo: p.titulo, textos: [], qs: elegirPreguntas(p.temas.map(t => t.preguntas || []), max) };
  });
}

function ejecutarTest({ titulo, grupos, salir, alTerminar, temas = [], partes = [] }) {
  const total = grupos.reduce((s, g) => s + g.length, 0);
  if (!total) {
    app.innerHTML = `${volver(salir, 'Back')}<p class="vacio">No questions yet.</p>`;
    return;
  }
  let modo, lista, respuestas, i, completo, secciones, textos;
  let sel = null; // parte elegida (null = todas)

  const nuevaTanda = () => {
    secciones = partes.length
      ? tandaPorPartes(partes, sel)
      : [{ titulo: null, textos: temas, qs: elegirPreguntas(grupos) }];
    textos = secciones.flatMap(x => x.textos);
  };

  function inicio() {
    window.scrollTo(0, 0);
    nuevaTanda();
    const n = secciones.reduce((s, x) => s + x.qs.length, 0);
    app.innerHTML = `
      ${volver(salir, 'Back')}
      <h1>📝 ${esc(titulo)}</h1>
      ${partes.length ? `
        <div class="selector-partes" role="group" aria-label="Exam part">
          <button class="pestana ${sel === null ? 'activa' : ''}" data-sel="">Full exam</button>
          ${partes.map((p, k) => `<button class="pestana ${sel === k ? 'activa' : ''}" data-sel="${k}">${esc(p.titulo)}</button>`).join('')}
        </div>
        <p class="suave">${secciones.map(x => `<b>${esc(x.titulo)}</b>: ${x.qs.length} questions${x.textos.length ? ' on the text below' : ''}`).join(' · ')}</p>`
      : `<p class="suave">${n} random questions from a bank of ${total}.</p>`}
      ${textosHTML(textos, true)}
      <div class="lista">
        <button class="tarjeta modo" id="modo-practica">
          <span class="icono">🎯</span>
          <div class="crece"><b>Practice mode</b><div class="estado">Check each answer as you go</div></div>
        </button>
        <button class="tarjeta modo" id="modo-examen">
          <span class="icono">⏱️</span>
          <div class="crece"><b>Exam mode</b><div class="estado">Answer everything, then submit to get your mark</div></div>
        </button>
      </div>`;
    app.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
      sel = b.dataset.sel === '' ? null : Number(b.dataset.sel);
      inicio();
    }));
    document.getElementById('modo-practica').addEventListener('click', () => { modo = 'practica'; empezarTanda(); });
    document.getElementById('modo-examen').addEventListener('click', () => { modo = 'examen'; empezarTanda(); });
  }

  const empezarTanda = () => empezar(secciones.flatMap(x => x.qs.map(q => ({ q, parte: x.titulo }))), true);

  function empezar(items, esCompleto) {
    lista = items.map(({ q, parte }) => ({ ...prepararPregunta(q), parte }));
    respuestas = new Array(lista.length).fill(null);
    i = 0;
    completo = esCompleto;
    if (modo === 'examen') pintarExamen(); else pintar();
  }

  // ----- Modo práctica: una pregunta cada vez, corrección inmediata -----

  function pintar() {
    if (i >= lista.length) return resultado();
    const q = lista[i];
    window.scrollTo(0, 0);
    app.innerHTML = `
      <a class="volver" href="${salir}">✕ Exit</a>
      <div class="progreso-test"><span>${esc(q.parte || titulo)}</span><span>${i + 1} / ${lista.length}</span></div>
      ${barra(i / lista.length * 100)}
      ${textosHTML(textos, false)}
      <div class="enunciado">${esc(q.enunciado)}</div>
      ${q.tipo === 'corta' ? `
        ${q.pista ? `<div class="pista">💡 ${esc(q.pista)}</div>` : ''}
        <textarea class="respuesta-corta" id="corta" rows="3" placeholder="Write your answer here..."></textarea>
        <button class="boton principal ancho" id="comprobar">Check answer</button>
      ` : `
        <div class="opciones">
          ${q.opciones.map((o, k) => `<button class="opcion" data-k="${k}">${esc(o)}</button>`).join('')}
        </div>`}
      <div id="feedback"></div>`;
    app.querySelectorAll('.opcion').forEach(b => b.addEventListener('click', () => responder(Number(b.dataset.k))));
    document.getElementById('comprobar')?.addEventListener('click', () => {
      const caja = document.getElementById('corta');
      const texto = caja.value.trim();
      if (!texto) { caja.focus(); return; }
      caja.disabled = true;
      document.getElementById('comprobar').remove();
      respuestas[i] = { texto, ok: evaluarCorta(q, texto) };
      mostrarFeedback();
    });
  }

  function responder(k) {
    const q = lista[i];
    respuestas[i] = k;
    app.querySelectorAll('.opcion').forEach(b => {
      const n = Number(b.dataset.k);
      b.disabled = true;
      if (n === q.correcta) b.classList.add('correcta');
      else if (n === k) b.classList.add('incorrecta');
    });
    mostrarFeedback();
  }

  function mostrarFeedback() {
    const q = lista[i];
    const ok = esCorrecta(q, respuestas[i]);
    let solucion = '';
    if (q.tipo === 'corta') solucion = `<div>Model answer: <b>${esc(q.modelo)}</b></div>`;
    else if (!ok) solucion = `<div>The answer is: <b>${esc(q.opciones[q.correcta])}</b></div>`;
    document.getElementById('feedback').innerHTML = `
      <div class="feedback ${ok ? 'ok' : 'mal'}">
        <b>${ok ? '✅ Correct!' : '❌ Not quite'}</b>
        ${solucion}
        ${q.explicacion ? `<div class="pequeño">${esc(q.explicacion)}</div>` : ''}
        ${q.tipo === 'corta' && !ok ? '<button class="boton" id="me-vale" style="margin-top:8px">My answer was right too ✓</button>' : ''}
      </div>
      <button class="boton principal ancho" id="siguiente" style="margin-top:12px">
        ${i + 1 < lista.length ? 'Next →' : 'See result'}
      </button>`;
    document.getElementById('me-vale')?.addEventListener('click', () => { respuestas[i].ok = true; mostrarFeedback(); });
    const sig = document.getElementById('siguiente');
    sig.addEventListener('click', () => { i++; pintar(); });
    sig.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ----- Modo examen: todas las preguntas y corrección al enviar -----

  function pintarExamen() {
    window.scrollTo(0, 0);
    let avisado = false;
    app.innerHTML = `
      <a class="volver" href="${salir}">✕ Exit</a>
      <div class="progreso-test"><span>${esc(titulo)}</span><span id="contestadas">0 / ${lista.length} answered</span></div>
      <div class="lista" style="margin-top:12px">
        ${lista.map((q, n) => `
          ${q.parte && q.parte !== lista[n - 1]?.parte ? `
            <h2 class="titulo-parte">${esc(q.parte)}</h2>
            ${textosHTML(textos.filter(t => secciones.some(x => x.titulo === q.parte && x.textos.includes(t))), true)}` : ''}
          <div class="tarjeta">
            <div class="suave pequeño">Question ${n + 1}</div>
            <div class="enunciado enunciado-examen">${esc(q.enunciado)}</div>
            ${q.tipo === 'corta' ? `
              ${q.pista ? `<div class="pista">💡 ${esc(q.pista)}</div>` : ''}
              <textarea class="respuesta-corta" data-n="${n}" rows="3" placeholder="Write your answer here..."></textarea>
            ` : `
              <div class="opciones">
                ${q.opciones.map((o, k) => `<button class="opcion" data-n="${n}" data-k="${k}">${esc(o)}</button>`).join('')}
              </div>`}
          </div>`).join('')}
      </div>
      <p class="feedback mal" id="aviso-envio" hidden></p>
      <div class="acciones"><button class="boton principal ancho" id="enviar">Submit answers</button></div>`;
    if (!lista[0]?.parte) app.querySelector('.lista').insertAdjacentHTML('beforebegin', textosHTML(textos, false));
    const contador = document.getElementById('contestadas');
    const contar = () => {
      contador.textContent = `${respuestas.filter(r => r !== null).length} / ${lista.length} answered`;
    };
    app.querySelectorAll('.opcion').forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.n);
      respuestas[n] = Number(b.dataset.k);
      app.querySelectorAll(`.opcion[data-n="${n}"]`).forEach(o => o.classList.toggle('elegida', o === b));
      contar();
    }));
    app.querySelectorAll('.respuesta-corta').forEach(caja => caja.addEventListener('input', () => {
      const texto = caja.value.trim();
      respuestas[Number(caja.dataset.n)] = texto ? { texto, ok: null } : null;
      contar();
    }));
    document.getElementById('enviar').addEventListener('click', () => {
      const sinContestar = respuestas.filter(r => r === null).length;
      if (sinContestar && !avisado) {
        avisado = true;
        const aviso = document.getElementById('aviso-envio');
        aviso.textContent = `You have ${sinContestar} unanswered ${sinContestar === 1 ? 'question' : 'questions'}. Tap Submit again to finish anyway.`;
        aviso.hidden = false;
        return;
      }
      lista.forEach((q, n) => {
        if (q.tipo === 'corta' && respuestas[n]) respuestas[n].ok = evaluarCorta(q, respuestas[n].texto);
      });
      resultado();
    });
  }

  // ----- Resultado -----

  function resultado() {
    const aciertos = lista.filter((q, n) => esCorrecta(q, respuestas[n])).length;
    const fallos = lista.map((q, n) => ({ q, k: respuestas[n], n })).filter(f => !esCorrecta(f.q, f.k));
    const tuRespuesta = f => {
      if (f.k === null) return '<i>no answer</i>';
      return esc(f.q.tipo === 'corta' ? f.k.texto : f.q.opciones[f.k]);
    };
    const solucion = q => q.tipo === 'corta'
      ? `Model answer: <b>${esc(q.modelo)}</b>`
      : `Correct answer: <b>${esc(q.opciones[q.correcta])}</b>`;
    const nota = Math.round(aciertos / lista.length * 100);
    const nombresPartes = [...new Set(lista.map(q => q.parte).filter(Boolean))];
    const porParte = nombresPartes.length > 1 ? nombresPartes.map(p => {
      const idx = lista.map((q, n) => n).filter(n => lista[n].parte === p);
      const ok = idx.filter(n => esCorrecta(lista[n], respuestas[n])).length;
      return `<div class="tarjeta"><b>${esc(p)}</b><div class="suave">${ok} of ${idx.length} correct · ${Math.round(ok / idx.length * 100)}%</div>${barra(ok / idx.length * 100)}</div>`;
    }).join('') : '';
    if (completo) alTerminar?.(nota);
    window.scrollTo(0, 0);
    app.innerHTML = `
      <a class="volver" href="${salir}">← Back</a>
      <p class="nota">${nota}%</p>
      <p style="text-align:center"><b>${mensajeNota(nota)}</b><br>
        <span class="suave">${aciertos} of ${lista.length} correct</span></p>
      ${porParte ? `<div class="lista">${porParte}</div>` : ''}
      <div class="acciones">
        <button class="boton principal ancho" id="nuevas">🔁 New random questions</button>
        ${fallos.length ? `<button class="boton ancho" id="repetir-fallos">Practise mistakes only (${fallos.length})</button>` : ''}
        <button class="boton ancho" id="cambiar-modo">Change mode</button>
      </div>
      ${fallos.length ? `
        <h2>Review your mistakes</h2>
        <div class="lista">
          ${fallos.map(f => `
            <div class="tarjeta fallo">
              <b>${esc(f.q.enunciado)}</b>
              <div class="pequeño">Your answer: ${tuRespuesta(f)}</div>
              <div class="pequeño">${solucion(f.q)}</div>
              ${f.q.explicacion ? `<div class="pequeño suave">${esc(f.q.explicacion)}</div>` : ''}
              ${f.q.tipo === 'corta' && f.k ? `<button class="boton" data-me-vale="${f.n}" style="margin-top:8px">My answer was right too ✓</button>` : ''}
            </div>`).join('')}
        </div>` : ''}`;
    app.querySelectorAll('[data-me-vale]').forEach(b => b.addEventListener('click', () => {
      respuestas[Number(b.dataset.meVale)].ok = true;
      resultado();
    }));
    document.getElementById('nuevas').addEventListener('click', () => { nuevaTanda(); empezarTanda(); });
    document.getElementById('repetir-fallos')?.addEventListener('click', () =>
      empezar(barajar(fallos.map(f => ({ q: f.q.original, parte: f.q.parte }))), false));
    document.getElementById('cambiar-modo').addEventListener('click', inicio);
  }

  inicio();
}

function testTema(a, t) {
  ejecutarTest({
    titulo: t.titulo,
    grupos: [t.preguntas || []],
    temas: [t],
    salir: `#/a/${esc(a.id)}/t/${esc(t.id)}`,
    alTerminar: nota => actualizarTema(a.id, t.id, p => { p.mejorNota = Math.max(p.mejorNota ?? 0, nota); }),
  });
}

function testExamen(e) {
  const a = asignatura(e.asignatura);
  const temas = temasDeExamen(e);
  ejecutarTest({ titulo: e.titulo || a.nombre, grupos: temas.map(t => t.preguntas || []), salir: listaDe(e), temas, partes: partesDeExamen(e) });
}

// ---------- Notas y examen imprimible ----------

// Texto de lectura (`texto` del tema): las preguntas de comprensión se basan en él,
// así que se enseña antes del test, las flashcards y las notas, y se puede reabrir durante el test.
function textosHTML(temas, abierto) {
  return temas.filter(t => t.texto?.parrafos?.length).map(({ texto: x }) => `
    <details class="texto-lectura" ${abierto ? 'open' : ''}>
      <summary>📖 ${abierto ? 'Read the text first' : 'Show the text'}: <b>${inline(x.titulo)}</b></summary>
      ${x.intro ? `<p class="texto-intro">${inline(x.intro)}</p>` : ''}
      <div class="texto-cuerpo">${x.parrafos.map(p => `<p>${inline(p)}</p>`).join('')}</div>
      ${x.fuente ? `<p class="texto-fuente">${inline(x.fuente)}</p>` : ''}
      ${x.glosario?.length ? `<div class="chips">${x.glosario.map(g => `<span class="chip">${inline(g)}</span>`).join('')}</div>` : ''}
    </details>`).join('');
}

// Notas visuales de un tema: bloques con tarjetas (etiqueta, título, puntos) y chips.
// Si el tema no tiene `notas`, se muestra su `resumen`.
function notasHTML(t) {
  const texto = textosHTML([t], true);
  if (!t.notas?.length) return `${texto}<div class="tarjeta resumen">${markdown(t.resumen)}</div>`;
  return texto + t.notas.map(s => `
    <section class="bloque-notas">
      ${s.seccion ? `<h3 class="titulo-bloque">${inline(s.seccion)}</h3>` : ''}
      ${s.tarjetas?.length ? `
        <div class="rejilla-notas">
          ${s.tarjetas.map(n => `
            <div class="nota-visual">
              ${n.etiqueta ? `<span class="nota-etiqueta">${inline(n.etiqueta)}</span>` : ''}
              ${n.titulo ? `<h4>${inline(n.titulo)}</h4>` : ''}
              ${n.puntos?.length ? `<ul>${n.puntos.map(p => `<li>${inline(p)}</li>`).join('')}</ul>` : ''}
            </div>`).join('')}
        </div>` : ''}
      ${s.chips?.items?.length ? `
        <div class="nota-visual">
          ${s.chips.titulo ? `<h4>${inline(s.chips.titulo)}</h4>` : ''}
          <div class="chips">${s.chips.items.map(c => `<span class="chip">${inline(c)}</span>`).join('')}</div>
        </div>` : ''}
    </section>`).join('');
}

function vistaNotasExamen(e) {
  const a = asignatura(e.asignatura);
  const temas = temasDeExamen(e).filter(tieneNotas);
  let activa = 0;
  app.classList.add('ancho');
  const pintar = () => {
    const t = temas[activa];
    const leido = progresoTema(a.id, t.id).leido;
    app.innerHTML = `
      <div class="no-imprimir">
        ${volver(listaDe(e), e.final ? 'End of year' : 'Exams')}
        <h1>📖 ${esc(e.titulo || a.nombre)}</h1>
        <p class="suave pequeño">Revision notes · ${temas.length} ${temas.length === 1 ? 'topic' : 'topics'}</p>
        <div style="--c:${esc(a.color)}">
          ${temas.length > 1 ? `
            <div class="pestanas" role="tablist">
              ${temas.map((x, n) => `<button class="pestana ${n === activa ? 'activa' : ''}" role="tab" aria-selected="${n === activa}" data-n="${n}">${esc(x.titulo.split(' · ').pop())}</button>`).join('')}
            </div>` : ''}
          <h2>${esc(t.titulo)}</h2>
          ${notasHTML(t)}
        </div>
        <div class="acciones">
          <button class="boton ${leido ? '' : 'principal'} ancho" id="leido">${leido ? 'Read ✓' : '✓ Mark this topic as read'}</button>
          ${activa + 1 < temas.length ? '<button class="boton ancho" id="siguiente-tema">Next topic →</button>' : ''}
          <button class="boton ancho" id="imprimir-notas">🖨 Print notes (all topics)</button>
        </div>
        <p class="feedback pequeño" id="aviso-imprimir" hidden></p>
      </div>
      <article class="notas-impresas" style="--c:${esc(a.color)}">
        <h1>${esc(e.titulo || a.nombre)}</h1>
        <p>${esc(estado.curso.nombre)} · Revision notes · Name: ______________________</p>
        ${temas.map(x => `<section class="tema-impreso"><h2>${esc(x.titulo)}</h2>${notasHTML(x)}</section>`).join('')}
      </article>`;
    app.querySelector('.pestana.activa')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    app.querySelectorAll('.pestana').forEach(b => b.addEventListener('click', () => { activa = Number(b.dataset.n); pintar(); }));
    document.getElementById('leido').addEventListener('click', () => {
      actualizarTema(a.id, t.id, p => { p.leido = !p.leido; });
      pintar();
    });
    document.getElementById('siguiente-tema')?.addEventListener('click', () => { activa++; pintar(); window.scrollTo(0, 0); });
    document.getElementById('imprimir-notas').addEventListener('click', imprimir);
  };
  if (!temas.length) {
    app.innerHTML = `${volver(listaDe(e), e.final ? 'End of year' : 'Exams')}<p class="vacio">No notes yet.</p>`;
    return;
  }
  pintar();
}

// Dentro de la vista previa de claude.ai (iframe) el navegador no abre la ventana de imprimir.
function imprimir() {
  window.print();
  let incrustada = true;
  try { incrustada = window.self !== window.top; } catch { /* incrustada */ }
  if (incrustada) {
    const aviso = document.getElementById('aviso-imprimir');
    aviso.textContent = 'If the print window didn’t open, printing isn’t available in this preview. It works on the published website.';
    aviso.hidden = false;
  }
}

function vistaImprimir(e) {
  const a = asignatura(e.asignatura);
  const titulo = e.titulo || a.nombre;
  const letras = 'ABCDEFGH';
  const pintar = () => {
    const partes = partesDeExamen(e);
    const secciones = partes.length
      ? tandaPorPartes(partes, null)
      : [{ titulo: null, textos: temasDeExamen(e), qs: elegirPreguntas(temasDeExamen(e).map(t => t.preguntas || [])) }];
    const lista = secciones.flatMap(x => x.qs.map(q => ({ ...prepararPregunta(q), parte: x.titulo })));
    const textoDe = p => textosHTML(secciones.find(x => x.titulo === p)?.textos || [], true);
    app.innerHTML = `
      <div class="no-imprimir">
        ${volver(listaDe(e), e.final ? 'End of year' : 'Exams')}
        <div class="acciones">
          <button class="boton principal" id="imprimir">🖨 Print / Save as PDF</button>
          <button class="boton" id="otras">🔁 New questions</button>
        </div>
        <p class="feedback pequeño" id="aviso-imprimir" hidden></p>
      </div>
      <article class="hoja">
        <header class="hoja-cabecera">
          <h1>${esc(titulo)}</h1>
          <p>${esc(estado.curso.nombre)} · ${esc(a.nombre)} · ${lista.length} questions</p>
          <div class="hoja-datos">
            <span>Name: ______________________</span>
            <span>Date: ____________</span>
            <span>Score: ____ / ${lista.length}</span>
          </div>
        </header>
        ${partes.length ? '' : textoDe(null)}
        <ol class="hoja-preguntas">
          ${lista.map((q, n) => `
            ${q.parte && q.parte !== lista[n - 1]?.parte ? `<h2 class="titulo-parte">${esc(q.parte)}</h2>${textoDe(q.parte)}` : ''}
            <li>
              <p class="hoja-enunciado">${esc(q.enunciado)}</p>
              ${q.tipo === 'corta'
                ? '<div class="hoja-lineas"><span></span><span></span><span></span></div>'
                : `<ul class="hoja-opciones">${q.opciones.map((o, k) => `<li><span class="casilla"></span>${letras[k]}. ${esc(o)}</li>`).join('')}</ul>`}
            </li>`).join('')}
        </ol>
        <section class="hoja-soluciones">
          <h2>Answer key</h2>
          <ol>
            ${lista.map(q => `
              <li>${q.tipo === 'corta' ? esc(q.modelo) : `<b>${letras[q.correcta]}</b>. ${esc(q.opciones[q.correcta])}`}
                ${q.explicacion ? `<span class="suave"> — ${esc(q.explicacion)}</span>` : ''}</li>`).join('')}
          </ol>
        </section>
      </article>`;
    document.getElementById('imprimir').addEventListener('click', imprimir);
    document.getElementById('otras').addEventListener('click', pintar);
  };
  pintar();
}

// ---------- Tarjetas de repaso ----------

function ejecutarTarjetas({ titulo, tarjetas, salir, temas = [] }) {
  if (!tarjetas.length) {
    app.innerHTML = `${volver(salir, 'Back')}<p class="vacio">No flashcards yet.</p>`;
    return;
  }
  const sabe = c => progresoTema(c.asig, c.tema).sabidas.includes(c.p);
  let cola, total;

  const empezar = soloPendientes => {
    const pendientes = tarjetas.filter(c => !sabe(c));
    cola = barajar(soloPendientes && pendientes.length ? pendientes : tarjetas);
    total = cola.length;
    pintar();
  };

  function pintar() {
    if (!cola.length) return final();
    const c = cola[0];
    app.innerHTML = `
      <a class="volver" href="${salir}">✕ Exit</a>
      <div class="progreso-test"><span>${esc(titulo)}</span><span>${cola.length} left</span></div>
      ${barra((total - cola.length) / total * 100)}
      <div class="carta" id="carta">
        <div class="carta-interior">
          <div class="cara"><small>Question · tap to flip</small>${esc(c.p)}</div>
          <div class="cara detras"><small>Answer</small>${esc(c.r)}</div>
        </div>
      </div>
      <div class="botones-carta">
        <button class="boton repasar" id="repasar">🔁 Again</button>
        <button class="boton sabe" id="sabe">✅ I know it</button>
      </div>`;
    const carta = document.getElementById('carta');
    carta.addEventListener('click', () => carta.classList.toggle('girada'));
    document.getElementById('repasar').addEventListener('click', () => {
      actualizarTema(c.asig, c.tema, p => { p.sabidas = p.sabidas.filter(x => x !== c.p); });
      cola.push(cola.shift());
      pintar();
    });
    document.getElementById('sabe').addEventListener('click', () => {
      actualizarTema(c.asig, c.tema, p => { if (!p.sabidas.includes(c.p)) p.sabidas.push(c.p); });
      cola.shift();
      pintar();
    });
  }

  function final() {
    app.innerHTML = `
      <a class="volver" href="${salir}">← Back</a>
      <p class="nota">🎉</p>
      <p style="text-align:center"><b>You’ve gone through all the cards!</b></p>
      <div class="acciones">
        <button class="boton principal ancho" id="otra">🔁 Go through them all again</button>
        <a class="boton ancho" href="${salir}">Back</a>
      </div>`;
    document.getElementById('otra').addEventListener('click', () => empezar(false));
  }

  const conTexto = temas.filter(t => t.texto?.parrafos?.length);
  const textos = textosHTML(conTexto, conTexto.length <= 2);
  if (!textos) return empezar(true);
  app.innerHTML = `
    ${volver(salir, 'Back')}
    <h1>🃏 ${esc(titulo)}</h1>
    ${textos}
    <div class="acciones"><button class="boton principal ancho" id="empezar">Start flashcards →</button></div>`;
  document.getElementById('empezar').addEventListener('click', () => empezar(true));
}

function tarjetasTema(a, t) {
  ejecutarTarjetas({ titulo: t.titulo, tarjetas: tarjetasDe(a, [t]), salir: `#/a/${esc(a.id)}/t/${esc(t.id)}`, temas: [t] });
}

function tarjetasExamen(e) {
  const a = asignatura(e.asignatura);
  const temas = temasDeExamen(e);
  ejecutarTarjetas({ titulo: e.titulo || a.nombre, tarjetas: tarjetasDe(a, temas), salir: listaDe(e), temas });
}

// ---------- Navegación ----------

function noEncontrado() {
  app.innerHTML = `${volver('#/', 'Home')}<p class="vacio">Page not found.</p>`;
}

function mostrarError(e) {
  console.error(e);
  const local = location.protocol === 'file:'
    ? '<br><br>The file was opened directly. Open the site from GitHub Pages or a local server (see the README).'
    : '';
  app.innerHTML = `<p class="vacio">⚠️ ${esc(e.message)}${local}</p>`;
}

function marcarNav(seccion) {
  const actual = ['examenes', 'finales', 'progreso'].includes(seccion) ? seccion : 'inicio';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('activo', a.dataset.nav === actual));
}

// Contador de visitas por página (servicio gratuito Abacus, sin cuenta).
// Cada página cuenta una visita por sesión del navegador; si el servicio falla, no se muestra nada.
const CONTADOR = 'https://abacus.jasoncameron.dev';
// En local se cuenta aparte para no inflar las visitas reales.
const ESPACIO_CONTADOR = location.hostname.endsWith('github.io') ? 'study-buddy-inmaglez' : 'study-buddy-local';
const numero = n => Number(n).toLocaleString('en-GB');

const claveVisita = partes =>
  [estado.curso.id, ...(partes.length ? partes : ['inicio'])].join('_').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 64);
// En la página de estadísticas se puede marcar este dispositivo para que sus visitas no cuenten.
const sinContar = () => leer('noContarVisitas') === true;

async function leerContador(clave) {
  const r = await fetch(`${CONTADOR}/get/${ESPACIO_CONTADOR}/${clave}`);
  if (r.status === 404) return 0;
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).value;
}

async function contar(clave) {
  if (sinContar()) return leerContador(clave);
  let vistas = {};
  try { vistas = JSON.parse(sessionStorage.getItem('visitas') || '{}'); } catch {}
  const nueva = !vistas[clave];
  const r = await fetch(`${CONTADOR}/${nueva ? 'hit' : 'get'}/${ESPACIO_CONTADOR}/${clave}`);
  if (!r.ok) throw new Error(r.status);
  const { value } = await r.json();
  if (nueva) {
    vistas[clave] = 1;
    try { sessionStorage.setItem('visitas', JSON.stringify(vistas)); } catch {}
  }
  return value;
}

let turnoVisitas = 0;

async function mostrarVisitas(partes) {
  const turno = ++turnoVisitas;
  const caja = document.getElementById('visitas');
  const clave = claveVisita(partes);
  caja.textContent = '';
  try {
    const [pagina, total] = await Promise.all([contar(clave), contar('total')]);
    if (turno !== turnoVisitas) return;
    caja.textContent = `👀 ${numero(pagina)} ${pagina === 1 ? 'visit' : 'visits'} to this page · ${numero(total)} to Study Buddy`;
  } catch {
    caja.textContent = '';
  }
}

// El servicio admite 30 peticiones cada 10 s: se leen de una en una, con pausa, y se reintenta si responde 429.
const espera = ms => new Promise(r => setTimeout(r, ms));

async function leerDespacio(clave) {
  for (let intento = 0; intento < 4; intento++) {
    // A veces el servicio se queda colgado: se corta a los 6 s y se reintenta.
    const r = await fetch(`${CONTADOR}/get/${ESPACIO_CONTADOR}/${clave}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (r?.status === 404) return 0;
    if (r?.ok) return (await r.json()).value;
    await espera(r?.status === 429 ? 4000 : 1000);
  }
  return null;
}

// Página de estadísticas (#/estadisticas): no está enlazada desde ninguna parte de la web.
// Se pinta enseguida con "…" y cada número aparece al llegar.
async function vistaEstadisticas() {
  const recursos = [['test', '▶ Practice'], ['imprimir', '🖨 Print'], ['notas', '📖 Notes'], ['tarjetas', '🃏 Flashcards']];
  const principales = [[[], '🏠 Home'], [['examenes'], '📅 Exams'], [['finales'], '🏆 End of year'], [['progreso'], '📈 Progress']];
  const subtemas = [[[], 'Topic'], [['resumen'], 'Notes'], [['tarjetas'], 'Flashcards'], [['test'], 'Quiz']];
  const filasExamen = [...examenesOrdenados(), ...finalesDisponibles()]
    .map(e => ({ e, claves: recursos.map(([r]) => claveVisita(['examenes', e.id, r])) }));
  const filasAsig = estado.curso.asignaturas.filter(a => a.temas.length).map(a => ({
    a,
    claveAsig: claveVisita(['a', a.id]),
    temas: a.temas.map(t => ({ t, claves: subtemas.map(([p]) => claveVisita(['a', a.id, 't', t.id, ...p])) }))
  }));

  const num = clave => `<span data-clave="${clave}">…</span>`;
  const celdas = claves => claves.map(c => `<td>${num(c)}</td>`).join('');
  const total = claves => `<td><b data-suma="${claves.join(' ')}">…</b></td>`;

  app.classList.add('ancho');
  app.innerHTML = `
    <h1>📊 Statistics</h1>
    <p class="suave pequeño">Each page counts one visit per browser session. This page isn't linked anywhere on the site.
      <span id="cargando-visitas">Numbers appear gradually: the full list takes two or three minutes.</span></p>
    <div class="cifras">
      <div><b>${num('total')}</b><span>Visits to Study Buddy</span></div>
      ${principales.map(([p, nombre]) => `<div><b>${num(claveVisita(p))}</b><span>${nombre}</span></div>`).join('')}
    </div>

    <h2>Exams</h2>
    <div class="tabla-desliza"><table class="tabla-visitas">
      <thead><tr><th>Exam</th>${recursos.map(([, r]) => `<th>${r}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${filasExamen.map(({ e, claves }) => `
        <tr><th>${esc(e.titulo)}</th>${celdas(claves)}${total(claves)}</tr>`).join('')}
      </tbody>
    </table></div>

    <h2>Subjects and topics</h2>
    ${filasAsig.map(({ a, claveAsig, temas }) => `
      <h3>${esc(a.icono)} ${esc(a.nombre)} <span class="suave pequeño">· subject page: ${num(claveAsig)}</span></h3>
      <div class="tabla-desliza"><table class="tabla-visitas">
        <thead><tr><th>Topic</th>${subtemas.map(([, x]) => `<th>${x}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${temas.map(({ t, claves }) => `
          <tr><th>${esc(t.titulo)}</th>${celdas(claves)}${total(claves)}</tr>`).join('')}
        </tbody>
      </table></div>`).join('')}

    <h2>This device</h2>
    <p class="suave pequeño">Visits from this device are ${sinContar() ? '<b>not</b> being counted' : 'being counted'}.</p>
    <div class="acciones"><button class="boton ancho" id="no-contar">${sinContar() ? 'Count my visits again' : "Don't count my visits on this device"}</button></div>`;

  const valores = {};
  const turno = ++turnoVisitas;
  document.getElementById('no-contar').addEventListener('click', () => {
    guardar('noContarVisitas', !sinContar());
    render();
  });

  // Tres lecturas a la vez, en el orden de la página (primero lo más importante).
  const cola = [...new Set([...app.querySelectorAll('[data-clave]')].map(el => el.dataset.clave))];
  const pintar = (clave, valor) => {
    valores[clave] = valor;
    app.querySelectorAll(`[data-clave="${clave}"]`).forEach(el => {
      el.textContent = valor === null ? '?' : numero(valor);
      el.closest('td')?.classList.toggle('cero', !valor);
    });
    app.querySelectorAll('[data-suma]').forEach(el => {
      const ks = el.dataset.suma.split(' ');
      if (ks.every(k => k in valores)) el.textContent = numero(ks.reduce((s, k) => s + (valores[k] || 0), 0));
    });
  };
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cola.length && turno === turnoVisitas) {
      const clave = cola.shift();
      let valor = null;
      try { valor = await leerDespacio(clave); } catch { /* sin conexión */ }
      if (turno !== turnoVisitas) return;
      pintar(clave, valor);
      await espera(300);
    }
  }));
  if (turno !== turnoVisitas) return;
  document.getElementById('cargando-visitas')?.remove();
}

// ---------- Subir fotos de un examen (#/upload) ----------
// Las fotos van al Worker de Cloudflare, que comprueba el código de acceso y las guarda en el
// repositorio privado de fuentes. El código y la clave de GitHub solo están en el Worker.
const SUBIDA = 'https://study-buddy-subida.inmaglez.workers.dev';
const LADO_MAXIMO = 2000;
const MAX_FOTOS = 30;

// Reduce cada foto a JPEG de 2000 px como máximo; si el navegador no sabe leerla, se manda tal cual.
async function reducirFoto(archivo) {
  try {
    const img = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    img.close();
    const blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) throw new Error('toBlob');
    return { blob, nombre: archivo.name.replace(/\.[^.]*$/, '') + '.jpg' };
  } catch {
    return { blob: archivo, nombre: archivo.name };
  }
}

const enBase64 = blob => new Promise((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(String(lector.result).replace(/^data:[^,]*,/, ''));
  lector.onerror = () => rechazar(new Error('That photo could not be read.'));
  lector.readAsDataURL(blob);
});

// El Worker recibe una petición por foto y otra al final (así cada una es pequeña).
async function enviarSubida(datos) {
  let r;
  try {
    r = await fetch(SUBIDA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const respuesta = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(respuesta.error || `The upload failed (${r.status}). Please try again.`);
  return respuesta;
}

async function vistaSubida() {
  const asignaturasDe = {};
  const cargarAsignaturas = async id => {
    asignaturasDe[id] ??= (await cargarJSON(`data/${id}/curso.json`)).asignaturas;
    return asignaturasDe[id];
  };

  app.innerHTML = `
    ${volver('#/', 'Home')}
    <h1>📷 Send exam photos</h1>
    <p class="suave">Take clear photos of every page the exam covers (book, worksheets or the exam list).
      We'll turn them into notes, flashcards and a practice test.</p>
    ${SUBIDA ? '' : '<p class="aviso-subida">Uploads aren\'t switched on yet.</p>'}
    <form id="subida" class="formulario" novalidate>
      <label>Year group
        <select name="curso" required>${estado.cursos.map(c => `
          <option value="${esc(c.id)}"${c.id === estado.curso.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
        </select></label>
      <label>Subject <select name="asignatura" required></select></label>
      <label>Exam date <input type="date" name="fecha" required></label>
      <label>Exam title <input type="text" name="titulo" maxlength="80" required
        placeholder="e.g. Science test · Unit 2 Forces"></label>
      <label>Photos <input type="file" name="fotos" accept="image/*" multiple required></label>
      <p class="suave pequeño" id="num-fotos">No photos chosen.</p>
      <label>Access code <input type="text" name="codigo" autocomplete="off" autocapitalize="characters" required></label>
      <p class="feedback" id="mensaje-subida" hidden></p>
      <div class="barra" id="barra-subida" hidden><i style="width:0%"></i></div>
      <button class="boton principal ancho" type="submit"${SUBIDA ? '' : ' disabled'}>Send photos</button>
    </form>`;

  const form = document.getElementById('subida');
  const mensaje = document.getElementById('mensaje-subida');
  const barra = document.getElementById('barra-subida');
  const boton = form.querySelector('button');
  const decir = (texto, ok) => {
    mensaje.hidden = false;
    mensaje.textContent = texto;
    mensaje.classList.toggle('ok', !!ok);
    mensaje.classList.toggle('mal', !ok);
  };

  const pintarAsignaturas = async () => {
    const lista = await cargarAsignaturas(form.curso.value);
    form.asignatura.innerHTML = '<option value="">Choose a subject…</option>' + lista
      .map(a => `<option value="${esc(a.id)}">${esc(a.icono)} ${esc(a.nombre)}</option>`).join('');
  };
  form.curso.addEventListener('change', () => pintarAsignaturas().catch(mostrarError));
  await pintarAsignaturas();

  form.fotos.addEventListener('change', () => {
    const n = form.fotos.files.length;
    document.getElementById('num-fotos').textContent =
      !n ? 'No photos chosen.' : n > MAX_FOTOS ? `${n} photos: the maximum is ${MAX_FOTOS}.` : `${n} photo${n === 1 ? '' : 's'} chosen.`;
  });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const archivos = [...form.fotos.files];
    const falta = !form.asignatura.value ? 'Choose a subject.'
      : !form.fecha.value ? 'Choose the exam date.'
      : !form.titulo.value.trim() ? 'Write the exam title.'
      : !archivos.length ? 'Choose at least one photo.'
      : archivos.length > MAX_FOTOS ? `Send ${MAX_FOTOS} photos at most.`
      : !form.codigo.value.trim() ? 'Write the access code.'
      : '';
    if (falta) return decir(falta);

    boton.disabled = true;
    barra.hidden = false;
    const relleno = barra.querySelector('i');
    try {
      const codigo = form.codigo.value.trim().toUpperCase();
      const fotos = [];
      for (const [i, archivo] of archivos.entries()) {
        decir(`Sending photo ${i + 1} of ${archivos.length}…`, true);
        const { blob, nombre } = await reducirFoto(archivo);
        const { sha } = await enviarSubida({ accion: 'foto', codigo, contenido: await enBase64(blob) });
        fotos.push({ nombre, sha });
        relleno.style.width = `${Math.round(95 * (i + 1) / archivos.length)}%`;
      }
      decir('Finishing…', true);
      await enviarSubida({
        accion: 'terminar', codigo, fotos,
        curso: form.curso.value, asignatura: form.asignatura.value, fecha: form.fecha.value, titulo: form.titulo.value.trim()
      });
      relleno.style.width = '100%';
      form.reset();
      await pintarAsignaturas();
      form.fotos.dispatchEvent(new Event('change'));
      decir('✅ Thank you! The photos have arrived. The exam will appear on Study Buddy in a few hours.', true);
    } catch (e) {
      decir(`⚠️ ${e.message}`);
    } finally {
      boton.disabled = false;
      setTimeout(() => { barra.hidden = true; relleno.style.width = '0%'; }, 1500);
    }
  });
}

function render() {
  const [r0, r1, r2, r3, r4] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  marcarNav(r0 === 'examenes' && r1?.startsWith(PREFIJO_FINAL) ? 'finales' : r0);
  app.classList.remove('ancho');
  window.scrollTo(0, 0);
  if (r0 === 'estadisticas') document.getElementById('visitas').textContent = '';
  else mostrarVisitas([r0, r1, r2, r3, r4].filter(Boolean));
  try {
    if (!r0) return vistaInicio();
    if (r0 === 'progreso') return vistaProgreso();
    if (r0 === 'estadisticas') return vistaEstadisticas().catch(mostrarError);
    if (r0 === 'upload') return vistaSubida().catch(mostrarError);
    if (r0 === 'finales') return vistaFinales();
    if (r0 === 'examenes') {
      if (!r1) return vistaExamenes();
      const e = examen(r1);
      if (e && r2 === 'test') return testExamen(e);
      if (e && r2 === 'tarjetas') return tarjetasExamen(e);
      if (e && r2 === 'notas') return vistaNotasExamen(e);
      if (e && r2 === 'imprimir') return vistaImprimir(e);
    }
    if (r0 === 'a') {
      const a = asignatura(r1);
      if (a && !r2) return vistaAsignatura(a);
      const t = r2 === 't' ? tema(a, r3) : null;
      if (t && !r4) return vistaTema(a, t);
      if (t && r4 === 'resumen' && tieneNotas(t)) return vistaResumen(a, t);
      if (t && r4 === 'tarjetas') return tarjetasTema(a, t);
      if (t && r4 === 'test') return testTema(a, t);
    }
    noEncontrado();
  } catch (e) {
    mostrarError(e);
  }
}

selectorCurso.addEventListener('change', async () => {
  try {
    await cambiarCurso(selectorCurso.value);
    if (location.hash && location.hash !== '#/') location.hash = '#/';
    else render();
  } catch (e) {
    mostrarError(e);
  }
});

(async function iniciar() {
  try {
    await cargarCursos();
    const guardado = leer('cursoActivo');
    await cambiarCurso(estado.cursos.some(c => c.id === guardado) ? guardado : estado.cursos[0].id);
    window.addEventListener('hashchange', render);
    render();
  } catch (e) {
    mostrarError(e);
  }
})();
