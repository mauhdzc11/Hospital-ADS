const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',          // cámbialo si tu usuario es otro
  password: 'mauri123', // pon tu contraseña real
  database: 'shospitalario',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
