// Global state variables used across components
var batchResults = [];
var excelData = null;
var detectedColumns = [];
var map = null;
var markers = [];
var currentPrecision = 6;
var conversionHistory = JSON.parse(
  localStorage.getItem("conversionHistory") || "[]",
);
var savedPresets = JSON.parse(localStorage.getItem("savedPresets") || "[]");
var coordinateDataStore = [];
var currentMarkerStyle = "numbered";
var currentMarkerSize = 35;
var currentMapLayer = "openstreetmap";
var tileLayer = null;

// Advanced GIS Global State
var markerClusterGroup = null;
var isClusteringEnabled = false;
var heatLayer = null;
var isHeatmapEnabled = false;
var drawnItems = null;
var drawControl = null;
var routePolyline = null;
var activeMeasurementMode = null; // null, 'distance', 'area'
var measurementLayers = null;
var tempMeasurementPoints = [];
var bufferLayer = null;
var isLabelsActive = false;
var selectedMarkers = [];
var selectedFeatures = { points: [], lines: [], polygons: [] };
var lastSelectionLayer = null;

// Shape colors for multiple polygons/rectangles/circles
var shapeColors = [
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
var currentShapeColorIndex = 0;
var drawnShapesInfo = []; // Track info about drawn shapes

// Variables for other tools
var dedupeData = [];
var dedupeSelectedColumns = [];
var dedupeWorkbook = null;
var dedupeSelectedSheet = null;

var splitData = [];
var splitSelectedColumn = null;
var splitWorkbook = null;
var splitSelectedSheet = null;

var comparisonData1 = null;
var comparisonData2 = null;
var comparisonFile1Name = "";
var comparisonFile2Name = "";
var lastComparisonResults = null;
var lastSelectedCols1 = null;
var lastSelectedCols2 = null;
var comparisonWorkbook1 = null;
var comparisonWorkbook2 = null;

var googleSheetData = [];
var googleSheetWorkbook = null;
var googleSheetSelectedSheet = null;

// Geocoding Variables
var geocodingData = [];
var geocodingWorkbook = null;
var geocodingSelectedSheet = null;
var geocodingSelectedColumn = null;
var isGeocodingCancelled = false;

// GeoJSON Variables
var currentGeoJsonData = null;
var geoJsonCoordinateStore = [];

// KML/KMZ Variables
var currentKmlData = null;
var kmlCoordinateStore = [];

// Shapefile Variables
var currentShpData = null;
var shpCoordinateStore = [];

// GPX Variables
var currentGpxData = null;
var gpxCoordinateStore = [];

// Global Layer Groups for GIS Export/Management
var importedLayers = null; // Will be initialized as L.layerGroup() in map.js


// ── Map Layer Visibility Tracking ────────────────────────────────────
// Tracks which uploaded files are currently visible on the map.
// Keys are composite strings: "type::fileName" (e.g. "gpx::mytrack.gpx")
// Value is a layer group or null (if just a marker-based toggle)
var mapVisibleLayers = {};
var mapLayerVisibilityFlags = {}; // { "type::fileName": true|false }

// the following DOM listeners are moved to their respective modules (dedupe/split/comparison etc)
