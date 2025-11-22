// src/app.js
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// ---------------- ESTADO DEL SERVIDOR ----------------
app.get('/api/estado', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de shospitalario funcionando ✅' });
});

// ---------------- PACIENTES (USO INTERNO / ALTA) ----------------

// Obtener todos los pacientes (esto te servirá luego en la app de escritorio)
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

// Crear paciente (también lo usaremos para "crear cuenta" desde el portal)
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
        direccion, contrasena, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
      activo: 1,
    };

    res.status(201).json(nuevoPaciente);
  } catch (error) {
    console.error('Error al registrar paciente:', error);
    res.status(500).json({ error: 'Error al registrar paciente' });
  }
});

// Obtener un paciente por ID (por si lo necesitas después)
app.get('/api/pacientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id_paciente, nombre, apellido_paterno, apellido_materno,
              fecha_nacimiento, sexo, curp, telefono, correo, direccion
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

// ---------------- LOGIN PORTAL PACIENTES ----------------

// Login por correo + contraseña
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
              contrasena
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

    // No regresamos la contraseña al frontend
    delete paciente.contrasena;

    res.json(paciente);
  } catch (error) {
    console.error('Error en login de paciente:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = app;
