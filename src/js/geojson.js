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
  const displayCount = Math.min(count, 500);
  
  let html = `<div class="result">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
      <div>
        <h3 style="margin: 0;">✅ ${fileName}</h3>
        <p style="margin: 5px 0; color: #666;">
          Format: <b>${format}</b> | 
          Coordinates: <b>${count}</b> | 
          Types: <b>${Array.from(geomTypes).join(', ') || 'N/A'}</b>
        </p>
      </div>
      <button class="btn btn-secondary" onclick="discoverAndShowMapping(currentGeoJsonData, '${fileName}')" style="font-size: 0.8em; padding: 5px 10px;">⚙️ Re-Map Keys</button>
    </div>

    <div class="table-container" style="max-height: 400px; overflow: auto;">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Lat</th>
            <th>Lng</th>
            ${sortedKeys.map(key => `<th>${key}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${geoJsonCoordinateStore.slice(0, displayCount).map((c, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${c.lat.toFixed(6)}</td>
              <td>${c.lng.toFixed(6)}</td>
              ${sortedKeys.map(key => `<td>${c.properties && c.properties[key] !== undefined ? c.properties[key] : ''}</td>`).join('')}
            </tr>
          `).join('')}
          ${count > displayCount ? `<tr><td colspan="${sortedKeys.length + 3}" style="text-align: center; padding: 15px; background: #f8f9fa; font-style: italic; color: #666;">Showing first 500 of ${count} rows. Use "Show on Map" to see all spatial data.</td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #667eea; display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn btn-success" onclick="showGeoJsonOnMap()" style="padding: 10px 20px; font-weight: 700; flex: 1;">🗺️ Show on Map</button>
    </div>
  </div>`;
  
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
  
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  
  const mapTab = document.getElementById("map");
  const mapBtn = document.querySelectorAll(".tab-btn")[3];
  mapTab.classList.add("active");
  mapBtn.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  
  setTimeout(() => {
    if (!map) {
      initMap();
    } else {
      map.invalidateSize();
    }
    clearMapMarkers();
    
    // Add Standard GeoJSON layer if available
    if (currentGeoJsonData && currentGeoJsonData.type === "FeatureCollection") {
      L.geoJSON(currentGeoJsonData, {
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
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#667eea",
            color: "#000",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          });
        }
      }).addTo(map);
    }
    
    // Add individual markers from the coordinate store (handles custom mapped JSON)
    const totalPoints = geoJsonCoordinateStore.length;
    const skipVertexMarkers = totalPoints > 500;
    
    geoJsonCoordinateStore.forEach((coord) => {
      if (Math.abs(coord.lat) <= 90 && Math.abs(coord.lng) <= 180) {
        // Only add markers for Points, OR for everything if the dataset is small
        if (!skipVertexMarkers || coord.geometryType === 'Point' || !coord.geometryType) {
          addDetailedMarker(coord.lat, coord.lng, coord.properties, coord.coordIndex + 1);
        }
      }
    });
    
    if (markers.length > 0) {
      setTimeout(() => {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
      }, 200);
    } else {
      // If no markers were added (e.g. only lines/polygons), try to fit to the GeoJSON layer
      const geoJsonLayers = [];
      map.eachLayer(l => { if (l instanceof L.GeoJSON) geoJsonLayers.push(l); });
      if (geoJsonLayers.length > 0) {
        const bounds = L.featureGroup(geoJsonLayers).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
      }
    }
    updateMapStats();
  }, 300);
}

function clearGeoJsonData() {
  currentGeoJsonData = null;
  geoJsonCoordinateStore = [];
  jsonMappingState = { data: null, fileName: "", keys: [], selectedLat: "", selectedLng: "" };
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
