// Main application initialization and drag-drop setup

// Initialization status logging
console.log("=== Advanced Coordinate Conversion Tool ===");
console.log("⏳ Application loading..");

// Check critical dependencies
function checkDependencies() {
  console.log("📋 Checking critical dependencies:");
  console.log("   ✓ Leaflet:", typeof L !== "undefined");
  console.log("   ✓ Leaflet.Draw:", typeof L !== "undefined" && typeof L.Draw !== "undefined");
  console.log("   ✓ Turf.js:", typeof turf !== "undefined");
  console.log("   ✓ html2canvas:", typeof html2canvas !== "undefined");
  console.log("   ✓ jsPDF:", typeof jspdf !== "undefined" || typeof window.jsPDF !== "undefined");
  console.log("   ✓ XLSX:", typeof XLSX !== "undefined");
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
  if (modal) {
    // Show modal only once per session
    if (!sessionStorage.getItem("welcomeModalShown")) {
      modal.style.display = "flex";
    }
  }
}

function closeWelcomeModal() {
  const modal = document.getElementById("welcomeModal");
  if (modal) {
    modal.style.opacity = "0";
    modal.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      modal.style.display = "none";
      sessionStorage.setItem("welcomeModalShown", "true");
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
  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  if (toolName) {
    return `${baseName}_${dateStr}_${toolName}.${extension}`;
  }
  return `${baseName}_${dateStr}.${extension}`;
}

// expose
window.setupDragDrop = setupDragDrop;
window.initializeApp = initializeApp;
window.closeWelcomeModal = closeWelcomeModal;
window.generateExportFileName = generateExportFileName;
