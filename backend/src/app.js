const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/estado', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de shospitalario funcionando ✅' });
});

app.get('/api/pacientes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pacientes LIMIT 10');
    res.json(rows);
  } catch (error) {
    console.error('Error al consultar pacientes:', error);
    res.status(500).json({ error: 'Error al consultar pacientes' });
  }
});

module.exports = app;
