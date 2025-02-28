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

// Función para crear una conexión a la base de datos
const createDBConnection = async () => {
  return await mysql.createConnection({
    host: '190.228.29.61',
    user: 'kalel2016',
    password: 'Kalel2016',
    database: 'soda',
    connectTimeout: 10000, // Tiempo máximo para establecer una conexión (en ms)
  });
};

// Función de reintento para ejecutar consultas en caso de ECONNRESET
const executeQueryWithRetry = async (query, params, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let connection;
    try {
      connection = await createDBConnection();
      const [results] = await connection.execute(query, params);
      return results;
    } catch (err) {
      if (err.code === 'ECONNRESET' && attempt < retries) {
        console.warn(`Intento ${attempt} fallido. Reintentando...`);
        await new Promise(res => setTimeout(res, 1000)); // Esperar 1 segundo antes de reintentar
      } else {
        throw err;
      }
    } finally {
      if (connection) {
        await connection.end();
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
  
  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query);
    res.json({ success: true, rubros: results });
  } catch (err) {
    console.error('Error al obtener rubros:', err);
    res.status(500).json({ success: false, message: 'Error al obtener rubros' });
  } finally {
    if (connection) {
      await connection.end();
    }
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

  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query, [cod_rep, fecha, cod_gasto, importe]);
    res.json({ success: true, message: 'Rendición añadida correctamente', id: results.insertId });
  } catch (err) {
    console.error('Error al añadir rendición:', err);
    res.status(500).json({ success: false, message: 'Error al añadir rendición' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Ruta para obtener rendiciones de un vendedor
app.get('/rendiciones/:cod_rep', async (req, res) => {
  const { cod_rep } = req.params;

  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  const query = 'SELECT * FROM soda_rendiciones WHERE cod_rep = ?';

  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query, [cod_rep]);
    res.json({ success: true, rendiciones: results });
  } catch (err) {
    console.error('Error al obtener rendiciones:', err);
    res.status(500).json({ success: false, message: 'Error al obtener rendiciones' });
  } finally {
    if (connection) {
      await connection.end();
    }
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

  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query, [cod_rep]);
    res.json({ success: true, zonas: results });
  } catch (err) {
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});


// Ruta para obtener clientes
// Ruta para obtener clientes con secuencia
app.post('/clientes', async (req, res) => {
  const { numzona, cod_rep } = req.body;
  console.log(`Recibido numzona: ${numzona}`);
  console.log(`Recibido cod_rep: ${cod_rep}`);

  if (!numzona || !cod_rep) {
    return res.status(400).json({ success: false, message: 'numzona y cod_rep son requeridos' });
  }

  const query = `
    SELECT cod_cliente, nom_cliente, domicilio, localidad, celular, secuencia
    FROM soda_hoja_header
    WHERE cod_zona = ? AND ter != 1
    ORDER BY secuencia ASC
  `;

  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query, [numzona]);

    console.log('Clientes obtenidos:', results); // 🔍 Verificar si la secuencia se obtiene correctamente

    res.json({ success: true, clientes: results });
  } catch (err) {
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});



app.post('/resultados-del-dia', async (req, res) => {
  const { cod_rep } = req.body;
  const fechaHoy = new Date().toISOString().split('T')[0];
  console.log('Fecha de hoy:', fechaHoy);
  console.log('Código de representante:', cod_rep);


  if (!cod_rep) {
    return res.status(400).json({ success: false, message: 'cod_rep es requerido' });
  }

  // Consulta para eliminar duplicados
const eliminarDuplicadosQuery = `
  DELETE t1 FROM soda_hoja_completa t1
  INNER JOIN soda_hoja_completa t2
  ON t1.cod_cliente = t2.cod_cliente
    AND t1.cod_prod = t2.cod_prod
    AND t1.fecha = t2.fecha
    AND t1.cod_rep = t2.cod_rep
    AND t1.id > t2.id;
`;

  // Consulta principal para obtener resultados
  const resultadosQuery = `
    SELECT
      SUM(CASE WHEN cod_prod = 'A4' THEN venta ELSE 0 END) AS venta_A4, -- Sumar solo valores de venta
      SUM(CASE WHEN cod_prod = 'A3' THEN venta ELSE 0 END) AS venta_A3, -- Sumar solo valores de venta
      SUM(CASE WHEN cod_prod = 'A4' THEN cobrado_ctdo ELSE 0 END) AS cobrado_ctdo_A4,
      SUM(CASE WHEN cod_prod = 'A3' THEN cobrado_ctdo ELSE 0 END) AS cobrado_ctdo_A3,
      SUM(CASE WHEN cod_prod = 'A4' THEN cobrado_ccte ELSE 0 END) AS cobrado_ccte_A4,
      SUM(CASE WHEN cod_prod = 'A3' THEN cobrado_ccte ELSE 0 END) AS cobrado_ccte_A3,
      SUM(CASE WHEN cod_prod = 'A4' AND cobrado_ctdo = 0 THEN venta ELSE 0 END) AS fiado_A4,
      SUM(CASE WHEN cod_prod = 'A3' AND cobrado_ctdo = 0 THEN venta ELSE 0 END) AS fiado_A3
    FROM soda_hoja_completa
    WHERE cod_rep = ? AND fecha = ?;
  `;

  const preciosQuery = `
    SELECT cod_prod, precio
    FROM soda_precios
    WHERE cod_prod IN ('A3', 'A4')
  `;

  const rendicionesQuery = `
    SELECT 
      sr.cod_gasto,
      sr.importe,
      srr.descripcion
    FROM soda_rendiciones sr
    JOIN soda_rubros_rendiciones srr ON sr.cod_gasto = srr.cod
    WHERE sr.cod_rep = ? AND sr.fecha = ?
  `;

  let connection;
  try {
    connection = await createDBConnection();

    // Iniciar transacción para garantizar consistencia
    await connection.beginTransaction();

    // Eliminar duplicados
    await connection.execute(eliminarDuplicadosQuery);

    // Ejecutar las consultas principales
    const [resultados, precios, rendiciones] = await Promise.all([
      connection.execute(resultadosQuery, [cod_rep, fechaHoy]),
      connection.execute(preciosQuery),
      connection.execute(rendicionesQuery, [cod_rep, fechaHoy]),
    ]);

    // Confirmar los cambios
    await connection.commit();

    // Procesar los datos obtenidos
    const resultadosData = resultados[0][0];
    const preciosData = precios[0];
    const rendicionesData = rendiciones[0];

    const preciosMap = {};
    preciosData.forEach((item) => {
      preciosMap[item.cod_prod] = parseFloat(item.precio);
    });

    const totalesAlContado =
      (parseFloat(resultadosData.cobrado_ctdo_A3) || 0) * (preciosMap['A3'] || 0) +
      (parseFloat(resultadosData.cobrado_ctdo_A4) || 0) * (preciosMap['A4'] || 0);

    const totalesCobradoCCTE =
      (parseFloat(resultadosData.cobrado_ccte_A3) || 0) * (preciosMap['A3'] || 0) +
      (parseFloat(resultadosData.cobrado_ccte_A4) || 0) * (preciosMap['A4'] || 0);

    const fiado_a4_pesos = (parseFloat(resultadosData.fiado_A4) || 0) * (preciosMap['A4'] || 0);
    const fiado_a3_pesos = (parseFloat(resultadosData.fiado_A3) || 0) * (preciosMap['A3'] || 0);

    const totalesFiadoPesos = fiado_a4_pesos + fiado_a3_pesos;

    res.json({
      success: true,
      resultados: resultadosData,
      precios: preciosData,
      rendiciones: rendicionesData,
      totalesAlContado,
      totalesCobradoCCTE,
      fiado_a4: resultadosData.fiado_A4,
      fiado_a3: resultadosData.fiado_A3,
      fiado_a4_pesos,
      fiado_a3_pesos,
      totalesFiadoPesos,
    });
  } catch (err) {
    // Revertir cambios en caso de error
    if (connection) await connection.rollback();
    console.error('Error ejecutando las consultas:', err);
    res.status(500).json({ success: false, error: 'Error al obtener resultados del día' });
  } finally {
    if (connection) {
      await connection.end();
    }
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

  // Consulta SQL para obtener ventas mensuales con eliminación de duplicados
  const ventasMensualesQuery = `
    SELECT 
      fecha,
      cod_zona AS zona,
      SUM(CASE WHEN cod_prod = 'A4' THEN cobrado_ctdo ELSE 0 END) AS cobrado_ctdo_A4,
      SUM(CASE WHEN cod_prod = 'A3' THEN cobrado_ctdo ELSE 0 END) AS cobrado_ctdo_A3,
      SUM(CASE WHEN cod_prod = 'A4' THEN cobrado_ccte ELSE 0 END) AS cobrado_ccte_A4,
      SUM(CASE WHEN cod_prod = 'A3' THEN cobrado_ccte ELSE 0 END) AS cobrado_ccte_A3
    FROM (
      SELECT DISTINCT 
        fecha,
        cod_zona,
        cod_cliente,
        cod_prod,
        cobrado_ctdo,
        cobrado_ccte
      FROM soda_hoja_completa
      WHERE cod_rep = ? AND YEAR(fecha) = ? AND MONTH(fecha) = ?
    ) AS subquery
    GROUP BY fecha, cod_zona
    ORDER BY fecha ASC
  `;

  const preciosQuery = `
    SELECT cod_prod, precio
    FROM soda_precios
    WHERE cod_prod IN ('A3', 'A4')
  `;

  let connection;
  try {
    connection = await createDBConnection();

    // Ejecutar consultas en paralelo
    const [ventasMensuales, preciosData] = await Promise.all([
      connection.execute(ventasMensualesQuery, [cod_rep, añoActual, mesActual]),
      connection.execute(preciosQuery),
    ]);

    const ventasData = ventasMensuales[0];
    const precios = preciosData[0];

    // Crear un mapa de precios para fácil acceso
    const preciosMap = {};
    precios.forEach((item) => {
      preciosMap[item.cod_prod] = parseFloat(item.precio);
    });

    // Calcular los montos en pesos y preparar los datos
    const ventasConPesos = ventasData.map((venta) => {
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

    ventasConPesos.forEach((venta) => {
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
        total_general: totalGeneral,
      },
    });
  } catch (err) {
    console.error('Error ejecutando las consultas:', err);
    res.status(500).json({ success: false, error: 'Error al obtener ventas mensuales' });
  } finally {
    if (connection) {
      await connection.end();
    }
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

  let connection;
  try {
    connection = await createDBConnection();
    const [results] = await connection.execute(query, [cod_cliente]);
    res.json({ success: true, movimientos: results });
  } catch (err) {
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, message: 'Error en la base de datos' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

app.post('/update-movimientos-y-resultados', async (req, res) => {
  const { cod_cliente, cod_prod, venta, cobrado_ctdo, cobrado_ccte, cod_rep, zona, bidones_bajados, motivo, fecha } = req.body;
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
    bidones_bajados === undefined ||
    !fecha
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
    values = [cod_rep, fecha, zona, venta, cobrado_ctdo, cobrado_ccte];
  } else if (cod_prod === 'A3') {
    upsertQuery = `
      INSERT INTO resultadofinales (cod_rep, fecha, zona, venta_A3, cobrado_ctdo_A3, cobrado_ccte_A3)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        venta_A3 = venta_A3 + VALUES(venta_A3),
        cobrado_ctdo_A3 = cobrado_ctdo_A3 + VALUES(cobrado_ctdo_A3),
        cobrado_ccte_A3 = cobrado_ccte_A3 + VALUES(cobrado_ccte_A3)
    `;
    values = [cod_rep, fecha, zona, venta, cobrado_ctdo, cobrado_ccte];
  } else {
    // Manejar otros casos de cod_prod si es necesario
    return res.json({ success: false, error: 'Producto desconocido' });
  }

  let connection;

  try {
    // Obtener una conexión
    connection = await createDBConnection();

    // Iniciar una transacción
    await connection.beginTransaction();

    // Actualizar movimientos
    const [updateResult] = await connection.execute(updateMovimientosQuery, [venta, cobrado_ctdo, cobrado_ccte, cod_cliente, cod_prod]);

    if (updateResult.affectedRows === 0) {
      throw new Error('No se encontró el registro para actualizar en soda_hoja_linea');
    }

    // Verificar si ya existe el registro para los resultados
    const [checkResult] = await connection.execute(checkQuery, [cod_rep, fecha, zona]);

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

    // Insertar en soda_hoja_completa
    const insertCompletaQuery = `
      INSERT INTO soda_hoja_completa (cod_rep, cod_zona, orden, cod_cliente, cod_prod, debe, venta, cobrado_ctdo, cobrado_ccte, bidones_bajados, fecha, motivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    // Suponiendo que 'orden' debe ser proporcionado o calculado. Aquí lo dejamos como '0' como ejemplo.
    const orden = 0; // Reemplaza esto con el valor correcto según tu lógica

    const debe = 0; // Asegurarse de que 'debe' sea un número

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
      fecha, // Agregar la fecha proporcionada
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
      await connection.end(); // Cerrar la conexión
    }
  }
});


app.post('/crear-cliente', async (req, res) => {
  const { razon, localidad, celular, bidon, cantidad, pago, numzona, secuencia } = req.body;

  if (!razon || !localidad || !celular || !bidon || !cantidad || !numzona || !secuencia) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

const insertClienteQuery = `
  INSERT INTO clientenuevo (razon, localidad, celular, bidon, cantidad, pago, numzona, secuencia)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

  let connection;
  try {
    connection = await createDBConnection();
    await connection.execute(insertClienteQuery, [razon, localidad, celular, bidon, cantidad, pago, numzona, secuencia]);
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

// Ruta para obtener movimientos de clientes basados en fecha, zona y repartidor
app.post('/movimientos-clientes', async (req, res) => {
  const { fecha, numzona, cod_rep } = req.body;

  console.log(`Recibido: fecha=${fecha}, numzona=${numzona}, cod_rep=${cod_rep}`);

  // Validación de parámetros
  if (!fecha || !numzona || !cod_rep) {
    return res.status(400).json({ success: false, message: 'fecha, numzona y cod_rep son requeridos' });
  }

  // Consultas SQL
  const clientesQuery = `
    SELECT DISTINCT shh.cod_cliente, shh.nom_cliente, shh.domicilio, shh.localidad, shh.celular
    FROM soda_hoja_header shh
    INNER JOIN soda_hoja_completa shc ON shh.cod_cliente = shc.cod_cliente
    WHERE shh.cod_zona = ? 
      AND shc.cod_rep = ?
      AND DATE(shc.fecha) = ?
      AND shh.ter = 1
    ORDER BY shh.secuencia ASC
  `;

  const movimientosQuery = `
    SELECT 
      shc.cod_cliente,
      shc.cod_prod,
      shc.debe,
      shc.venta,
      shc.cobrado_ctdo,
      shc.cobrado_ccte,
      shc.bidones_bajados,
      DATE(shc.fecha) as fecha,
      shc.motivo
    FROM soda_hoja_completa shc
    WHERE shc.cod_rep = ?
      AND shc.cod_zona = ?
      AND DATE(shc.fecha) = ?
      AND shc.cod_cliente IN (
        SELECT cod_cliente 
        FROM soda_hoja_header 
        WHERE cod_zona = ? AND ter = 1
      )
    ORDER BY shc.fecha DESC, shc.orden ASC
  `;

  let connection;
  try {
    connection = await createDBConnection();

    // Obtener clientes visitados
    const [clientes] = await connection.execute(clientesQuery, [numzona, cod_rep, fecha]);
    console.log(`Clientes obtenidos: ${clientes.length}`);

    if (clientes.length === 0) {
      return res.json({ success: true, clientes: [] });
    }

    // Obtener movimientos para los clientes visitados
    const [movimientos] = await connection.execute(movimientosQuery, [cod_rep, numzona, fecha, numzona]);
    console.log(`Movimientos obtenidos: ${movimientos.length}`);

    // Agrupar movimientos por cliente
    const movimientosPorCliente = movimientos.reduce((acc, movimiento) => {
      if (!acc[movimiento.cod_cliente]) {
        acc[movimiento.cod_cliente] = [];
      }
      acc[movimiento.cod_cliente].push({
        cod_prod: movimiento.cod_prod,
        debe: movimiento.debe,
        venta: movimiento.venta,
        cobrado_ctdo: movimiento.cobrado_ctdo,
        cobrado_ccte: movimiento.cobrado_ccte,
        bidones_bajados: movimiento.bidones_bajados,
        fecha: movimiento.fecha,
        motivo: movimiento.motivo
      });
      return acc;
    }, {});

    // Preparar la respuesta
    const clientesConMovimientos = clientes.map(cliente => ({
      ...cliente,
      movimientos: movimientosPorCliente[cliente.cod_cliente] || []
    }));

    console.log(`Clientes con Movimientos: ${clientesConMovimientos.length}`);

    res.json({ success: true, clientes: clientesConMovimientos });
  } catch (error) {
    console.error('Error en /movimientos-clientes:', error);
    res.status(500).json({ success: false, message: 'Error al obtener movimientos de clientes' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Middleware de Manejo de Errores
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
