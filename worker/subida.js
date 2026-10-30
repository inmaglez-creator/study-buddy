// Cloudflare Worker de Study Buddy: recibe las fotos de #/upload y las guarda en el repositorio
// privado de fuentes, en pendientes/year-<n>/<asignatura>/<AAAA-MM-DD>_<examen>/ con un info.json.
//
// Secretos del Worker (Settings → Variables and Secrets):
//   CODIGO        código de acceso de las madres (se compara sin distinguir mayúsculas)
//   GITHUB_TOKEN  clave fine-grained con permiso Contents: Read and write solo en study-buddy-fuentes
//
// La web hace una petición por foto ({ accion: "foto" }) y otra al final ({ accion: "terminar" }).
// Así cada petición es pequeña y cabe en los límites del plan gratuito.

const REPO = 'inmaglez-creator/study-buddy-fuentes';
const RAMA = 'main';
const WEB = 'https://raw.githubusercontent.com/inmaglez-creator/study-buddy/main';
const ORIGENES = ['https://inmaglez-creator.github.io'];
const MAX_FOTOS = 30;
const MAX_BASE64 = 14 * 1024 * 1024; // unos 10 MB por foto

export default {
  async fetch(peticion, env) {
    const origen = peticion.headers.get('Origin') || '';
    const permitido = ORIGENES.includes(origen) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen);
    const cors = {
      'Access-Control-Allow-Origin': permitido ? origen : ORIGENES[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const responder = (datos, estado = 200) => new Response(JSON.stringify(datos), {
      status: estado, headers: { ...cors, 'Content-Type': 'application/json' }
    });

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (peticion.method !== 'POST') return responder({ error: 'Not found.' }, 404);

    let d;
    try { d = await peticion.json(); } catch { return responder({ error: 'Invalid request.' }, 400); }
    if (String(d.codigo || '').trim().toUpperCase() !== String(env.CODIGO || '').trim().toUpperCase() || !env.CODIGO) {
      return responder({ error: 'The access code is not right.' }, 403);
    }

    try {
      if (d.accion === 'foto') return responder(await subirFoto(d, env));
      if (d.accion === 'terminar') return responder(await terminar(d, env));
      return responder({ error: 'Invalid request.' }, 400);
    } catch (e) {
      return responder({ error: e.publico || 'Something went wrong. Please try again later.' }, e.estado || 500);
    }
  }
};

function fallo(mensaje, estado = 400) {
  return Object.assign(new Error(mensaje), { publico: mensaje, estado });
}

async function github(env, ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    ...opciones,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'study-buddy-subida',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (r.status === 404 && opciones.vale404) return null;
  if (!r.ok) {
    console.log('GitHub', ruta, r.status, await r.text());
    throw fallo('Could not save the photos. Please try again later.', 502);
  }
  return r.json();
}

// Una foto: se guarda como blob en GitHub y se devuelve su sha. Aún no aparece en ninguna carpeta.
async function subirFoto(d, env) {
  const contenido = String(d.contenido || '');
  if (!contenido || contenido.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(contenido)) {
    throw fallo('That photo could not be read.');
  }
  // Se monta el JSON a mano para no copiar ni recorrer la foto (el plan gratuito da poco tiempo de CPU).
  const blob = await github(env, '/git/blobs', { method: 'POST', body: `{"encoding":"base64","content":"${contenido}"}` });
  return { sha: blob.sha };
}

const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');

// Al final: comprueba los datos, crea la carpeta con las fotos e info.json en un solo commit.
async function terminar(d, env) {
  const curso = String(d.curso || '');
  const asignatura = String(d.asignatura || '');
  const fecha = String(d.fecha || '');
  const titulo = String(d.titulo || '').trim().slice(0, 80);
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  if (!/^y\d{1,2}$/.test(curso) || !/^[a-z0-9-]+$/.test(asignatura)) throw fallo('Choose a year group and a subject.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha))) throw fallo('Choose the exam date.');
  if (!slug(titulo)) throw fallo('Write the exam title.');
  if (!fotos.length || fotos.length > MAX_FOTOS) throw fallo(`Send between 1 and ${MAX_FOTOS} photos.`);
  if (!fotos.every(f => /^[0-9a-f]{40}$/.test(f.sha) && typeof f.nombre === 'string')) throw fallo('Invalid request.');

  // La asignatura tiene que existir en la web.
  const r = await fetch(`${WEB}/data/${curso}/curso.json`);
  const datosCurso = r.ok ? await r.json() : null;
  const asig = datosCurso?.asignaturas?.find(a => a.id === asignatura);
  if (!asig) throw fallo('That subject does not exist on Study Buddy.');

  const base = `pendientes/year-${curso.slice(1)}/${asignatura}/${fecha}_${slug(titulo)}`;
  let carpeta = base;
  for (let n = 2; await github(env, `/contents/${carpeta}?ref=${RAMA}`, { vale404: true }); n++) carpeta = `${base}-${n}`;

  const nombres = fotos.map((f, i) => {
    const limpio = slug(f.nombre.replace(/\.[^.]*$/, '')) || 'foto';
    const ext = (f.nombre.match(/\.(jpe?g|png|heic|heif|webp)$/i)?.[1] || 'jpg').toLowerCase();
    return `${String(i + 1).padStart(2, '0')}_${limpio.replace(/^\d+-/, '')}.${ext}`;
  });
  const info = {
    curso, year: Number(curso.slice(1)), asignatura, asignaturaNombre: asig.nombre,
    fecha, titulo, fotos: nombres, recibido: new Date().toISOString()
  };

  // Commit en la punta de main; si alguien ha hecho commit entre medias, se reintenta.
  for (let intento = 0; intento < 3; intento++) {
    const ref = await github(env, `/git/ref/heads/${RAMA}`);
    const padre = await github(env, `/git/commits/${ref.object.sha}`);
    const arbol = await github(env, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: padre.tree.sha,
        tree: [
          ...fotos.map((f, i) => ({ path: `${carpeta}/${nombres[i]}`, mode: '100644', type: 'blob', sha: f.sha })),
          { path: `${carpeta}/info.json`, mode: '100644', type: 'blob', content: JSON.stringify(info, null, 2) + '\n' }
        ]
      })
    });
    const commit = await github(env, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: `Pendiente: ${asig.nombre} Year ${info.year} · ${titulo} (${fecha}), ${fotos.length} fotos`, tree: arbol.sha, parents: [padre.sha] })
    });
    const r2 = await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${RAMA}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json',
        'User-Agent': 'study-buddy-subida', 'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sha: commit.sha })
    });
    if (r2.ok) return { ok: true, carpeta };
    if (r2.status !== 422) {
      console.log('GitHub ref', r2.status, await r2.text());
      throw fallo('Could not save the photos. Please try again later.', 502);
    }
  }
  throw fallo('Could not save the photos. Please try again later.', 502);
}
