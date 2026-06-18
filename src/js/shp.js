// Shapefile (.zip) File Handling Functions

let shpProgressPulseInterval = null;
let shpProgressPulseValue = 0;
let shpProgressPulseMax = 90;
let shpWorkerTimeout = null;

function startShpProgressPulse(startValue = 20, maxValue = 90) {
  stopShpProgressPulse();
  shpProgressPulseValue = Math.max(0, Math.min(100, startValue));
  shpProgressPulseMax = Math.min(100, Math.max(startValue, maxValue));
  updateProcessingProgress(shpProgressPulseValue);

  shpProgressPulseInterval = setInterval(() => {
    if (shpProgressPulseValue >= shpProgressPulseMax) {
      clearInterval(shpProgressPulseInterval);
      shpProgressPulseInterval = null;
      return;
    }
    shpProgressPulseValue += 1;
    updateProcessingProgress(shpProgressPulseValue);
  }, 200);
}

function stopShpProgressPulse() {
  if (shpProgressPulseInterval) {
    clearInterval(shpProgressPulseInterval);
    shpProgressPulseInterval = null;
  }
}

function startShpWorkerTimeout(delay = 45000) {
  stopShpWorkerTimeout();
  shpWorkerTimeout = setTimeout(() => {
    showProcessingOverlay('Still processing the shapefile, please wait...', shpProgressPulseValue);
    startShpProgressPulse(shpProgressPulseValue, 96);
  }, delay);
}

function stopShpWorkerTimeout() {
  if (shpWorkerTimeout) {
    clearTimeout(shpWorkerTimeout);
    shpWorkerTimeout = null;
  }
}

function handleShpWorkerError(errorMessage) {
  stopShpProgressPulse();
  stopShpWorkerTimeout();
  hideProcessingOverlay();
  showToast(`Shapefile processing failed: ${errorMessage}`, 'error');
}

function handleShpUpload(event) {
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  const files = event.target.files;
  if (!files || files.length === 0) return;

  handleShpFiles(files);
}

async function handleShpFiles(files) {
  const dropZone = document.getElementById("cardShp");
  const shpResult = document.getElementById("shpResult");
  const clearBtnGroup = document.getElementById("shpClearBtnGroup");

  console.log("📦 Multi-file Shapefile processing triggered", files.length, "files");

  try {
    // Group files by base name (filename without extension)
    const fileGroups = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const nameParts = f.name.split('.');
      const ext = nameParts.pop().toLowerCase();
      const baseName = nameParts.join('.');

      if (!fileGroups[baseName]) {
        fileGroups[baseName] = {};
      }
      fileGroups[baseName][ext] = f;
    }

    console.log("📦 File groups identified:", Object.keys(fileGroups));

    // Find complete shapefile sets (must have .shp, .dbf, .shx, .prj)
    const required = ['shp', 'dbf', 'shx', 'prj'];
    const completeGroups = [];
    const incompleteGroups = [];

    Object.entries(fileGroups).forEach(([baseName, group]) => {
      const missing = required.filter(ext => !group[ext]);
      if (missing.length === 0) {
        completeGroups.push({ baseName, files: group });
      } else {
        incompleteGroups.push({ baseName, missing });
      }
    });

    if (completeGroups.length === 0) {
      const errorMsg = incompleteGroups.length > 0
        ? `No complete shapefile sets found. Incomplete sets: ${incompleteGroups.map(g => `${g.baseName} (missing: .${g.missing.join(', .')})`).join('; ')}`
        : 'No shapefile components found.';

      if (shpResult) {
        shpResult.innerHTML = `<div class="error" style="color: #e53e3e; background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin-top: 15px;">
          <strong>Missing required components:</strong> ${errorMsg} <br>
          <small>Each shapefile needs all four files (.shp, .dbf, .shx, .prj) with matching base names.</small>
        </div>`;
      }
      return;
    }

    console.log(`📦 Processing ${completeGroups.length} complete shapefile set(s)`);

    showProcessingOverlay(`Reading ${completeGroups.length} Shapefile set(s)...`, 10);
    updateProcessingProgress(10);

    // Process each complete shapefile set
    const allGeoJsonFeatures = [];
    let processedCount = 0;

    for (const group of completeGroups) {
      try {
        console.log(`📦 Processing shapefile: ${group.baseName}`);

        const buffers = {};
        const promises = required.map(ext => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              buffers[ext] = e.target.result;
              resolve();
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(group.files[ext]);
          });
        });

        await Promise.all(promises);

        showProcessingOverlay(`Offloading ${group.baseName} to GIS Worker...`, 20);
        startShpProgressPulse(20, 88);
        startShpWorkerTimeout(45000);

        // Create GIS Worker for this shapefile (with cache buster)
        const workerUrl = 'src/js/gisWorker.js?v=20260508_04';
        const gisWorker = new Worker(workerUrl);

        // Process this shapefile
        const geojson = await new Promise((resolve, reject) => {
          const transferableBuffers = Object.values(buffers).filter(b => b instanceof ArrayBuffer);

          gisWorker.postMessage({
            type: 'parseShp',
            buffers: buffers
          }, transferableBuffers);

          gisWorker.onmessage = function (e) {
            const { type, geojson, message, error } = e.data;

            if (type === 'status') {
              showProcessingOverlay(`${group.baseName}: ${message}`, shpProgressPulseValue);
            } else if (type === 'error') {
              gisWorker.terminate();
              reject(new Error(error || 'Unknown worker error'));
            } else if (type === 'complete') {
              gisWorker.terminate();
              resolve(geojson);
            }
          };

          gisWorker.onerror = function (err) {
            console.error("Worker Error:", err);
            gisWorker.terminate();
            reject(new Error(err.message || 'GIS worker error'));
          };
        });

        // Add features from this shapefile to the combined result
        const collections = Array.isArray(geojson) ? geojson : [geojson];
        collections.forEach(collection => {
          if (collection.features) {
            // Add source file info to each feature
            collection.features.forEach(feature => {
              feature.properties = feature.properties || {};
              feature.properties._sourceFile = group.baseName + '.shp';
            });
            allGeoJsonFeatures.push(...collection.features);
          }
        });

        processedCount++;
        const progress = Math.floor(20 + (processedCount / completeGroups.length) * 70);
        updateProcessingProgress(progress);
        showProcessingOverlay(`Processed ${processedCount}/${completeGroups.length} shapefiles...`, progress);


        console.log(`📦 Completed shapefile ${group.baseName}, features:`, collections.reduce((sum, c) => sum + (c.features ? c.features.length : 0), 0));

      } catch (err) {
        console.error(`❌ Error processing shapefile ${group.baseName}:`, err);
        showToast(`Failed to process ${group.baseName}: ${err.message}`, 'error');
        // Continue with other shapefiles
      }
    }

    if (allGeoJsonFeatures.length === 0) {
      throw new Error('No valid features found in any of the shapefiles');
    }

    // Create combined GeoJSON
    const combinedGeoJson = {
      type: 'FeatureCollection',
      features: allGeoJsonFeatures
    };

    stopShpProgressPulse();
    stopShpWorkerTimeout();
    updateProcessingProgress(100);
    
    // Store individual shapefiles separately
    if (!window.currentShpDataByName) {
      window.currentShpDataByName = {};
    }
    
    // Store each shapefile's features separately
    completeGroups.forEach(group => {
      const groupFeatures = allGeoJsonFeatures.filter(f => f.properties?._sourceFile === group.baseName + '.shp');
      if (groupFeatures.length > 0) {
        window.currentShpDataByName[group.baseName] = {
          type: 'FeatureCollection',
          features: groupFeatures,
          _sourceFile: group.baseName + '.shp'
        };
      }
    });
    
    // Keep combined data for backward compatibility
    currentShpData = combinedGeoJson;
    currentShpData._sourceFileName = `${completeGroups.length} shapefile(s)`;
    currentShpData._completeGroups = completeGroups.map(g => g.baseName);
    
    processShpData(combinedGeoJson);
    if (typeof syncUploadUI === 'function') syncUploadUI();

    // Update UI (with null checks)
    const shapefileNames = completeGroups.map(g => g.baseName).join(', ');
    // Keep the card at its default state - don't update dropZone text
    if (document.getElementById("shpTopClearBtnGroup")) document.getElementById("shpTopClearBtnGroup").style.display = "block";
    if (document.getElementById("shpBottomActionBtnGroup")) document.getElementById("shpBottomActionBtnGroup").style.display = "block";
    hideProcessingOverlay();
    showToast(`✓ Loaded: ${shapefileNames} (${allGeoJsonFeatures.length} features)`, "success");

  } catch (err) {
    console.error("❌ Error parsing Shapefile components:", err);
    hideProcessingOverlay();
    stopShpProgressPulse();
    stopShpWorkerTimeout();
    if (shpResult) {
      shpResult.innerHTML = `<div class="error" style="color: #e53e3e; background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin-top: 15px;">
        <strong>Error processing shapefiles:</strong> ${err.message}. <br>
      </div>`;
    }
  }
}

function processShpData(geojson) {
  shpCoordinateStore = [];

  // shpjs might return an array of FeatureCollections if multiple shps are in zip
  const collections = Array.isArray(geojson) ? geojson : [geojson];

  let featureIndex = 0;
  collections.forEach(collection => {
    if (collection.features) {
      collection.features.forEach(feature => {
        const properties = feature.properties || {};
        const geometry = feature.geometry;

        if (!geometry) return;

        // For Points, add them to the store
        if (geometry.type === "Point") {
          shpCoordinateStore.push({
            lat: geometry.coordinates[1],
            lng: geometry.coordinates[0],
            properties: properties,
            geometryType: geometry.type,
            featureIndex: featureIndex,
            coordIndex: 0,
            geometry: geometry // Preserve original geometry
          });
        }
        // For shapes, use the optimized representative point drill-down
        else {
          const repPoint = getRepresentativePoint(geometry);
          if (repPoint) {
            shpCoordinateStore.push({
              lat: repPoint[1],
              lng: repPoint[0],
              properties: properties,
              geometryType: geometry.type,
              featureIndex: featureIndex,
              coordIndex: 0,
              isVertex: true,
              geometry: geometry // Preserve original geometry
            });
          }
        }
        featureIndex++;
      });
    }
  });

  renderShpPreview();
}


function extractCoordinatesFromShp(geometry) {
  const coords = [];
  if (!geometry || !geometry.coordinates) return coords;

  if (geometry.type === "Point") {
    coords.push(geometry.coordinates);
  } else if (geometry.type === "LineString" || geometry.type === "MultiPoint") {
    coords.push(...geometry.coordinates);
  } else if (geometry.type === "Polygon" || geometry.type === "MultiLineString") {
    geometry.coordinates.forEach(part => {
      if (Array.isArray(part)) coords.push(...part);
    });
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach(poly => {
      if (Array.isArray(poly)) {
        poly.forEach(ring => {
          if (Array.isArray(ring)) coords.push(...ring);
        });
      }
    });
  }
  return coords;
}

function renderShpPreview() {
  const shpResult = document.getElementById("shpResult");
  if (!shpResult) return;

  if (shpCoordinateStore.length === 0) {
    shpResult.innerHTML = "<p style='padding: 20px; text-align: center; color: #64748b;'>No features found in Shapefile.</p>";
    return;
  }

  // Discover all unique property keys and geometry types
  const propertyKeys = new Set();
  const geomTypes = new Set();
  shpCoordinateStore.forEach(c => {
    if (c.properties) {
      Object.keys(c.properties).forEach(key => propertyKeys.add(key));
    }
    if (c.geometryType) geomTypes.add(c.geometryType);
  });

  const sortedKeys = Array.from(propertyKeys).sort();
  const displayCount = Math.min(shpCoordinateStore.length, 10);

  const categoryCounts = getShpCategoryCounts(currentShpData);
  const categorySelectionHtml = renderShpCategoryCheckboxes(categoryCounts);
  const hasAnyData = Object.values(categoryCounts).some(value => value > 0);

  let html = `
    <div class="result">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <div>
          <h4 style="margin: 0; color: #28a745;">📦 Shapefile Preview</h4>
          <p style="margin: 5px 0; color: #666;">
            Features: <b>${shpCoordinateStore.length}</b> | 
            Displaying: <b>First ${displayCount} records</b>
          </p>
          <div style="margin-top: 12px; padding: 12px; background: ${hasAnyData ? '#f0f7ff' : '#fff3cd'}; border-left: 3px solid ${hasAnyData ? '#667eea' : '#ffc107'}; border-radius: 4px; font-size: 0.95em;">
            <strong style="color: ${hasAnyData ? '#667eea' : '#856404'};">📋 Geometry Categories Found:</strong>
            <div style="margin-top: 8px;">${categorySelectionHtml}</div>
          </div>
        </div>
      </div>

      <div class="table-container" style="max-height: 400px; overflow: auto; border: 1px solid #eee; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">#</th>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">Lat</th>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">Lng</th>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">Type</th>
              ${sortedKeys.map(key => `<th style="background: #28a745; color: white; padding: 10px; text-align: left;">${key}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${shpCoordinateStore.slice(0, displayCount).map((c, i) => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${i + 1}</td>
                <td style="padding: 10px; font-family: monospace;">${c.lat.toFixed(6)}</td>
                <td style="padding: 10px; font-family: monospace;">${c.lng.toFixed(6)}</td>
                <td style="padding: 10px;"><span class="badge" style="background: #e9ecef; color: #495057;">${c.geometryType}</span></td>
                ${sortedKeys.map(key => `<td style="padding: 10px;">${c.properties && c.properties[key] !== undefined ? c.properties[key] : ''}</td>`).join('')}
              </tr>
            `).join('')}
            ${shpCoordinateStore.length > displayCount ? `<tr><td colspan="${sortedKeys.length + 4}" style="text-align: center; padding: 15px; background: #f8f9fa; font-style: italic; color: #666;">Showing first ${displayCount} of ${shpCoordinateStore.length} rows. Use "Show on Map" to see all spatial data.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;

  shpResult.innerHTML = html;

  // Populate the static button group's export options
  const placeholder = document.getElementById("shpExportFormatPlaceholder");
  if (placeholder && typeof getExportOptionsHTML === 'function') {
    placeholder.innerHTML = getExportOptionsHTML('shp', 'shpExportFormat');
  }
}

function getShpCategoryCounts(geoJson) {
  const counts = {
    Points: 0,
    Lines: 0,
    Polygons: 0
  };

  if (!geoJson) {
    console.warn("[SHP] No geoJson data to count categories");
    return counts;
  }

  let features = [];
  const collections = Array.isArray(geoJson) ? geoJson : [geoJson];
  collections.forEach(collection => {
    if (collection.type === 'FeatureCollection' && Array.isArray(collection.features)) {
      features = features.concat(collection.features);
    } else if (collection.type === 'Feature') {
      features.push(collection);
    }
  });

  if (features.length === 0) {
    console.warn("[SHP] No features found in geoJson");
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
      // For GeometryCollection, count based on the first valid sub-geometry to avoid "exceeded" counts
      const sub = geom.geometries[0];
      if (sub && sub.type) {
        if (['Point', 'MultiPoint'].includes(sub.type)) counts.Points += 1;
        else if (['LineString', 'MultiLineString'].includes(sub.type)) counts.Lines += 1;
        else if (['Polygon', 'MultiPolygon'].includes(sub.type)) counts.Polygons += 1;
      }
    }
  });

  console.log("[SHP] Category counts:", counts);
  return counts;
}

function renderShpCategoryCheckboxes(counts) {
  const categories = ['Points', 'Lines', 'Polygons'];
  return `<div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 8px; padding: 8px 0;">${categories.map(category => {
      const count = counts[category] || 0;
      const isDisabled = count === 0;
      return `<label style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: ${isDisabled ? '#999' : '#111'}; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; opacity: ${isDisabled ? '0.5' : '1'};">
        <input type="checkbox" name="shpExportCategory" value="${category}" ${count > 0 ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'};" />
        <span>${category} (${count})</span>
      </label>`;
    }).join('')}</div>`;
}

function getCategoriesForShpFeature(feature) {
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

function filterShpFeaturesByCategories(featureCollection, categories) {
  if (!featureCollection || featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const selected = new Set(categories);
  const filtered = featureCollection.features.filter(feature => {
    return getCategoriesForShpFeature(feature).some(cat => selected.has(cat));
  });

  return { type: 'FeatureCollection', features: filtered };
}

function downloadShpResults() {
  if (!currentShpData || !currentShpData.features || currentShpData.features.length === 0) {
    alert("No shapefile data available to download.");
    return;
  }

  const exportSelect = document.getElementById('shpExportFormat');
  const format = exportSelect ? exportSelect.value : 'shp';

  const selectedCategories = Array.from(document.querySelectorAll('input[name="shpExportCategory"]:checked')).map(input => input.value);
  let featureCollectionToExport = currentShpData;

  if (selectedCategories.length > 0) {
    featureCollectionToExport = filterShpFeaturesByCategories(currentShpData, selectedCategories);
  }

  const baseName = currentShpData._sourceFileName ? fileNameWithoutExtension(currentShpData._sourceFileName) : 'shapefile_export';
  const customFileName = `${baseName}_${new Date().toISOString().replace(/[:.]/g, '-')}`;

  exportShpCategory(format, featureCollectionToExport, customFileName);
}

function shpFeatureCollectionToDataStore(featureCollection) {
  const result = [];
  if (!featureCollection || featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
    return result;
  }

  featureCollection.features.forEach((feature, featureIndex) => {
    const properties = feature.properties || {};
    const geometry = feature.geometry;

    if (!geometry) return;

    // For Points, add them to the store
    if (geometry.type === "Point") {
      result.push({
        lat: geometry.coordinates[1],
        lng: geometry.coordinates[0],
        properties: properties,
        geometryType: geometry.type,
        featureIndex: featureIndex,
        coordIndex: 0
      });
    }
    // For shapes, use the optimized representative point drill-down
    else {
      const repPoint = getRepresentativePoint(geometry);
      if (repPoint) {
        result.push({
          lat: repPoint[1],
          lng: repPoint[0],
          properties: properties,
          geometryType: geometry.type,
          featureIndex: featureIndex,
          coordIndex: 0,
          isVertex: true
        });
      }
    }
  });

  return result;
}

function exportShpCategory(format, featureCollection, customFileName) {
  console.log(`[SHP Export] Starting export for format: ${format}, filename: ${customFileName}`);
  if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
    console.error('[SHP Export] Empty feature collection or missing features');
    alert(`No features available in ${customFileName}`);
    return;
  }

  console.log(`[SHP Export] Exporting ${featureCollection.features.length} features as ${format}: ${customFileName}`);

  try {
    if (format === 'csv' || format === 'xlsx') {
      console.log(`[SHP Export] Processing ${format.toUpperCase()} export`);
      const dataStore = shpFeatureCollectionToDataStore(featureCollection);
      if (dataStore.length === 0) {
        console.error('[SHP Export] No dataStore rows generated from features');
        alert(`No rows available for export.`);
        return;
      }
      console.log(`[SHP Export] Generated ${dataStore.length} rows for CSV/XLSX export`);
      console.log(`[SHP Export] Calling handleGenericExport with inputId: shpFile`);
      handleGenericExport(format, dataStore, 'shpFile', customFileName);
      return;
    }

    if (format === 'geojson' && window.exportToGeoJSON) {
      console.log('[SHP Export] Calling exportToGeoJSON');
      window.exportToGeoJSON(featureCollection, customFileName);
      return;
    }

    if (format === 'json' && window.exportToJSON) {
      console.log('[SHP Export] Calling exportToJSON');
      window.exportToJSON(featureCollection, customFileName);
      return;
    }

    if (format === 'kml' && window.exportToKML) {
      console.log('[SHP Export] Calling exportToKML');
      window.exportToKML(featureCollection, customFileName);
      return;
    }

    if (format === 'kmz' && window.exportToKMZ) {
      console.log('[SHP Export] Calling exportToKMZ');
      window.exportToKMZ(featureCollection, customFileName);
      return;
    }

    if (format === 'shp' && window.exportToShp) {
      console.log('[SHP Export] Calling exportToShp');
      window.exportToShp(featureCollection, customFileName);
      return;
    }

    console.error(`[SHP Export] Unsupported format: ${format}`);
    alert(`Unsupported export format: ${format}`);
  } catch (error) {
    console.error('[SHP Export] Error during export:', error);
    alert(`Export failed: ${error.message}`);
  }
}

function showShpOnMap() {
  if (!shpCoordinateStore || shpCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }

  closeModal('previewModal');
  showTab('map');

  const totalFeatures = shpCoordinateStore.length;
  showProcessingOverlay(`Preparing ${totalFeatures} features...`, 0);

  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();

    clearMapMarkers();

    const collections = Array.isArray(currentShpData) ? currentShpData : [currentShpData];
    const renderer = L.canvas({ padding: 0.5 });

    // Use the global importedLayers group so export tools can find these features
    const mainLayerGroup = importedLayers;

    const allFeatures = [];
    collections.forEach(col => {
      if (col.features) allFeatures.push(...col.features);
    });

    // Performance settings
    const baseChunkSize = 200;
    let currentIndex = 0;
    let startTime = Date.now();

    function renderNextChunk() {
      const chunkStartTime = Date.now();
      const nextEnd = Math.min(currentIndex + baseChunkSize, allFeatures.length);
      const chunkFeatures = allFeatures.slice(currentIndex, nextEnd);

      const chunkCollection = {
        type: "FeatureCollection",
        features: chunkFeatures
      };

      L.geoJSON(chunkCollection, {
        renderer: renderer,
        onEachFeature: function (feature, layer) {
          // Store the feature data on the layer for selection purposes
          layer.feature = feature;
          
          // Optimized: Only bind click, avoid binding popup until needed
          layer.on('click', function (e) {
            const props = { ...feature.properties };
            const popupContent = createPremiumPopupHTML(null, null, props, null);
            layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' }).openPopup();
          });

          // Add non-point features to importedLayers for selection and export
          if (typeof importedLayers !== 'undefined' && importedLayers && !(layer instanceof L.Marker)) {
            importedLayers.addLayer(layer);
          }
        },
        style: function (feature) {
          return {
            color: "#57c236",
            weight: 2,
            opacity: 0.7,
            fillColor: "#57c236",
            fillOpacity: 0.15
          };
        },
        pointToLayer: function (feature, latlng) {
          const serialNumber = (currentIndex + chunkFeatures.indexOf(feature)) + 1;

          // Use standard detailed marker for consistency with Excel/CSV
          if (typeof addDetailedMarker === "function") {
            const marker = addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber, feature);
            if (marker && typeof importedLayers !== 'undefined') {
              importedLayers.addLayer(marker);
            }
            // We return a dummy layer so L.geoJSON doesn't try to add another point
            return L.layerGroup();
          }

          // Fallback if addDetailedMarker is not found
          return L.circleMarker(latlng, {
            radius: 8,
            fillColor: "#57c236",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          });
        }
      });

      currentIndex = nextEnd;

      if (currentIndex < allFeatures.length) {
        // Update progress in overlay
        const progress = Math.floor((currentIndex / allFeatures.length) * 100);
        updateProcessingProgress(progress);

        // Use requestAnimationFrame for smoother UI
        requestAnimationFrame(renderNextChunk);
      } else {
        // Finalize
        if (mainLayerGroup.getLayers().length > 0) {
          // Calculate bounds from a subset of features to avoid massive computation if huge
          // or use the whole group if reasonably sized
          try {
            const tempLayer = L.featureGroup(mainLayerGroup.getLayers());
            map.fitBounds(tempLayer.getBounds(), { padding: [30, 30] });
          } catch (e) {
            console.warn("Could not fit bounds perfectly", e);
          }
        }
        hideProcessingOverlay();
        showToast(`✓ successfully mapped ${allFeatures.length} features`, "success");
      }
    }

    // Start rendering
    renderNextChunk();
  }, 300);
}

function clearShpData() {
  currentShpData = null;
  shpCoordinateStore = [];
  window.currentShpDataByName = {};

  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();

  const shpResult = document.getElementById("shpResult");
  const shpTopBtnGroup = document.getElementById("shpTopClearBtnGroup");
  const shpBottomBtnGroup = document.getElementById("shpBottomActionBtnGroup");
  const shpDropZone = document.getElementById("shpDropZone");
  const shpExportPlaceholder = document.getElementById("shpExportFormatPlaceholder");

  if (shpResult) shpResult.innerHTML = "";
  if (shpExportPlaceholder) shpExportPlaceholder.innerHTML = "";
  if (shpTopBtnGroup) shpTopBtnGroup.style.display = "none";
  if (shpBottomBtnGroup) shpBottomBtnGroup.style.display = "none";
  if (shpDropZone) {
    const dropZoneTitle = shpDropZone.querySelector('h3');
    const dropZoneDesc = shpDropZone.querySelector('p');
    if (dropZoneTitle) dropZoneTitle.innerText = "📦 Drag & Drop Shapefile Components";
    if (dropZoneDesc) dropZoneDesc.innerHTML = 'Select shapefile sets: <strong>.shp, .dbf, .shx, .prj</strong> (multiple supported)';
  }

  const fileInput = document.getElementById("shpFile");
  if (fileInput) fileInput.value = "";
}

// ═════════════════════════════════════════════════════════════════════
//  INDIVIDUAL SHAPEFILE OPERATIONS
// ═════════════════════════════════════════════════════════════════════

function showIndividualShapefileOnMap(shapefileName) {
  // Try named lookup first, fall back to combined currentShpData
  var shpData = null;
  
  if (window.currentShpDataByName && window.currentShpDataByName[shapefileName]) {
    shpData = window.currentShpDataByName[shapefileName];
  } else if (currentShpData && currentShpData.features) {
    // Fallback: use combined data
    shpData = currentShpData;
    if (typeof showToast === 'function') {
      showToast("Using combined shapefile data for " + shapefileName, "info");
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('Shapefile "' + shapefileName + '" not found', "error");
    }
    return;
  }
  
  if (!shpData || !shpData.features || shpData.features.length === 0) {
    if (typeof showToast === 'function') {
      showToast("No features found in " + shapefileName, "error");
    }
    return;
  }
  
  // Switch to map tab and initialize if needed
  if (typeof showTab === 'function') {
    showTab('map');
  }
  
  setTimeout(function() {
    // Ensure map is initialized
    if (!map && typeof initMap === 'function') initMap();
    else if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
    
    // Clear existing map layers (but not the base tile layer)
    if (typeof clearMapMarkers === 'function') clearMapMarkers();
    
    // Remove any previously tracked layer for this shapefile
    var key = 'shp::' + shapefileName;
    if (mapVisibleLayers && mapVisibleLayers[key] && map) {
      try { map.removeLayer(mapVisibleLayers[key]); } catch(e) {}
      delete mapVisibleLayers[key];
    }
    
    // Add to map if we have data and Leaflet is available
    if (map && shpData && typeof L !== 'undefined') {
      var renderer = L.canvas({ padding: 0.5 });
      var pointIndex = 0;
      
      var geoLayer = L.geoJSON(shpData, {
        renderer: renderer,
        onEachFeature: function(feature, layer) {
          layer.feature = feature;
          if (feature.properties) {
            var props = { ...feature.properties };
            props._shapefile = shapefileName;
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
          return { weight: 2, color: "#667eea", opacity: 0.8, fillColor: "#667eea", fillOpacity: 0.3 };
        },
        pointToLayer: function(feature, latlng) {
          if (typeof addDetailedMarker === "function") {
            pointIndex++;
            return addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, pointIndex, feature) || L.circleMarker(latlng, { radius: 8, fillColor: "#667eea", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1 });
          }
          return L.circleMarker(latlng, { radius: 8, fillColor: "#667eea", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1 });
        }
      });
      
      // Store reference for toggle cleanup and add to map
      mapVisibleLayers[key] = geoLayer;
      geoLayer.addTo(map);
      
      // Fit view to the data bounds
      if (typeof geoLayer.getBounds === 'function') {
        try {
          var bounds = geoLayer.getBounds();
          if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch(e) {
          console.warn("Could not fit bounds:", e);
        }
      }
    }
    
    if (typeof showToast === 'function') {
      showToast("📍 " + shapefileName + " on map", "success");
    }
  }, 100);
}

function deleteIndividualShapefileByName(shapefileName) {
  if (!window.currentShpDataByName || !window.currentShpDataByName[shapefileName]) {
    showToast(`Shapefile "${shapefileName}" not found`, "error");
    return;
  }
  
  // Remove from map first
  if (typeof mapRemoveFileFromMap === 'function') {
    mapRemoveFileFromMap('shp', shapefileName + '.shp');
  }
  
  delete window.currentShpDataByName[shapefileName];
  
  // Check if any shapefiles remain
  const remainingCount = Object.keys(window.currentShpDataByName).length;
  
  if (remainingCount === 0) {
    // All shapefiles deleted, clear everything
    clearShpData();
  } else {
    // Rebuild combined data from remaining shapefiles
    const allFeatures = [];
    Object.values(window.currentShpDataByName).forEach(shpData => {
      if (shpData.features) {
        allFeatures.push(...shpData.features);
      }
    });
    
    window.currentShpData = {
      type: 'FeatureCollection',
      features: allFeatures,
      _sourceFileName: `${remainingCount} shapefile(s)`
    };
    
    // Reprocess and refresh UI
    processShpData(window.currentShpData);
    renderShpPreview();
    showToast(`Deleted "${shapefileName}". ${remainingCount} shapefile(s) remaining.`, "info");
  }
  
  // Ensure queue refreshes
  if (typeof syncUploadUI === 'function') syncUploadUI();
  if (typeof renderQueue === 'function') setTimeout(renderQueue, 100);
}

function previewIndividualShapefile(shapefileName) {
  if (!window.currentShpDataByName || !window.currentShpDataByName[shapefileName]) {
    showToast(`Shapefile "${shapefileName}" not found`, "error");
    return;
  }
  
  const shpData = window.currentShpDataByName[shapefileName];
  const featureCount = shpData.features ? shpData.features.length : 0;
  
  // Build preview for this specific shapefile
  const shpResult = document.getElementById("shpResult");
  if (!shpResult) return;
  
  if (featureCount === 0) {
    shpResult.innerHTML = `<p style='padding: 20px; text-align: center; color: #64748b;'>No features found in ${shapefileName}.</p>`;
    return;
  }

  // Collect unique keys from this shapefile's features
  const propertyKeys = new Set();
  shpData.features.forEach(f => {
    if (f.properties) {
      Object.keys(f.properties).forEach(key => {
        if (key !== '_sourceFile') propertyKeys.add(key);
      });
    }
  });

  const sortedKeys = Array.from(propertyKeys).sort();
  const displayCount = Math.min(featureCount, 10);

  let html = `
    <div class="result">
      <div style="margin-bottom: 15px;">
        <h4 style="margin: 0; color: #28a745;">📦 ${shapefileName} Preview</h4>
        <p style="margin: 5px 0; color: #666;">
          Features: <b>${featureCount}</b> | Displaying: <b>First ${displayCount} records</b>
        </p>
      </div>

      <div class="table-container" style="max-height: 400px; overflow: auto; border: 1px solid #eee; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">#</th>
              <th style="background: #28a745; color: white; padding: 10px; text-align: left;">Type</th>
              ${sortedKeys.map(key => `<th style="background: #28a745; color: white; padding: 10px; text-align: left;">${key}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${shpData.features.slice(0, displayCount).map((f, i) => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${i + 1}</td>
                <td style="padding: 10px;"><span class="badge" style="background: #e9ecef; color: #495057;">${f.geometry?.type || 'Unknown'}</span></td>
                ${sortedKeys.map(key => `<td style="padding: 10px;">${f.properties && f.properties[key] !== undefined ? f.properties[key] : ''}</td>`).join('')}
              </tr>
            `).join('')}
            ${featureCount > displayCount ? `<tr><td colspan="${sortedKeys.length + 2}" style="text-align: center; padding: 15px; background: #f8f9fa; font-style: italic; color: #666;">Showing first ${displayCount} of ${featureCount} rows.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;

  shpResult.innerHTML = html;
}

// expose
window.handleShpUpload = handleShpUpload;
window.handleShpFiles = handleShpFiles;
window.showShpOnMap = showShpOnMap;
window.clearShpData = clearShpData;
window.downloadShpResults = downloadShpResults;
window.deleteIndividualShapefileByName = deleteIndividualShapefileByName;
window.showIndividualShapefileOnMap = showIndividualShapefileOnMap;
window.previewIndividualShapefile = previewIndividualShapefile;
