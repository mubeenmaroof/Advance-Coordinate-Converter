// Global state variables used across components
let batchResults = [];
let excelData = null;
let detectedColumns = [];
let map = null;
let markers = [];
let currentPrecision = 6;
let conversionHistory = JSON.parse(
  localStorage.getItem("conversionHistory") || "[]",
);
let savedPresets = JSON.parse(localStorage.getItem("savedPresets") || "[]");
let coordinateDataStore = [];
let currentMarkerStyle = "numbered";
let currentMarkerSize = 35;
let currentMapLayer = "openstreetmap";
let tileLayer = null;

// Advanced GIS Global State
let markerClusterGroup = null;
let isClusteringEnabled = false;
let heatLayer = null;
let isHeatmapEnabled = false;
let drawnItems = null;
let drawControl = null;
let routePolyline = null;
let activeMeasurementMode = null; // null, 'distance', 'area'
let measurementLayers = null;
let tempMeasurementPoints = [];
let bufferLayer = null;
let convexHullLayer = null;
let isConvexHullActive = false;
let isLabelsActive = false;
let selectedMarkers = [];
let lastSelectionLayer = null;

// Shape colors for multiple polygons/rectangles/circles
let shapeColors = [
  "#FF6B6B", // Red
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#FFA07A", // Light Salmon
  "#98D8C8", // Mint
  "#F7DC6F", // Yellow
  "#BB8FCE", // Purple
  "#85C1E2", // Light Blue
  "#F8B88B", // Orange
  "#52C4A2", // Green
  "#FF1493", // Deep Pink
  "#00CED1", // Dark Turquoise
  "#32CD32", // Lime Green
  "#FF4500", // Orange Red
  "#4169E1", // Royal Blue
  "#20B2AA", // Light Sea Green
  "#FFD700", // Gold
  "#FF6347", // Tomato
  "#87CEEB", // Sky Blue
  "#DA70D6", // Orchid
  "#2E8B57", // Sea Green
  "#FA8072", // Salmon
  "#FF69B4", // Hot Pink
  "#00FA9A", // Medium Spring Green
  "#DC143C", // Crimson
  "#8A2BE2", // Blue Violet
  "#00BFFF", // Deep Sky Blue
  "#FF8C00", // Dark Orange
  "#9370DB", // Medium Purple
  "#3CB371", // Medium Sea Green
];
let currentShapeColorIndex = 0;
let drawnShapesInfo = []; // Track info about drawn shapes

// Variables for other tools
let dedupeData = [];
let dedupeSelectedColumns = [];
let dedupeWorkbook = null;
let dedupeSelectedSheet = null;

let splitData = [];
let splitSelectedColumn = null;
let splitWorkbook = null;
let splitSelectedSheet = null;

let comparisonData1 = null;
let comparisonData2 = null;
let comparisonFile1Name = "";
let comparisonFile2Name = "";
let lastComparisonResults = null;
let lastSelectedCols1 = null;
let lastSelectedCols2 = null;
let comparisonWorkbook1 = null;
let comparisonWorkbook2 = null;

let googleSheetData = [];
let googleSheetWorkbook = null;
let googleSheetSelectedSheet = null;

// Geocoding Variables
let geocodingData = [];
let geocodingWorkbook = null;
let geocodingSelectedSheet = null;
let geocodingSelectedColumn = null;
let isGeocodingCancelled = false;


// the following DOM listeners are moved to their respective modules (dedupe/split/comparison etc)
