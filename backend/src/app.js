const express = require('express');
const cors = require('cors');
const pool = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.use(cors());
app.use(express.json());


// ---- carpeta de uploads para recetas ----
const uploadsBase = path.join(__dirname, '..', 'uploads');
const uploadsRecetas = path.join(uploadsBase, 'recetas');

// crear carpetas si no existen
fs.mkdirSync(uploadsRecetas, { recursive: true });

// servir estáticos
app.use('/uploads', express.static(uploadsBase));

// configuración de multer para recetas
const storageRecetas = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsRecetas);
  },
  filename: (req, file, cb) => {
  const ext = path.extname(file.originalname);
  const fecha = new Date().toISOString().slice(0, 10); // 2025-11-23
  const nombreLimpio = file.originalname
    .replace(ext, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_"); // quita espacios y acentos

  const nombreUnico = `${nombreLimpio}_${fecha}${ext}`;
  cb(null, nombreUnico);
}

});

const uploadReceta = multer({ storage: storageRecetas });

// Límite de anticipación para cancelar cita (horas) - RF-5
const LIMITE_CANCELACION_HORAS = 24;

// --- Reglas de horario de citas (backend) ---
function validarFechaHoraCitaServidor(fechaHoraStr) {
  if (!fechaHoraStr) return "Fecha/hora de la cita es obligatoria.";

  const d = new Date(fechaHoraStr);
  if (Number.isNaN(d.getTime())) {
    return "La fecha y hora no son válidas.";
  }

  // Debe ser futura
  const ahora = new Date();
  if (d <= ahora) {
    return "La cita debe ser en una fecha y hora futura.";
  }

  // Solo lunes a viernes (0=Dom, 6=Sáb)
  const dia = d.getDay();
  if (dia === 0 || dia === 6) {
    return "Solo se permiten citas de lunes a viernes.";
  }

  const hora = d.getHours();
  const minutos = d.getMinutes();

  // 🔹 Aquí está la clave:
  // Permitimos de 08:00 a 16:00
  if (hora < 8 || hora > 16) {
    return "Horario permitido de 08:00 a 16:00 horas.";
  }

  // Y solo horas exactas
  if (minutos !== 0) {
    return "Las citas solo pueden agendarse en horas exactas (ej. 8:00, 9:00, 15:00).";
  }

  return null; // todo bien
}

// Crear nueva cita para un paciente (desde el portal web)
app.post('/api/pacientes/:id_paciente/citas', async (req, res) => {
  try {
    const { id_paciente } = req.params;
    const { fecha_hora, motivo } = req.body;

    if (!fecha_hora || !motivo) {
      return res
        .status(400)
        .json({ error: 'Fecha/hora y motivo de la cita son obligatorios.' });
    }

    // ✅ Validar horario en el servidor
    const errorHorario = validarFechaHoraCitaServidor(fecha_hora);
    if (errorHorario) {
      return res.status(400).json({ error: errorHorario });
    }

    // 1. Verificar que exista el paciente y obtener su médico tratante
    const [pacRows] = await pool.query(
      `SELECT id_medico_tratante
       FROM pacientes
       WHERE id_paciente = ?
       LIMIT 1`,
      [id_paciente]
    );

    if (pacRows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const idMedico = pacRows[0].id_medico_tratante || null;

    // 2. Insertar la cita incluyendo el id_medico
    const [result] = await pool.query(
      `INSERT INTO citas (
         id_paciente,
         id_medico,
         fecha_hora,
         motivo,
         estado_cita,
         fecha_solicitud
       ) VALUES (?, ?, ?, ?, 'programada', NOW())`,
      [id_paciente, idMedico, fecha_hora, motivo]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Cita creada correctamente.',
      id_cita: result.insertId,
      id_medico: idMedico,
    });
  } catch (error) {
    console.error('Error al crear cita:', error);
    res.status(500).json({ error: 'Error al crear la cita.' });
  }
});


// ---------------- ESTADO DEL SERVIDOR ----------------
app.get('/api/estado', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de shospitalario funcionando ✅' });
});

// ---------------- LOGIN DE USUARIOS INTERNOS (MÉDICOS, ENFERMERÍA, ADMIN) ----------------

app.post('/api/usuarios/login', async (req, res) => {
  try {
    const { nombre_usuario, contrasena } = req.body;

    if (!nombre_usuario || !contrasena) {
      return res
        .status(400)
        .json({ error: 'Nombre de usuario y contraseña son obligatorios' });
    }

    // 1. Buscar usuario
    const [rows] = await pool.query(
      `SELECT id_usuario, nombre_usuario, contrasena_hash, activo
       FROM usuarios
       WHERE nombre_usuario = ?
       LIMIT 1`,
      [nombre_usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuario = rows[0];

    if (!usuario.activo) {
      return res.status(403).json({ error: 'Usuario inactivo en el sistema' });
    }

    // 2. Comparar "hash" (para el proyecto usamos texto plano)
    if (usuario.contrasena_hash !== contrasena) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // 3. Actualizar último acceso
    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?', [
      usuario.id_usuario,
    ]);

    // 4. Obtener roles
    const [rolesRows] = await pool.query(
      `SELECT r.id_rol, r.nombre_rol
       FROM roles r
       INNER JOIN usuario_rol ur ON ur.id_rol = r.id_rol
       WHERE ur.id_usuario = ?`,
      [usuario.id_usuario]
    );

    const roles = rolesRows.map((r) => r.nombre_rol);

    // 5. Ver si es médico
    const [medicoRows] = await pool.query(
      `SELECT id_medico, nombre, apellido_paterno, apellido_materno,
              especialidad, correo
       FROM medicos
       WHERE id_usuario = ? AND activo = 1
       LIMIT 1`,
      [usuario.id_usuario]
    );

    const es_medico = medicoRows.length > 0;

    res.json({
      id_usuario: usuario.id_usuario,
      nombre_usuario: usuario.nombre_usuario,
      roles,
      es_medico,
      medico: es_medico ? medicoRows[0] : null,
    });
  } catch (error) {
    console.error('Error en login de usuario interno:', error);
    res.status(500).json({ error: 'Error al iniciar sesión (usuarios internos)' });
  }
});

// ---------------- PACIENTES PARA PERSONAL (LISTA + RESUMEN DE EXPEDIENTE) ----------------

// Listado básico de pacientes (uso interno, escritorio)
app.get('/api/pacientes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id_paciente,
         nombre,
         apellido_paterno,
         apellido_materno,
         curp,
         fecha_nacimiento,
         sexo,
         estatus_afiliacion
       FROM pacientes
       ORDER BY nombre, apellido_paterno
       LIMIT 100`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.status(500).json({ error: 'Error al obtener la lista de pacientes' });
  }
});

// Resumen de expediente de un paciente
app.get('/api/pacientes/:id_paciente/resumen-expediente', async (req, res) => {
  try {
    const { id_paciente } = req.params;

    // Datos del paciente
    const [pacRows] = await pool.query(
      `SELECT
         id_paciente,
         nombre,
         apellido_paterno,
         apellido_materno,
         curp,
         fecha_nacimiento,
         sexo,
         telefono,
         correo,
         direccion,
         estatus_afiliacion
       FROM pacientes
       WHERE id_paciente = ?
       LIMIT 1`,
      [id_paciente]
    );

    if (pacRows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const paciente = pacRows[0];

    // Último expediente clínico (si hubiera más de uno)
    const [expRows] = await pool.query(
      `SELECT
         id_expediente,
         fecha_apertura,
         estado_expediente,
         observaciones,
         fecha_ultima_actualizacion
       FROM expedientes_clinicos
       WHERE id_paciente = ?
       ORDER BY fecha_apertura DESC
       LIMIT 1`,
      [id_paciente]
    );

    const expediente = expRows.length > 0 ? expRows[0] : null;

    res.json({ paciente, expediente });
  } catch (error) {
    console.error('Error al obtener resumen de expediente:', error);
    res.status(500).json({ error: 'Error al obtener el resumen del expediente' });
  }
});

// ---------------- PACIENTES (ALTA Y CONSULTA BÁSICA) ----------------

// Obtener todos los pacientes (uso interno, no portal)
app.get('/api/pacientes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM pacientes WHERE activo = 1 ORDER BY id_paciente ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al consultar pacientes:', error);
    res.status(500).json({ error: 'Error al consultar pacientes' });
  }
});

// Crear paciente / Crear cuenta desde el portal
app.post('/api/pacientes', async (req, res) => {
  try {
    const {
      nombre,
      apellido_paterno,
      apellido_materno,
      telefono,
      correo,
      direccion,
      fecha_nacimiento,
      sexo,
      curp,
      contrasena,
    } = req.body;

    if (!nombre || !apellido_paterno || !correo || !contrasena) {
      return res.status(400).json({
        error: 'Nombre, apellido paterno, correo y contraseña son obligatorios',
      });
    }

    // Verificar que el correo no esté ya usado
    const [existente] = await pool.query(
      'SELECT id_paciente FROM pacientes WHERE correo = ? AND activo = 1',
      [correo]
    );
    if (existente.length > 0) {
      return res
        .status(400)
        .json({ error: 'Ya existe una cuenta registrada con ese correo' });
    }

    const [result] = await pool.query(
      `INSERT INTO pacientes
       (nombre, apellido_paterno, apellido_materno,
        fecha_nacimiento, sexo, curp, telefono, correo,
        direccion, contrasena, estatus_afiliacion, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo', 1)`,
      [
        nombre,
        apellido_paterno,
        apellido_materno || null,
        fecha_nacimiento || null,
        sexo || null,
        curp || null,
        telefono || null,
        correo,
        direccion || null,
        contrasena,
      ]
    );

    const nuevoPaciente = {
      id_paciente: result.insertId,
      nombre,
      apellido_paterno,
      apellido_materno,
      telefono,
      correo,
      direccion,
      fecha_nacimiento,
      sexo,
      curp,
      estatus_afiliacion: 'Activo',
      activo: 1,
    };

    res.status(201).json(nuevoPaciente);
  } catch (error) {
    console.error('Error al registrar paciente:', error);
    res.status(500).json({ error: 'Error al registrar paciente' });
  }
});

// Obtener un paciente por ID
app.get('/api/pacientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id_paciente, nombre, apellido_paterno, apellido_materno,
              fecha_nacimiento, sexo, curp, telefono, correo, direccion,
              estatus_afiliacion
       FROM pacientes
       WHERE id_paciente = ? AND activo = 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener paciente:', error);
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});

// ---------------- LOGIN PORTAL PACIENTES (correo + contraseña) ----------------

app.post('/api/pacientes/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res
        .status(400)
        .json({ error: 'Correo y contraseña son obligatorios' });
    }

    const [rows] = await pool.query(
      `SELECT id_paciente, nombre, apellido_paterno, apellido_materno,
              fecha_nacimiento, sexo, curp, telefono, correo, direccion,
              estatus_afiliacion, contrasena
       FROM pacientes
       WHERE correo = ? AND activo = 1
       LIMIT 1`,
      [correo]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const paciente = rows[0];

    if (paciente.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    delete paciente.contrasena;

    res.json(paciente);
  } catch (error) {
    console.error('Error en login de paciente:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ---------------- CITAS DEL PACIENTE (RF-3, RF-5) ----------------

// Historial de citas de un paciente
app.get('/api/pacientes/:id/citas', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT c.*,
              TIMESTAMPDIFF(HOUR, NOW(), c.fecha_hora) AS horas_antes,
              (TIMESTAMPDIFF(HOUR, NOW(), c.fecha_hora) >= ?) AS puede_cancelar
       FROM citas c
       WHERE c.id_paciente = ?
       ORDER BY c.fecha_hora DESC`,
      [LIMITE_CANCELACION_HORAS, id]
    );
    res.json({
      limite_cancelacion_horas: LIMITE_CANCELACION_HORAS,
      citas: rows,
    });
  } catch (error) {
    console.error('Error al consultar citas:', error);
    res.status(500).json({ error: 'Error al consultar citas' });
  }
});

// Cancelar cita (con validación del límite de anticipación)
app.patch('/api/citas/:id_cita/cancelar', async (req, res) => {
  try {
    const { id_cita } = req.params;
    const { id_paciente } = req.body;

    if (!id_paciente) {
      return res.status(400).json({ error: 'id_paciente es obligatorio.' });
    }

    const [rows] = await pool.query(
      `SELECT fecha_hora, estado_cita,
              TIMESTAMPDIFF(HOUR, NOW(), fecha_hora) AS horas_antes
       FROM citas
       WHERE id_cita = ? AND id_paciente = ?
       LIMIT 1`,
      [id_cita, id_paciente]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'No se encontró la cita para este paciente.' });
    }

    const cita = rows[0];

    if (cita.estado_cita !== 'programada') {
      return res
        .status(400)
        .json({ error: 'Solo se pueden cancelar citas programadas.' });
    }

    if (cita.horas_antes < LIMITE_CANCELACION_HORAS) {
      return res.status(400).json({
        error: `La cita solo se puede cancelar con al menos ${LIMITE_CANCELACION_HORAS} horas de anticipación.`,
      });
    }

    await pool.query(
      `UPDATE citas
       SET estado_cita = 'cancelada',
           fecha_cancelacion = NOW()
       WHERE id_cita = ?`,
      [id_cita]
    );

    res.json({ ok: true, mensaje: 'Cita cancelada correctamente.' });
  } catch (error) {
    console.error('Error al cancelar cita:', error);
    res.status(500).json({ error: 'Error al cancelar la cita.' });
  }
});

// ---------------- Cambiar estado de una cita (atendida / no asistió / etc.) ----------------
app.patch('/api/citas/:id_cita/estado', async (req, res) => {
  try {
    const { id_cita } = req.params;
    const { nuevo_estado } = req.body;

    if (!nuevo_estado) {
      return res
        .status(400)
        .json({ error: 'El campo "nuevo_estado" es obligatorio.' });
    }

    // Estados permitidos en tu modelo de citas
    const ESTADOS_PERMITIDOS = ['programada', 'atendida', 'no asistió', 'cancelada'];

    if (!ESTADOS_PERMITIDOS.includes(nuevo_estado)) {
      return res.status(400).json({
        error: `Estado no válido. Debe ser uno de: ${ESTADOS_PERMITIDOS.join(
          ', '
        )}.`,
      });
    }

    // 1. Verificar que la cita exista
    const [rows] = await pool.query(
      'SELECT id_cita, estado_cita FROM citas WHERE id_cita = ?',
      [id_cita]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    const cita = rows[0];

    // (Opcional) Reglas de transición: solo permitir cambiar desde "programada"
    if (cita.estado_cita !== 'programada') {
      return res.status(400).json({
        error: `Solo se pueden cambiar citas en estado "programada". Estado actual: "${cita.estado_cita}".`,
      });
    }

    // 2. Actualizar el estado
    await pool.query(
      'UPDATE citas SET estado_cita = ? WHERE id_cita = ?',
      [nuevo_estado, id_cita]
    );

    res.json({
      ok: true,
      mensaje: 'Estado de la cita actualizado correctamente.',
      id_cita,
      estado_anterior: cita.estado_cita,
      estado_nuevo: nuevo_estado,
    });
  } catch (error) {
    console.error('Error al actualizar estado de la cita:', error);
    res
      .status(500)
      .json({ error: 'Error al actualizar el estado de la cita.' });
  }
});


// Solicitar nueva cita (portal web)
app.post('/api/pacientes/:id_paciente/citas', async (req, res) => {
  try {
    const { id_paciente } = req.params;
    const { fecha_hora, motivo } = req.body;

    if (!fecha_hora || !motivo) {
      return res
        .status(400)
        .json({ error: 'Fecha/hora y motivo de la cita son obligatorios.' });
    }

    // ✅ Validar horario permitido (lunes a viernes, 08–16, horas exactas)
    const validacion = esFechaHoraValidaCita(fecha_hora);
    if (!validacion.ok) {
      return res.status(400).json({ error: validacion.mensaje });
    }

    // 1. Verificar que exista el paciente y obtener su médico tratante
    const [pacRows] = await pool.query(
      `SELECT id_medico_tratante
       FROM pacientes
       WHERE id_paciente = ?
       LIMIT 1`,
      [id_paciente]
    );

    if (pacRows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const idMedico = pacRows[0].id_medico_tratante || null;

    // (Opcional) si quieres obligar a que todos tengan médico:
    // if (!idMedico) {
    //   return res.status(400).json({
    //     error:
    //       'El paciente no tiene médico tratante asignado. Favor de contactar al hospital.',
    //   });
    // }

    // 2. Insertar la cita incluyendo el id_medico
    const [result] = await pool.query(
      `INSERT INTO citas (
         id_paciente,
         id_medico,
         fecha_hora,
         motivo,
         estado_cita,
         fecha_solicitud
       ) VALUES (?, ?, ?, ?, 'programada', NOW())`,
      [id_paciente, idMedico, fecha_hora, motivo]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Cita creada correctamente.',
      id_cita: result.insertId,
      id_medico: idMedico,
    });
  } catch (error) {
    console.error('Error al crear cita:', error);
    res.status(500).json({ error: 'Error al crear la cita.' });
  }
});

// Reagendar cita (portal paciente)
app.put('/api/citas/:id_cita', async (req, res) => {
  try {
    const { id_cita } = req.params;
    const { id_paciente, nueva_fecha_hora } = req.body;

    if (!id_paciente) {
      return res.status(400).json({ error: 'id_paciente es obligatorio.' });
    }

    const validacion = esFechaHoraValidaCita(nueva_fecha_hora);
    if (!validacion.ok) {
      return res.status(400).json({ error: validacion.mensaje });
    }

    const [result] = await pool.query(
      `UPDATE citas
       SET fecha_hora = ?
       WHERE id_cita = ? AND id_paciente = ? AND estado_cita = 'programada'`,
      [nueva_fecha_hora, id_cita, id_paciente]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: 'No se encontró la cita programada para este paciente.' });
    }

    res.json({ ok: true, mensaje: 'Cita reagendada correctamente.' });
  } catch (error) {
    console.error('Error al reagendar cita:', error);
    res.status(500).json({ error: 'Error al reagendar la cita.' });
  }
});

// Citas de un médico (para la app de escritorio)
// Citas del médico (futuras e historial)
app.get('/api/medicos/:id_medico/citas', async (req, res) => {
  try {
    const { id_medico } = req.params;

    const [rows] = await pool.query(
      `SELECT
         c.id_cita,
         c.id_paciente,
         c.id_medico,
         c.fecha_hora,
         c.motivo,
         c.estado_cita,
         c.fecha_solicitud,
         c.fecha_cancelacion,
         p.nombre,
         p.apellido_paterno,
         p.apellido_materno
       FROM citas c
       INNER JOIN pacientes p ON p.id_paciente = c.id_paciente
       WHERE c.id_medico = ?
       ORDER BY c.fecha_hora`,
      [id_medico]
    );

    const ahora = new Date();
    const futuras = [];
    const historial = [];

    for (const c of rows) {
      const estado = (c.estado_cita || '').toLowerCase();
      const fecha = c.fecha_hora ? new Date(c.fecha_hora) : null;

      // Próximas: solo programadas y con fecha en el futuro
      if (estado === 'programada' && fecha && fecha >= ahora) {
        futuras.push(c);
      } else {
        // Todo lo demás se considera historial
        historial.push(c);
      }
    }

    // Ordenamos: próximas ascendente, historial descendente (más reciente primero)
    futuras.sort(
      (a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora)
    );
    historial.sort(
      (a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)
    );

    res.json({ futuras, historial });
  } catch (error) {
    console.error('Error al obtener citas del médico:', error);
    res
      .status(500)
      .json({ error: 'Error al obtener la agenda de citas del médico.' });
  }
});

// Cambiar estado de una cita (ej. atendida, no asistió)
app.patch('/api/citas/:id_cita/estado', async (req, res) => {
  try {
    const { id_cita } = req.params;
    const { nuevo_estado } = req.body;

    if (!nuevo_estado) {
      return res.status(400).json({ error: 'Debes enviar un nuevo estado.' });
    }

    await pool.query(
      `UPDATE citas SET estado_cita = ?, fecha_actualizacion = NOW()
       WHERE id_cita = ?`,
      [nuevo_estado, id_cita]
    );

    res.json({ ok: true, mensaje: 'Estado de la cita actualizado.' });
  } catch (error) {
    console.error('Error al actualizar estado de cita:', error);
    res.status(500).json({ error: 'Error al actualizar el estado de la cita.' });
  }
});


// ---------------- RECETAS MÉDICAS DEL PACIENTE (RF-4) ----------------

app.get('/api/pacientes/:id/recetas', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id_receta, fecha_receta, descripcion, medicamentos, indicaciones
       FROM recetas_medicas
       WHERE id_paciente = ?
       ORDER BY fecha_receta DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al consultar recetas:', error);
    res.status(500).json({ error: 'Error al consultar recetas' });
  }
});

// ---------------- RESULTADOS DE LABORATORIO DEL PACIENTE (RF-7) ----------------

app.get('/api/pacientes/:id/resultados-laboratorio', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT r.id_resultado,
              r.nombre_estudio,
              r.resultado,
              r.unidad,
              r.valores_referencia,
              r.fecha_resultado,
              r.observaciones
       FROM resultados_laboratorio r
       INNER JOIN ordenes_laboratorio o ON r.id_orden = o.id_orden
       INNER JOIN expedientes_clinicos e ON o.id_expediente = e.id_expediente
       WHERE e.id_paciente = ?
       ORDER BY r.fecha_resultado DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al consultar resultados de laboratorio:', error);
    res.status(500).json({ error: 'Error al consultar resultados de laboratorio' });
  }
});

module.exports = app;

// ---------------- PACIENTES ASIGNADOS A UN MÉDICO ----------------

app.get('/api/medicos/:id_medico/pacientes', async (req, res) => {
  try {
    const { id_medico } = req.params;

    const [rows] = await pool.query(
      `SELECT
         p.id_paciente,
         p.nombre,
         p.apellido_paterno,
         p.apellido_materno,
         p.curp,
         p.fecha_nacimiento,
         p.sexo,
         p.estatus_afiliacion
       FROM pacientes p
       WHERE p.id_medico_tratante = ? AND p.activo = 1
       ORDER BY p.nombre, p.apellido_paterno`,
      [id_medico]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener pacientes del médico:', error);
    res.status(500).json({ error: 'Error al obtener pacientes del médico.' });
  }
});

// ---------------- NOTAS DE EVOLUCIÓN (MÉDICO) ----------------

// Listar notas de un expediente
app.get('/api/expedientes/:id_expediente/notas', async (req, res) => {
  try {
    const { id_expediente } = req.params;

    const [rows] = await pool.query(
      `SELECT
         n.id_nota,
         n.id_expediente,
         n.id_medico,
         n.fecha_hora,
         n.tipo_nota,
         n.contenido
       FROM notas_evolucion n
       WHERE n.id_expediente = ?
       ORDER BY n.fecha_hora DESC
       LIMIT 50`,
      [id_expediente]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener notas de evolución:', error);
    res.status(500).json({ error: 'Error al obtener notas de evolución.' });
  }
});

// Crear una nueva nota de evolución
app.post('/api/expedientes/:id_expediente/notas', async (req, res) => {
  try {
    const { id_expediente } = req.params;
    const { id_medico, tipo_nota, contenido } = req.body;

    if (!id_medico || !contenido) {
      return res
        .status(400)
        .json({ error: 'id_medico y contenido de la nota son obligatorios.' });
    }

    const tipo = tipo_nota || 'evolucion';

    const [result] = await pool.query(
      `INSERT INTO notas_evolucion
         (id_expediente, id_medico, fecha_hora, tipo_nota, contenido)
       VALUES (?, ?, NOW(), ?, ?)`,
      [id_expediente, id_medico, tipo, contenido]
    );

    res.status(201).json({
      ok: true,
      id_nota: result.insertId,
    });
  } catch (error) {
    console.error('Error al crear nota de evolución:', error);
    res.status(500).json({ error: 'Error al crear nota de evolución.' });
  }
});

// ============================
// RECETAS MÉDICAS POR EXPEDIENTE
// (usando id_paciente internamente)
// ============================

// Recetas de un expediente (para el módulo médico de escritorio)
app.get('/api/expedientes/:id_expediente/recetas', async (req, res) => {
  try {
    const { id_expediente } = req.params;

    // 1) Dueño del expediente
    const [expRows] = await pool.query(
      `SELECT id_paciente
       FROM expedientes_clinicos
       WHERE id_expediente = ?
       LIMIT 1`,
      [id_expediente]
    );

    if (expRows.length === 0) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const idPaciente = expRows[0].id_paciente;

    // 2) Recetas del paciente (incluyendo archivo)
    const [rows] = await pool.query(
      `SELECT
         id_receta,
         fecha_receta,
         descripcion,
         archivo_nombre_original,
         archivo_ruta,
         archivo_tipo
       FROM recetas_medicas
       WHERE id_paciente = ?
       ORDER BY fecha_receta DESC`,
      [idPaciente]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener recetas:', error);
    res.status(500).json({ error: 'Error al obtener recetas médicas.' });
  }
});


// Registrar una nueva receta médica (archivo + descripción opcional) ligada al expediente
app.post(
  '/api/expedientes/:id_expediente/recetas',
  uploadReceta.single('archivo'), // campo "archivo" en el form-data
  async (req, res) => {
    try {
      const { id_expediente } = req.params;
      const { id_medico, descripcion } = req.body;

      // 1) Validaciones básicas
      if (!id_medico) {
        return res.status(400).json({
          error: 'El id_medico es obligatorio.',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Debes adjuntar el archivo de la receta.',
        });
      }

      // 2) Obtener al paciente dueño del expediente
      const [expRows] = await pool.query(
        `SELECT id_paciente
         FROM expedientes_clinicos
         WHERE id_expediente = ?
         LIMIT 1`,
        [id_expediente]
      );

      if (expRows.length === 0) {
        return res.status(404).json({ error: 'Expediente no encontrado.' });
      }

      const idPaciente = expRows[0].id_paciente;

      // 3) Datos del archivo
      //  - req.file.filename es el nombre que generaste con multer
      //  - aquí guardamos ruta relativa para luego servirlo
      const rutaRelativa = path.join('uploads', 'recetas', req.file.filename);

      // 4) Insertar la receta en la tabla recetas_medicas
      //    Dejamos medicamentos e indicaciones en NULL porque ya no los usamos
      const [result] = await pool.query(
        `INSERT INTO recetas_medicas
         (id_paciente,
          id_medico,
          fecha_receta,
          descripcion,
          medicamentos,
          indicaciones,
          archivo_nombre_original,
          archivo_ruta,
          archivo_tipo)
         VALUES (?, ?, NOW(), ?, NULL, NULL, ?, ?, ?)`,
        [
          idPaciente,
          id_medico,
          descripcion || null,       // descripción opcional
          req.file.originalname,     // nombre original del archivo
          rutaRelativa,              // ruta relativa donde lo guardaste
          req.file.mimetype,         // tipo MIME (application/pdf, etc.)
        ]
      );

      res.status(201).json({
        ok: true,
        mensaje: 'Receta con archivo registrada correctamente.',
        id_receta: result.insertId,
        archivo: rutaRelativa,
      });
    } catch (error) {
      console.error('Error al registrar receta con archivo:', error);
      res.status(500).json({
        error: 'Error al registrar receta con archivo.',
      });
    }
  }
);




// ---------------- ÓRDENES DE LABORATORIO (MÉDICO) ----------------

// Listar órdenes de laboratorio de un expediente
app.get('/api/expedientes/:id_expediente/ordenes-laboratorio', async (req, res) => {
  try {
    const { id_expediente } = req.params;

    const [rows] = await pool.query(
      `SELECT
         o.id_orden,
         o.id_expediente,
         o.id_medico_solicita,
         o.fecha_solicitud,
         o.estado_orden,
         o.observaciones
       FROM ordenes_laboratorio o
       WHERE o.id_expediente = ?
       ORDER BY o.fecha_solicitud DESC
       LIMIT 50`,
      [id_expediente]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener órdenes de laboratorio:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de laboratorio.' });
  }
});

// Crear una nueva orden de laboratorio
app.post('/api/expedientes/:id_expediente/ordenes-laboratorio', async (req, res) => {
  try {
    const { id_expediente } = req.params;
    const { id_medico, observaciones } = req.body;

    if (!id_medico) {
      return res
        .status(400)
        .json({ error: 'id_medico es obligatorio para la orden.' });
    }

    const [result] = await pool.query(
      `INSERT INTO ordenes_laboratorio
         (id_expediente, id_medico_solicita, fecha_solicitud, estado_orden, observaciones)
       VALUES (?, ?, NOW(), 'solicitada', ?)`,
      [id_expediente, id_medico, observaciones || null]
    );

    res.status(201).json({
      ok: true,
      id_orden: result.insertId,
    });
  } catch (error) {
    console.error('Error al crear orden de laboratorio:', error);
    res.status(500).json({ error: 'Error al crear orden de laboratorio.' });
  }
});
