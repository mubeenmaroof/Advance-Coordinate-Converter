// Utility functions shared across components

function parseDMS(dmsString) {
  const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/;
  const match = dmsString.match(dmsPattern);
  if (!match) return null;
  const degrees = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const direction = match[4];
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === "S" || direction === "W") {
    dd = -dd;
  }
  return dd;
}

function formatDMS(dd, isLongitude = false) {
  const abs = Math.abs(dd);
  const degrees = Math.floor(abs);
  const minutesDecimal = (abs - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);
  let direction;
  if (isLongitude) {
    direction = dd >= 0 ? "E" : "W";
  } else {
    direction = dd >= 0 ? "N" : "S";
  }
  return `${degrees}°${minutes}'${seconds}"${direction}`;
}

function isDMS(input) {
  return /\d+°\d+'\d+\.?\d*"[NSEW]/.test(input);
}

function extractCoordinates(value) {
  let lat = null,
    lng = null;
  const stringValue = String(value).trim();
  if (isDMS(stringValue)) {
    const dd = parseDMS(stringValue);
    if (dd !== null) {
      const direction = stringValue.match(/[NSEW]/);
      if (direction) {
        if (direction[0] === "N" || direction[0] === "S") {
          lat = dd;
        } else if (direction[0] === "E" || direction[0] === "W") {
          lng = dd;
        }
      } else if (Math.abs(dd) <= 90) {
        lat = dd;
      } else {
        lng = dd;
      }
    }
  } else {
    const num = parseFloat(stringValue);
    if (!isNaN(num) && Math.abs(num) <= 180) {
      if (Math.abs(num) <= 90) {
        lat = num;
      } else {
        lng = num;
      }
    }
  }
  return { lat, lng };
}

function pairCoordinates(coordStore) {
  const paired = [];
  const used = new Set();
  for (let i = 0; i < coordStore.length; i++) {
    if (used.has(i)) continue;
    const item1 = coordStore[i];
    if (item1.lat !== null && item1.lng !== null) {
      paired.push(item1);
      used.add(i);
      continue;
    }
    for (let j = i + 1; j < coordStore.length; j++) {
      if (used.has(j)) continue;
      const item2 = coordStore[j];
      if (item1.rowIndex === item2.rowIndex) {
        if (item1.lat !== null && item2.lng !== null) {
          paired.push({
            ...item1,
            lng: item2.lng,
            lngOriginal: item2.originalValue,
          });
          used.add(i);
          used.add(j);
          break;
        } else if (item1.lng !== null && item2.lat !== null) {
          paired.push({
            ...item2,
            lng: item1.lng,
            lngOriginal: item1.originalValue,
          });
          used.add(i);
          used.add(j);
          break;
        }
      }
    }
    if (!used.has(i)) {
      if (item1.lat !== null) {
        paired.push({ ...item1, lng: 0 });
      } else if (item1.lng !== null) {
        paired.push({ ...item1, lat: 0 });
      }
      used.add(i);
    }
  }
  return paired;
}

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
// File Size Validation
function validateFileSize(file, maxSizeMB = 40) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    alert(`File is too large! Maximum allowed size is ${maxSizeMB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
    return false;
  }
  return true;
}

// expose to global for older inline handlers
window.parseDMS = parseDMS;
window.formatDMS = formatDMS;
window.isDMS = isDMS;
window.extractCoordinates = extractCoordinates;
window.pairCoordinates = pairCoordinates;
window.normalizeCoordinates = normalizeCoordinates;
window.parseCSV = parseCSV;
window.validateFileSize = validateFileSize;
