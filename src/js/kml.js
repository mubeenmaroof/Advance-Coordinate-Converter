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
      showProcessingOverlay("Parsing KML Data...", 10);
      setTimeout(() => {
        updateProcessingProgress(50);
        processKmlData(e.target.result, file.name);
        updateProcessingProgress(90);
        if (typeof syncUploadUI === 'function') syncUploadUI();
        updateProcessingProgress(100);
        setTimeout(() => hideProcessingOverlay(), 200);
      }, 100);
    };
    reader.readAsText(file);
  }
}

async function handleKmzFile(file) {
  try {
    showProcessingOverlay("Extracting KMZ Archive...", 5);
    const zip = await JSZip.loadAsync(file);
    updateProcessingProgress(30);

    const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));

    if (!kmlFile) {
      hideProcessingOverlay();
      throw new Error("No KML file found inside KMZ archive.");
    }

    updateProcessingProgress(50);
    const kmlContent = await kmlFile.async("string");
    updateProcessingProgress(70);

    processKmlData(kmlContent, file.name);
    updateProcessingProgress(90);

    if (typeof syncUploadUI === 'function') syncUploadUI();
    updateProcessingProgress(100);
    setTimeout(() => hideProcessingOverlay(), 200);
  } catch (error) {
    console.error("❌ Error reading KMZ:", error);
    hideProcessingOverlay();
    document.getElementById("kmlResult").innerHTML =
      `<div class="error">Error reading KMZ file: ${error.message}</div>`;
  }
}

/**
 * Extracts key-value pairs from an HTML table (common in KML descriptions)
 */
function extractPropertiesFromHtml(html) {
  if (!html || typeof html !== 'string') return {};
  const props = {};
  
  // Basic check for table-like structure
  if (!html.includes('<table') && !html.includes('<tr')) {
    // If no table, try simple key: value patterns in lines
    const lines = html.split(/<br\s*\/?>|\n/i);
    lines.forEach(line => {
      const text = line.replace(/<[^>]*>/g, '').trim();
      const match = text.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim();
        if (key && val) props[key] = val;
      }
    });
    return props;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('tr');
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        // Option A: Key in cells[0], Value in cells[1]
        let key = cells[0].textContent.trim().replace(/:$/, '');
        let val = cells[1].textContent.trim();
        
        // Option B: If cells[0] is empty but cells[1] has a colon (rare but happens)
        if (!key && val.includes(':')) {
           const parts = val.split(':');
           key = parts[0].trim();
           val = parts.slice(1).join(':').trim();
        }

        if (key && val !== undefined && val !== null && key.length > 0) {
          props[key] = val;
        }
      } else if (cells.length === 1) {
        // Some KMLs have Key and Value in the same cell separated by :
        const text = cells[0].textContent.trim();
        const match = text.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          if (key && val) props[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn("Could not parse HTML properties from description", e);
  }
  return props;
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
    
    // ENHANCEMENT: Extract attributes from HTML description tables and flatten ExtendedData
    if (geoJsonData.features) {
      geoJsonData.features.forEach(feature => {
        // 1. Flatten ExtendedData if present (toGeoJSON sometimes nests it)
        if (feature.properties && feature.properties.ExtendedData) {
          const extData = feature.properties.ExtendedData;
          for (const [key, val] of Object.entries(extData)) {
            // Flatten SimpleData if it's nested as { value: x }
            const cleanVal = (val && typeof val === 'object' && val.value !== undefined) ? val.value : val;
            feature.properties[key] = cleanVal;
          }
          delete feature.properties.ExtendedData;
        }

        // 2. Parse HTML Description (overwriting existing fields as requested)
        if (feature.properties && feature.properties.description) {
          const htmlProps = extractPropertiesFromHtml(feature.properties.description);
          for (const [key, val] of Object.entries(htmlProps)) {
            feature.properties[key] = val;
          }
        }
      });
    }

    currentKmlData = geoJsonData;
    currentKmlData._sourceFileName = fileName;
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
      const extracted = extractCoordinatesFromKmlFeature(feature, featureIndex, coordinates.length);
      coordinates.push(...extracted);
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
      geometry: geometry // Store original geometry for full-fidelity export
    });
  }

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

  const categoryCounts = getKmlCategoryCounts(currentKmlData);
  const categorySelectionHtml = renderKmlCategoryCheckboxes(categoryCounts);
  const hasAnyData = Object.values(categoryCounts).some(value => value > 0);

  let html = `<div class="result">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
      <div>
        <h3 style="margin: 0;">✅ ${fileName}</h3>
        <p style="margin: 5px 0; color: #666;">
          Format: <b>${format}</b> | 
          Types: <b>${Array.from(geomTypes).join(', ') || 'N/A'}</b>
        </p>
        <div style="margin-top: 12px; padding: 12px; background: ${hasAnyData ? '#f0f7ff' : '#fff3cd'}; border-left: 3px solid ${hasAnyData ? '#667eea' : '#ffc107'}; border-radius: 4px; font-size: 0.95em;">
          <strong style="color: ${hasAnyData ? '#667eea' : '#856404'};">📋 Geometry Categories Found:</strong>
          <div style="margin-top: 8px;">${categorySelectionHtml}</div>
          <div style="background: rgba(102, 126, 234, 0.1); color: #667eea; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.85em; margin-top: 10px; display: inline-block;">
            📍 ${count} Features
          </div>
        </div>
      </div>
    </div>

    <div class="table-container" style="max-height: 400px; overflow: auto;">
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
          ${kmlCoordinateStore.slice(0, displayCount).map((c, i) => `
            <tr>
              <td>${i + 1}</td>
              <td style="font-family: monospace;">${c.lat.toFixed(6)}</td>
              <td style="font-family: monospace;">${c.lng.toFixed(6)}</td>
              <td><span class="badge" style="background: #f1f5f9; color: #475569; font-size: 10px;">${c.geometryType}</span></td>
              ${sortedKeys.map(key => `<td>${c.properties && c.properties[key] !== undefined ? (typeof c.properties[key] === 'object' ? JSON.stringify(c.properties[key]) : c.properties[key]) : '-'}</td>`).join('')}
            </tr>
          `).join('')}
          ${count > displayCount ? `<tr><td colspan="${sortedKeys.length + 4}" style="text-align: center; padding: 15px; background: #f8f9fa; font-style: italic; color: #666;">Showing first ${displayCount} of ${count} features. Use "Show on Map" to see all spatial data.</td></tr>` : ''}
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

function getKmlCategoryCounts(geoJson) {
  const counts = {
    Points: 0,
    Lines: 0,
    Polygons: 0
  };

  if (!geoJson) {
    console.warn("[KML] No geoJson data to count categories");
    return counts;
  }

  let features = [];
  if (geoJson.type === 'FeatureCollection' && Array.isArray(geoJson.features)) {
    features = geoJson.features;
  } else if (geoJson.type === 'Feature') {
    features = [geoJson];
  }

  if (features.length === 0) {
    console.warn("[KML] No features found in geoJson");
    return counts;
  }

  features.forEach(feature => {
    const geom = feature.geometry;
    if (!geom || !geom.type) return;

    if (['Point', 'MultiPoint'].includes(geom.type)) {
      counts.Points += 1;
    } else if (['LineString', 'MultiLineString'].includes(geom.type)) {
      counts.Lines += 1;
    } else if (['Polygon', 'MultiPolygon'].includes(geom.type)) {
      counts.Polygons += 1;
    } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries) && geom.geometries.length > 0) {
      // Count based on the first valid sub-geometry
      const sub = geom.geometries[0];
      if (sub && sub.type) {
        if (['Point', 'MultiPoint'].includes(sub.type)) counts.Points += 1;
        else if (['LineString', 'MultiLineString'].includes(sub.type)) counts.Lines += 1;
        else if (['Polygon', 'MultiPolygon'].includes(sub.type)) counts.Polygons += 1;
      }
    }
  });

  console.log("[KML] Category counts:", counts);
  return counts;
}

function renderKmlCategoryCheckboxes(counts) {
  const categories = ['Points', 'Lines', 'Polygons'];
  return `<div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 8px; padding: 8px 0;">${categories.map(category => {
      const count = counts[category] || 0;
      const isDisabled = count === 0;
      return `<label style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: ${isDisabled ? '#999' : '#111'}; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; opacity: ${isDisabled ? '0.5' : '1'};">
        <input type="checkbox" name="kmlExportCategory" value="${category}" ${count > 0 ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'};" />
        <span>${category} (${count})</span>
      </label>`;
    }).join('')}</div>`;
}

function getCategoriesForFeature(feature) {
  if (!feature || !feature.geometry || !feature.geometry.type) return [];
  const type = feature.geometry.type;
  if (type === 'Point' || type === 'MultiPoint') return ['Points'];
  if (type === 'LineString' || type === 'MultiLineString') return ['Lines'];
  if (type === 'Polygon' || type === 'MultiPolygon') return ['Polygons'];
  if (type === 'GeometryCollection' && Array.isArray(feature.geometry.geometries)) {
    const found = new Set();
    feature.geometry.geometries.forEach(sub => {
      if (!sub || !sub.type) return;
      if (['Point', 'MultiPoint'].includes(sub.type)) found.add('Points');
      else if (['LineString', 'MultiLineString'].includes(sub.type)) found.add('Lines');
      else if (['Polygon', 'MultiPolygon'].includes(sub.type)) found.add('Polygons');
    });
    return Array.from(found);
  }
  return [];
}

function filterKmlFeaturesByCategories(featureCollection, categories) {
  if (!featureCollection || featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const selected = new Set(categories);
  const filtered = featureCollection.features.filter(feature => {
    return getCategoriesForFeature(feature).some(cat => selected.has(cat));
  });

  return { type: 'FeatureCollection', features: filtered };
}

function kmlFeatureCollectionToDataStore(featureCollection) {
  const result = [];
  if (!featureCollection || featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
    return result;
  }

  featureCollection.features.forEach((feature, featureIndex) => {
    const coords = [];
    const geom = feature.geometry;
    if (!geom || !geom.type) return;

    if (geom.type === 'Point') {
      coords.push(geom.coordinates);
    } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
      coords.push(...geom.coordinates);
    } else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
      geom.coordinates.forEach(item => coords.push(...item));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(polygon => {
        polygon.forEach(ring => coords.push(...ring));
      });
    } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      geom.geometries.forEach(sub => {
        if (!sub || !sub.type || !sub.coordinates) return;
        if (sub.type === 'Point') coords.push(sub.coordinates);
        else if (sub.type === 'MultiPoint' || sub.type === 'LineString') coords.push(...sub.coordinates);
        else if (sub.type === 'MultiLineString' || sub.type === 'Polygon') sub.coordinates.forEach(item => coords.push(...item));
        else if (sub.type === 'MultiPolygon') sub.coordinates.forEach(polygon => polygon.forEach(ring => coords.push(...ring)));
      });
    }

    coords.forEach(coord => {
      if (Array.isArray(coord) && coord.length >= 2) {
        result.push({
          lat: coord[1],
          lng: coord[0],
          properties: feature.properties || {},
          rowIndex: featureIndex + 1
        });
      }
    });
  });

  return result;
}

function exportKmlCategory(format, featureCollection, customFileName) {
  if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
    console.error('[KML Export] Empty feature collection or missing features');
    alert(`No features available in ${customFileName}`);
    return;
  }

  console.log(`[KML Export] Exporting ${featureCollection.features.length} features as ${format}: ${customFileName}`);

  try {
    if (format === 'csv' || format === 'xlsx') {
      const dataStore = kmlFeatureCollectionToDataStore(featureCollection);
      if (dataStore.length === 0) {
        console.error('[KML Export] No dataStore rows generated from features');
        alert(`No rows available for export.`);
        return;
      }
      console.log(`[KML Export] Generated ${dataStore.length} rows for CSV/XLSX export`);
      handleGenericExport(format, dataStore, 'kmlFile', customFileName);
      return;
    }

    if (format === 'geojson' && window.exportToGeoJSON) {
      console.log('[KML Export] Calling exportToGeoJSON');
      window.exportToGeoJSON(featureCollection, customFileName);
      return;
    }

    if (format === 'json' && window.exportToJSON) {
      console.log('[KML Export] Calling exportToJSON');
      window.exportToJSON(featureCollection, customFileName);
      return;
    }

    if (format === 'kml' && window.exportToKML) {
      console.log('[KML Export] Calling exportToKML');
      window.exportToKML(featureCollection, customFileName);
      return;
    }

    if (format === 'kmz' && window.exportToKMZ) {
      console.log('[KML Export] Calling exportToKMZ');
      window.exportToKMZ(featureCollection, customFileName);
      return;
    }

    if (format === 'shp' && window.exportToShp) {
      console.log('[KML Export] Calling exportToShp');
      window.exportToShp(featureCollection, customFileName);
      return;
    }

    console.error(`[KML Export] Unsupported format: ${format}`);
    alert(`Unsupported export format: ${format}`);
  } catch (error) {
    console.error('[KML Export] Error during export:', error);
    alert(`Export failed: ${error.message}`);
  }
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
          // Add non-point features to importedLayers for selection and export
          if (importedLayers && !(layer instanceof L.Marker)) {
            importedLayers.addLayer(layer);
          }
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (kmlCoordinateStore.findIndex(c => c.lat === latlng.lat && c.lng === latlng.lng)) + 1;
          
          if (typeof addDetailedMarker === "function") {
             const marker = addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber || 1);
             if (marker) importedLayers.addLayer(marker);
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
  if (!currentKmlData || !currentKmlData.features || currentKmlData.features.length === 0) {
    alert("Please load valid KML/KMZ data first.");
    return;
  }

  const format = document.getElementById("kmlExportFormat")?.value || "csv";
  const selectedCategories = Array.from(document.querySelectorAll('input[name="kmlExportCategory"]:checked')).map(el => el.value);

  console.log("[KML Download] Format:", format);
  console.log("[KML Download] Selected categories:", selectedCategories);
  console.log("[KML Download] Total features in currentKmlData:", currentKmlData.features.length);

  if (selectedCategories.length === 0) {
    alert("Please select at least one category to export.");
    return;
  }

  console.log("[KML Download] Starting export...");

  selectedCategories.forEach(category => {
    const filtered = filterKmlFeaturesByCategories(currentKmlData, [category]);
    console.log(`[KML Download] Filtered ${category}:`, filtered.features.length, "features");
    
    if (filtered.features.length === 0) {
      console.warn(`[KML Download] No features found for category: ${category}`);
      return;
    }

    const cleanBase = fileNameWithoutExtension(currentKmlData._sourceFileName || "kml_export");
    const suffix = category.toLowerCase();
    const extension = format === 'kmz' ? 'kmz' : format === 'geojson' ? 'geojson' : format === 'json' ? 'json' : format;
    const customFileName = `${cleanBase}_${suffix}.${extension}`;
    console.log(`[KML Download] Calling exportKmlCategory for ${category}:`, customFileName);
    exportKmlCategory(format, filtered, customFileName);
  });
}

function fileNameWithoutExtension(name) {
  return name ? name.replace(/\.[^.]+$/, '') : 'export';
}
