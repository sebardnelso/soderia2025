// backendend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usar mysql2 con soporte de Promesas

const app = express();
const PORT = 5010;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configuración del pool de conexiones a la base de datos
const pool = mysql.createPool({
  host: '190.228.29.61',
  user: 'kalel2016',
  password: 'Kalel2016',
  database: 'soda',
  waitForConnections: true,
  connectionLimit: 10, // Número máximo de conexiones en el pool
  queueLimit: 0
});

// Verificar la conexión al iniciar el servidor
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to the database');
    connection.release();
  } catch (err) {
    console.error('Unable to connect to the database:', err);
  }
})();

// Ruta de Login
app.post('/login', async (req, res) => {
  const { nombre, clave } = req.body;
  
  if (!nombre || !clave) {
    return res.status(400).json({ success: false, message: 'Nombre y clave son requeridos' });
  }

  const query = 'SELECT * FROM soda_repartidores WHERE nombre = ? AND clave = ?';

  try {
    const [results] = await pool.execute(query, [nombre, clave]);

    if (results.length > 0) {
      const cod_rep = results[0].cod_rep; // Suponiendo que `cod_rep` está en el primer resultado
      res.json({ success: true, cod_rep });
    } else {
      res.json({ success: false, message: 'Credenciales inválidas' });
    }
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Ruta para obtener los rubros de rendiciones
app.get('/rubros', async (req, res) => {
  const query = 'SELECT cod, descripcion FROM soda_rubros_rendiciones';
  
  try {
    const [results] = await pool.execute(query);
    res.json({ success: true, rubros: results });
  } catch (err) {
    console.error('Error al obtener rubros:', err);
    res.status(500).json({ success: false, message: 'Error al obtener rubros' });
  }
});

// Ruta para añadir una rendición
app.post('/rendiciones', async (req, res) => {
  const { cod_rep, cod_gasto, importe } = req.body;

  // Validar los datos recibidos
  if (!cod_rep || !cod_gasto || importe === undefined) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }

  const fecha = new Date().toISOString().split('T')[0]; // Fecha actual en formato YYYY-MM-DD

  const query = 'INSERT INTO soda_rendiciones (cod_rep, fecha, cod_gasto, importe) VALUES (?, ?, ?, ?)';

  try {
    const [results] = await pool.execute(query, [cod_rep, fecha, cod_gasto, importe]);
    res.json({ success: true, message: 'Rendición añadida correctamente', id: results.insertId });
  } catch (err) {
    console.error('Error al añadir rendición:', err);
    res.status(500).json({ success: false, message: 'Error al añadir rendición' });
  }
});

// Ruta para obtener rendiciones de un vendedor
app.get('/rendiciones/:cod_rep', async (req, res) => {
  const { cod_rep } = req.params;

  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  const query = 'SELECT * FROM soda_rendiciones WHERE cod_rep = ?';

  try {
    const [results] = await pool.execute(query, [cod_rep]);
    res.json({ success: true, rendiciones: results });
  } catch (err) {
    console.error('Error al obtener rendiciones:', err);
    res.status(500).json({ success: false, message: 'Error al obtener rendiciones' });
  }
});

// Ruta para obtener zonas
app.post('/zonas', async (req, res) => {
  const { cod_rep } = req.body;
  console.log(`Recibido cod_rep en /zonas: ${cod_rep}`); // Verifica el valor recibido

  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  const query = 'SELECT numzona FROM soda_zonaxrepa WHERE cod_rep = ?';

  try {
    const [results] = await pool.execute(query, [cod_rep]);
    res.json({ success: true, zonas: results });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Ruta para obtener clientes
app.post('/clientes', async (req, res) => {
  const { numzona, cod_rep } = req.body;
  console.log(`Recibido numzona: ${numzona}`); // Verifica el valor recibido
  console.log(`Recibido cod_rep: ${cod_rep}`);

  if (!numzona || !cod_rep) {
    return res.status(400).json({ success: false, message: 'numzona y cod_rep son requeridos' });
  }

  const query = `
    SELECT cod_cliente, nom_cliente, domicilio, localidad, celular
    FROM soda_hoja_header
    WHERE cod_zona = ? AND ter != 1
    ORDER BY orden ASC
  `;

  try {
    const [results] = await pool.execute(query, [numzona]);
    res.json({ success: true, clientes: results });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Ruta para obtener resultados del día
app.post('/resultados-del-dia', async (req, res) => {
  const { cod_rep } = req.body;
  const fechaHoy = new Date().toISOString().split('T')[0];
  console.log('Fecha de hoy:', fechaHoy);
  console.log('Código de representante:', cod_rep);

  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  const query = `
    SELECT
      SUM(venta_A4) AS venta_A4,
      SUM(venta_A3) AS venta_A3,
      SUM(cobrado_ccte_A3) AS cobrado_ccte_A3,
      SUM(cobrado_ccte_A4) AS cobrado_ccte_A4,
      SUM(cobrado_ctdo_A3) AS cobrado_ctdo_A3,
      SUM(cobrado_ctdo_A4) AS cobrado_ctdo_A4
    FROM resultadofinales
    WHERE cod_rep = ? AND fecha = ?
  `;

  try {
    const [results] = await pool.execute(query, [cod_rep, fechaHoy]);
    console.log('Resultado de la consulta:', results);

    // Verificar si `results` tiene al menos una fila
    if (results.length > 0) {
      const data = results[0];
      console.log('Datos obtenidos:', data);
      res.json({ success: true, resultados: data });
    } else {
      res.json({ success: true, resultados: {} });
    }
  } catch (err) {
    console.error('Error executing query:', err);
    res.json({ success: false, error: err.message });
  }
});

// Ruta para obtener movimientos
app.post('/movimientos', async (req, res) => {
  const { cod_cliente, cod_rep, numzona } = req.body;
  console.log(`Recibido cod_cliente: ${cod_cliente}`);
  console.log(`Recibido cod_rep: ${cod_rep}`);
  console.log(`Recibido numzona: ${numzona}`);

  if (!cod_cliente || !cod_rep || !numzona) {
    return res.status(400).json({ success: false, message: 'cod_cliente, cod_rep y numzona son requeridos' });
  }

  const query = `
    SELECT cod_prod, cod_cliente, debe, venta, cobrado_ctdo, cobrado_ccte
    FROM soda_hoja_linea
    WHERE cod_cliente = ?
  `;

  try {
    const [results] = await pool.execute(query, [cod_cliente]);
    res.json({ success: true, movimientos: results });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Ruta para actualizar movimientos y resultados
app.post('/update-movimientos-y-resultados', async (req, res) => {
  const { cod_cliente, cod_prod, venta, cobrado_ctdo, cobrado_ccte, cod_rep, zona, bidones_bajados, motivo } = req.body;
  console.log(cod_cliente, cod_prod, venta, cobrado_ctdo, cobrado_ccte, cod_rep, zona, bidones_bajados, motivo);

  // Validaciones básicas
  if (
    !cod_cliente ||
    !cod_prod ||
    venta === undefined ||
    cobrado_ctdo === undefined ||
    cobrado_ccte === undefined ||
    !cod_rep ||
    !zona ||
    bidones_bajados === undefined
  ) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  // Definir consultas
  const updateMovimientosQuery = `
    UPDATE soda_hoja_linea
    SET venta = ?, cobrado_ctdo = ?, cobrado_ccte = ?
    WHERE cod_cliente = ? AND cod_prod = ?
  `;

  const checkQuery = `
    SELECT COUNT(*) AS count
    FROM resultadofinales
    WHERE cod_rep = ? AND fecha = ? AND zona = ?
  `;

  let upsertQuery = '';
  let values = [];

  if (cod_prod === 'A4') {
    upsertQuery = `
      INSERT INTO resultadofinales (cod_rep, fecha, zona, venta_A4, cobrado_ctdo_A4, cobrado_ccte_A4)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        venta_A4 = venta_A4 + VALUES(venta_A4),
        cobrado_ctdo_A4 = cobrado_ctdo_A4 + VALUES(cobrado_ctdo_A4),
        cobrado_ccte_A4 = cobrado_ccte_A4 + VALUES(cobrado_ccte_A4)
    `;
    values = [cod_rep, req.body.fecha, zona, venta, cobrado_ctdo, cobrado_ccte];
  } else if (cod_prod === 'A3') {
    upsertQuery = `
      INSERT INTO resultadofinales (cod_rep, fecha, zona, venta_A3, cobrado_ctdo_A3, cobrado_ccte_A3)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        venta_A3 = venta_A3 + VALUES(venta_A3),
        cobrado_ctdo_A3 = cobrado_ctdo_A3 + VALUES(cobrado_ctdo_A3),
        cobrado_ccte_A3 = cobrado_ccte_A3 + VALUES(cobrado_ccte_A3)
    `;
    values = [cod_rep, req.body.fecha, zona, venta, cobrado_ctdo, cobrado_ccte];
  } else {
    // Manejar otros casos de cod_prod si es necesario
    return res.json({ success: false, error: 'Producto desconocido' });
  }

  let connection;

  try {
    // Obtener una conexión del pool
    connection = await pool.getConnection();

    // Iniciar una transacción
    await connection.beginTransaction();

    // Actualizar movimientos
    const [updateResult] = await connection.execute(updateMovimientosQuery, [venta, cobrado_ctdo, cobrado_ccte, cod_cliente, cod_prod]);

    if (updateResult.affectedRows === 0) {
      throw new Error('No se encontró el registro para actualizar en soda_hoja_linea');
    }

    // Verificar si ya existe el registro para los resultados
    const [checkResult] = await connection.execute(checkQuery, [cod_rep, req.body.fecha, zona]);

    const count = checkResult[0].count;

    // Insertar o actualizar en resultadofinales
    const [upsertResult] = await connection.execute(upsertQuery, values);

    // Actualizar el campo 'ter' en soda_hoja_header
    const updateTerQuery = `
      UPDATE soda_hoja_header
      SET ter = 1
      WHERE cod_cliente = ?
    `;
    const [updateTerResult] = await connection.execute(updateTerQuery, [cod_cliente]);

    // Obtener la fecha actual en formato YYYY-MM-DD
    const fecha_actual = new Date().toISOString().split('T')[0];

    // Insertar en soda_hoja_completa
    const insertCompletaQuery = `
      INSERT INTO soda_hoja_completa (cod_rep, cod_zona, orden, cod_cliente, cod_prod, debe, venta, cobrado_ctdo, cobrado_ccte, bidones_bajados, fecha, motivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    // Suponiendo que 'orden' debe ser proporcionado o calculado. Aquí lo dejamos como '0' como ejemplo.
    const orden = 0; // Reemplaza esto con el valor correcto según tu lógica

    const debe = parseFloat(bidones_bajados); // Asegurarse de que 'debe' sea un número

    await connection.execute(insertCompletaQuery, [
      cod_rep,
      zona,
      orden,
      cod_cliente,
      cod_prod,
      debe,
      venta,
      cobrado_ctdo,
      cobrado_ccte,
      bidones_bajados,
      fecha_actual, // Agregar la fecha actual
      motivo || null // Agregar el motivo, si existe; de lo contrario, null
    ]);

    // Confirmar la transacción
    await connection.commit();

    res.json({ success: true });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error executing query:', err);
    res.json({ success: false, error: err.message });
  } finally {
    if (connection) {
      connection.release(); // Liberar la conexión de vuelta al pool
    }
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
