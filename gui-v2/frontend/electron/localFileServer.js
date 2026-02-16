/**
 * Local File Server for AGRS ZEUS Desktop App
 *
 * A lightweight Node.js HTTP server that mirrors the backend API routes,
 * serving project data from the user's local filesystem. Uses bundled
 * GDAL binaries (gdalwarp, ogr2ogr, gdal_translate) for raster tile
 * rendering and vector format conversion.
 *
 * This runs on the user's workstation (inside Electron) and serves
 * synced project data so MapLibre can load tiles/vectors locally
 * instead of going through the remote backend API.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { URL } = require('url');

let serverInstance = null;
let serverPort = 9090;
let baseDirectory = null;
let gdalBinDir = null;
let remoteApiBase = null;
let gdalAvailable = false;

function gdalTool(name) {
  if (gdalBinDir) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const fullPath = path.join(gdalBinDir, `${name}${ext}`);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return name;
}

function safePath(base, ...segments) {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json' });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { ...corsHeaders(), 'Content-Type': contentType });
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { detail: 'File read error' });
    }
  });
}

function send404(res, msg) {
  sendJson(res, 404, { detail: msg || 'Not found' });
}

function send500(res, msg) {
  sendJson(res, 500, { detail: msg || 'Internal server error' });
}

function gdalExecOptions(timeout = 30000) {
  const opts = { timeout, maxBuffer: 50 * 1024 * 1024 };
  if (gdalBinDir) {
    // Set cwd to GDAL dir so Windows finds DLLs next to the .exe
    opts.cwd = gdalBinDir;
    // Also prepend GDAL dir to PATH and set GDAL_DATA/PROJ_LIB for data files
    const sep = process.platform === 'win32' ? ';' : ':';
    const gdalDataDir = path.join(gdalBinDir, 'gdal-data');
    const projDataDir = path.join(gdalBinDir, 'proj-data');
    opts.env = {
      ...process.env,
      PATH: `${gdalBinDir}${sep}${process.env.PATH || ''}`,
      GDAL_DATA: fs.existsSync(gdalDataDir) ? gdalDataDir : (process.env.GDAL_DATA || ''),
      PROJ_LIB: fs.existsSync(projDataDir) ? projDataDir : (process.env.PROJ_LIB || ''),
    };
  }
  return opts;
}

function runGdal(tool, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(gdalTool(tool), args, gdalExecOptions(timeout), (err, stdout, stderr) => {
      if (err) return reject(new Error(`${tool} failed: ${stderr || err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

function checkGdalAvailable() {
  return new Promise((resolve) => {
    execFile(gdalTool('gdalwarp'), ['--version'], gdalExecOptions(10000), (err) => {
      resolve(!err);
    });
  });
}

async function proxyToRemote(res, urlPath) {
  if (!remoteApiBase) {
    send500(res, 'Remote API not configured for fallback');
    return;
  }
  try {
    const remoteUrl = `${remoteApiBase}${urlPath}`;
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      res.writeHead(response.status, corsHeaders());
      return res.end();
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': contentType });
    res.end(buffer);
  } catch (err) {
    send500(res, `Remote proxy failed: ${err.message}`);
  }
}

function projectDir(projectName) {
  return safePath(baseDirectory, projectName);
}

function dataDir(projectName) {
  return path.join(projectDir(projectName), 'data');
}

function mercatorTileBounds(z, x, y) {
  const n = Math.pow(2, z);
  const originShift = 20037508.342789244;
  const tileSize = (2 * originShift) / n;
  const minX = -originShift + x * tileSize;
  const maxX = minX + tileSize;
  const maxY = originShift - y * tileSize;
  const minY = maxY - tileSize;
  return [minX, minY, maxX, maxY];
}

function buildDisplayName(metadata, fallbackName) {
  if (!metadata) return fallbackName;
  const category = metadata.category || '';
  const datasetName = (metadata.dataset_name || '').replace(/ \(Processed\)$/, '').replace(/ /g, '-');
  const targetCrs = (metadata.target_crs || '').replace(':', '');
  if (category && datasetName && targetCrs) {
    return `${category}_${datasetName}_${targetCrs}_processed`;
  }
  return fallbackName;
}

function cleanLayerName(raw) {
  return raw.replace(/_epsg\d+_processed$/i, '').replace(/_processed$/i, '');
}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function findRasterFile(projPath, layer) {
  const processedDir = path.join(projPath, 'data', 'rasters', 'processed');
  if (!fs.existsSync(processedDir)) return null;

  const exact = path.join(processedDir, `${layer}.tif`);
  if (fs.existsSync(exact)) return exact;

  const entries = await fsp.readdir(processedDir);
  for (const entry of entries) {
    if (!entry.endsWith('.tif')) continue;
    const fullPath = path.join(processedDir, entry);
    const stem = path.basename(entry, '.tif');

    const metaPath = path.join(processedDir, `${entry}.json`);
    if (fs.existsSync(metaPath)) {
      const metadata = loadJsonFile(metaPath);
      const fallback = cleanLayerName(stem);
      const displayName = buildDisplayName(metadata, fallback);
      if (displayName === layer) return fullPath;
    }

    if (cleanLayerName(stem) === layer) return fullPath;
  }
  return null;
}

async function findVectorFile(projPath, layer) {
  const processedDir = path.join(projPath, 'data', 'vectors', 'processed');
  if (!fs.existsSync(processedDir)) return null;

  const exact = path.join(processedDir, `${layer}.gpkg`);
  if (fs.existsSync(exact)) return exact;

  const entries = await fsp.readdir(processedDir);
  for (const entry of entries) {
    if (!entry.endsWith('.gpkg')) continue;
    const fullPath = path.join(processedDir, entry);
    const stem = path.basename(entry, '.gpkg');

    const metaPath = path.join(processedDir, `${entry}.json`);
    if (fs.existsSync(metaPath)) {
      const metadata = loadJsonFile(metaPath);
      const fallback = cleanLayerName(stem);
      const displayName = buildDisplayName(metadata, fallback);
      if (displayName === layer) return fullPath;
    }

    if (cleanLayerName(stem) === layer) return fullPath;
  }
  return null;
}

function tileCachePath(projName, layer, mtimeMs, z, x, y) {
  return path.join(
    baseDirectory, '.tile_cache',
    projName, layer, String(mtimeMs),
    String(z), String(x), `${y}.png`
  );
}

async function handleProjectMetadata(res, projectName) {
  const metaPath = path.join(projectDir(projectName), 'project_metadata.json');
  if (!fs.existsSync(metaPath)) return send404(res, `Project '${projectName}' metadata not found`);
  sendFile(res, metaPath, 'application/json');
}

async function handleProjectDatasets(res, projectName) {
  const projPath = projectDir(projectName);
  const rastersDir = path.join(projPath, 'data', 'rasters', 'processed');
  const vectorsDir = path.join(projPath, 'data', 'vectors', 'processed');

  const rasters = [];
  const vectors = [];

  if (fs.existsSync(rastersDir)) {
    const entries = await fsp.readdir(rastersDir);
    for (const entry of entries) {
      if (!entry.endsWith('.tif')) continue;
      const stem = path.basename(entry, '.tif');
      const metaPath = path.join(rastersDir, `${entry}.json`);
      const metadata = fs.existsSync(metaPath) ? loadJsonFile(metaPath) : {};
      const fallback = cleanLayerName(stem);
      const displayName = buildDisplayName(metadata, fallback);
      rasters.push({
        name: displayName,
        type: 'raster',
        path: `data/rasters/processed/${entry}`,
        metadata: metadata || {}
      });
    }
  }

  if (fs.existsSync(vectorsDir)) {
    const entries = await fsp.readdir(vectorsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.gpkg')) continue;
      const stem = path.basename(entry, '.gpkg');
      const metaPath = path.join(vectorsDir, `${entry}.json`);
      const metadata = fs.existsSync(metaPath) ? loadJsonFile(metaPath) : {};
      const fallback = cleanLayerName(stem);
      const displayName = buildDisplayName(metadata, fallback);
      vectors.push({
        name: displayName,
        type: 'vector',
        path: `data/vectors/processed/${entry}`,
        metadata: metadata || {}
      });
    }
  }

  rasters.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  vectors.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  sendJson(res, 200, { rasters, vectors });
}

async function handleVectorLayer(res, projectName, layer) {
  const projPath = projectDir(projectName);

  const cacheDir = path.join(baseDirectory, '.vector_cache', projectName, layer);
  const entries = fs.existsSync(cacheDir)
    ? (await fsp.readdir(cacheDir)).filter(f => f.endsWith('.geojson'))
    : [];
  if (entries.length > 0) {
    entries.sort();
    const cachePath = path.join(cacheDir, entries[entries.length - 1]);
    return sendFile(res, cachePath, 'application/json');
  }

  const vectorFile = await findVectorFile(projPath, layer);
  if (!vectorFile) return send404(res, `Vector layer '${layer}' not found`);

  const tmpOut = path.join(baseDirectory, '.vector_cache', projectName, layer, `${Date.now()}.geojson`);
  await fsp.mkdir(path.dirname(tmpOut), { recursive: true });

  try {
    await runGdal('ogr2ogr', ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', tmpOut, vectorFile]);
    sendFile(res, tmpOut, 'application/json');
  } catch (err) {
    send500(res, `Vector conversion failed: ${err.message}`);
  }
}

async function handleRasterTile(res, projectName, layer, z, x, y) {
  // If GDAL is not available, proxy to remote server
  if (!gdalAvailable) {
    return proxyToRemote(res, `/tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
  }

  const projPath = projectDir(projectName);
  const rasterFile = await findRasterFile(projPath, layer);
  if (!rasterFile) {
    return proxyToRemote(res, `/tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
  }

  let mtimeMs;
  try {
    const stat = await fsp.stat(rasterFile);
    mtimeMs = Math.floor(stat.mtimeMs);
  } catch {
    return proxyToRemote(res, `/tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
  }

  const cachePath = tileCachePath(projectName, layer, mtimeMs, z, x, y);
  if (fs.existsSync(cachePath)) {
    return sendFile(res, cachePath, 'image/png');
  }

  const [minX, minY, maxX, maxY] = mercatorTileBounds(z, x, y);
  const tmpTif = path.join(baseDirectory, '.tile_tmp', `tile_${Date.now()}_${Math.random().toString(36).slice(2)}.tif`);
  const tmpPng = tmpTif.replace('.tif', '.png');
  await fsp.mkdir(path.dirname(tmpTif), { recursive: true });

  try {
    await runGdal('gdalwarp', [
      '-t_srs', 'EPSG:3857',
      '-te', String(minX), String(minY), String(maxX), String(maxY),
      '-te_srs', 'EPSG:3857',
      '-ts', '256', '256',
      '-r', 'bilinear',
      '-of', 'GTiff',
      '-dstalpha',
      rasterFile, tmpTif
    ]);

    await runGdal('gdal_translate', [
      '-of', 'PNG',
      '-outsize', '256', '256',
      tmpTif, tmpPng
    ]);

    const pngBytes = await fsp.readFile(tmpPng);
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    await fsp.writeFile(cachePath, pngBytes);

    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'image/png' });
    res.end(pngBytes);
  } catch (err) {
    // GDAL rendering failed -- fallback to remote server
    if (!res.headersSent) {
      return proxyToRemote(res, `/tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
    }
  } finally {
    try { await fsp.unlink(tmpTif); } catch {}
    try { await fsp.unlink(tmpPng); } catch {}
  }
}

async function handleTerrainTile(res, projectName, layer, z, x, y) {
  if (!gdalAvailable) {
    return proxyToRemote(res, `/terrain/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
  }

  const projPath = projectDir(projectName);
  const rasterFile = await findRasterFile(projPath, layer);
  if (!rasterFile) {
    return proxyToRemote(res, `/terrain/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
  }

  let mtimeMs;
  try {
    const stat = await fsp.stat(rasterFile);
    mtimeMs = Math.floor(stat.mtimeMs);
  } catch {
    return send404(res, 'Cannot stat terrain file');
  }

  const cachePath = tileCachePath(projectName + '_terrain', layer, mtimeMs, z, x, y);
  if (fs.existsSync(cachePath)) {
    return sendFile(res, cachePath, 'image/png');
  }

  const [minX, minY, maxX, maxY] = mercatorTileBounds(z, x, y);
  const tmpTif = path.join(baseDirectory, '.tile_tmp', `terrain_${Date.now()}_${Math.random().toString(36).slice(2)}.tif`);
  const tmpPng = tmpTif.replace('.tif', '.png');
  await fsp.mkdir(path.dirname(tmpTif), { recursive: true });

  try {
    await runGdal('gdalwarp', [
      '-t_srs', 'EPSG:3857',
      '-te', String(minX), String(minY), String(maxX), String(maxY),
      '-te_srs', 'EPSG:3857',
      '-ts', '256', '256',
      '-r', 'bilinear',
      '-of', 'GTiff',
      rasterFile, tmpTif
    ]);

    await runGdal('gdal_translate', [
      '-of', 'PNG',
      '-outsize', '256', '256',
      '-ot', 'Byte',
      '-scale',
      tmpTif, tmpPng
    ]);

    const pngBytes = await fsp.readFile(tmpPng);
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    await fsp.writeFile(cachePath, pngBytes);

    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'image/png' });
    res.end(pngBytes);
  } catch (err) {
    if (!res.headersSent) {
      return proxyToRemote(res, `/terrain/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png`);
    }
  } finally {
    try { await fsp.unlink(tmpTif); } catch {}
    try { await fsp.unlink(tmpPng); } catch {}
  }
}

async function handleVectorTile(res, projectName, layer, z, x, y) {
  if (!gdalAvailable) {
    return proxyToRemote(res, `/vector-tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.pbf`);
  }

  const projPath = projectDir(projectName);
  const vectorFile = await findVectorFile(projPath, layer);
  if (!vectorFile) {
    return proxyToRemote(res, `/vector-tiles/${encodeURIComponent(projectName)}/${encodeURIComponent(layer)}/${z}/${x}/${y}.pbf`);
  }

  let mtimeMs;
  try {
    const stat = await fsp.stat(vectorFile);
    mtimeMs = Math.floor(stat.mtimeMs);
  } catch {
    return send404(res, 'Cannot stat vector file');
  }

  const cacheDir = path.join(baseDirectory, '.mvt_cache', projectName, layer, String(mtimeMs));
  const tilePath = path.join(cacheDir, String(z), String(x), `${y}.pbf`);

  if (fs.existsSync(tilePath)) {
    const bytes = await fsp.readFile(tilePath);
    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Content-Encoding': 'gzip'
    });
    return res.end(bytes);
  }

  const tilesetDir = path.join(cacheDir, 'tileset');
  if (!fs.existsSync(tilesetDir)) {
    await fsp.mkdir(tilesetDir, { recursive: true });
    try {
      await runGdal('ogr2ogr', [
        '-f', 'MVT',
        tilesetDir,
        vectorFile,
        '-dsco', `MINZOOM=0`,
        '-dsco', `MAXZOOM=11`,
        '-dsco', `COMPRESS=YES`,
        '-t_srs', 'EPSG:4326'
      ], 120000);
    } catch (err) {
      if (!res.headersSent) send500(res, `MVT generation failed: ${err.message}`);
      return;
    }
  }

  const mvtPath = path.join(tilesetDir, String(z), String(x), `${y}.pbf`);
  if (!fs.existsSync(mvtPath)) {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  const bytes = await fsp.readFile(mvtPath);
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'application/vnd.mapbox-vector-tile',
    'Content-Encoding': 'gzip'
  });
  res.end(bytes);
}

async function handleCreatorGeojson(res, projectName) {
  const creatorDir = path.join(dataDir(projectName), 'creator', 'entries');
  if (!fs.existsSync(creatorDir)) {
    return sendJson(res, 200, { type: 'FeatureCollection', features: [] });
  }

  const features = [];
  const entries = await fsp.readdir(creatorDir);
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const data = loadJsonFile(path.join(creatorDir, entry));
    if (!data || data.status === 'deleted') continue;
    const geom = data.geometry_wgs84;
    if (!geom || !geom.type) continue;
    features.push({
      type: 'Feature',
      id: data.id,
      geometry: geom,
      properties: {
        creator_id: data.id,
        creator_type: data.type,
        title: data.title,
        category: data.category,
        category_other: data.category_other,
        comment: data.comment,
        datasets: data.datasets || [],
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: (data.created_by || {}).username,
        updated_by: (data.updated_by || {}).username,
        sortie_id: data.sortie_id
      }
    });
  }

  sendJson(res, 200, { type: 'FeatureCollection', features });
}

async function handleAoiFile(res, projectName, filename) {
  const filePath = path.join(projectDir(projectName), 'aoi', filename);
  if (!fs.existsSync(filePath)) {
    // AOI files may not be synced locally -- proxy to remote
    return proxyToRemote(res, `/data/${encodeURIComponent(projectName)}/aoi/${encodeURIComponent(filename)}`);
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.json': 'application/json',
    '.geojson': 'application/json',
    '.kml': 'application/vnd.google-earth.kml+xml',
    '.kmz': 'application/vnd.google-earth.kmz',
  };
  sendFile(res, filePath, mimeTypes[ext] || 'application/octet-stream');
}

function matchRoute(pathname) {
  let m;

  m = pathname.match(/^\/api\/projects\/([^/]+)\/metadata$/);
  if (m) return { handler: 'projectMetadata', project: decodeURIComponent(m[1]) };

  m = pathname.match(/^\/api\/projects\/([^/]+)\/datasets$/);
  if (m) return { handler: 'projectDatasets', project: decodeURIComponent(m[1]) };

  m = pathname.match(/^\/api\/projects\/([^/]+)\/creator\/geojson$/);
  if (m) return { handler: 'creatorGeojson', project: decodeURIComponent(m[1]) };

  m = pathname.match(/^\/api\/data\/([^/]+)\/vectors\/([^/]+)$/);
  if (m) return { handler: 'vectorLayer', project: decodeURIComponent(m[1]), layer: decodeURIComponent(m[2]) };

  m = pathname.match(/^\/api\/data\/([^/]+)\/aoi\/([^/]+)$/);
  if (m) return { handler: 'aoiFile', project: decodeURIComponent(m[1]), filename: decodeURIComponent(m[2]) };

  m = pathname.match(/^\/api\/tiles\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (m) return { handler: 'rasterTile', project: decodeURIComponent(m[1]), layer: decodeURIComponent(m[2]), z: +m[3], x: +m[4], y: +m[5] };

  m = pathname.match(/^\/api\/terrain\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (m) return { handler: 'terrainTile', project: decodeURIComponent(m[1]), layer: decodeURIComponent(m[2]), z: +m[3], x: +m[4], y: +m[5] };

  m = pathname.match(/^\/api\/vector-tiles\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  if (m) return { handler: 'vectorTile', project: decodeURIComponent(m[1]), layer: decodeURIComponent(m[2]), z: +m[3], x: +m[4], y: +m[5] };

  return null;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders());
    return res.end();
  }

  if (req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', base_directory: baseDirectory });
  }

  const parsed = new URL(req.url, `http://localhost:${serverPort}`);
  const route = matchRoute(parsed.pathname);

  if (!route) return send404(res, 'Route not matched');

  try {
    switch (route.handler) {
      case 'projectMetadata':
        return await handleProjectMetadata(res, route.project);
      case 'projectDatasets':
        return await handleProjectDatasets(res, route.project);
      case 'creatorGeojson':
        return await handleCreatorGeojson(res, route.project);
      case 'vectorLayer':
        return await handleVectorLayer(res, route.project, route.layer);
      case 'aoiFile':
        return await handleAoiFile(res, route.project, route.filename);
      case 'rasterTile':
        return await handleRasterTile(res, route.project, route.layer, route.z, route.x, route.y);
      case 'terrainTile':
        return await handleTerrainTile(res, route.project, route.layer, route.z, route.x, route.y);
      case 'vectorTile':
        return await handleVectorTile(res, route.project, route.layer, route.z, route.x, route.y);
      default:
        return send404(res, 'Unknown handler');
    }
  } catch (err) {
    console.error('[LocalFileServer] Error handling request:', err);
    if (!res.headersSent) send500(res, err.message);
  }
}

function start(port, baseDirPath, gdalDir, remoteApi) {
  return new Promise(async (resolve, reject) => {
    if (serverInstance) {
      stop();
    }

    serverPort = port || 9090;
    baseDirectory = path.resolve(baseDirPath);
    gdalBinDir = gdalDir || null;
    remoteApiBase = remoteApi || null;

    if (!fs.existsSync(baseDirectory)) {
      fs.mkdirSync(baseDirectory, { recursive: true });
    }

    gdalAvailable = await checkGdalAvailable();
    console.log(`[LocalFileServer] GDAL available: ${gdalAvailable}`);
    if (!gdalAvailable && remoteApiBase) {
      console.log(`[LocalFileServer] Will proxy GDAL-dependent requests to: ${remoteApiBase}`);
    }

    serverInstance = http.createServer(handleRequest);

    serverInstance.on('error', (err) => {
      console.error('[LocalFileServer] Server error:', err);
      reject(err);
    });

    serverInstance.listen(serverPort, '127.0.0.1', () => {
      console.log(`[LocalFileServer] Listening on http://127.0.0.1:${serverPort}`);
      console.log(`[LocalFileServer] Serving from: ${baseDirectory}`);
      if (gdalBinDir) console.log(`[LocalFileServer] GDAL bin dir: ${gdalBinDir}`);
      if (remoteApiBase) console.log(`[LocalFileServer] Remote fallback: ${remoteApiBase}`);
      resolve({ port: serverPort, baseDirectory, gdalBinDir, gdalAvailable });
    });
  });
}

function stop() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    console.log('[LocalFileServer] Stopped');
  }
}

function isRunning() {
  return serverInstance !== null && serverInstance.listening;
}

function getStatus() {
  return {
    running: isRunning(),
    port: serverPort,
    api_base_url: `http://127.0.0.1:${serverPort}/api`,
    base_directory: baseDirectory,
    gdal_bin_dir: gdalBinDir,
    gdal_available: gdalAvailable,
  };
}

module.exports = { start, stop, isRunning, getStatus };
