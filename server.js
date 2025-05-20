// backend/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usar mysql2 con soporte de Promesas

const app = express();
const PORT = 3000; // Puedes cambiar el puerto si es necesario

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configuración del pool de conexiones a la base de datos con credenciales hardcodeadas
const pool = mysql.createPool({
  host: '190.228.29.61',
  user: 'kalel2016',
  password: 'Kalel2016',
  database: 'soda',
  waitForConnections: true,
  connectionLimit: 10, // Número máximo de conexiones en el pool
  queueLimit: 0,
  connectTimeout: 10000, // Tiempo máximo para establecer una conexión (en ms)
  // Se eliminan las opciones 'acquireTimeout' y 'timeout' ya que no son válidas en mysql2
});

// Función para mantener las conexiones vivas ejecutando una consulta simple cada 5 minutos
const keepAlive = () => {
  setInterval(async () => {
    try {
      await pool.execute('SELECT 1');
      console.log('Keep-alive ejecutado correctamente');
    } catch (err) {
      console.error('Error en keep-alive:', err);
    }
  }, 1000 * 60 * 5); // Cada 5 minutos
};

// Iniciar el keep-alive
keepAlive();

// Verificar la conexión al iniciar el servidor
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Conectado a la base de datos');
    connection.release();
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err);
    process.exit(1); // Salir si no se puede conectar a la base de datos
  }
})();

// Función de reintento para ejecutar consultas en caso de ECONNRESET
const executeQueryWithRetry = async (query, params, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [results] = await pool.execute(query, params);
      return results;
    } catch (err) {
      if (err.code === 'ECONNRESET' && attempt < retries) {
        console.warn(`Intento ${attempt} fallido. Reintentando...`);
        await new Promise(res => setTimeout(res, 1000)); // Esperar 1 segundo antes de reintentar
      } else {
        throw err;
      }
    }
  }
};

// Ruta de Login
app.post('/login', async (req, res) => {
  const { nombre, clave } = req.body;
  
  if (!nombre || !clave) {
    return res.status(400).json({ success: false, message: 'Nombre y clave son requeridos' });
  }

  const query = 'SELECT * FROM soda_repartidores WHERE nombre = ? AND clave = ?';

  try {
    const results = await executeQueryWithRetry(query, [nombre, clave]);

    if (results.length > 0) {
      const cod_rep = results[0].cod_rep; // Suponiendo que `cod_rep` está en el primer resultado
      res.json({ success: true, cod_rep });
    } else {
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }
  } catch (err) {
    console.error('Error ejecutando query con reintentos:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
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
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
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
    ORDER BY secuencia ASC
  `;

  try {
    const [results] = await pool.execute(query, [numzona]);
    res.json({ success: true, clientes: results });
  } catch (err) {
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
  }
});






// Ruta para obtener ventas mensuales agrupadas por fecha y zona
app.post('/ventas-mensuales', async (req, res) => {
  const { cod_rep } = req.body;
  
  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  const fechaHoy = new Date();
  const añoActual = fechaHoy.getFullYear();
  const mesActual = fechaHoy.getMonth() + 1; // Los meses en JavaScript son 0-11

  console.log(`Código de representante: ${cod_rep}`);
  console.log(`Año Actual: ${añoActual}, Mes Actual: ${mesActual}`);

  // Consultas SQL
  const ventasMensualesQuery = `
    SELECT
      rf.fecha,
      rf.zona,
      SUM(rf.cobrado_ctdo_A4) AS cobrado_ctdo_A4,
      SUM(rf.cobrado_ctdo_A3) AS cobrado_ctdo_A3,
      SUM(rf.cobrado_ccte_A4) AS cobrado_ccte_A4,
      SUM(rf.cobrado_ccte_A3) AS cobrado_ccte_A3
    FROM resultadofinales rf
    WHERE rf.cod_rep = ? AND YEAR(rf.fecha) = ? AND MONTH(rf.fecha) = ?
    GROUP BY rf.fecha, rf.zona
    ORDER BY rf.fecha ASC
  `;

  const preciosQuery = `
    SELECT cod_prod, precio
    FROM soda_precios
    WHERE cod_prod IN ('A3', 'A4')
  `;

  try {
    // Ejecutar consultas en paralelo
    const [ventasMensuales, preciosData] = await Promise.all([
      pool.execute(ventasMensualesQuery, [cod_rep, añoActual, mesActual]),
      pool.execute(preciosQuery)
    ]);

    const ventasData = ventasMensuales[0];
    const precios = preciosData[0];

    // Crear un mapa de precios para fácil acceso
    const preciosMap = {};
    precios.forEach(item => {
      preciosMap[item.cod_prod] = parseFloat(item.precio);
    });

    // Calcular los montos en pesos y preparar los datos
    const ventasConPesos = ventasData.map(venta => {
      const cobrado_ctdo_A4_pesos = (venta.cobrado_ctdo_A4 || 0) * (preciosMap['A4'] || 0);
      const cobrado_ctdo_A3_pesos = (venta.cobrado_ctdo_A3 || 0) * (preciosMap['A3'] || 0);
      const cobrado_ccte_A4_pesos = (venta.cobrado_ccte_A4 || 0) * (preciosMap['A4'] || 0);
      const cobrado_ccte_A3_pesos = (venta.cobrado_ccte_A3 || 0) * (preciosMap['A3'] || 0);

      return {
        fecha: venta.fecha,
        zona: venta.zona,
        cobrado_ctdo_A4_pesos,
        cobrado_ctdo_A3_pesos,
        cobrado_ccte_A4_pesos,
        cobrado_ccte_A3_pesos,
      };
    });

    // Calcular los totales
    let totalCobradoCtdo_A4 = 0;
    let totalCobradoCtdo_A3 = 0;
    let totalCobradoCcte_A4 = 0;
    let totalCobradoCcte_A3 = 0;

    ventasConPesos.forEach(venta => {
      totalCobradoCtdo_A4 += venta.cobrado_ctdo_A4_pesos;
      totalCobradoCtdo_A3 += venta.cobrado_ctdo_A3_pesos;
      totalCobradoCcte_A4 += venta.cobrado_ccte_A4_pesos;
      totalCobradoCcte_A3 += venta.cobrado_ccte_A3_pesos;
    });

    const totalGeneral = totalCobradoCtdo_A4 + totalCobradoCtdo_A3 + totalCobradoCcte_A4 + totalCobradoCcte_A3;

    res.json({
      success: true,
      ventas: ventasConPesos,
      totales: {
        cobrado_ctdo_A4_pesos: totalCobradoCtdo_A4,
        cobrado_ctdo_A3_pesos: totalCobradoCtdo_A3,
        cobrado_ccte_A4_pesos: totalCobradoCcte_A4,
        cobrado_ccte_A3_pesos: totalCobradoCcte_A3,
        total_general: totalGeneral
      }
    });

  } catch (err) {
    console.error('Error ejecutando las consultas:', err);
    res.status(500).json({ success: false, error: 'Error al obtener ventas mensuales' });
  }
});

// Ruta modificada: POST /movimientos
app.post('/movimientos', async (req, res) => {
  const { cod_cliente, cod_rep, numzona } = req.body;
  console.log(`Recibido cod_cliente: ${cod_cliente}`);
  console.log(`Recibido cod_rep: ${cod_rep}`);
  console.log(`Recibido numzona: ${numzona}`);

  if (!cod_cliente || !cod_rep || !numzona) {
    return res
      .status(400)
      .json({ success: false, message: 'cod_cliente, cod_rep y numzona son requeridos' });
  }

  const query = `
    SELECT 
      l.cod_prod,
      l.cod_cliente,
      -- Aquí reemplazamos l.debe por el saldo oficial según el producto
      CASE 
        WHEN l.cod_prod = 'A4' THEN h.saldiA4
        WHEN l.cod_prod = 'A3' THEN h.saldiA3
        ELSE l.debe
      END AS debe,
      l.venta,
      l.cobrado_ctdo,
      l.cobrado_ccte
    FROM soda_hoja_linea AS l
    JOIN soda_hoja_header AS h
      ON l.cod_cliente = h.cod_cliente
    WHERE l.cod_cliente = ?
      AND l.cod_rep    = ?
      AND l.cod_zona   = ?
  `;

  try {
    const [results] = await pool.execute(query, [cod_cliente, cod_rep, numzona]);
    res.json({ success: true, movimientos: results });
  } catch (err) {
    console.error('Error ejecutando query en /movimientos:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
  }
});


// app.js (o donde tengas tus rutas)
// POST /update-movimientos-y-resultados
// Ruta completa: POST /update-movimientos-y-resultados
// POST /update-movimientos-y-resultados
app.post('/update-movimientos-y-resultados', async (req, res) => {
  const {
    cod_cliente,
    cod_prod,
    venta,
    cobrado_ctdo,
    cobrado_ccte,
    cod_rep,
    zona,
    bidones_bajados,
    motivo,
    fecha // opcional
  } = req.body;

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

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1) Actualizar soda_hoja_linea
    const [upd] = await connection.execute(
      `UPDATE soda_hoja_linea
         SET venta = ?, cobrado_ctdo = ?, cobrado_ccte = ?
       WHERE cod_cliente = ? AND cod_prod = ?`,
      [venta, cobrado_ctdo, cobrado_ccte, cod_cliente, cod_prod]
    );
    if (upd.affectedRows === 0) {
      throw new Error('No se encontró registro en soda_hoja_linea');
    }

    // 2) Upsert en resultadofinales (igual que antes)
    let upsertQuery;
    if (cod_prod === 'A4') {
      upsertQuery = `
        INSERT INTO resultadofinales
          (cod_rep, fecha, zona, venta_A4, cobrado_ctdo_A4, cobrado_ccte_A4)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          venta_A4 = venta_A4 + VALUES(venta_A4),
          cobrado_ctdo_A4 = cobrado_ctdo_A4 + VALUES(cobrado_ctdo_A4),
          cobrado_ccte_A4 = cobrado_ccte_A4 + VALUES(cobrado_ccte_A4)
      `;
    } else {
      upsertQuery = `
        INSERT INTO resultadofinales
          (cod_rep, fecha, zona, venta_A3, cobrado_ctdo_A3, cobrado_ccte_A3)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          venta_A3 = venta_A3 + VALUES(venta_A3),
          cobrado_ctdo_A3 = cobrado_ctdo_A3 + VALUES(cobrado_ctdo_A3),
          cobrado_ccte_A3 = cobrado_ccte_A3 + VALUES(cobrado_ccte_A3)
      `;
    }
    await connection.execute(upsertQuery, [cod_rep, fecha, zona, venta, cobrado_ctdo, cobrado_ccte]);

    // 3) Marcar ter en header
    await connection.execute(
      `UPDATE soda_hoja_header SET ter = 1 WHERE cod_cliente = ?`,
      [cod_cliente]
    );

    // 4) Obtener el "debe oficial" desde la cabecera
    const campoHeader = cod_prod === 'A4' ? 'saldiA4' : 'saldiA3';
    const [headerRows] = await connection.execute(
      `SELECT ${campoHeader} AS debe FROM soda_hoja_header WHERE cod_cliente = ?`,
      [cod_cliente]
    );
    const debeValue = headerRows[0]?.debe ?? 0;

    // 5) Insertar en soda_hoja_completa usando el debe de header
    const fecha_actual = new Date().toISOString().split('T')[0];
    const insertCompletaQuery = `
      INSERT INTO soda_hoja_completa
        (cod_rep, cod_zona, orden, cod_cliente, cod_prod,
         debe, venta, cobrado_ctdo, cobrado_ccte,
         bidones_bajados, fecha, motivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const orden = 0;
    await connection.execute(insertCompletaQuery, [
      cod_rep,
      zona,
      orden,
      cod_cliente,
      cod_prod,
      debeValue,     // ← aquí el saldo oficial
      venta,
      cobrado_ctdo,
      cobrado_ccte,
      bidones_bajados,
      fecha_actual,
      motivo || null
    ]);

    // 6) Cálculo de neto y actualización de la cabecera
    const neto = Number(venta) - Number(cobrado_ctdo) - Number(cobrado_ccte);
    await connection.execute(
      `UPDATE soda_hoja_header
         SET ${campoHeader} = ${campoHeader} + ?
       WHERE cod_cliente = ?`,
      [neto, cod_cliente]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error en /update-movimientos-y-resultados:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) connection.release();
  }
});



// Ruta completa: POST /modificar-visita
app.post('/modificar-visita', async (req, res) => {
  // Se esperan cod_zona, cod_rep, cod_cliente, cod_prod y fecha, además de los datos a actualizar
  const { cod_zona, cod_rep, cod_cliente, cod_prod, fecha, venta, cobrado_ctdo, cobrado_ccte, bidones_bajados, motivo } = req.body;

  console.log("Datos recibidos:", req.body);

  if (!cod_zona || !cod_rep || !cod_cliente || !cod_prod || !fecha) {
    console.error("Faltan parámetros requeridos");
    return res.status(400).json({ success: false, error: 'Faltan parámetros requeridos' });
  }

  try {
    // Obtener conexión (pool ya es basado en promesas, no se usa pool.promise())
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      console.log("Transacción iniciada");

      // Actualizar en soda_hoja_linea:
      // Se verifica por: cod_rep, cod_zona, cod_cliente y cod_prod
      const updateLineaQuery = `
        UPDATE soda_hoja_linea
        SET venta = ?, cobrado_ctdo = ?, cobrado_ccte = ?
        WHERE cod_rep = ? AND cod_zona = ? AND cod_cliente = ? AND cod_prod = ?
      `;
      const lineaParams = [venta, cobrado_ctdo, cobrado_ccte, cod_rep, cod_zona, cod_cliente, cod_prod];
      console.log("Parámetros updateLineaQuery:", lineaParams);
      const [lineaResult] = await connection.execute(updateLineaQuery, lineaParams);
      console.log("Resultado updateLineaQuery:", lineaResult);

      // Actualizar en soda_hoja_completa:
      // Se verifica por: cod_rep, cod_zona, cod_cliente, cod_prod y fecha
      const updateCompletaQuery = `
        UPDATE soda_hoja_completa
        SET venta = ?, cobrado_ctdo = ?, cobrado_ccte = ?, bidones_bajados = ?, motivo = ?
        WHERE cod_rep = ? AND cod_zona = ? AND cod_cliente = ? AND cod_prod = ? AND fecha = ?
      `;
      const completaParams = [venta, cobrado_ctdo, cobrado_ccte, bidones_bajados, motivo, cod_rep, cod_zona, cod_cliente, cod_prod, fecha];
      console.log("Parámetros updateCompletaQuery:", completaParams);
      const [completaResult] = await connection.execute(updateCompletaQuery, completaParams);
      console.log("Resultado updateCompletaQuery:", completaResult);

      await connection.commit();
      console.log("Transacción confirmada");
      connection.release();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      connection.release();
      console.error('Error en la transacción:', err);
      res.status(500).json({ success: false, error: 'Error al actualizar los registros' });
    }
  } catch (err) {
    console.error('Error obteniendo conexión:', err);
    res.status(500).json({ success: false, error: 'Error al obtener conexión a la base de datos' });
  }
});





app.post('/movimientos-clientes', async (req, res) => {
  const { fecha, numzona, cod_rep } = req.body;
  console.log(`Recibido: fecha=${fecha}, numzona=${numzona}, cod_rep=${cod_rep}`);

  if (!fecha || !numzona || !cod_rep) {
    return res
      .status(400)
      .json({ success: false, message: 'fecha, numzona y cod_rep son requeridos' });
  }

  // 1) Obtener clientes que efectivamente tienen movimientos
  const clientesQuery = `
    SELECT DISTINCT 
      shh.cod_cliente,
      shh.nom_cliente,
      shh.domicilio,
      shh.localidad,
      shh.celular
    FROM soda_hoja_header AS shh
    INNER JOIN soda_hoja_completa AS shc
      ON shh.cod_cliente = shc.cod_cliente
      AND shc.cod_rep   = ?
      AND shc.cod_zona  = ?
      AND DATE(shc.fecha) = STR_TO_DATE(?, '%Y-%m-%d')
    WHERE shh.cod_zona = ?
    ORDER BY shh.secuencia ASC
  `;

  // 2) Obtener todos los movimientos de esos clientes
  const movimientosQuery = `
    SELECT 
      shc.cod_cliente,
      shc.cod_prod,
      shc.debe,
      shc.venta,
      shc.cobrado_ctdo,
      shc.cobrado_ccte,
      shc.bidones_bajados,
      DATE(shc.fecha) AS fecha,
      shc.motivo
    FROM soda_hoja_completa AS shc
    WHERE shc.cod_rep   = ?
      AND shc.cod_zona  = ?
      AND DATE(shc.fecha) = STR_TO_DATE(?, '%Y-%m-%d')
      AND shc.cod_cliente IN (
        SELECT cod_cliente
        FROM soda_hoja_header
        WHERE cod_zona = ?
      )
    ORDER BY shc.fecha DESC, shc.orden ASC
  `;

  try {
    // Ejecutar query de clientes
    const [clientes] = await pool.execute(clientesQuery, [
      cod_rep,
      numzona,
      fecha,
      numzona
    ]);
    console.log(`Clientes obtenidos: ${clientes.length}`);
    if (clientes.length === 0) {
      return res.json({ success: true, clientes: [] });
    }

    // Ejecutar query de movimientos
    const [movimientos] = await pool.execute(movimientosQuery, [
      cod_rep,
      numzona,
      fecha,
      numzona
    ]);
    console.log(`Movimientos obtenidos: ${movimientos.length}`);

    // Agrupar movimientos por cliente
    const movPorCliente = movimientos.reduce((acc, m) => {
      if (!acc[m.cod_cliente]) acc[m.cod_cliente] = [];
      acc[m.cod_cliente].push({
        cod_prod:        m.cod_prod,
        debe:            m.debe,
        venta:           m.venta,
        cobrado_ctdo:    m.cobrado_ctdo,
        cobrado_ccte:    m.cobrado_ccte,
        bidones_bajados: m.bidones_bajados,
        fecha:           m.fecha,
        motivo:          m.motivo
      });
      return acc;
    }, {});

    // Construir respuesta final
    const clientesConMov = clientes.map(c => ({
      ...c,
      movimientos: movPorCliente[c.cod_cliente] || []
    }));

    console.log(`Clientes con Movimientos: ${clientesConMov.length}`);
    res.json({ success: true, clientes: clientesConMov });
  } catch (err) {
    console.error('Error en /movimientos-clientes:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error al obtener movimientos de clientes' });
  }
});

app.post('/crear-cliente', async (req, res) => {
  const { razon, localidad, celular, bidon, cantidad, numzona, secuencia } = req.body;

  if (!razon || !localidad || !celular || !bidon || !cantidad || !numzona || !secuencia) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  const insertClienteQuery = `
    INSERT INTO clientenuevo (razon, localidad, celular, bidon, cantidad, numzona, secuencia)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  let connection;
  try {
    connection = await createDBConnection();
    await connection.execute(insertClienteQuery, [razon, localidad, celular, bidon, cantidad, numzona, secuencia]);
    res.json({ success: true, message: 'Cliente creado exitosamente' });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al crear el cliente' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});
// Ruta de Carga y descarga de camión
// En tu app.js de Express (o donde tengas tus rutas)

// POST /soda_cardes (inserta carga/descarga)
app.post('/soda_cardes', async (req, res) => {
  const { fecha, cod_rep, cod_prod, cod_zona, cantidad, movimiento } = req.body;

  if (!fecha || !cod_rep || !cod_prod || !cod_zona || !cantidad || !movimiento) {
    return res
      .status(400)
      .json({ success: false, message: 'Todos los campos son requeridos' });
  }

  const query = `
    INSERT INTO soda_cardes
      (fecha, cod_rep, cod_prod, cod_zona, cantidad, movimiento)
    VALUES
      (STR_TO_DATE(?, '%d/%m/%Y'), ?, ?, ?, ?, ?)
  `;

  try {
    const result = await executeQueryWithRetry(query, [
      fecha, cod_rep, cod_prod, cod_zona, cantidad, movimiento
    ]);
    res.json({ success: true, insertId: result.insertId });
  } catch (err) {
    console.error('Error al insertar en soda_cardes:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error en la base de datos' });
  }
});

// GET /soda_cardes?cod_rep=2&fecha=14/04/2025
app.get('/soda_cardes', async (req, res) => {
  const { cod_rep, fecha } = req.query;
  if (!cod_rep || !fecha) {
    return res
      .status(400)
      .json({ success: false, message: 'cod_rep y fecha son requeridos' });
  }

  const query = `
    SELECT 
      cod_prod, cod_zona, cantidad,
      movimiento,
      DATE_FORMAT(fecha, '%d/%m/%Y') AS fecha
    FROM soda_cardes
    WHERE cod_rep = ?
      AND fecha = STR_TO_DATE(?, '%d/%m/%Y')
    ORDER BY cod_prod
  `;

  try {
    const rows = await executeQueryWithRetry(query, [cod_rep, fecha]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error al leer soda_cardes:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error en la base de datos' });
  }
});

// POST /procesar_stock
app.post('/procesar_stock', async (req, res) => {
  const { fecha, cod_rep, cod_zona } = req.body;
  if (!fecha || !cod_rep || !cod_zona) {
    return res
      .status(400)
      .json({ success: false, message: 'fecha, cod_rep y cod_zona son requeridos' });
  }

  try {
    // 1) Sumar ventas del día para ese rep y zona
    const sumQuery = `
      SELECT IFNULL(SUM(venta), 0) AS totalVenta
      FROM soda_hoja_completa
      WHERE cod_rep = ?
        AND cod_zona = ?
        AND fecha = STR_TO_DATE(?, '%d/%m/%Y')
    `;
    const [ { totalVenta } ] = await executeQueryWithRetry(sumQuery, [
      cod_rep, cod_zona, fecha
    ]);

    // 2) Obtener el stock principal (último registro anterior a la fecha)
    const stockQuery = `
      SELECT fecha, tapas, bidon_a4, bidon_a3, bases
      FROM soda_stock
      WHERE fecha < STR_TO_DATE(?, '%d/%m/%Y')
      ORDER BY fecha DESC
      LIMIT 1
    `;
    const rows = await executeQueryWithRetry(stockQuery, [fecha]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'No hay stock previo para procesar' });
    }
    const principal = rows[0];

    // 3) Calcular nuevo stock de tapas
    const nuevoTaps = principal.tapas - totalVenta;

    // 4) Insertar el nuevo registro de stock
    const insertQuery = `
      INSERT INTO soda_stock
        (fecha, tapas, bidon_a4, bidon_a3, bases)
      VALUES
        (STR_TO_DATE(?, '%d/%m/%Y'), ?, ?, ?, ?)
    `;
    await executeQueryWithRetry(insertQuery, [
      fecha,
      nuevoTaps,
      principal.bidon_a4,
      principal.bidon_a3,
      principal.bases
    ]);

    res.json({
      success: true,
      newStock: {
        fecha,
        tapas: nuevoTaps,
        bidon_a4: principal.bidon_a4,
        bidon_a3: principal.bidon_a3,
        bases: principal.bases
      }
    });
  } catch (err) {
    console.error('Error procesando stock:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error en la base de datos' });
  }
});


// Middleware de Manejo de Errores
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

