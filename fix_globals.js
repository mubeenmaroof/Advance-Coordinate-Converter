const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'js');
const files = fs.readdirSync(dir);

const globals = [
  "batchResults", "excelData", "detectedColumns", "map", "markers",
  "currentPrecision", "conversionHistory", "savedPresets", "processedData",
  "coordinateDataStore", "currentMarkerStyle", "currentMapLayer", "tileLayer",
  "dedupeData", "dedupeSelectedColumns", "dedupeWorkbook", "dedupeSelectedSheet",
  "splitData", "splitSelectedColumn", "splitWorkbook", "splitSelectedSheet",
  "comparisonData1", "comparisonData2", "comparisonFile1Name", "comparisonFile2Name",
  "lastComparisonResults", "lastSelectedCols1", "lastSelectedCols2", "comparisonWorkbook1",
  "comparisonWorkbook2", "googleSheetData", "googleSheetWorkbook", "googleSheetSelectedSheet"
];

files.forEach(file => {
  if (file === 'variables.js' || !file.endsWith('.js')) return;
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  globals.forEach(g => {
    const regex = new RegExp(`^(\\s*)let\\s+${g}\\s*=`, 'gm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1${g} =`);
      changed = true;
      console.log(`Replaced let ${g} in ${file}`);
    }
    const regex2 = new RegExp(`^(\\s*)let\\s+${g}\\s*;`, 'gm');
    if (regex2.test(content)) {
      content = content.replace(regex2, `$1${g};`);
      changed = true;
      console.log(`Replaced let ${g}; in ${file}`);
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log('Done');
