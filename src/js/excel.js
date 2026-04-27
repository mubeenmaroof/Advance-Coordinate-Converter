// Excel and file handling utilities

function handleFileUpload(event) {
  console.log("📁 Excel file upload triggered", event);
  if (window.checkExistingData && window.checkExistingData()) {
    event.target.value = '';
    return;
  }
  const file = event.target.files[0];

  if (!file) {
    console.error("❌ No file selected");
    return;
  }

  console.log("📄 File selected:", file.name, "Size:", file.size, "Type:", file.type);

  if (validateFileSize(file)) {
    console.log("✅ File size validated");
    const clearBtnRow = document.getElementById("excelClearBtnGroup");
    if (clearBtnRow) {
      clearBtnRow.style.display = "block";
      console.log("✅ Clear button shown");
    }
    handleFile(file);
  } else {
    console.error("❌ File size validation failed");
  }
}

function handleFile(file) {
  console.log("📖 Starting file read for:", file.name);
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      showProcessingOverlay("Reading File...");
      window.excelFileExt = file.name.split('.').pop().toLowerCase();
      if (window.excelFileExt === 'xls') window.excelFileExt = 'xlsx'; // treat xls as xlsx for export options
      setTimeout(() => {
        console.log("📖 File loaded, processing...");
        let data;
        if (file.name.endsWith(".csv")) {
          console.log("🔄 Processing as CSV");
          const text = e.target.result;
          data = parseCSV(text);
          window.excelWorkbook = null;
          processExcelData(data);
          if (typeof syncUploadUI === 'function') syncUploadUI();
        } else {
          console.log("🔄 Processing as Excel (.xlsx/.xls)");
          const workbook = XLSX.read(e.target.result, { type: "binary" });
          window.excelWorkbook = workbook;
          if (workbook.SheetNames.length > 1) {
            console.log("📑 Multiple sheets found:", workbook.SheetNames.length);
            displaySheetSelection(workbook);
          } else {
            console.log("📊 Single sheet found");
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            processExcelData(data, sheetName);
            if (typeof syncUploadUI === 'function') syncUploadUI();
          }
        }
        console.log("✅ File processed successfully");
        hideProcessingOverlay();
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

function selectSheet(sheetIndex) {
  if (!window.excelWorkbook) return;
  const workbook = window.excelWorkbook;
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  showProcessingOverlay(`Processing Sheet: ${sheetName}...`);
  setTimeout(() => {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    processExcelData(data, sheetName);
    hideProcessingOverlay();
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
  html += '<div class="button-group" style="margin-bottom: 15px;">';
  html +=
    '<button class="btn btn-success" onclick="selectAllColumns()">✓ Select All</button>';
  html +=
    '<button class="btn btn-secondary" onclick="deselectAllColumns()">✗ Deselect All</button>';
  html +=
    '<button class="btn" onclick="selectDetectedColumns()">✓ Select Auto-Detected Only</button>';
  html += "</div>";
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
  html += '    <div style="display: flex; gap: 10px;">';
  html += '        <button class="btn btn-success" onclick="convertExcelData()" style="padding: 10px 20px; font-weight: 700;">🔄 Convert Data</button>';
  html += '        <button class="btn" onclick="downloadExcelResults()" style="background: #667eea; color: white; border: none; padding: 10px 20px; font-weight: 700;">📥 Download Results</button>';
  html += '        <button class="btn btn-primary" onclick="showExcelOnMap()" style="padding: 10px 20px; font-weight: 700;">📍 Show on Map</button>';
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
         <button class="btn btn-primary" onclick="showExcelOnMap()" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;">
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

function showExcelOnMap() {
  if (!window.convertedExcelData) {
    alert("Please convert data first.");
    return;
  }
  if (coordinateDataStore.length === 0) {
    alert(
      "No coordinates found. Please select at least 2 columns (Latitude and Longitude).",
    );
    return;
  }
  document
    .querySelectorAll(".tab-content")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  const mapTab = document.getElementById("map");
  const mapBtn = document.querySelectorAll(".tab-btn")[3];
  mapTab.classList.add("active");
  mapBtn.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => {
    if (!map) {
      initMap();
    } else {
      map.invalidateSize();
    }
    clearMapMarkers();
    coordinateDataStore.forEach((coord) => {
      if (
        coord.lat !== null &&
        coord.lng !== null &&
        !isNaN(coord.lat) &&
        !isNaN(coord.lng) &&
        Math.abs(coord.lat) <= 90 &&
        Math.abs(coord.lng) <= 180
      ) {
        addDetailedMarker(coord.lat, coord.lng, coord.rowData, coord.rowIndex);
      }
    });
    if (markers.length > 0) {
      setTimeout(() => {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
      }, 200);
    } else {
      alert("No valid coordinates to display on map.");
    }
    updateMapStats();
  }, 300);
}

function clearExcelData() {
  window.excelWorkbook = null;
  window.convertedExcelData = null;
  excelData = null;
  detectedColumns = [];
  coordinateDataStore = [];

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
window.selectAllColumns = selectAllColumns;
window.deselectAllColumns = deselectAllColumns;
window.selectDetectedColumns = selectDetectedColumns;
window.convertExcelData = convertExcelData;
window.downloadExcelResults = downloadExcelResults;
window.showExcelOnMap = showExcelOnMap;
window.clearExcelData = clearExcelData;

