// Shapefile (.zip) File Handling Functions

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
  const dropZone = document.getElementById("shpDropZone");
  const shpResult = document.getElementById("shpResult");
  const clearBtnGroup = document.getElementById("shpClearBtnGroup");

  console.log("📦 Multi-file Shapefile processing triggered", files.length, "files");

  try {
    const fileMap = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split('.').pop().toLowerCase();
      fileMap[ext] = f;
    }

    const required = ['shp', 'dbf', 'shx', 'prj'];
    const missing = required.filter(ext => !fileMap[ext]);

    if (missing.length > 0) {
      if (shpResult) {
        shpResult.innerHTML = `<div class="error" style="color: #e53e3e; background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin-top: 15px;">
          <strong>Missing required components:</strong> .${missing.join(', .')} <br>
          <small>Please select all four files (.shp, .dbf, .shx, .prj) together.</small>
        </div>`;
      }
      return;
    }

    showProcessingOverlay("Reading Shapefile components...");

    const buffers = {};
    const promises = required.map(ext => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          buffers[ext] = e.target.result;
          resolve();
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(fileMap[ext]);
      });
    });

    await Promise.all(promises);

    showProcessingOverlay("Offloading to GIS Worker...");
    
    // Create GIS Worker
    const gisWorker = new Worker('src/js/gisWorker.js');
    
    // Use Transferable Objects (buffers) to avoid memory cloning
    const transferableBuffers = Object.values(buffers).filter(b => b instanceof ArrayBuffer);
    
    gisWorker.postMessage({
      type: 'parseShp',
      buffers: buffers
    }, transferableBuffers);

    gisWorker.onmessage = function(e) {
      const { type, geojson, message, error } = e.data;
      
      if (type === 'status') {
        showProcessingOverlay(message);
      } else if (type === 'error') {
        gisWorker.terminate();
        throw new Error(error);
      } else if (type === 'complete') {
        currentShpData = geojson;
        processShpData(geojson);
        if (typeof syncUploadUI === 'function') syncUploadUI();
        
        dropZone.innerHTML = `<h3>✅ ${fileMap.shp.name}</h3><p>Processed in background</p>`;
        if (clearBtnGroup) clearBtnGroup.style.display = "block";
        hideProcessingOverlay();
        showToast("✓ Shapefile processed successfully in background", "success");
        gisWorker.terminate();
      }
    };

    gisWorker.onerror = function(err) {
      console.error("Worker Error:", err);
      gisWorker.terminate();
      hideProcessingOverlay();
      showToast("Worker error occurred during processing", "error");
    };

  } catch (err) {
    console.error("❌ Error parsing Shapefile components:", err);
    hideProcessingOverlay();
    if (shpResult) {
      shpResult.innerHTML = `<div class="error" style="color: #e53e3e; background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin-top: 15px;">
        <strong>Error processing components:</strong> ${err.message}. <br>
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
            coordIndex: 0
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
              isVertex: true
            });
          }
        }
        featureIndex++;
      });
    }
  });

  renderShpPreview();
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

  // Find all unique keys for header
  const allKeys = new Set();
  shpCoordinateStore.slice(0, 50).forEach(item => {
    if (item.properties) {
      Object.keys(item.properties).forEach(key => allKeys.add(key));
    }
  });
  const headers = Array.from(allKeys);

  let html = `
    <div class="result-card" style="margin-top: 20px; animation: slideInLeft 0.5s ease-out;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h4 style="margin: 0; color: #57c236;">📦 Shapefile Preview</h4>
        <div style="background: rgba(87, 194, 54, 0.1); color: #57c236; padding: 4px 10px; border-radius: 20px; font-size: 0.85em; font-weight: 600;">
          ${shpCoordinateStore.length} Coordinates Found
        </div>
      </div>
      
      <div style="overflow-x: auto; max-height: 400px; border: 1px solid #eee; border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
        <table class="preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Type</th>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
  `;

  // Limit preview for performance
  const previewLimit = 10;
  const displayCount = Math.min(shpCoordinateStore.length, previewLimit);

  for (let i = 0; i < displayCount; i++) {
    const item = shpCoordinateStore[i];
    html += `
      <tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; color: #2d3748;">${item.lat.toFixed(6)}</td>
        <td style="font-family: monospace; color: #2d3748;">${item.lng.toFixed(6)}</td>
        <td><span class="badge" style="background: #edf2f7; color: #4a5568; font-size: 10px; padding: 2px 6px; border-radius: 4px;">${item.geometryType}</span></td>
        ${headers.map(h => `<td>${item.properties[h] !== undefined ? item.properties[h] : '-'}</td>`).join('')}
      </tr>
    `;
  }

  html += `
          </tbody>
        </table>
      </div>
      
      ${shpCoordinateStore.length > previewLimit ? `
        <p style="font-size: 0.85em; color: #64748b; margin-top: 10px; font-style: italic; padding-left: 5px;">
          * Showing first 10 coordinates. All ${shpCoordinateStore.length} features will be rendered on the map.
        </p>
      ` : ''}

      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button class="btn btn-success" onclick="showShpOnMap()" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>🗺️</span> View on Map
        </button>
      </div>
    </div>
  `;

  shpResult.innerHTML = html;
}

function showShpOnMap() {
  if (!shpCoordinateStore || shpCoordinateStore.length === 0) {
    alert("No coordinates found.");
    return;
  }
  
  showTab('map');
  
  const totalFeatures = shpCoordinateStore.length;
  showProcessingOverlay(`Preparing ${totalFeatures} features...`);
  
  setTimeout(() => {
    if (!map) initMap();
    else map.invalidateSize();
    
    clearMapMarkers();
    
    const collections = Array.isArray(currentShpData) ? currentShpData : [currentShpData];
    const renderer = L.canvas({ padding: 0.5 });
    
    // Use a single GeoJSON layer for all features if possible, or a LayerGroup
    const mainLayerGroup = L.layerGroup().addTo(map);
    
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
          // Optimized: Only bind click, avoid binding popup until needed
          layer.on('click', function(e) {
             const props = { ...feature.properties };
             const popupContent = createPremiumPopupHTML(null, null, props, null);
             layer.bindPopup(popupContent, { maxWidth: 350, className: 'premium-popup' }).openPopup();
          });
        },
        style: function(feature) {
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
             addDetailedMarker(latlng.lat, latlng.lng, feature.properties || {}, serialNumber);
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
      }).addTo(mainLayerGroup);

      currentIndex = nextEnd;
      
      if (currentIndex < allFeatures.length) {
        // Update progress in overlay
        const progress = Math.floor((currentIndex / allFeatures.length) * 100);
        const statusH3 = document.getElementById("processingStatus");
        if (statusH3) statusH3.innerText = `Rendering Map: ${progress}%`;
        
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
          } catch(e) {
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
  
  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();
  
  const shpResult = document.getElementById("shpResult");
  const shpClearBtnGroup = document.getElementById("shpClearBtnGroup");
  const shpDropZone = document.getElementById("shpDropZone");

  if (shpResult) shpResult.innerHTML = "";
  if (shpClearBtnGroup) shpClearBtnGroup.style.display = "none";
  if (shpDropZone) {
    shpDropZone.innerHTML = `
      <h3>📦 Drag & Drop Shapefile (ZIP/RAR) Here</h3>
      <p>Or click to browse</p>
    `;
  }
}
