// KML/KMZ File Handling Functions

function handleKmlUpload(event) {
  console.log("📁 KML file upload triggered", event);
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

    <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #28a745; display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn btn-success" onclick="showKmlOnMap()" style="padding: 10px 20px; font-weight: 700; flex: 1;">🗺️ Show on Map</button>
    </div>
  </div>`;
  
  resultDiv.innerHTML = html;
}

function showKmlOnMap() {
  if (!kmlCoordinateStore || kmlCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }
  
  // Switch to Map Tab
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  
  const mapTab = document.getElementById("map");
  const mapBtn = document.querySelectorAll(".tab-btn")[3]; // Map tab is the 4th button (index 3)
  mapTab.classList.add("active");
  mapBtn.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  
  setTimeout(() => {
    if (typeof initMap === 'function' && !map) {
      initMap();
    } else if (map) {
      map.invalidateSize();
    }
    
    if (typeof clearMapMarkers === 'function') {
      clearMapMarkers();
    }
    
    // Add GeoJSON layer from KML
    if (currentKmlData) {
      L.geoJSON(currentKmlData, {
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
            fillColor: "#28a745",
            color: "#000",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          });
        }
      }).addTo(map);
    }
    
    // Add individual markers from the coordinate store
    const totalPoints = kmlCoordinateStore.length;
    const skipVertexMarkers = totalPoints > 500;
    
    kmlCoordinateStore.forEach((coord) => {
      if (Math.abs(coord.lat) <= 90 && Math.abs(coord.lng) <= 180) {
        if (typeof addDetailedMarker === 'function') {
          // Only add markers for Points, OR for everything if the dataset is small
          if (!skipVertexMarkers || coord.geometryType === 'Point' || !coord.geometryType) {
            addDetailedMarker(coord.lat, coord.lng, coord.properties, coord.coordIndex + 1);
          }
        }
      }
    });
    
    if (markers.length > 0) {
      setTimeout(() => {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
      }, 200);
    } else {
      // If no markers were added, try to fit to the GeoJSON layer
      const geoJsonLayers = [];
      map.eachLayer(l => { if (l instanceof L.GeoJSON) geoJsonLayers.push(l); });
      if (geoJsonLayers.length > 0) {
        const bounds = L.featureGroup(geoJsonLayers).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
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
