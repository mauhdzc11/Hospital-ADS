const form = document.getElementById("login-form");
const rolPreview = document.getElementById("rol-preview");
const loginCard = document.getElementById("login-card");

// Paneles por rol
const panelMedico = document.getElementById("panel-medico");
const panelEnfermeria = document.getElementById("panel-enfermeria");
const panelAdmin = document.getElementById("panel-admin");

// Textos de info
const infoMedico = document.getElementById("info-medico");
const infoEnfermeria = document.getElementById("info-enfermeria");
const infoAdmin = document.getElementById("info-admin");

// URL del backend
const BACKEND_URL = "http://localhost:3000";

// Aquí guardamos al médico logueado (con id_medico)
let medicoActual = null;

// Utilidades de fecha/hora para mostrar datetimes en hora local
function toLocalInputDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000; // minutos -> ms
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function formatDateTimeDisplay(value) {
  const input = toLocalInputDateTime(value);
  if (!input) return "";
  return input.replace("T", " "); // "YYYY-MM-DD HH:mm"
}


// -------------------- LOGIN --------------------

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const usuario = form.usuario.value.trim();
  const contrasena = form.contrasena.value.trim();

  if (!usuario || !contrasena) {
    rolPreview.textContent = "Debes ingresar usuario y contraseña.";
    return;
  }

  rolPreview.textContent = "Verificando credenciales contra el servidor...";

  try {
    const res = await fetch(`${BACKEND_URL}/api/usuarios/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nombre_usuario: usuario,
        contrasena,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "No fue posible iniciar sesión.");
    }

    const roles = data.roles || [];
    const rolesTexto = roles.length > 0 ? roles.join(", ") : "SIN ROL";

    rolPreview.innerHTML = `
      Inicio de sesión correcto.<br/>
      <strong>Usuario:</strong> ${data.nombre_usuario}<br/>
      <strong>Roles:</strong> ${rolesTexto}
    `;

    // Ocultamos login y mostramos panel según rol
    loginCard.style.display = "none";

    if (roles.includes("MEDICO")) {
      mostrarPanelMedico(data);
    } else if (roles.includes("ENFERMERIA")) {
      mostrarPanelEnfermeria(data);
    } else if (roles.includes("ADMIN")) {
      mostrarPanelAdmin(data);
    } else {
      mostrarPanelAdmin(data, true); // sin rol conocido
    }
  } catch (err) {
    console.error(err);
    rolPreview.textContent = err.message;
  }
});

// -------------------- PANEL MÉDICO --------------------

function mostrarPanelMedico(data) {
  panelMedico.style.display = "block";
  panelEnfermeria.style.display = "none";
  panelAdmin.style.display = "none";

  medicoActual = data.medico || null;

  if (medicoActual) {
    infoMedico.textContent = `Sesión iniciada como ${medicoActual.nombre} ${
      medicoActual.apellido_paterno || ""
    } (${medicoActual.especialidad || "Sin especialidad"}).`;
  } else {
    infoMedico.textContent =
      "Sesión iniciada como médico. (Los datos del médico no están completos en la base de datos).";
  }

  const contenido = document.getElementById("contenido-medico");

  // Listeners del menú lateral
  document
    .querySelectorAll("#panel-medico [data-vista]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const vista = btn.getAttribute("data-vista");
        actualizarVistaMedico(contenido, vista);
      });
    });

  // Vista por defecto
  actualizarVistaMedico(contenido, "pacientes");
}

function actualizarVistaMedico(contenido, vista) {
  // 👉 Ahora usamos la versión nueva que sí abre el expediente con pestañas
  if (vista === "pacientes") {
    cargarPacientesMedico(contenido);
    return;
  }

  if (vista === "agenda") {
    cargarAgendaMedico(contenido);
    return;
  }

  // Estas vistas “genéricas” ya casi no las usarás,
  // pero las dejamos por si el profe quiere verlas.
  if (vista === "notas") {
    contenido.innerHTML = `
      <h3>Notas de evolución</h3>
      <p class="texto-suave">
        Desde esta sección el médico podrá registrar notas de evolución en el expediente
        (<strong>tabla notas_evolucion</strong>), cumpliendo con la NOM.
      </p>
      <p class="texto-suave">
        Más adelante conectaremos esta vista con el backend para registrar y consultar notas.
      </p>
    `;
    return;
  }

  if (vista === "ordenes") {
    contenido.innerHTML = `
      <h3>Órdenes de laboratorio</h3>
      <p class="texto-suave">
        Aquí se generarán y consultarán las órdenes de laboratorio
        (<strong>tabla ordenes_laboratorio</strong>) y sus resultados asociados.
      </p>
    `;
    return;
  }
}


// -------------------- PANEL ENFERMERÍA --------------------

function mostrarPanelEnfermeria(data) {
  panelMedico.style.display = "none";
  panelEnfermeria.style.display = "block";
  panelAdmin.style.display = "none";

  infoEnfermeria.textContent = `Sesión iniciada como ${data.nombre_usuario} (rol: ENFERMERÍA).`;
}

// -------------------- PANEL ADMIN --------------------

function mostrarPanelAdmin(data, sinRol = false) {
  panelMedico.style.display = "none";
  panelEnfermeria.style.display = "none";
  panelAdmin.style.display = "block";

  if (sinRol) {
    infoAdmin.textContent = `Sesión iniciada como ${data.nombre_usuario}, pero no se encontró un rol específico. Se muestra el panel de administración genérico.`;
  } else {
    infoAdmin.textContent = `Sesión iniciada como ${data.nombre_usuario} (rol: ADMIN).`;
  }
}


// -------------------- AGENDA DE CITAS DEL MÉDICO --------------------

async function cargarAgendaMedico(contenido) {
  contenido.innerHTML = `
    <h3>Agenda de citas</h3>
    <p class="texto-suave">Cargando agenda de citas del médico...</p>
  `;

  if (!medicoActual || !medicoActual.id_medico) {
    contenido.innerHTML = `
      <h3>Agenda de citas</h3>
      <p class="texto-suave" style="color:#b91c1c;">
        No se pudo identificar el médico actual (id_medico no disponible).
      </p>
    `;
    return;
  }

  const idMedico = medicoActual.id_medico;

  try {
    const res = await fetch(`${BACKEND_URL}/api/medicos/${idMedico}/citas`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "No se pudo obtener la agenda.");
    }

    // El backend YA devuelve esto:
    const { futuras = [], historial = [] } = data;

    let html = `
      <h3>Agenda de citas</h3>
      <p class="texto-suave">
        Citas asociadas al médico <strong>${medicoActual.nombre} ${
      medicoActual.apellido_paterno || ""
    }</strong>.
      </p>
    `;

    // =======================
    // PRÓXIMAS CITAS
    // =======================
    html += `<h4>Próximas citas</h4>`;

    if (futuras.length === 0) {
      html += `<p class="texto-suave">No hay citas próximas registradas.</p>`;
    } else {
      html += `
        <table class="tabla-lista">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Paciente</th>
              <th>Motivo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const c of futuras) {
        const nombre = `${c.nombre} ${c.apellido_paterno || ""} ${
          c.apellido_materno || ""
        }`.trim();
        const fechaHora = formatDateTimeDisplay(c.fecha_hora) || "-";

        html += `
          <tr>
            <td>${fechaHora}</td>
            <td>${nombre}</td>
            <td>${c.motivo || "-"}</td>
            <td>${c.estado_cita || "-"}</td>
            <td>
              <button class="btn-accion" data-id="${c.id_cita}" data-estado="atendida">
                Atendida
              </button>
              <button class="btn-accion" data-id="${c.id_cita}" data-estado="no asistió">
                No asistió
              </button>
            </td>
          </tr>
        `;
      }

      html += `</tbody></table>`;
    }

    // =======================
    // HISTORIAL DE CITAS
    // =======================
    html += `<hr/><h4>Historial de citas</h4>`;

    if (historial.length === 0) {
      html += `<p class="texto-suave">No hay citas anteriores registradas.</p>`;
    } else {
      html += `
        <table class="tabla-lista">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Paciente</th>
              <th>Motivo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const h of historial) {
        const nombre = `${h.nombre} ${h.apellido_paterno || ""} ${
          h.apellido_materno || ""
        }`.trim();
        const fechaHora = formatDateTimeDisplay(h.fecha_hora) || "-";

        html += `
          <tr>
            <td>${fechaHora}</td>
            <td>${nombre}</td>
            <td>${h.motivo || "-"}</td>
            <td>${h.estado_cita || "-"}</td>
          </tr>
        `;
      }

      html += `</tbody></table>`;
    }

    contenido.innerHTML = html;

    // =======================
    // EVENTOS DE ACCIÓN
    // =======================
    contenido.querySelectorAll("button[data-estado]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const nuevoEstado = btn.getAttribute("data-estado");

        const confirmar = confirm(`¿Marcar cita como "${nuevoEstado}"?`);
        if (!confirmar) return;

        try {
          const res = await fetch(`${BACKEND_URL}/api/citas/${id}/estado`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nuevo_estado: nuevoEstado }),
          });

          const body = await res.json();
          if (!res.ok) {
            throw new Error(body.error || "Error al actualizar el estado.");
          }

          alert("Estado de la cita actualizado correctamente.");
          cargarAgendaMedico(contenido); // recarga y re-clasifica
        } catch (err) {
          console.error(err);
          alert(err.message);
        }
      });
    });
  } catch (err) {
    console.error(err);
    contenido.innerHTML = `
      <h3>Agenda de citas</h3>
      <p class="texto-suave" style="color:#b91c1c;">
        ${err.message}
      </p>
    `;
  }
}



// -------------------- PACIENTES DEL MEDICO --------------------
async function cargarPacientesMedico(contenido) {
  // Mensaje inicial
  contenido.innerHTML = `
    <h3>Pacientes asignados</h3>
    <p class="texto-suave">Cargando pacientes...</p>
  `;

  // Validar que tengamos médico logueado
  if (!medicoActual || !medicoActual.id_medico) {
    contenido.innerHTML = `
      <h3>Pacientes asignados</h3>
      <p class="texto-suave" style="color:#b91c1c;">
        No se encontró el id_medico del usuario actual.
      </p>
    `;
    return;
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/medicos/${medicoActual.id_medico}/pacientes`
    );
    const data = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(data.error || 'Error al obtener pacientes del médico.');
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenido.innerHTML = `
        <h3>Pacientes asignados</h3>
        <p class="texto-suave">No hay pacientes asignados a este médico.</p>
      `;
      return;
    }

    // Armar tabla
    let html = `
      <h3>Pacientes asignados</h3>
      <table class="tabla-lista">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>CURP</th>
            <th>Fecha nac.</th>
            <th>Sexo</th>
            <th>Estatus</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const p of data) {
      const nombre = `${p.nombre} ${p.apellido_paterno || ''} ${
        p.apellido_materno || ''
      }`.trim();
      const fechaNac = p.fecha_nacimiento
        ? p.fecha_nacimiento.slice(0, 10)
        : '-';

      html += `
        <tr>
          <td>${nombre}</td>
          <td>${p.curp || '-'}</td>
          <td>${fechaNac}</td>
          <td>${p.sexo || '-'}</td>
          <td>${p.estatus_afiliacion || '-'}</td>
          <td>
            <button class="btn-accion btn-ver-expediente" data-idpac="${
              p.id_paciente
            }">
              Ver expediente
            </button>
          </td>
        </tr>
      `;
    }

    html += `
        </tbody>
      </table>
    `;

    // Pintar tabla
    contenido.innerHTML = html;

    // ➜ Listener de "Ver expediente"
    contenido.querySelectorAll('button.btn-ver-expediente').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idPaciente = btn.getAttribute('data-idpac');
        cargarExpedientePaciente(contenido, idPaciente);
      });
    });
  } catch (error) {
    console.error(error);
    contenido.innerHTML = `
      <h3>Pacientes asignados</h3>
      <p class="texto-suave" style="color:#b91c1c;">${error.message}</p>
    `;
  }
}

// Muestra expediente + pestañas (notas, recetas, órdenes)
async function cargarExpedientePaciente(contenido, idPaciente) {
  contenido.innerHTML = `
    <h3>Expediente clínico</h3>
    <p class="texto-suave">Cargando datos del paciente...</p>
  `;

  try {
    // Resumen de expediente: paciente + expediente actual
    const resResumen = await fetch(
      `${BACKEND_URL}/api/pacientes/${idPaciente}/resumen-expediente`
    );
    const resumen = await resResumen.json();

    if (!resResumen.ok) {
      throw new Error(resumen.error || 'Error al obtener el expediente.');
    }

    const { paciente, expediente } = resumen;

    const nombrePaciente = `${paciente.nombre} ${paciente.apellido_paterno || ''} ${
      paciente.apellido_materno || ''
    }`.trim();

    let html = `
      <h3>Pacientes</h3>

      <p class="texto-suave">
        Resumen de expediente del paciente seleccionado.
      </p>

      <div class="cuadro-resumen">
        <p><strong>Paciente:</strong> ${nombrePaciente}</p>
        <p><strong>CURP:</strong> ${paciente.curp || 'No registrada'}</p>
        <p><strong>Sexo:</strong> ${paciente.sexo || '-'}</p>
        <p><strong>Teléfono:</strong> ${paciente.telefono || '-'}</p>
        <p><strong>Correo:</strong> ${paciente.correo || '-'}</p>
        <p><strong>Estatus afiliación:</strong> ${paciente.estatus_afiliacion || '-'}</p>
        <hr/>
    `;

    if (!expediente) {
      html += `
        <p class="texto-suave" style="color:#b91c1c;">
          Este paciente aún no tiene expediente clínico registrado.
        </p>
      </div>`;
      contenido.innerHTML = html;
      return;
    }

    const fechaApertura = expediente.fecha_apertura
      ? expediente.fecha_apertura.slice(0, 10)
      : '-';
    const ultimaAct = expediente.fecha_ultima_actualizacion
      ? expediente.fecha_ultima_actualizacion.toString().slice(0, 19).replace('T',' ')
      : '-';

    html += `
        <p><strong>ID expediente:</strong> ${expediente.id_expediente}</p>
        <p><strong>Fecha de apertura:</strong> ${fechaApertura}</p>
        <p><strong>Estado:</strong> ${expediente.estado_expediente || '-'}</p>
        <p><strong>Última actualización:</strong> ${ultimaAct}</p>
        <p><strong>Observaciones:</strong> ${
          expediente.observaciones || 'Sin observaciones registradas.'
        }</p>
      </div>

      <!-- Pestañas del expediente -->
      <div class="tabs-expediente" style="margin-top:1rem; border-bottom:1px solid #e5e7eb;">
        <button class="tab-exp active" data-tab="notas">Notas de evolución</button>
        <button class="tab-exp" data-tab="recetas">Recetas médicas</button>
        <button class="tab-exp" data-tab="ordenes">Órdenes de laboratorio</button>
      </div>

      <div id="contenido-expediente" style="margin-top:1rem;"></div>
    `;

    contenido.innerHTML = html;

    // contenedor donde pintan tus funciones cargarNotasEvolucion / etc
    const contExp = contenido.querySelector('#contenido-expediente');

    const cargarNotasTab = () =>
      cargarNotasEvolucion(contExp, expediente.id_expediente);
    const cargarRecetasTab = () =>
      cargarRecetasExpediente(contExp, expediente.id_expediente);
    const cargarOrdenesTab = () =>
      cargarOrdenesExpediente(contExp, expediente.id_expediente);

    // listeners de pestañas
    contenido.querySelectorAll('.tab-exp').forEach((btn) => {
      btn.addEventListener('click', () => {
        contenido
          .querySelectorAll('.tab-exp')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-tab');
        if (tab === 'notas') cargarNotasTab();
        if (tab === 'recetas') cargarRecetasTab();
        if (tab === 'ordenes') cargarOrdenesTab();
      });
    });

    // cargar pestaña inicial
    cargarNotasTab();
  } catch (err) {
    console.error(err);
    contenido.innerHTML = `
      <h3>Expediente clínico</h3>
      <p class="texto-suave" style="color:#b91c1c;">${err.message}</p>
    `;
  }
}



async function cargarNotasEvolucion(contenedor, idExpediente) {
  contenedor.innerHTML = `<p class="texto-suave">Cargando notas de evolución...</p>`;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/expedientes/${idExpediente}/notas`
    );
    const notas = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(notas.error || 'Error al obtener notas de evolución.');
    }

    let html = `
      <h4>Notas de evolución</h4>
      <div class="bloque-form">
        <textarea id="txtNotaEvolucion" rows="3"
          placeholder="Escribe la nueva nota clínica..."></textarea>
        <button id="btnGuardarNota" class="btn-primario">Guardar nota</button>
      </div>
    `;

    if (!Array.isArray(notas) || notas.length === 0) {
      html += `<p class="texto-suave">No hay notas registradas.</p>`;
    } else {
      html += `
        <table class="tabla-lista">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Tipo</th>
              <th>Contenido</th>
            </tr>
          </thead>
          <tbody>
      `;
      for (const n of notas) {
        const fecha = n.fecha_hora
  ? formatDateTimeDisplay(n.fecha_hora) || '-'
  : '-';

        html += `
          <tr>
            <td>${fecha}</td>
            <td>${n.tipo_nota || '-'}</td>
            <td>${n.contenido}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    }

    contenedor.innerHTML = html;

    // Guardar nueva nota
    contenedor.querySelector('#btnGuardarNota').addEventListener('click', async () => {
      const texto = contenedor.querySelector('#txtNotaEvolucion').value.trim();
      if (!texto) {
        alert('Escribe el contenido de la nota.');
        return;
      }

      try {
        const resIns = await fetch(
          `${BACKEND_URL}/api/expedientes/${idExpediente}/notas`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_medico: medicoActual.id_medico,
              tipo_nota: 'evolucion',
              contenido: texto,
            }),
          }
        );
        const body = await resIns.json().catch(() => ({}));
        if (!resIns.ok) throw new Error(body.error || 'No se pudo guardar la nota.');
        cargarNotasEvolucion(contenedor, idExpediente); // recargar lista
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `
      <p class="texto-suave" style="color:#b91c1c;">${err.message}</p>
    `;
  }
}


async function cargarRecetasExpediente(contenedor, idExpediente) {
  contenedor.innerHTML = `<p class="texto-suave">Cargando recetas médicas...</p>`;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/expedientes/${idExpediente}/recetas`
    );
    const recetas = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(recetas.error || 'Error al obtener recetas médicas.');
    }

    let html = `
      <h4>Recetas médicas</h4>
      <div class="bloque-form">
        <input
          type="text"
          id="txtDescripcionReceta"
          placeholder="Descripción breve de la receta (opcional)"
        />
        <input
          type="file"
          id="fileReceta"
          accept=".pdf,.doc,.docx,.docm,.jpg,.jpeg,.png"
        />
        <button id="btnSubirReceta" class="btn-primario">
          Guardar receta
        </button>
      </div>
    `;

    if (!Array.isArray(recetas) || recetas.length === 0) {
      html += `<p class="texto-suave">No hay recetas registradas.</p>`;
    } else {
      html += `
        <table class="tabla-lista">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Archivo</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const r of recetas) {
        const fecha = r.fecha_receta
          ? new Date(r.fecha_receta).toLocaleString('es-MX', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';

        const descripcion = r.descripcion || '-';

        let colArchivo = 'Sin archivo';
        if (r.archivo_ruta) {
          const nombre = r.archivo_nombre_original || 'Ver archivo';
          colArchivo = `
            <button
              class="btn-accion btn-ver-receta"
              data-archivo="${r.archivo_ruta}"
            >
              ${nombre}
            </button>
          `;
        }

        html += `
          <tr>
            <td>${fecha}</td>
            <td>${descripcion}</td>
            <td>${colArchivo}</td>
          </tr>
        `;
      }

      html += `</tbody></table>`;
    }

    contenedor.innerHTML = html;

    // ---- Guardar nueva receta (archivo + descripción) ----
    const btnSubir = contenedor.querySelector('#btnSubirReceta');
    if (btnSubir) {
      btnSubir.addEventListener('click', async () => {
        const inputDesc = contenedor.querySelector('#txtDescripcionReceta');
        const inputFile = contenedor.querySelector('#fileReceta');

        const descripcion = (inputDesc?.value || '').trim();
        const archivo = inputFile?.files[0];

        if (!archivo) {
          alert('Selecciona un archivo de receta (PDF, Word, imagen, etc.).');
          return;
        }

        const formData = new FormData();
        formData.append('id_medico', medicoActual.id_medico);
        formData.append('descripcion', descripcion);
        formData.append('archivo', archivo);

        try {
          const resUp = await fetch(
            `${BACKEND_URL}/api/expedientes/${idExpediente}/recetas/archivo`,
            {
              method: 'POST',
              body: formData,
            }
          );

          const body = await resUp.json().catch(() => ({}));
          if (!resUp.ok) {
            throw new Error(body.error || 'No se pudo guardar la receta.');
          }

          // Limpiar formulario y recargar lista
          if (inputDesc) inputDesc.value = '';
          if (inputFile) inputFile.value = '';

          await cargarRecetasExpediente(contenedor, idExpediente);
          alert('Receta registrada correctamente.');
        } catch (err) {
          console.error(err);
          alert(err.message);
        }
      });
    }

    // ---- Ver archivo de receta ----
    contenedor
      .querySelectorAll('button.btn-ver-receta')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const rutaRelativa = btn.getAttribute('data-archivo'); // <-- AQUÍ viene la ruta
          if (!rutaRelativa) {
            alert('No se encontró la ruta del archivo.');
            return;
          }
          // Mandamos la ruta al proceso principal
          window.electronAPI.verArchivoReceta(rutaRelativa);
        });
      });
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `
      <p class="texto-suave" style="color:#b91c1c;">
        ${err.message}
      </p>
    `;
  }
}





async function cargarOrdenesExpediente(contenedor, idExpediente) {
  contenedor.innerHTML = `<p class="texto-suave">Cargando órdenes de laboratorio...</p>`;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/expedientes/${idExpediente}/ordenes-laboratorio`
    );
    const ordenes = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(
        ordenes.error || 'Error al obtener órdenes de laboratorio.'
      );
    }

    let html = `
      <h4>Órdenes de laboratorio</h4>
      <div class="bloque-form">
        <textarea id="txtObsOrden" rows="3"
          placeholder="Estudios solicitados y observaciones (ej. BH, QS, EGO)..."></textarea>
        <button id="btnGuardarOrden" class="btn-primario">Registrar orden</button>
      </div>
    `;

    if (!Array.isArray(ordenes) || ordenes.length === 0) {
      html += `<p class="texto-suave">No hay órdenes registradas.</p>`;
    } else {
      html += `
        <table class="tabla-lista">
          <thead>
            <tr>
              <th>Fecha solicitud</th>
              <th>Estado</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
      `;
      for (const o of ordenes) {
        const fecha = o.fecha_solicitud
  ? formatDateTimeDisplay(o.fecha_solicitud) || '-'
  : '-';

        html += `
          <tr>
            <td>${fecha}</td>
            <td>${o.estado_orden || '-'}</td>
            <td>${o.observaciones || '-'}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    }

    contenedor.innerHTML = html;

    contenedor.querySelector('#btnGuardarOrden').addEventListener('click', async () => {
      const obs = contenedor.querySelector('#txtObsOrden').value.trim();

      try {
        const resIns = await fetch(
          `${BACKEND_URL}/api/expedientes/${idExpediente}/ordenes-laboratorio`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_medico: medicoActual.id_medico,
              observaciones: obs || null,
            }),
          }
        );
        const body = await resIns.json().catch(() => ({}));
        if (!resIns.ok) throw new Error(body.error || 'No se pudo registrar la orden.');
        cargarOrdenesExpediente(contenedor, idExpediente);
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `
      <p class="texto-suave" style="color:#b91c1c;">${err.message}</p>
    `;
  }
}


