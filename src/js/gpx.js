// GPX File Handling Functions

let gpxCoordinateStore = [];
let currentGpxData = null;

function handleGpxUpload(event) {
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  const file = event.target.files[0];
  if (!file) return;

  if (validateFileSize(file)) {
    const clearBtnRow = document.getElementById("gpxClearBtnGroup");
    if (clearBtnRow) clearBtnRow.style.display = "block";
    handleGpxFile(file);
  }
}

function handleGpxFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    showProcessingOverlay("Parsing GPX Data...");
    setTimeout(() => {
      processGpxData(e.target.result, file.name);
      hideProcessingOverlay();
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

    const geoJsonData = toGeoJSON.gpx(gpxDom);
    currentGpxData = geoJsonData;
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

function extractCoordinatesFromGpxGeoJson(geoJson) {
  const coordinates = [];
  let globalIndex = 0;

  if (geoJson.type === "FeatureCollection") {
    geoJson.features.forEach((feature, featureIndex) => {
      const extracted = extractCoordinatesFromGpxFeature(feature, featureIndex, globalIndex);
      coordinates.push(...extracted);
      globalIndex += extracted.length;
    });
  }
  return coordinates;
}

function extractCoordinatesFromGpxFeature(feature, featureIndex, globalStartIndex) {
  const coordinates = [];
  const geometry = feature.geometry;
  const properties = feature.properties || {};

  if (!geometry) return coordinates;

  // Use the same coordinate extraction logic as KML/GeoJSON
  const coords = extractCoordsFromGeometry(geometry);
  coords.forEach((coord, idx) => {
    const propsWithId = { ...properties };
    propsWithId['ObjectID'] = globalStartIndex + idx + 1;
    
    coordinates.push({
      lat: coord[1],
      lng: coord[0],
      properties: propsWithId,
      featureIndex: featureIndex,
      coordIndex: idx,
      geometryType: geometry.type
    });
  });

  return coordinates;
}

function renderGpxSuccessUI(fileName, count) {
  const resultDiv = document.getElementById("gpxResult");
  
  const geomTypes = new Set();
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
          📍 ${count} Coordinates
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
              <th>Name/Desc</th>
            </tr>
          </thead>
          <tbody>
            ${gpxCoordinateStore.slice(0, displayCount).map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
                <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
                <td><span class="badge" style="background: #f1f5f9; color: #475569; font-size: 10px;">${c.geometryType || 'Point'}</span></td>
                <td>${c.properties.name || c.properties.desc || '-'}</td>
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

      <div style="margin-top: 15px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #ff416c; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
        <label style="font-weight: 700; font-size: 0.9em; color: #ff416c;">Export Format:</label>
        ${getExportOptionsHTML('gpx', 'gpxExportFormat')}
        <div style="display: flex; gap: 10px;">
          <button class="btn" onclick="downloadGpxResults()" style="background: #ff416c; color: white; border: none; padding: 10px 20px; font-weight: 700;">📥 Download Results</button>
          <button class="btn btn-primary" onclick="showGpxOnMap()" style="padding: 10px 20px; font-weight: 700;">📍 Show on Map</button>
        </div>
      </div>
    </div>
  `;
  
  resultDiv.innerHTML = html;
}

function showGpxOnMap() {
  if (!gpxCoordinateStore || gpxCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }
  
  showTab('map');
  
  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();
    
    clearMapMarkers();
    
    if (currentGpxData) {
      const renderer = L.canvas({ padding: 0.5 });
      
      const geoLayer = L.geoJSON(currentGpxData, {
        renderer: renderer,
        onEachFeature: function (feature, layer) {
          if (feature.properties) {
            const props = { ...feature.properties };
            if (feature.geometry.type.includes("Line")) props.TYPE = "Track/Route";
            
            const popupContent = createPremiumPopupHTML(null, null, props, null);
            layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' });
          }
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (gpxCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;

          if (typeof addDetailedMarker === "function") {
             addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1);
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

function clearGpxData() {
  gpxCoordinateStore = [];
  currentGpxData = null;
  
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
