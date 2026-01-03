// app.js - Backend principal de Hospital-ADS
// ------------------------------------------
// Organización de este archivo:
//
//  1) Imports, configuración general y estáticos
//  2) Configuración de uploads (recetas)
//  3) Constantes y utilidades (validación de citas)
//  4) Rutas de estado y login (usuarios internos y pacientes)
//  5) Pacientes (alta, consulta, resumen de expediente, pacientes por médico)
//  6) Citas (paciente y médico)
//  7) Recetas médicas (paciente y expediente, con archivo)
//  8) Órdenes y resultados de laboratorio (expediente + portal paciente)
//  9) Notas de evolución (expediente clínico)
//
//  Al final: module.exports = app
// ------------------------------------------

const express = require('express');
const cors = require('cors');
const pool = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.use(cors());
app.use(express.json());

// ------------------------------------------
// 1) ARCHIVOS ESTÁTICOS
// ------------------------------------------

// Archivos estáticos generales (si se necesitan)
app.use('/files', express.static(path.join(__dirname, '..')));

// Base de uploads
const uploadsBase = path.join(__dirname, '..', 'uploads');
const uploadsRecetas = path.join(uploadsBase, 'recetas');

// Crear carpetas si no existen
fs.mkdirSync(uploadsRecetas, { recursive: true });

// Servir carpeta de uploads (recetas, etc.)
app.use('/uploads', express.static(uploadsBase));

// ------------------------------------------
// 2) CONFIGURACIÓN DE MULTER PARA RECETAS
// ------------------------------------------

const storageRecetas = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsRecetas);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const nombreLimpio = file.originalname
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_'); // quita espacios y acentos

    const nombreUnico = `${nombreLimpio}_${fecha}${ext}`;
    cb(null, nombreUnico);
  },
});

const uploadReceta = multer({ storage: storageRecetas });

// ------------------------------------------
// 3) CONSTANTES Y UTILIDADES
// ------------------------------------------

// Límite de anticipación para cancelar cita (horas) - RF-5
const LIMITE_CANCELACION_HORAS = 24;

/**
 * Migraciones mínimas automáticas para que el proyecto funcione
 * solo reemplazando archivos (sin ejecutar SQL manual).
 *
 * Nota: Si alguna tabla/columna no existe en tu BD, aquí se crea/agrega.
 */
async function ensureSchemaMinimo() {
  // Helpers
  const hasColumn = async (table, column) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [table, column]
    );
    return (rows?.[0]?.cnt || 0) > 0;
  };

  const addColumnIfMissing = async (table, column, alterSql) => {
    const exists = await hasColumn(table, column);
    if (exists) return;
    await pool.query(alterSql);
    console.log(`✅ Migración: columna agregada ${table}.${column}`);
  };

  // 1) Triage en pacientes (verde/amarillo/rojo)
  await addColumnIfMissing(
    'pacientes',
    'triage',
    `ALTER TABLE pacientes
       ADD COLUMN triage VARCHAR(10) NOT NULL DEFAULT 'verde'`
  );

  // 2) Solicitud de cambio de médico en citas (se guarda y aplica en la siguiente cita)
  await addColumnIfMissing(
    'citas',
    'solicita_cambio_medico',
    `ALTER TABLE citas
       ADD COLUMN solicita_cambio_medico TINYINT(1) NOT NULL DEFAULT 0`
  );

  await addColumnIfMissing(
    'citas',
    'motivo_cambio_medico',
    `ALTER TABLE citas
       ADD COLUMN motivo_cambio_medico VARCHAR(255) NULL`
  );

  // 3) Vigencia de recetas (3 días hábiles)
  await addColumnIfMissing(
    'recetas_medicas',
    'fecha_vigencia',
    `ALTER TABLE recetas_medicas
       ADD COLUMN fecha_vigencia DATETIME NULL`
  );

  // 4) Historial de modificaciones de nota evolutiva
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notas_evolucion_historial (
      id_historial INT AUTO_INCREMENT PRIMARY KEY,
      id_nota INT NOT NULL,
      id_medico INT NOT NULL,
      fecha_cambio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      contenido_anterior TEXT NULL,
      contenido_nuevo TEXT NULL,
      INDEX idx_historial_nota (id_nota),
      INDEX idx_historial_fecha (fecha_cambio)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 5) Datos mínimos de urgencias (RF-5)
await addColumnIfMissing(
  'pacientes',
  'alergias',
  `ALTER TABLE pacientes ADD COLUMN alergias TEXT NULL`
);

await addColumnIfMissing(
  'pacientes',
  'enfermedades_cronicas',
  `ALTER TABLE pacientes ADD COLUMN enfermedades_cronicas TEXT NULL`
);

await addColumnIfMissing(
  'pacientes',
  'enfermedades_hereditarias',
  `ALTER TABLE pacientes ADD COLUMN enfermedades_hereditarias TEXT NULL`
);

await addColumnIfMissing(
  'pacientes',
  'motivo_ingreso',
  `ALTER TABLE pacientes ADD COLUMN motivo_ingreso TEXT NULL`
);

await addColumnIfMissing(
  'pacientes',
  'signos_vitales',
  `ALTER TABLE pacientes ADD COLUMN signos_vitales TEXT NULL`
);

await addColumnIfMissing(
  'pacientes',
  'presion',
  `ALTER TABLE pacientes ADD COLUMN presion VARCHAR(50) NULL`
);

await addColumnIfMissing(
  'pacientes',
  'temperatura',
  `ALTER TABLE pacientes ADD COLUMN temperatura DECIMAL(5,2) NULL`
);

await addColumnIfMissing(
  'pacientes',
  'glucosa',
  `ALTER TABLE pacientes ADD COLUMN glucosa DECIMAL(6,2) NULL`
);


  console.log('✅ Migraciones mínimas listas');
}

// Ejecutar migraciones al arrancar
ensureSchemaMinimo().catch((err) => {
  console.error('⚠️ Migración automática falló (puedes ignorar si tu BD ya está completa):', err.message);
});

/** Convierte Date -> 'YYYY-MM-DD HH:mm:ss' para MySQL */
function toMysqlDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Suma N días hábiles (L-V) a una fecha (sin contar fines de semana). */
function addBusinessDays(baseDate, businessDays) {
  const d = new Date(baseDate);
  let remaining = Number(businessDays) || 0;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0 dom, 6 sáb
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}


/**
 * Valida fecha/hora de cita según reglas del backend.
 * Reglas:
 *  - Obligatoria
 *  - Debe ser futura
 *  - Solo lunes a viernes
 *  - Horario 08:00 a 16:00
 *  - Solo horas exactas (minutos = 0)
 *
 * @param {string} fechaHoraStr
 * @returns {string|null} Mensaje de error o null si es válida
 */
function validarFechaHoraCitaServidor(fechaHoraStr) {
  if (!fechaHoraStr) return 'Fecha/hora de la cita es obligatoria.';

  const d = new Date(fechaHoraStr);
  if (Number.isNaN(d.getTime())) {
    return 'La fecha y hora no son válidas.';
  }

  // Debe ser futura
  const ahora = new Date();
  if (d <= ahora) {
    return 'La cita debe ser en una fecha y hora futura.';
  }

  // Solo lunes a viernes (0=Dom, 6=Sáb)
  const dia = d.getDay();
  if (dia === 0 || dia === 6) {
    return 'Solo se permiten citas de lunes a viernes.';
  }

  const hora = d.getHours();
  const minutos = d.getMinutes();

  // Horario permitido: 08:00 a 16:00
  if (hora < 8 || hora > 16) {
    return 'Horario permitido de 08:00 a 16:00 horas.';
  }

  // Solo horas exactas
  if (minutos !== 0) {
    return 'Las citas solo pueden agendarse en horas exactas (ej. 8:00, 9:00, 15:00).';
  }

  return null; // todo bien
}

// ------------------------------------------
// 4) ESTADO DEL SERVIDOR Y LOGIN
// ------------------------------------------

// Estado simple del servidor
app.get('/api/estado', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de shospitalario funcionando ✅' });
});

// ---------- LOGIN DE USUARIOS INTERNOS (MÉDICOS, ENFERMERÍA, ADMIN) ----------

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

// ---------- LOGIN PORTAL PACIENTES ----------

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

// ------------------------------------------
// 5) PACIENTES (ALTA, CONSULTA, RESUMEN, POR MÉDICO)
// ------------------------------------------

// Alta de paciente / creación de cuenta desde el portal
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

// Obtener un paciente por ID (portal, datos básicos)
app.get('/api/pacientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id_paciente, nombre, apellido_paterno, apellido_materno,
              fecha_nacimiento, sexo, curp, telefono, correo, direccion,
              estatus_afiliacion,
         triage
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


// Actualizar triage de un paciente (solo médico, validación simple)
app.patch('/api/pacientes/:id_paciente/triage', async (req, res) => {
  try {
    const { id_paciente } = req.params;
    const { triage } = req.body;

    const permitidos = ['verde', 'amarillo', 'rojo'];
    const valor = (triage || '').toString().toLowerCase().trim();

    if (!permitidos.includes(valor)) {
      return res.status(400).json({
        error: `Triage no válido. Debe ser uno de: ${permitidos.join(', ')}.`,
      });
    }

    const [result] = await pool.query(
      `UPDATE pacientes
       SET triage = ?
       WHERE id_paciente = ?`,
      [valor, id_paciente]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    res.json({ ok: true, mensaje: 'Triage actualizado correctamente.', triage: valor });
  } catch (error) {
    console.error('Error al actualizar triage:', error);
    res.status(500).json({ error: 'Error al actualizar triage.' });
  }
});

// Listado de pacientes (uso interno, escritorio)
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
       WHERE activo = 1
       ORDER BY nombre, apellido_paterno`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.status(500).json({ error: 'Error al obtener la lista de pacientes' });
  }
});

// Resumen de expediente de un paciente (para escritorio/médico)
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
         estatus_afiliacion,
         triage,
         alergias,
         enfermedades_cronicas,
         enfermedades_hereditarias,
         motivo_ingreso,
         signos_vitales,
         presion,
         temperatura,
         glucosa
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

// Pacientes asignados a un médico (escritorio)
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
         p.estatus_afiliacion,
         p.triage
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

// Guardar datos mínimos de urgencias (RF-5)
app.patch('/api/pacientes/:id_paciente/urgencias', async (req, res) => {
  try {
    const { id_paciente } = req.params;

    const {
      enfermedades_cronicas,
      enfermedades_hereditarias,
      motivo_ingreso,
      signos_vitales,
      presion,
      temperatura,
      glucosa,
      alergias,
    } = req.body;

    await pool.query(
      `UPDATE pacientes
       SET enfermedades_cronicas = ?,
           enfermedades_hereditarias = ?,
           motivo_ingreso = ?,
           signos_vitales = ?,
           presion = ?,
           temperatura = ?,
           glucucosa = glucosa, -- (ignorar)
           glucosa = ?,
           alergias = ?
       WHERE id_paciente = ?`,
      [
        enfermedades_cronicas || null,
        enfermedades_hereditarias || null,
        motivo_ingreso || null,
        signos_vitales || null,
        presion || null,
        (temperatura === "" || temperatura === null || temperatura === undefined) ? null : Number(temperatura),
        (glucosa === "" || glucosa === null || glucosa === undefined) ? null : Number(glucosa),
        alergias || null,
        id_paciente
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error urgencias:", err);
    res.status(500).json({ error: "No se pudieron guardar los datos de urgencias." });
  }
});


// ------------------------------------------
// 6) CITAS (PORTAL PACIENTE + MÓDULO MÉDICO)
// ------------------------------------------


// Crear nueva cita para un paciente (portal web)
app.post('/api/pacientes/:id_paciente/citas', async (req, res) => {
  try {
    const { id_paciente } = req.params;
    const {
      fecha_hora,
      motivo,
      solicita_cambio_medico,
      motivo_cambio_medico,
    } = req.body;

    if (!fecha_hora || !motivo) {
      return res
        .status(400)
        .json({ error: 'Fecha/hora y motivo de la cita son obligatorios.' });
    }

    // Validar horario en el servidor
    const errorHorario = validarFechaHoraCitaServidor(fecha_hora);
    if (errorHorario) {
      return res.status(400).json({ error: errorHorario });
    }

    // Normalizar solicitud de cambio de médico
    const solicitaCambio =
      solicita_cambio_medico === true ||
      solicita_cambio_medico === 1 ||
      String(solicita_cambio_medico || '').toLowerCase() === 'true';

    const motivoCambio = solicitaCambio
      ? (motivo_cambio_medico || '').toString().trim().slice(0, 255) || null
      : null;

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

    // 2. Insertar la cita incluyendo el id_medico y (si existe en BD) la solicitud de cambio
    let result;
    try {
      [result] = await pool.query(
        `INSERT INTO citas (
           id_paciente,
           id_medico,
           fecha_hora,
           motivo,
           estado_cita,
           fecha_solicitud,
           solicita_cambio_medico,
           motivo_cambio_medico
         ) VALUES (?, ?, ?, ?, 'programada', NOW(), ?, ?)`,
        [id_paciente, idMedico, fecha_hora, motivo, solicitaCambio ? 1 : 0, motivoCambio]
      );
    } catch (e) {
      // Fallback si todavía no existe la columna en alguna BD antigua
      if (String(e.message || '').includes('Unknown column')) {
        [result] = await pool.query(
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
      } else {
        throw e;
      }
    }

    res.status(201).json({
      ok: true,
      mensaje: 'Cita creada correctamente.',
      id_cita: result.insertId,
      id_medico: idMedico,
      solicita_cambio_medico: solicitaCambio ? 1 : 0,
      motivo_cambio_medico: motivoCambio,
    });
  } catch (error) {
    console.error('Error al crear cita:', error);
    res.status(500).json({ error: 'Error al crear la cita.' });
  }
});


// Historial de citas de un paciente (portal)
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

// Cambiar estado de una cita (atendida / no asistió / etc.) con validación
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

// Reagendar cita (portal paciente)
app.put('/api/citas/:id_cita', async (req, res) => {
  try {
    const { id_cita } = req.params;
    const { id_paciente, nueva_fecha_hora } = req.body;

    if (!id_paciente) {
      return res.status(400).json({ error: 'id_paciente es obligatorio.' });
    }

    const errorHorario = validarFechaHoraCitaServidor(nueva_fecha_hora);
    if (errorHorario) {
      return res.status(400).json({ error: errorHorario });
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
// - Sin query: separa en futuras/historial (como estaba)
// - Con ?fecha=YYYY-MM-DD: devuelve la agenda de ese día
app.get('/api/medicos/:id_medico/citas', async (req, res) => {
  try {
    const { id_medico } = req.params;
    const { fecha } = req.query;

    // Campos base
    const selectSql = `
      SELECT
        c.id_cita,
        c.id_paciente,
        c.id_medico,
        c.fecha_hora,
        c.motivo,
        c.estado_cita,
        c.fecha_solicitud,
        c.fecha_cancelacion,
        c.solicita_cambio_medico,
        c.motivo_cambio_medico,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno
      FROM citas c
      INNER JOIN pacientes p ON p.id_paciente = c.id_paciente
      WHERE c.id_medico = ?
    `;

    // Agenda por día
    if (fecha) {
      // aceptar YYYY-MM-DD
      const f = String(fecha).slice(0, 10);
      const inicio = `${f} 00:00:00`;
      const fin = `${f} 23:59:59`;

      const [rows] = await pool.query(
        `${selectSql} AND c.fecha_hora BETWEEN ? AND ? ORDER BY c.fecha_hora`,
        [id_medico, inicio, fin]
      );

      return res.json({ fecha: f, citas: rows });
    }

    // Vista clásica: futuras + historial
    const [rows] = await pool.query(`${selectSql} ORDER BY c.fecha_hora`, [id_medico]);

    const ahora = new Date();
    const futuras = [];
    const historial = [];

    for (const c of rows) {
      const estado = (c.estado_cita || '').toLowerCase();
      const fechaCita = c.fecha_hora ? new Date(c.fecha_hora) : null;

      // Próximas: solo programadas y con fecha en el futuro
      if (estado === 'programada' && fechaCita && fechaCita >= ahora) {
        futuras.push(c);
      } else {
        historial.push(c);
      }
    }

    futuras.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
    historial.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

    res.json({ futuras, historial });
  } catch (error) {
    console.error('Error al obtener citas del médico:', error);
    res
      .status(500)
      .json({ error: 'Error al obtener la agenda de citas del médico.' });
  }
});


// ------------------------------------------
// 7) RECETAS MÉDICAS (PACIENTE Y EXPEDIENTE)
// ------------------------------------------

// Recetas del paciente (portal)
app.get('/api/pacientes/:id/recetas', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         id_receta,
         fecha_receta,
         descripcion,
         medicamentos,
         indicaciones,
         archivo_nombre_original,
         archivo_ruta,
         archivo_tipo,
         fecha_vigencia
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
         archivo_tipo,
         fecha_vigencia,
         descripcion,
         medicamentos,
         indicaciones,
         archivo_nombre_original,
         archivo_ruta,
         archivo_tipo,
         fecha_vigencia
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

// Registrar una nueva receta ligada al expediente (con archivo)
app.post(
  '/api/expedientes/:id_expediente/recetas',
  uploadReceta.single('archivo'), // campo "archivo" en el form-data
  async (req, res) => {
    try {
      const { id_expediente } = req.params;
      const { id_medico, descripcion, medicamentos, indicaciones } = req.body;

      // 1) Validaciones básicas
      if (!id_medico) {
        return res.status(400).json({
          error: 'El id_medico es obligatorio.',
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

      //cambios aqui empiezan
      // --- RF-7 Validación de alergias ---
const [alRows] = await pool.query(
  `SELECT alergias FROM pacientes WHERE id_paciente = ? LIMIT 1`,
  [idPaciente]
);

const alergiasTxt = (alRows?.[0]?.alergias || "").toString().toLowerCase();
const medsTxt = (medicamentos || "").toString().toLowerCase();

if (alergiasTxt && medsTxt) {
  const alergias = alergiasTxt
    .split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const match = alergias.filter(a => a && medsTxt.includes(a));
  if (match.length) {
    return res.status(400).json({
      error: `No se puede finalizar la receta: el paciente tiene alergias registradas relacionadas con: ${match.join(", ")}.`
    });
  }
}
//cambios aqui terminan

      // 3) Datos del archivo
      const rutaRelativa = req.file ? path.join('uploads', 'recetas', req.file.filename) : null;
const nombreOriginal = req.file ? req.file.originalname : null;
const tipoArchivo = req.file ? req.file.mimetype : null;

const fechaVigencia = toMysqlDateTime(addBusinessDays(new Date(), 3));

const [result] = await pool.query(
  `INSERT INTO recetas_medicas
   (id_paciente, id_medico, fecha_receta, fecha_vigencia,
    descripcion, medicamentos, indicaciones,
    archivo_nombre_original, archivo_ruta, archivo_tipo)
   VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
  [
    idPaciente,
    id_medico,
    fechaVigencia,
    descripcion || null,
    medicamentos || null,
    indicaciones || null,
    nombreOriginal,
    rutaRelativa,
    tipoArchivo,
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

// ------------------------------------------
// 8) ÓRDENES Y RESULTADOS DE LABORATORIO
// ------------------------------------------

// Órdenes de laboratorio por expediente (escritorio)
app.get('/api/expedientes/:id_expediente/ordenes-laboratorio', async (req, res) => {
  try {
    const { id_expediente } = req.params;

    const [rows] = await pool.query(
      `SELECT
         id_orden,
         id_expediente,
         id_medico_solicita AS id_medico,
         fecha_solicitud,
         estado_orden,
         observaciones
       FROM ordenes_laboratorio
       WHERE id_expediente = ?
       ORDER BY fecha_solicitud DESC`,
      [id_expediente]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener órdenes de laboratorio:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de laboratorio.' });
  }
});

// Registrar / crear una nueva orden de laboratorio ligada al expediente
app.post('/api/expedientes/:id_expediente/ordenes-laboratorio', async (req, res) => {
  try {
    const { id_expediente } = req.params;
    const { id_medico, observaciones } = req.body;

    if (!id_medico) {
      return res
        .status(400)
        .json({ error: 'id_medico es obligatorio para la orden.' });
    }

    // Verificar que el expediente exista
    const [expRows] = await pool.query(
      `SELECT id_expediente
       FROM expedientes_clinicos
       WHERE id_expediente = ?
       LIMIT 1`,
      [id_expediente]
    );

    if (expRows.length === 0) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const [result] = await pool.query(
      `INSERT INTO ordenes_laboratorio
         (id_expediente, id_medico_solicita, fecha_solicitud, estado_orden, observaciones)
       VALUES (?, ?, NOW(), 'Solicitada', ?)`,
      [id_expediente, id_medico, observaciones || null]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Orden de laboratorio registrada correctamente.',
      id_orden: result.insertId,
    });
  } catch (error) {
    console.error('Error al registrar orden de laboratorio:', error);
    res.status(500).json({ error: 'Error al registrar orden de laboratorio.' });
  }
});


// Órdenes de laboratorio solicitadas por un médico (escritorio: vista por médico)
app.get('/api/medicos/:id_medico/ordenes-laboratorio', async (req, res) => {
  try {
    const { id_medico } = req.params;

    const [rows] = await pool.query(
      `SELECT
         o.id_orden,
         o.fecha_solicitud,
         o.estado_orden,
         o.observaciones,
         p.id_paciente,
         p.nombre,
         p.apellido_paterno,
         p.apellido_materno,
         COUNT(r.id_resultado) AS num_resultados
       FROM ordenes_laboratorio o
       INNER JOIN expedientes_clinicos e ON e.id_expediente = o.id_expediente
       INNER JOIN pacientes p ON p.id_paciente = e.id_paciente
       LEFT JOIN resultados_laboratorio r ON r.id_orden = o.id_orden
       WHERE o.id_medico_solicita = ?
       GROUP BY o.id_orden
       ORDER BY o.fecha_solicitud DESC`,
      [id_medico]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener órdenes por médico:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de laboratorio del médico.' });
  }
});

// Resultados de laboratorio por orden (escritorio: detalle de una orden)
app.get('/api/ordenes-laboratorio/:id_orden/resultados', async (req, res) => {
  try {
    const { id_orden } = req.params;

    const [rows] = await pool.query(
      `SELECT
         id_resultado,
         id_orden,
         nombre_estudio,
         resultado,
         unidad,
         valores_referencia,
         fecha_resultado,
         observaciones,
         archivo_nombre_original,
         archivo_ruta,
         archivo_tipo
       FROM resultados_laboratorio
       WHERE id_orden = ?
       ORDER BY fecha_resultado DESC`,
      [id_orden]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener resultados por orden:', error);
    res.status(500).json({ error: 'Error al obtener resultados de laboratorio por orden.' });
  }
});

// Resultados de laboratorio por paciente (portal web)
// Además, marca las órdenes como "Resultado Listo" si ya tienen resultados
app.get('/api/pacientes/:id/resultados-laboratorio', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT
         r.id_resultado,
         r.id_orden,
         r.nombre_estudio,
         r.resultado,
         r.unidad,
         r.valores_referencia,
         r.fecha_resultado,
         r.observaciones,
         r.archivo_nombre_original,
         r.archivo_ruta,
         r.archivo_tipo
       FROM resultados_laboratorio r
       INNER JOIN ordenes_laboratorio o ON r.id_orden = o.id_orden
       INNER JOIN expedientes_clinicos e ON o.id_expediente = e.id_expediente
       WHERE e.id_paciente = ?
       ORDER BY r.fecha_resultado DESC`,
      [id]
    );

    // Marcar órdenes como "Resultado Listo" si tienen resultados
    if (rows.length > 0) {
      const idsUnicos = [...new Set(
        rows.map((r) => r.id_orden).filter((x) => x != null)
      )];

      if (idsUnicos.length > 0) {
        await pool.query(
          `UPDATE ordenes_laboratorio
           SET estado_orden = 'Resultado Listo'
           WHERE id_orden IN (${idsUnicos.map(() => '?').join(',')})`,
          idsUnicos
        );
      }
    }

    res.json(rows);
  } catch (error) {
    console.error('Error al consultar resultados de laboratorio del paciente:', error);
    res.status(500).json({ error: 'Error al consultar resultados de laboratorio.' });
  }
});

// Resultados de laboratorio por expediente (solo lectura para el médico)
// También marca las órdenes como "Resultado Listo"
app.get('/api/expedientes/:id_expediente/resultados-laboratorio', async (req, res) => {
  try {
    const { id_expediente } = req.params;

    const [rows] = await pool.query(
      `SELECT
         r.id_resultado,
         r.id_orden,
         r.nombre_estudio,
         r.resultado,
         r.unidad,
         r.valores_referencia,
         r.fecha_resultado,
         r.observaciones,
         r.archivo_nombre_original,
         r.archivo_ruta,
         r.archivo_tipo
       FROM resultados_laboratorio r
       INNER JOIN ordenes_laboratorio o ON r.id_orden = o.id_orden
       WHERE o.id_expediente = ?
       ORDER BY r.fecha_resultado DESC`,
      [id_expediente]
    );

    // Marcar órdenes como "Resultado Listo" si tienen resultados
    if (rows.length > 0) {
      const idsUnicos = [...new Set(
        rows.map((r) => r.id_orden).filter((id) => id != null)
      )];

      if (idsUnicos.length > 0) {
        await pool.query(
          `UPDATE ordenes_laboratorio
           SET estado_orden = 'Resultado Listo'
           WHERE id_orden IN (${idsUnicos.map(() => '?').join(',')})`,
          idsUnicos
        );
      }
    }

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener resultados de laboratorio:', error);
    res.status(500).json({ error: 'Error al obtener resultados de laboratorio.' });
  }
});

// ------------------------------------------
// 9) NOTAS DE EVOLUCIÓN (EXPEDIENTE CLÍNICO)
// ------------------------------------------

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


// Editar una nota de evolución (con historial de modificaciones)
// Requisito: "Solo debe de haber historial de modificacion de nota evolutiva"
app.put('/api/notas/:id_nota', async (req, res) => {
  try {
    const { id_nota } = req.params;
    const { id_medico, contenido, contenido_nuevo } = req.body;

    const nuevo = (contenido_nuevo ?? contenido ?? '').toString().trim();

    if (!id_medico) {
      return res.status(400).json({ error: 'id_medico es obligatorio.' });
    }
    if (!nuevo) {
      return res.status(400).json({ error: 'El contenido nuevo no puede ir vacío.' });
    }

    const [rows] = await pool.query(
      `SELECT id_nota, id_medico, contenido
       FROM notas_evolucion
       WHERE id_nota = ?
       LIMIT 1`,
      [id_nota]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Nota no encontrada.' });
    }

    const nota = rows[0];

    // Regla simple: solo el médico que creó la nota puede modificarla
    if (String(nota.id_medico) !== String(id_medico)) {
      return res.status(403).json({
        error: 'No tienes permiso para modificar esta nota (solo el médico autor puede editarla).',
      });
    }

    // Guardar historial
    await pool.query(
      `INSERT INTO notas_evolucion_historial
         (id_nota, id_medico, fecha_cambio, contenido_anterior, contenido_nuevo)
       VALUES (?, ?, NOW(), ?, ?)`,
      [id_nota, id_medico, nota.contenido || null, nuevo]
    );

    // Actualizar nota
    await pool.query(
      `UPDATE notas_evolucion
       SET contenido = ?
       WHERE id_nota = ?`,
      [nuevo, id_nota]
    );

    res.json({ ok: true, mensaje: 'Nota actualizada y cambio registrado en historial.' });
  } catch (error) {
    console.error('Error al editar nota:', error);
    res.status(500).json({ error: 'Error al editar la nota.' });
  }
});

// Ver historial de cambios de una nota
app.get('/api/notas/:id_nota/historial', async (req, res) => {
  try {
    const { id_nota } = req.params;

    const [rows] = await pool.query(
      `SELECT
         id_historial,
         id_nota,
         id_medico,
         fecha_cambio,
         contenido_anterior,
         contenido_nuevo
       FROM notas_evolucion_historial
       WHERE id_nota = ?
       ORDER BY fecha_cambio DESC`,
      [id_nota]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener historial de nota:', error);
    res.status(500).json({ error: 'Error al obtener historial de la nota.' });
  }
});

// ------------------------------------------
// EXPORTAR APP
// ------------------------------------------

module.exports = app;
