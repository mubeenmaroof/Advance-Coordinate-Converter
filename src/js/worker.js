/**
 * Web Worker for Data Processing
 * Handles heavy tasks like deduplication, splitting, comparison, merging and sanitization.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

// Utility Functions
function normalizeCoordinates(value) {
    const str = String(value || "").trim();
    let normalized = str.replace(/([NSEW])(\d+°)/g, "$1 $2");
    normalized = normalized.replace(/(\d\.\d{6,})([0-9]\d\.\d)/g, "$1 $2");
    normalized = normalized.replace(/(\d)([0-9]\d\.[0-9])/g, "$1 $2");
    return normalized;
}

function parseCSV(text) {
    const lines = text.split("\n");
    return lines.map((line) => {
        const values = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
                values.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    });
}

// Handlers
const Handlers = {
    dedupe: function(data, selectedColumns) {
        const headers = data[0];
        const dataRows = data.slice(1);
        const seen = new Set();
        const uniqueRows = [headers];
        const duplicateRows = [];
        
        const total = dataRows.length;
        dataRows.forEach((row, idx) => {
            if (idx % 100 === 0) {
                self.postMessage({ type: 'progress', progress: Math.floor((idx / total) * 100) });
            }
            
            if (!row || row.every((cell) => !cell)) return;
            const key = selectedColumns
                .map((idx) => String(row[idx] || "").trim())
                .join("|");
            if (!seen.has(key)) {
                seen.add(key);
                uniqueRows.push(row);
            } else {
                duplicateRows.push(row);
            }
        });
        
        return { uniqueRows, duplicateRows, headers };
    },

    split: function(data, selectedColumn, delimiter) {
        const headers = data[0];
        const originalColName = String(headers[selectedColumn] || "").trim() || `Column ${selectedColumn + 1}`;
        const newHeaders = [...headers];
        newHeaders.splice(selectedColumn + 1, 0, `${originalColName} - Part 2`);
        newHeaders[selectedColumn] = `${originalColName} - Part 1`;
        
        const splitRows = [newHeaders];
        let successCount = 0;
        const total = data.length - 1;

        for (let i = 1; i < data.length; i++) {
            if (i % 100 === 0) {
                self.postMessage({ type: 'progress', progress: Math.floor((i / total) * 100) });
            }
            
            const row = [...data[i]];
            let cellValue = String(row[selectedColumn] || "").trim();
            cellValue = normalizeCoordinates(cellValue);
            
            let part1 = "", part2 = "";
            
            if (cellValue) {
                let currentDelimiter = delimiter;
                if (delimiter === 'auto') {
                    // Simple auto-detect: try comma, then space
                    currentDelimiter = cellValue.includes(',') ? ',' : ' ';
                    if (!cellValue.includes(currentDelimiter)) {
                        const others = [';', ':'];
                        for (let d of others) {
                            if (cellValue.includes(d)) {
                                currentDelimiter = d;
                                break;
                            }
                        }
                    }
                }

                if (delimiter === 'all') {
                    const parts = cellValue.split(/[ ,;:]/);
                    part1 = parts[0].trim();
                    part2 = parts.slice(1).map(p => p.trim()).filter(p => p).join(", ").trim();
                } else {
                    const parts = cellValue.split(currentDelimiter);
                    part1 = parts[0].trim();
                    part2 = parts.length > 1 ? parts.slice(1).join(currentDelimiter).trim() : "";
                }
                
                row[selectedColumn] = part1;
                row.splice(selectedColumn + 1, 0, part2);
                successCount++;
            } else {
                row.splice(selectedColumn + 1, 0, "");
            }
            splitRows.push(row);
        }
        
        return { splitRows, successCount, delimiter };
    },

    compare: function(data1, data2, selectedCols1, selectedCols2) {
        const file1Data = new Map();
        for (let i = 1; i < data1.length; i++) {
            const keys = selectedCols1
                .map((col) => String(data1[i][col] || "").trim())
                .filter((v) => v)
                .join("|");
            if (keys) file1Data.set(keys, i);
        }

        const file2Data = new Map();
        for (let i = 1; i < data2.length; i++) {
            const keys = selectedCols2
                .map((col) => String(data2[i][col] || "").trim())
                .filter((v) => v)
                .join("|");
            if (keys) file2Data.set(keys, i);
        }

        const duplicates = { inBoth: [], onlyInFile1: [], onlyInFile2: [] };
        const total = file1Data.size + file2Data.size;
        let count = 0;

        file1Data.forEach((row1, keys) => {
            if (++count % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((count / total) * 100) });
            
            if (file2Data.has(keys)) {
                duplicates.inBoth.push({
                    keys: keys,
                    row1: row1,
                    row2: file2Data.get(keys)
                });
            } else {
                duplicates.onlyInFile1.push({ keys: keys, row: row1 });
            }
        });

        file2Data.forEach((row2, keys) => {
            if (++count % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((count / total) * 100) });
            
            if (!file1Data.has(keys)) {
                duplicates.onlyInFile2.push({ keys: keys, row: row2 });
            }
        });

        return { duplicates };
    },

    merge: function(data1, data2, key1, key2) {
        const h1 = data1[0];
        const h2 = data2[0];
        const combinedHeader = [...h1, ...h2.filter((_, i) => i !== key2)];
        
        const lookup = new Map();
        for (let i = 1; i < data2.length; i++) {
            const val = String(data2[i][key2] || "").trim();
            if (val) lookup.set(val, data2[i]);
        }
        
        const mergedRows = [combinedHeader];
        let matchCount = 0;
        const total = data1.length - 1;

        for (let i = 1; i < data1.length; i++) {
            if (i % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((i / total) * 100) });
            
            const row1 = data1[i];
            const val1 = String(row1[key1] || "").trim();
            const row2Match = lookup.get(val1);
            
            if (row2Match) {
                const extraData = row2Match.filter((_, idx) => idx !== key2);
                mergedRows.push([...row1, ...extraData]);
                matchCount++;
            } else {
                const emptyData = h2.filter((_, idx) => idx !== key2).map(() => "");
                mergedRows.push([...row1, ...emptyData]);
            }
        }
        
        return { mergedRows, matchCount };
    },

    sanitize: function(data, selectedCols, options = []) {
        const total = data.length - 1;
        const useDeepClean = options.length === 0;

        const cleanedRows = data.map((row, idx) => {
            if (idx === 0) return row;
            if (idx % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((idx / total) * 100) });
            
            const newRow = [...row];
            selectedCols.forEach(colIdx => {
                let val = String(newRow[colIdx] || "").trim();
                if (val) {
                    if (useDeepClean) {
                        val = val.replace(/[^0-9.-]/g, '');
                    } else {
                        if (options.includes('alpha')) {
                            val = val.replace(/[a-zA-Z]/g, '');
                        }
                        if (options.includes('spaces')) {
                            val = val.replace(/\s+/g, '');
                        }
                        if (options.includes('symbols')) {
                            val = val.replace(/[^\w\s.,\-°'"]/g, '');
                            val = val.replace(/[^a-zA-Z0-9\s.,\-°'"]/g, '');
                        }
                        if (options.includes('all_delims')) {
                            val = val.replace(/[,;:]/g, '');
                        } else {
                            if (options.includes('comma')) val = val.replace(/,/g, '');
                            if (options.includes('semicolon')) val = val.replace(/;/g, '');
                            if (options.includes('colon')) val = val.replace(/:/g, '');
                        }
                    }
                    newRow[colIdx] = val;
                }
            });
            return newRow;
        });
        
        return { cleanedRows };
    },

    convert: function(data, selectedColumns, conversionType) {
        const total = data.length - 1;
        const convertedData = JSON.parse(JSON.stringify(data));
        
        // This is a bit tricky because convertCoordinate is in conversion.js
        // For simplicity, I'll implement a basic version or just reuse what's needed.
        // Actually, the worker doesn't have access to conversion.js.
        // I'll implement a simple coordinate conversion logic here.
        
        for (let i = 1; i < data.length; i++) {
            if (i % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((i / total) * 100) });
            
            selectedColumns.forEach(colIndex => {
                let val = String(data[i][colIndex] || "").trim();
                if (val) {
                    // Very basic conversion logic for the worker
                    // If more complex conversion is needed, we'd need to import conversion.js
                    // But usually for batch it's just DMS to DD or vice versa
                    if (conversionType === 'dd' || (conversionType === 'auto' && /\d+°/.test(val))) {
                        // DMS to DD
                        const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/i;
                        const match = val.match(dmsPattern);
                        if (match) {
                            const deg = parseFloat(match[1]);
                            const min = parseFloat(match[2]);
                            const sec = parseFloat(match[3]);
                            const dir = match[4].toUpperCase();
                            let dd = deg + min / 60 + sec / 3600;
                            if (dir === 'S' || dir === 'W') dd = -dd;
                            convertedData[i][colIndex] = dd.toFixed(6);
                        }
                    } else if (conversionType === 'dms' || (conversionType === 'auto' && !/\d+°/.test(val))) {
                        // DD to DMS
                        const dd = parseFloat(val);
                        if (!isNaN(dd)) {
                            const abs = Math.abs(dd);
                            const deg = Math.floor(abs);
                            const minDec = (abs - deg) * 60;
                            const min = Math.floor(minDec);
                            const sec = ((minDec - min) * 60).toFixed(2);
                            const dir = dd >= 0 ? "N" : "S"; // Simplified
                            convertedData[i][colIndex] = `${deg}°${min}'${sec}"${dir}`;
                        }
                    }
                }
            });
        }
        
        return { convertedData };
    },

    batch: function(lines, type) {
        const total = lines.length;
        const results = lines.map((line, idx) => {
            if (idx % 100 === 0) self.postMessage({ type: 'progress', progress: Math.floor((idx / total) * 100) });
            
            const trimmed = line.trim();
            if (trimmed.includes(",")) {
                const parts = trimmed.split(",").map((p) => p.trim());
                if (parts.length === 2) {
                    // Simple conversion for batch
                    let res1, res2;
                    if (type === 'dd' || (type === 'auto' && /\d+°/.test(parts[0]))) {
                        // DMS to DD
                        const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/i;
                        const match1 = parts[0].match(dmsPattern);
                        const match2 = parts[1].match(dmsPattern);
                        res1 = match1 ? (parseFloat(match1[1]) + parseFloat(match1[2])/60 + parseFloat(match1[3])/3600) * (/[SW]/i.test(match1[4]) ? -1 : 1) : parts[0];
                        res2 = match2 ? (parseFloat(match2[1]) + parseFloat(match2[2])/60 + parseFloat(match2[3])/3600) * (/[SW]/i.test(match2[4]) ? -1 : 1) : parts[1];
                        if (typeof res1 === 'number') res1 = res1.toFixed(6);
                        if (typeof res2 === 'number') res2 = res2.toFixed(6);
                    } else {
                        // DD to DMS (simplified)
                        const dd1 = parseFloat(parts[0]);
                        const dd2 = parseFloat(parts[1]);
                        const toDMS = (dd, isLong) => {
                            if (isNaN(dd)) return dd;
                            const abs = Math.abs(dd);
                            const d = Math.floor(abs);
                            const mDec = (abs - d) * 60;
                            const m = Math.floor(mDec);
                            const s = ((mDec - m) * 60).toFixed(2);
                            const dir = isLong ? (dd >= 0 ? "E" : "W") : (dd >= 0 ? "N" : "S");
                            return `${d}°${m}'${s}"${dir}`;
                        };
                        res1 = toDMS(dd1, false);
                        res2 = toDMS(dd2, true);
                    }
                    return {
                        input: `${parts[0]}, ${parts[1]}`,
                        output: `${res1}, ${res2}`,
                    };
                }
            }
            // Single coordinate line
            let res;
            if (type === 'dd' || (type === 'auto' && /\d+°/.test(trimmed))) {
                const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/i;
                const match = trimmed.match(dmsPattern);
                res = match ? (parseFloat(match[1]) + parseFloat(match[2])/60 + parseFloat(match[3])/3600) * (/[SW]/i.test(match[4]) ? -1 : 1) : trimmed;
                if (typeof res === 'number') res = res.toFixed(6);
            } else {
                const dd = parseFloat(trimmed);
                if (!isNaN(dd)) {
                    const abs = Math.abs(dd);
                    const d = Math.floor(abs);
                    const mDec = (abs - d) * 60;
                    const m = Math.floor(mDec);
                    const s = ((mDec - m) * 60).toFixed(2);
                    const dir = Math.abs(dd) > 90 ? (dd >= 0 ? "E" : "W") : (dd >= 0 ? "N" : "S");
                    res = `${d}°${m}'${s}"${dir}`;
                } else {
                    res = trimmed;
                }
            }
            return { input: trimmed, output: res };
        });
        
        return { results };
    },

    exportExcel: function(payload) {
        let { data, headers, sheetName, fileName, styles, taskType, taskPayload } = payload;
        
        // Assemble data if a specialized task is requested
        if (taskType === 'matched_export') {
            const { comparisonData1, inBoth } = taskPayload;
            const h1 = comparisonData1[0] || [];
            const combinedHeader = ["MATCH_STATUS", ...h1];
            data = [combinedHeader];
            inBoth.forEach(item => {
                data.push(["✓ Matched", ...(comparisonData1[item.row1] || [])]);
            });
        } else if (taskType === 'file1_unmatched_export') {
            const { comparisonData1, onlyInFile1 } = taskPayload;
            const h1 = comparisonData1[0] || [];
            const combinedHeader = ["MATCH_STATUS", ...h1];
            data = [combinedHeader];
            onlyInFile1.forEach(item => {
                data.push(["✗ Only in File 1", ...(comparisonData1[item.row] || [])]);
            });
        } else if (taskType === 'file2_unmatched_export') {
            const { comparisonData2, onlyInFile2 } = taskPayload;
            const h2 = comparisonData2[0] || [];
            const combinedHeader = ["MATCH_STATUS", ...h2];
            data = [combinedHeader];
            onlyInFile2.forEach(item => {
                data.push(["✗ Only in File 2", ...(comparisonData2[item.row] || [])]);
            });
        } else if (taskType === 'unmatched_export') {
            const { comparisonData1, comparisonData2, onlyInFile1, onlyInFile2 } = taskPayload;
            const h1 = comparisonData1[0] || [];
            const combinedHeader = ["MATCH_STATUS", ...h1];
            data = [combinedHeader];
            onlyInFile1.forEach(item => {
                data.push(["✗ Unmatched", ...(comparisonData1[item.row] || [])]);
            });
            onlyInFile2.forEach(item => {
                const row = ["✗ Unmatched"];
                const rowData = comparisonData2[item.row] || [];
                for (let i = 0; i < h1.length; i++) {
                    row.push(rowData[i] || "");
                }
                data.push(row);
            });
        } else if (taskType === 'dedupe_export') {
            const { uniqueRows } = taskPayload;
            data = uniqueRows;
        } else if (taskType === 'removed_duplicates_export') {
            const { duplicateRows, headers } = taskPayload;
            data = [headers, ...duplicateRows];
        } else if (taskType === 'excel_upload_export') {
            const { data: uploadData } = taskPayload;
            data = uploadData;
        }

        if (!data || data.length === 0) {
            throw new Error("No data provided for export");
        }

        // Memory safety: If data is extremely large, warn or simplify
        const rowCount = data.length;
        const colCount = data[0] ? data[0].length : 0;
        const totalCells = rowCount * colCount;
        
        // Threshold for disabling complex styling (e.g., 25,000 rows or 500,000 cells)
        const isHugeDataset = rowCount > 25000 || totalCells > 500000;
        
        if (isHugeDataset) {
            console.log("Huge dataset detected, simplifying Excel generation for memory safety.");
            // Disable alternating row styles for large files to save memory
            if (styles) {
                styles.alternateRowStyle = null;
                styles.standardRowStyle = null;
            }
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName || "Data");
        
        // Apply basic column widths (low memory overhead)
        if (styles && styles.colWidths) {
            ws["!cols"] = styles.colWidths;
        }
        
        // Apply freeze panes (low memory overhead)
        if (styles && styles.freeze) {
            ws["!freeze"] = styles.freeze;
        }

        // Apply styles to header
        if (styles && styles.headerStyle) {
            const range = XLSX.utils.decode_range(ws["!ref"]);
            for (let c = range.s.c; c <= range.e.c; ++c) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: c });
                if (!ws[cellRef]) continue;
                ws[cellRef].s = styles.headerStyle;
            }
        }
        
        if (!isHugeDataset && styles && styles.alternateRowStyle && styles.standardRowStyle) {
            const range = XLSX.utils.decode_range(ws["!ref"]);
            for (let r = 1; r <= range.e.r; ++r) {
                const style = r % 2 === 0 ? styles.alternateRowStyle : styles.standardRowStyle;
                for (let c = range.s.c; c <= range.e.c; ++c) {
                    const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
                    if (!ws[cellRef]) continue;
                    ws[cellRef].s = style;
                }
            }
        }

        // Standard XLSX.write options
        const writeOptions = {
            bookType: payload.bookType || 'xlsx',
            type: 'array',
            compression: true
        };

        const wbout = XLSX.write(wb, {
            ...writeOptions
        });
        
        // Return result object to be handled by the main message listener
        return {
            isTransferable: true,
            binary: wbout,
            fileName: fileName || (writeOptions.bookType === 'csv' ? 'export.csv' : 'export.xlsx'),
            bookType: writeOptions.bookType
        };
    }
};

// Main Message Listener
self.onmessage = function(e) {
    const { type, payload } = e.data;
    let result;

    try {
        switch(type) {
            case 'dedupe':
                result = Handlers.dedupe(payload.data, payload.selectedColumns);
                break;
            case 'split':
                result = Handlers.split(payload.data, payload.selectedColumn, payload.delimiter);
                break;
            case 'compare':
                result = Handlers.compare(payload.data1, payload.data2, payload.selectedCols1, payload.selectedCols2);
                break;
            case 'merge':
                result = Handlers.merge(payload.data1, payload.data2, payload.key1, payload.key2);
                break;
            case 'sanitize':
                result = Handlers.sanitize(payload.data, payload.selectedCols, payload.options);
                break;
            case 'convert':
                result = Handlers.convert(payload.data, payload.selectedColumns, payload.conversionType);
                break;
            case 'batch':
                result = Handlers.batch(payload.lines, payload.type);
                break;
            case 'excel_export':
                result = Handlers.exportExcel(payload);
                break;
            default:
                throw new Error("Unknown task type: " + type);
        }

        if (result && result.isTransferable && result.binary) {
            let buffer = null;
            if (result.binary instanceof ArrayBuffer) {
                buffer = result.binary;
            } else if (result.binary.buffer instanceof ArrayBuffer) {
                buffer = result.binary.buffer;
            }

            if (buffer) {
                self.postMessage({ type: 'complete', result }, [buffer]);
            } else {
                self.postMessage({ type: 'complete', result });
            }
        } else {
            self.postMessage({ type: 'complete', result });
        }
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
