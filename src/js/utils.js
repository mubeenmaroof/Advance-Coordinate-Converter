// Utility functions shared across components

function parseDMS(dmsString) {
  const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/;
  const match = dmsString.match(dmsPattern);
  if (!match) return null;
  const degrees = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const direction = match[4];
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === "S" || direction === "W") {
    dd = -dd;
  }
  return dd;
}

function formatDMS(dd, isLongitude = false) {
  const abs = Math.abs(dd);
  const degrees = Math.floor(abs);
  const minutesDecimal = (abs - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);
  let direction;
  if (isLongitude) {
    direction = dd >= 0 ? "E" : "W";
  } else {
    direction = dd >= 0 ? "N" : "S";
  }
  return `${degrees}°${minutes}'${seconds}"${direction}`;
}

function isDMS(input) {
  return /\d+°\d+'\d+\.?\d*"[NSEW]/.test(input);
}

function extractCoordinates(value) {
  let lat = null,
    lng = null;
  const stringValue = String(value).trim();
  if (isDMS(stringValue)) {
    const dd = parseDMS(stringValue);
    if (dd !== null) {
      const direction = stringValue.match(/[NSEW]/);
      if (direction) {
        if (direction[0] === "N" || direction[0] === "S") {
          lat = dd;
        } else if (direction[0] === "E" || direction[0] === "W") {
          lng = dd;
        }
      } else if (Math.abs(dd) <= 90) {
        lat = dd;
      } else {
        lng = dd;
      }
    }
  } else {
    const num = parseFloat(stringValue);
    if (!isNaN(num) && Math.abs(num) <= 180) {
      if (Math.abs(num) <= 90) {
        lat = num;
      } else {
        lng = num;
      }
    }
  }
  return { lat, lng };
}

function pairCoordinates(coordStore) {
  const paired = [];
  const used = new Set();
  for (let i = 0; i < coordStore.length; i++) {
    if (used.has(i)) continue;
    const item1 = coordStore[i];
    if (item1.lat !== null && item1.lng !== null) {
      paired.push(item1);
      used.add(i);
      continue;
    }
    for (let j = i + 1; j < coordStore.length; j++) {
      if (used.has(j)) continue;
      const item2 = coordStore[j];
      if (item1.rowIndex === item2.rowIndex) {
        if (item1.lat !== null && item2.lng !== null) {
          paired.push({
            ...item1,
            lng: item2.lng,
            lngOriginal: item2.originalValue,
          });
          used.add(i);
          used.add(j);
          break;
        } else if (item1.lng !== null && item2.lat !== null) {
          paired.push({
            ...item2,
            lng: item1.lng,
            lngOriginal: item1.originalValue,
          });
          used.add(i);
          used.add(j);
          break;
        }
      }
    }
    if (!used.has(i)) {
      if (item1.lat !== null) {
        paired.push({ ...item1, lng: 0 });
      } else if (item1.lng !== null) {
        paired.push({ ...item1, lat: 0 });
      }
      used.add(i);
    }
  }
  return paired;
}

function normalizeCoordinates(value) {
  const str = String(value || "").trim();
  let normalized = str.replace(/([NSEW])(\d+°)/g, "$1 $2");
  normalized = normalized.replace(/(\d\.\d{6,})([0-9]\d\.\d)/g, "$1 $2");
  normalized = normalized.replace(/(\d)([0-9]\d\.[0-9])/g, "$1 $2");
  return normalized;
}

function parseCSV(text) {
  const lines = text.split("\n");
  return lines.map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}
// File Size Validation
function validateFileSize(file, maxSizeMB = 40) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    alert(`File is too large! Maximum allowed size is ${maxSizeMB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
    return false;
  }
  return true;
}

// Export UI and Logic Helpers
function getExportOptionsHTML(excludeFormat, selectId) {
  const options = [
    { value: 'csv', label: 'CSV - Light & Faster' },
    { value: 'xlsx', label: 'Excel (XLSX) - High Quality' },
    { value: 'geojson', label: 'GeoJSON - Standard GIS Format' },
    { value: 'json', label: 'JSON - ArcMap Compatible' },
    { value: 'kml', label: 'KML - Google Earth' },
    { value: 'kmz', label: 'KMZ - Compressed KML' },
    { value: 'shp', label: 'Shapefile (ZIP) - Desktop GIS' }
  ];

  let html = `<select id="${selectId}" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600;">`;
  options.forEach(opt => {
    if (opt.value !== excludeFormat) {
      html += `<option value="${opt.value}">${opt.label}</option>`;
    }
  });
  html += `</select>`;
  return html;
}

function handleGenericExport(format, dataStore, inputId) {
  if (!dataStore || dataStore.length === 0) {
    alert("No data available to export.");
    return;
  }

  // Create fake markers for map export functions
  const fakeMarkers = dataStore.map((item, index) => {
    const properties = item.rowData || item.properties || {};
    return {
      getLatLng: () => ({ lat: item.lat, lng: item.lng }),
      markerData: {
        rowData: properties,
        rowIndex: item.rowIndex || index + 1
      },
      toGeoJSON: () => ({
         type: "Feature",
         geometry: { type: "Point", coordinates: [item.lng, item.lat] },
         properties: properties
      })
    };
  });

  const finalFileName = window.generateExportFileName ? window.generateExportFileName(inputId, "Converted", format) : `export_${new Date().getTime()}.${format}`;

  if (format === 'csv' || format === 'xlsx') {
    if (!window.initWorker) {
      alert("Export worker not available.");
      return;
    }
    showProcessingOverlay(`Generating ${format.toUpperCase()} Results...`);
    const worker = window.initWorker();
    
    let allKeys = new Set();
    fakeMarkers.forEach(m => {
      Object.keys(m.markerData.rowData).forEach(k => allKeys.add(k));
    });
    const headers = ["Latitude", "Longitude", ...Array.from(allKeys)];
    
    const aoaData = [headers];
    fakeMarkers.forEach(m => {
      const row = [m.getLatLng().lat, m.getLatLng().lng];
      Array.from(allKeys).forEach(k => {
        row.push(m.markerData.rowData[k] !== undefined ? m.markerData.rowData[k] : "");
      });
      aoaData.push(row);
    });

    if (format === 'csv') {
      worker.postMessage({
        type: 'excel_export',
        payload: {
          taskType: 'excel_upload_export',
          bookType: 'csv',
          taskPayload: { data: aoaData },
          fileName: finalFileName
        }
      });
    } else {
      const colWidths = headers.map(() => ({ wch: 20 }));
      worker.postMessage({
        type: 'excel_export',
        payload: {
          taskType: 'excel_upload_export',
          bookType: 'xlsx',
          taskPayload: { data: aoaData },
          sheetName: "Exported Data",
          fileName: finalFileName,
          styles: {
            colWidths: colWidths,
            freeze: { xSplit: 0, ySplit: 1 },
            headerStyle: {
              fill: { fgColor: { rgb: "FF667eea" } },
              font: { bold: true, color: { rgb: "FFFFFFFF" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }
      });
    }
  } else if (format === 'geojson' && window.exportToGeoJSON) {
    window.exportToGeoJSON(fakeMarkers, finalFileName);
  } else if (format === 'json' && window.exportToJSON) {
    window.exportToJSON(fakeMarkers, finalFileName);
  } else if (format === 'kml' && window.exportToKML) {
    window.exportToKML(fakeMarkers, finalFileName);
  } else if (format === 'kmz' && window.exportToKMZ) {
    window.exportToKMZ(fakeMarkers, finalFileName);
  } else if (format === 'shp' && window.exportToShp) {
    window.exportToShp(fakeMarkers, finalFileName);
  } else {
    alert("Unsupported export format or export function missing.");
  }
}

// expose to global for older inline handlers
window.parseDMS = parseDMS;
window.formatDMS = formatDMS;
window.isDMS = isDMS;
window.extractCoordinates = extractCoordinates;
window.pairCoordinates = pairCoordinates;
window.normalizeCoordinates = normalizeCoordinates;
window.parseCSV = parseCSV;
window.validateFileSize = validateFileSize;
window.getExportOptionsHTML = getExportOptionsHTML;
window.handleGenericExport = handleGenericExport;
