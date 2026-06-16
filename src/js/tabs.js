// Tab switching and precision utilities

function showTab(tabName) {
  // Handle modal tab switching for manual coordinate tabs
  const modal = document.getElementById("singleBatchModal");
  if (modal && modal.style.display === "flex") {
    // Inside the manual coordinates modal — switch between Single/Batch tabs
    if (tabName === "single") {
      showManualTab("singleTab");
    } else if (tabName === "batch") {
      showManualTab("batchTab");
    }
    return;
  }

  // Legacy tab system — gracefully no-op if tab content IDs don't exist
  const tabEl = document.getElementById(tabName);
  if (tabEl) {
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.classList.remove("active");
    });
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    tabEl.classList.add("active");
    // event may be undefined if called programmatically
    if (event && event.target) event.target.classList.add("active");
  }

  if (tabName === "map") {
    // Initialize map immediately and synchronously
    if (!map) {
      console.log("📍 Initializing map for first time");
      initMap();
    } else {
      console.log("📍 Map already initialized, refreshing size");
    }
    
    // Always invalidate size after a delay to ensure proper rendering
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        console.log("✅ Map size validated");
      }
    }, 50);
  }
}

function updatePrecision(value) {
  currentPrecision = parseInt(value);
  const el = document.getElementById("precisionValue");
  if (el) el.textContent = value;
}

// Show single coordinate result on map (called from conversion.js)
function addMarkerFromInput(input) {
  if (!map) {
    console.warn("⚠️ Map not initialized. Cannot add marker.");
    if (typeof showToast === "function") {
      showToast("Map not initialized. Please open the map view first.", "warning");
    }
    return;
  }
  
  const trimmed = input.trim();
  if (!trimmed) return;
  
  let lat, lng;
  
  // Support "lat, lng" format
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map(p => p.trim());
    if (parts.length >= 2) {
      // Try parsing each part as DD or DMS
      const p1 = parseFloat(parts[0]);
      const p2 = parseFloat(parts[1]);
      if (!isNaN(p1) && !isNaN(p2)) {
        lat = p1;
        lng = p2;
      }
    }
  } else {
    // Single value — try numeric
    const val = parseFloat(trimmed);
    if (!isNaN(val)) {
      lat = val;
      lng = 0;
    }
  }
  
  if (lat === undefined || lng === undefined) return;
  
  const icon = createMarkerIcon(currentMarkerStyle, markers.length + 1);
  const marker = L.marker([lat, lng], { icon: icon });
  marker.markerData = { lat, lng, rowData: {}, rowIndex: markers.length + 1 };
  
  if (isClusteringEnabled && markerClusterGroup) {
    markerClusterGroup.addLayer(marker);
  } else {
    marker.addTo(map);
  }
  
  const popupHTML = createPremiumPopupHTML(lat, lng, {}, markers.length + 1);
  marker.bindPopup(popupHTML, { maxWidth: 350 });
  marker.on("popupopen", () => highlightMarker(marker));
  marker.on("popupclose", () => unhighlightMarkers());
  
  markers.push(marker);
  marker.openPopup();
  map.setView([lat, lng], 13);
}

// Clear all map markers
function clearMapMarkers() {
  markers.forEach(marker => {
    if (markerClusterGroup && isClusteringEnabled) {
      markerClusterGroup.removeLayer(marker);
    } else if (map) {
      map.removeLayer(marker);
    }
  });
  markers = [];
}

// Worker initializer — returns a new Web Worker
function initWorker() {
  try {
    const worker = new Worker("src/js/worker.js");
    
    worker.onmessage = function(e) {
      const { type, result, progress, error } = e.data;
      
      if (type === "complete") {
        hideProcessingOverlay();
        // Call the stored callback if set
        if (typeof window.currentWorkerCallback === "function") {
          window.currentWorkerCallback(result);
          window.currentWorkerCallback = null;
        }
      } else if (type === "progress") {
        if (typeof progress === "number") {
          updateProcessingProgress(progress);
        }
      } else if (type === "error") {
        hideProcessingOverlay();
        if (typeof showToast === "function") {
          showToast("Worker error: " + (error || "Unknown error"), "error");
        } else {
          alert("Worker error: " + (error || "Unknown error"));
        }
      }
    };
    
    worker.onerror = function(err) {
      hideProcessingOverlay();
      console.error("❌ Worker error:", err);
      if (typeof showToast === "function") {
        showToast("Worker error occurred.", "error");
      }
    };
    
    return worker;
  } catch (err) {
    console.error("❌ Failed to create Worker:", err);
    if (typeof showToast === "function") {
      showToast("Failed to create background worker.", "error");
    }
    return null;
  }
}

// Processing overlay helpers
function showProcessingOverlay(message, progress) {
  const overlay = document.getElementById("processingOverlay");
  const statusEl = document.getElementById("processingStatus");
  const barEl = document.getElementById("processingProgressBar");
  const pctEl = document.getElementById("processingPercentage");
  
  if (overlay) {
    overlay.style.display = "flex";
  }
  if (statusEl && message) {
    statusEl.textContent = message;
  }
  if (barEl && typeof progress === "number") {
    barEl.style.width = Math.min(progress, 100) + "%";
  }
  if (pctEl && typeof progress === "number") {
    pctEl.textContent = Math.min(progress, 100) + "%";
  }
}

function hideProcessingOverlay() {
  const overlay = document.getElementById("processingOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

function updateProcessingProgress(progress) {
  showProcessingOverlay(null, progress);
}

// Marker icon factory
function createMarkerIcon(style, index) {
  const size = currentMarkerSize || 35;
  
  if (style === "numbered") {
    return L.divIcon({
      className: "custom-marker-icon",
      html: `<div style="
        width: ${size}px; height: ${size}px;
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        border: 3px solid white;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #0b1528; font-weight: 900; font-size: 13px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      ">${index}</div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor: [0, -size/2]
    });
  }
  
  const emojiMap = {
    pin: "📍", location: "📌", star: "⭐", flag: "🚩", target: "🎯"
  };
  const emoji = emojiMap[style] || "📍";
  
  return L.divIcon({
    className: "custom-marker-icon",
    html: `<div style="
      font-size: ${size * 0.6}px;
      text-align: center; line-height: ${size}px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size],
    popupAnchor: [0, -size]
  });
}

// Premium popup HTML builder
function createPremiumPopupHTML(lat, lng, rowData, index) {
  const latStr = typeof lat === 'number' ? lat.toFixed(6) : lat;
  const lngStr = typeof lng === 'number' ? lng.toFixed(6) : lng;
  
  let extraRows = "";
  if (rowData) {
    Object.keys(rowData).forEach(key => {
      const val = rowData[key];
      if (val !== undefined && val !== null) {
        extraRows += `<tr><td>${key}</td><td>${val}</td></tr>`;
      }
    });
  }
  
  return `
    <div class="popup-premium-header">
      <h4>📍 Location #${index}</h4>
    </div>
    <div class="popup-premium-content">
      <table class="popup-table">
        <tr><td>Latitude</td><td>${latStr}</td></tr>
        <tr><td>Longitude</td><td>${lngStr}</td></tr>
        ${extraRows}
      </table>
      <div class="popup-actions">
        <button class="popup-btn popup-btn-copy" onclick="copyPopupCoords(${lat}, ${lng})">📋 Copy</button>
        <button class="popup-btn popup-btn-maps" onclick="window.open('https://www.google.com/maps?q=${lat},${lng}')">🌐 Maps</button>
      </div>
    </div>
  `;
}

function highlightMarker(marker) {
  if (marker._icon) {
    marker._icon.classList.add("marker-active");
  }
}

function unhighlightMarkers() {
  document.querySelectorAll(".marker-active").forEach(el => {
    el.classList.remove("marker-active");
  });
}

function copyPopupCoords(lat, lng) {
  const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  });
  if (typeof showToast === "function") {
    showToast("Coordinates copied to clipboard!", "success");
  }
}

// Selection tab switching helper (referenced by map.js)
window.switchSelectionTab = function(tabName, btnEl) {
  document.querySelectorAll(".selection-tab").forEach(tab => {
    tab.style.display = "none";
  });
  document.querySelectorAll("#selectedMarkersPanel .tab-btn").forEach(btn => {
    btn.style.background = "#f5f5f5";
    btn.style.borderBottom = "none";
  });
  
  const tab = document.getElementById("tab-" + tabName);
  if (tab) tab.style.display = "flex";
  if (btnEl) {
    btnEl.style.background = "white";
    btnEl.style.borderBottom = "2px solid #667eea";
  }
};

window.toggleMinimizeSelection = function() {
  const panel = document.getElementById("selectedMarkersPanel");
  if (!panel) return;
  const body = panel.querySelector("#selectionPanelBody");
  const btn = document.getElementById("btnMinimizeSelection");
  if (body && btn) {
    if (body.style.display === "none") {
      body.style.display = "flex";
      btn.textContent = "−";
    } else {
      body.style.display = "none";
      btn.textContent = "+";
    }
  }
};

window.closeSelectedPanel = function() {
  const panel = document.getElementById("selectedMarkersPanel");
  if (panel) panel.remove();
};

window.copySelectedCoordinates = function() {
  // Implement in map context if needed
  if (typeof showToast === "function") {
    showToast("Copy coordinates from the feature panel.", "info");
  }
};

// Expose globals
window.showTab = showTab;
window.updatePrecision = updatePrecision;
window.addMarkerFromInput = addMarkerFromInput;
window.clearMapMarkers = clearMapMarkers;
window.initWorker = initWorker;
window.showProcessingOverlay = showProcessingOverlay;
window.hideProcessingOverlay = hideProcessingOverlay;
window.updateProcessingProgress = updateProcessingProgress;
window.createMarkerIcon = createMarkerIcon;
window.createPremiumPopupHTML = createPremiumPopupHTML;
window.highlightMarker = highlightMarker;
window.unhighlightMarkers = unhighlightMarkers;
window.copyPopupCoords = copyPopupCoords;