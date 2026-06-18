// GeoJSON/JSON File Handling Functions

// Global state for JSON mapping
let jsonMappingState = {
  data: null,
  fileName: "",
  keys: [],
  selectedLat: "",
  selectedLng: ""
};

// Initialize global data storage for multiple GeoJSON files
if (!window.currentGeoJsonDataByName) {
  window.currentGeoJsonDataByName = {};
}

function handleGeoJsonUpload(event) {
  console.log("📁 GeoJSON file upload triggered", event);
  const files = event.target.files;

  if (!files || files.length === 0) return;

  const clearBtnRow = document.getElementById("geoJsonClearBtnGroup");
  if (clearBtnRow) clearBtnRow.style.display = "block";

  // Process each file
  Array.from(files).forEach(file => {
    handleGeoJsonFile(file);
  });
}

function handleGeoJsonFile(file) {
  if (typeof validateFileSize === 'function' && !validateFileSize(file)) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      showProcessingOverlay("Parsing JSON Data...", 10);
      setTimeout(() => {
        updateProcessingProgress(30);
        const jsonData = JSON.parse(e.target.result);
        updateProcessingProgress(50);
        jsonMappingState.data = jsonData;
        jsonMappingState.fileName = file.name;
        processGeoJsonData(jsonData, file.name);
        updateProcessingProgress(80);
        if (typeof syncUploadUI === 'function') syncUploadUI();
        updateProcessingProgress(100);
        setTimeout(() => hideProcessingOverlay(), 200);
      }, 100);
    } catch (error) {
      console.error("❌ Error parsing JSON:", error);
      hideProcessingOverlay();
      const resultDiv = document.getElementById("geoJsonResult");
      if (resultDiv) {
        resultDiv.innerHTML =
          `<div class="error">Error reading file: ${error.message}</div>`;
      }
      if (typeof showToast === 'function') {
        showToast(`Error reading GeoJSON/JSON: ${error.message}`, "error");
      }
    }
  };
  reader.onerror = function () {
    hideProcessingOverlay();
    if (typeof showToast === 'function') {
      showToast(`Failed to read file: ${file.name}`, "error");
    }
  };
  showProcessingOverlay("Loading JSON Data...", 0);
  reader.readAsText(file);
}

function processGeoJsonData(jsonData, fileName) {
  const resultDiv = document.getElementById("geoJsonResult");
  let coordinates = [];

  // Standard GeoJSON detection
  if (jsonData.type === "FeatureCollection" || (jsonData.type === "Feature" && jsonData.geometry)) {
    if (jsonData.type === "FeatureCollection") {
      coordinates = extractCoordinatesFromGeoJson(jsonData);
    } else {
      coordinates = extractCoordinatesFromFeature(jsonData);
    }

    if (coordinates.length > 0) {
      // Store in the multi-file object using filename as key
      window.currentGeoJsonDataByName = window.currentGeoJsonDataByName || {};
      window.currentGeoJsonDataByName[fileName] = jsonData;
      window.currentGeoJsonDataByName[fileName]._sourceFileName = fileName;

      // Keep backward compatibility
      currentGeoJsonData = jsonData;
      geoJsonCoordinateStore = coordinates;

      renderJsonSuccessUI(fileName, "Standard GeoJSON", coordinates.length);
      return;
    }
  }

  // If not standard GeoJSON or extraction failed, discover keys and show mapping UI
  discoverAndShowMapping(jsonData, fileName);
}

function discoverAndShowMapping(data, fileName) {
  const resultDiv = document.getElementById("geoJsonResult");
  const keys = findAllKeys(data);
  jsonMappingState.keys = keys;

  if (keys.length === 0) {
    resultDiv.innerHTML = `<div class="error">❌ No identifiable data properties found in "${fileName}".</div>`;
    return;
  }

  // Try to auto-detect best matches
  const autoLat = keys.find(k => /lat|latitude|y/i.test(k)) || "";
  const autoLng = keys.find(k => /lng|lon|longitude|x/i.test(k)) || "";

  jsonMappingState.selectedLat = autoLat;
  jsonMappingState.selectedLng = autoLng;

  let html = `<div class="result" style="border: 2px solid #667eea; background: rgba(102, 126, 234, 0.05);">
    <h3 style="color: #667eea; margin-bottom: 15px;">🛠️ Map Your JSON Data</h3>
    <p>We found ${keys.length} different property names in your file. Please select which ones represent Latitude and Longitude.</p>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
      <div class="input-group">
        <label style="font-weight: 700; color: #4a5568;">Latitude Key:</label>
        <select id="jsonLatSelect" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e0; background: white;">
          <option value="">-- Select Latitude --</option>
          ${keys.map(k => `<option value="${k}" ${k === autoLat ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label style="font-weight: 700; color: #4a5568;">Longitude Key:</label>
        <select id="jsonLngSelect" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e0; background: white;">
          <option value="">-- Select Longitude --</option>
          ${keys.map(k => `<option value="${k}" ${k === autoLng ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>
    </div>
    
    <div style="margin-top: 15px; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
      <h4 style="margin-top: 0; font-size: 0.9em; color: #718096;">💡 Tips:</h4>
      <ul style="font-size: 0.85em; color: #4a5568; margin-bottom: 0; padding-left: 20px;">
        <li>You can map keys containing DMS strings like <code>"29°24'28.7"N"</code>.</li>
        <li>If coordinates are combined in one key (e.g. <code>"lat,lng"</code>), select it for both.</li>
        <li>For <b>latE7/lngE7</b> format, the tool will automatically divide by 10,000,000.</li>
      </ul>
    </div>

    <div style="margin-top: 20px; display: flex; gap: 10px;">
      <button class="btn btn-success" onclick="applyJsonKeyMapping()" style="flex: 1; font-weight: 700;">🔄 Process & Preview</button>
    </div>
  </div>`;

  resultDiv.innerHTML = html;
}

function applyJsonKeyMapping() {
  try {
    const latKey = document.getElementById("jsonLatSelect").value;
    const lngKey = document.getElementById("jsonLngSelect").value;

    if (!latKey || !lngKey) {
      alert("Please select both Latitude and Longitude keys.");
      return;
    }

    jsonMappingState.selectedLat = latKey;
    jsonMappingState.selectedLng = lngKey;

    showProcessingOverlay("Applying Key Mapping...");

    setTimeout(() => {
      const mapping = { lat: latKey, lng: lngKey };
      geoJsonCoordinateStore = extractWithMapping(jsonMappingState.data, mapping);

      if (geoJsonCoordinateStore.length === 0) {
        hideProcessingOverlay();
        alert("No valid coordinates found with these keys. Try different keys or check the file format.");
        return;
      }

      renderJsonSuccessUI(jsonMappingState.fileName, "Mapped JSON", geoJsonCoordinateStore.length);
      hideProcessingOverlay();
    }, 100);
  } catch (error) {
    console.error("❌ Error in applyJsonKeyMapping:", error);
    hideProcessingOverlay();
    alert("An error occurred during processing: " + error.message);
  }
}

function findAllKeys(data) {
  const keys = new Set();
  const visited = new Set();

  function scan(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object' || visited.has(obj)) return;
    visited.add(obj);

    if (Array.isArray(obj)) {
      obj.slice(0, 10).forEach(item => scan(item, depth + 1));
    } else {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
          keys.add(key);
        } else {
          scan(obj[key], depth + 1);
        }
      });
    }
  }

  scan(data);
  return Array.from(keys).sort();
}

function extractWithMapping(data, mapping) {
  const coordinates = [];
  const visited = new Set();

  function scan(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object' || visited.has(obj)) return;
    visited.add(obj);

    if (Array.isArray(obj)) {
      obj.forEach(item => scan(item, depth + 1));
    } else {
      // Check if this object has the selected keys
      const latVal = obj[mapping.lat];
      const lngVal = obj[mapping.lng];

      if (latVal !== undefined && lngVal !== undefined) {
        // Handle special case where same key is used for both (might be a string "lat,lng")
        if (mapping.lat === mapping.lng && typeof latVal === 'string') {
          const parts = latVal.split(/[,;\s]+/).map(p => p.trim()).filter(p => p);
          if (parts.length >= 2) {
            const coord = parsePair(parts[0], parts[1], obj);
            if (coord) {
              coord.coordIndex = coordinates.length;
              // Add Object ID to properties
              if (!coord.properties) coord.properties = {};
              coord.properties['ObjectID'] = coordinates.length + 1;
              coordinates.push(coord);
            }
          }
        } else {
          const coord = parsePair(latVal, lngVal, obj);
          if (coord) {
            // Adjust for E7 if needed
            if (mapping.lat.includes('E7')) coord.lat /= 1e7;
            if (mapping.lng.includes('E7')) coord.lng /= 1e7;
            coord.coordIndex = coordinates.length;
            // Add Object ID to properties
            if (!coord.properties) coord.properties = {};
            coord.properties['ObjectID'] = coordinates.length + 1;
            coordinates.push(coord);
          }
        }
      }

      // Keep searching nested
      Object.keys(obj).forEach(key => scan(obj[key], depth + 1));
    }
  }

  scan(data);
  return coordinates;
}

function parsePair(latVal, lngVal, properties) {
  let lat = null, lng = null;

  if (typeof window.extractCoordinates === 'function') {
    const latRes = window.extractCoordinates(latVal);
    const lngRes = window.extractCoordinates(lngVal);

    // Sometimes extractCoordinates puts lng in lat field if it's high
    lat = latRes.lat !== null ? latRes.lat : (latRes.lng !== null ? latRes.lng : null);
    lng = lngRes.lng !== null ? lngRes.lng : (lngRes.lat !== null ? lngRes.lat : null);

    // Validate bounds
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, properties };
    }

    // Swap check (if user picked them wrong)
    if (lat !== null && lng !== null && Math.abs(lat) <= 180 && Math.abs(lng) <= 90) {
      return { lat: lng, lng: lat, properties };
    }
  }
  return null;
}

function renderJsonSuccessUI(fileName, format, count) {
  const resultDiv = document.getElementById("geoJsonResult");
  const clearBtn = document.getElementById("geoJsonClearBtnGroup");
  if (clearBtn) clearBtn.style.display = "block";

  // Show toast notification
  if (typeof showToast === 'function') {
    showToast(`✓ Loaded: ${fileName} (${count} features)`, "success");
  }

  // Discover all unique property keys
  const propertyKeys = new Set();
  const geomTypes = new Set();

  geoJsonCoordinateStore.forEach(c => {
    if (c.properties) {
      Object.keys(c.properties).forEach(key => {
        if (key !== 'ObjectID') propertyKeys.add(key);
      });
    }
    if (c.geometryType) geomTypes.add(c.geometryType);
  });

  const sortedKeys = Array.from(propertyKeys).sort();
  const displayCount = Math.min(count, 10);

  let html = `
    <div class="result-card" style="animation: fadeIn 0.5s ease-out;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0; color: #667eea; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.2em;">✅</span> ${fileName}
          </h3>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9em;">
            Format: <b>${format}</b> | Types: <b>${Array.from(geomTypes).join(', ') || 'Point'}</b>
          </p>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <div style="background: rgba(102, 126, 234, 0.1); color: #667eea; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.85em;">
            📍 ${count} Features
          </div>
          <button class="btn" onclick="discoverAndShowMapping(currentGeoJsonData, '${fileName}')" style="font-size: 0.75em; padding: 4px 8px; background: transparent; border: 1px solid #cbd5e1; color: #64748b;">⚙️ Re-Map Keys</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Type</th>
              ${sortedKeys.map(key => `<th>${key}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${geoJsonCoordinateStore.slice(0, displayCount).map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
                <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
                <td><span class="badge" style="background: #f1f5f9; color: #475569; font-size: 10px;">${c.geometryType || 'Point'}</span></td>
                ${sortedKeys.map(key => `<td>${c.properties && c.properties[key] !== undefined ? c.properties[key] : '-'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${count > displayCount ? `
        <p style="font-size: 0.8em; color: #64748b; margin-top: 10px; font-style: italic; padding-left: 5px;">
          * Showing first ${displayCount} of ${count} features. Use "Show on Map" to see all spatial data.
        </p>
      ` : ''}
 <div style="margin-top: 15px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #667eea; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
        <label style="font-weight: 700; font-size: 0.9em; color: #667eea;">Export Format:</label>
        ${getExportOptionsHTML(fileName.endsWith('.json') ? 'json' : 'geojson', 'geoJsonExportFormat')}
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="tool-action-btn secondary" onclick="downloadGeoJsonResults()">📥 Download Results</button>
          <button class="tool-action-btn success" onclick="showGeoJsonOnMap()">📍 Show on Map</button>
        </div>
      </div>
    </div>
  `;

  resultDiv.innerHTML = html;
}

// Reuse existing logic for standard GeoJSON features
function extractCoordinatesFromGeoJson(featureCollection) {
  const coordinates = [];
  featureCollection.features.forEach((feature, featureIndex) => {
    const extracted = extractCoordinatesFromFeature(feature, featureIndex, coordinates.length);
    coordinates.push(...extracted);
  });
  return coordinates;
}

function extractCoordinatesFromFeature(feature, featureIndex = 0, globalStartIndex = 0) {
  const coordinates = [];
  const geometry = feature.geometry;
  const properties = feature.properties || {};

  if (!geometry) return coordinates;

  // Standardize: Use ONE representative point per feature for the preview UI and store
  const repPoint = getRepresentativePoint(geometry);

  if (repPoint) {
    const propsWithId = { ...properties };
    if (!propsWithId['ObjectID']) {
      propsWithId['ObjectID'] = globalStartIndex + 1;
    }

    coordinates.push({
      lat: repPoint[1],
      lng: repPoint[0],
      properties: propsWithId,
      featureIndex: featureIndex,
      coordIndex: globalStartIndex,
      geometryType: geometry.type,
      geometry: geometry // Preserve original geometry for export
    });
  }

  return coordinates;
}

function extractCoordsFromGeometry(geometry) {
  const coords = [];
  if (geometry.type === "Point") {
    coords.push(geometry.coordinates);
  } else if (geometry.type === "LineString") {
    coords.push(...geometry.coordinates);
  } else if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(ring => coords.push(...ring));
  } else if (geometry.type === "MultiPoint") {
    coords.push(...geometry.coordinates);
  } else if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach(line => coords.push(...line));
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach(polygon => {
      polygon.forEach(ring => coords.push(...ring));
    });
  }
  return coords;
}

function showGeoJsonOnMap() {
  if (!geoJsonCoordinateStore || geoJsonCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }

  closeModal('previewModal');
  showTab('map');

  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();

    clearMapMarkers();

    // Add Standard GeoJSON layer if available
    if (currentGeoJsonData && currentGeoJsonData.type === "FeatureCollection") {
      const renderer = L.canvas({ padding: 0.5 });

      const geoLayer = L.geoJSON(currentGeoJsonData, {
        renderer: renderer,
        onEachFeature: function (feature, layer) {
          // Store the feature data on the layer for selection purposes
          layer.feature = feature;

          if (feature.properties) {
            const props = { ...feature.properties };
            if (feature.geometry.type.includes("Polygon")) props.TYPE = "Polygon";
            else if (feature.geometry.type.includes("Line")) props.TYPE = "Line";

            const popupContent = createPremiumPopupHTML(null, null, props, null);
            layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' });
          }
          // Add non-point features to importedLayers for selection and export
          if (importedLayers && !(layer instanceof L.Marker)) {
            importedLayers.addLayer(layer);
          }
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (geoJsonCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;

          if (typeof addDetailedMarker === "function") {
            const marker = addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1, feature);
            if (marker) importedLayers.addLayer(marker);
            return L.layerGroup();
          }

          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: "#667eea",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        },
        style: function (feature) {
          return {
            color: "#667eea",
            weight: 3,
            opacity: 0.8,
            fillColor: "#667eea",
            fillOpacity: 0.2
          };
        }
      });

      // Fit bounds
      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        } else if (markers.length > 0) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds(), { padding: [30, 30] });
        }
      } catch (e) {
        console.error("Error fitting bounds:", e);
      }
    }

    updateMapStats();
  }, 300);
}

function clearGeoJsonData() {
  currentGeoJsonData = null;
  geoJsonCoordinateStore = [];
  window.currentGeoJsonDataByName = {};
  jsonMappingState = { data: null, fileName: "", keys: [], selectedLat: "", selectedLng: "" };

  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();

  const fileInput = document.getElementById("geoJsonFile");
  if (fileInput) fileInput.value = "";
  const resultDiv = document.getElementById("geoJsonResult");
  if (resultDiv) resultDiv.innerHTML = "";
  const clearBtnRow = document.getElementById("geoJsonClearBtnGroup");
  if (clearBtnRow) clearBtnRow.style.display = "none";
}

// expose
window.handleGeoJsonUpload = handleGeoJsonUpload;
window.handleGeoJsonFile = handleGeoJsonFile;
window.showGeoJsonOnMap = showGeoJsonOnMap;
window.clearGeoJsonData = clearGeoJsonData;
window.applyJsonKeyMapping = applyJsonKeyMapping;
window.discoverAndShowMapping = discoverAndShowMapping;
window.downloadGeoJsonResults = downloadGeoJsonResults;

function downloadGeoJsonResults() {
  if (!geoJsonCoordinateStore || geoJsonCoordinateStore.length === 0) {
    alert("Please load valid JSON/GeoJSON data first.");
    return;
  }
  const format = document.getElementById("geoJsonExportFormat")?.value || "csv";
  handleGenericExport(format, geoJsonCoordinateStore, "geoJsonFile");
}

// ==================== Individual GeoJSON File Operations ====================

function deleteIndividualGeoJsonByName(fileName) {
  if (!window.currentGeoJsonDataByName || !window.currentGeoJsonDataByName[fileName]) {
    return;
  }

  delete window.currentGeoJsonDataByName[fileName];

  // If no more GeoJSON files, clear the backward-compatible reference
  if (Object.keys(window.currentGeoJsonDataByName).length === 0) {
    currentGeoJsonData = null;
    geoJsonCoordinateStore = [];
  } else {
    // Update currentGeoJsonData to first remaining file for backward compatibility
    const firstFileName = Object.keys(window.currentGeoJsonDataByName)[0];
    currentGeoJsonData = window.currentGeoJsonDataByName[firstFileName];
    geoJsonCoordinateStore = extractCoordinatesFromGeoJson(currentGeoJsonData) ||
      extractCoordinatesFromFeature(currentGeoJsonData) || [];
  }

  if (typeof syncUploadUI === 'function') syncUploadUI();
}

function previewIndividualGeoJson(fileName) {
  if (!window.currentGeoJsonDataByName || !window.currentGeoJsonDataByName[fileName]) {
    alert("GeoJSON file not found");
    return;
  }

  const geoJsonData = window.currentGeoJsonDataByName[fileName];
  let coordinates = extractCoordinatesFromGeoJson(geoJsonData) ||
    extractCoordinatesFromFeature(geoJsonData) || [];

  if (!coordinates || coordinates.length === 0) {
    alert("No extractable coordinates found in this GeoJSON file");
    return;
  }

  // Discover property keys
  const propertyKeys = new Set();
  const geomTypes = new Set();

  if (geoJsonData.type === "FeatureCollection") {
    geoJsonData.features.forEach(feature => {
      if (feature.properties) {
        Object.keys(feature.properties).forEach(key => {
          if (key !== 'ObjectID') propertyKeys.add(key);
        });
      }
      if (feature.geometry) geomTypes.add(feature.geometry.type);
    });
  } else if (geoJsonData.type === "Feature") {
    if (geoJsonData.properties) {
      Object.keys(geoJsonData.properties).forEach(key => {
        if (key !== 'ObjectID') propertyKeys.add(key);
      });
    }
    if (geoJsonData.geometry) geomTypes.add(geoJsonData.geometry.type);
  }

  const sortedKeys = Array.from(propertyKeys).sort();
  const displayCount = Math.min(coordinates.length, 10);

  let html = `<div class="result-card">
    <h3 style="color: #667eea; margin-bottom: 15px;">📄 ${fileName}</h3>
    <div style="margin-bottom: 15px; padding: 12px; background: #f0f7ff; border-left: 3px solid #667eea; border-radius: 4px;">
      <strong style="color: #667eea;">Geometry Types:</strong> ${Array.from(geomTypes).join(', ') || 'N/A'} | 
      <strong style="color: #667eea;">Features:</strong> ${coordinates.length}
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Latitude</th>
            <th>Longitude</th>
            ${sortedKeys.slice(0, 3).map(k => `<th>${k}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${coordinates.slice(0, displayCount).map((c, i) => {
    const feature = geoJsonData.type === "FeatureCollection" ?
      geoJsonData.features.find(f => f.properties && f.properties.ObjectID === c.ObjectID) :
      geoJsonData;
    const props = feature?.properties || {};

    return `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
                <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
                ${sortedKeys.slice(0, 3).map(k => `<td style="font-size: 0.85em;">${props[k] || '-'}</td>`).join('')}
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>
    </div>
    ${coordinates.length > displayCount ? `<p style="color: #718096; font-size: 0.85em; margin-top: 10px;">... and ${coordinates.length - displayCount} more features</p>` : ''}
  </div>`;

  document.getElementById("geoJsonResult").innerHTML = html;
  showTab("results");
}

function showIndividualGeoJsonOnMap(fileName) {
  // Try named lookup first, fall back to combined data
  var geoJsonData = null;

  if (window.currentGeoJsonDataByName && window.currentGeoJsonDataByName[fileName]) {
    geoJsonData = window.currentGeoJsonDataByName[fileName];
  } else if (currentGeoJsonData && currentGeoJsonData.features && currentGeoJsonData.features.length > 0) {
    geoJsonData = currentGeoJsonData;
    if (typeof showToast === 'function') showToast("Using combined GeoJSON data for " + fileName, "info");
  } else {
    if (typeof showToast === 'function') showToast('GeoJSON "' + fileName + '" not found', "error");
    return;
  }

  if (!geoJsonData) {
    if (typeof showToast === 'function') showToast("No GeoJSON data available for " + fileName, "error");
    return;
  }

  // Switch to map tab
  if (typeof showTab === 'function') showTab('map');

  setTimeout(function () {
    if (!map && typeof initMap === 'function') initMap();
    else if (map && typeof map.invalidateSize === 'function') map.invalidateSize();

    if (typeof clearMapMarkers === 'function') clearMapMarkers();

    var key = 'geojson::' + fileName;
    if (mapVisibleLayers && mapVisibleLayers[key] && map) {
      try { map.removeLayer(mapVisibleLayers[key]); } catch (e) { }
      delete mapVisibleLayers[key];
    }

    if (map && typeof L !== 'undefined') {
      var renderer = L.canvas({ padding: 0.5 });

      var geoLayer = L.geoJSON(geoJsonData, {
        renderer: renderer,
        onEachFeature: function (feature, layer) {
          layer.feature = feature;
          if (feature.properties) {
            var props = { ...feature.properties };
            props._geojson = fileName;
            if (feature.geometry && feature.geometry.type) {
              if (feature.geometry.type.indexOf("Polygon") !== -1) props.TYPE = "Polygon";
              else if (feature.geometry.type.indexOf("Line") !== -1) props.TYPE = "Line";
            }
            if (typeof createPremiumPopupHTML === 'function') {
              layer.bindPopup(createPremiumPopupHTML(null, null, props, null), { maxWidth: 350 });
            }
          }
        },
        style: function (feature) {
          return { weight: 2, color: "#3498db", opacity: 0.8, fillColor: "#3498db", fillOpacity: 0.3 };
        },
        pointToLayer: function (feature, latlng) {
          if (typeof addDetailedMarker === "function") {
            var m = addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, 1, feature);
            if (m) return m;
          }
          return L.circleMarker(latlng, { radius: 8, fillColor: "#3498db", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1 });
        }
      });

      mapVisibleLayers[key] = geoLayer;
      geoLayer.addTo(map);

      if (typeof geoLayer.getBounds === 'function') {
        try {
          var bounds = geoLayer.getBounds();
          if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch (e) { }
      }
    }

    if (typeof showToast === 'function') showToast("📍 " + fileName + " on map", "success");
  }, 100);
}
