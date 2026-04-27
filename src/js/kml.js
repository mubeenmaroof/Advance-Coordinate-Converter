// KML/KMZ File Handling Functions

function handleKmlUpload(event) {
  console.log("📁 KML file upload triggered", event);
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  const file = event.target.files[0];

  if (!file) return;

  if (validateFileSize(file)) {
    const clearBtnRow = document.getElementById("kmlClearBtnGroup");
    if (clearBtnRow) clearBtnRow.style.display = "block";
    handleKmlFile(file);
  }
}

async function handleKmlFile(file) {
  const isKmz = file.name.toLowerCase().endsWith('.kmz');

  if (isKmz) {
    handleKmzFile(file);
  } else {
    const reader = new FileReader();
    reader.onload = function (e) {
      showProcessingOverlay("Parsing KML Data...");
      setTimeout(() => {
        processKmlData(e.target.result, file.name);
        if (typeof syncUploadUI === 'function') syncUploadUI();
        hideProcessingOverlay();
      }, 100);
    };
    reader.readAsText(file);
  }
}

async function handleKmzFile(file) {
  try {
    showProcessingOverlay("Extracting KMZ Archive...");
    const zip = await JSZip.loadAsync(file);
    const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));

    if (!kmlFile) {
      hideProcessingOverlay();
      throw new Error("No KML file found inside KMZ archive.");
    }

    const kmlContent = await kmlFile.async("string");
    processKmlData(kmlContent, file.name);
    if (typeof syncUploadUI === 'function') syncUploadUI();
    hideProcessingOverlay();
  } catch (error) {
    console.error("❌ Error reading KMZ:", error);
    hideProcessingOverlay();
    document.getElementById("kmlResult").innerHTML =
      `<div class="error">Error reading KMZ file: ${error.message}</div>`;
  }
}

function processKmlData(kmlString, fileName) {
  const resultDiv = document.getElementById("kmlResult");

  try {
    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(kmlString, 'text/xml');

    // Check for parsing errors
    const errorNode = kmlDom.querySelector('parsererror');
    if (errorNode) {
      throw new Error("Invalid KML format.");
    }

    const geoJsonData = toGeoJSON.kml(kmlDom);
    currentKmlData = geoJsonData;
    kmlCoordinateStore = extractCoordinatesFromKmlGeoJson(geoJsonData);

    if (kmlCoordinateStore.length > 0) {
      renderKmlSuccessUI(fileName, kmlCoordinateStore.length);
    } else {
      resultDiv.innerHTML = `<div class="error">❌ No identifiable coordinates found in "${fileName}".</div>`;
    }
  } catch (error) {
    console.error("❌ Error parsing KML:", error);
    resultDiv.innerHTML =
      `<div class="error">Error processing KML: ${error.message}</div>`;
  }
}

function extractCoordinatesFromKmlGeoJson(geoJson) {
  const coordinates = [];
  let globalIndex = 0;

  if (geoJson.type === "FeatureCollection") {
    geoJson.features.forEach((feature, featureIndex) => {
      const extracted = extractCoordinatesFromKmlFeature(feature, featureIndex, globalIndex);
      coordinates.push(...extracted);
      globalIndex += extracted.length;
    });
  } else if (geoJson.type === "Feature") {
    coordinates.push(...extractCoordinatesFromKmlFeature(geoJson, 0, 0));
  }

  return coordinates;
}

function extractCoordinatesFromKmlFeature(feature, featureIndex, globalStartIndex) {
  const coordinates = [];
  const geometry = feature.geometry;
  const properties = feature.properties || {};

  if (!geometry) return coordinates;

  const coords = extractKmlCoordsFromGeometry(geometry);
  coords.forEach((coord, idx) => {
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
      geometryType: geometry.type
    });
  });

  return coordinates;
}

function extractKmlCoordsFromGeometry(geometry) {
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
  } else if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach(geom => {
      coords.push(...extractKmlCoordsFromGeometry(geom));
    });
  }
  return coords;
}

function renderKmlSuccessUI(fileName, count) {
  const resultDiv = document.getElementById("kmlResult");
  const isKmz = fileName.toLowerCase().endsWith('.kmz');
  const format = isKmz ? "KMZ (Compressed KML)" : "KML";

  // Discover all unique property keys and geometry types
  const propertyKeys = new Set();
  const geomTypes = new Set();

  kmlCoordinateStore.forEach(c => {
    if (c.properties) {
      Object.keys(c.properties).forEach(key => {
        if (key !== 'ObjectID') propertyKeys.add(key);
      });
    }
    if (c.geometryType) geomTypes.add(c.geometryType);
  });

  const sortedKeys = Array.from(propertyKeys).sort();
  const displayCount = Math.min(count, 10);

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
          ${kmlCoordinateStore.slice(0, displayCount).map((c, i) => `
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

    <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #28a745; display: flex; gap: 15px; flex-wrap: wrap; align-items: center; justify-content: center;">
      <label style="font-weight: 700; font-size: 0.9em; color: #28a745;">Export Format:</label>
      ${getExportOptionsHTML(isKmz ? 'kmz' : 'kml', 'kmlExportFormat')}
      <div style="display: flex; gap: 10px;">
        <button class="btn" onclick="downloadKmlResults()" style="background: #28a745; color: white; border: none; padding: 10px 20px; font-weight: 700;">📥 Download Results</button>
        <button class="btn btn-success" onclick="showKmlOnMap()" style="padding: 10px 20px; font-weight: 700;">🗺️ Show on Map</button>
      </div>
    </div>
  </div>`;

  resultDiv.innerHTML = html;
}

function showKmlOnMap() {
  if (!kmlCoordinateStore || kmlCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }

  showTab('map');

  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();

    clearMapMarkers();

    // Add GeoJSON layer from KML
    if (currentKmlData) {
      const renderer = L.canvas({ padding: 0.5 });
      
      const geoLayer = L.geoJSON(currentKmlData, {
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
          const serialNumber = (kmlCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;
          
          if (typeof addDetailedMarker === "function") {
             addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1);
             return L.layerGroup(); 
          }

          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: "#28a745",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        },
        style: function(feature) {
          return {
            color: "#28a745",
            weight: 3,
            opacity: 0.8,
            fillColor: "#28a745",
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
    
    if (typeof updateMapStats === 'function') {
      updateMapStats();
    }
  }, 300);
}

function clearKmlData() {
  currentKmlData = null;
  kmlCoordinateStore = [];
  
  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();
  
  const fileInput = document.getElementById("kmlFile");
  if (fileInput) fileInput.value = "";
  const resultDiv = document.getElementById("kmlResult");
  if (resultDiv) resultDiv.innerHTML = "";
  const clearBtnRow = document.getElementById("kmlClearBtnGroup");
  if (clearBtnRow) clearBtnRow.style.display = "none";
}

// expose
window.handleKmlUpload = handleKmlUpload;
window.handleKmlFile = handleKmlFile;
window.showKmlOnMap = showKmlOnMap;
window.clearKmlData = clearKmlData;
window.downloadKmlResults = downloadKmlResults;

function downloadKmlResults() {
  if (!kmlCoordinateStore || kmlCoordinateStore.length === 0) {
    alert("Please load valid KML/KMZ data first.");
    return;
  }
  const format = document.getElementById("kmlExportFormat")?.value || "csv";
  handleGenericExport(format, kmlCoordinateStore, "kmlFile");
}
