// Main application initialization and drag-drop setup

// Initialization status logging
console.log("=== Advanced Coordinate Conversion Tool ===");
console.log("🚀 Application loading..");

// Check critical dependencies
function checkDependencies() {
  console.log("🔍 Checking critical dependencies:");
  console.log("   ✅ Leaflet:", typeof L !== "undefined");
  console.log("   ✅ Leaflet.Draw:", typeof L !== "undefined" && typeof L.Draw !== "undefined");
  console.log("   ✅ Turf.js:", typeof turf !== "undefined");
  console.log("   ✅ html2canvas:", typeof html2canvas !== "undefined");
  console.log("   ✅ jsPDF:", typeof jspdf !== "undefined" || typeof window.jsPDF !== "undefined");
  console.log("   ✅ XLSX:", typeof XLSX !== "undefined");
}

// Check initialization state
function checkInitState() {
  console.log("📊 Current initialization state:");
  console.log("   - map:", typeof map !== "undefined" ? (map ? "initialized" : "null") : "undefined");
  console.log("   - drawnItems:", typeof drawnItems !== "undefined" ? (drawnItems ? "initialized" : "null") : "undefined");
  console.log("   - drawControl:", typeof drawControl !== "undefined" ? (drawControl ? "initialized" : "null") : "undefined");
  console.log("   - markers:", typeof markers !== "undefined" ? `${markers.length} markers` : "undefined");
  console.log("   - mapContainer:", document.getElementById("mapContainer") ? "found in DOM" : "NOT FOUND");
}

// Run checks when document is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    checkDependencies();
    checkInitState();
    console.log("✅ Application initialized and ready");
  });
} else {
  checkDependencies();
  checkInitState();
  console.log("✅ Application initialized and ready");
}

// Global state
excelData = null;
detectedColumns = [];
coordinateDataStore = [];
currentMarkerStyle = "numbered";
currentMapLayer = "openstreetmap";
tileLayer = null;

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

function initializeApp() {
  setupDragDrop();
  showWelcomeModal();
}

function showWelcomeModal() {
  const modal = document.getElementById("welcomeModal");
  if (!modal) return;
  if (localStorage.getItem("suppressWelcomeModal") === "true") return;
  modal.style.display = "flex";
  modal.style.opacity = "0";
  requestAnimationFrame(() => {
    modal.style.transition = "opacity 0.25s ease-out";
    modal.style.opacity = "1";
  });
}

function closeWelcomeModal() {
  const modal = document.getElementById("welcomeModal");
  const suppressCheckbox = document.getElementById("welcomeDoNotShow");
  if (suppressCheckbox?.checked) {
    localStorage.setItem("suppressWelcomeModal", "true");
  }
  if (modal) {
    modal.style.opacity = "0";
    modal.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      modal.style.display = "none";
    }, 300);
  }
}

function setupDragDrop() {
  const dropZone = document.getElementById("dropZone");

  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    });
  }

  // GeoJSON Drop Zone Setup
  const geoJsonDropZone = document.getElementById("geoJsonDropZone");

  if (geoJsonDropZone) {
    geoJsonDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      geoJsonDropZone.classList.add("dragover");
    });

    geoJsonDropZone.addEventListener("dragleave", () => {
      geoJsonDropZone.classList.remove("dragover");
    });

    geoJsonDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      geoJsonDropZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleGeoJsonFile(files[0]);
      }
    });
  }

  // KML/KMZ Drop Zone Setup
  const kmlDropZone = document.getElementById("kmlDropZone");

  if (kmlDropZone) {
    kmlDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      kmlDropZone.classList.add("dragover");
    });

    kmlDropZone.addEventListener("dragleave", () => {
      kmlDropZone.classList.remove("dragover");
    });

    kmlDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      kmlDropZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleKmlFile(files[0]);
      }
    });
  }

  // SHP Drop Zone Setup
  const shpDropZone = document.getElementById("shpDropZone");

  if (shpDropZone) {
    shpDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      shpDropZone.classList.add("dragover");
    });

    shpDropZone.addEventListener("dragleave", () => {
      shpDropZone.classList.remove("dragover");
    });

    shpDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      shpDropZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleShpFiles(files);
      }
    });
  }
}

function generateExportFileName(fileInputIds, toolName, extension) {
  let baseName = "export";

  if (Array.isArray(fileInputIds)) {
    const names = [];
    fileInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.files && el.files.length > 0) {
        let n = el.files[0].name;
        n = n.substring(0, n.lastIndexOf('.')) || n;
        names.push(n);
      }
    });
    if (names.length > 0) baseName = names.join("_vs_");
  } else if (fileInputIds) {
    const el = document.getElementById(fileInputIds);
    if (el && el.files && el.files.length > 0) {
      let n = el.files[0].name;
      baseName = n.substring(0, n.lastIndexOf('.')) || n;
    }
  }

  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (toolName) {
    return `${baseName}_${dateStr}_${toolName}.${extension}`;
  }
  return `${baseName}_${dateStr}.${extension}`;
}

function checkExistingData(fileType) {
  var type = fileType ? String(fileType).toLowerCase() : '';
  
  if (!type) {
    // Legacy: block only if same legacy global matches current by-name storage
    if (window.excelData && window.excelData.length > 0 && (!window.currentExcelDataByName || Object.keys(window.currentExcelDataByName).length === 0)) return true;
    if (!window.currentGeoJsonDataByName || Object.keys(window.currentGeoJsonDataByName).length === 0) {
      if (window.currentGeoJsonData) return true;
    }
    if (!window.currentKmlDataByName || Object.keys(window.currentKmlDataByName).length === 0) {
      if (window.currentKmlData) return true;
    }
    if (!window.currentShpDataByName || Object.keys(window.currentShpDataByName).length === 0) {
      if (window.currentShpData) return true;
    }
    if (!window.currentGpxDataByName || Object.keys(window.currentGpxDataByName).length === 0) {
      if (window.currentGpxData) return true;
    }
    return false;
  }

  // Type-specific check: only block if that specific type already has data
  if (type === 'excel' || type === 'csv' || type === 'xlsx' || type === 'xls') {
    if (window.excelData && window.excelData.length > 0) return true;
    if (window.currentExcelDataByName && Object.keys(window.currentExcelDataByName).length > 0) return true;
  }
  if (type === 'geojson' || type === 'json') {
    if (window.currentGeoJsonData) return true;
    if (window.currentGeoJsonDataByName && Object.keys(window.currentGeoJsonDataByName).length > 0) return true;
  }
  if (type === 'kml' || type === 'kmz') {
    if (window.currentKmlData) return true;
    if (window.currentKmlDataByName && Object.keys(window.currentKmlDataByName).length > 0) return true;
  }
  if (type === 'shp' || type === 'shapefile') {
    if (window.currentShpData) return true;
    if (window.currentShpDataByName && Object.keys(window.currentShpDataByName).length > 0) return true;
  }
  if (type === 'gpx') {
    if (window.currentGpxData) return true;
    if (window.currentGpxDataByName && Object.keys(window.currentGpxDataByName).length > 0) return true;
  }
  return false;
}

function syncUploadUI() {
  const cards = {
    excel: document.getElementById('excelCard'),
    geojson: document.getElementById('geoJsonCard'),
    kml: document.getElementById('kmlCard'),
    shp: document.getElementById('shpCard'),
    gpx: document.getElementById('gpxCard')
  };

  const loaded = {
    excel: window.excelData && window.excelData.length > 0,
    geojson: !!window.currentGeoJsonData,
    kml: !!window.currentKmlData,
    shp: !!window.currentShpData,
    gpx: !!window.currentGpxData
  };

  const anyLoaded = Object.values(loaded).some(v => v);

  if (!anyLoaded) {
    Object.values(cards).forEach(card => {
      if (card) card.style.display = 'block';
    });
  } else {
    for (const [key, isLoaded] of Object.entries(loaded)) {
      if (cards[key]) {
        cards[key].style.display = isLoaded ? 'block' : 'none';
      }
    }
  }
}

// expose
window.setupDragDrop = setupDragDrop;
window.initializeApp = initializeApp;
window.closeWelcomeModal = closeWelcomeModal;
window.generateExportFileName = generateExportFileName;
window.checkExistingData = checkExistingData;
window.syncUploadUI = syncUploadUI;
