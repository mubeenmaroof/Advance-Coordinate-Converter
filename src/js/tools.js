// Combined utilities for duplicate removal, split column, file comparison and Google Sheets

// WORKER MANAGEMENT
let processingWorker = null;

function initWorker() {
  if (processingWorker) return processingWorker;
  processingWorker = new Worker('src/js/worker.js');

  processingWorker.onmessage = function (e) {
    const { type, progress, result, error } = e.data;

    if (type === 'progress') {
      updateProcessingProgress(progress);
    } else if (type === 'complete') {
      hideProcessingOverlay();
      if (result && result.binary) {
        triggerFileDownload(result.binary, result.fileName);
      } else if (window.currentWorkerCallback) {
        window.currentWorkerCallback(result);
      }
    } else if (type === 'error') {
      hideProcessingOverlay();
      alert("Worker Error: " + error);
    }
  };

  return processingWorker;
}

function triggerFileDownload(binaryData, fileName) {
  const blob = new Blob([binaryData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function showProcessingOverlay(status = "Processing Data...") {
  const overlay = document.getElementById("processingOverlay");
  const statusEl = document.getElementById("processingStatus");
  const progressEl = document.getElementById("processingProgressBar");

  if (overlay && statusEl && progressEl) {
    statusEl.innerText = status;
    progressEl.style.width = "0%";
    overlay.style.display = "flex";
  }
}

function updateProcessingProgress(progress) {
  const progressEl = document.getElementById("processingProgressBar");
  if (progressEl) {
    progressEl.style.width = progress + "%";
  }
}

function hideProcessingOverlay() {
  const overlay = document.getElementById("processingOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

// DEDUPE SECTION
dedupeData = [];
dedupeSelectedColumns = [];
dedupeWorkbook = null;
dedupeSelectedSheet = null;

document.getElementById("dedupeFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file || !validateFileSize(file)) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const data = new Uint8Array(event.target.result);
      if (file.name.endsWith(".csv")) {
        const text = new TextDecoder().decode(data);
        const lines = text.split("\n");
        dedupeData = lines
          .filter((line) => line.trim())
          .map((line) => {
            const regex = /(\"([^\"]*)\"|([^,]*))/g;
            const result = [];
            let match;
            while ((match = regex.exec(line)) !== null) {
              result.push(match[2] || match[3]);
            }
            return result;
          });
        if (dedupeData.length === 0) {
          alert("No data found in file");
          return;
        }
        document.getElementById("dedupeFileInfo").innerHTML =
          `<strong>File loaded:</strong> ${file.name}<br>
                     <strong>Rows:</strong> ${dedupeData.length} | 
                     <strong>Columns:</strong> ${dedupeData[0].length}`;
        document.getElementById("dedupeColumnSelection").innerHTML = "";
        displayDedupeColumnSelection();
      } else {
        const workbook = XLSX.read(data, { type: "array" });
        dedupeWorkbook = workbook;
        if (workbook.SheetNames.length > 1) {
          displayDedupeSheetSelection(workbook);
          document.getElementById("dedupeFileInfo").innerHTML =
            `<strong>File loaded:</strong> ${file.name}<br>
                         <strong>Sheets:</strong> ${workbook.SheetNames.length} | 
                         <strong>Select a sheet below</strong>`;
        } else {
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          dedupeData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          dedupeSelectedSheet = workbook.SheetNames[0];
          if (dedupeData.length === 0) {
            alert("No data found in sheet");
            return;
          }
          document.getElementById("dedupeFileInfo").innerHTML =
            `<strong>File loaded:</strong> ${file.name}<br>
                         <strong>Sheet:</strong> ${dedupeSelectedSheet}<br>
                         <strong>Rows:</strong> ${dedupeData.length} | 
                         <strong>Columns:</strong> ${dedupeData[0].length}`;
          document.getElementById("dedupeColumnSelection").innerHTML = "";
          displayDedupeColumnSelection();
        }
      }
    } catch (error) {
      alert("Error reading file: " + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

function displayDedupeSheetSelection(workbook) {
  let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <h5 style="color: #856404; margin-top: 0;">📊 Select Sheet to Process</h5>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">`;
  workbook.SheetNames.forEach((sheetName) => {
    html += `
            <button class="btn" onclick="selectDedupeSheet('${sheetName}')" 
                    style="padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                📊 ${sheetName}
            </button>`;
  });
  html += `</div></div>`;
  document.getElementById("dedupeColumnSelection").innerHTML = html;
}

function selectDedupeSheet(sheetName) {
  if (!dedupeWorkbook) return;
  const worksheet = dedupeWorkbook.Sheets[sheetName];
  dedupeData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  dedupeSelectedSheet = sheetName;
  if (dedupeData.length === 0) {
    alert("No data found in selected sheet");
    return;
  }
  document.getElementById("dedupeFileInfo").innerHTML +=
    `<br><strong>Selected Sheet:</strong> ${sheetName}<br>
         <strong>Rows:</strong> ${dedupeData.length} | 
         <strong>Columns:</strong> ${dedupeData[0].length}`;
  document.getElementById("dedupeColumnSelection").innerHTML = "";
  displayDedupeColumnSelection();
}

function displayDedupeColumnSelection() {
  const headers = dedupeData[0] || [];
  let html = `
        <div style="margin-bottom: 15px;">
            <label style="font-weight: 600; display: block; margin-bottom: 10px;">Select columns to check for duplicates:</label>
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button class="btn btn-sm" onclick="selectAllDedupeColumns()" style="padding: 8px 15px; font-size: 0.9em;">✓ Select All</button>
                <button class="btn btn-sm" onclick="deselectAllDedupeColumns()" style="padding: 8px 15px; font-size: 0.9em; background: #6c757d;">✗ Deselect All</button>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">`;
  headers.forEach((header, index) => {
    const colName = String(header).trim() || `Column ${index + 1}`;
    html += `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #ddd;">
                <input type="checkbox" id="dedupeCol${index}" class="dedupeColumn" value="${index}" checked onchange="updateDedupeSelectedColumns()">
                <span>${colName}</span>
            </label>`;
  });
  html += `</div>`;
  document.getElementById("dedupeColumnSelection").innerHTML = html;
  updateDedupeSelectedColumns();
}

function selectAllDedupeColumns() {
  document
    .querySelectorAll(".dedupeColumn")
    .forEach((cb) => (cb.checked = true));
  updateDedupeSelectedColumns();
}

function deselectAllDedupeColumns() {
  document
    .querySelectorAll(".dedupeColumn")
    .forEach((cb) => (cb.checked = false));
  updateDedupeSelectedColumns();
}

function updateDedupeSelectedColumns() {
  dedupeSelectedColumns = Array.from(
    document.querySelectorAll(".dedupeColumn:checked"),
  ).map((cb) => parseInt(cb.value));
}

function removeDuplicatesFromFile() {
  if (dedupeData.length === 0) {
    alert("Please upload a file first");
    return;
  }
  if (dedupeSelectedColumns.length === 0) {
    alert("Please select at least one column");
    return;
  }

  showProcessingOverlay("Removing Duplicates...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    displayDedupeResults(result.uniqueRows, result.duplicateRows, result.headers);
  };

  worker.postMessage({
    type: 'dedupe',
    payload: {
      data: dedupeData,
      selectedColumns: dedupeSelectedColumns
    }
  });
}

function displayDedupeResults(uniqueRows, duplicateRows, headers) {
  let html = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; border-left: 4px solid #28a745;">
            <h4 style="color: #28a745; margin-top: 0;">✓ Duplicate Removal Complete</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                    <strong>Original Records:</strong> ${dedupeData.length - 1}
                </div>
                <div>
                    <strong>Unique Records:</strong> <span style="color: #28a745; font-weight: bold;">${uniqueRows.length - 1}</span>
                </div>
                <div>
                    <strong>Duplicates Removed:</strong> <span style="color: #dc3545; font-weight: bold;">${duplicateRows.length}</span>
                </div>
                <div>
                    <strong>Columns Checked:</strong> ${dedupeSelectedColumns.length}
                </div>
            </div>
        </div>
        
        <div style="margin: 15px 0; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #28a745; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
            <label style="font-weight: 700; font-size: 0.9em; color: #28a745;">Export Format:</label>
            <select id="dedupeExportFormat" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600;">
                <option value="xlsx">Excel (XLSX) - High Quality</option>
                <option value="csv">CSV - Light & Faster</option>
            </select>
            <div style="display: flex; gap: 10px; flex: 1; min-width: 300px;">
                <button class="btn btn-success" onclick="downloadDedupeResult()" style="flex: 1; padding: 10px; font-weight: 700;">📥 Clean Data</button>
                <button class="btn btn-warning" onclick="downloadRemovedDuplicates()" style="flex: 1; padding: 10px; font-weight: 700; background: #ff9800; border: none;">🗑️ Duplicates</button>
                <button class="btn btn-secondary" onclick="viewDedupeDetails()" style="flex: 1; padding: 10px; font-weight: 700;">👁️ View Preview</button>
            </div>
        </div>
        
        <div id="dedupeDetails" style="display: none; margin-top: 20px;"></div>`;
  window.lastDedupeResult = { uniqueRows, duplicateRows, headers };
  document.getElementById("dedupeResult").innerHTML = html;
}

function viewDedupeDetails() {
  if (!window.lastDedupeResult) return;
  const { uniqueRows, duplicateRows, headers } = window.lastDedupeResult;
  const detailsDiv = document.getElementById("dedupeDetails");
  if (detailsDiv.style.display === "none") {
    let html = `
            <div style="display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 20px;">
                <div>
                    <h5 style="color: #28a745;">🟢 Unique Records (${uniqueRows.length - 1})</h5>
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px;">
                        <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; background: #28a745; color: white;">
                                <tr>
                                    ${headers.map((h) => `<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${h}</th>`).join("")}
                                </tr>
                            </thead>
                            <tbody>
                                ${uniqueRows.slice(1, 51).map((row, idx) => `
                                    <tr style="background: ${idx % 2 === 0 ? "#fff" : "#f8f9fa"};">
                                        ${row.map(cell => `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${cell}</td>`).join("")}
                                    </tr>
                                `).join("")}
                                ${uniqueRows.length > 51 ? `<tr><td colspan="${headers.length}" style="text-align: center; padding: 10px; color: #666;">... and ${uniqueRows.length - 51} more records</td></tr>` : ""}
                            </tbody>
                        </table>
                    </div>
                </div>`;
    if (duplicateRows.length > 0) {
      html += `
                <div>
                    <h5 style="color: #dc3545;">🔴 Removed Duplicates (${duplicateRows.length})</h5>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px;">
                        <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; background: #dc3545; color: white;">
                                <tr>
                                    ${headers.map((h) => `<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${h}</th>`).join("")}
                                </tr>
                            </thead>
                            <tbody>
                                ${duplicateRows
          .map(
            (row, idx) => `
                                    <tr style="background: ${idx % 2 === 0 ? "#fff" : "#fff3f3"};">
                                        ${row.map((cell) => `<td style="padding: 8px; border-bottom: 1px solid #ddd; color: #dc3545;">${cell}</td>`).join("")}
                                    </tr>
                                `,
          )
          .join("")}
                            </tbody>
                        </table>
                    </div>
                </div>`;
    }
    html += "</div>";
    detailsDiv.innerHTML = html;
    detailsDiv.style.display = "block";
  } else {
    detailsDiv.style.display = "none";
  }
}

function downloadDedupeResult() {
  if (!window.lastDedupeResult) {
    alert("No results to download. Please remove duplicates first.");
    return;
  }

  const format = document.getElementById("dedupeExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("dedupeFile", "Deduplicated", format);

  showProcessingOverlay(`Generating ${format.toUpperCase()} Cleaned File...`);
  const worker = initWorker();

  const { uniqueRows } = window.lastDedupeResult;
  const { headers } = window.lastDedupeResult;
  const colWidths = headers.map(() => ({ wch: 18 }));

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'dedupe_export',
      bookType: format,
      taskPayload: {
        uniqueRows: uniqueRows
      },
      sheetName: "Cleaned Data",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 0, ySplit: 1 },
        headerStyle: {
          fill: { fgColor: { rgb: "FF667eea" } },
          font: { bold: true, color: { rgb: "FFFFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        }
      }
    }
  });
}

function downloadRemovedDuplicates() {
  if (
    !window.lastDedupeResult ||
    !window.lastDedupeResult.duplicateRows ||
    window.lastDedupeResult.duplicateRows.length === 0
  ) {
    alert("No removed duplicates to download. Please remove duplicates first.");
    return;
  }

  const format = document.getElementById("dedupeExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("dedupeFile", "RemovedDuplicates", format);

  showProcessingOverlay(`Generating ${format.toUpperCase()} Removed Duplicates...`);
  const worker = initWorker();

  const { duplicateRows, headers } = window.lastDedupeResult;
  const colWidths = headers.map(() => ({ wch: 18 }));

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'removed_duplicates_export',
      bookType: format,
      taskPayload: {
        duplicateRows: duplicateRows,
        headers: headers
      },
      sheetName: "Removed Duplicates",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 0, ySplit: 1 },
        headerStyle: {
          fill: { fgColor: { rgb: "FFdc3545" } },
          font: { bold: true, color: { rgb: "FFFFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        }
      }
    }
  });
}

function clearDedupeData() {
  dedupeData = [];
  dedupeSelectedColumns = [];
  document.getElementById("dedupeFile").value = "";
  document.getElementById("dedupeFileInfo").innerHTML = "";
  document.getElementById("dedupeColumnSelection").innerHTML = "";
  document.getElementById("dedupeResult").innerHTML = "";
}

// SPLIT SECTION
splitData = [];
splitSelectedColumn = null;
splitWorkbook = null;
splitSelectedSheet = null;

document.getElementById("splitFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file || !validateFileSize(file)) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const data = new Uint8Array(event.target.result);
      if (file.name.endsWith(".csv")) {
        const text = new TextDecoder().decode(data);
        const lines = text.split("\n");
        splitData = lines
          .filter((line) => line.trim())
          .map((line) => {
            const regex = /(\"([^\"]*)\"|([^,]*))/g;
            const result = [];
            let match;
            while ((match = regex.exec(line)) !== null) {
              result.push(match[2] || match[3]);
            }
            return result;
          });
        if (splitData.length === 0) {
          alert("No data found in file");
          return;
        }
        document.getElementById("splitFileInfo").innerHTML =
          `<strong>File loaded:</strong> ${file.name}<br>
                     <strong>Rows:</strong> ${splitData.length} | 
                     <strong>Columns:</strong> ${splitData[0].length}`;
        document.getElementById("splitSheetSelection").innerHTML = "";
        displaySplitColumnSelection();
      } else {
        const workbook = XLSX.read(data, { type: "array" });
        splitWorkbook = workbook;
        if (workbook.SheetNames.length > 1) {
          displaySplitSheetSelection(workbook);
          document.getElementById("splitFileInfo").innerHTML =
            `<strong>File loaded:</strong> ${file.name}<br>
                         <strong>Sheets:</strong> ${workbook.SheetNames.length} | 
                         <strong>Select a sheet below</strong>`;
        } else {
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          splitData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          splitSelectedSheet = workbook.SheetNames[0];
          if (splitData.length === 0) {
            alert("No data found in sheet");
            return;
          }
          document.getElementById("splitFileInfo").innerHTML =
            `<strong>File loaded:</strong> ${file.name}<br>
                         <strong>Sheet:</strong> ${splitSelectedSheet}<br>
                         <strong>Rows:</strong> ${splitData.length} | 
                         <strong>Columns:</strong> ${splitData[0].length}`;
          document.getElementById("splitSheetSelection").innerHTML = "";
          displaySplitColumnSelection();
        }
      }
    } catch (error) {
      alert("Error reading file: " + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

function displaySplitSheetSelection(workbook) {
  let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <h5 style="color: #856404; margin-top: 0;">📊 Select Sheet to Process</h5>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">`;
  workbook.SheetNames.forEach((sheetName) => {
    html += `
            <button class="btn" onclick="selectSplitSheet('${sheetName}')" 
                    style="padding: 12px; background: #ff9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                📊 ${sheetName}
            </button>`;
  });
  html += `</div></div>`;
  document.getElementById("splitSheetSelection").innerHTML = html;
}

function selectSplitSheet(sheetName) {
  if (!splitWorkbook) return;
  const worksheet = splitWorkbook.Sheets[sheetName];
  splitData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  splitSelectedSheet = sheetName;
  if (splitData.length === 0) {
    alert("No data found in selected sheet");
    return;
  }
  document.getElementById("splitFileInfo").innerHTML +=
    `<br><strong>Selected Sheet:</strong> ${sheetName}<br>
         <strong>Rows:</strong> ${splitData.length} | 
         <strong>Columns:</strong> ${splitData[0].length}`;
  document.getElementById("splitSheetSelection").innerHTML = "";
  displaySplitColumnSelection();
}

function displaySplitColumnSelection() {
  const headers = splitData[0] || [];
  let html = `
        <div style="margin-bottom: 15px;">
            <label style="font-weight: 600; display: block; margin-bottom: 10px;">Select column to split:</label>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">`;
  headers.forEach((header, index) => {
    const colName = String(header).trim() || `Column ${index + 1}`;
    html += `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #ddd;">
                <input type="radio" name="splitColumn" value="${index}" onchange="updateSplitSelectedColumn(this.value)">
                <span>${colName}</span>
            </label>`;
  });
  html += `</div>`;
  document.getElementById("splitColumnSelection").innerHTML = html;
}

function updateSplitSelectedColumn(colIndex) {
  splitSelectedColumn = parseInt(colIndex);
  document.getElementById("splitDelimiterSelection").style.display = "block";
}

function detectDelimiter(columnData) {
  const delimiters = [",", ";", ":", " "];
  const counts = {};
  delimiters.forEach((delim) => {
    counts[delim] = 0;
    columnData.forEach((value) => {
      const str = String(value || "").trim();
      if (str) {
        counts[delim] += (
          str.match(new RegExp("\\" + delim, "g")) || []
        ).length;
      }
    });
  });
  let bestDelimiter = ",";
  let maxCount = counts[","];
  delimiters.forEach((delim) => {
    if (counts[delim] > maxCount) {
      maxCount = counts[delim];
      bestDelimiter = delim;
    }
  });
  return maxCount > 0 ? bestDelimiter : ",";
}



function splitColumnData() {
  if (splitData.length === 0) {
    alert("Please upload a file first");
    return;
  }
  if (splitSelectedColumn === null) {
    alert("Please select a column to split");
    return;
  }
  let delimiter = document.querySelector(
    'input[name="splitDelimiter"]:checked',
  ).value;
  if (!delimiter) {
    alert("Please select a delimiter");
    return;
  }

  showProcessingOverlay("Splitting Column...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    displaySplitResults(result.splitRows, result.successCount, result.delimiter);
  };

  worker.postMessage({
    type: 'split',
    payload: {
      data: splitData,
      selectedColumn: splitSelectedColumn,
      delimiter: delimiter
    }
  });
}

function displaySplitResults(splitRows, successCount, delimiter) {
  let delimiterName = "";
  if (delimiter === ",") delimiterName = "Comma";
  else if (delimiter === ";") delimiterName = "Semicolon";
  else if (delimiter === ":") delimiterName = "Colon";
  else if (delimiter === " ") delimiterName = "Space";
  else if (delimiter === "all") delimiterName = "All Delimiters (,;: )";
  else delimiterName = delimiter;
  let html = `
        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; border-left: 4px solid #ff9800;">
            <h4 style="color: #ff9800; margin-top: 0;">✓ Column Split Complete</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                    <strong>Total Rows:</strong> ${splitRows.length - 1}
                </div>
                <div>
                    <strong>Rows Split:</strong> <span style="color: #ff9800; font-weight: bold;">${successCount}</span>
                </div>
                <div>
                    <strong>Delimiter Used:</strong> <span style="font-weight: bold;">${delimiterName}</span>
                </div>
                <div>
                    <strong>New Columns:</strong> <span style="color: #ff9800; font-weight: bold;">${splitRows[0].length}</span>
                </div>
            </div>
        </div>
        
        <div style="margin: 15px 0; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #ff9800; display: flex; align-items: center; justify-content: center; gap: 15px;">
            <label style="font-weight: 700; font-size: 0.9em; color: #ff9800;">Export Format:</label>
            <select id="splitExportFormat" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600;">
                <option value="xlsx">Excel (XLSX) - High Quality</option>
                <option value="csv">CSV - Light & Faster</option>
            </select>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-success" onclick="downloadSplitResult()" style="background: #ff9800; color: white; border: none;">📥 Download Split Data</button>
                <button class="btn btn-secondary" onclick="viewSplitDetails()">👁️ View Preview</button>
            </div>
        </div>
        
        <div id="splitDetails" style="display: none; margin-top: 20px;"></div>`;
  window.lastSplitResult = { splitRows };
  document.getElementById("splitResult").innerHTML = html;
}

function viewSplitDetails() {
  if (!window.lastSplitResult) return;
  const { splitRows } = window.lastSplitResult;
  const detailsDiv = document.getElementById("splitDetails");
  if (detailsDiv.style.display === "none") {
    let html = `
            <div>
                <h5 style="color: #ff9800;">✂️ Split Data Preview (First 20 rows)</h5>
                <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px;">
                    <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #ff9800; color: white;">
                            <tr>
                                ${splitRows[0].map((h) => `<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${h}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${splitRows
        .slice(1, 21)
        .map(
          (row, idx) => `
                                <tr style="background: ${idx % 2 === 0 ? "#fff" : "#fff8f0"};">
                                    ${row.map((cell) => `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${cell}</td>`).join("")}
                                </tr>
                            `,
        )
        .join("")}
                        </tbody>
                    </table>
                </div>
            </div>`;
    detailsDiv.innerHTML = html;
    detailsDiv.style.display = "block";
  } else {
    detailsDiv.style.display = "none";
  }
}

function downloadSplitResult() {
  if (!window.lastSplitResult || !window.lastSplitResult.splitRows) return;

  const format = document.getElementById("splitExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("splitFile", "Split", format);

  showProcessingOverlay(`Generating ${format.toUpperCase()} Split Results...`);
  const worker = initWorker();

  const { splitRows } = window.lastSplitResult;
  const colWidths = splitRows[0].map(() => ({ wch: 18 }));

  const headerStyle = {
    fill: { fgColor: { rgb: "FFff9800" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "FF333333" } },
      bottom: { style: "thin", color: { rgb: "FF333333" } },
      left: { style: "thin", color: { rgb: "FF333333" } },
      right: { style: "thin", color: { rgb: "FF333333" } },
    },
  };

  worker.postMessage({
    type: 'excel_export',
    payload: {
      data: splitRows,
      bookType: format,
      sheetName: "Split Data",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 0, ySplit: 1 },
        headerStyle: headerStyle,
        standardRowStyle: {
          fill: { fgColor: { rgb: "FFFFFFFF" } },
        }
      }
    }
  });
}

function clearSplitData() {
  splitData = [];
  splitSelectedColumn = null;
  splitWorkbook = null;
  splitSelectedSheet = null;
  document.getElementById("splitFile").value = "";
  document.getElementById("splitFileInfo").innerHTML = "";
  document.getElementById("splitSheetSelection").innerHTML = "";
  document.getElementById("splitColumnSelection").innerHTML = "";
  document.getElementById("splitDelimiterSelection").style.display = "none";
  document.getElementById("splitResult").innerHTML = "";
}

// COMPARISON SECTION
comparisonData1 = null;
comparisonData2 = null;
comparisonFile1Name = "";
comparisonFile2Name = "";
lastComparisonResults = null;
lastSelectedCols1 = null;
lastSelectedCols2 = null;
comparisonWorkbook1 = null;
comparisonWorkbook2 = null;

// file input listeners
const compFile1Input = document.getElementById("comparisonFile1");
if (compFile1Input) {
  compFile1Input.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file || !validateFileSize(file)) return;
    comparisonFile1Name = file.name;
    handleComparisonFile(file, 1);
  });
}
const compFile2Input = document.getElementById("comparisonFile2");
if (compFile2Input) {
  compFile2Input.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file || !validateFileSize(file)) return;
    comparisonFile2Name = file.name;
    handleComparisonFile(file, 2);
  });
}

function handleComparisonFile(file, fileNum) {
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      let data;

      if (file.name.endsWith(".csv")) {
        const text = e.target.result;
        data = parseCSV(text);
        if (fileNum === 1) {
          comparisonData1 = data;
          comparisonWorkbook1 = null;
          document.getElementById("file1Info").innerHTML = `
                        <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                        <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
                    `;
        } else {
          comparisonData2 = data;
          comparisonWorkbook2 = null;
          document.getElementById("file2Info").innerHTML = `
                        <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                        <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
                    `;
        }

        // Update column selection if both files are loaded
        if (comparisonData1 && comparisonData2) {
          displayComparisonColumnSelection();
        }
      } else {
        const workbook = XLSX.read(e.target.result, { type: "binary" });

        // Check if multiple sheets
        if (workbook.SheetNames.length > 1) {
          if (fileNum === 1) {
            comparisonWorkbook1 = workbook;
            document.getElementById("file1Info").innerHTML = `
                            <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                            <small style="color: #666;">${workbook.SheetNames.length} sheets found</small>
                        `;
            displaySheetSelectionForComparison(workbook, 1);
          } else {
            comparisonWorkbook2 = workbook;
            document.getElementById("file2Info").innerHTML = `
                            <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                            <small style="color: #666;">${workbook.SheetNames.length} sheets found</small>
                        `;
            displaySheetSelectionForComparison(workbook, 2);
          }
        } else {
          // Single sheet - process directly
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (fileNum === 1) {
            comparisonData1 = data;
            comparisonWorkbook1 = null;
            document.getElementById("file1Info").innerHTML = `
                            <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                            <small style="color: #666;">Sheet: ${sheetName}</small><br>
                            <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
                        `;
          } else {
            comparisonData2 = data;
            comparisonWorkbook2 = null;
            document.getElementById("file2Info").innerHTML = `
                            <span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br>
                            <small style="color: #666;">Sheet: ${sheetName}</small><br>
                            <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
                        `;
          }

          // Update column selection if both files are loaded
          if (comparisonData1 && comparisonData2) {
            displayComparisonColumnSelection();
          }
        }
      }
    } catch (error) {
      alert(`Error reading file ${fileNum}: ${error.message}`);
    }
  };

  if (file.name.endsWith(".csv")) {
    reader.readAsText(file);
  } else {
    reader.readAsBinaryString(file);
  }
}
function displaySheetSelectionForComparison(workbook, fileNum) {
  let html =
    '<div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin-top: 10px; border: 2px solid #667eea;">';
  html +=
    '<h6 style="margin: 0 0 15px 0; color: #667eea; font-weight: 600;">📄 Select Sheet to Use:</h6>';
  html +=
    '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">';

  workbook.SheetNames.forEach((sheetName, index) => {
    html += `
            <button class="btn" onclick="selectComparisonSheet('${sheetName}', ${fileNum})" style="padding: 12px 10px; text-align: center; font-size: 0.9em;">
                📊 ${sheetName}
            </button>
        `;
  });

  html += "</div></div>";

  if (fileNum === 1) {
    document.getElementById("file1Info").innerHTML += html;
  } else {
    document.getElementById("file2Info").innerHTML += html;
  }
}

function selectComparisonSheet(sheetName, fileNum) {
  try {
    let workbook;

    if (fileNum === 1) {
      workbook = comparisonWorkbook1;
    } else {
      workbook = comparisonWorkbook2;
    }

    if (!workbook) return;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (fileNum === 1) {
      comparisonData1 = data;
      document.getElementById("file1Info").innerHTML = `
                <span style="color: #28a745; font-weight: 600;">✓ Selected Sheet: <strong>${sheetName}</strong></span><br>
                <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
            `;
    } else {
      comparisonData2 = data;
      document.getElementById("file2Info").innerHTML = `
                <span style="color: #28a745; font-weight: 600;">✓ Selected Sheet: <strong>${sheetName}</strong></span><br>
                <small style="color: #666;">Rows: ${data.length - 1}, Columns: ${data[0].length}</small>
            `;
    }

    // Update column selection if both files are loaded
    if (comparisonData1 && comparisonData2) {
      displayComparisonColumnSelection();
    }
  } catch (error) {
    alert(`Error selecting sheet: ${error.message}`);
  }
}

function displayComparisonColumnSelection() {
  if (!comparisonData1 || !comparisonData2) return;

  const headers1 = comparisonData1[0] || [];
  const headers2 = comparisonData2[0] || [];

  let html =
    '<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">';
  html +=
    '<h5 style="margin: 0 0 15px 0; color: #333;">Select Columns to Compare:</h5>';

  // File 1 Section
  html += '<div style="margin-bottom: 20px;">';
  html +=
    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
  html +=
    '<h6 style="margin: 0; color: #667eea; font-weight: 600;">File 1 Columns:</h6>';
  html += '<div style="display: flex; gap: 10px;">';
  html +=
    '<button class="btn btn-success" onclick="selectAllFile1Cols()" style="padding: 6px 12px; font-size: 0.9em;">✓ Select All</button>';
  html +=
    '<button class="btn btn-secondary" onclick="deselectAllFile1Cols()" style="padding: 6px 12px; font-size: 0.9em;">✗ Deselect All</button>';
  html += "</div>";
  html += "</div>";
  html += '<div class="checkbox-group" id="file1ColsGroup">';

  headers1.forEach((header, index) => {
    html += `
            <div class="checkbox-item">
                <input type="checkbox" class="comp-col1" id="compCol1_${index}" value="${index}" checked>
                <label for="compCol1_${index}">${header || `Column ${index + 1}`}</label>
            </div>
        `;
  });

  html += "</div></div>";

  // File 2 Section
  html += "<div>";
  html +=
    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
  html +=
    '<h6 style="margin: 0; color: #667eea; font-weight: 600;">File 2 Columns:</h6>';
  html += '<div style="display: flex; gap: 10px;">';
  html +=
    '<button class="btn btn-success" onclick="selectAllFile2Cols()" style="padding: 6px 12px; font-size: 0.9em;">✓ Select All</button>';
  html +=
    '<button class="btn btn-secondary" onclick="deselectAllFile2Cols()" style="padding: 6px 12px; font-size: 0.9em;">✗ Deselect All</button>';
  html += "</div>";
  html += "</div>";
  html += '<div class="checkbox-group" id="file2ColsGroup">';

  headers2.forEach((header, index) => {
    html += `
            <div class="checkbox-item">
                <input type="checkbox" class="comp-col2" id="compCol2_${index}" value="${index}" checked>
                <label for="compCol2_${index}">${header || `Column ${index + 1}`}</label>
            </div>
        `;
  });

  html += "</div></div>";
  html += "</div>";

  document.getElementById("comparisonColumnSelection").innerHTML = html;
}

function selectAllFile1Cols() {
  document.querySelectorAll(".comp-col1").forEach((cb) => (cb.checked = true));
}

function deselectAllFile1Cols() {
  document.querySelectorAll(".comp-col1").forEach((cb) => (cb.checked = false));
}

function selectAllFile2Cols() {
  document.querySelectorAll(".comp-col2").forEach((cb) => (cb.checked = true));
}

function deselectAllFile2Cols() {
  document.querySelectorAll(".comp-col2").forEach((cb) => (cb.checked = false));
}

function compareFiles() {
  if (!comparisonData1 || !comparisonData2) {
    alert("Please load both files first");
    return;
  }

  const selectedCols1 = [];
  const selectedCols2 = [];

  document.querySelectorAll(".comp-col1:checked").forEach((cb) => {
    selectedCols1.push(parseInt(cb.value));
  });
  document.querySelectorAll(".comp-col2:checked").forEach((cb) => {
    selectedCols2.push(parseInt(cb.value));
  });

  if (selectedCols1.length === 0 || selectedCols2.length === 0) {
    alert("Please select at least one column from each file");
    return;
  }

  // Store for later download
  lastSelectedCols1 = selectedCols1;
  lastSelectedCols2 = selectedCols2;

  showProcessingOverlay("Comparing Files...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    lastComparisonResults = result.duplicates;
    displayComparisonResults(result.duplicates, selectedCols1, selectedCols2);
  };

  worker.postMessage({
    type: 'compare',
    payload: {
      data1: comparisonData1,
      data2: comparisonData2,
      selectedCols1: selectedCols1,
      selectedCols2: selectedCols2
    }
  });
}

function displayComparisonResults(duplicates, cols1, cols2) {
  let html =
    '<div class="result" style="margin-top: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px;">';
  html += '<h3 style="margin: 0 0 15px 0;">📊 Comparison Results</h3>';

  html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; margin-bottom: 5px;">${duplicates.inBoth.length}</div>
                    <div style="font-size: 0.9em;">In Both Files</div>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; margin-bottom: 5px;">${duplicates.onlyInFile1.length}</div>
                    <div style="font-size: 0.9em;">Only in File 1</div>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; margin-bottom: 5px;">${duplicates.onlyInFile2.length}</div>
                    <div style="font-size: 0.9em;">Only in File 2</div>
                </div>
            </div>

            <div style="margin-top: 15px; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px; border: 1px dashed rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; justify-content: center; gap: 15px;">
                    <label style="font-weight: 700; font-size: 0.9em; color: var(--text-color);">Export Format:</label>
                    <div style="display: flex; gap: 5px; background: #eee; padding: 4px; border-radius: 6px;">
                        <select id="compExportFormat" style="padding: 6px 12px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; background: white;">
                            <option value="xlsx">Excel (XLSX) - High Quality</option>
                            <option value="csv">CSV - Light & Faster</option>
                        </select>
                    </div>
                    <span style="font-size: 0.85em; opacity: 0.8;">💡 Choose CSV for 5x smaller file size</span>
                </div>
            </div>
            
            <div style="margin-top: 25px; padding-top: 25px; border-top: 2px solid rgba(255,255,255,0.3); display: flex; gap: 15px; overflow-x: auto; padding-bottom: 15px; justify-content: center;">
                <div style="flex: 1; min-width: 180px; max-width: 300px; text-align: center;">
                    <div style="font-size: 1em; margin-bottom: 10px; font-weight: 700; opacity: 1; color: #ffffffff;">${duplicates.inBoth.length} Matched</div>
                    <button class="btn btn-success" onclick="downloadMatchedExcel()" style="width: 100%; padding: 15px 10px; font-size: 1em; font-weight: 600; white-space: nowrap; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        💾 Matched (File 1)
                    </button>
                </div>
                <div style="flex: 1; min-width: 180px; max-width: 300px; text-align: center;">
                    <div style="font-size: 1em; margin-bottom: 10px; font-weight: 700; opacity: 1; color: #ffffffff;">${duplicates.onlyInFile1.length} only File 1</div>
                    <button class="btn btn-secondary" onclick="downloadFile1Unmatched()" style="width: 100%; padding: 15px 10px; font-size: 1em; font-weight: 600; white-space: nowrap; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        💾 Unmatched (File 1)
                    </button>
                </div>
                <div style="flex: 1; min-width: 180px; max-width: 300px; text-align: center;">
                    <div style="font-size: 1em; margin-bottom: 10px; font-weight: 700; opacity: 1; color: #f5f5f5ff;">${duplicates.onlyInFile2.length} only File 2</div>
                    <button class="btn btn-danger" onclick="downloadFile2Unmatched()" style="width: 100%; padding: 15px 10px; font-size: 1em; font-weight: 600; white-space: nowrap; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        💾 Unmatched (File 2)
                    </button>
                </div>
                <div style="flex: 1; min-width: 180px; max-width: 300px; text-align: center;">
                    <div style="font-size: 1em; margin-bottom: 10px; font-weight: 700; opacity: 1; color: #fafafaff;">${duplicates.onlyInFile1.length + duplicates.onlyInFile2.length} Total</div>
                    <button class="btn btn-warning" onclick="downloadUnmatchedExcel()" style="width: 100%; padding: 15px 10px; font-size: 1em; font-weight: 600; white-space: nowrap; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        💾 Combined Unmatched
                    </button>
                </div>
            </div></div>`;

  // Display duplicates (in both)
  if (duplicates.inBoth.length > 0) {
    html +=
      '<div class="result" style="margin-top: 20px; border-left: 4px solid #28a745; background: #f0fdf4;">';
    html +=
      '<h4 style="color: #28a745; margin: 0 0 15px 0;">✓ Found in Both Files (' +
      duplicates.inBoth.length +
      ")</h4>";

    html += '<div class="table-container" style="margin-bottom: 15px;">';
    html +=
      '<table style="width: 100%; border-collapse: collapse; background: white;">';
    html += "<thead>";
    html += '<tr style="background: #28a745; color: white;">';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">#</th>';
    html +=
      '<th style="padding: 10px; border: 1px solid #ddd;">Matched Values</th>';
    html +=
      '<th style="padding: 10px; border: 1px solid #ddd;">Row (File 1)</th>';
    html +=
      '<th style="padding: 10px; border: 1px solid #ddd;">Row (File 2)</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    duplicates.inBoth.slice(0, 50).forEach((item, idx) => {
      html += `<tr style="background: ${idx % 2 === 0 ? "#f9fafb" : "#ffffff"}; border-bottom: 1px solid #eee;">`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: 600;">${idx + 1}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; background: #d1fae5; font-weight: 600;">${item.keys.substring(0, 50)}${item.keys.length > 50 ? "..." : ""}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.row1}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.row2}</td>`;
      html += "</tr>";
    });

    if (duplicates.inBoth.length > 50) {
      html += `<tr><td colspan="4" style="text-align: center; padding: 10px; color: #666;">... and ${duplicates.inBoth.length - 50} more matches</td></tr>`;
    }

    html += "</tbody>";
    html += "</table>";
    html += "</div>";
    html += "</div>";
  }

  // Display only in file 1
  if (duplicates.onlyInFile1.length > 0) {
    html +=
      '<div class="result" style="margin-top: 20px; border-left: 4px solid #ffc107; background: #fffbf0;">';
    html +=
      '<h4 style="color: #ffc107; margin: 0 0 15px 0;">⚠ Only in File 1 (' +
      duplicates.onlyInFile1.length +
      ")</h4>";

    html += '<div class="table-container" style="margin-bottom: 15px;">';
    html +=
      '<table style="width: 100%; border-collapse: collapse; background: white;">';
    html += "<thead>";
    html += '<tr style="background: #ffc107; color: #333;">';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">#</th>';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">Values</th>';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">Row</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    duplicates.onlyInFile1.slice(0, 50).forEach((item, idx) => {
      html += `<tr style="background: ${idx % 2 === 0 ? "#f9fafb" : "#ffffff"}; border-bottom: 1px solid #eee;">`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: 600;">${idx + 1}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; background: #fef3c7; font-weight: 600;">${item.keys.substring(0, 50)}${item.keys.length > 50 ? "..." : ""}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.row}</td>`;
      html += "</tr>";
    });

    if (duplicates.onlyInFile1.length > 50) {
      html += `<tr><td colspan="3" style="text-align: center; padding: 10px; color: #666;">... and ${duplicates.onlyInFile1.length - 50} more entries</td></tr>`;
    }

    html += "</tbody>";
    html += "</table>";
    html += "</div>";
    html += "</div>";
  }

  // Display only in file 2
  if (duplicates.onlyInFile2.length > 0) {
    html +=
      '<div class="result" style="margin-top: 20px; border-left: 4px solid #dc3545; background: #fdf2f2;">';
    html +=
      '<h4 style="color: #dc3545; margin: 0 0 15px 0;">ℹ Only in File 2 (' +
      duplicates.onlyInFile2.length +
      ")</h4>";

    html += '<div class="table-container" style="margin-bottom: 15px;">';
    html +=
      '<table style="width: 100%; border-collapse: collapse; background: white;">';
    html += "<thead>";
    html += '<tr style="background: #dc3545; color: white;">';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">#</th>';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">Values</th>';
    html += '<th style="padding: 10px; border: 1px solid #ddd;">Row</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    duplicates.onlyInFile2.slice(0, 50).forEach((item, idx) => {
      html += `<tr style="background: ${idx % 2 === 0 ? "#f9fafb" : "#ffffff"}; border-bottom: 1px solid #eee;">`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: 600;">${idx + 1}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; background: #fee; font-weight: 600;">${item.keys.substring(0, 50)}${item.keys.length > 50 ? "..." : ""}</td>`;
      html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.row}</td>`;
      html += "</tr>";
    });

    if (duplicates.onlyInFile2.length > 50) {
      html += `<tr><td colspan="3" style="text-align: center; padding: 10px; color: #666;">... and ${duplicates.onlyInFile2.length - 50} more entries</td></tr>`;
    }

    html += "</tbody>";
    html += "</table>";
    html += "</div>";
    html += "</div>";
  }

  document.getElementById("comparisonResult").innerHTML = html;
}

function downloadMatchedExcel() {
  if (
    !lastComparisonResults ||
    !lastComparisonResults.inBoth ||
    lastComparisonResults.inBoth.length === 0
  ) {
    alert("No matched records to download");
    return;
  }

  showProcessingOverlay("Generating Matched Excel...");
  const worker = initWorker();

  const headers1 = comparisonData1[0] || [];
  const combinedHeader = ["MATCH_STATUS", ...headers1];

  const colWidths = [{ wch: 15 }];
  for (let i = 1; i < combinedHeader.length; i++) {
    colWidths.push({ wch: 18 });
  }

  const headerStyle = {
    fill: { fgColor: { rgb: "FF28a745" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "FF333333" } },
      bottom: { style: "medium", color: { rgb: "FF333333" } },
      left: { style: "medium", color: { rgb: "FF333333" } },
      right: { style: "medium", color: { rgb: "FF333333" } },
    },
  };

  const format = document.getElementById("compExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName(["compareFile1", "compareFile2"], "Matched", format);

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'matched_export',
      bookType: format,
      taskPayload: {
        comparisonData1: comparisonData1,
        inBoth: lastComparisonResults.inBoth
      },
      sheetName: "Matched Records",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 1, ySplit: 1 },
        headerStyle: headerStyle,
        alternateRowStyle: {
          fill: { fgColor: { rgb: "FFE8F5E9" } },
          font: { size: 10, name: "Calibri" },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { rgb: "FFD9D9D9" } },
            left: { style: "thin", color: { rgb: "FFD9D9D9" } },
            right: { style: "thin", color: { rgb: "FFD9D9D9" } },
          }
        },
        standardRowStyle: {
          fill: { fgColor: { rgb: "FFFFFFFF" } },
          font: { size: 10, name: "Calibri" },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { rgb: "FFD9D9D9" } },
            left: { style: "thin", color: { rgb: "FFD9D9D9" } },
            right: { style: "thin", color: { rgb: "FFD9D9D9" } },
          }
        }
      }
    }
  });
}

function downloadUnmatchedExcel() {
  if (!lastComparisonResults) {
    alert("Please run comparison first");
    return;
  }

  showProcessingOverlay("Generating Combined Unmatched Excel...");
  const worker = initWorker();

  const headers1 = comparisonData1[0] || [];
  const combinedHeader = ["MATCH_STATUS", ...headers1];

  const colWidths = [{ wch: 15 }];
  for (let i = 1; i < combinedHeader.length; i++) {
    colWidths.push({ wch: 18 });
  }

  const headerStyle = {
    fill: { fgColor: { rgb: "FFDC3545" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "FF333333" } },
      bottom: { style: "medium", color: { rgb: "FF333333" } },
      left: { style: "medium", color: { rgb: "FF333333" } },
      right: { style: "medium", color: { rgb: "FF333333" } },
    },
  };

  const format = document.getElementById("compExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName(["compareFile1", "compareFile2"], "CombinedUnmatched", format);

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'unmatched_export',
      bookType: format,
      taskPayload: {
        comparisonData1: comparisonData1,
        comparisonData2: comparisonData2,
        onlyInFile1: lastComparisonResults.onlyInFile1,
        onlyInFile2: lastComparisonResults.onlyInFile2
      },
      sheetName: "Combined Unmatched",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 1, ySplit: 1 },
        headerStyle: headerStyle,
        alternateRowStyle: {
          fill: { fgColor: { rgb: "FFFCE4E4" } },
          font: { size: 10, name: "Calibri" },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { rgb: "FFD9D9D9" } },
            left: { style: "thin", color: { rgb: "FFD9D9D9" } },
            right: { style: "thin", color: { rgb: "FFD9D9D9" } },
          }
        },
        standardRowStyle: {
          fill: { fgColor: { rgb: "FFFFFFFF" } },
          font: { size: 10, name: "Calibri" },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { rgb: "FFD9D9D9" } },
            left: { style: "thin", color: { rgb: "FFD9D9D9" } },
            right: { style: "thin", color: { rgb: "FFD9D9D9" } },
          }
        }
      }
    }
  });
}

function downloadFile1Unmatched() {
  if (!lastComparisonResults || !lastComparisonResults.onlyInFile1) {
    alert("No records found only in File 1");
    return;
  }

  showProcessingOverlay("Generating File 1 Unmatched Excel...");
  const worker = initWorker();

  const headers1 = comparisonData1[0] || [];
  const combinedHeader = ["MATCH_STATUS", ...headers1];

  const colWidths = [{ wch: 15 }];
  for (let i = 1; i < combinedHeader.length; i++) {
    colWidths.push({ wch: 18 });
  }

  const headerStyle = {
    fill: { fgColor: { rgb: "FFFFC107" } }, // Amber for File 1 Unmatched
    font: { bold: true, color: { rgb: "FF333333" }, size: 12, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "FF333333" } },
      bottom: { style: "medium", color: { rgb: "FF333333" } },
      left: { style: "medium", color: { rgb: "FF333333" } },
      right: { style: "medium", color: { rgb: "FF333333" } },
    },
  };

  const format = document.getElementById("compExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("compareFile1", "Unmatched", format);

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'file1_unmatched_export',
      bookType: format,
      taskPayload: {
        comparisonData1: comparisonData1,
        onlyInFile1: lastComparisonResults.onlyInFile1
      },
      sheetName: "File 1 Unmatched",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 1, ySplit: 1 },
        headerStyle: headerStyle,
        standardRowStyle: {
          fill: { fgColor: { rgb: "FFFFFFFF" } }
        }
      }
    }
  });
}

function downloadFile2Unmatched() {
  if (!lastComparisonResults || !lastComparisonResults.onlyInFile2) {
    alert("No records found only in File 2");
    return;
  }

  showProcessingOverlay("Generating File 2 Unmatched Excel...");
  const worker = initWorker();

  const headers2 = comparisonData2[0] || [];
  const combinedHeader = ["MATCH_STATUS", ...headers2];

  const colWidths = [{ wch: 15 }];
  for (let i = 1; i < combinedHeader.length; i++) {
    colWidths.push({ wch: 18 });
  }

  const headerStyle = {
    fill: { fgColor: { rgb: "FFDC3545" } }, // Red for File 2 Unmatched
    font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "medium", color: { rgb: "FF333333" } },
      bottom: { style: "medium", color: { rgb: "FF333333" } },
      left: { style: "medium", color: { rgb: "FF333333" } },
      right: { style: "medium", color: { rgb: "FF333333" } },
    },
  };

  const format = document.getElementById("compExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("compareFile2", "Unmatched", format);

  worker.postMessage({
    type: 'excel_export',
    payload: {
      taskType: 'file2_unmatched_export',
      bookType: format,
      taskPayload: {
        comparisonData2: comparisonData2,
        onlyInFile2: lastComparisonResults.onlyInFile2
      },
      sheetName: "File 2 Unmatched",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 1, ySplit: 1 },
        headerStyle: headerStyle,
        standardRowStyle: {
          fill: { fgColor: { rgb: "FFFFFFFF" } }
        }
      }
    }
  });
}



function clearComparisonData() {
  comparisonData1 = null;
  comparisonData2 = null;
  document.getElementById("comparisonFile1").value = "";
  document.getElementById("comparisonFile2").value = "";
  document.getElementById("file1Info").innerHTML = "";
  document.getElementById("file2Info").innerHTML = "";
  document.getElementById("comparisonColumnSelection").innerHTML = "";
  document.getElementById("comparisonResult").innerHTML = "";
}

// MERGE SECTION
mergeData1 = null;
mergeData2 = null;
mergeWorkbook1 = null;
mergeWorkbook2 = null;
lastMergeResult = null;

const mFile1Input = document.getElementById("mergeFile1");
if (mFile1Input) {
  mFile1Input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && validateFileSize(file)) handleMergeFile(file, 1);
  });
}
const mFile2Input = document.getElementById("mergeFile2");
if (mFile2Input) {
  mFile2Input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && validateFileSize(file)) handleMergeFile(file, 2);
  });
}

function handleMergeFile(file, fileNum) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      let data;
      if (file.name.endsWith(".csv")) {
        data = parseCSV(e.target.result);
        if (fileNum === 1) {
          mergeData1 = data; mergeWorkbook1 = null;
          document.getElementById("mergeFile1Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Rows: ${data.length - 1}</small>`;
        } else {
          mergeData2 = data; mergeWorkbook2 = null;
          document.getElementById("mergeFile2Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Rows: ${data.length - 1}</small>`;
        }
      } else {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        if (workbook.SheetNames.length > 1) {
          displayMergeSheetSelection(workbook, fileNum, file.name);
        } else {
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (fileNum === 1) {
            mergeData1 = data; mergeWorkbook1 = null;
            document.getElementById("mergeFile1Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Sheet: ${sheetName}</small><br><small>Rows: ${data.length - 1}</small>`;
          } else {
            mergeData2 = data; mergeWorkbook2 = null;
            document.getElementById("mergeFile2Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Sheet: ${sheetName}</small><br><small>Rows: ${data.length - 1}</small>`;
          }
        }
      }
      if (mergeData1 && mergeData2) displayMergeColumnSelection();
    } catch (err) { alert("Error: " + err.message); }
  };
  if (file.name.endsWith(".csv")) reader.readAsText(file);
  else reader.readAsBinaryString(file);
}

function displayMergeSheetSelection(workbook, fileNum, fileName) {
  let html = `<div style="background: #f0fdf4; padding: 10px; border-radius: 8px; margin-top: 10px; border: 1px solid #28a745;">
        <h6 style="margin: 0 0 10px 0; color: #28a745;">Select Sheet for ${fileName}:</h6>
        <div style="display: flex; gap: 5px; flex-wrap: wrap;">`;
  workbook.SheetNames.forEach(name => {
    html += `<button class="btn btn-sm" onclick="selectMergeSheet('${name}', ${fileNum})" style="font-size: 0.8em; padding: 5px 10px;">${name}</button>`;
  });
  html += `</div></div>`;
  if (fileNum === 1) { mergeWorkbook1 = workbook; document.getElementById("mergeFile1Info").innerHTML = html; }
  else { mergeWorkbook2 = workbook; document.getElementById("mergeFile2Info").innerHTML = html; }
}

function selectMergeSheet(sheetName, fileNum) {
  const workbook = fileNum === 1 ? mergeWorkbook1 : mergeWorkbook2;
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (fileNum === 1) {
    mergeData1 = data;
    document.getElementById("mergeFile1Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Sheet: ${sheetName}</span><br><small>Rows: ${data.length - 1}</small>`;
  } else {
    mergeData2 = data;
    document.getElementById("mergeFile2Info").innerHTML = `<span style="color: #28a745; font-weight: 600;">✓ Sheet: ${sheetName}</span><br><small>Rows: ${data.length - 1}</small>`;
  }
  if (mergeData1 && mergeData2) displayMergeColumnSelection();
}

function displayMergeColumnSelection() {
  const h1 = mergeData1[0] || [];
  const h2 = mergeData2[0] || [];
  let html = `<div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        <h5 style="margin: 0 0 15px 0;">Select Join Columns (Keys):</h5>
        <div class="grid-2">
            <div>
                <label style="display:block; margin-bottom:5px;">File 1 Key:</label>
                <select id="mergeKey1" style="width:100%; padding:8px; border-radius:5px; border:1px solid #ddd;">
                    ${h1.map((h, i) => `<option value="${i}">${h || `Col ${i + 1}`}</option>`).join("")}
                </select>
            </div>
            <div>
                <label style="display:block; margin-bottom:5px;">File 2 Key:</label>
                <select id="mergeKey2" style="width:100%; padding:8px; border-radius:5px; border:1px solid #ddd;">
                    ${h2.map((h, i) => `<option value="${i}">${h || `Col ${i + 1}`}</option>`).join("")}
                </select>
            </div>
        </div>
    </div>`;
  document.getElementById("mergeColumnSelection").innerHTML = html;
}

function mergeFiles() {
  if (!mergeData1 || !mergeData2) { alert("Load both files first"); return; }
  const key1 = parseInt(document.getElementById("mergeKey1").value);
  const key2 = parseInt(document.getElementById("mergeKey2").value);

  showProcessingOverlay("Merging Files...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    lastMergeResult = result.mergedRows;
    let html = `
        <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; border-left: 4px solid #28a745;">
            <h4 style="color: #28a745; margin:0;">✓ Files Merged Successfully</h4>
            <p>New dataset contains ${result.mergedRows.length - 1} rows with combined data.</p>
            <div style="margin: 15px 0; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #28a745; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
                <label style="font-weight: 700; font-size: 0.9em; color: #28a745; margin-right: 5px;">Export Format:</label>
                <select id="mergeExportFormat" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600; min-width: 150px;">
                    <option value="xlsx">Excel (XLSX) - High Quality</option>
                    <option value="csv">CSV - Light & Faster</option>
                </select>
                <button class="btn btn-success" onclick="downloadMergeResult()" style="background: #28a745; color: white; border: none; padding: 10px 20px; font-weight: 700; min-width: 250px;">📥 Download Merged File</button>
            </div>
        </div>`;
    document.getElementById("mergeResult").innerHTML = html;
  };

  worker.postMessage({
    type: 'merge',
    payload: {
      data1: mergeData1,
      data2: mergeData2,
      key1: key1,
      key2: key2
    }
  });
}

function downloadMergeResult() {
  if (!lastMergeResult) return;

  const format = document.getElementById("mergeExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName(["mergeFile1", "mergeFile2"], "Merged", format);

  showProcessingOverlay(`Generating ${format.toUpperCase()} Merge Results...`);
  const worker = initWorker();

  const h1 = mergeData1[0] || [];
  const h2 = mergeData2[0] || [];
  const key2 = parseInt(document.getElementById("mergeKey2").value);
  const combinedHeader = [...h1, ...h2.filter((_, i) => i !== key2)];

  const colWidths = [];
  combinedHeader.forEach(() => colWidths.push({ wch: 18 }));

  worker.postMessage({
    type: 'excel_export',
    payload: {
      data: lastMergeResult,
      headers: combinedHeader,
      bookType: format,
      sheetName: "Merged Data",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 0, ySplit: 1 },
        headerStyle: {
          fill: { fgColor: { rgb: "FF28a745" } },
          font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12, name: "Calibri" },
          alignment: { horizontal: "center", vertical: "center" },
        }
      }
    }
  });
}

function clearMergeData() {
  mergeData1 = null; mergeData2 = null;
  document.getElementById("mergeFile1").value = "";
  document.getElementById("mergeFile2").value = "";
  document.getElementById("mergeFile1Info").innerHTML = "";
  document.getElementById("mergeFile2Info").innerHTML = "";
  document.getElementById("mergeColumnSelection").innerHTML = "";
  document.getElementById("mergeResult").innerHTML = "";
}

// SANITIZE SECTION
sanitizeData = null;
sanitizeWorkbook = null;
lastSanitizeResult = null;

const sFileInput = document.getElementById("sanitizeFile");
if (sFileInput) {
  sFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && validateFileSize(file)) handleSanitizeFile(file);
  });
}

function handleSanitizeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      let data;
      if (file.name.endsWith(".csv")) {
        data = parseCSV(e.target.result);
        sanitizeData = data;
        document.getElementById("sanitizeFileInfo").innerHTML = `<span style="color: #e91e63; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Rows: ${data.length - 1}</small>`;
        displaySanitizeColumnSelection();
      } else {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        sanitizeWorkbook = workbook;
        if (workbook.SheetNames.length > 1) {
          displaySanitizeSheetSelection(workbook);
        } else {
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          sanitizeData = data;
          document.getElementById("sanitizeFileInfo").innerHTML = `<span style="color: #e91e63; font-weight: 600;">✓ Loaded: ${file.name}</span><br><small>Sheet: ${sheetName}</small><br><small>Rows: ${data.length - 1}</small>`;
          displaySanitizeColumnSelection();
        }
      }
    } catch (err) { alert("Error: " + err.message); }
  };
  if (file.name.endsWith(".csv")) reader.readAsText(file);
  else reader.readAsBinaryString(file);
}

function displaySanitizeSheetSelection(workbook) {
  let html = `<div style="background: #fdf2f2; padding: 15px; border-radius: 8px; margin-top: 10px; border: 2px solid #e91e63;">
        <h6 style="margin: 0 0 15px 0; color: #e91e63; font-weight: 600;">📄 Select Sheet to Sanitize:</h6>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">`;
  workbook.SheetNames.forEach(name => {
    html += `<button class="btn" onclick="selectSanitizeSheet('${name}')" style="padding: 12px 10px; text-align: center; font-size: 0.9em; background: #e91e63; color: white; border: none;">
            📊 ${name}
        </button>`;
  });
  html += `</div></div>`;
  document.getElementById("sanitizeFileInfo").innerHTML = html;
}

function selectSanitizeSheet(sheetName) {
  if (!sanitizeWorkbook) return;
  const sheet = sanitizeWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  sanitizeData = data;
  document.getElementById("sanitizeFileInfo").innerHTML = `<span style="color: #e91e63; font-weight: 600;">✓ Selected Sheet: <strong>${sheetName}</strong></span><br><small>Rows: ${data.length - 1}</small>`;
  displaySanitizeColumnSelection();
}

function displaySanitizeColumnSelection() {
  const headers = sanitizeData[0] || [];
  let html = `<div style="background: #fff0f5; padding: 15px; border-radius: 8px;">
        <h5 style="margin: 0 0 10px 0;">Select Coordinate Columns to Clean:</h5>
        <div class="checkbox-group">`;
  headers.forEach((h, i) => {
    html += `<div class="checkbox-item">
            <input type="checkbox" class="sanitize-col" id="sanCol${i}" value="${i}">
            <label for="sanCol${i}">${h || `Col ${i + 1}`}</label>
        </div>`;
  });
  html += `</div></div>`;
  document.getElementById("sanitizeColumnSelection").innerHTML = html;
}

function toggleAllSanitizeOptions(checkbox) {
  const opts = document.querySelectorAll(".sanitize-opt");
  opts.forEach(opt => opt.checked = checkbox.checked);
  if (checkbox.checked) {
      document.getElementById("sanitizeOptAllDelims").checked = false;
  }
}

function handleAllDelimsChange(checkbox) {
  document.querySelectorAll(".sanitize-delim-single").forEach(opt => opt.checked = checkbox.checked);
}

function handleSingleDelimChange() {
  const allChecked = Array.from(document.querySelectorAll(".sanitize-delim-single")).every(opt => opt.checked);
  const allDelims = document.getElementById("sanitizeOptAllDelims");
  if (allDelims) {
    allDelims.checked = allChecked;
  }
}

function sanitizeCoordinates() {
  if (!sanitizeData) { alert("Upload file first"); return; }
  const selectedCols = Array.from(document.querySelectorAll(".sanitize-col:checked")).map(cb => parseInt(cb.value));
  if (selectedCols.length === 0) { alert("Select at least one column"); return; }

  const options = Array.from(document.querySelectorAll(".sanitize-opt:checked")).map(cb => cb.value);

  showProcessingOverlay("Cleaning Coordinates...");
  const worker = initWorker();

  window.currentWorkerCallback = function (result) {
    lastSanitizeResult = result.cleanedRows;
    let html = `
        <div style="background: #fdf2f2; padding: 20px; border-radius: 10px; border-left: 4px solid #e91e63;">
            <h4 style="color: #e91e63; margin:0;">✓ Data Sanitized</h4>
            <p>Cleaned ${selectedCols.length} columns across ${result.cleanedRows.length - 1} rows.</p>
            <div style="margin: 15px 0; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px dashed #e91e63; display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
                <label style="font-weight: 700; font-size: 0.9em; color: #e91e63; margin-right: 5px;">Export Format:</label>
                <select id="sanitizeExportFormat" style="padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600; min-width: 150px;">
                    <option value="xlsx">Excel (XLSX) - High Quality</option>
                    <option value="csv">CSV - Light & Faster</option>
                </select>
                <button class="btn" style="background: #e91e63; color: white; border: none; padding: 10px 20px; font-weight: 700; min-width: 250px;" onclick="downloadSanitizeResult()">📥 Download Cleaned File</button>
                <button class="btn btn-secondary" style="padding: 10px 20px; font-weight: 700;" onclick="previewSanitizeData()">👁️ Preview Data</button>
            </div>
            <div id="sanitizePreviewArea" style="margin-top: 15px; max-height: 400px; overflow: auto; display: none; border: 1px solid #f8bbd0; border-radius: 8px;"></div>
        </div>`;
    document.getElementById("sanitizeResult").innerHTML = html;
  };

  worker.postMessage({
    type: 'sanitize',
    payload: {
      data: sanitizeData,
      selectedCols: selectedCols,
      options: options
    }
  });
}

function downloadSanitizeResult() {
  if (!lastSanitizeResult) return;

  const format = document.getElementById("sanitizeExportFormat")?.value || "xlsx";
  const finalFileName = window.generateExportFileName("sanitizeFile", "Sanitized", format);

  showProcessingOverlay(`Generating ${format.toUpperCase()} Sanitized Results...`);
  const worker = initWorker();

  const headers = sanitizeData[0] || [];
  const colWidths = [];
  headers.forEach(() => colWidths.push({ wch: 18 }));

  worker.postMessage({
    type: 'excel_export',
    payload: {
      data: lastSanitizeResult,
      headers: headers,
      bookType: format,
      sheetName: "Sanitized Data",
      fileName: finalFileName,
      styles: {
        colWidths: colWidths,
        freeze: { xSplit: 0, ySplit: 1 },
        headerStyle: {
          fill: { fgColor: { rgb: "FFE91E63" } },
          font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12, name: "Calibri" },
          alignment: { horizontal: "center", vertical: "center" },
        }
      }
    }
  });
}

function previewSanitizeData() {
  if (!lastSanitizeResult) return;
  const previewArea = document.getElementById("sanitizePreviewArea");
  
  if (previewArea.style.display === "block") {
      previewArea.style.display = "none";
      return;
  }

  const headers = sanitizeData[0] || [];
  let html = `<table style="width: 100%; border-collapse: collapse; background: white; font-size: 0.9em;">
      <thead style="position: sticky; top: 0; background: #e91e63; color: white;">
          <tr>`;
  
  headers.forEach(h => {
      html += `<th style="padding: 10px; border: 1px solid #f8bbd0; text-align: left;">${h}</th>`;
  });
  html += `</tr></thead><tbody>`;

  const previewCount = Math.min(lastSanitizeResult.length, 50);
  for (let i = 0; i < previewCount; i++) {
      html += `<tr style="background: ${i % 2 === 0 ? '#fafafa' : '#ffffff'};">`;
      lastSanitizeResult[i].forEach(cell => {
          html += `<td style="padding: 8px 10px; border: 1px solid #fce4ec; border-bottom: 1px solid #f8bbd0;">${cell || ""}</td>`;
      });
      html += `</tr>`;
  }
  
  html += `</tbody></table>`;
  
  if (lastSanitizeResult.length > 50) {
      html += `<div style="padding: 10px; text-align: center; background: #fff5f8; color: #e91e63; font-weight: bold; border-top: 1px solid #f8bbd0;">Showing top 50 rows of ${lastSanitizeResult.length} total rows</div>`;
  }

  previewArea.innerHTML = html;
  previewArea.style.display = "block";
}

function clearSanitizeData() {
  sanitizeData = null;
  document.getElementById("sanitizeFile").value = "";
  document.getElementById("sanitizeFileInfo").innerHTML = "";
  document.getElementById("sanitizeColumnSelection").innerHTML = "";
  document.getElementById("sanitizeResult").innerHTML = "";
}


// expose functions to global scope for HTML
window.handleComparisonFile = handleComparisonFile;
window.displaySheetSelectionForComparison = displaySheetSelectionForComparison;
window.selectComparisonSheet = selectComparisonSheet;
window.displayComparisonColumnSelection = displayComparisonColumnSelection;
window.selectAllFile1Cols = selectAllFile1Cols;
window.deselectAllFile1Cols = deselectAllFile1Cols;
window.selectAllFile2Cols = selectAllFile2Cols;
window.deselectAllFile2Cols = deselectAllFile2Cols;
window.compareFiles = compareFiles;
window.downloadMatchedExcel = downloadMatchedExcel;
window.downloadUnmatchedExcel = downloadUnmatchedExcel;
window.clearComparisonData = clearComparisonData;
window.handleMergeFile = handleMergeFile;
window.displayMergeSheetSelection = displayMergeSheetSelection;
window.selectMergeSheet = selectMergeSheet;
window.displayMergeColumnSelection = displayMergeColumnSelection;
window.mergeFiles = mergeFiles;
window.downloadMergeResult = downloadMergeResult;
window.clearMergeData = clearMergeData;
window.handleSanitizeFile = handleSanitizeFile;
window.displaySanitizeSheetSelection = displaySanitizeSheetSelection;
window.selectSanitizeSheet = selectSanitizeSheet;
window.displaySanitizeColumnSelection = displaySanitizeColumnSelection;
window.sanitizeCoordinates = sanitizeCoordinates;
window.toggleAllSanitizeOptions = toggleAllSanitizeOptions;
window.handleAllDelimsChange = handleAllDelimsChange;
window.handleSingleDelimChange = handleSingleDelimChange;
window.previewSanitizeData = previewSanitizeData;
window.downloadSanitizeResult = downloadSanitizeResult;
window.clearSanitizeData = clearSanitizeData;
window.downloadSplitExcel = downloadSplitExcel;

// TOOL INFORMATION TOGGLE
function toggleToolInfo(boxId) {
  const box = document.getElementById(boxId);
  const allBoxes = document.querySelectorAll('.tool-info-content');
  
  // Close other boxes
  allBoxes.forEach(b => {
      if (b.id !== boxId) b.classList.remove('show');
  });
  
  // Toggle current box
  if (box) {
      box.classList.toggle('show');
  }
}

// Close info boxes when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.classList.contains('tool-info-btn') && !e.target.closest('.tool-info-content')) {
      document.querySelectorAll('.tool-info-content').forEach(box => {
          box.classList.remove('show');
      });
  }
});

window.toggleToolInfo = toggleToolInfo;

