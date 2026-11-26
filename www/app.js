// =========================================================
// INICIALIZACIÓN DE PLUGINS NATIVOS CAPACITOR (SI EXISTEN)
// =========================================================
const getCapacitorPlugins = () => {
  if (window.Capacitor && window.Capacitor.Plugins) {
    return window.Capacitor.Plugins;
  }
  return {};
};

// =========================================================
// BASE DE DATOS LOCAL (INDEXEDDB PARA SOPORTAR PDFS GRANDES)
// =========================================================
const DB_NAME = 'GestorGoldDB';
const DB_VERSION = 1;
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('pedidos')) {
        database.createObjectStore('pedidos', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('pagos')) {
        database.createObjectStore('pagos', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('catalogos')) {
        database.createObjectStore('catalogos', { keyPath: 'id' });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject(e);
  });
}

function dbPut(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function dbDelete(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

// =========================================================
// NAVEGACIÓN ENTRE PESTAÑAS
// =========================================================
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach((s) => s.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
    document.getElementById('page-title').textContent = btn.getAttribute('data-title');
  });
});

// =========================================================
// NOTIFICACIONES NATIVAS ANDROID
// =========================================================
async function solicitarPermisoNotificaciones() {
  const { LocalNotifications } = getCapacitorPlugins();
  if (LocalNotifications) {
    try {
      await LocalNotifications.requestPermissions();
    } catch (err) {
      console.log('Error permisos notificación:', err);
    }
  }
}

async function programarNotificacionPedido(pedido) {
  const { LocalNotifications } = getCapacitorPlugins();
  if (!LocalNotifications) return;

  try {
    // Programar aviso 1 día antes a las 9:00 AM (o en 10 segundos si la fecha es hoy/mañana)
    const fechaEntrega = new Date(pedido.fechaEntrega + 'T09:00:00');
    const fechaAviso = new Date(fechaEntrega.getTime() - 24 * 60 * 60 * 1000);
    const ahora = new Date();

    const triggerDate = fechaAviso > ahora ? fechaAviso : new Date(ahora.getTime() + 10000);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(pedido.id % 2147483647),
          title: `Entrega próxima: ${pedido.cliente}`,
          body: `Pedido: ${pedido.descripcion} — Fecha entrega: ${pedido.fechaEntrega}`,
          schedule: { at: triggerDate },
          smallIcon: 'ic_launcher'
        }
      ]
    });
  } catch (err) {
    console.log('No se pudo programar notificación:', err);
  }
}

document.getElementById('btn-test-notif').addEventListener('click', async () => {
  const { LocalNotifications } = getCapacitorPlugins();
  if (LocalNotifications) {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 99999,
          title: 'Gestor Gold Activo',
          body: 'Las alertas de entrega están funcionando correctamente.',
          schedule: { at: new Date(Date.now() + 2000) }
        }
      ]
    });
    alert('Notificación de prueba enviada (llegará en 2 segundos).');
  } else {
    alert('Modo navegador: Las notificaciones nativas se activarán al instalar el APK en Android.');
  }
});

// =========================================================
// MÓDULO 1: PEDIDOS
// =========================================================
const hoyISO = new Date().toISOString().split('T')[0];
document.getElementById('ped-fecha-inicio').value = hoyISO;

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pedido = {
    id: Date.now(),
    cliente: document.getElementById('ped-cliente').value.trim(),
    descripcion: document.getElementById('ped-desc').value.trim(),
    fechaInicio: document.getElementById('ped-fecha-inicio').value,
    fechaEntrega: document.getElementById('ped-fecha-entrega').value
  };

  await dbPut('pedidos', pedido);
  await programarNotificacionPedido(pedido);

  e.target.reset();
  document.getElementById('ped-fecha-inicio').value = hoyISO;
  renderPedidos();
});

async function renderPedidos() {
  const pedidos = await dbGetAll('pedidos');
  pedidos.sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega));

  const contenedor = document.getElementById('lista-pedidos');
  if (pedidos.length === 0) {
    contenedor.innerHTML = '<p class="item-meta">No hay pedidos registrados.</p>';
    return;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  contenedor.innerHTML = pedidos.map((p) => {
    const fEntrega = new Date(p.fechaEntrega + 'T00:00:00');
    const diffDias = Math.ceil((fEntrega - hoy) / (1000 * 60 * 60 * 24));

    let badgeHTML = `<span class="badge-gold">Faltan ${diffDias} días</span>`;
    if (diffDias === 0) badgeHTML = `<span class="badge-urgent">¡Entrega HOY!</span>`;
    else if (diffDias === 1) badgeHTML = `<span class="badge-urgent">Entrega MAÑANA</span>`;
    else if (diffDias < 0) badgeHTML = `<span class="badge-urgent">Vencido (${Math.abs(diffDias)}d)</span>`;

    return `
      <div class="item-card">
        <div class="item-header">
          <div class="item-title">${p.cliente}</div>
          ${badgeHTML}
        </div>
        <div class="item-meta">
          <strong>Producto:</strong> ${p.descripcion}<br/>
          <strong>Pedido:</strong> ${p.fechaInicio} &nbsp;|&nbsp; <strong>Entrega:</strong> ${p.fechaEntrega}
        </div>
        <div class="item-actions">
          <button class="btn-small delete" onclick="eliminarPedido(${p.id})">Entregado / Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

window.eliminarPedido = async (id) => {
  await dbDelete('pedidos', id);
  renderPedidos();
};

// =========================================================
// MÓDULO 2: PAGOS Y DIVISOR (2 / 4 / 8 PAGOS)
// =========================================================
let partesSeleccionadas = 1;
const inputTotal = document.getElementById('pago-total');
const splitPreview = document.getElementById('split-preview');

function actualizarPreviewDivision() {
  const total = parseFloat(inputTotal.value) || 0;
  if (total <= 0) {
    splitPreview.textContent = 'Ingresa un monto para calcular parcialidades';
    return;
  }
  const montoPorPago = (total / partesSeleccionadas).toFixed(2);
  if (partesSeleccionadas === 1) {
    splitPreview.textContent = `Pago único de $${total.toFixed(2)}`;
  } else {
    splitPreview.textContent = `${partesSeleccionadas} pagos de $${montoPorPago} c/u`;
  }
}

document.querySelectorAll('.split-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.split-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    partesSeleccionadas = parseInt(btn.getAttribute('data-parts'));
    actualizarPreviewDivision();
  });
});

inputTotal.addEventListener('input', actualizarPreviewDivision);

document.getElementById('form-pago').addEventListener('submit', async (e) => {
  e.preventDefault();
  const total = parseFloat(document.getElementById('pago-total').value);
  const abonado = parseFloat(document.getElementById('pago-inicial').value) || 0;

  const cuenta = {
    id: Date.now(),
    cliente: document.getElementById('pago-cliente').value.trim(),
    total: total,
    abonado: Math.min(abonado, total),
    parcialidades: partesSeleccionadas,
    montoParcialidad: parseFloat((total / partesSeleccionadas).toFixed(2))
  };

  await dbPut('pagos', cuenta);
  e.target.reset();
  partesSeleccionadas = 1;
  document.querySelectorAll('.split-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.split-btn[data-parts="1"]').classList.add('active');
  actualizarPreviewDivision();
  renderPagos();
});

async function renderPagos() {
  const pagos = await dbGetAll('pagos');
  const contenedor = document.getElementById('lista-pagos');

  if (pagos.length === 0) {
    contenedor.innerHTML = '<p class="item-meta">No hay cuentas de pago registradas.</p>';
    return;
  }

  contenedor.innerHTML = pagos.map((c) => {
    const restante = Math.max(0, c.total - c.abonado);
    const porcentaje = Math.min(100, Math.round((c.abonado / c.total) * 100));
    const planTexto = c.parcialidades > 1
      ? `${c.parcialidades} pagos de $${c.montoParcialidad.toFixed(2)}`
      : 'Contado';

    return `
      <div class="item-card">
        <div class="item-header">
          <div class="item-title">${c.cliente}</div>
          <span class="badge-gold">${planTexto}</span>
        </div>

        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${porcentaje}%"></div>
        </div>

        <div class="pago-grid">
          <div class="pago-stat">
            <span>Total</span>
            <strong>$${c.total.toFixed(2)}</strong>
          </div>
          <div class="pago-stat">
            <span>Abonado</span>
            <strong class="gold">$${c.abonado.toFixed(2)}</strong>
          </div>
          <div class="pago-stat">
            <span>Falta</span>
            <strong>$${restante.toFixed(2)}</strong>
          </div>
        </div>

        <div class="item-actions">
          ${restante > 0
            ? `<button class="btn-small" onclick="abrirModalAbono(${c.id})">+ Abonar ($${c.montoParcialidad.toFixed(2)})</button>`
            : `<span class="badge-gold" style="flex:1; text-align:center; padding:8px;">¡Cuenta Liquidada!</span>`
          }
          <button class="btn-small delete" onclick="eliminarPago(${c.id})">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

// MODAL PARA ABONOS
let cuentaActivaId = null;

window.abrirModalAbono = async (id) => {
  const pagos = await dbGetAll('pagos');
  const cuenta = pagos.find((p) => p.id === id);
  if (!cuenta) return;

  cuentaActivaId = id;
  const restante = cuenta.total - cuenta.abonado;

  document.getElementById('modal-abono-cliente').textContent = cuenta.cliente;
  document.getElementById('modal-abono-info').textContent = `Saldo pendiente: $${restante.toFixed(2)} | Parcialidad sugerida: $${cuenta.montoParcialidad.toFixed(2)}`;
  document.getElementById('input-nuevo-abono').value = Math.min(restante, cuenta.montoParcialidad).toFixed(2);
  document.getElementById('modal-abono').classList.remove('hidden');
};

document.getElementById('btn-cancelar-abono').addEventListener('click', () => {
  document.getElementById('modal-abono').classList.add('hidden');
});

document.getElementById('btn-confirmar-abono').addEventListener('click', async () => {
  const monto = parseFloat(document.getElementById('input-nuevo-abono').value);
  if (!monto || monto <= 0) return;

  const pagos = await dbGetAll('pagos');
  const cuenta = pagos.find((p) => p.id === cuentaActivaId);
  if (cuenta) {
    cuenta.abonado = Math.min(cuenta.total, cuenta.abonado + monto);
    await dbPut('pagos', cuenta);
  }

  document.getElementById('modal-abono').classList.add('hidden');
  renderPagos();
});

window.eliminarPago = async (id) => {
  await dbDelete('pagos', id);
  renderPagos();
};

// =========================================================
// MÓDULO 3: CATÁLOGOS PDF POR CATEGORÍA Y WHATSAPP
// =========================================================
let categorias = JSON.parse(localStorage.getItem('gold_categorias')) || ['Ropa', 'Zapatos', 'Accesorios'];
let filtroCategoriaActual = 'Todas';

function renderCategorias() {
  localStorage.setItem('gold_categorias', JSON.stringify(categorias));

  // Llenar Select del formulario
  const select = document.getElementById('cat-select');
  select.innerHTML = categorias.map((cat) => `<option value="${cat}">${cat}</option>`).join('');

  // Llenar Chips de filtro
  const chipsContainer = document.getElementById('chips-categorias');
  const todas = ['Todas', ...categorias];
  chipsContainer.innerHTML = todas.map((cat) => `
    <button type="button" class="chip ${filtroCategoriaActual === cat ? 'active' : ''}" onclick="filtrarPorCategoria('${cat}')">
      ${cat}
    </button>
  `).join('');
}

window.filtrarPorCategoria = (cat) => {
  filtroCategoriaActual = cat;
  renderCategorias();
  renderCatalogos();
};

document.getElementById('btn-crear-cat').addEventListener('click', () => {
  const input = document.getElementById('nueva-categoria');
  const nombre = input.value.trim();
  if (nombre && !categorias.includes(nombre)) {
    categorias.push(nombre);
    input.value = '';
    renderCategorias();
  }
});

function leerArchivoComoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

document.getElementById('form-catalogo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('cat-archivo');
  const file = fileInput.files[0];
  if (!file) return;

  const base64Data = await leerArchivoComoBase64(file);

  const catalogo = {
    id: Date.now(),
    nombre: document.getElementById('cat-nombre').value.trim(),
    categoria: document.getElementById('cat-select').value,
    fileName: file.name,
    base64: base64Data
  };

  await dbPut('catalogos', catalogo);
  e.target.reset();
  renderCatalogos();
});

async function renderCatalogos() {
  let catalogos = await dbGetAll('catalogos');
  if (filtroCategoriaActual !== 'Todas') {
    catalogos = catalogos.filter((c) => c.categoria === filtroCategoriaActual);
  }

  const contenedor = document.getElementById('lista-catalogos');
  if (catalogos.length === 0) {
    contenedor.innerHTML = '<p class="item-meta">No hay catálogos PDF en esta categoría.</p>';
    return;
  }

  contenedor.innerHTML = catalogos.map((cat) => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-title">${cat.nombre}</div>
        <span class="badge-gold">${cat.categoria}</span>
      </div>
      <div class="item-meta">Archivo: ${cat.fileName}</div>
      <div class="item-actions">
        <button class="btn-small whatsapp" onclick="compartirCatalogo(${cat.id})">Compartir PDF (WhatsApp)</button>
        <button class="btn-small delete" onclick="eliminarCatalogo(${cat.id})">Eliminar</button>
      </div>
    </div>
  `).join('');
}

window.compartirCatalogo = async (id) => {
  const catalogos = await dbGetAll('catalogos');
  const cat = catalogos.find((c) => c.id === id);
  if (!cat) return;

  const { Filesystem, Share } = getCapacitorPlugins();

  // MODO NATIVO ANDROID (CAPACITOR)
  if (Filesystem && Share) {
    try {
      const safeName = cat.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const savedFile = await Filesystem.writeFile({
        path: safeName,
        data: cat.base64,
        directory: 'CACHE'
      });

      await Share.share({
        title: cat.nombre,
        text: `Te comparto el catálogo: ${cat.nombre}`,
        url: savedFile.uri,
        dialogTitle: 'Compartir catálogo en WhatsApp'
      });
    } catch (err) {
      alert('Error al compartir archivo: ' + err.message);
    }
  } else {
    // FALLBACK SI SE PRUEBA EN NAVEGADOR WEB
    const byteCharacters = atob(cat.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const file = new File([blob], cat.fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: cat.nombre,
        files: [file]
      });
    } else {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }
};

window.eliminarCatalogo = async (id) => {
  await dbDelete('catalogos', id);
  renderCatalogos();
};

// =========================================================
// ARRANQUE DE LA APLICACIÓN
// =========================================================
window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await solicitarPermisoNotificaciones();
  renderPedidos();
  renderPagos();
  renderCategorias();
  renderCatalogos();
});