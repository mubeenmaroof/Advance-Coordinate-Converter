/**
 * GIS Web Worker for Heavy GIS Tasks
 * Handles Shapefile parsing and combination off the main thread.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/shpjs/4.0.2/shp.min.js');

self.onmessage = async function (e) {
  const { type, buffers } = e.data;

  if (type === 'parseShp') {
    try {
      const debugInfo = {
        shpLength: buffers.shp?.byteLength || 0,
        dbfLength: buffers.dbf?.byteLength || 0,
        shxLength: buffers.shx?.byteLength || 0,
        prjLength: buffers.prj?.byteLength || 0,
        shpHeader: getShpHeaderInfo(buffers.shp)
      };

      self.postMessage({ type: 'status', message: 'Parsing Shapefile components...', debug: debugInfo });

      const parsedShp = await safeParseShapefile(buffers);
      let parsedDbf = [];
      try {
        parsedDbf = shp.parseDbf(validateDbfBuffer(buffers.dbf));
        console.log('[DBF Parse] Successful, records:', parsedDbf.length);
        if (!Array.isArray(parsedDbf)) {
          parsedDbf = [];
        }
      } catch (dbfError) {
        console.log('[DBF Parse] Failed:', dbfError.message);
        self.postMessage({ type: 'status', message: 'Failed to read DBF attributes, loading geometry only...' });
        parsedDbf = [];
      }

      self.postMessage({ type: 'status', message: 'Combining GIS data...' });
      const geojson = combineShpAndDbf(parsedShp, parsedDbf);

      self.postMessage({
        type: 'complete',
        geojson: geojson
      });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message || 'Unknown parsing error' });
    }
  }
};

function getArrayBuffer(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data) && data.buffer instanceof ArrayBuffer) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new Error('Unsupported binary input type');
}

function getShpHeaderInfo(data) {
  try {
    const buffer = getArrayBuffer(data);
    if (buffer.byteLength < 100) {
      return { error: 'SHP file too short', byteLength: buffer.byteLength };
    }
    const view = new DataView(buffer, 0, 100);
    const fileLengthWords = view.getInt32(24, false);
    const declaredLength = fileLengthWords * 2;
    return {
      byteLength: buffer.byteLength,
      fileCode: view.getInt32(0, false),
      fileLengthWords: fileLengthWords,
      declaredLength: declaredLength,
      version: view.getInt32(28, true),
      shapeType: view.getInt32(32, true)
    };
  } catch (err) {
    return { error: err.message };
  }
}

function validateShpBuffer(data) {
  const buffer = getArrayBuffer(data);
  if (buffer.byteLength < 100) {
    throw new Error(`SHP file too short: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer, 0, 100);
  const fileLengthWords = view.getInt32(24, false);
  const declaredLength = fileLengthWords * 2;
  if (declaredLength > buffer.byteLength) {
    throw new Error(`SHP header declares ${declaredLength} bytes, but file has ${buffer.byteLength}`);
  }

  // Log diagnostic info for debugging
  const fileCode = view.getInt32(0, false);
  const version = view.getInt32(28, true);
  const shapeType = view.getInt32(32, true);
  const bbox = [
    view.getFloat64(36, true), // xmin
    view.getFloat64(44, true), // ymin
    view.getFloat64(52, true), // xmax
    view.getFloat64(60, true)  // ymax
  ];

  console.log('[SHP Diagnostics]', {
    fileCode: fileCode.toString(16),
    version,
    shapeType,
    declaredLength,
    actualLength: buffer.byteLength,
    bbox
  });

  return buffer.byteLength === declaredLength ? buffer : buffer.slice(0, declaredLength);
}

function validateDbfBuffer(data) {
  const buffer = getArrayBuffer(data);
  if (buffer.byteLength < 32) {
    throw new Error(`DBF file too short: ${buffer.byteLength} bytes`);
  }
  return buffer;
}

async function safeParseShapefile(buffers) {
  try {
    const prjText = buffers.prj ? new TextDecoder('utf-8').decode(getArrayBuffer(buffers.prj)) : undefined;
    console.log('[SHP Parse] PRJ content preview:', prjText ? prjText.substring(0, 100) + '...' : 'no PRJ');
    console.log('[SHP Parse] Starting direct parse with PRJ:', !!prjText);
    const result = normalizeShpResult(shp.parseShp(validateShpBuffer(buffers.shp), prjText));
    console.log('[SHP Parse] Direct parse successful, features:', result.length);
    return result;
  } catch (err) {
    console.log('[SHP Parse] Direct parse failed:', err.message);
    self.postMessage({ type: 'status', message: 'Primary SHP parse failed, trying zip fallback...' });
    if (typeof JSZip !== 'undefined' && typeof shp.parseZip === 'function') {
      try {
        console.log('[SHP Parse] Trying zip fallback');
        const result = normalizeShpResult(await parseShpFromZip(buffers));
        console.log('[SHP Parse] Zip fallback successful, features:', result.length);
        return result;
      } catch (zipErr) {
        console.log('[SHP Parse] Zip fallback failed:', zipErr.message);
        throw new Error(`${err.message}; zip fallback failed: ${zipErr.message}`);
      }
    }
    throw err;
  }
}

async function parseShpFromZip(buffers) {
  const zip = new JSZip();
  const baseName = 'upload';
  const entries = [
    ['shp', '.shp'],
    ['dbf', '.dbf'],
    ['shx', '.shx']
  ];

  console.log('[ZIP Fallback] Adding files to zip');
  entries.forEach(([key, ext]) => {
    if (buffers[key]) {
      const data = getArrayBuffer(buffers[key]);
      console.log(`[ZIP Fallback] Adding ${key}${ext}, size: ${data.byteLength} bytes`);
      zip.file(baseName + ext, data, { binary: true });
    } else {
      console.log(`[ZIP Fallback] Missing ${key}${ext}`);
    }
  });

  if (buffers.prj) {
    const prjText = new TextDecoder('utf-8').decode(getArrayBuffer(buffers.prj));
    console.log('[ZIP Fallback] Adding PRJ file, content preview:', prjText.substring(0, 50) + '...');
    zip.file(baseName + '.prj', prjText);
  } else {
    console.log('[ZIP Fallback] No PRJ file');
  }

  console.log('[ZIP Fallback] Generating zip buffer');
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
  console.log('[ZIP Fallback] Zip buffer size:', zipBuffer.byteLength, 'bytes');

  console.log('[ZIP Fallback] Parsing zip with shpjs');
  const parsed = await shp.parseZip(zipBuffer);
  console.log('[ZIP Fallback] Parse result type:', typeof parsed, Array.isArray(parsed) ? 'array' : 'object');
  return parsed;
}

function normalizeShpResult(parsedShp) {
  console.log('[Normalize] Input type:', typeof parsedShp, Array.isArray(parsedShp) ? 'array' : 'object');
  if (parsedShp && typeof parsedShp === 'object') {
    console.log('[Normalize] Keys:', Object.keys(parsedShp));
    if (parsedShp.type) console.log('[Normalize] Type:', parsedShp.type);
  }

  if (!parsedShp) {
    console.log('[Normalize] No data to normalize');
    return [];
  }

  const geometries = [];

  if (Array.isArray(parsedShp)) {
    console.log('[Normalize] Processing as array, length:', parsedShp.length);
    parsedShp.forEach((item, index) => {
      if (item && item.type === 'FeatureCollection' && Array.isArray(item.features)) {
        console.log(`[Normalize] Array item ${index} is FeatureCollection with ${item.features.length} features`);
        item.features.forEach((feature) => {
          geometries.push(feature.geometry || feature);
        });
      } else if (item && item.type === 'Feature') {
        console.log(`[Normalize] Array item ${index} is Feature`);
        geometries.push(item.geometry || item);
      } else {
        console.log(`[Normalize] Array item ${index} is raw geometry:`, item.type || 'unknown');
        geometries.push(item);
      }
    });
    return geometries;
  }

  if (parsedShp.type === 'FeatureCollection' && Array.isArray(parsedShp.features)) {
    console.log('[Normalize] Processing as FeatureCollection with', parsedShp.features.length, 'features');
    parsedShp.features.forEach((feature) => {
      geometries.push(feature.geometry || feature);
    });
    return geometries;
  }

  if (parsedShp.type === 'Feature') {
    console.log('[Normalize] Processing as single Feature');
    return [parsedShp.geometry || parsedShp];
  }

  console.log('[Normalize] Processing as raw geometry');
  return [parsedShp];
}

function combineShpAndDbf(parsedShp, parsedDbf) {
  const geometries = Array.isArray(parsedShp) ? parsedShp : [];
  const features = geometries.map((geometry, index) => ({
    type: 'Feature',
    geometry: geometry,
    properties: (Array.isArray(parsedDbf) ? parsedDbf[index] : null) || {}
  }));

  return {
    type: 'FeatureCollection',
    features: features
  };
}
