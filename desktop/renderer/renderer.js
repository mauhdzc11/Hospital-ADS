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
  if (vista === "pacientes") {
    cargarPacientes(contenido);
    return;
  }

  if (vista === "agenda") {
    cargarAgendaMedico(contenido);
    return;
  }

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

// -------------------- PACIENTES + RESUMEN EXPEDIENTE --------------------

async function cargarPacientes(contenido) {
  contenido.innerHTML = `
    <h3>Pacientes</h3>
    <p class="texto-suave">
      Cargando lista de pacientes desde el sistema...
    </p>
  `;

  try {
    const res = await fetch(`${BACKEND_URL}/api/pacientes`);
    const data = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(data.error || "No se pudo obtener la lista de pacientes.");
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenido.innerHTML = `
        <h3>Pacientes</h3>
        <p class="texto-suave">
          No se encontraron pacientes registrados.
        </p>
      `;
      return;
    }

    let html = `
      <h3>Pacientes</h3>
      <p class="texto-suave">
        Selecciona un paciente para ver un resumen de su expediente clínico.
      </p>
      <table class="tabla-lista">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre completo</th>
            <th>CURP</th>
            <th>Fecha nac.</th>
            <th>Estatus</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const p of data) {
      const nombreCompleto = `${p.nombre} ${p.apellido_paterno || ""} ${
        p.apellido_materno || ""
      }`.trim();

      const fechaNac = p.fecha_nacimiento
        ? p.fecha_nacimiento.slice(0, 10)
        : "-";

      html += `
        <tr>
          <td>${p.id_paciente}</td>
          <td>${nombreCompleto}</td>
          <td>${p.curp || "-"}</td>
          <td>${fechaNac}</td>
          <td>${p.estatus_afiliacion || "-"}</td>
          <td>
            <button
              class="btn btn-outline btn-sm"
              data-id-paciente="${p.id_paciente}"
            >
              Ver expediente
            </button>
          </td>
        </tr>
      `;
    }

    html += `
        </tbody>
      </table>
      <div id="detalle-expediente" class="detalle-expediente"></div>
    `;

    contenido.innerHTML = html;

    contenido
      .querySelectorAll("[data-id-paciente]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id-paciente");
          cargarResumenExpediente(id);
        });
      });
  } catch (err) {
    console.error(err);
    contenido.innerHTML = `
      <h3>Pacientes</h3>
      <p class="texto-suave" style="color:#b91c1c;">
        ${err.message}
      </p>
    `;
  }
}

async function cargarResumenExpediente(idPaciente) {
  const contDetalle = document.getElementById("detalle-expediente");
  if (!contDetalle) return;

  contDetalle.innerHTML = `
    <h4>Resumen de expediente</h4>
    <p class="texto-suave">Cargando información...</p>
  `;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/pacientes/${idPaciente}/resumen-expediente`
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "No se pudo obtener el expediente.");
    }

    const p = data.paciente;
    const e = data.expediente;

    const nombreCompleto = `${p.nombre} ${p.apellido_paterno || ""} ${
      p.apellido_materno || ""
    }`.trim();

    let html = `
      <h4>Resumen de expediente</h4>
      <p><strong>Paciente:</strong> ${nombreCompleto}</p>
      <p><strong>CURP:</strong> ${p.curp || "-"}</p>
      <p><strong>Sexo:</strong> ${p.sexo || "-"}</p>
      <p><strong>Teléfono:</strong> ${p.telefono || "-"}</p>
      <p><strong>Correo:</strong> ${p.correo || "-"}</p>
      <p><strong>Estatus afiliación:</strong> ${
        p.estatus_afiliacion || "-"
      }</p>
    `;

    if (e) {
      html += `
        <hr/>
        <p><strong>ID expediente:</strong> ${e.id_expediente}</p>
        <p><strong>Fecha de apertura:</strong> ${
          e.fecha_apertura ? e.fecha_apertura.slice(0, 10) : "-"
        }</p>
        <p><strong>Estado:</strong> ${e.estado_expediente || "-"}</p>
        <p><strong>Última actualización:</strong> ${
          e.fecha_ultima_actualizacion
            ? e.fecha_ultima_actualizacion.toString().replace("T", " ").slice(0, 19)
            : "-"
        }</p>
        <p><strong>Observaciones:</strong> ${
          e.observaciones || "Sin observaciones registradas."
        }</p>
      `;
    } else {
      html += `
        <hr/>
        <p class="texto-suave">
          Este paciente aún no tiene expediente clínico registrado en el sistema.
        </p>
      `;
    }

    contDetalle.innerHTML = html;
  } catch (err) {
    console.error(err);
    contDetalle.innerHTML = `
      <h4>Resumen de expediente</h4>
      <p class="texto-suave" style="color:#b91c1c;">
        ${err.message}
      </p>
    `;
  }
}

// -------------------- AGENDA DE CITAS DEL MÉDICO --------------------

async function cargarAgendaMedico(contenido) {
  contenido.innerHTML = `
    <h3>Agenda de citas</h3>
    <p class="texto-suave">
      Cargando agenda de citas del médico...
    </p>
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
    const data = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(
        data.error || "No se pudo obtener la agenda de citas del médico."
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenido.innerHTML = `
        <h3>Agenda de citas</h3>
        <p class="texto-suave">
          No hay citas registradas para este médico.
        </p>
      `;
      return;
    }

    const ahora = new Date();
    const citasFuturas = [];
    const historialCitas = [];

    for (const c of data) {
      if (!c.fecha_hora) {
        historialCitas.push(c);
        continue;
      }
      const fecha = new Date(c.fecha_hora);
      if (c.estado_cita === "programada" && fecha >= ahora) {
        citasFuturas.push(c);
      } else {
        historialCitas.push(c);
      }
    }

    let html = `
      <h3>Agenda de citas</h3>
      <p class="texto-suave">
        Citas asociadas al médico ${medicoActual.nombre} ${
      medicoActual.apellido_paterno || ""
    }.
      </p>
    `;

    if (citasFuturas.length === 0 && historialCitas.length === 0) {
      html += `
        <p class="texto-suave">
          No hay citas registradas para este médico.
        </p>
      `;
      contenido.innerHTML = html;
      return;
    }

    // Próximas citas
    if (citasFuturas.length > 0) {
      html += `
        <h4>Próximas citas</h4>
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

      for (const c of citasFuturas) {
        const nombrePaciente = `${c.nombre} ${c.apellido_paterno || ""} ${
          c.apellido_materno || ""
        }`.trim();

        let fechaHora = "-";
        if (c.fecha_hora) {
          fechaHora = c.fecha_hora.toString().replace("T", " ").slice(0, 16);
        }

        html += `
          <tr>
            <td>${fechaHora}</td>
            <td>${nombrePaciente}</td>
            <td>${c.motivo || "-"}</td>
            <td>${c.estado_cita || "-"}</td>
          </tr>
        `;
      }

      html += `
          </tbody>
        </table>
      `;
    }

    // Historial de citas
    if (historialCitas.length > 0) {
      html += `
        <h4 style="margin-top:1rem;">Historial de citas</h4>
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

      for (const c of historialCitas) {
        const nombrePaciente = `${c.nombre} ${c.apellido_paterno || ""} ${
          c.apellido_materno || ""
        }`.trim();

        let fechaHora = "-";
        if (c.fecha_hora) {
          fechaHora = c.fecha_hora.toString().replace("T", " ").slice(0, 16);
        }

        html += `
          <tr>
            <td>${fechaHora}</td>
            <td>${nombrePaciente}</td>
            <td>${c.motivo || "-"}</td>
            <td>${c.estado_cita || "-"}</td>
          </tr>
        `;
      }

      html += `
          </tbody>
        </table>
      `;
    }

    contenido.innerHTML = html;
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
async function cargarPacientesMedico(contenido) {
  contenido.innerHTML = `
    <h3>Pacientes asignados</h3>
    <p class="texto-suave">Cargando pacientes...</p>
  `;

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
    const res = await fetch(`${BACKEND_URL}/api/medicos/${medicoActual.id_medico}/pacientes`);
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
      const nombre = `${p.nombre} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.trim();
      const fechaNac = p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 10) : '-';

      html += `
        <tr>
          <td>${nombre}</td>
          <td>${p.curp || '-'}</td>
          <td>${fechaNac}</td>
          <td>${p.sexo || '-'}</td>
          <td>${p.estatus_afiliacion || '-'}</td>
          <td>
            <button class="btn-accion" data-idpac="${p.id_paciente}">
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

    contenido.innerHTML = html;

    // listeners de botones
    contenido.querySelectorAll('button.btn-accion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idPaciente = btn.getAttribute('data-idpac');
        cargarExpedientePaciente(contenido, idPaciente);
      });
    });
  } catch (err) {
    console.error(err);
    contenido.innerHTML = `
      <h3>Pacientes asignados</h3>
      <p class="texto-suave" style="color:#b91c1c;">${err.message}</p>
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

    const contExp = contenido.querySelector('#contenido-expediente');

    const cargarNotas = () =>
      cargarNotasEvolucion(contExp, expediente.id_expediente);
    const cargarRecetas = () =>
      cargarRecetasExpediente(contExp, expediente.id_expediente);
    const cargarOrdenes = () =>
      cargarOrdenesExpediente(contExp, expediente.id_expediente);

    // listeners de pestañas
    contenido.querySelectorAll('.tab-exp').forEach((btn) => {
      btn.addEventListener('click', () => {
        contenido
          .querySelectorAll('.tab-exp')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-tab');
        if (tab === 'notas') cargarNotas();
        if (tab === 'recetas') cargarRecetas();
        if (tab === 'ordenes') cargarOrdenes();
      });
    });

    // cargar pestaña inicial
    cargarNotas();
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
        <textarea id="txtNotaEvolucion" rows="3" placeholder="Escribe la nueva nota clínica..."></textarea>
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
          ? n.fecha_hora.toString().replace('T', ' ').slice(0, 16)
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
        if (!resIns.ok) {
          throw new Error(body.error || 'No se pudo guardar la nota.');
        }
        cargarNotasEvolucion(contenedor, idExpediente);
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
          placeholder="Descripción general de la receta (opcional)"
        />
        <textarea
          id="txtMedicamentos"
          rows="3"
          placeholder="Medicamentos (ej. Paracetamol 500mg VO c/8h por 5 días)"
        ></textarea>
        <textarea
          id="txtIndicaciones"
          rows="2"
          placeholder="Indicaciones adicionales para el paciente (opcional)"
        ></textarea>
        <button id="btnGuardarReceta" class="btn-primario">Guardar receta</button>
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
              <th>Medicamentos</th>
            </tr>
          </thead>
          <tbody>
      `;
      for (const r of recetas) {
        const fecha = r.fecha_receta
          ? r.fecha_receta.toString().replace('T', ' ').slice(0, 16)
          : '-';
        html += `
          <tr>
            <td>${fecha}</td>
            <td>${r.descripcion || '-'}</td>
            <td>${r.medicamentos}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    }

    contenedor.innerHTML = html;

    contenedor.querySelector('#btnGuardarReceta').addEventListener('click', async () => {
      const descr = contenedor.querySelector('#txtDescripcionReceta').value.trim();
      const meds = contenedor.querySelector('#txtMedicamentos').value.trim();
      const indic = contenedor.querySelector('#txtIndicaciones').value.trim();

      if (!meds) {
        alert('Debes capturar los medicamentos.');
        return;
      }

      try {
        const resIns = await fetch(
          `${BACKEND_URL}/api/expedientes/${idExpediente}/recetas`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_medico: medicoActual.id_medico,
              descripcion: descr,
              medicamentos: meds,
              indicaciones: indic,
            }),
          }
        );
        const body = await resIns.json().catch(() => ({}));
        if (!resIns.ok) {
          throw new Error(body.error || 'No se pudo guardar la receta.');
        }
        cargarRecetasExpediente(contenedor, idExpediente);
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
        <textarea
          id="txtObsOrden"
          rows="3"
          placeholder="Estudios solicitados y observaciones (ej. BH, QS, EGO)..."
        ></textarea>
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
          ? o.fecha_solicitud.toString().replace('T', ' ').slice(0, 16)
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
      if (!obs) {
        if (!confirm('No escribiste observaciones. ¿Registrar de todos modos?')) {
          return;
        }
      }

      try {
        const resIns = await fetch(
          `${BACKEND_URL}/api/expedientes/${idExpediente}/ordenes-laboratorio`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_medico: medicoActual.id_medico,
              observaciones: obs,
            }),
          }
        );
        const body = await resIns.json().catch(() => ({}));
        if (!resIns.ok) {
          throw new Error(body.error || 'No se pudo registrar la orden.');
        }
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

