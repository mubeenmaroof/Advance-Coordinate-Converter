// ============================================================
// helper.js — Dashboard UI Controller
// ============================================================
console.log("🚀 helper.js loading...");

// ── Modal Utilities ──────────────────────────────────────────────────
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = "flex";
  modal.style.opacity = "0";
  requestAnimationFrame(() => {
    modal.style.transition = "opacity 0.25s ease-out";
    modal.style.opacity = "1";
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.opacity = "0";
  modal.style.transition = "opacity 0.2s ease-in";
  setTimeout(() => { modal.style.display = "none"; }, 200);
}

// ── Page Refresh ─────────────────────────────────────────────────────
function refreshPage() {
  window.location.reload();
}

// ── DOMContentLoaded boot ────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll(".modal-overlay").forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  const searchInput = document.getElementById("sidebarSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll(".file-card").forEach(card => {
        const h = card.querySelector("h3")?.textContent.toLowerCase() || "";
        const p = card.querySelector("p")?.textContent.toLowerCase() || "";
        card.style.display = (h.includes(q) || p.includes(q)) ? "flex" : "none";
      });
    });
  }

  const cardMap = {
    cardShp:     "shpFile",
    cardGeojson: "geoJsonFile",
    cardKml:     "kmlFile",
    cardGpx:     "gpxFile",
    cardCsv:     "excelFile"
  };

  Object.entries(cardMap).forEach(([cardId, inputId]) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.addEventListener("click", e => {
      if (e.target.tagName === "BUTTON") return;
      document.getElementById(inputId)?.click();
    });
  });

  const dropConfigs = [
    { id: "cardShp", inputId: "shpFile", multiple: true, handler: files => typeof handleShpFiles === "function" && handleShpFiles(files) },
    { id: "cardGeojson", inputId: "geoJsonFile", handler: file => typeof handleGeoJsonFile === "function" && handleGeoJsonFile(file) },
    { id: "cardKml", inputId: "kmlFile", handler: file => typeof handleKmlFile === "function" && handleKmlFile(file) },
    { id: "cardGpx", inputId: "gpxFile", handler: file => typeof handleGpxFile === "function" && handleGpxFile(file) },
    { id: "cardCsv", inputId: "excelFile", handler: file => typeof handleFile === "function" && handleFile(file) }
  ];

  dropConfigs.forEach(cfg => {
    const card = document.getElementById(cfg.id);
    if (!card) return;

    card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("drag-over"); });
    card.addEventListener("dragleave", e => { if (!card.contains(e.relatedTarget)) card.classList.remove("drag-over"); });
    card.addEventListener("drop", e => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const files = e.dataTransfer.files;
      if (!files.length) return;
      const input = document.getElementById(cfg.inputId);
      if (input) { try { const dt = new DataTransfer(); Array.from(files).forEach(f => dt.items.add(f)); input.files = dt.files; } catch(_) {} }
      if (cfg.multiple) cfg.handler(files); else cfg.handler(files[0]);
    });
  });

  document.getElementById("btnSidebarUpload")?.addEventListener("click", () => {
    document.getElementById("smartUploadFile")?.click();
  });

  setupResultObservers();
  overrideSyncUploadUI();

  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.innerHTML = document.body.classList.contains("dark-mode") ? "☀️" : "🌙";
  }
});

// ── Smart Upload Handler ─────────────────────────────────────────────
function handleSmartUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const shpExts = new Set(["shp", "dbf", "shx", "prj"]);
  const shpGroups = {};
  const nonShpFiles = [];

  Array.from(files).forEach(file => {
    const name = file.name;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return;
    const base = name.substring(0, dot);
    const ext  = name.substring(dot + 1).toLowerCase();
    if (shpExts.has(ext)) {
      if (!shpGroups[base]) shpGroups[base] = { shp: null, dbf: null, shx: null, prj: null };
      shpGroups[base][ext] = file;
    } else {
      nonShpFiles.push({ file, ext });
    }
  });

  Object.keys(shpGroups).forEach(base => {
    const group = shpGroups[base];
    if (group.shp) {
      const allGroupFiles = [group.shp, group.dbf, group.shx, group.prj].filter(Boolean);
      if (typeof handleShpFiles === "function") handleShpFiles(allGroupFiles);
    }
  });

  let processedCount = 0;
  nonShpFiles.forEach(({ file, ext }) => {
    if (ext === "geojson" || ext === "json") { if (typeof handleGeoJsonFile === "function") { handleGeoJsonFile(file); processedCount++; } }
    else if (ext === "kml" || ext === "kmz") { if (typeof handleKmlFile === "function") { handleKmlFile(file); processedCount++; } }
    else if (ext === "gpx") { if (typeof handleGpxFile === "function") { handleGpxFile(file); processedCount++; } }
    else if (["xlsx", "xls", "csv"].includes(ext)) { if (typeof handleFile === "function") { handleFile(file); processedCount++; } }
  });

  const shpCount = Object.keys(shpGroups).length;
  if (shpCount + processedCount > 1 && typeof showToast === "function") {
    showToast(`📦 Uploaded ${shpCount + processedCount} file(s)`, "success");
  }
  event.target.value = "";
}

// ── Observe result containers ────────────────────────────────────────
function setupResultObservers() {
  const targets = [
    { id: "columnSelection", fileType: "excel" },
    { id: "excelResult",     fileType: "excel" },
    { id: "geoJsonResult",   fileType: "geojson" },
    { id: "kmlResult",       fileType: "kml" },
    { id: "shpResult",       fileType: "shp" },
    { id: "gpxResult",       fileType: "gpx" }
  ];

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mut => {
      if (mut.addedNodes.length > 0) {
        const target = targets.find(t => t.id === mut.target.id);
        if (target && mut.target.innerHTML.trim() !== "") {
          showPreviewSection(target.fileType);
        }
      }
    });
  });

  targets.forEach(t => {
    const el = document.getElementById(t.id);
    if (el) observer.observe(el, { childList: true, subtree: true });
  });
}

// ── Show the correct panel in the preview modal ──────────────────────
function showPreviewSection(fileType) {
  document.querySelectorAll(".preview-section").forEach(sec => sec.style.display = "none");

  const wrapperMap = { excel: "excelPreviewWrapper", geojson: "geojsonPreviewWrapper", kml: "kmlPreviewWrapper", shp: "shpPreviewWrapper", gpx: "gpxPreviewWrapper" };
  const names = { excel: "CSV/Excel", geojson: "GeoJSON", kml: "KML/KMZ", shp: "Shapefile", gpx: "GPX" };

  let wrapperId = wrapperMap[fileType];
  if (!wrapperId || !document.getElementById(wrapperId)) {
    wrapperId = Object.values(wrapperMap).find(id => { const el = document.getElementById(id); return el && el.innerHTML.trim() !== ""; }) || "excelPreviewWrapper";
    fileType = Object.keys(wrapperMap).find(key => wrapperMap[key] === wrapperId) || "excel";
  }

  const wrapper = document.getElementById(wrapperId);
  if (wrapper) wrapper.style.display = "block";

  const shpBar = document.getElementById("shpBottomActionBtnGroup");
  if (shpBar) shpBar.style.display = fileType === "shp" ? "flex" : "none";

  const helper = document.getElementById("previewHelperText");
  if (helper) helper.textContent = `Previewing ${names[fileType] || fileType.toUpperCase()} content. Use the buttons below to clear the file, export results, or display data on the map.`;

  const title = document.getElementById("previewModalTitle");
  if (title) title.textContent = `${names[fileType] || fileType.toUpperCase()} File Preview & Configuration`;

  openModal("previewModal");
  if (typeof window.syncUploadUI === "function") window.syncUploadUI();
}

// ═════════════════════════════════════════════════════════════════════
//  GLOBAL MAP TOGGLE SYSTEM
// ═════════════════════════════════════════════════════════════════════

function queueMapToggle(type, fileName, showCallbackName) {
  var key = type + "::" + fileName;
  var isVisible = mapLayerVisibilityFlags[key];
  var showFn = typeof window[showCallbackName] === 'function' ? window[showCallbackName] : null;

  if (isVisible) {
    // HIDE
    if (typeof clearMapMarkers === 'function') clearMapMarkers();
    if (mapVisibleLayers[key] && map) {
      try { map.removeLayer(mapVisibleLayers[key]); } catch(e) {}
      delete mapVisibleLayers[key];
    }
    mapLayerVisibilityFlags[key] = false;
    if (typeof showToast === 'function') showToast("🗺️ " + fileName + " removed from map", "info");
  } else {
    // SHOW
    if (typeof showTab === 'function') showTab('map');
    setTimeout(function() {
      if (!map && typeof initMap === 'function') initMap();
      if (showFn) showFn();
      mapLayerVisibilityFlags[key] = true;
      closeModal('previewModal');
    }, 100);
  }
  setTimeout(renderQueue, 200);
}

function mapRemoveFileFromMap(type, fileName) {
  var key = type + "::" + fileName;
  if (mapVisibleLayers[key] && map) { try { map.removeLayer(mapVisibleLayers[key]); } catch(e) {} delete mapVisibleLayers[key]; }
  if (mapLayerVisibilityFlags[key] && typeof clearMapMarkers === 'function') clearMapMarkers();
  mapLayerVisibilityFlags[key] = false;
  if (typeof renderQueue === 'function') setTimeout(renderQueue, 200);
}

// ═════════════════════════════════════════════════════════════════════

const _fileTypeLabels = {
  excel:   { name: "CSV/Excel", clearFn: "clearExcelData",    color: "var(--color-csv)",     icon: "📝" },
  geojson: { name: "GeoJSON",   clearFn: "clearGeoJsonData",  color: "var(--color-geojson)", icon: "🗺️" },
  kml:     { name: "KML/KMZ",   clearFn: "clearKmlData",      color: "var(--color-kml)",     icon: "📂" },
  shp:     { name: "Shapefile", clearFn: "clearShpData",      color: "var(--color-shp)",     icon: "📦" },
  gpx:     { name: "GPX",       clearFn: "clearGpxData",      color: "var(--color-gpx)",     icon: "🛰️" }
};

function buildQueueItems() {
  const items = [];
  if (window.currentExcelDataByName && Object.keys(window.currentExcelDataByName).length > 0) {
    Object.keys(window.currentExcelDataByName).forEach(n => items.push({ type: "excel", fileName: n, excelFileName: n }));
  } else if (window.excelData && window.excelData.length > 0) {
    const el = document.getElementById("excelFile");
    items.push({ type: "excel", fileName: el?.files?.[0]?.name || "CSV/Excel Data" });
  }
  if (window.currentGeoJsonDataByName && Object.keys(window.currentGeoJsonDataByName).length > 0) {
    Object.keys(window.currentGeoJsonDataByName).forEach(n => items.push({ type: "geojson", fileName: n, geoJsonFileName: n }));
  } else if (window.currentGeoJsonData) {
    const el = document.getElementById("geoJsonFile");
    items.push({ type: "geojson", fileName: el?.files?.[0]?.name || "GeoJSON Spatial" });
  }
  if (window.currentKmlDataByName && Object.keys(window.currentKmlDataByName).length > 0) {
    Object.keys(window.currentKmlDataByName).forEach(n => items.push({ type: "kml", fileName: n, kmlFileName: n }));
  } else if (window.currentKmlData) {
    const el = document.getElementById("kmlFile");
    items.push({ type: "kml", fileName: el?.files?.[0]?.name || "KML/KMZ Map" });
  }
  if (window.currentShpDataByName && Object.keys(window.currentShpDataByName).length > 0) {
    Object.keys(window.currentShpDataByName).forEach(baseName => {
      items.push({ type: "shp", fileName: baseName + ".shp", shapefileName: baseName });
    });
  } else if (window.currentShpData) {
    const el = document.getElementById("shpFile");
    items.push({ type: "shp", fileName: el?.files?.[0]?.name || "Shapefile Pack" });
  }
  if (window.currentGpxDataByName && Object.keys(window.currentGpxDataByName).length > 0) {
    Object.keys(window.currentGpxDataByName).forEach(n => items.push({ type: "gpx", fileName: n, gpxFileName: n }));
  } else if (window.currentGpxData) {
    const el = document.getElementById("gpxFile");
    items.push({ type: "gpx", fileName: el?.files?.[0]?.name || "GPX Track" });
  }
  return items;
}

let _originalSyncUploadUI = null;

function overrideSyncUploadUI() {
  if (typeof window.syncUploadUI === "function") _originalSyncUploadUI = window.syncUploadUI;
  window.syncUploadUI = function () { if (_originalSyncUploadUI) _originalSyncUploadUI(); renderQueue(); };
}

// ── Queue Render ─────────────────────────────────────────────────────
function renderQueue() {
  var queueList = document.getElementById("queueList");
  var queueCount = document.getElementById("queueCount");
  if (!queueList) return;

  var items = buildQueueItems();

  if (queueCount) queueCount.textContent = items.length ? items.length + " file" + (items.length > 1 ? "s" : "") : "";

  if (items.length === 0) {
    queueList.innerHTML = '<p style="font-size:12px;color:#94a3b8;text-align:center;margin:10px 0;">No active uploads</p>';
    return;
  }

  queueList.innerHTML = "";

  // Pre-build deletion wrappers so closures capture the right values
  function makeDeleteWrapper(type, fileName, clearFn) {
    return function() {
      mapRemoveFileFromMap(type, fileName);
      if (clearFn && typeof window[clearFn] === "function") window[clearFn]();
      if (typeof showToast === "function") showToast("🗑️ " + fileName + " cleared", "info");
      setTimeout(renderQueue, 200);
    };
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var meta = _fileTypeLabels[item.type] || { name: item.type, clearFn: null, color: "#64748b", icon: "📄" };
    var div = document.createElement("div");
    div.className = "queue-item";

    // Compute map identifier and callbacks
    var mapIdentifier = item.fileName;
    var mapCallbackName = null;
    var viewHandler = "window._queueView('" + item.type + "')";
    var deleteFileName = item.fileName;

    if (item.type === 'shp' && item.shapefileName) {
      mapCallbackName = 'showIndividualShapefileOnMap';
      viewHandler = "window.previewIndividualShapefile('" + item.shapefileName + "')";
      deleteFileName = item.shapefileName + ".shp";
      mapIdentifier = item.shapefileName; // bare name
    } else if (item.type === 'geojson' && item.geoJsonFileName) {
      mapCallbackName = 'showIndividualGeoJsonOnMap';
      viewHandler = "window.previewIndividualGeoJson('" + item.geoJsonFileName + "')";
      mapIdentifier = item.geoJsonFileName;
    } else if (item.type === 'kml' && item.kmlFileName) {
      mapCallbackName = 'showIndividualKmlOnMap';
      viewHandler = "window.previewIndividualKml('" + item.kmlFileName + "')";
      mapIdentifier = item.kmlFileName;
    } else if (item.type === 'gpx' && item.gpxFileName) {
      mapCallbackName = 'showIndividualGpxOnMap';
      viewHandler = "window.previewIndividualGpx('" + item.gpxFileName + "')";
      mapIdentifier = item.gpxFileName;
    } else if (item.type === 'excel' && item.excelFileName) {
      mapCallbackName = 'showIndividualExcelOnMap';
      viewHandler = "window.previewIndividualExcel('" + item.excelFileName + "')";
      mapIdentifier = item.excelFileName;
    }

    // Delete closure
    var deleteHandler = makeDeleteWrapper(item.type, deleteFileName, meta.clearFn);

    // Visibility key — MUST match queueMapToggle's key construction
    var mapKey = item.type + "::" + mapIdentifier;
    var isOnMap = !!(mapLayerVisibilityFlags && mapLayerVisibilityFlags[mapKey]);

    // Map button
    var mapButtonHtml = "";
    if (mapCallbackName) {
      var mapIcon = isOnMap ? "🔴" : "🗺️";
      var mapTitle = isOnMap ? "Remove from map" : "Show on map";
      mapButtonHtml = "<button class=\"queue-btn queue-btn-map\" title=\"" + mapTitle + "\" onclick=\"queueMapToggle('" + item.type + "', '" + mapIdentifier + "', '" + mapCallbackName + "')\">" + mapIcon + " Map</button>";
    }

    div.innerHTML =
      '<div class="queue-item-header">' +
        '<span class="queue-file-name" title="' + item.fileName + '" style="color:' + meta.color + '">' + meta.icon + " " + item.fileName + '</span>' +
        '<span class="queue-status-badge status-added">' + (isOnMap ? "📍 On Map" : "Loaded") + '</span>' +
      "</div>" +
      '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:100%;background:' + (isOnMap ? "#10b981" : meta.color) + ';"></div></div>' +
      '<div class="queue-item-actions">' +
        '<button class="queue-btn queue-btn-view" title="View file preview" onclick="' + viewHandler + '">👁 View</button>' +
        mapButtonHtml +
        '<button class="queue-btn queue-btn-delete" title="Delete this file" onclick="window._queueDeleteWithMap(\'' + item.type + "','" + item.fileName + "','" + (meta.clearFn || "") + "')\">🗑 Delete</button>" +
      "</div>";

    queueList.appendChild(div);
  }
}

window._queueView = function (type) { showPreviewSection(type); };

window._queueDeleteWithMap = function(type, fileName, clearFnName) {
  mapRemoveFileFromMap(type, fileName);
  if (clearFnName && typeof window[clearFnName] === "function") {
    window[clearFnName]();
    if (typeof showToast === "function") showToast("🗑️ " + (_fileTypeLabels[type]?.name || type) + " data cleared.", "info");
  }
  setTimeout(renderQueue, 100);
};

window._queueDelete = function (type, clearFnName) {
  if (clearFnName && typeof window[clearFnName] === "function") {
    window[clearFnName]();
    if (typeof showToast === "function") showToast((_fileTypeLabels[type]?.name || type) + " data cleared.", "info");
  }
  setTimeout(renderQueue, 100);
};

// ═════════════════════════════════════════════════════════════════════
//  FILE SELECTION UTILITIES
// ═════════════════════════════════════════════════════════════════════

window._pendingConversionData = { sourceType: null, selectedFileName: null };

function getLoadedFilesInfo() {
  var excelInput = document.getElementById("excelFile");
  var geoInput = document.getElementById("geoJsonFile");
  var kmlInput = document.getElementById("kmlFile");
  var shpInput = document.getElementById("shpFile");
  var gpxInput = document.getElementById("gpxFile");

  return {
    excel: {
      count: Math.max(Object.keys(window.currentExcelDataByName || {}).length, excelInput ? excelInput.files.length : 0),
      files: Object.keys(window.currentExcelDataByName || {}).length > 0 ? Object.keys(window.currentExcelDataByName) : (excelInput ? Array.from(excelInput.files).map(f => f.name) : [])
    },
    geojson: {
      count: Math.max(Object.keys(window.currentGeoJsonDataByName || {}).length, geoInput ? geoInput.files.length : 0),
      files: Object.keys(window.currentGeoJsonDataByName || {}).length > 0 ? Object.keys(window.currentGeoJsonDataByName) : (geoInput ? Array.from(geoInput.files).map(f => f.name) : [])
    },
    kml: {
      count: Math.max(Object.keys(window.currentKmlDataByName || {}).length, kmlInput ? kmlInput.files.length : 0),
      files: Object.keys(window.currentKmlDataByName || {}).length > 0 ? Object.keys(window.currentKmlDataByName) : (kmlInput ? Array.from(kmlInput.files).map(f => f.name) : [])
    },
    shp: {
      count: Math.max(Object.keys(window.currentShpDataByName || {}).length, shpInput ? shpInput.files.length / 4 : 0),
      files: Object.keys(window.currentShpDataByName || {}).length > 0 ? Object.keys(window.currentShpDataByName).map(n => n + ".shp") : (shpInput ? Array.from(new Set(Array.from(shpInput.files).map(f => f.name.split('.').slice(0, -1).join('.')))) : [])
    },
    gpx: {
      count: Math.max(Object.keys(window.currentGpxDataByName || {}).length, gpxInput ? gpxInput.files.length : 0),
      files: Object.keys(window.currentGpxDataByName || {}).length > 0 ? Object.keys(window.currentGpxDataByName) : (gpxInput ? Array.from(gpxInput.files).map(f => f.name) : [])
    }
  };
}

function findFileStore(fileName) {
  var stores = [
    { type: "excel", store: window.currentExcelDataByName },
    { type: "geojson", store: window.currentGeoJsonDataByName },
    { type: "kml", store: window.currentKmlDataByName },
    { type: "shp", store: window.currentShpDataByName },
    { type: "gpx", store: window.currentGpxDataByName }
  ];
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    if (s.store && s.store[fileName]) return { type: s.type, store: s.store, data: s.store[fileName] };
  }
  // SHP fallback: keys are base names without .shp, check with extension stripped
  var shpStore = window.currentShpDataByName;
  if (shpStore) {
    var base = fileName.replace(/\.shp$/i, '');
    if (shpStore[base]) return { type: "shp", store: shpStore, data: shpStore[base] };
  }
  return null;
}

function showMultiTypeFileSelectionModal(multiFileTypes, targetFormat) {
  const modal = document.getElementById("fileSelectionModal");
  const listContainer = document.getElementById("fileSelectionList");
  if (!modal || !listContainer) return;
  listContainer.innerHTML = "";

  var firstRadioValue = null;

  multiFileTypes.forEach(entry => {
    const typeLabel = _fileTypeLabels[entry.type]?.name || entry.type;
    const section = document.createElement("div");
    section.style.marginBottom = "16px";

    const header = document.createElement("div");
    header.style.fontWeight = "700";
    header.style.color = "#334155";
    header.style.marginBottom = "8px";
    header.textContent = typeLabel;
    section.appendChild(header);

    entry.files.forEach(fileName => {
      const radioValue = entry.type + ":" + fileName;
      if (!firstRadioValue) firstRadioValue = radioValue;

      const option = document.createElement("div");
      option.style.cssText = "padding:10px 14px;margin-bottom:6px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;";
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "fileSelection"; radio.value = radioValue;
      radio.style.cssText = "width:16px;height:16px;cursor:pointer;";
      radio.addEventListener("change", () => { window._pendingConversionData.selectedFileName = radioValue; });
      const label = document.createElement("label");
      label.style.cssText = "flex:1;cursor:pointer;margin:0;font-size:13px;";
      label.textContent = fileName;
      label.addEventListener("click", () => { radio.checked = true; window._pendingConversionData.selectedFileName = radioValue; });
      option.appendChild(radio); option.appendChild(label); section.appendChild(option);
    });

    listContainer.appendChild(section);
  });

  window._pendingConversionData = { sourceType: multiFileTypes[0].type, selectedFileName: firstRadioValue, targetFormat: targetFormat, multiFileTypes: multiFileTypes };
  openModal("fileSelectionModal");
}

function showFileSelectionModal(sourceType, files, targetFormat) {
  const modal = document.getElementById("fileSelectionModal");
  const listContainer = document.getElementById("fileSelectionList");
  if (!modal || !listContainer) return;
  listContainer.innerHTML = "";
  var firstValue = null;
  files.forEach(fileName => {
    if (!firstValue) firstValue = fileName;
    const option = document.createElement("div");
    option.style.cssText = "padding:12px 16px;margin-bottom:8px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px;";
    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "fileSelection"; radio.value = fileName;
    radio.style.cssText = "width:18px;height:18px;cursor:pointer;";
    radio.addEventListener("change", () => { window._pendingConversionData.selectedFileName = fileName; });
    const label = document.createElement("label");
    label.style.cssText = "flex:1;cursor:pointer;margin:0;"; label.textContent = fileName;
    label.addEventListener("click", () => { radio.checked = true; window._pendingConversionData.selectedFileName = fileName; });
    option.appendChild(radio); option.appendChild(label); listContainer.appendChild(option);
  });
  window._pendingConversionData = { sourceType: sourceType, selectedFileName: firstValue, targetFormat: targetFormat };
  openModal("fileSelectionModal");
}

function proceedWithSelectedFile() {
  var selected = window._pendingConversionData.selectedFileName || "";
  var selectedFile = selected;
  var typeFromRadio = null;
  if (selected.includes(":")) {
    var parts = selected.split(":");
    typeFromRadio = parts[0];
    selectedFile = parts.slice(1).join(":");
  }
  if (!selectedFile) { showToast("Please select a file to convert.", "warning"); return; }
  closeModal("fileSelectionModal");
  var targetFormat = window._pendingConversionData.targetFormat || document.getElementById("targetFormatSelect")?.value;
  var setFormat = function(selectId, val) { var sel = document.getElementById(selectId); if (sel) sel.value = val; };

  // Use the type encoded in the radio value (avoids store-lookup mismatches)
  var found = null;
  if (typeFromRadio) {
    var storeMap = {
      excel: window.currentExcelDataByName,
      geojson: window.currentGeoJsonDataByName,
      kml: window.currentKmlDataByName,
      shp: window.currentShpDataByName,
      gpx: window.currentGpxDataByName
    };
    var store = storeMap[typeFromRadio];
    if (store && store[selectedFile]) {
      found = { type: typeFromRadio, store: store, data: store[selectedFile] };
    } else {
      // SHP fallback: keys are base names without .shp
      if (typeFromRadio === "shp" && store) {
        var base = selectedFile.replace(/\.shp$/i, '');
        if (store[base]) found = { type: "shp", store: store, data: store[base] };
      }
    }
  }
  if (!found) found = findFileStore(selectedFile);
  if (!found) {
    // Try legacy single-file globals as fallback
    if (window.excelData && window.excelData.length > 0 && selectedFile === (document.getElementById("excelFile")?.files?.[0]?.name || "CSV/Excel Data")) {
      setFormat("excelExportFormat", targetFormat);
      if (typeof window.convertExcelData === "function") { window.convertExcelData(); setTimeout(function() { if (typeof window.downloadExcelResults === "function") window.downloadExcelResults(); }, 500); }
      return;
    }
    showToast("File not found in loaded data: " + selectedFile, "error");
    return;
  }

  window._pendingConversionData.sourceType = found.type;
  var typeKey = found.type;

  if (typeKey === "excel") {
    window.excelCurrentFileName = selectedFile; window.excelData = found.data;
    setFormat("excelExportFormat", targetFormat);
    if (typeof window.convertExcelData === "function") { window.convertExcelData(); setTimeout(function() { if (typeof window.downloadExcelResults === "function") window.downloadExcelResults(); }, 500); }
  } else if (typeKey === "geojson") { window.currentGeoJsonData = found.data; setFormat("geoJsonExportFormat", targetFormat); if (typeof window.downloadGeoJsonResults === "function") window.downloadGeoJsonResults(); }
  else if (typeKey === "kml") { window.currentKmlData = found.data; setFormat("kmlExportFormat", targetFormat); if (typeof window.downloadKmlResults === "function") window.downloadKmlResults(); }
  else if (typeKey === "shp") { window.currentShpData = found.data; setFormat("shpExportFormat", targetFormat); if (typeof window.downloadShpResults === "function") window.downloadShpResults(); }
  else if (typeKey === "gpx") { window.currentGpxData = found.data; setFormat("gpxExportFormat", targetFormat); if (typeof window.downloadGpxResults === "function") window.downloadGpxResults(); }
  else {
    // Unknown type fallback — never default to Excel
    showToast("Could not determine file type for: " + selectedFile, "error");
  }
}

function triggerConvertAndDownload() {
  var targetFormat = document.getElementById("targetFormatSelect")?.value;
  var filesInfo = getLoadedFilesInfo();
  var setFormat = function(selectId, val) { var sel = document.getElementById(selectId); if (sel) sel.value = val; };

  // Collect all files across all types to always show selection modal when anything is loaded
  var allAvailableFiles = [];
  var typeConfig = {
    excel:      { dataName: null, dataObj: null, setterFnName: "excelExportFormat", downloadFnName: "downloadExcelResults", isExcel: true },
    geojson:    { dataName: "currentGeoJsonData", dataObj: "currentGeoJsonDataByName", setterFnName: "geoJsonExportFormat", downloadFnName: "downloadGeoJsonResults", isExcel: false },
    kml:        { dataName: "currentKmlData", dataObj: "currentKmlDataByName", setterFnName: "kmlExportFormat", downloadFnName: "downloadKmlResults", isExcel: false },
    shp:        { dataName: "currentShpData", dataObj: "currentShpDataByName", setterFnName: "shpExportFormat", downloadFnName: "downloadShpResults", isExcel: false },
    gpx:        { dataName: "currentGpxData", dataObj: "currentGpxDataByName", setterFnName: "gpxExportFormat", downloadFnName: "downloadGpxResults", isExcel: false }
  };

  var hasAnyFiles = false;
  Object.keys(typeConfig).forEach(function(typeKey) {
    if (filesInfo[typeKey].count > 0) {
      hasAnyFiles = true;
      allAvailableFiles.push({ type: typeKey, files: filesInfo[typeKey].files, config: typeConfig[typeKey] });
    }
  });

  if (!hasAnyFiles) {
    if (window.markers && window.markers.length > 0) { triggerMapExport(targetFormat); return; }
    showToast("Please upload a file or add coordinates first.", "warning");
    return;
  }

  if (allAvailableFiles.length > 1 || (allAvailableFiles.length === 1 && allAvailableFiles[0].files.length > 1)) {
    if (allAvailableFiles.length === 1 && allAvailableFiles[0].files.length > 1) {
      showFileSelectionModal(allAvailableFiles[0].type, allAvailableFiles[0].files, targetFormat);
    } else {
      showMultiTypeFileSelectionModal(allAvailableFiles, targetFormat);
    }
    return;
  }

  // Exactly one file type with exactly one file — process directly
  var entry = allAvailableFiles[0];
  var fn = entry.files[0];
  var typeKey = entry.type;
  var cfg = entry.config;
  if (typeKey === "excel") { window.excelCurrentFileName = fn; window.excelData = window.currentExcelDataByName[fn]; }
  else if (cfg.dataObj) window[cfg.dataObj] = window[cfg.dataName][fn];
  setFormat(cfg.setterFnName, targetFormat);
  if (typeof window[cfg.downloadFnName] === "function") { if (cfg.isExcel) { window.convertExcelData(); setTimeout(function() { window.downloadExcelResults(); }, 500); } else { window[cfg.downloadFnName](); } }
}

function triggerMapExport(format) {
  var fn = { geojson: "exportToGeoJSON", json: "exportToJSON", kml: "exportToKML", kmz: "exportToKMZ", shp: "exportToShp", xlsx: "exportToExcel", csv: "exportToCSV" }[format?.toLowerCase()];
  if (fn && typeof window[fn] === "function") window[fn](); else showToast("Export format \"" + format + "\" is not supported.", "error");
}

// ── Manual Coordinate Tab Switcher ───────────────────────────────────
function showManualTab(tabName, btnEl) {
  document.querySelectorAll(".manual-tab-content").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".modal-tab-btn").forEach(btn => btn.classList.remove("active"));
  var tab = document.getElementById(tabName);
  if (tab) tab.style.display = "block";
  if (btnEl) btnEl.classList.add("active");
  else { var btn = document.querySelector(".modal-tab-btn[onclick*=\"'" + tabName + "'\"]"); if (btn) btn.classList.add("active"); }
}

// ── Theme Toggle ─────────────────────────────────────────────────────
window.toggleTheme = function () {
  document.body.classList.toggle("dark-mode");
  var isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  var btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = isDark ? "☀️" : "🌙";
};

function toggleThemeDashboard() { if (typeof window.toggleTheme === "function") window.toggleTheme(); }

// ── Toast Notifications ──────────────────────────────────────────────
function showToast(message, type) {
  if (!type) type = "success";
  var container = document.getElementById("toastContainer");
  if (!container) return;
  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  var icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = "<span>" + (icons[type] || "✅") + "</span> " + message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    toast.style.transition = "all 0.3s ease-in";
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
  }, 4000);
}

// ── Expose globals ───────────────────────────────────────────────────
window.openModal = openModal;
window.closeModal = closeModal;
window.refreshPage = refreshPage;
window.showManualTab = showManualTab;
window.toggleThemeDashboard = toggleThemeDashboard;
window.triggerConvertAndDownload = triggerConvertAndDownload;
window.showToast = showToast;
window.showPreviewSection = showPreviewSection;
window.handleSmartUpload = handleSmartUpload;
window.renderQueue = renderQueue;
window.queueMapToggle = queueMapToggle;
window.mapRemoveFileFromMap = mapRemoveFileFromMap;