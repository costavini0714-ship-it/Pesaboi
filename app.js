'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'pesaboi-database-v3';
const DB_VERSION = 1;
const screens = ['login', 'home', 'database', 'scanner', 'measurement', 'detail', 'update'];
let account = null;
let animals = [];
let currentId = null;
let pendingPhotoBlob = null;
let pendingPhotoUrl = '';
let pendingPhotoQuality = null;
let cameraStream = null;
let databaseAvailable = true;
let databasePromise = null;
let detailPhotoUrl = '';
let draftVaccines = [];
let toastTimer = null;
let pendingVision = null;
let pendingCattleDetection = null;
let cattleDetector = null;
let cattleDetectorPromise = null;
let nightModeOn = false;
let torchOn = false;
let selectedCameraId = '';
let visionModelStatus = 'detector bovino local + cálculo morfométrico experimental';

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

function makeId() {
  return window.crypto?.randomUUID ? crypto.randomUUID() : 'animal-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fallbackKey() { return 'pesaboi_v3_animals_' + (account?.id || 'local'); }
function oldAccountKey() {
  return 'pesaboi_animals_' + String(account?.email || account?.phone || account?.owner || 'local').toLowerCase();
}

function idbOpen() {
  if (!('indexedDB' in window)) {
    databaseAvailable = false;
    return Promise.reject(new Error('IndexedDB não está disponível neste navegador.'));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('animals')) db.createObjectStore('animals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('secure')) db.createObjectStore('secure', { keyPath: 'name' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco local.'));
  }).catch(error => { databasePromise = null; throw error; });
  return databasePromise;
}

async function idbRequest(storeName, method, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(storeName);
    const req = method === 'getAll' ? store.getAll() : method === 'get' ? store.get(value) : method === 'delete' ? store.delete(value) : store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Falha ao acessar os dados locais.'));
    tx.onabort = () => reject(tx.error || new Error('Transação local cancelada.'));
  });
}

async function getAllAnimals() {
  if (databaseAvailable) {
    try { return await idbRequest('animals', 'getAll'); }
    catch (error) { databaseAvailable = false; console.warn('Banco local:', error); }
  }
  try { return JSON.parse(localStorage.getItem(fallbackKey()) || '[]'); }
  catch { return []; }
}

async function saveAnimalRecord(animal) {
  if (databaseAvailable) {
    try { await idbRequest('animals', 'put', animal); return; }
    catch (error) { databaseAvailable = false; console.warn('Banco local:', error); }
  }
  const current = JSON.parse(localStorage.getItem(fallbackKey()) || '[]');
  const next = current.filter(item => item.id !== animal.id);
  next.push(animal);
  localStorage.setItem(fallbackKey(), JSON.stringify(next));
}

async function deleteAnimalRecord(id) {
  if (databaseAvailable) {
    try { await idbRequest('animals', 'delete', id); await idbRequest('photos', 'delete', id); return; }
    catch (error) { databaseAvailable = false; console.warn(error); }
  }
  const current = JSON.parse(localStorage.getItem(fallbackKey()) || '[]');
  localStorage.setItem(fallbackKey(), JSON.stringify(current.filter(item => item.id !== id)));
}

function dataURLToBlob(dataURL) {
  const [meta, data] = String(dataURL).split(',');
  if (!data) throw new Error('Imagem armazenada inválida.');
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Não foi possível preparar a foto.'));
    reader.readAsDataURL(blob);
  });
}

async function getPhotoBlob(id) {
  if (!id) return null;
  if (databaseAvailable) {
    try { const record = await idbRequest('photos', 'get', id); if (record?.blob) return record.blob; }
    catch (error) { console.warn(error); }
  }
  const animal = animals.find(item => item.id === id);
  if (animal?.photoData) {
    try { return dataURLToBlob(animal.photoData); } catch { return null; }
  }
  return null;
}

async function savePhoto(id, blob, animal = null) {
  if (!blob) return;
  if (databaseAvailable) {
    try { await idbRequest('photos', 'put', { id, blob, updatedAt: Date.now() }); return; }
    catch (error) { databaseAvailable = false; console.warn('Foto não armazenada no IndexedDB:', error); }
  }
  if (animal) animal.photoData = await blobToDataURL(blob);
}

function accountStorageSave() {
  localStorage.setItem('pesaboi_account_v3', JSON.stringify(account));
  localStorage.setItem('pesaboi_account', JSON.stringify(account));
}

async function migrateOldData() {
  if (!account?.id) return;
  const marker = 'pesaboi_v31_migrated_' + account.id;
  if (localStorage.getItem(marker)) return;
  try {
    const legacy = JSON.parse(localStorage.getItem(oldAccountKey()) || '[]');
    if (Array.isArray(legacy)) {
      const existing = new Set(animals.map(item => item.id));
      for (const old of legacy) {
        const id = old.id || makeId();
        if (existing.has(id)) continue;
        const migrated = {
          ...old, id, ownerId: account.id,
          name: String(old.name || 'Animal sem nome'),
          tag: String(old.tag || ''),
          created: Number(old.created) || Date.now(),
          weight: Number(old.weight) || null,
          sizeClass: old.sizeClass || '',
          history: Array.isArray(old.history) && old.history.length ? old.history : (old.weight ? [{ weight: Number(old.weight), date: new Date(old.created || Date.now()).toISOString(), source: 'legado', note: 'Registro preservado da versão anterior' }] : [])
        };
        const legacyPhoto = typeof old.photo === 'string' && old.photo.startsWith('data:image/') ? old.photo : null;
        delete migrated.photo;
        if (legacyPhoto) {
          const blob = dataURLToBlob(legacyPhoto);
          await savePhoto(id, blob, migrated);
          migrated.photoId = id;
        }
        await saveAnimalRecord(migrated);
      }
    }
  } catch (error) { console.warn('Migração PesaBoi anterior:', error); }
  localStorage.setItem(marker, '1');
}

async function loadData() {
  const all = await getAllAnimals();
  animals = all.filter(item => item.ownerId === account?.id);
  await migrateOldData();
  const afterMigration = await getAllAnimals();
  animals = afterMigration.filter(item => item.ownerId === account?.id);
  animals.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
  if ($('video')) $('video').srcObject = null;
  torchOn = false;
  if ($('torchToggle')) { $('torchToggle').setAttribute('aria-pressed', 'false'); $('torchToggle').textContent = '☼ Luz da câmera'; }
}

function show(id) {
  if (!screens.includes(id)) return;
  if (id !== 'scanner') stopCamera();
  if (id === 'scanner') {
    resetMeasurement();
    $('preview').classList.add('hidden'); $('preview').removeAttribute('src');
    $('video').classList.remove('hidden'); $('cameraPlaceholder').classList.remove('hidden');
    $('cameraStatus').textContent = 'Preparando a câmera ou aguardando uma foto...';
  }
  screens.forEach(name => $(name)?.classList.toggle('hidden', name !== id));
  document.body.classList.toggle('has-measurement', id === 'measurement');
  if (id === 'home') refreshHome();
  if (id === 'database') renderDatabase();
  if (id === 'scanner') startCamera();
  if (id === 'detail' && currentId) renderDetail(currentId);
  window.PesaBoiMonetization?.onScreen(id, Boolean(account?.id));
}

document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', event => {
  if (button.tagName === 'A') event.preventDefault();
  show(button.dataset.go);
}));

$('returnToDatabaseFromReport').addEventListener('click', () => show('database'));

$('register').addEventListener('submit', async event => {
  event.preventDefault();
  const owner = $('owner').value.trim();
  if (!owner) { $('owner').focus(); return; }
  account = { id: makeId(), owner, email: $('email').value.trim(), phone: $('phone').value.trim(), farm: $('farm').value.trim() || 'Minha Fazenda' };
  accountStorageSave();
  updateHeader();
  await loadData();
  show('home');
  toast('Propriedade pronta. Seus registros estão separados neste dispositivo.');
});

$('logout').addEventListener('click', () => {
  stopCamera(); account = null; animals = [];
  localStorage.removeItem('pesaboi_account_v3'); localStorage.removeItem('pesaboi_account');
  updateHeader(); show('login');
});

function updateHeader() {
  $('headerFarm').textContent = account?.farm || '';
  $('headerFarm').classList.toggle('hidden', !account);
  $('logout').classList.toggle('hidden', !account);
}

$('openCamera').addEventListener('click', () => show('scanner'));
$('openDatabase').addEventListener('click', () => show('database'));
$('closeCamera').addEventListener('click', () => show('home'));

function latestWeightEntry(animal) {
  const history = Array.isArray(animal?.history) ? animal.history.slice() : [];
  history.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  if (history[0]?.weight) return history[0];
  return animal?.weight ? { weight: Number(animal.weight), date: new Date(animal.created || Date.now()).toISOString(), source: animal.weightSource || 'legado' } : null;
}
function latestWeight(animal) { const entry = latestWeightEntry(animal); return entry ? Number(entry.weight) : null; }

function latestWeighing() {
  const rows = [];
  animals.forEach(animal => {
    const history = Array.isArray(animal.history) ? animal.history : [];
    if (history.length) history.forEach(entry => { if (Number(entry.weight) > 0) rows.push({ animal, ...entry }); });
    else if (animal.weight) rows.push({ animal, weight: animal.weight, date: new Date(animal.created || Date.now()).toISOString(), source: animal.weightSource || 'legado' });
  });
  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return rows[0] || null;
}

function refreshHome() {
  $('farmTitle').textContent = account?.farm || 'Minha Fazenda';
  $('hello').textContent = 'Olá, ' + (account?.owner || '') + '! Consulte seus registros e estimativas.';
  const latest = latestWeighing();
  $('lastName').textContent = latest?.animal?.name || 'Nenhum animal analisado';
  $('lastWeight').textContent = latest?.weight ? Number(latest.weight).toFixed(1) : '--';
  $('lastDate').textContent = latest?.date ? new Date(latest.date).toLocaleString('pt-BR') : 'Faça a primeira análise pela câmera.';
  $('viewLast').disabled = !latest?.animal?.id;
  $('viewLast').onclick = () => { if (latest?.animal?.id) { currentId = latest.animal.id; show('detail'); } };
  $('animalCount').textContent = animals.length + (animals.length === 1 ? ' animal' : ' animais');
  $('databaseCount').textContent = animals.length + (animals.length === 1 ? ' animal cadastrado' : ' animais cadastrados');
}

async function startCamera() {
  stopCamera();
  pendingPhotoBlob = null;
  pendingVision = null;
  if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
  pendingPhotoUrl = '';
  $('preview').classList.add('hidden'); $('video').classList.add('hidden'); $('cameraPlaceholder').classList.remove('hidden');
  $('cameraStatus').textContent = 'Solicitando acesso à câmera...'; $('photo').value = '';
  $('video').classList.toggle('night-mode', nightModeOn);
  if (!navigator.mediaDevices?.getUserMedia) {
    $('cameraStatus').textContent = 'Este endereço não permite abrir a câmera. Use HTTPS no Render ou o servidor local do pacote.';
    return;
  }
  try {
    const video = selectedCameraId
      ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1440 }, height: { ideal: 900 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1440 }, height: { ideal: 900 } };
    cameraStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    $('video').srcObject = cameraStream; $('video').classList.remove('hidden'); $('cameraPlaceholder').classList.add('hidden');
    await $('video').play().catch(() => {});
    $('cameraStatus').textContent = 'Câmera pronta. Mantenha o bovino inteiro dentro da área quadrada.';
    await refreshCameraChoices();
  } catch (error) {
    $('cameraStatus').textContent = 'Não foi possível abrir a câmera (' + (error?.name || 'acesso negado') + '). Você ainda pode escolher uma foto.';
    $('cameraPlaceholder').classList.remove('hidden');
  }
}

async function refreshCameraChoices() {
  const select = $('cameraDevice');
  if (!select || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === 'videoinput');
    const current = selectedCameraId;
    select.innerHTML = '<option value="">Câmera padrão</option>';
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || ('Câmera ' + (index + 1));
      if (/infra|infrared|\bir\b|night|noturna/i.test(option.textContent)) option.textContent += ' · possível infravermelha';
      select.append(option);
    });
    select.value = current;
  } catch { /* nomes de câmera indisponíveis antes da permissão em alguns navegadores */ }
}

async function imageBlobFromCanvas(canvas, quality = .9) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.')), 'image/jpeg', quality));
}

function analyzePhotoQuality(bitmap) {
  const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 180;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 180, 180);
  const { data } = ctx.getImageData(0, 0, 180, 180);
  const gray = new Float32Array(180 * 180);
  let brightness = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    gray[p] = value; brightness += value;
  }
  brightness /= gray.length;
  let sum = 0, sum2 = 0, count = 0;
  for (let y = 1; y < 179; y++) for (let x = 1; x < 179; x++) {
    const i = y * 180 + x;
    const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - 180] - gray[i + 180];
    sum += lap; sum2 += lap * lap; count++;
  }
  const mean = sum / Math.max(count, 1);
  const sharpness = Math.max(0, sum2 / Math.max(count, 1) - mean * mean);
  return {
    brightness: Number(brightness.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1)),
    warnings: [
      ...(brightness < 42 ? ['A foto está escura; melhore a iluminação ou use uma câmera infravermelha.'] : []),
      ...(sharpness < 12 ? ['A foto pode estar desfocada; aproxime a câmera com estabilidade e fotografe novamente.'] : [])
    ]
  };
}

// A imagem inteira é encaixada em um quadro 1:1. Não há detector genérico,
// recorte automático do animal nem estimativa de peso por raça/porte.
async function frameWholeImage(blob) {
  const bitmap = await createImageBitmap(blob);
  const quality = analyzePhotoQuality(bitmap);
  const side = 1200;
  const framed = document.createElement('canvas'); framed.width = side; framed.height = side;
  const ctx = framed.getContext('2d', { alpha: false });
  ctx.fillStyle = '#e5ece7'; ctx.fillRect(0, 0, side, side);
  const scale = Math.min((side - 80) / bitmap.width, (side - 80) / bitmap.height);
  const width = Math.max(1, bitmap.width * scale);
  const height = Math.max(1, bitmap.height * scale);
  ctx.filter = nightModeOn ? 'brightness(1.55) contrast(1.22) saturate(.78)' : 'none';
  ctx.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);
  ctx.filter = 'none';
  bitmap.close?.();
  const framedBlob = await imageBlobFromCanvas(framed, .92);
  $('cameraStatus').textContent = quality.warnings.length ? quality.warnings.join(' ') : 'Foto completa preservada. Confira visualmente se cabeça, patas e cauda aparecem inteiras.';
  return { blob: framedBlob, vision: null, quality };
}

async function drawAutomaticAnalysis(detection = null) {
  const canvas = $('measureCanvas');
  if (!canvas || !pendingPhotoBlob) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 1200; canvas.height = 1200;
  const bitmap = await createImageBitmap(pendingPhotoBlob);
  ctx.fillStyle = '#e5ece7'; ctx.fillRect(0, 0, 1200, 1200);
  ctx.drawImage(bitmap, 0, 0, 1200, 1200);
  bitmap.close?.();
  if (detection?.bbox) {
    const [x, y, w, h] = detection.bbox;
    ctx.save();
    ctx.strokeStyle = '#2bc477'; ctx.lineWidth = 8; ctx.setLineDash([18, 10]);
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15,75,48,.88)';
    ctx.fillRect(x, Math.max(0, y - 48), Math.min(w, 390), 44);
    ctx.font = 'bold 27px system-ui'; ctx.fillStyle = '#fff';
    ctx.fillText('BOVINO ' + Math.round(detection.score * 100) + '%', x + 10, Math.max(30, y - 16));
    ctx.restore();
  }
}

async function loadCattleDetector() {
  if (cattleDetector) return cattleDetector;
  if (cattleDetectorPromise) return cattleDetectorPromise;
  cattleDetectorPromise = (async () => {
    const limit = Date.now() + 20000;
    while ((!window.tf || !window.cocoSsd) && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 120));
    if (!window.tf || !window.cocoSsd) throw new Error('O detector local não carregou. Verifique a internet e atualize a página.');
    await window.tf.ready();
    cattleDetector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return cattleDetector;
  })().catch(error => { cattleDetectorPromise = null; throw error; });
  return cattleDetectorPromise;
}

async function detectCattleInPhoto(blob) {
  $('autoAnalysisState').textContent = 'Carregando o detector bovino local pela primeira vez...';
  const model = await loadCattleDetector();
  $('autoAnalysisState').textContent = 'Analisando a fotografia e procurando o bovino...';
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0); bitmap.close?.();
  const predictions = await model.detect(canvas, 12, 0.22);
  const cows = predictions.filter(item => item.class === 'cow' && Number(item.score) >= 0.25 && Array.isArray(item.bbox));
  if (!cows.length) throw new Error('Não consegui identificar um bovino nesta imagem. Tire outra foto lateral, com o animal inteiro e sem obstáculos.');
  cows.sort((a, b) => (b.bbox[2] * b.bbox[3] * b.score) - (a.bbox[2] * a.bbox[3] * a.score));
  const best = cows[0];
  const detection = {
    bbox: best.bbox.map(Number), score: Number(best.score),
    imageWidth: canvas.width, imageHeight: canvas.height,
    label: best.class
  };
  await drawAutomaticAnalysis(detection);
  return detection;
}

async function normalizeImage(fileOrBlob) {
  if (!fileOrBlob || !String(fileOrBlob.type || '').startsWith('image/')) throw new Error('Escolha uma imagem válida.');
  if (fileOrBlob.size > 18 * 1024 * 1024) throw new Error('A imagem deve ter até 18 MB.');
  return fileOrBlob;
}

async function setPendingPhoto(blob) {
  if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
  $('cameraStatus').textContent = 'Preparando a fotografia sem cortar a imagem...';
  const prepared = await frameWholeImage(blob);
  pendingPhotoBlob = prepared.blob;
  pendingVision = null;
  pendingPhotoQuality = prepared.quality || null;
  pendingCattleDetection = null;
  pendingPhotoUrl = URL.createObjectURL(prepared.blob);
  $('preview').src = pendingPhotoUrl; $('preview').classList.remove('hidden'); $('video').classList.add('hidden'); $('cameraPlaceholder').classList.add('hidden');
  $('cameraStatus').textContent = pendingPhotoQuality?.warnings?.length ? pendingPhotoQuality.warnings.join(' ') : 'Fotografia inteira preservada. O PesaBoi fará a identificação automática do bovino.';
}

$('photo').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { await setPendingPhoto(await normalizeImage(file)); }
  catch (error) { $('cameraStatus').textContent = error.message; toast(error.message); }
});

$('capture').addEventListener('click', async () => {
  try {
    if (pendingPhotoBlob && !$('preview').classList.contains('hidden')) {
      stopCamera(); show('measurement'); await setMeasurementPhoto(); return;
    }
    const video = $('video');
    if (!cameraStream || !video.videoWidth) { $('cameraStatus').textContent = 'Escolha uma foto ou permita o acesso à câmera.'; return; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.filter = nightModeOn ? 'brightness(1.55) contrast(1.22) saturate(.78)' : 'none';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await imageBlobFromCanvas(canvas, .9);
    await setPendingPhoto(blob); stopCamera(); show('measurement'); await setMeasurementPhoto();
  } catch (error) { toast(error.message || 'Falha ao capturar a foto.'); }
});

$('nightMode').addEventListener('click', () => {
  nightModeOn = !nightModeOn;
  $('video').classList.toggle('night-mode', nightModeOn);
  $('nightMode').setAttribute('aria-pressed', String(nightModeOn));
  $('nightMode').textContent = nightModeOn ? '☀ Desligar modo noturno' : '☾ Modo noturno';
  $('nightStatus').textContent = nightModeOn
    ? 'Melhoria digital ativa: brilho e contraste aumentados. Para escuridão total, use iluminação auxiliar ou câmera infravermelha.'
    : 'Modo noturno digital desligado. A luz auxiliar depende do suporte do aparelho.';
});

$('torchToggle').addEventListener('click', async () => {
  const track = cameraStream?.getVideoTracks?.()[0];
  if (!track) { $('nightStatus').textContent = 'Abra a câmera antes de ativar a luz.'; return; }
  try {
    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) throw new Error('Este aparelho/navegador não disponibiliza controle da lanterna pela câmera.');
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    $('torchToggle').setAttribute('aria-pressed', String(torchOn));
    $('torchToggle').textContent = torchOn ? '☼ Desligar luz' : '☼ Luz da câmera';
    $('nightStatus').textContent = torchOn ? 'Luz auxiliar da câmera ligada.' : 'Luz auxiliar desligada.';
  } catch (error) {
    torchOn = false;
    $('nightStatus').textContent = error.message || 'A luz da câmera não é suportada neste aparelho.';
  }
});

$('cameraDevice')?.addEventListener('change', async event => {
  selectedCameraId = event.target.value;
  await startCamera();
});

async function setMeasurementPhoto() {
  const container = $('photoResult'); container.innerHTML = '';
  if (!pendingPhotoBlob) {
    const icon = document.createElement('span'); icon.textContent = '🐄';
    const text = document.createElement('small'); text.textContent = 'Foto do animal';
    container.append(icon, text); return;
  }
  const img = document.createElement('img'); img.alt = 'Fotografia integral do bovino, sem recorte';
  img.src = pendingPhotoUrl || URL.createObjectURL(pendingPhotoBlob); container.append(img);
  $('visionResult').textContent = 'Fotografia preservada integralmente. Identificação automática sendo preparada.';
  $('autoAnalysisMetrics').classList.add('hidden');
  $('autoAnalysisMetrics').innerHTML = '';
  $('autoAnalysisState').textContent = 'Preparando análise automática...';
  await drawAutomaticAnalysis(null);
  pendingCattleDetection = null;
  try {
    pendingCattleDetection = await detectCattleInPhoto(pendingPhotoBlob);
    $('autoAnalysisState').textContent = 'Bovino localizado automaticamente. Selecione raça e porte e toque em calcular.';
    $('visionResult').textContent = 'Bovino localizado na fotografia. A estimativa será calculada automaticamente; as dimensões são aproximadas e terão uma faixa ampla de incerteza.';
    $('autoAnalysisMetrics').innerHTML = '<span>Detecção do bovino</span><strong>' + Math.round(pendingCattleDetection.score * 100) + '%</strong>';
    $('autoAnalysisMetrics').classList.remove('hidden');
  } catch (error) {
    $('autoAnalysisState').textContent = error.message;
    $('visionResult').textContent = error.message;
  }
}

function getBreedValidationMetrics(breed, sizeClass) {
  const targetBreed = normalizeForMatch(breed);
  const targetSize = normalizeForMatch(sizeClass);
  const pairs = [];
  animals.forEach(animal => {
    if (normalizeForMatch(animal.breed) !== targetBreed || normalizeForMatch(animal.sizeClass) !== targetSize) return;
    (Array.isArray(animal.history) ? animal.history : []).forEach(entry => {
      if (!['camera_tape_morphometry', 'automatic_visual_estimate'].includes(entry.source) || !(Number(entry.realWeightKg) > 0)) return;
      const estimated = Number(entry.rawWeight || entry.weight);
      const real = Number(entry.realWeightKg);
      if (estimated > 0 && real > 0) pairs.push({ estimated, real });
    });
  });
  if (!pairs.length) return { count: 0 };
  const mae = pairs.reduce((sum, pair) => sum + Math.abs(pair.estimated - pair.real), 0) / pairs.length;
  const mape = pairs.reduce((sum, pair) => sum + Math.abs((pair.estimated - pair.real) / pair.real) * 100, 0) / pairs.length;
  const bias = pairs.reduce((sum, pair) => sum + pair.estimated - pair.real, 0) / pairs.length;
  return { count: pairs.length, mae, mape, bias };
}

function getBreedCalibration(breed, sizeClass) {
  const targetBreed = normalizeForMatch(breed);
  const targetSize = normalizeForMatch(sizeClass);
  const samples = [];
  animals.forEach(animal => {
    if (normalizeForMatch(animal.breed) !== targetBreed || normalizeForMatch(animal.sizeClass) !== targetSize) return;
    (Array.isArray(animal.history) ? animal.history : []).forEach(entry => {
      if (!entry.calibrationIncluded || !(Number(entry.realWeightKg) > 0)) return;
      const m = entry.measurements;
      if (!m) return;
      const g = Number(m.chestAverageCm), c = Number(m.bodyLengthCm), real = Number(entry.realWeightKg);
      if (g > 0 && c > 0 && real > 0) samples.push((g * g * c) / real);
    });
  });
  const count = samples.length;
  const meanK = count ? samples.reduce((sum, value) => sum + value, 0) / count : null;
  return { count, k: count >= 5 && meanK >= 10800 && meanK <= 11500 ? meanK : null, rawK: meanK };
}

$('measurementForm').addEventListener('submit', async event => {
  event.preventDefault();
  const returnToDatabase = event.submitter?.dataset.returnToDatabase === 'true';
  if (!pendingPhotoBlob) { toast('Capture ou escolha uma foto antes de continuar.'); return; }
  const breed = $('breed').value;
  const sizeClass = $('sizeClass').value;
  if (!breed || !sizeClass) { toast('Selecione a raça e o porte do bovino.'); return; }

  const button = event.submitter || $('saveAnimalForm');
  const submitButtons = [$('saveAnimalForm'), $('saveAndReturnDatabase')].filter(Boolean);
  submitButtons.forEach(item => { item.disabled = true; });
  button.textContent = returnToDatabase ? 'SALVANDO E VOLTANDO AO BANCO...' : 'ANALISANDO E CALCULANDO...';
  $('saveStatus').textContent = 'Analisando a silhueta e calculando a pré-estimativa morfométrica...';
  $('visionResult').textContent = 'O detector local está localizando o bovino e o motor matemático está estimando as dimensões.';
  try {
    if (!pendingCattleDetection) pendingCattleDetection = await detectCattleInPhoto(pendingPhotoBlob);
    const calibration = getBreedCalibration(breed, sizeClass);
    const estimate = window.PesaBoiMorphometry.estimateAutomaticVisual({
      bbox: pendingCattleDetection.bbox,
      imageWidth: pendingCattleDetection.imageWidth,
      imageHeight: pendingCattleDetection.imageHeight,
      score: pendingCattleDetection.score,
      breed,
      sizeClass,
      calibrationK: calibration.k || undefined
    });
    const nameInput = $('animalName').value.trim();
    const tag = $('animalTag').value.trim();
    const name = nameInput || 'Boi ' + String(animals.length + 1).padStart(3, '0');
    const record = {
      weight: Number(estimate.weightKg), rawWeight: Number(estimate.weightKg),
      rangeLow: Number(estimate.rangeLowKg), rangeHigh: Number(estimate.rangeHighKg),
      source: 'automatic_visual_estimate', date: new Date().toISOString(),
      confidence: estimate.confidence, note: estimate.warning,
      measurements: {
        bodyLengthCm: estimate.bodyLengthCm,
        chestAverageCm: estimate.thoracicPerimeterCm,
        thoracicDepthCm: estimate.thoracicDepthCm,
        thoracicWidthCm: estimate.thoracicWidthCm,
        referenceHeightCm: estimate.referenceHeightCm,
        K: estimate.K,
        bboxAspect: estimate.bboxAspect,
        detectorScore: estimate.detectorScore,
        calibrationSamples: calibration.count,
        calibrationSource: calibration.k ? 'breed_empirical' : 'visual_prior',
        formula: estimate.formula,
        method: estimate.method
      }
    };
    const animal = {
      id: makeId(), ownerId: account.id, name, tag, breed, sizeClass,
      bodyCondition: 'Não avaliada', sick: false, healthNotes: '', visibleHealthAlerts: [], imageQuality: pendingPhotoQuality,
      created: Date.now(), updatedAt: Date.now(), history: [record], vaccines: [], feed: '', notes: '',
      photoId: null, weight: record.weight, weightSource: record.source,
      weighingState: 'pre_estimativa_visual_experimental',
      morphometry: { ...record.measurements, rawWeight: estimate.weightKg, rangeLow: estimate.rangeLowKg, rangeHigh: estimate.rangeHighKg }
    };
    await persistNewAnimal(animal, pendingPhotoBlob);
    currentId = animal.id;
    $('calculatedWeight').textContent = record.weight.toFixed(1);
    $('calculationDetails').innerHTML = [
      '<div><span>Faixa visual estimada</span><b>' + estimate.rangeLowKg.toFixed(0) + '–' + estimate.rangeHighKg.toFixed(0) + ' kg</b></div>',
      '<div><span>Perímetro torácico estimado</span><b>' + estimate.thoracicPerimeterCm.toFixed(1) + ' cm</b></div>',
      '<div><span>Comprimento estimado</span><b>' + estimate.bodyLengthCm.toFixed(1) + ' cm</b></div>',
      '<div><span>Detecção visual</span><b>' + Math.round(estimate.detectorScore * 100) + '%</b></div>',
      '<div><span>Coeficiente K</span><b>' + estimate.K.toFixed(0) + '</b></div>',
      '<div><span>Fórmula</span><b>' + escapeHTML(estimate.formula) + '</b></div>'
    ].join('');
    $('calculationWarning').textContent = estimate.warning;
    $('calculationResult').classList.remove('hidden');
    $('saveStatus').textContent = 'Pré-estimativa visual salva. Confira a faixa de incerteza e valide o resultado em balança.';
    $('autoAnalysisState').textContent = 'Análise concluída. Bovino localizado e estimativa registrada no banco de dados.';
    if (returnToDatabase) {
      show('database');
      toast('Bovino salvo. Você voltou ao Banco de Dados.');
    } else {
      show('detail');
      toast('Pré-estimativa visual salva no banco de dados.');
    }
  } catch (error) {
    $('saveStatus').textContent = error.message || 'Não foi possível calcular a pré-estimativa.';
    $('visionResult').textContent = error.message || 'Falha na análise visual.';
    $('autoAnalysisState').textContent = error.message || 'A análise automática falhou.';
    toast(error.message || 'Não foi possível salvar a ficha.');
  } finally {
    submitButtons.forEach(item => { item.disabled = false; });
    $('saveAnimalForm').innerHTML = '<span aria-hidden="true">⚖</span> CALCULAR PESO E SALVAR <span>→</span>';
    $('saveAndReturnDatabase').textContent = 'SALVAR E VOLTAR AO BANCO DE DADOS';
  }
});

function normalizeForMatch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}

$('goImportFromReport').addEventListener('click', () => { show('scanner'); });

async function persistNewAnimal(animal, photoBlob) {
  animal.photoId = animal.id;
  if (!databaseAvailable) animal.photoData = await blobToDataURL(photoBlob);
  else await savePhoto(animal.id, photoBlob, animal);
  await saveAnimalRecord(animal);
  // Se o IndexedDB falhar durante a gravação da ficha, preserva também a foto no fallback.
  if (!databaseAvailable && !animal.photoData) {
    animal.photoData = await blobToDataURL(photoBlob);
    await saveAnimalRecord(animal);
  }
  animals.unshift(animal);
}

function resetMeasurement() {
  $('measurementForm').reset();
  $('saveStatus').textContent = 'Selecione raça e porte. A análise da foto e os cálculos serão executados automaticamente.';
  $('calculationResult').classList.add('hidden');
  $('calculationDetails').innerHTML = '';
  $('autoAnalysisMetrics').classList.add('hidden');
  $('autoAnalysisMetrics').innerHTML = '';
  pendingCattleDetection = null;
  pendingPhotoBlob = null; pendingVision = null; pendingPhotoQuality = null;
  if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
  pendingPhotoUrl = '';
  $('autoAnalysisState').textContent = 'Aguardando a fotografia para iniciar a análise automática.';
  drawAutomaticAnalysis(null);
}

async function renderDatabase() {
  currentCardUrls.forEach(url => URL.revokeObjectURL(url)); currentCardUrls = [];
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const list = animals.filter(animal => [animal.name, animal.tag, animal.breed, animal.sizeClass].join(' ').toLocaleLowerCase('pt-BR').includes(query));
  $('animalList').innerHTML = '';
  $('empty').classList.toggle('hidden', list.length > 0);
  for (const animal of list) {
    const card = document.createElement('article'); card.className = 'animal-card'; card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', 'Abrir relatório de ' + animal.name);
    const main = document.createElement('div'); main.className = 'animal-card-main';
    const avatar = document.createElement('span'); avatar.className = 'animal-avatar';
    const photo = await getPhotoBlob(animal.id);
    if (photo) { const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(photo); currentCardUrls.push(img.src); avatar.append(img); }
    else avatar.textContent = '🐄';
    const copy = document.createElement('div'); copy.className = 'animal-card-copy';
    const name = document.createElement('strong'); name.textContent = animal.name || 'Animal sem nome';
    const details = document.createElement('small'); details.textContent = [animal.breed || 'Raça não informada', animal.sizeClass || 'Porte não informado', animal.tag ? 'Brinco: ' + animal.tag : ''].filter(Boolean).join(' · ');
    copy.append(name, details); main.append(avatar, copy);
    const weightWrap = document.createElement('div'); weightWrap.className = 'animal-card-weight';
    const weight = document.createElement('strong'); const currentWeight = latestWeight(animal); weight.textContent = currentWeight ? currentWeight.toFixed(1) + ' kg' : '-- kg';
    const latestEntry = latestWeightEntry(animal);
    const label = document.createElement('small'); label.textContent = animal.sick ? '● Doente / atenção' : latestEntry?.source === 'automatic_visual_estimate' ? 'Análise visual automática' : latestEntry?.source === 'camera_tape_morphometry' ? 'Câmera calibrada + fita' : latestEntry?.source === 'visual_hybrid' ? 'Estimativa visual antiga' : latestEntry?.source === 'porte_reference' ? 'Referência antiga (não medida)' : latestEntry?.source === 'balanca' ? 'Peso de balança' : latestEntry?.source === 'external' ? (latestEntry.providerName || 'Peso importado') : currentWeight ? 'Peso registrado' : animal.weighingState === 'detector_indisponivel' ? 'Bovino não identificado · refaça a foto' : 'Aguardando análise visual'; if (animal.sick) label.style.color = '#b83232';
    weightWrap.append(weight, label); card.append(main, weightWrap);
    const open = () => { currentId = animal.id; show('detail'); };
    card.addEventListener('click', open); card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    $('animalList').append(card);
  }
  $('databaseCount').textContent = list.length + (list.length === 1 ? ' animal encontrado' : ' animais encontrados');
}
let currentCardUrls = [];
$('search').addEventListener('input', () => { currentCardUrls.forEach(url => URL.revokeObjectURL(url)); currentCardUrls = []; renderDatabase(); });

function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

async function renderDetail(id) {
  const animal = animals.find(item => item.id === id);
  if (!animal) { show('database'); return; }
  $('detailName').textContent = animal.name || 'Animal';
  $('detailSubtitle').textContent = [animal.breed || 'Raça não informada', animal.sizeClass || 'Porte não informado', animal.tag ? 'Brinco ' + animal.tag : ''].filter(Boolean).join(' · ');
  const latest = latestWeightEntry(animal);
  $('detailWeight').textContent = latest?.weight ? Number(latest.weight).toFixed(1) : '--';
  if (latest?.rangeLow && latest?.rangeHigh) {
    const rangeLabel = latest.source === 'automatic_visual_estimate' ? 'Pré-estimativa visual experimental: '
      : latest.source === 'porte_reference' ? 'Referência matemática por raça/porte: '
      : latest.source === 'visual_hybrid' ? 'Faixa visual experimental: ' : 'Faixa informada: ';
    $('detailRange').textContent = rangeLabel + Number(latest.rangeLow).toFixed(0) + '–' + Number(latest.rangeHigh).toFixed(0) + ' kg';
  } else if (latest?.source === 'automatic_visual_estimate') $('detailRange').textContent = 'Faixa visual experimental: ' + Number(latest.rangeLow || 0).toFixed(0) + '–' + Number(latest.rangeHigh || 0).toFixed(0) + ' kg. Ainda não validada em balança.';
  else if (latest?.source === 'camera_tape_morphometry') $('detailRange').textContent = 'Estimativa calculada com escala fotográfica, comprimento marcado e fita torácica. Sem margem validada ainda.';
  else if (latest?.source === 'balanca') $('detailRange').textContent = 'Peso registrado em balança.';
  else if (latest?.source === 'external') $('detailRange').textContent = 'Resultado recebido de ' + (latest.providerName || animal.lastExternalProvider || 'sistema externo') + '.';
  else $('detailRange').textContent = 'Ainda não há peso calculado. Faça uma nova análise pela câmera.';
  $('detailConfidence').textContent = latest?.source === 'automatic_visual_estimate' ? 'Detector local + morfometria média · baixa confiança' : latest?.source === 'camera_tape_morphometry' ? 'Câmera calibrada + fita · estimativa não validada' : latest?.source === 'visual_hybrid' ? 'Estimativa visual antiga' : latest?.source === 'porte_reference' ? 'Referência antiga, não medida' : latest?.source === 'balanca' ? 'Balança' : latest?.source === 'external' ? (latest.providerName || animal.lastExternalProvider || 'Sistema externo') : animal.weighingState === 'detector_indisponivel' ? 'Bovino não identificado · refaça a foto' : 'Aguardando análise visual';

  const photo = await getPhotoBlob(animal.id);
  if (detailPhotoUrl) URL.revokeObjectURL(detailPhotoUrl);
  if (photo) {
    detailPhotoUrl = URL.createObjectURL(photo); $('detailPhoto').src = detailPhotoUrl; $('detailPhoto').classList.remove('hidden'); $('detailPhotoEmpty').classList.add('hidden');
  } else { $('detailPhoto').classList.add('hidden'); $('detailPhotoEmpty').classList.remove('hidden'); }

  const info = [
    ['Nome', animal.name || 'Não informado'],
    ['Brinco', animal.tag || 'Não informado'],
    ['Raça', animal.breed || 'Não informada'],
    ['Porte', animal.sizeClass || 'Não informado'],
    ['Condição corporal (visual)', animal.bodyCondition || 'Não avaliada']
  ];
  if (animal.imageQuality) {
    info.push(['Luminosidade da foto', Number(animal.imageQuality.brightness).toFixed(1) + ' / 255']);
    info.push(['Nitidez estimada da foto', Number(animal.imageQuality.sharpness).toFixed(1) + ' · indicador técnico, não precisão do peso']);
  }
  const mathRecord = (Array.isArray(animal.history) ? animal.history.slice().reverse() : []).find(entry => ['camera_tape_morphometry', 'automatic_visual_estimate'].includes(entry.source));
  const measurements = mathRecord?.measurements || animal.morphometry;
  if (measurements) {
    info.push(['Comprimento corporal estimado', Number(measurements.bodyLengthCm).toFixed(1) + ' cm']);
    info.push([mathRecord?.source === 'automatic_visual_estimate' ? 'Perímetro torácico estimado' : 'Circunferência torácica média', Number(measurements.chestAverageCm).toFixed(1) + ' cm']);
    if (mathRecord?.source === 'automatic_visual_estimate') {
      info.push(['Altura média usada como referência', Number(measurements.referenceHeightCm).toFixed(1) + ' cm']);
      info.push(['Detecção do bovino', Math.round(Number(measurements.detectorScore) * 100) + '%']);
      info.push(['Método', 'Pré-estimativa visual experimental']);
    } else {
      info.push(['Medições da fita', Number(measurements.chest1Cm).toFixed(1) + ' / ' + Number(measurements.chest2Cm).toFixed(1) + ' cm']);
      info.push(['Escala fotográfica', Number(measurements.cmPerPixel).toFixed(4) + ' cm/px']);
    }
    info.push(['K utilizado', String(measurements.K || measurements.crevatK || 10840)]);
    info.push(['Calibração por raça/porte', measurements.calibrationSource === 'breed_empirical' ? 'Empírica · ' + Number(measurements.calibrationSamples || 0) + ' comparações' : measurements.calibrationSource === 'manual' ? 'Ajuste manual' : 'Coeficiente inicial']);
    if (mathRecord?.realWeightKg) info.push(['Comparação com balança', Number(mathRecord.realWeightKg).toFixed(1) + ' kg · ' + (mathRecord.calibrationIncluded ? 'incluída na calibração' : 'somente conferência')]);
  }
  $('detailInfo').innerHTML = info.map(([label, value]) => '<div class="info-line"><b>' + escapeHTML(label) + '</b><span>' + escapeHTML(value) + '</span></div>').join('');
  const validation = getBreedValidationMetrics(animal.breed, animal.sizeClass);
  $('validationMetrics').innerHTML = validation.count
    ? `<div class="validation-count">${validation.count} comparação(ões) registradas para ${escapeHTML(animal.breed)} · ${escapeHTML(animal.sizeClass)}</div><div class="validation-grid"><div><span>Erro absoluto médio (MAE)</span><b>${validation.mae.toFixed(1)} kg</b></div><div><span>Erro percentual médio (MAPE)</span><b>${validation.mape.toFixed(1)}%</b></div><div><span>Viés médio</span><b>${validation.bias > 0 ? '+' : ''}${validation.bias.toFixed(1)} kg</b></div></div>`
    : 'Registre o peso real de balança no relatório para começar a comparar.';
  $('healthBadge').textContent = animal.sick ? 'DOENTE / ATENÇÃO' : 'Não sinalizado';
  $('healthBadge').className = 'health-badge ' + (animal.sick ? 'health-sick' : 'health-ok');
  $('healthAlerts').textContent = animal.sick ? 'O responsável marcou este animal como doente / atenção. Confira as observações e procure orientação veterinária.' : 'Nenhuma doença foi marcada nesta ficha. A foto não confirma nem descarta doenças.';
  $('healthNotesView').textContent = animal.healthNotes || animal.notes || '';

  const vaccines = Array.isArray(animal.vaccines) ? animal.vaccines : [];
  $('vaccineReportList').innerHTML = '';
  if (!vaccines.length) $('vaccineReportList').textContent = 'Nenhuma vacina registrada ainda.';
  vaccines.forEach(item => {
    const row = document.createElement('div'); row.className = 'vaccine-row';
    const left = document.createElement('div'); const name = document.createElement('strong'); name.textContent = item.name;
    const date = document.createElement('small'); date.textContent = item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada';
    left.append(name, date); const status = document.createElement('span'); status.className = 'vaccine-status'; status.textContent = item.status || 'Aplicada'; row.append(left, status); $('vaccineReportList').append(row);
  });
  renderWeightHistory(Array.isArray(animal.history) ? animal.history : []);
  $('photoStatusNote').textContent = latest?.source === 'automatic_visual_estimate' ? 'A estimativa foi gerada automaticamente pela detecção local do bovino e proporções médias de raça/porte. A fotografia RGB não fornece profundidade real; valide com balança.' : latest?.source === 'camera_tape_morphometry' ? 'Peso calculado com escala da fotografia, comprimento corporal marcado e média de duas medidas torácicas. A precisão só pode ser conhecida após comparação com balança.' : 'A foto está salva na ficha. Faça nova análise pela câmera para gerar uma estimativa.';
}

function renderWeightHistory(history) {
  const chart = $('weightChart');
  const valid = history.filter(entry => Number(entry.weight) > 0).slice().sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).slice(-12);
  if (!valid.length) { chart.textContent = 'Ainda não há pesos registrados.'; $('historyList').innerHTML = ''; return; }
  const values = valid.map(item => Number(item.weight));
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(1, max - min);
  const points = values.map((value, index) => [12 + index / Math.max(1, values.length - 1) * 276, 96 - (value - min) / range * 66]);
  const poly = points.map(point => point.join(',')).join(' ');
  chart.innerHTML = '<svg viewBox="0 0 300 122" role="img" aria-label="Gráfico de evolução do peso"><line x1="10" y1="101" x2="290" y2="101" stroke="#dce9df"/><polyline points="' + poly + '" fill="none" stroke="#23834d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + points.map(point => '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="3.5" fill="#23834d"/>').join('') + '<text x="12" y="116" fill="#829188" font-size="8">' + escapeHTML(new Date(valid[0].date || Date.now()).toLocaleDateString('pt-BR')) + '</text><text x="288" y="116" text-anchor="end" fill="#829188" font-size="8">' + escapeHTML(new Date(valid[valid.length - 1].date || Date.now()).toLocaleDateString('pt-BR')) + '</text></svg>';
  $('historyList').innerHTML = '';
  history.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).forEach(entry => {
    const row = document.createElement('div'); row.className = 'history-entry';
    const date = document.createElement('span'); date.textContent = (entry.date ? new Date(entry.date).toLocaleString('pt-BR') : 'Data não informada') + (entry.source === 'balanca' ? ' · balança' : entry.source === 'external' ? ' · ' + (entry.providerName || 'sistema externo') : entry.source === 'automatic_visual_estimate' ? ' · análise visual automática (experimental)' : entry.source === 'camera_tape_morphometry' ? ' · câmera calibrada + fita' : entry.source === 'visual_hybrid' ? ' · imagem + morfometria (legado)' : entry.source === 'porte_reference' ? ' · referência por raça/porte (legado)' : '');
    const value = document.createElement('strong'); value.textContent = Number(entry.weight).toFixed(1) + ' kg'; row.append(date, value); $('historyList').append(row);
  });
}

$('editFromReport').addEventListener('click', () => {
  const animal = animals.find(item => item.id === currentId); if (!animal) return;
  $('editName').value = animal.name || '';
  $('editTag').value = animal.tag || '';
  $('editBreed').value = animal.breed || 'Outra / mestiço';
  $('editSize').value = animal.sizeClass || '';
  $('editSick').checked = Boolean(animal.sick);
  $('editHealthNotes').value = animal.healthNotes || '';
  $('editFeed').value = animal.feed || '';
  $('editNotes').value = animal.notes || '';
  $('newWeight').value = ''; $('newWeighingNote').value = ''; $('useForCalibration').checked = true;
  $('updateSubtitle').textContent = 'Atualizando: ' + animal.name;
  draftVaccines = Array.isArray(animal.vaccines) ? animal.vaccines.map(item => ({ ...item })) : [];
  renderVaccineEditor(); show('update');
});

$('addVaccine').addEventListener('click', () => {
  const name = $('vaccineName').value.trim();
  if (!name) { $('vaccineName').focus(); toast('Informe o nome da vacina.'); return; }
  draftVaccines.push({ id: makeId(), name, date: $('vaccineDate').value, status: $('vaccineStatus').value });
  $('vaccineName').value = ''; $('vaccineDate').value = ''; $('vaccineStatus').value = 'Aplicada'; renderVaccineEditor();
});

function renderVaccineEditor() {
  const container = $('vaccineEditorList'); container.innerHTML = '';
  if (!draftVaccines.length) { const empty = document.createElement('p'); empty.className = 'tool-status'; empty.textContent = 'Nenhuma vacina adicionada.'; container.append(empty); return; }
  draftVaccines.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'vaccine-editor-row';
    const text = document.createElement('span'); text.textContent = item.name + ' · ' + (item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'sem data') + ' · ' + item.status;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover'; remove.addEventListener('click', () => { draftVaccines.splice(index, 1); renderVaccineEditor(); });
    row.append(text, remove); container.append(row);
  });
}

$('updateForm').addEventListener('submit', async event => {
  event.preventDefault();
  const animal = animals.find(item => item.id === currentId); if (!animal) return;
  animal.name = $('editName').value.trim() || animal.name || 'Animal sem nome';
  animal.tag = $('editTag').value.trim();
  animal.breed = $('editBreed').value;
  animal.sizeClass = $('editSize').value || animal.sizeClass || '';
  animal.sick = $('editSick').checked;
  animal.healthNotes = $('editHealthNotes').value.trim(); animal.feed = $('editFeed').value.trim(); animal.notes = $('editNotes').value.trim();
  animal.vaccines = draftVaccines.slice(); animal.updatedAt = Date.now();
  const measured = Number($('newWeight').value);
  if (measured > 0 && measured <= 2000) {
    animal.weight = measured; animal.weightSource = 'balanca';
    animal.history = Array.isArray(animal.history) ? animal.history : [];
    const latestEstimate = animal.history.slice().reverse().find(entry => ['camera_tape_morphometry', 'automatic_visual_estimate'].includes(entry.source) && !entry.realWeightKg);
    if (latestEstimate) {
      latestEstimate.realWeightKg = measured;
      latestEstimate.calibrationIncluded = Boolean($('useForCalibration').checked);
      latestEstimate.realWeightDate = new Date().toISOString();
      latestEstimate.realWeightNote = $('newWeighingNote').value.trim();
    }
    animal.history.push({ weight: measured, source: 'balanca', date: new Date().toISOString(), note: $('newWeighingNote').value.trim() });
  }
  try { await saveAnimalRecord(animal); show('detail'); toast('Relatório atualizado.'); }
  catch (error) { toast('Não foi possível salvar: ' + error.message); }
});

$('replacePhoto').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  const animal = animals.find(item => item.id === currentId); if (!animal) return;
  try {
    const original = await normalizeImage(file);
    const prepared = await frameWholeImage(original);
    const blob = prepared.blob;
    animal.imageQuality = prepared.quality || animal.imageQuality || null;
    animal.photoId = animal.id;
    if (!databaseAvailable) animal.photoData = await blobToDataURL(blob); else await savePhoto(animal.id, blob, animal);
    animal.updatedAt = Date.now(); await saveAnimalRecord(animal);
    if (!databaseAvailable && !animal.photoData) { animal.photoData = await blobToDataURL(blob); await saveAnimalRecord(animal); }
    await renderDetail(animal.id); toast('Foto atualizada. Você pode solicitar uma nova análise.');
  } catch (error) { toast('Não foi possível atualizar a foto: ' + error.message); }
});

$('deleteAnimal').addEventListener('click', async () => {
  const animal = animals.find(item => item.id === currentId);
  if (!animal || !window.confirm('Excluir ' + animal.name + ' e sua ficha deste dispositivo?')) return;
  await deleteAnimalRecord(currentId); animals = animals.filter(item => item.id !== currentId); currentId = null; show('database'); toast('Animal excluído deste dispositivo.');
});

$('exportBackup').addEventListener('click', async () => {
  try {
    const backup = { app: 'PesaBoi', version: '3.12', exportedAt: new Date().toISOString(), animals: [] };
    for (const animal of animals) {
      const copy = { ...animal };
      const blob = await getPhotoBlob(animal.id);
      if (blob) copy.photoData = await blobToDataURL(blob);
      backup.animals.push(copy);
    }
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(file); const link = document.createElement('a');
    link.href = url; link.download = 'PesaBoi-backup-' + new Date().toISOString().slice(0, 10) + '.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Backup exportado. Guarde o arquivo em local seguro.');
  } catch (error) { toast('Falha ao exportar backup: ' + error.message); }
});

$('importBackup').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 80 * 1024 * 1024) throw new Error('O backup deve ter até 80 MB.');
    const data = JSON.parse(await file.text());
    if (data.app !== 'PesaBoi' || !Array.isArray(data.animals)) throw new Error('Este arquivo não parece ser um backup PesaBoi válido.');
    let imported = 0;
    for (const raw of data.animals) {
      const animal = { ...raw, id: raw.id || makeId(), ownerId: account.id };
      const photoData = animal.photoData; delete animal.photoData;
      if (photoData?.startsWith('data:image/')) {
        const blob = dataURLToBlob(photoData); animal.photoId = animal.id;
        if (!databaseAvailable) animal.photoData = photoData; else await savePhoto(animal.id, blob, animal);
      }
      await saveAnimalRecord(animal); imported++;
    }
    await loadData(); renderDatabase(); refreshHome(); toast(imported + ' ficha(s) importada(s).');
  } catch (error) { toast('Não foi possível importar: ' + error.message); }
  finally { event.target.value = ''; }
});

async function checkIntegrationStatus() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (response.ok) $('saveStatus').textContent = 'Motor matemático PesaBoi ativo. Sem IA e sem peso de referência inventado.';
  } catch {
    $('saveStatus').textContent = 'Motor matemático disponível quando o servidor PesaBoi estiver em execução.';
  }
}

async function init() {
  try {
    account = JSON.parse(localStorage.getItem('pesaboi_account_v3') || localStorage.getItem('pesaboi_account') || 'null');
    if (account && !account.id) { account.id = makeId(); accountStorageSave(); }
    if (account?.owner) { updateHeader(); await loadData(); show('home'); }
    else { account = null; updateHeader(); show('login'); }
  } catch (error) { console.error(error); account = null; updateHeader(); show('login'); toast('Não foi possível carregar os registros salvos.'); }
  checkIntegrationStatus();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./service-worker.js?v=3.12').catch(error => console.warn('PWA:', error));
}
init();
