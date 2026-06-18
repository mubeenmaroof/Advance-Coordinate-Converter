// Excel and file handling utilities

// Initialize global data storage for multiple Excel files
if (!window.currentExcelDataByName) {
  window.currentExcelDataByName = {};
}

function handleFileUpload(event) {
  console.log("📁 Excel file upload triggered", event);
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  const files = event.target.files;

  if (!files || files.length === 0) {
    console.error("❌ No files selected");
    return;
  }

  console.log("✅ File size validated");
  const clearBtnRow = document.getElementById("excelClearBtnGroup");
  if (clearBtnRow) {
    clearBtnRow.style.display = "block";
    console.log("✅ Clear button shown");
  }
  
  // Process each file
  Array.from(files).forEach(file => {
    handleFile(file);
  });
}

function handleFile(file) {
  console.log("📖 Starting file read for:", file.name);
  
  if (!validateFileSize(file)) {
    console.error("❌ File size validation failed");
    return;
  }
  
  window.excelCurrentFileName = file.name;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      showProcessingOverlay("Reading File...", 10);
      window.excelFileExt = file.name.split('.').pop().toLowerCase();
      if (window.excelFileExt === 'xls') window.excelFileExt = 'xlsx'; // treat xls as xlsx for export options
      setTimeout(() => {
        updateProcessingProgress(30);
        console.log("📖 File loaded, processing...");
        let data;
        if (file.name.endsWith(".csv")) {
          console.log("🔄 Processing as CSV");
          updateProcessingProgress(50);
          const text = e.target.result;
          data = parseCSV(text);
          processExcelData(data, file.name);
          updateProcessingProgress(80);
          if (typeof syncUploadUI === 'function') syncUploadUI();
          updateProcessingProgress(100);
          setTimeout(() => hideProcessingOverlay(), 200);
        } else {
          console.log("🔄 Processing as Excel (.xlsx/.xls)");
          updateProcessingProgress(40);
          const workbook = XLSX.read(e.target.result, { type: "binary" });
          updateProcessingProgress(60);
          if (workbook.SheetNames.length > 1) {
            console.log("📑 Multiple sheets found:", workbook.SheetNames.length);
            displaySheetSelectionForFile(workbook, file.name);
            updateProcessingProgress(100);
            setTimeout(() => hideProcessingOverlay(), 200);
          } else {
            console.log("📊 Single sheet found");
            updateProcessingProgress(70);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            processExcelData(data, file.name);
            updateProcessingProgress(90);
            if (typeof syncUploadUI === 'function') syncUploadUI();
            updateProcessingProgress(100);
            setTimeout(() => hideProcessingOverlay(), 200);
          }
        }
        console.log("✅ File processed successfully");
      }, 100);
    } catch (error) {
      console.error("❌ Error reading file:", error);
      hideProcessingOverlay();
      document.getElementById("excelResult").innerHTML =
        `<div class="error">Error reading file: ${error.message}</div>`;
    }
  };

  reader.onerror = function (error) {
    console.error("❌ FileReader error:", error);
    hideProcessingOverlay();
    document.getElementById("excelResult").innerHTML =
      `<div class="error">Error reading file: File read error</div>`;
  };

  showProcessingOverlay("Reading File...");
  if (file.name.endsWith(".csv")) {
    reader.readAsText(file);
  } else {
    reader.readAsBinaryString(file);
  }
}

function displaySheetSelection(workbook) {
  const selectionDiv = document.getElementById("columnSelection");
  let html = '<div class="filter-controls" style="margin-top: 20px;">';
  html += "<h3>📑 Select Sheet to Process</h3>";
  html += "<p>This Excel file contains multiple sheets. Please select one:</p>";
  html += '<div style="margin: 20px 0;">';
  workbook.SheetNames.forEach((sheetName, index) => {
    html += `
            <div class="preset-item" style="cursor: pointer;" onclick="selectSheet(${index})">
                <h4>📄 ${sheetName}</h4>
                <button class="btn">Select This Sheet</button>
            </div>
        `;
  });
  html += "</div>";
  html += "</div>";
  selectionDiv.innerHTML = html;
  document.getElementById("excelResult").innerHTML = "";
}

function displaySheetSelectionForFile(workbook, fileName) {
  const selectionDiv = document.getElementById("columnSelection");
  let html = '<div class="filter-controls" style="margin-top: 20px;">';
  html += "<h3>📑 Select Sheet to Process</h3>";
  html += `<p><strong>${fileName}</strong> contains multiple sheets. Please select one:</p>`;
  html += '<div style="margin: 20px 0;">';
  workbook.SheetNames.forEach((sheetName, index) => {
    html += `
            <div class="preset-item" style="cursor: pointer;" onclick="selectSheetForFile(${index}, '${fileName}')">
                <h4>📄 ${sheetName}</h4>
                <button class="btn">Select This Sheet</button>
            </div>
        `;
  });
  html += "</div>";
  html += "</div>";
  selectionDiv.innerHTML = html;
  document.getElementById("excelResult").innerHTML = "";
  
  // Store workbook and filename for later use
  window.excelWorkbookForFile = { workbook, fileName };
}

function selectSheet(sheetIndex) {
  if (!window.excelWorkbook) return;
  const workbook = window.excelWorkbook;
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  showProcessingOverlay(`Processing Sheet: ${sheetName}...`, 10);
  setTimeout(() => {
    updateProcessingProgress(50);
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    updateProcessingProgress(80);
    processExcelData(data, sheetName);
    updateProcessingProgress(100);
    setTimeout(() => hideProcessingOverlay(), 200);
  }, 100);
}

function selectSheetForFile(sheetIndex, fileName) {
  if (!window.excelWorkbookForFile) return;
  const { workbook } = window.excelWorkbookForFile;
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  showProcessingOverlay(`Processing Sheet: ${sheetName}...`, 10);
  setTimeout(() => {
    updateProcessingProgress(50);
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    updateProcessingProgress(80);
    processExcelData(data, sheetName);
    updateProcessingProgress(100);
    setTimeout(() => hideProcessingOverlay(), 200);
  }, 100);
}

function isCoordinateColumn(columnData) {
  let coordinateCount = 0;
  const sampleSize = Math.min(10, columnData.length);
  for (let i = 0; i < sampleSize; i++) {
    const value = String(columnData[i]).trim();
    if (
      isDMS(value) ||
      (!isNaN(parseFloat(value)) && Math.abs(parseFloat(value)) <= 180)
    ) {
      coordinateCount++;
    }
  }
  return coordinateCount > sampleSize * 0.5;
}

function processExcelData(data, sheetName = null) {
  if (!data || data.length < 2) {
    document.getElementById("excelResult").innerHTML =
      '<div class="error">File is empty or invalid</div>';
    return;
  }
  
  const fileName = window.excelCurrentFileName || (sheetName ? sheetName : 'Excel Data');
  
  // Store in the multi-file object
  window.currentExcelDataByName = window.currentExcelDataByName || {};
  window.currentExcelDataByName[fileName] = data;
  
  // Keep backward compatibility
  excelData = data;
  
  const headers = data[0];
  detectedColumns = [];
  for (let colIndex = 0; colIndex < headers.length; colIndex++) {
    const columnData = data
      .slice(1)
      .map((row) => row[colIndex])
      .filter((val) => val);
    if (isCoordinateColumn(columnData)) {
      detectedColumns.push({
        index: colIndex,
        name: headers[colIndex] || `Column ${colIndex + 1}`,
        detected: true,
      });
    }
  }
  
  // Show toast notification with file info
  const rowCount = data.length - 1;
  if (typeof showToast === 'function') {
    showToast(`✓ Loaded: ${fileName} (${rowCount} rows)`, "success");
  }
  
  displayColumnSelection(headers, sheetName);
}

function displayColumnSelection(headers, sheetName = null) {
  const selectionDiv = document.getElementById("columnSelection");
  let html = '<div class="filter-controls" style="margin-top: 20px;">';
  if (sheetName) {
    html += `<div class="result" style="margin-bottom: 20px;">`;
    html += `<h4>📄 Selected Sheet: <strong>${sheetName}</strong></h4>`;
    if (window.excelWorkbook && window.excelWorkbook.SheetNames.length > 1) {
      html += `<button class="btn btn-secondary" onclick="displaySheetSelection(window.excelWorkbook)" style="margin-top: 10px;">Change Sheet</button>`;
    }
    html += `</div>`;
  }
  html += "<h3>📊 Select Columns to Convert</h3>";
  if (detectedColumns.length > 0) {
    html +=
      '<p style="color: #28a745; font-weight: 600; margin-bottom: 15px;">✓ Automatically detected ' +
      detectedColumns.length +
      " coordinate column(s)</p>";
  }
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">';
  html += '  <span style="font-weight:700;font-size:0.85em;color:#475569;margin-right:4px;">Quick Select:</span>';
  html += '  <button class="tool-action-btn secondary" onclick="selectAllColumns()" style="font-size:0.78em;padding:5px 14px;border-radius:6px;">☑ Select All</button>';
  html += '  <button class="tool-action-btn secondary" onclick="deselectAllColumns()" style="font-size:0.78em;padding:5px 14px;border-radius:6px;">☐ Deselect All</button>';
  html += '  <button class="tool-action-btn primary" onclick="selectDetectedColumns()" style="font-size:0.78em;padding:5px 14px;border-radius:6px;">⚡ Auto-Detect</button>';
  html += '</div>';
  html += '<div class="checkbox-group">';
  headers.forEach((header, index) => {
    const isDetected = detectedColumns.some((col) => col.index === index);
    const checked = isDetected ? "checked" : "";
    const badge = isDetected
      ? '<span class="badge badge-success">Auto-detected</span>'
      : "";
    html += `
            <div class="checkbox-item">
                <input type="checkbox" class="column-checkbox" id="col_${index}" value="${index}" ${checked}>
                <label for="col_${index}">${header || `Column ${index + 1}`}${badge}</label>
            </div>
        `;
  });
  html += "</div>";
  html += "</div>";
  html += '<div class="input-group">';
  html += "<label>Convert To:</label>";
  html += '<select id="excelConversionType">';
  html += '<option value="auto">Auto Detect & Convert</option>';
  html += '<option value="dd">To Decimal Degrees (DD)</option>';
  html += '<option value="dms">To DMS</option>';
  html += "</select>";
  html += "</div>";
  html += '<div style="margin: 15px 0; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #667eea; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">';
  html += '    <label style="font-weight: 700; font-size: 0.9em; color: #667eea;">Export Format:</label>';
  html += `    ${getExportOptionsHTML(window.excelFileExt || 'xlsx', 'excelExportFormat')}`;
  html += '    <div style="display: flex; gap: 10px; flex-wrap: wrap;">';
  html += '        <button class="tool-action-btn primary" onclick="convertExcelData()">🔄 Convert Data</button>';
  html += '        <button class="tool-action-btn secondary" onclick="downloadExcelResults()">📥 Download Results</button>';
  html += '        <button class="tool-action-btn success" onclick="showExcelOnMap(); closeModal(\'previewModal\');">📍 Show on Map</button>';
  html += '    </div>';
  html += '</div>';
  selectionDiv.innerHTML = html;
}

function selectAllColumns() {
  const checkboxes = document.querySelectorAll(".column-checkbox");
  checkboxes.forEach((cb) => (cb.checked = true));
}

function deselectAllColumns() {
  const checkboxes = document.querySelectorAll(".column-checkbox");
  checkboxes.forEach((cb) => (cb.checked = false));
}

function selectDetectedColumns() {
  const checkboxes = document.querySelectorAll(".column-checkbox");
  checkboxes.forEach((cb) => {
    const index = parseInt(cb.value);
    cb.checked = detectedColumns.some((col) => col.index === index);
  });
}

function convertExcelData() {
  const selectedColumns = [];
  const checkboxes = document.querySelectorAll(
    '#columnSelection input[type="checkbox"]:checked',
  );
  checkboxes.forEach((cb) => {
    selectedColumns.push(parseInt(cb.value));
  });
  if (selectedColumns.length === 0) {
    document.getElementById("excelResult").innerHTML =
      '<div class="error">Please select at least one column to convert</div>';
    return;
  }
  const conversionType = document.getElementById("excelConversionType").value;

  showProcessingOverlay("Converting Coordinates...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    const convertedData = result.convertedData;
    coordinateDataStore = [];

    // Process coordinates for map after conversion
    for (let rowIndex = 1; rowIndex < convertedData.length; rowIndex++) {
      const rowData = {};
      const coordinates = [];
      convertedData[0].forEach((header, colIndex) => {
        rowData[header || `Column ${colIndex + 1}`] =
          convertedData[rowIndex][colIndex];
      });

      selectedColumns.forEach((colIndex) => {
        const value = convertedData[rowIndex][colIndex];
        if (value) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && Math.abs(numValue) <= 180) {
            coordinates.push(numValue);
          } else if (isDMS(String(value))) {
            const dd = parseDMS(String(value));
            if (dd !== null) {
              coordinates.push(dd);
            }
          }
        }
      });

      if (coordinates.length >= 2) {
        coordinateDataStore.push({
          lat: coordinates[0],
          lng: coordinates[1],
          rowIndex: rowIndex,
          rowData: rowData,
        });
      }
    }
    displayConvertedData(convertedData, selectedColumns);
  };

  worker.postMessage({
    type: 'convert',
    payload: {
      data: excelData,
      selectedColumns: selectedColumns,
      conversionType: conversionType
    }
  });
}

function displayConvertedData(data, convertedColumns) {
  const resultDiv = document.getElementById("excelResult");
  let html = `
    <div class="result-card" style="animation: fadeIn 0.5s ease-out;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0; color: #667eea; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.2em;">✅</span> Conversion Complete
          </h3>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9em;">
            Converted ${convertedColumns.length} column(s) in ${data.length - 1} row(s)
          </p>
        </div>
        <div style="background: rgba(102, 126, 234, 0.1); color: #667eea; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 0.9em;">
          📍 ${coordinateDataStore.length} Coordinates Found
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
  `;

  data[0].forEach((header, index) => {
    const isConverted = convertedColumns.includes(index);
    const badge = isConverted
      ? '<span class="badge" style="background: #fff3cd; color: #856404; font-size: 10px; margin-left: 5px;">Converted</span>'
      : "";
    html += `<th>${header || `Column ${index + 1}`}${badge}</th>`;
  });

  html += "</tr></thead><tbody>";
  
  const displayRows = Math.min(10, data.length - 1);
  for (let i = 1; i <= displayRows; i++) {
    html += "<tr>";
    data[i].forEach((cell) => {
      html += `<td>${cell || ""}</td>`;
    });
    html += "</tr>";
  }

  if (data.length > 11) {
    html += `
      <tr>
        <td colspan="${data[0].length}" style="text-align: center; padding: 20px; color: #94a3b8; background: #f8fafc; font-style: italic;">
          ... and ${data.length - 11} more rows in dataset
        </td>
      </tr>`;
  }

  html += `
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 20px; display: flex; gap: 10px;">
         <button class="btn btn-primary" onclick="showExcelOnMap(); closeModal(\'previewModal\');" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;">
           <span>🗺️</span> View on Map
         </button>
      </div>
    </div>
  `;

  resultDiv.innerHTML = html;
  window.convertedExcelData = data;
}

function downloadExcelResults() {
  if (!window.convertedExcelData || !coordinateDataStore || coordinateDataStore.length === 0) {
    alert("Please convert data first and ensure coordinates are present.");
    return;
  }

  const format = document.getElementById("excelExportFormat")?.value || "csv";
  handleGenericExport(format, coordinateDataStore, "excelFile");
}

function showExcelOnMap(fileName) {
  // Try converted data first (after user clicks "Convert Data")
  if (window.convertedExcelData && coordinateDataStore && coordinateDataStore.length > 0) {
    if (typeof showTab === 'function') showTab('map');
    setTimeout(function() {
      if (!map) initMap(); else map.invalidateSize();
      clearMapMarkers();
      coordinateDataStore.forEach(function(coord) {
        if (coord.lat !== null && coord.lng !== null && !isNaN(coord.lat) && !isNaN(coord.lng) &&
            Math.abs(coord.lat) <= 90 && Math.abs(coord.lng) <= 180) {
          addDetailedMarker(coord.lat, coord.lng, coord.rowData, coord.rowIndex);
        }
      });
      if (markers.length > 0) {
        setTimeout(function() {
          var group = L.featureGroup(markers);
          map.fitBounds(group.getBounds().pad(0.1));
        }, 200);
      }
      if (typeof updateMapStats === 'function') updateMapStats();
    }, 300);
    return;
  }
  
  // Fallback: auto-detect lat/lng columns from raw Excel data
  var data = null;
  if (fileName && window.currentExcelDataByName && window.currentExcelDataByName[fileName]) {
    data = window.currentExcelDataByName[fileName];
  } else if (window.excelData && window.excelData.length > 1) {
    data = window.excelData;
  } else if (window.currentExcelDataByName) {
    var keys = Object.keys(window.currentExcelDataByName);
    if (keys.length > 0) data = window.currentExcelDataByName[keys[0]];
  }
  
  if (!data || data.length < 2) {
    if (typeof showToast === 'function') showToast("No Excel data available. Please convert coordinates first.", "warning");
    return;
  }
  
  if (typeof showTab === 'function') showTab('map');
  
  setTimeout(function() {
    if (!map && typeof initMap === 'function') initMap();
    else if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
    if (typeof clearMapMarkers === 'function') clearMapMarkers();
    
    var key = 'excel::' + (fileName || 'data');
    if (mapVisibleLayers && mapVisibleLayers[key] && map) {
      try { map.removeLayer(mapVisibleLayers[key]); } catch(e) {}
      delete mapVisibleLayers[key];
    }
    
    var headers = data[0] || [];
    var markerCount = 0;
    var featureGroup = L.featureGroup ? new L.featureGroup() : null;
    
    // Auto-detect lat/lng columns
    var latIdx = -1, lngIdx = -1;
    headers.forEach(function(h, idx) {
      var hl = (h || '').toLowerCase();
      if (hl === 'lat' || hl === 'latitude' || hl === 'y' || hl === 'y_lat') latIdx = idx;
      if (hl === 'lng' || hl === 'lon' || hl === 'long' || hl === 'longitude' || hl === 'x' || hl === 'x_lng') lngIdx = idx;
    });
    
    if (latIdx === -1 || lngIdx === -1) {
      for (var ci = 0; ci < headers.length && latIdx === -1; ci++) {
        var sampleVal = parseFloat(data[1] && data[1][ci]);
        if (!isNaN(sampleVal) && Math.abs(sampleVal) <= 90) latIdx = ci;
      }
      for (var ci2 = 0; ci2 < headers.length && lngIdx === -1; ci2++) {
        if (ci2 === latIdx) continue;
        var sampleVal2 = parseFloat(data[1] && data[1][ci2]);
        if (!isNaN(sampleVal2) && Math.abs(sampleVal2) <= 180) lngIdx = ci2;
      }
    }
    
    if (latIdx === -1 || lngIdx === -1) {
      if (typeof showToast === 'function') showToast("No lat/lng columns detected. Please convert coordinates first.", "warning");
      return;
    }
    
    var layers = [];
    for (var r = 1; r < data.length; r++) {
      var lat = parseFloat(data[r][latIdx]);
      var lng = parseFloat(data[r][lngIdx]);
      if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      markerCount++;
      var props = {};
      headers.forEach(function(h, hi) {
        if (data[r][hi] !== undefined && data[r][hi] !== null) {
          props[h || ('Col' + (hi + 1))] = data[r][hi];
        }
      });
      props._row = r;
      if (typeof addDetailedMarker === 'function') {
        var m = addDetailedMarker(lat, lng, props, markerCount);
        if (m) layers.push(m);
      } else {
        layers.push(L.circleMarker([lat, lng], { radius: 7, fillColor: "#e67e22", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1 }));
      }
    }
    
    if (layers.length > 0 && featureGroup) {
      layers.forEach(function(l) { featureGroup.addLayer(l); });
      featureGroup.addTo(map);
      mapVisibleLayers[key] = featureGroup;
      try {
        var bounds = featureGroup.getBounds();
        if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }
      } catch(e) {}
    }
    
    if (typeof showToast === 'function') showToast("📍 " + markerCount + " rows mapped from Excel", "success");
  }, 100);
}

function clearExcelData() {
  window.excelWorkbook = null;
  window.convertedExcelData = null;
  excelData = null;
  detectedColumns = [];
  coordinateDataStore = [];
  window.currentExcelDataByName = {};

  if (typeof clearMapMarkers === "function") clearMapMarkers();
  if (typeof syncUploadUI === "function") syncUploadUI();
  
  const fileInput = document.getElementById("excelFile");
  if (fileInput) fileInput.value = "";

  const selectionDiv = document.getElementById("columnSelection");
  if (selectionDiv) selectionDiv.innerHTML = "";

  const resultDiv = document.getElementById("excelResult");
  if (resultDiv) resultDiv.innerHTML = "";

  const clearBtnRow = document.getElementById("excelClearBtnGroup");
  if (clearBtnRow) clearBtnRow.style.display = "none";
}

// expose
window.handleFileUpload = handleFileUpload;
window.handleFile = handleFile;
window.selectSheet = selectSheet;
window.selectSheetForFile = selectSheetForFile;
window.selectAllColumns = selectAllColumns;
window.deselectAllColumns = deselectAllColumns;
window.selectDetectedColumns = selectDetectedColumns;
window.convertExcelData = convertExcelData;
window.downloadExcelResults = downloadExcelResults;
window.showExcelOnMap = showExcelOnMap;
window.clearExcelData = clearExcelData;

// ==================== Individual Excel File Operations ====================

function deleteIndividualExcelByName(fileName) {
  if (!window.currentExcelDataByName || !window.currentExcelDataByName[fileName]) {
    return;
  }
  
  delete window.currentExcelDataByName[fileName];
  
  // If no more Excel files, clear the backward-compatible reference
  if (Object.keys(window.currentExcelDataByName).length === 0) {
    excelData = null;
    coordinateDataStore = [];
  } else {
    // Update excelData to first remaining file for backward compatibility
    const firstFileName = Object.keys(window.currentExcelDataByName)[0];
    excelData = window.currentExcelDataByName[firstFileName];
  }
  
  if (typeof syncUploadUI === 'function') syncUploadUI();
}

function previewIndividualExcel(fileName) {
  if (!window.currentExcelDataByName || !window.currentExcelDataByName[fileName]) {
    alert("Excel file not found");
    return;
  }
  
  const data = window.currentExcelDataByName[fileName];
  
  if (!data || data.length < 2) {
    alert("No valid data found in this Excel file");
    return;
  }
  
  const headers = data[0];
  const displayCount = Math.min(data.length - 1, 10);
  
  let html = `<div class="result-card">
    <h3 style="color: #667eea; margin-bottom: 15px;">📊 ${fileName}</h3>
    <div style="margin-bottom: 15px; padding: 12px; background: #f0f7ff; border-left: 3px solid #667eea; border-radius: 4px;">
      <strong style="color: #667eea;">Columns:</strong> ${headers.length} | 
      <strong style="color: #667eea;">Rows:</strong> ${data.length - 1}
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h || '-'}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.slice(1, displayCount + 1).map((row, i) => `
            <tr>
              ${row.map(cell => `<td style="font-size: 0.85em;">${cell || '-'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${data.length - 1 > displayCount ? `<p style="color: #718096; font-size: 0.85em; margin-top: 10px;">... and ${data.length - 1 - displayCount} more rows</p>` : ''}
  </div>`;
  
  document.getElementById("excelResult").innerHTML = html;
  showTab("results");
}

// Alias for queue compatibility
function showIndividualExcelOnMap(fileName) {
  showExcelOnMap(fileName);
}

// Expose individual functions globally
window.deleteIndividualExcelByName = deleteIndividualExcelByName;
window.previewIndividualExcel = previewIndividualExcel;
window.showExcelOnMap = showExcelOnMap;
window.showIndividualExcelOnMap = showIndividualExcelOnMap;

