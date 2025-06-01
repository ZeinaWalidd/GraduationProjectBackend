// config.js
const mysql = require("mysql2");

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'Incognito',
    connectionLimit: 10, // set pool size according to expected load
    queueLimit: 0
  }).promise();


  module.exports = pool;


