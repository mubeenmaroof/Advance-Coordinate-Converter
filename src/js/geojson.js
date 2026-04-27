// GeoJSON/JSON File Handling Functions

// Global state for JSON mapping
let jsonMappingState = {
  data: null,
  fileName: "",
  keys: [],
  selectedLat: "",
  selectedLng: ""
};

function handleGeoJsonUpload(event) {
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  console.log("📁 GeoJSON file upload triggered", event);
  const file = event.target.files[0];

  if (!file) return;

  if (validateFileSize(file)) {
    const clearBtnRow = document.getElementById("geoJsonClearBtnGroup");
    if (clearBtnRow) clearBtnRow.style.display = "block";
    handleGeoJsonFile(file);
  }
}

function handleGeoJsonFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      showProcessingOverlay("Parsing JSON Data...");
      setTimeout(() => {
        const jsonData = JSON.parse(e.target.result);
        jsonMappingState.data = jsonData;
        jsonMappingState.fileName = file.name;
        processGeoJsonData(jsonData, file.name);
        if (typeof syncUploadUI === 'function') syncUploadUI();
        hideProcessingOverlay();
      }, 100);
    } catch (error) {
      console.error("❌ Error parsing JSON:", error);
      hideProcessingOverlay();
      document.getElementById("geoJsonResult").innerHTML =
        `<div class="error">Error reading file: ${error.message}</div>`;
    }
  };
  showProcessingOverlay("Loading JSON Data...");
  reader.readAsText(file);
}

function processGeoJsonData(jsonData, fileName) {
  const resultDiv = document.getElementById("geoJsonResult");

  // Reset previous state
  currentGeoJsonData = jsonData;
  geoJsonCoordinateStore = [];

  // Standard GeoJSON detection
  if (jsonData.type === "FeatureCollection" || (jsonData.type === "Feature" && jsonData.geometry)) {
    if (jsonData.type === "FeatureCollection") {
      geoJsonCoordinateStore = extractCoordinatesFromGeoJson(jsonData);
    } else {
      geoJsonCoordinateStore = extractCoordinatesFromFeature(jsonData);
    }

    if (geoJsonCoordinateStore.length > 0) {
      renderJsonSuccessUI(fileName, "Standard GeoJSON", geoJsonCoordinateStore.length);
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
            📍 ${count} Coordinates
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
          * Showing first 10 coordinates. All ${count} features will be rendered on the map.
        </p>
      ` : ''}

      <div style="margin-top: 15px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #667eea; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
        <label style="font-weight: 700; font-size: 0.9em; color: #667eea;">Export Format:</label>
        ${getExportOptionsHTML(fileName.endsWith('.json') ? 'json' : 'geojson', 'geoJsonExportFormat')}
        <div style="display: flex; gap: 10px;">
          <button class="btn" onclick="downloadGeoJsonResults()" style="background: #667eea; color: white; border: none; padding: 10px 20px; font-weight: 700;">📥 Download Results</button>
          <button class="btn btn-primary" onclick="showGeoJsonOnMap()" style="padding: 10px 20px; font-weight: 700;">📍 Show on Map</button>
        </div>
      </div>
    </div>
  `;
  
  resultDiv.innerHTML = html;
}

// Reuse existing logic for standard GeoJSON features
function extractCoordinatesFromGeoJson(featureCollection) {
  const coordinates = [];
  let globalIndex = 0;
  featureCollection.features.forEach((feature, index) => {
    const extracted = extractCoordinatesFromFeature(feature, index, globalIndex);
    coordinates.push(...extracted);
    globalIndex += extracted.length;
  });
  return coordinates;
}

function extractCoordinatesFromFeature(feature, featureIndex = 0, globalStartIndex = 0) {
  const coordinates = [];
  const geometry = feature.geometry;
  const properties = feature.properties || {};

  if (!geometry) return coordinates;

  const coords = extractCoordsFromGeometry(geometry);
  coords.forEach((coord, idx) => {
    // Clone properties to avoid modifying original and add ObjectID
    const propsWithId = { ...properties };
    if (!propsWithId['ObjectID']) {
      propsWithId['ObjectID'] = globalStartIndex + idx + 1;
    }

    coordinates.push({
      lat: coord[1],
      lng: coord[0],
      properties: propsWithId,
      featureIndex: featureIndex,
      coordIndex: globalStartIndex + idx,
      geometryType: geometry.type // Preserve type (Point, LineString, etc.)
    });
  });

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
          if (feature.properties) {
            const props = { ...feature.properties };
            if (feature.geometry.type.includes("Polygon")) props.TYPE = "Polygon";
            else if (feature.geometry.type.includes("Line")) props.TYPE = "Line";

            const popupContent = createPremiumPopupHTML(null, null, props, null);
            layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' });
          }
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (geoJsonCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;
          
          if (typeof addDetailedMarker === "function") {
             addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1);
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
        style: function(feature) {
          return {
            color: "#667eea",
            weight: 3,
            opacity: 0.8,
            fillColor: "#667eea",
            fillOpacity: 0.2
          };
        }
      }).addTo(map);
      
      // Fit bounds
      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        } else if (markers.length > 0) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds(), { padding: [30, 30] });
        }
      } catch(e) {
        console.error("Error fitting bounds:", e);
      }
    }
    
    updateMapStats();
  }, 300);
}

function clearGeoJsonData() {
  currentGeoJsonData = null;
  geoJsonCoordinateStore = [];
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
