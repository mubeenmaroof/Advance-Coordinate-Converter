// Global state — gpxCoordinateStore is declared in variables.js already,
// but we ensure it exists here for self-containment.
if (typeof gpxCoordinateStore === 'undefined') { var gpxCoordinateStore = []; }
if (typeof currentGpxData === 'undefined') { var currentGpxData = null; }

// Initialize global data storage for multiple GPX files
if (!window.currentGpxDataByName) {
  window.currentGpxDataByName = {};
}

function handleGpxUpload(event) {
  if (window.checkExistingData && window.checkExistingData('gpx')) {
    event.target.value = '';
    return;
  }
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const clearBtnRow = document.getElementById("gpxClearBtnGroup");
  if (clearBtnRow) clearBtnRow.style.display = "block";
  
  // Process each file
  Array.from(files).forEach(file => {
    if (validateFileSize(file)) {
      handleGpxFile(file);
    }
  });
}

function handleGpxFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    showProcessingOverlay("Parsing GPX Data...", 10);
    setTimeout(() => {
      updateProcessingProgress(50);
      processGpxData(e.target.result, file.name);
      updateProcessingProgress(90);
      updateProcessingProgress(100);
      setTimeout(() => hideProcessingOverlay(), 200);
    }, 100);
  };
  reader.readAsText(file);
}

function processGpxData(gpxString, fileName) {
  const resultDiv = document.getElementById("gpxResult");

  try {
    const parser = new DOMParser();
    const gpxDom = parser.parseFromString(gpxString, 'text/xml');

    // Check for parsing errors
    const errorNode = gpxDom.querySelector('parsererror');
    if (errorNode) {
      throw new Error("Invalid GPX format.");
    }

    // Use toGeoJSON from CDN, with fallback for different API versions
    let geoJsonData;
    if (typeof toGeoJSON !== 'undefined' && typeof toGeoJSON.gpx === 'function') {
      geoJsonData = toGeoJSON.gpx(gpxDom);
    } else if (typeof toGeoJSON !== 'undefined' && typeof toGeoJSON.gpx === 'object') {
      // Some versions expose toGeoJSON.gpx as a namespace
      geoJsonData = toGeoJSON.gpx.parse(gpxDom) || toGeoJSON.gpx(gpxDom);
    } else {
      // Fallback: manual GPX parsing
      geoJsonData = fallbackParseGpx(gpxDom);
    }
    
    // Ensure we have a valid FeatureCollection
    if (!geoJsonData || !geoJsonData.type) {
      geoJsonData = {
        type: "FeatureCollection",
        features: []
      };
    }
    if (geoJsonData.type === "Feature") {
      geoJsonData = { type: "FeatureCollection", features: [geoJsonData] };
    }
    if (!geoJsonData.features) {
      geoJsonData.features = [];
    }
    
    // Store in the multi-file object using filename as key
    window.currentGpxDataByName = window.currentGpxDataByName || {};
    window.currentGpxDataByName[fileName] = geoJsonData;
    window.currentGpxDataByName[fileName]._sourceFileName = fileName;
    
    // Keep backward compatibility
    currentGpxData = geoJsonData;
    
    // CRITICAL: Assign extracted coordinates to the global store
    gpxCoordinateStore = extractCoordinatesFromGpxGeoJson(geoJsonData);

    if (gpxCoordinateStore.length > 0) {
      renderGpxSuccessUI(fileName, gpxCoordinateStore.length);
      if (typeof syncUploadUI === 'function') syncUploadUI();
    } else {
      resultDiv.innerHTML = `<div class="error">❌ No identifiable coordinates found in "${fileName}".</div>`;
    }
  } catch (error) {
    console.error("❌ Error parsing GPX:", error);
    resultDiv.innerHTML = `<div class="error">Error processing GPX: ${error.message}</div>`;
  }
}

// Fallback GPX parser when toGeoJSON CDN is unavailable
function fallbackParseGpx(gpxDom) {
  const features = [];
  
  // Parse waypoints
  const wpts = gpxDom.querySelectorAll('wpt');
  wpts.forEach(wpt => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lon = parseFloat(wpt.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lon)) {
      const props = {};
      ['name', 'ele', 'time', 'sym', 'desc'].forEach(tag => {
        const el = wpt.querySelector(tag);
        if (el) props[tag] = el.textContent;
      });
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: props
      });
    }
  });
  
  // Parse tracks
  const trks = gpxDom.querySelectorAll('trk');
  trks.forEach(trk => {
    const name = trk.querySelector('name')?.textContent || 'Track';
    const trkpts = trk.querySelectorAll('trkpt');
    const coords = [];
    trkpts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        coords.push([lon, lat]);
      }
    });
    if (coords.length > 0) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name: name }
      });
    }
  });
  
  // Parse routes
  const rtes = gpxDom.querySelectorAll('rte');
  rtes.forEach(rte => {
    const name = rte.querySelector('name')?.textContent || 'Route';
    const rtepts = rte.querySelectorAll('rtept');
    const coords = [];
    rtepts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        coords.push([lon, lat]);
      }
    });
    if (coords.length > 0) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name: name }
      });
    }
  });
  
  return { type: "FeatureCollection", features: features };
}

function extractCoordinatesFromGpxGeoJson(geoJson) {
  const coordinates = [];
  let globalIndex = 0;

  if (geoJson.type === "FeatureCollection") {
    geoJson.features.forEach((feature, featureIndex) => {
      const extracted = extractCoordinatesFromGpxFeature(feature, featureIndex, coordinates.length);
      coordinates.push(...extracted);
    });
  }
  return coordinates;
}

function extractCoordinatesFromGpxFeature(feature, featureIndex, globalStartIndex) {
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

function renderGpxSuccessUI(fileName, count) {
  const resultDiv = document.getElementById("gpxResult");
  const clearBtn = document.getElementById("gpxClearBtnGroup");
  if (clearBtn) clearBtn.style.display = "block";
  
  // Show toast notification
  if (typeof showToast === 'function') {
    showToast(`✓ Loaded: ${fileName} (${count} features)`, "success");
  }
  
  // Discover geometry types from the current GPX data
  const geomTypes = new Set();
  if (currentGpxData && currentGpxData.features) {
    currentGpxData.features.forEach(f => {
      if (f.geometry && f.geometry.type) geomTypes.add(f.geometry.type);
    });
  }
  gpxCoordinateStore.forEach(c => {
    if (c.geometryType) geomTypes.add(c.geometryType);
  });
  
  const displayCount = Math.min(count, 10);
  
  let html = `
    <div class="result-card" style="animation: fadeIn 0.5s ease-out;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0; color: #667eea; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.2em;">🛰️</span> ${fileName}
          </h3>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9em;">
            Format: <b>GPX</b> | Types: <b>${Array.from(geomTypes).join(', ') || 'Track/Waypoint'}</b>
          </p>
        </div>
        <div style="background: rgba(102, 126, 234, 0.1); color: #667eea; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.85em;">
          📍 ${count} Features
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
              <th>Name</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${gpxCoordinateStore.slice(0, displayCount).map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
                <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
                <td><span class="badge" style="background: #f1f5f9; color: #475569; font-size: 10px;">${c.geometryType}</span></td>
                <td>${c.properties.name || '-'}</td>
                <td>${c.properties.time ? new Date(c.properties.time).toLocaleString() : '-'}</td>
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

      <div style="margin-top: 15px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #ff416c; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
        <label style="font-weight: 700; font-size: 0.9em; color: #ff416c;">Export Format:</label>
        ${getExportOptionsHTML('gpx', 'gpxExportFormat')}
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="tool-action-btn secondary" onclick="downloadGpxResults()">📥 Download Results</button>
          <button class="tool-action-btn success" onclick="showGpxOnMap()">📍 Show on Map</button>
        </div>
      </div>
    </div>
  `;
  
  resultDiv.innerHTML = html;
}

function showGpxOnMap() {
  if (!gpxCoordinateStore || gpxCoordinateStore.length === 0) {
    if (typeof showToast === 'function') {
      showToast("No coordinates found in GPX data.", "warning");
    } else {
      alert("No coordinates found.");
    }
    return;
  }
  closeModal('previewModal');
  showTab('map');
  
  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();
    
    if (typeof clearMapMarkers === 'function') clearMapMarkers();
    
    if (currentGpxData) {
      const renderer = L.canvas({ padding: 0.5 });
      
      const geoLayer = L.geoJSON(currentGpxData, {
        renderer: renderer,
        onEachFeature: function (feature, layer) {
          // Store the feature data on the layer for selection purposes
          layer.feature = feature;

          if (feature.properties) {
            const props = { ...feature.properties };
            if (feature.geometry.type.includes("Line")) props.TYPE = "Track/Route";
            
            const popupContent = createPremiumPopupHTML(null, null, props, null);
            layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' });
          }
          // Add non-point features to importedLayers for selection and export
          if (importedLayers && !(layer instanceof L.Marker)) {
            importedLayers.addLayer(layer);
          }
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (gpxCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;

          if (typeof addDetailedMarker === "function") {
             addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1, feature);
             return L.layerGroup(); 
          }

          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: "#ff4b2b",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        },
        style: function(feature) {
          return {
            color: "#ff416c",
            weight: 4,
            opacity: 0.8,
            dashArray: "5, 10"
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
      } catch(e) {
        console.error("Error fitting bounds:", e);
      }
    }
    
    if (typeof updateMapStats === 'function') {
      try { updateMapStats(); } catch(e) {}
    }
  }, 300);
}

function clearGpxData() {
  gpxCoordinateStore = [];
  currentGpxData = null;
  window.currentGpxDataByName = {};
  
  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();
  
  document.getElementById("gpxResult").innerHTML = "";
  document.getElementById("gpxClearBtnGroup").style.display = "none";
  document.getElementById("gpxFile").value = "";
}
// expose
window.handleGpxUpload = handleGpxUpload;
window.handleGpxFile = handleGpxFile;
window.showGpxOnMap = showGpxOnMap;
window.clearGpxData = clearGpxData;
window.downloadGpxResults = downloadGpxResults;

function downloadGpxResults() {
  if (!gpxCoordinateStore || gpxCoordinateStore.length === 0) {
    alert("Please load valid GPX data first.");
    return;
  }
  const format = document.getElementById("gpxExportFormat")?.value || "csv";
  handleGenericExport(format, gpxCoordinateStore, "gpxFile");
}

// ==================== Individual GPX File Operations ====================

function deleteIndividualGpxByName(fileName) {
  if (!window.currentGpxDataByName || !window.currentGpxDataByName[fileName]) {
    return;
  }
  
  delete window.currentGpxDataByName[fileName];
  
  // If no more GPX files, clear the backward-compatible reference
  if (Object.keys(window.currentGpxDataByName).length === 0) {
    currentGpxData = null;
    gpxCoordinateStore = [];
  } else {
    // Update currentGpxData to first remaining file for backward compatibility
    const firstFileName = Object.keys(window.currentGpxDataByName)[0];
    currentGpxData = window.currentGpxDataByName[firstFileName];
    gpxCoordinateStore = extractCoordinatesFromGpxGeoJson(currentGpxData);
  }
  
  if (typeof syncUploadUI === 'function') syncUploadUI();
}

function previewIndividualGpx(fileName) {
  if (!window.currentGpxDataByName || !window.currentGpxDataByName[fileName]) {
    alert("GPX file not found");
    return;
  }
  
  const gpxData = window.currentGpxDataByName[fileName];
  const coordinates = extractCoordinatesFromGpxGeoJson(gpxData);
  
  if (!coordinates || coordinates.length === 0) {
    alert("No extractable coordinates found in this GPX file");
    return;
  }
  
  // Discover geometry types
  const geomTypes = new Set();
  if (gpxData.type === "FeatureCollection") {
    gpxData.features.forEach(feature => {
      if (feature.geometry) geomTypes.add(feature.geometry.type);
    });
  }
  
  const displayCount = Math.min(coordinates.length, 10);
  
  let html = `<div class="result-card" style="animation: fadeIn 0.5s ease-out;">
    <h3 style="color: #667eea; margin-bottom: 15px;">🛰️ ${fileName}</h3>
    <div style="margin-bottom: 15px; padding: 12px; background: #f0f7ff; border-left: 3px solid #667eea; border-radius: 4px;">
      <strong style="color: #667eea;">Geometry Types:</strong> ${Array.from(geomTypes).join(', ') || 'Track/Waypoint'} | 
      <strong style="color: #667eea;">Features:</strong> ${coordinates.length}
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Type</th>
            <th>Name</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${coordinates.slice(0, displayCount).map((c, i) => `
            <tr>
              <td>${i + 1}</td>
              <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
              <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
              <td>${c.geometryType || 'Point'}</td>
              <td>${c.name || '-'}</td>
              <td style="font-size: 0.85em;">${c.time ? new Date(c.time).toLocaleTimeString() : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${coordinates.length > displayCount ? `<p style="color: #718096; font-size: 0.85em; margin-top: 10px;">... and ${coordinates.length - displayCount} more features</p>` : ''}
  </div>`;
  
  document.getElementById("gpxResult").innerHTML = html;
  // Show preview modal instead of non-existent "results" tab
  if (typeof showPreviewSection === "function") {
    showPreviewSection("gpx");
  }
}

function showIndividualGpxOnMap(fileName) {
  // Try named lookup first, fall back to combined data
  var gpxData = null;
  
  if (window.currentGpxDataByName && window.currentGpxDataByName[fileName]) {
    gpxData = window.currentGpxDataByName[fileName];
  } else if (currentGpxData && currentGpxData.features && currentGpxData.features.length > 0) {
    gpxData = currentGpxData;
    if (typeof showToast === 'function') showToast("Using combined GPX data for " + fileName, "info");
  } else {
    if (typeof showToast === 'function') showToast('GPX "' + fileName + '" not found', "error");
    return;
  }
  
  if (!gpxData) {
    if (typeof showToast === 'function') showToast("No GPX data available for " + fileName, "error");
    return;
  }
  
  // Switch to map tab
  if (typeof showTab === 'function') showTab('map');
  
  setTimeout(function() {
    if (!map && typeof initMap === 'function') initMap();
    else if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
    
    if (typeof clearMapMarkers === 'function') clearMapMarkers();
    
    var key = 'gpx::' + fileName;
    if (mapVisibleLayers && mapVisibleLayers[key] && map) {
      try { map.removeLayer(mapVisibleLayers[key]); } catch(e) {}
      delete mapVisibleLayers[key];
    }
    
    if (map && typeof L !== 'undefined') {
      var renderer = L.canvas({ padding: 0.5 });
      
      var geoLayer = L.geoJSON(gpxData, {
        renderer: renderer,
        onEachFeature: function(feature, layer) {
          layer.feature = feature;
          if (feature.properties) {
            var props = { ...feature.properties };
            props._gpx = fileName;
            if (feature.geometry && feature.geometry.type) {
              if (feature.geometry.type.indexOf("Polygon") !== -1) props.TYPE = "Polygon";
              else if (feature.geometry.type.indexOf("Line") !== -1) props.TYPE = "Line";
            }
            if (typeof createPremiumPopupHTML === 'function') {
              layer.bindPopup(createPremiumPopupHTML(null, null, props, null), { maxWidth: 350 });
            }
          }
        },
        style: function(feature) {
          return { weight: 2, color: "#27ae60", opacity: 0.8, fillColor: "#27ae60", fillOpacity: 0.3 };
        },
        pointToLayer: function(feature, latlng) {
          if (typeof addDetailedMarker === "function") {
            var m = addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, 1, feature);
            if (m) return m;
          }
          return L.circleMarker(latlng, { radius: 8, fillColor: "#27ae60", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1 });
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
        } catch(e) {}
      }
    }
    
    if (typeof showToast === 'function') showToast("📍 " + fileName + " on map", "success");
  }, 100);
}

// Expose individual functions globally
window.deleteIndividualGpxByName = deleteIndividualGpxByName;
window.previewIndividualGpx = previewIndividualGpx;
window.showIndividualGpxOnMap = showIndividualGpxOnMap;
