// Utility functions shared across components

// Validate file size before processing (max 50MB default)
function validateFileSize(file, maxSizeMB) {
  if (!maxSizeMB) maxSizeMB = 50;
  var maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    if (typeof showToast === 'function') {
      showToast("File " + file.name + " exceeds " + maxSizeMB + "MB limit. Please use a smaller file.", "error");
    } else {
      alert("File " + file.name + " exceeds " + maxSizeMB + "MB limit.");
    }
    return false;
  }
  return true;
}

// Check if existing data should prevent new uploads
// If fileType is provided, only block uploads of that same type
function checkExistingData(fileType) {
  if (!fileType) {
    // Legacy: block only if same legacy global is populated
    if (window.excelData && window.excelData.length > 0) return true;
    if (window.currentGeoJsonData) return true;
    if (window.currentKmlData) return true;
    if (window.currentShpData) return true;
    if (window.currentGpxData) return true;
    return false;
  }
  var type = String(fileType).toLowerCase();
  if (type === 'excel' || type === 'csv' || type === 'xlsx' || type === 'xls') {
    if (window.excelData && window.excelData.length > 0) return true;
    if (window.currentExcelDataByName && Object.keys(window.currentExcelDataByName).length > 0) return true;
  }
  if (type === 'geojson' || type === 'json') {
    if (window.currentGeoJsonData) return true;
    if (window.currentGeoJsonDataByName && Object.keys(window.currentGeoJsonDataByName).length > 0) return true;
  }
  if (type === 'kml' || type === 'kmz') {
    if (window.currentKmlData) return true;
    if (window.currentKmlDataByName && Object.keys(window.currentKmlDataByName).length > 0) return true;
  }
  if (type === 'shp' || type === 'shapefile') {
    if (window.currentShpData) return true;
    if (window.currentShpDataByName && Object.keys(window.currentShpDataByName).length > 0) return true;
  }
  if (type === 'gpx') {
    if (window.currentGpxData) return true;
    if (window.currentGpxDataByName && Object.keys(window.currentGpxDataByName).length > 0) return true;
  }
  return false;
}
window.checkExistingData = checkExistingData;

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

function getRepresentativePoint(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  if (geometry.type === "Point") return geometry.coordinates;

  try {
    let coords = geometry.coordinates;
    // Drill down to the first coordinate pair [lng, lat]
    while (Array.isArray(coords) && Array.isArray(coords[0])) {
      coords = coords[0];
    }
    return (Array.isArray(coords) && coords.length >= 2) ? coords : null;
  } catch (e) {
    return null;
  }
}

function handleGenericExport(format, dataStore, inputId, customFileName) {
  if (!dataStore || dataStore.length === 0) {
    alert("No data available to export.");
    return;
  }

  const finalFileName = customFileName || (window.generateExportFileName ? window.generateExportFileName(inputId, "Converted", format) : `export_${new Date().getTime()}.${format}`);

  // PRIORITY 1: For spatial formats (GeoJSON, KML, SHP), try to use the original full data if available
  // This preserves complex geometries (Lines, Polygons) which are otherwise flattened in dataStore
  const spatialFormats = ['geojson', 'json', 'kml', 'kmz', 'shp'];
  if (spatialFormats.includes(format)) {
     let sourceData = null;
     if (inputId === "geoJsonFile") sourceData = currentGeoJsonData;
     else if (inputId === "kmlFile") sourceData = currentKmlData;
     else if (inputId === "shpFile") sourceData = currentShpData;
     else if (inputId === "gpxFile") sourceData = currentGpxData;

     if (sourceData) {
        console.log(`🚀 Using original spatial data for ${format.toUpperCase()} export to preserve geometries.`);
        if (format === 'geojson' && window.exportToGeoJSON) {
           const blob = new Blob([JSON.stringify(sourceData, null, 2)], { type: "application/geo+json" });
           const url = window.URL.createObjectURL(blob);
           const a = document.createElement("a");
           a.href = url; a.download = finalFileName; a.click();
           window.URL.revokeObjectURL(url);
           return;
        } else if (format === 'kml' && window.exportToKML) {
           // We'll pass a special object that exportToKML can recognize, or just wrap it
           // For now, let's update exportToKML to handle FeatureCollection
           window.exportToKML(sourceData, finalFileName);
           return;
        } else if (format === 'kmz' && window.exportToKMZ) {
           window.exportToKMZ(sourceData, finalFileName);
           return;
        } else if (format === 'shp' && window.exportToShp) {
           window.exportToShp(sourceData, finalFileName);
           return;
        } else if (format === 'json' && window.exportToJSON) {
           window.exportToJSON(sourceData, finalFileName);
           return;
        }
     }
  }

  // PRIORITY 2: Use the flattened dataStore (standard behavior)
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
window.getRepresentativePoint = getRepresentativePoint;
window.handleGenericExport = handleGenericExport;

function refreshPage() {
    location.reload();
}
window.refreshPage = refreshPage;

// showToast is defined in helper.js (final loaded script) for the new dashboard.
// This early-boot fallback ensures toast works even before helper.js loads.
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (container) {
    // Use the helper.js style if container exists
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
    toast.innerHTML = `<span>${icons[type] || "✅"}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.3s ease-in";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
    return;
  }
  
  // Fallback: create a temporary inline toast if container doesn't exist yet
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 20px; max-width: 400px;
    padding: 16px 20px;
    background: ${type === "success" ? "#4caf50" : type === "error" ? "#f44336" : type === "warning" ? "#ff9800" : "#2196f3"};
    color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 9999; font-family: Arial, sans-serif; font-size: 14px;
    font-weight: 500; display: flex; align-items: center; gap: 12px;
    border-left: 5px solid rgba(0,0,0,0.2); animation: slideInLeft 0.3s ease-out;
  `;
  toast.innerHTML = `${type === "success" ? "✅" : type === "error" ? "❌" : type === "warning" ? "⚠️" : "ℹ️"} ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    toast.style.transition = "all 0.3s ease-in";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global Exports
window.showToast = showToast;
window.parseDMS = parseDMS;
window.formatDMS = formatDMS;
window.isDMS = isDMS;
window.extractCoordinates = extractCoordinates;
window.pairCoordinates = pairCoordinates;
window.normalizeCoordinates = normalizeCoordinates;
window.parseCSV = parseCSV;
window.validateFileSize = validateFileSize;
window.getExportOptionsHTML = getExportOptionsHTML;
window.getRepresentativePoint = getRepresentativePoint;
window.handleGenericExport = handleGenericExport;
window.refreshPage = refreshPage;
