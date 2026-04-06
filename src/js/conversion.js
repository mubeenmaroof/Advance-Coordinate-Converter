// conversion related utilities and UI handlers

// global state for batch processing
batchResults = [];
processedData = [];

function convertCoordinate(input, type = "auto") {
  const trimmed = input.trim();
  if (type === "auto") {
    if (isDMS(trimmed)) {
      const dd = parseDMS(trimmed);
      return dd !== null ? dd.toFixed(currentPrecision) : "Error";
    } else {
      const dd = parseFloat(trimmed);
      if (!isNaN(dd)) {
        const isLong = Math.abs(dd) > 90;
        return formatDMS(dd, isLong);
      }
    }
  } else if (type === "dd") {
    if (isDMS(trimmed)) {
      const dd = parseDMS(trimmed);
      return dd !== null ? dd.toFixed(currentPrecision) : "Error";
    } else {
      return parseFloat(trimmed).toFixed(currentPrecision);
    }
  } else if (type === "dms") {
    if (!isDMS(trimmed)) {
      const dd = parseFloat(trimmed);
      if (!isNaN(dd)) {
        const isLong = Math.abs(dd) > 90;
        return formatDMS(dd, isLong);
      }
    } else {
      return trimmed;
    }
  }
  return "Invalid format";
}

function convertSingle() {
  const input = document.getElementById("singleInput").value.trim();
  const type = document.getElementById("conversionType").value;
  const resultDiv = document.getElementById("singleResult");
  if (!input) {
    resultDiv.innerHTML = '<div class="error">Please enter a coordinate</div>';
    return;
  }
  if (input.includes(",")) {
    const parts = input.split(",").map((p) => p.trim());
    if (parts.length === 2) {
      const result1 = convertCoordinate(parts[0], type);
      const result2 = convertCoordinate(parts[1], type);
      addToHistory({
        input,
        output: `${result1}, ${result2}`,
        type,
        timestamp: new Date(),
      });
      resultDiv.innerHTML = `
                <div class="result">
                    <h3>✅ Conversion Result:</h3>
                    <div style="background: white; padding: 15px; border-radius: 8px; margin-top: 10px; border: 2px solid #667eea;">
                        <p style="margin: 0 0 10px 0; font-weight: 600; color: #666;">Input:</p>
                        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 1.1em; margin-bottom: 15px;">
                            ${parts[0]}, ${parts[1]}
                        </div>
                        <p style="margin: 0 0 10px 0; font-weight: 600; color: #666;">Output:</p>
                        <div style="background: #e7f3ff; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 1.1em; color: #0066cc; font-weight: 600;">
                            ${result1}, ${result2}
                        </div>
                    </div>
                </div>
            `;
      return;
    }
  }
  const result = convertCoordinate(input, type);
  addToHistory({ input, output: result, type, timestamp: new Date() });
  resultDiv.innerHTML = `
        <div class="result">
            <h3>✅ Conversion Result:</h3>
            <div style="background: white; padding: 15px; border-radius: 8px; margin-top: 10px; border: 2px solid #667eea;">
                <p style="margin: 0 0 10px 0; font-weight: 600; color: #666;">Input:</p>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 1.1em; margin-bottom: 15px;">
                    ${input}
                </div>
                <p style="margin: 0 0 10px 0; font-weight: 600; color: #666;">Output:</p>
                <div style="background: #e7f3ff; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 1.1em; color: #0066cc; font-weight: 600;">
                    ${result}
                </div>
            </div>
        </div>
    `;
}

function showOnMap() {
  const input = document.getElementById("singleInput").value;
  if (!input.trim()) {
    alert("Please enter a coordinate first");
    return;
  }
  showTab("map");
  setTimeout(() => {
    if (!map) initMap();
    addMarkerFromInput(input);
  }, 100);
}

function convertBatch() {
  const input = document.getElementById("batchInput").value;
  const type = document.getElementById("batchConversionType").value;
  const resultDiv = document.getElementById("batchResult");
  if (!input.trim()) {
    resultDiv.innerHTML = '<div class="error">Please enter coordinates</div>';
    return;
  }
  const lines = input.split("\n").filter((line) => line.trim());

  showProcessingOverlay("Converting Batch...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    batchResults = result.results;
    processedData = batchResults;
    let tableHTML = `
          <div class="result" style="margin-bottom: 20px;">
              <h3>✅ Batch Conversion Complete</h3>
              <p>Converted ${batchResults.length} coordinate(s)</p>
          </div>
          <div class="table-container">
              <table>
                  <thead>
                      <tr>
                          <th style="width: 60px;">#</th>
                          <th style="width: 45%;">Input</th>
                          <th style="width: 45%;">Output</th>
                      </tr>
                  </thead>
                  <tbody>
      `;
    batchResults.forEach((res, index) => {
      tableHTML += `
              <tr>
                  <td style="text-align: center; font-weight: 600;">${index + 1}</td>
                  <td>
                      <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-family: monospace;">
                          ${res.input}
                      </div>
                  </td>
                  <td>
                      <div style="background: #e7f3ff; padding: 8px; border-radius: 4px; font-family: monospace; color: #0066cc; font-weight: 600;">
                          ${res.output}
                      </div>
                  </td>
              </tr>
          `;
    });
    tableHTML += `
                  </tbody>
              </table>
          </div>
      `;
    resultDiv.innerHTML = tableHTML;
  };

  worker.postMessage({
    type: 'batch',
    payload: {
      lines: lines,
      type: type
    }
  });
}

function copyResults() {
  if (batchResults.length === 0) {
    alert("Please convert coordinates first");
    return;
  }
  const text = batchResults.map((r) => r.output).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    alert("Results copied to clipboard!");
  });
}

function downloadCSV() {
  if (batchResults.length === 0) {
    alert("Please convert coordinates first");
    return;
  }
  let csv = "";
  csv += "# Batch Coordinate Conversion Results\n";
  csv += `# Generated: ${new Date().toLocaleString()}\n`;
  csv += `# Total Conversions: ${batchResults.length}\n`;
  csv += `# Precision: ${currentPrecision} decimal places\n`;
  csv += "#\n";
  csv += "Input Coordinate,Converted Output\n";
  batchResults.forEach((r) => {
    const input = String(r.input).replace(/"/g, '""');
    const output = String(r.output).replace(/"/g, '""');
    csv += `"${input}","${output}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = window.generateExportFileName(null, "BatchConverted", "csv");
  a.click();
  window.URL.revokeObjectURL(url);
}

function showBatchOnMap() {
  if (batchResults.length === 0) {
    alert("Please convert coordinates first");
    return;
  }
  showTab("map");
  setTimeout(() => {
    if (!map) initMap();
    clearMapMarkers();
    batchResults.forEach((result) => {
      addMarkerFromInput(result.output);
    });
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, 100);
}

// additional batch processing utilities moved from inline script
function removeDuplicates() {
  if (processedData.length === 0) {
    alert("Please convert some data first in Batch Conversion tab");
    return;
  }
  const unique = [];
  const seen = new Set();
  processedData.forEach((item) => {
    if (!seen.has(item.output)) {
      seen.add(item.output);
      unique.push(item);
    }
  });
  processedData = unique;
  displayProcessedData();
}

function applyFilters() {
  if (processedData.length === 0) {
    alert("Please convert some data first in Batch Conversion tab");
    return;
  }
  let filtered = [...processedData];
  const latMin = parseFloat(document.getElementById("latMin").value);
  const latMax = parseFloat(document.getElementById("latMax").value);
  const lonMin = parseFloat(document.getElementById("lonMin").value);
  const lonMax = parseFloat(document.getElementById("lonMax").value);
  filtered = filtered.filter((item) => {
    const val = parseFloat(item.output);
    if (isNaN(val)) return true;
    let keep = true;
    if (!isNaN(latMin) && Math.abs(val) <= 90 && val < latMin) keep = false;
    if (!isNaN(latMax) && Math.abs(val) <= 90 && val > latMax) keep = false;
    if (!isNaN(lonMin) && Math.abs(val) > 90 && val < lonMin) keep = false;
    if (!isNaN(lonMax) && Math.abs(val) > 90 && val > lonMax) keep = false;
    return keep;
  });
  const sortOption = document.getElementById("sortOption").value;
  if (sortOption !== "none") {
    filtered.sort((a, b) => {
      const aVal = parseFloat(a.output);
      const bVal = parseFloat(b.output);
      if (sortOption === "lat-asc" || sortOption === "lon-asc") {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
  }
  processedData = filtered;
  displayProcessedData();
}

function displayProcessedData() {
  const resultDiv = document.getElementById("processingResult");
  let html = '<div class="result">';
  html += `<h3>✅ Processed ${processedData.length} records</h3>`;
  html += "</div>";
  html += '<div class="table-container">';
  html +=
    "<table><thead><tr><th>#</th><th>Input</th><th>Output</th></tr></thead><tbody>";
  processedData.forEach((item, index) => {
    html += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.input}</td>
                <td>${item.output}</td>
            </tr>
        `;
  });
  html += "</tbody></table></div>";
  resultDiv.innerHTML = html;
}

// history and preset data
conversionHistory = JSON.parse(
  localStorage.getItem("conversionHistory") || "[]",
);
savedPresets = JSON.parse(localStorage.getItem("savedPresets") || "[]");

function addToHistory(item) {
  conversionHistory.unshift(item);
  if (conversionHistory.length > 50) conversionHistory.pop();
  localStorage.setItem("conversionHistory", JSON.stringify(conversionHistory));
  loadHistory();
}

function loadHistory() {
  const listDiv = document.getElementById("historyList");
  if (conversionHistory.length === 0) {
    listDiv.innerHTML = "<p>No conversion history yet</p>";
    return;
  }
  let html = "";
  conversionHistory.forEach((item, index) => {
    const date = new Date(item.timestamp);
    html += `
            <div class="history-item" onclick="useHistoryItem(${index})">
                <strong>${item.input}</strong> → ${item.output}
                <br><small>${date.toLocaleString()}</small>
            </div>
        `;
  });
  listDiv.innerHTML = html;
}

function useHistoryItem(index) {
  const item = conversionHistory[index];
  document.getElementById("singleInput").value = item.input;
  showTab("single");
  document.querySelector(".tab-btn").click();
}

function clearHistory() {
  if (confirm("Clear all conversion history?")) {
    conversionHistory = [];
    localStorage.setItem(
      "conversionHistory",
      JSON.stringify(conversionHistory),
    );
    loadHistory();
  }
}

function savePreset() {
  const name = document.getElementById("presetName").value;
  const conversion = document.getElementById("presetConversion").value;
  const precision = document.getElementById("presetPrecision").value;
  const mapLayer = document.getElementById("presetMapLayer").value;
  const markerStyle = document.getElementById("presetMarkerStyle").value;
  const markerSize = document.getElementById("presetMarkerSize").value;

  if (!name.trim()) {
    alert("Please enter a preset name");
    return;
  }
  savedPresets.push({
    name,
    conversion,
    precision: parseInt(precision),
    mapLayer,
    markerStyle,
    markerSize: parseInt(markerSize),
    created: new Date(),
  });
  localStorage.setItem("savedPresets", JSON.stringify(savedPresets));
  loadPresets();
  document.getElementById("presetName").value = "";
}

function loadPresets() {
  const listDiv = document.getElementById("presetsList");
  if (savedPresets.length === 0) {
    listDiv.innerHTML = "<p>No saved presets yet</p>";
    return;
  }
  let html = "";
  savedPresets.forEach((preset, index) => {
    html += `
            <div class="preset-item">
                <h4>${preset.name}</h4>
                <p><strong>Conversion:</strong> ${preset.conversion.toUpperCase()} | <strong>Precision:</strong> ${preset.precision}</p>
                <p><strong>Map:</strong> ${preset.mapLayer || 'Street'} | <strong>Style:</strong> ${preset.markerStyle || 'Numbered'} | <strong>Size:</strong> ${preset.markerSize || 35}px</p>
                <div class="button-group">
                    <button class="btn btn-secondary" onclick="applyPreset(${index})">Apply Preset</button>
                    <button class="btn btn-danger" onclick="deletePreset(${index})">Delete</button>
                </div>
            </div>
        `;
  });
  listDiv.innerHTML = html;
}

function applyPreset(index) {
  const preset = savedPresets[index];

  // Apply Conversion Settings
  document.getElementById("conversionType").value = preset.conversion;
  document.getElementById("precisionSlider").value = preset.precision;
  updatePrecision(preset.precision);

  // Apply Map Environment Settings
  if (preset.mapLayer && window.changeMapLayer) {
    window.changeMapLayer(preset.mapLayer);
  }

  if (preset.markerStyle && window.changeMarkerStyle) {
    window.changeMarkerStyle(preset.markerStyle);
  }

  if (preset.markerSize && window.changeMarkerSize) {
    window.changeMarkerSize(preset.markerSize);
  }

  showTab("single");
  alert(`Preset "${preset.name}" applied! Map and conversion settings updated.`);
}

function deletePreset(index) {
  if (confirm("Delete this preset?")) {
    savedPresets.splice(index, 1);
    localStorage.setItem("savedPresets", JSON.stringify(savedPresets));
    loadPresets();
  }
}

// initialization
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    loadHistory();
    loadPresets();
  });
} else {
  loadHistory();
  loadPresets();
}

// expose
window.convertCoordinate = convertCoordinate;
window.convertSingle = convertSingle;
window.showOnMap = showOnMap;
window.convertBatch = convertBatch;
window.copyResults = copyResults;
window.downloadCSV = downloadCSV;
window.showBatchOnMap = showBatchOnMap;
window.removeDuplicates = removeDuplicates;
window.applyFilters = applyFilters;
window.displayProcessedData = displayProcessedData;
window.addToHistory = addToHistory;
window.loadHistory = loadHistory;
window.useHistoryItem = useHistoryItem;
window.clearHistory = clearHistory;
window.savePreset = savePreset;
window.loadPresets = loadPresets;
window.applyPreset = applyPreset;
window.deletePreset = deletePreset;
