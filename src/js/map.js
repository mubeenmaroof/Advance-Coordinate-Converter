// map-related logic and helpers

function initMap() {
  // Check if mapContainer exists
  const mapContainer = document.getElementById("mapContainer");
  if (!mapContainer) {
    console.error("❌ Map container element not found in DOM!");
    if (typeof showToast === "function") {
      showToast(
        "Map container not found. Please refresh the page.",
        "error"
      );
    } else {
      alert("Map container not found. Please refresh the page.");
    }
    return;
  }

  if (map) {
    map.remove();
    map = null;
  }
  try {
    map = L.map("mapContainer", {
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);

    // --- Leaflet Draw 1.0.4 + Leaflet 1.9.x Polygon Completion BugFix ---
    // Overrides the internal vertex add to explicitly finish shape if the last
    // click is very close to the first point or if it's a double click.
    if (L.Draw && L.Draw.Polygon) {
      const originalAddVertex = L.Draw.Polyline.prototype.addVertex;
      L.Draw.Polyline.prototype.addVertex = function (latlng) {
        const markersLength = this._markers ? this._markers.length : 0;
        if (markersLength >= 2 && this.type === "polygon") {
          const firstPoint = this._map.latLngToLayerPoint(
            this._markers[0].getLatLng(),
          );
          const currentPoint = this._map.latLngToLayerPoint(latlng);
          const distance = firstPoint.distanceTo(currentPoint);
          // If clicked within 20 pixels of the first point, close it
          if (distance <= 20) {
            this.completeShape();
            return;
          }
        }
        originalAddVertex.call(this, latlng);
      };
    }
    // --------------------------------------------------------------------

    // Initialize Draw Layer
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Initialize Measurement Layer
    measurementLayers = new L.FeatureGroup();
    map.addLayer(measurementLayers);

    // Initialize Buffer Layer
    bufferLayer = new L.FeatureGroup();
    map.addLayer(bufferLayer);

    // Initialize Convex Hull Layer
    convexHullLayer = new L.FeatureGroup();
    map.addLayer(convexHullLayer);

    // Initialize MarkerCluster Group
    markerClusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
    });

    if (isClusteringEnabled) {
      map.addLayer(markerClusterGroup);
    }

    // Setup Leaflet Draw Control with dynamic colors
    // IMPORTANT: We set edit.featureGroup to manage shape persistence
    drawControl = new L.Control.Draw({
      position: "topleft",
      edit: {
        featureGroup: drawnItems,
        poly: {
          allowIntersection: true,
        },
        edit: true,
        remove: true,
      },
      draw: {
        polygon: {
          allowIntersection: true,
          drawError: {
            color: "#e1e100",
            message: "<strong>Oh snap!<strong> you can't draw that!",
          },
          shapeOptions: {
            color: shapeColors[currentShapeColorIndex],
            weight: 3,
            opacity: 0.8,
            fillOpacity: 0.3,
          },
        },
        polyline: false,
        rectangle: {
          shapeOptions: {
            color: shapeColors[currentShapeColorIndex],
            weight: 3,
            opacity: 0.8,
            fillOpacity: 0.3,
          },
        },
        circle: {
          shapeOptions: {
            color: shapeColors[currentShapeColorIndex],
            weight: 3,
            opacity: 0.8,
            fillOpacity: 0.2,
          },
        },
        marker: false,
        circlemarker: false,
      },
    });

    let isDrawing = false;

    // Enable double click to finish drawing without zooming
    map.doubleClickZoom.disable();

    map.on("draw:drawstart", function (e) {
      // Ensure map is fully initialized before drawing starts
      if (!map || !drawnItems || !measurementLayers || !bufferLayer || !convexHullLayer) {
        console.warn("⚠️ Drawing attempted before full initialization. This should not happen.");
        // This is a safety check - the drawing toolbar shouldn't be accessible if map isn't ready
        return;
      }

      isDrawing = true;
      map.doubleClickZoom.disable();
      if (drawnItems) {
        console.log(
          "🎨 Draw start - current shapes on map:",
          drawnItems.getLayers().length,
        );
      }
    });

    map.on("draw:drawstop", function (e) {
      isDrawing = false;
      map.doubleClickZoom.enable();
      if (drawnItems) {
        console.log(
          "🎨 Draw stop - current shapes on map:",
          drawnItems.getLayers().length,
        );
      }
    });

    // Don't manually handle dblclick - let Leaflet Draw handle it naturally
    // This was causing shapes to disappear after double-clicking to finish

    // REMOVED: Enter key listener that called finishDrawing()
    // This was causing shapes to disappear immediately after creation
    // Users can complete shapes via:
    // - Double-click (Leaflet Draw native)
    // - Click outside the shape
    // - Press Escape to cancel
    // - Right-click menu

    map.addControl(drawControl);

    // Add Custom GIS Toolbar on Map
    const CustomGISControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function (map) {
        const container = L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-control leaflet-gis-control",
        );
        container.style.backgroundColor = "white";
        container.style.padding = "5px";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "5px";
        container.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";
        container.style.borderRadius = "5px";

        const createButton = (html, title, onClick) => {
          const btn = L.DomUtil.create("a", "", container);
          btn.innerHTML = html;
          btn.title = title;
          btn.href = "#";
          btn.style.width = "34px";
          btn.style.height = "34px";
          btn.style.lineHeight = "34px";
          btn.style.textAlign = "center";
          btn.style.textDecoration = "none";
          btn.style.color = "black";
          btn.style.fontSize = "18px";
          btn.style.display = "block";
          L.DomEvent.on(btn, "click", L.DomEvent.stop).on(
            btn,
            "click",
            onClick,
          );
          return btn;
        };

        createButton("📏", "Measure Distance", (e) =>
          toggleMeasurement("distance"),
        ).id = "btnMeasureDist";
        createButton("📐", "Measure Area", (e) =>
          toggleMeasurement("area"),
        ).id = "btnMeasureArea";

        createButton("🎯", "Apply Buffer from Center", () => {
          const radius = prompt("Enter Buffer Radius in Meters:", "1000");
          if (radius) {
            const input = document.getElementById("bufferRadius");
            if (input) input.value = radius;
            applyBuffer();
          }
        }).id = "btnBuffer";

        createButton("🛡️", "Generate Convex Hull (Boundary)", () =>
          toggleConvexHull(),
        ).id = "btnConvexHull";
        // createButton("🏷️", "Toggle Site Labels", () => toggleLabels()).id =
        //   "btnToggleLabels";

        // Color indicator button
        // const colorBtn = createButton("🎨", "Show drawn shapes info", () =>
        //   showDrawnShapesInfo(),
        // );
        // colorBtn.id = "btnColorIndicator";
        // colorBtn.style.backgroundColor = shapeColors[0]; // Start with first color
        // colorBtn.style.color = "white";
        // colorBtn.style.fontWeight = "bold";

        createButton("🧹", "Clear All Tools", () => clearDrawings()).id =
          "btnClearTools";

        return container;
      },
    });
    map.addControl(new CustomGISControl());

    // Add Search Bar as Custom Overlay (not using Leaflet Control)
    const mapContainer = document.getElementById("mapContainer");
    if (mapContainer) {
      const searchBarContainer = document.createElement("div");
      searchBarContainer.className = "leaflet-search-control-left";
      searchBarContainer.style.position = "absolute";
      searchBarContainer.style.top = "12px";
      searchBarContainer.style.left = "55px";
      searchBarContainer.style.transform = "none";
      searchBarContainer.style.zIndex = "1000";
      searchBarContainer.style.backgroundColor = "white";
      searchBarContainer.style.padding = "10px";
      searchBarContainer.style.borderRadius = "8px";
      searchBarContainer.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
      searchBarContainer.style.width = "300px";

      const searchWrapper = document.createElement("div");
      searchWrapper.style.display = "flex";
      searchWrapper.style.gap = "4px";
      searchWrapper.style.alignItems = "center";

      const searchInput = document.createElement("input");
      searchInput.id = "mapSearchInput";
      searchInput.type = "text";
      searchInput.placeholder = "Search coordinates...";
      searchInput.style.flex = "1";
      searchInput.style.padding = "6px 20px";
      searchInput.style.border = "1px solid #ddd";
      searchInput.style.borderRadius = "4px";
      searchInput.style.fontSize = "12px";
      searchInput.style.fontFamily = "Arial, sans-serif";

      const searchBtn = document.createElement("button");
      searchBtn.innerHTML = "🔍";
      searchBtn.title = "Search location";
      searchBtn.style.padding = "6px 8px";
      searchBtn.style.backgroundColor = "#667eea";
      searchBtn.style.color = "white";
      searchBtn.style.border = "none";
      searchBtn.style.borderRadius = "4px";
      searchBtn.style.cursor = "pointer";
      searchBtn.style.fontSize = "14px";
      searchBtn.style.fontWeight = "bold";
      searchBtn.style.transition = "background 0.2s";

      searchBtn.onmouseover = () => {
        searchBtn.style.backgroundColor = "#764ba2";
      };
      searchBtn.onmouseout = () => {
        searchBtn.style.backgroundColor = "#667eea";
      };

      const clearBtn = document.createElement("button");
      clearBtn.innerHTML = "🗑️";
      clearBtn.title = "Clear all markers from map";
      clearBtn.style.padding = "6px 8px";
      clearBtn.style.backgroundColor = "#dc3545";
      clearBtn.style.color = "white";
      clearBtn.style.border = "none";
      clearBtn.style.borderRadius = "4px";
      clearBtn.style.cursor = "pointer";
      clearBtn.style.fontSize = "14px";
      clearBtn.style.fontWeight = "bold";
      clearBtn.style.transition = "background 0.2s";
      clearBtn.style.minWidth = "34px";
      clearBtn.style.padding = "6px 6px";

      clearBtn.onmouseover = () => {
        clearBtn.style.backgroundColor = "#c82333";
      };
      clearBtn.onmouseout = () => {
        clearBtn.style.backgroundColor = "#dc3545";
      };

      const performSearch = () => {
        const query = searchInput.value.trim();
        if (!query) {
          showToast("Please enter coordinates or a location", "warning");
          return;
        }

        const coordPattern = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
        const match = query.match(coordPattern);

        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);

          if (
            !isNaN(lat) &&
            !isNaN(lng) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lng) <= 180
          ) {
            const icon = createMarkerIcon(currentMarkerStyle, markers.length + 1);
            const marker = L.marker([lat, lng], { icon: icon });

            if (isClusteringEnabled && markerClusterGroup) {
              markerClusterGroup.addLayer(marker);
            } else {
              marker.addTo(map);
            }

            marker.markerData = {
              lat: lat,
              lng: lng,
              rowData: { SearchQuery: query },
              rowIndex: markers.length + 1,
            };

            const popupHTML = createPremiumPopupHTML(
              lat,
              lng,
              { SearchQuery: query },
              markers.length + 1,
            );
            marker.bindPopup(popupHTML, { maxWidth: 350 });

            marker.on("popupopen", () => highlightMarker(marker));
            marker.on("popupclose", () => unhighlightMarkers());

            markers.push(marker);
            marker.openPopup();

            map.flyTo([lat, lng], 13, {
              duration: 1,
              easeLinearity: 0.25,
            });

            showToast(`📍 Added location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, "success");
            searchInput.value = "";
          } else {
            showToast("Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180", "error");
          }
        } else {
          showToast("Please enter coordinates in format: lat, lng (e.g., 40.7128, -74.0060)", "info");
        }
      };

      searchBtn.addEventListener("click", performSearch);
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          performSearch();
        }
      });

      clearBtn.addEventListener("click", () => {
        if (markers.length === 0) {
          showToast("No markers to clear", "info");
          return;
        }

        const confirmClear = confirm(`Clear all ${markers.length} marker(s)? This cannot be undone.`);
        if (confirmClear) {
          clearMapMarkers();
          showToast("✓ All markers cleared", "success");
        }
      });

      searchWrapper.appendChild(searchInput);
      searchWrapper.appendChild(searchBtn);
      searchWrapper.appendChild(clearBtn);
      searchBarContainer.appendChild(searchWrapper);
      mapContainer.appendChild(searchBarContainer);
    }

    // Handle Draw Created Event for Spatial Filtering & Color Assignment
    // Handle Draw Created Event - Shape Persistence
    map.on("draw:created", function (event) {
      try {
        console.log("🎨 Draw created event triggered");

        // Auto-initialize if map layers aren't ready
        if (!drawnItems) {
          console.warn("⚠️ drawnItems not initialized, reinitializing...");

          // Reinitialize critical layers
          if (!map) {
            console.error("❌ Map itself is not initialized! This should not happen.");
            showToast("Fatal error: Map not initialized. Please refresh the page.", "error");
            return;
          }

          // Recreate missing layers
          drawnItems = new L.FeatureGroup();
          map.addLayer(drawnItems);
          console.log("✅ Recreated drawnItems layer");

          // Recreate other critical layers if missing
          if (!measurementLayers) {
            measurementLayers = new L.FeatureGroup();
            map.addLayer(measurementLayers);
          }
          if (!bufferLayer) {
            bufferLayer = new L.FeatureGroup();
            map.addLayer(bufferLayer);
          }
          if (!convexHullLayer) {
            convexHullLayer = new L.FeatureGroup();
            map.addLayer(convexHullLayer);
          }
        }

        console.log("📊 Shapes BEFORE adding:", drawnItems.getLayers().length);
        const layer = event.layer;
        console.log("Layer created:", layer.constructor.name);

        // Add layer to drawnItems
        drawnItems.addLayer(layer);
        console.log("✅ Layer added to drawnItems");
        console.log("📊 Shapes AFTER adding:", drawnItems.getLayers().length);
        console.log("📊 All shapes in layer:", drawnItems.getLayers());

        // Get current color
        const currentColor = shapeColors[currentShapeColorIndex];

        // Apply custom color and styling to the layer
        if (layer.setStyle) {
          layer.setStyle({
            color: currentColor,
            weight: 3,
            opacity: 0.8,
            fillOpacity: layer instanceof L.Circle ? 0.2 : 0.3,
            fill: true,
            fillColor: currentColor,
          });
          console.log("✅ Style applied with color:", currentColor);
        }

        // Track shape info for display
        const shapeInfo = {
          id: drawnShapesInfo.length + 1,
          color: currentColor,
          type: layer.constructor.name,
          layer: layer,
          createdAt: new Date(),
        };
        drawnShapesInfo.push(shapeInfo);
        console.log("✅ Shape info tracked:", shapeInfo);
        console.log("📊 Total tracked shapes:", drawnShapesInfo.length);

        // Cycle to next color for next shape
        currentShapeColorIndex =
          (currentShapeColorIndex + 1) % shapeColors.length;
        updateDrawControlColors();

        // Point in Polygon Logic - filter markers
        if (markers && markers.length > 0) {
          filterPointsByDrawing(layer);
        }

        // Count shapes by type for notification
        let shapeCounts = {
          polygon: 0,
          rectangle: 0,
          circle: 0,
          other: 0,
        };

        if (drawnItems) {
          drawnItems.eachLayer((layer) => {
            if (layer instanceof L.Polygon && !(layer instanceof L.Rectangle)) {
              shapeCounts.polygon++;
            } else if (layer instanceof L.Rectangle) {
              shapeCounts.rectangle++;
            } else if (layer instanceof L.Circle) {
              shapeCounts.circle++;
            } else {
              shapeCounts.other++;
            }
          });
        }

        // Build summary message with type breakdown
        let summary = [];
        if (shapeCounts.polygon > 0) summary.push(`${shapeCounts.polygon} polygon${shapeCounts.polygon > 1 ? 's' : ''}`);
        if (shapeCounts.rectangle > 0) summary.push(`${shapeCounts.rectangle} rectangle${shapeCounts.rectangle > 1 ? 's' : ''}`);
        if (shapeCounts.circle > 0) summary.push(`${shapeCounts.circle} circle${shapeCounts.circle > 1 ? 's' : ''}`);
        if (shapeCounts.other > 0) summary.push(`${shapeCounts.other} other`);

        const summaryText = summary.length > 0 ? summary.join(', ') : 'shape';

        // Show toast notification with proper spacing and counts
        showToast(
          `✏️ Boundary created • Total: ${summaryText}`,
          "success",
        );
        updateMapStats();
      } catch (err) {
        console.error("❌ Error in draw:created handler:", err);
        showToast("Error creating shape: " + err.message, "error");
      }
    });

    // Handle Draw Edited Event to maintain shape persistence
    map.on("draw:edited", function (event) {
      const editedLayers = event.layers;
      console.log("📝 Draw edited event fired");
      if (editedLayers) {
        console.log("   Edited layers count:", editedLayers.getLayers().length);
      }
      if (drawnItems) {
        console.log(
          "   Total shapes in drawnItems:",
          drawnItems.getLayers().length,
        );
      }
      editedLayers.eachLayer(function (layer) {
        console.log("   Shape edited:", layer.constructor.name);
      });
    });

    // Handle Draw Deleted Event to remove from tracking
    map.on("draw:deleted", function (event) {
      const deletedLayers = event.layers;
      console.log("🗑️ Draw deleted event fired");
      if (deletedLayers) {
        console.log("   Deleted layers count:", deletedLayers.getLayers().length);
      }
      if (drawnItems) {
        console.log("   Shapes BEFORE removal:", drawnItems.getLayers().length);
      }
      deletedLayers.eachLayer(function (layer) {
        console.log("   Shape deleted:", layer.constructor.name);
        // Remove from our tracking
        drawnShapesInfo = drawnShapesInfo.filter(
          (info) => info.layer !== layer,
        );
      });
      if (drawnItems) {
        console.log("   Shapes AFTER removal:", drawnItems.getLayers().length);
      }
      updateMapStats();
    });

    loadMapLayer(currentMapLayer);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    // Confirm successful initialization
    console.log("✅ Map initialized successfully");

    // Initial stats update
    updateMapStats();

    // Stats event listeners
    map.on("zoomend", updateMapStats);

    const zoomInput = document.getElementById("statZoomLevelInput");
    if (zoomInput) {
      zoomInput.addEventListener("change", (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 1 && val <= 22) {
          map.setZoom(val);
        } else {
          e.target.value = map.getZoom();
        }
      });
      // Prevent scrolling the dashboard from changing zoom unless focused
      zoomInput.addEventListener("wheel", (e) => {
        if (document.activeElement !== zoomInput) e.preventDefault();
      });
    }
  } catch (error) {
    console.error("❌ CRITICAL: Error initializing map:", error);
    console.error("   Error message:", error.message);
    console.error("   Stack trace:", error.stack);

    // Try to show non-blocking toast instead of alert
    if (typeof showToast === "function") {
      showToast(
        "Error initializing map: " + error.message + ". Please refresh the page.",
        "error"
      );
    } else {
      alert("Error initializing map: " + error.message + "\nPlease refresh the page.");
    }

    // Ensure critical variables are not undefined
    drawnItems = null;
    drawControl = null;
    map = null;
  }
}

function updateDrawControlColors() {
  // Update the draw control to show the next color that will be used
  if (!drawControl) return;

  const nextColor = shapeColors[currentShapeColorIndex];

  // Update polygon options
  if (
    drawControl._drawControl &&
    drawControl._drawControl.handler &&
    drawControl._drawControl.handler.toolbars &&
    drawControl._drawControl.handler.toolbars[0]
  ) {
    const polygon = drawControl._toolbars[0]._modes.polygon.handler;
    if (polygon) {
      polygon.options.shapeOptions.color = nextColor;
    }
  }

  // Update the color indicator button
  const colorBtn = document.getElementById("btnColorIndicator");
  if (colorBtn) {
    colorBtn.style.backgroundColor = nextColor;
  }
}

function showDrawnShapesInfo() {
  if (drawnShapesInfo.length === 0) {
    showToast(
      "No shapes drawn yet. Draw a polygon, rectangle, or circle!",
      "info",
    );
    return;
  }

  // Create panel showing all drawn shapes
  let infoPanel = document.getElementById("drawnShapesPanel");
  if (infoPanel) {
    infoPanel.remove();
  }

  infoPanel = document.createElement("div");
  infoPanel.id = "drawnShapesPanel";
  infoPanel.style.cssText = `
    position: fixed;
    top: 100px;
    right: 10px;
    width: 300px;
    max-height: 400px;
    background: white;
    border: 2px solid #667eea;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 900;
    font-family: Arial, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.3s ease-out;
  `;

  let html = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; font-weight: bold; border-bottom: 2px solid #764ba2;">
      📊 Drawn Shapes (${drawnShapesInfo.length})
      <button onclick="document.getElementById('drawnShapesPanel').remove()" style="float: right; background: white; color: #667eea; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold;">✕</button>
    </div>
    <div style="overflow-y: auto; flex: 1; padding: 10px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead style="position: sticky; top: 0; background: #764ba2; color: white; z-index: 10;">
          <tr>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Type</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Color</th>
          </tr>
        </thead>
        <tbody>
  `;

  drawnShapesInfo.forEach((info, index) => {
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; color: #667eea; font-weight: bold;">#${index + 1}</td>
        <td style="padding: 8px;">${info.type}</td>
        <td style="padding: 8px;">
          <div style="width: 20px; height: 20px; background-color: ${info.color}; border: 1px solid #666; border-radius: 4px;"></div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div style="background: #f0f0f0; padding: 10px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #666;">
      Next shape will use: <div style="display: inline-block; width: 16px; height: 16px; background-color: ${shapeColors[currentShapeColorIndex]}; border: 1px solid #667eea; border-radius: 4px; vertical-align: middle;"></div>
    </div>
  `;

  infoPanel.innerHTML = html;
  document.body.appendChild(infoPanel);
}

function filterPointsByDrawing(layer) {
  console.log("🎯 filterPointsByDrawing called");
  console.log("Layer type:", layer.constructor.name);
  console.log("Total markers on map:", markers.length);
  console.log("Turf available:", !!window.turf);

  if (!window.turf) {
    console.error("❌ Turf.js not loaded!");
    showToast("Turf.js library not loaded. Cannot select markers.", "error");
    return;
  }

  if (!markers || markers.length === 0) {
    console.warn("⚠️ No markers to filter!");
    showToast(
      "No markers on the map to select. Please add some locations first.",
      "warning",
    );
    return;
  }

  try {
    selectedMarkers = []; // Reset selected markers
    lastSelectionLayer = layer;
    let count = 0;

    // Handle different shape types
    let isInsideFunction = null;

    if (layer instanceof L.Circle) {
      // Circle selection logic
      const center = layer.getLatLng();
      const radius = layer.getRadius(); // in meters
      console.log("Circle detected - radius:", radius, "meters");
      isInsideFunction = (marker) => {
        const markerPoint = turf.point([
          marker.getLatLng().lng,
          marker.getLatLng().lat,
        ]);
        const centerPoint = turf.point([center.lng, center.lat]);
        const distance = turf.distance(centerPoint, markerPoint, {
          units: "meters",
        });
        return distance <= radius;
      };
    } else if (
      layer instanceof L.Polygon ||
      layer instanceof L.Rectangle ||
      layer instanceof L.Polyline
    ) {
      // Polygon/Rectangle/Polyline selection logic
      console.log("Polygon/Rectangle detected");
      try {
        const geojson = layer.toGeoJSON();
        console.log("Shape GeoJSON:", geojson);

        // For any polygon-like shape, use point-in-polygon
        isInsideFunction = (marker) => {
          const markerPoint = turf.point([
            marker.getLatLng().lng,
            marker.getLatLng().lat,
          ]);
          try {
            return turf.booleanPointInPolygon(markerPoint, geojson);
          } catch (err) {
            console.error("Error in booleanPointInPolygon:", err);
            return false;
          }
        };
      } catch (err) {
        console.error("Error converting shape to GeoJSON:", err);
        showToast(
          "Error processing the drawn shape. Please try again.",
          "error",
        );
        return;
      }
    } else {
      console.error("Unknown shape type:", layer);
      showToast(
        "Unknown shape type. Please use Polygon, Rectangle, or Circle.",
        "error",
      );
      return;
    }

    // Apply the selection logic to all markers
    markers.forEach((marker) => {
      try {
        const isInside = isInsideFunction(marker);

        if (isInside) {
          // Apply a visual highlight
          if (marker._icon) {
            marker._icon.style.filter =
              "hue-rotate(120deg) drop-shadow(0 0 8px #00ff00) brightness(1.2)";
            marker._icon.style.zIndex = "100";
          }
          marker.isSelected = true;
          selectedMarkers.push(marker);
          count++;
        } else {
          marker.isSelected = false;
          if (marker._icon) {
            marker._icon.style.filter = "grayscale(80%) opacity(0.4)";
          }
        }
      } catch (err) {
        console.error("Error processing marker:", marker, err);
      }
    });

    console.log("✅ Selected markers count:", count);
    console.log("Selected markers:", selectedMarkers);

    // Show the selected data panel
    displaySelectedMarkersPanel(selectedMarkers, layer);

    // Show confirmation toast (non-blocking)
    if (count > 0) {
      showToast(
        `✓ Selected ${count} location(s) within the boundary!`,
        "success",
      );
    } else {
      showToast("No locations found within the selected boundary.", "info");
    }
  } catch (err) {
    console.error("❌ Fatal error in filterPointsByDrawing:", err);
    showToast(
      "An error occurred during selection. Check console for details.",
      "error",
    );
  }
}

function showToast(message, type = "info") {
  // Create toast notification instead of blocking alert
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: 400px;
    padding: 16px 20px;
    background: ${type === "success"
      ? "#4caf50"
      : type === "error"
        ? "#f44336"
        : type === "warning"
          ? "#ff9800"
          : "#2196f3"
    };
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideInLeft 0.3s ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = "slideOutLeft 0.3s ease-out forwards";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

function displaySelectedMarkersPanel(selectedMarkersArray, layer) {
  const count = selectedMarkersArray.length;

  // Create or get the selection panel container
  let panelContainer = document.getElementById("selectedMarkersPanel");
  if (!panelContainer) {
    panelContainer = document.createElement("div");
    panelContainer.id = "selectedMarkersPanel";
    panelContainer.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: auto;
            min-width: 300px;
            max-width: 40vw;
            background: white;
            border: 3px solid rgb(93 162 75);
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(118, 75, 162, 0.3);
            z-index: 1000;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            animation: slideIn 0.3s ease-out;
            overflow: hidden;
            min-height: 100px;
            transition: box-shadow 0.3s ease;
        `;
    document.body.appendChild(panelContainer);

    // Add animation style
    if (!document.getElementById("panelAnimation")) {
      const style = document.createElement("style");
      style.id = "panelAnimation";
      style.innerHTML = `
                @keyframes slideIn {
                    from {
                        transform: translateX(120px) scale(0.92);
                        opacity: 0;
                    }
                    60% {
                        transform: translateX(-8px) scale(1.02);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(0) scale(1);
                        opacity: 1;
                    }
                }
            `;
      document.head.appendChild(style);
    }
  }

  // Build header with count and action buttons
  // Add Resize Handles (Top, Left, Top-Left Corner)
  const resizeHandleTop = document.createElement("div");
  resizeHandleTop.style.cssText = "position:absolute; top:0; left:0; width:100%; height:5px; cursor:ns-resize; z-index:1001;";
  const resizeHandleLeft = document.createElement("div");
  resizeHandleLeft.style.cssText = "position:absolute; top:0; left:0; width:5px; height:100%; cursor:ew-resize; z-index:1001;";
  const resizeHandleTopLeft = document.createElement("div");
  resizeHandleTopLeft.style.cssText = "position:absolute; top:0; left:0; width:10px; height:10px; cursor:nwse-resize; z-index:1002;";

  panelContainer.appendChild(resizeHandleTop);
  panelContainer.appendChild(resizeHandleLeft);
  panelContainer.appendChild(resizeHandleTopLeft);

  let isResizing = false;
  let currentHandle = null;

  const startResize = (e, handle) => {
    isResizing = true;
    currentHandle = handle;
    document.body.style.userSelect = "none";
    document.body.style.cursor = handle.style.cursor;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelContainer.offsetWidth;
    const startHeight = panelContainer.offsetHeight;

    const onMouseMove = (moveEvent) => {
      if (!isResizing) return;

      if (currentHandle === resizeHandleLeft || currentHandle === resizeHandleTopLeft) {
        const newWidth = startWidth + (startX - moveEvent.clientX);
        if (newWidth > 300) panelContainer.style.width = newWidth + "px";
      }
      if (currentHandle === resizeHandleTop || currentHandle === resizeHandleTopLeft) {
        const newHeight = startHeight + (startY - moveEvent.clientY);
        if (newHeight > 100) {
          panelContainer.style.height = newHeight + "px";
          // Also update the body max-height if maximized
          const body = document.getElementById("selectionPanelBody");
          if (body && body.style.display !== "none") {
            body.style.maxHeight = (newHeight - 70) + "px";
          }
        }
      }
    };

    const onMouseUp = () => {
      isResizing = false;
      document.body.style.userSelect = "auto";
      document.body.style.cursor = "default";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  resizeHandleTop.addEventListener("mousedown", (e) => startResize(e, resizeHandleTop));
  resizeHandleLeft.addEventListener("mousedown", (e) => startResize(e, resizeHandleLeft));
  resizeHandleTopLeft.addEventListener("mousedown", (e) => startResize(e, resizeHandleTopLeft));

  const headerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #57c236ff 100%); color: white; padding: 14px 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #512da8;">
            <div>
                <div style="font-size: 16px;">✓ Selected Locations</div>
                <div style="font-size: 24px; font-weight: 900; margin-top: 2px;">${count}</div>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                <button title="Copy coordinates" onclick="copySelectedCoordinates()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">📋 Copy</button>
                <button title="Export as CSV" onclick="exportSelectedAsCSV()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">📊 CSV</button>
                <button title="Export as GeoJSON" onclick="exportToGeoJSON()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">🌍 GeoJSON</button>
                <button title="Export as JSON" onclick="exportToJSON()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">📄 JSON</button>
                <button title="Export as KML" onclick="exportToKML()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">📍 KML</button>
                <button title="Minimize/Maximize" id="btnMinimizeSelection" onclick="toggleMinimizeSelection()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: all 0.2s;">−</button>
                <button title="Close panel" onclick="closeSelectedPanel()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: all 0.2s;">✕</button>
            </div>
        </div>
        <div id="selectionPanelBody" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; max-height: 60vh;">
    `;

  // Collect all unique keys from rowData
  let allKeys = new Set();
  selectedMarkersArray.forEach((marker) => {
    if (marker.markerData && marker.markerData.rowData) {
      Object.keys(marker.markerData.rowData).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (!["latitude", "longitude", "lat", "lng"].includes(lowerKey)) {
          allKeys.add(key);
        }
      });
    }
  });
  const additionalColumns = Array.from(allKeys);

  // Build table with selected markers data
  let tableHTML = '<div style="overflow: auto; flex: 1; padding: 8px;">';

  if (selectedMarkersArray.length === 0) {
    tableHTML +=
      '<p style="text-align: center; color: #999; padding: 20px;">No markers selected</p>';
  } else {
    tableHTML +=
      '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
    tableHTML +=
      '<thead style="position: sticky; top: 0; background: #764ba2; color: white; border-bottom: 2px solid #512da8; z-index: 1;">';
    tableHTML += "<tr>";
    tableHTML +=
      '<th style="padding: 8px; text-align: left; border: 1px solid #512da8; font-weight: 700; background: #764ba2; color: white; position: sticky; left: 0; z-index: 2;">#</th>';
    tableHTML +=
      '<th style="padding: 8px; text-align: left; border: 1px solid #512da8; font-weight: 700; background: #764ba2; color: white;">Latitude</th>';
    tableHTML +=
      '<th style="padding: 8px; text-align: left; border: 1px solid #512da8; font-weight: 700; background: #764ba2; color: white;">Longitude</th>';

    additionalColumns.forEach((col) => {
      tableHTML += `<th style="padding: 8px; text-align: left; border: 1px solid #512da8; font-weight: 700; background: #764ba2; color: white;">${col}</th>`;
    });

    tableHTML += "</tr>";
    tableHTML += "</thead>";
    tableHTML += "<tbody>";

    selectedMarkersArray.forEach((marker, index) => {
      const latlng = marker.getLatLng();

      tableHTML += `
                <tr style="border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s, transform 0.15s; background: white;" onmouseover="this.style.background='#f3e8ff'; this.style.borderLeft='3px solid #764ba2';" onmouseout="this.style.background='white'; this.style.borderLeft='';" onclick="zoomToMarker(${latlng.lat}, ${latlng.lng})">
                    <td style="padding: 7px; border: 1px solid #eee; font-weight: 600; color: #764ba2; position: sticky; left: 0; background: inherit;">${index + 1}</td>
                    <td style="padding: 7px; border: 1px solid #eee;">${latlng.lat.toFixed(6)}</td>
                    <td style="padding: 7px; border: 1px solid #eee;">${latlng.lng.toFixed(6)}</td>
      `;

      additionalColumns.forEach((col) => {
        let val = "";
        if (marker.markerData && marker.markerData.rowData && marker.markerData.rowData[col] !== undefined && marker.markerData.rowData[col] !== null) {
          val = marker.markerData.rowData[col];
        }
        let safeVal = String(val).replace(/"/g, '&quot;');
        tableHTML += `<td style="padding: 7px; border: 1px solid #eee; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${safeVal}">${safeVal}</td>`;
      });

      tableHTML += `</tr>`;
    });

    tableHTML += "</tbody>";
    tableHTML += "</table>";
  }

  tableHTML += "</div>";

  // Add footer with summary
  const footerHTML = `
    <div style="background: #f0f0f0; padding: 10px 16px; border-top: 1px solid #ddd; font-size: 11px; color: #666;">
        <div style="display: flex; justify-content: space-between;">
            <span><strong>Total Selected:</strong> ${count}</span>
            <span><strong>Action:</strong> Click row to zoom to location</span>
        </div>
    </div>
  `;

  panelContainer.innerHTML = headerHTML + tableHTML + footerHTML + '</div>';
}

function toggleMinimizeSelection() {
  const body = document.getElementById("selectionPanelBody");
  const btn = document.getElementById("btnMinimizeSelection");
  const panel = document.getElementById("selectedMarkersPanel");

  if (body.style.display === "none") {
    body.style.display = "flex";
    btn.textContent = "−";
    btn.title = "Minimize";
    panel.style.boxShadow = "0 8px 24px rgba(118, 75, 162, 0.3)";
  } else {
    body.style.display = "none";
    btn.textContent = "▢";
    btn.title = "Maximize";
    panel.style.boxShadow = "0 4px 12px rgba(118, 75, 162, 0.2)";
  }
}

function closeSelectedPanel() {
  const panel = document.getElementById("selectedMarkersPanel");
  if (panel) {
    panel.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => {
      if (panel) panel.remove();
    }, 300);
  }

  // Reset marker styles
  resetMarkerSelection();
}

function resetMarkerSelection() {
  selectedMarkers.forEach((marker) => {
    marker.isSelected = false;
    if (marker._icon) {
      marker._icon.style.filter = "";
      marker._icon.style.zIndex = "";
    }
  });
  selectedMarkers = [];
  lastSelectionLayer = null;
}

function copySelectedCoordinates() {
  if (selectedMarkers.length === 0) {
    alert("No markers selected");
    return;
  }

  let coordinateText = "Latitude,Longitude\n";
  selectedMarkers.forEach((marker) => {
    const latlng = marker.getLatLng();
    coordinateText += `${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}\n`;
  });

  navigator.clipboard
    .writeText(coordinateText)
    .then(() => {
      alert(`Copied ${selectedMarkers.length} coordinates to clipboard!`);
    })
    .catch((err) => {
      alert("Failed to copy: " + err);
    });
}

function exportSelectedAsCSV() {
  if (selectedMarkers.length === 0) {
    alert("No markers selected");
    return;
  }

  // Determine all unique keys from markerData
  let allKeys = new Set();
  selectedMarkers.forEach((marker) => {
    if (marker.markerData && marker.markerData.rowData) {
      Object.keys(marker.markerData.rowData).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (!["latitude", "longitude", "lat", "lng"].includes(lowerKey)) {
          allKeys.add(key);
        }
      });
    }
  });

  const keysArray = ["Latitude", "Longitude", ...Array.from(allKeys)];

  // Header row
  let csvContent = keysArray.map(k => '"' + String(k).replace(/"/g, '""') + '"').join(",") + "\n";

  // Data rows
  selectedMarkers.forEach((marker) => {
    const latlng = marker.getLatLng();
    let row = [];

    keysArray.forEach((key) => {
      if (key === "Latitude") {
        row.push(latlng.lat.toFixed(6));
      } else if (key === "Longitude") {
        row.push(latlng.lng.toFixed(6));
      } else {
        let val = "";
        if (marker.markerData && marker.markerData.rowData && marker.markerData.rowData[key] !== undefined && marker.markerData.rowData[key] !== null) {
          val = marker.markerData.rowData[key];
        }
        row.push('"' + String(val).replace(/"/g, '""') + '"');
      }
    });

    csvContent += row.join(",") + "\n";
  });

  // Export using Blob API
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `export_csv_${new Date().getTime()}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  alert(`Downloaded ${selectedMarkers.length} locations as CSV!`);
}

function zoomToMarker(lat, lng) {
  if (!map) return;

  // Smooth fly to location
  map.flyTo([lat, lng], 16, {
    duration: 1.2,
    easeLinearity: 0.2,
  });

  // Find the matching marker and animate it
  const targetMarker = markers.find((m) => {
    const ll = m.getLatLng();
    return Math.abs(ll.lat - lat) < 0.000001 && Math.abs(ll.lng - lng) < 0.000001;
  }) || selectedMarkers.find((m) => {
    const ll = m.getLatLng();
    return Math.abs(ll.lat - lat) < 0.000001 && Math.abs(ll.lng - lng) < 0.000001;
  });

  if (targetMarker && targetMarker._icon) {
    const icon = targetMarker._icon;
    // Remove any existing animation
    icon.classList.remove("marker-active", "marker-bounce");
    void icon.offsetWidth; // Force reflow
    // Apply bounce + pulse
    icon.classList.add("marker-bounce");
    icon.style.zIndex = "2000";
    // Remove after animation + pulse period
    setTimeout(() => {
      icon.classList.remove("marker-bounce");
      icon.classList.add("marker-active");
      setTimeout(() => {
        icon.classList.remove("marker-active");
        icon.style.zIndex = "";
      }, 2000);
    }, 800);
  }

  // Draw a temporary ripple circle at the clicked location
  const ripple = L.circle([lat, lng], {
    radius: 50,
    color: "#667eea",
    weight: 2,
    opacity: 1,
    fillColor: "#764ba2",
    fillOpacity: 0.15,
    className: "ripple-circle",
  }).addTo(map);
  setTimeout(() => {
    if (map.hasLayer(ripple)) map.removeLayer(ripple);
  }, 2500);
}

function clearDrawings() {
  // Ensure map is initialized
  if (!map) {
    console.warn("⚠️ Map not initialized on clearDrawings");
    return;
  }

  if (drawnItems) {
    drawnItems.clearLayers();
  }
  if (measurementLayers) {
    measurementLayers.clearLayers();
  }
  if (bufferLayer) {
    bufferLayer.clearLayers();
  }
  if (convexHullLayer) {
    convexHullLayer.clearLayers();
  }

  // Close selected markers panel and reset selection
  const panel = document.getElementById("selectedMarkersPanel");
  if (panel) panel.remove();
  resetMarkerSelection();

  // Reset drawn shapes tracking
  drawnShapesInfo = [];
  currentShapeColorIndex = 0;
  updateDrawControlColors();

  // Reset marker styles
  markers.forEach((marker) => {
    if (marker._icon) marker._icon.style.filter = "";
    marker.unbindTooltip();
  });

  // Reset tool active state
  activeMeasurementMode = null;
  isConvexHullActive = false;
  isLabelsActive = false;
  map.off("click", onMeasurementClick);
  map.off("mousemove", onMeasurementMove);

  updateGISToolUI();

  // Show confirmation toast
  showToast("✓ All tools and shapes cleared!", "success");
}

/**
 * Updates the background color of GIS buttons based on active state
 */
function updateGISToolUI() {
  const btnDist = document.getElementById("btnMeasureDist");
  const btnArea = document.getElementById("btnMeasureArea");
  const btnBuffer = document.getElementById("btnBuffer");
  const btnHull = document.getElementById("btnConvexHull");
  const btnLabels = document.getElementById("btnToggleLabels");

  const activeColor = "#e3f2fd"; // Light blue active background
  const defaultColor = "white";

  if (btnDist)
    btnDist.style.backgroundColor =
      activeMeasurementMode === "distance" ? activeColor : defaultColor;
  if (btnArea)
    btnArea.style.backgroundColor =
      activeMeasurementMode === "area" ? activeColor : defaultColor;
  if (btnHull)
    btnHull.style.backgroundColor = isConvexHullActive
      ? activeColor
      : defaultColor;
  if (btnLabels)
    btnLabels.style.backgroundColor = isLabelsActive
      ? activeColor
      : defaultColor;
}

function toggleConvexHull() {
  // Ensure map is initialized
  if (!map) {
    console.warn("⚠️ Map not initialized on toggleConvexHull, initializing now");
    initMap();
  }

  if (!convexHullLayer) {
    console.warn("⚠️ convexHullLayer not initialized, creating now");
    convexHullLayer = new L.FeatureGroup();
    map.addLayer(convexHullLayer);
  }

  if (!window.turf) return;

  if (isConvexHullActive) {
    if (convexHullLayer) convexHullLayer.clearLayers();
    isConvexHullActive = false;
    updateGISToolUI();
    return;
  }

  if (markers.length < 3) {
    alert("Need at least 3 points to generate a convex hull.");
    return;
  }

  const points = markers.map((m) => [m.getLatLng().lng, m.getLatLng().lat]);
  const featureCollection = turf.featureCollection(
    points.map((p) => turf.point(p)),
  );
  const hull = turf.convex(featureCollection);

  if (hull) {
    if (convexHullLayer) {
      convexHullLayer.clearLayers();
      L.geoJSON(hull, {
        style: {
          color: "#9b59b6",
          weight: 3,
          opacity: 0.8,
          fillColor: "#9b59b6",
          fillOpacity: 0.1,
        },
      }).addTo(convexHullLayer);
    }
    isConvexHullActive = true;
    updateGISToolUI();
  } else {
    alert(
      "Could not generate boundary. Ensure points are not in a straight line.",
    );
  }
}

function toggleLabels() {
  // Ensure map is initialized
  if (!map) {
    console.warn("⚠️ Map not initialized on toggleLabels, initializing now");
    initMap();
  }

  if (isLabelsActive) {
    markers.forEach((m) => m.unbindTooltip());
    isLabelsActive = false;
    updateGISToolUI();
    return;
  }

  if (markers.length === 0) {
    alert("No markers to label.");
    return;
  }

  // Attempt to find a good column for labels
  let labelKey = "POI NAME";
  if (markers[0].markerData) {
    const keys = Object.keys(markers[0].markerData);
    // Look for common label keys
    const candidates = keys.filter(
      (k) =>
        k.toUpperCase().includes("NAME") ||
        k.toUpperCase().includes("ID") ||
        k.toUpperCase().includes("TITLE") ||
        k.toUpperCase().includes("SITE"),
    );
    if (candidates.length > 0) labelKey = candidates[0];
    else labelKey = keys[0];
  }

  markers.forEach((m) => {
    let labelText = m.markerData ? m.markerData[labelKey] : "Point";
    m.bindTooltip(String(labelText), {
      permanent: true,
      direction: "top",
      className: "marker-label",
    });
  });

  isLabelsActive = true;
  updateGISToolUI();
}

function applyBuffer() {
  // Ensure map is initialized
  if (!map) {
    console.warn("⚠️ Map not initialized on applyBuffer, initializing now");
    initMap();
  }

  if (!bufferLayer) {
    console.warn("⚠️ bufferLayer not initialized, creating now");
    bufferLayer = new L.FeatureGroup();
    map.addLayer(bufferLayer);
  }

  const radiusInput = document.getElementById("bufferRadius");
  if (!radiusInput) return;

  const radius = parseFloat(radiusInput.value);
  if (isNaN(radius) || radius <= 0) {
    alert("Please enter a valid positive radius in meters.");
    return;
  }

  if (!window.turf) {
    alert("Turf.min.js not loaded. Cannot perform buffer analysis.");
    return;
  }

  if (markers.length === 0) {
    alert("No markers on map to buffer.");
    return;
  }

  if (bufferLayer) {
    bufferLayer.clearLayers();
  }

  let count = 0;

  // Buffer from map center
  const mapCenter = map.getCenter();
  const centerPt = turf.point([mapCenter.lng, mapCenter.lat]);
  const buffered = turf.buffer(centerPt, radius, { units: "meters" });

  const layer = L.geoJSON(buffered, {
    style: {
      color: "#ff7800",
      weight: 2,
      opacity: 0.65,
      fillColor: "#ff7800",
      fillOpacity: 0.2,
    },
  });

  bufferLayer.addLayer(layer);

  markers.forEach((marker) => {
    let pt = turf.point([marker.getLatLng().lng, marker.getLatLng().lat]);
    let isInside = turf.booleanPointInPolygon(pt, buffered);

    if (isInside) {
      if (marker._icon)
        marker._icon.style.filter =
          "hue-rotate(120deg) drop-shadow(0 0 8px green)";
      count++;
    } else {
      if (marker._icon)
        marker._icon.style.filter = "grayscale(100%) opacity(0.5)";
    }
  });

  // Briefly highlight the buffer button to show it was used
  const btnBuffer = document.getElementById("btnBuffer");
  if (btnBuffer) {
    btnBuffer.style.backgroundColor = "#e1f5fe";
    setTimeout(() => {
      if (btnBuffer) btnBuffer.style.backgroundColor = "white";
    }, 1000);
  }

  alert(`Found ${count} points within ${radius} meters of map center.`);
}

function toggleMeasurement(mode) {
  // Ensure map is initialized
  if (!map) {
    console.warn("⚠️ Map not initialized on toggleMeasurement, initializing now");
    initMap();
  }

  if (!measurementLayers) {
    console.warn("⚠️ measurementLayers not initialized, creating now");
    measurementLayers = new L.FeatureGroup();
    map.addLayer(measurementLayers);
  }

  if (activeMeasurementMode === mode) {
    // Disable
    activeMeasurementMode = null;
    tempMeasurementPoints = [];
    if (measurementLayers) measurementLayers.clearLayers();
    map.off("click", onMeasurementClick);
    map.off("mousemove", onMeasurementMove);
    updateGISToolUI();
    alert(`Measurement tool (${mode}) disabled.`);
    return;
  }

  // Enable
  activeMeasurementMode = mode;
  tempMeasurementPoints = [];
  if (measurementLayers) measurementLayers.clearLayers();

  map.on("click", onMeasurementClick);
  map.on("mousemove", onMeasurementMove);

  updateGISToolUI();
  alert(`Measurement tool (${mode}) enabled. Click on map to start.`);
}

function onMeasurementClick(e) {
  if (!activeMeasurementMode) return;

  tempMeasurementPoints.push([e.latlng.lng, e.latlng.lat]);

  if (measurementLayers) {
    measurementLayers.clearLayers();

    if (tempMeasurementPoints.length > 1) {
      if (activeMeasurementMode === "distance") {
        const line = turf.lineString(tempMeasurementPoints);
        const length = turf.length(line, { units: "kilometers" });

        L.geoJSON(line, { style: { color: "#f39c12", weight: 4 } }).addTo(
          measurementLayers,
        );

        // Show result on last point
        L.marker([e.latlng.lat, e.latlng.lng], {
          icon: L.divIcon({
            className: "measurement-label",
            html: `<div style="background: white; padding: 2px 5px; border: 1px solid orange; border-radius: 4px; white-space: nowrap;">${length.toFixed(2)} km</div>`,
            iconSize: [100, 20],
          }),
        }).addTo(measurementLayers);
      } else if (
        activeMeasurementMode === "area" &&
        tempMeasurementPoints.length >= 3
      ) {
        // Ensure closed for area
        const closedPoints = [
          ...tempMeasurementPoints,
          tempMeasurementPoints[0],
        ];
        const polygon = turf.polygon([closedPoints]);
        const area = turf.area(polygon); // sq meters
        const areaKm = area / 1000000;

        L.geoJSON(polygon, {
          style: { color: "#27ae60", weight: 2, fillOpacity: 0.3 },
        }).addTo(measurementLayers);

        L.marker([e.latlng.lat, e.latlng.lng], {
          icon: L.divIcon({
            className: "measurement-label",
            html: `<div style="background: white; padding: 2px 5px; border: 1px solid green; border-radius: 4px; white-space: nowrap;">${areaKm.toFixed(2)} km²</div>`,
            iconSize: [100, 20],
          }),
        }).addTo(measurementLayers);
      }
    }

    // Add point markers
    tempMeasurementPoints.forEach((pt) => {
      L.circleMarker([pt[1], pt[0]], {
        radius: 4,
        color: "blue",
        fillOpacity: 1,
      }).addTo(measurementLayers);
    });
  }
}

function onMeasurementMove(e) {
  // Optional: draw rubber-band line
}

function loadMapLayer(layerType) {
  if (tileLayer) {
    map.removeLayer(tileLayer);
  }

  // Advanced GIS cleanup
  if (markerClusterGroup) {
    map.removeLayer(markerClusterGroup);
    markerClusterGroup = null;
  }
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (drawnItems) {
    map.removeLayer(drawnItems);
    drawnItems = null;
  }
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  let tileUrl, attribution;
  switch (layerType) {
    case "openstreetmap":
      tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      attribution = "© OpenStreetMap contributors";
      break;
    case "satellite":
      tileUrl =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attribution = "Tiles &copy; Esri";
      break;
    case "terrain":
      tileUrl = "https://tile.opentopomap.org/{z}/{x}/{y}.png";
      attribution =
        "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap";
      break;
    case "dark":
      tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
      attribution =
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
      break;
    case "google":
      tileUrl = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      attribution = "© Google Maps";
      break;
    case "esri":
      tileUrl =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
      attribution = "Tiles &copy; Esri";
      break;
    default:
      tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      attribution = "© OpenStreetMap contributors";
  }
  tileLayer = L.tileLayer(tileUrl, {
    attribution: attribution,
    maxZoom: 19,
  }).addTo(map);
  currentMapLayer = layerType;
  document.querySelectorAll("[data-layer]").forEach((btn) => {
    btn.classList.remove("active");
    btn.style.border = "1px solid #ddd";
  });
  const activeBtn = document.querySelector(`[data-layer="${layerType}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    activeBtn.style.borderColor = "#667eea";
    activeBtn.style.borderWidth = "2px";
  }
}

function changeMapLayer(layerType) {
  if (!map) {
    alert("Please initialize the map first");
    return;
  }
  loadMapLayer(layerType);
}

function addMarker(lat, lng, popup) {
  const marker = L.marker([lat, lng]);
  if (popup) marker.bindPopup(popup).openPopup();

  if (isClusteringEnabled && markerClusterGroup) {
    markerClusterGroup.addLayer(marker);
  } else {
    marker.addTo(map);
  }

  markers.push(marker);
  updateMapStats();
}

function updateMapStats() {
  const statsDashboard = document.getElementById("mapStatsDashboard");
  if (!statsDashboard) return;

  const locElem = document.getElementById("statTotalLocations");
  const shapeElem = document.getElementById("statTotalShapes");
  const polyElem = document.getElementById("countPolygon");
  const rectElem = document.getElementById("countRectangle");
  const circElem = document.getElementById("countCircle");
  const zoomInput = document.getElementById("statZoomLevelInput");

  // Animation helper
  const animateUpdate = (elem, val) => {
    const currentVal = elem.tagName === 'INPUT' ? elem.value : elem.innerText;
    if (currentVal != val) {
      if (elem.tagName === 'INPUT') {
        elem.value = val;
      } else {
        elem.innerText = val;
      }
      elem.classList.remove("stat-updated");
      void elem.offsetWidth; // Trigger reflow
      elem.classList.add("stat-updated");
    }
  };

  // Update logic
  if (locElem) animateUpdate(locElem, markers.length);

  if (drawnItems) {
    const layers = drawnItems.getLayers();
    animateUpdate(shapeElem, layers.length);

    // Breakdown counts
    let polyCount = 0, rectCount = 0, circCount = 0;
    layers.forEach(layer => {
      if (layer instanceof L.Rectangle) rectCount++;
      else if (layer instanceof L.Polygon) polyCount++;
      else if (layer instanceof L.Circle) circCount++;
    });

    if (polyElem) animateUpdate(polyElem, polyCount);
    if (rectElem) animateUpdate(rectElem, rectCount);
    if (circElem) animateUpdate(circElem, circCount);
  }

  if (zoomInput && map) animateUpdate(zoomInput, map.getZoom());
}

function clearMapMarkers() {
  if (isClusteringEnabled && markerClusterGroup) {
    markerClusterGroup.clearLayers();
  } else {
    markers.forEach((m) => map.removeLayer(m));
  }
  markers = [];
  updateMapStats();
}

function addMarkerFromInput(input) {
  let lat, lng;
  const trimmed = String(input).trim();
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    if (parts.length === 2) {
      let coord1 = null,
        coord2 = null;
      if (isDMS(parts[0])) {
        coord1 = parseDMS(parts[0]);
      } else {
        coord1 = parseFloat(parts[0]);
        if (isNaN(coord1)) coord1 = null;
      }
      if (isDMS(parts[1])) {
        coord2 = parseDMS(parts[1]);
      } else {
        coord2 = parseFloat(parts[1]);
        if (isNaN(coord2)) coord2 = null;
      }
      if (coord1 !== null && coord2 !== null) {
        if (Math.abs(coord1) <= 90 && Math.abs(coord2) > 90) {
          lat = coord1;
          lng = coord2;
        } else if (Math.abs(coord2) <= 90 && Math.abs(coord1) > 90) {
          lat = coord2;
          lng = coord1;
        } else {
          lat = coord1;
          lng = coord2;
        }
      } else if (coord1 !== null) {
        lat = coord1;
        lng = 0;
      } else if (coord2 !== null) {
        lat = 0;
        lng = coord2;
      }
    }
  } else {
    if (isDMS(trimmed)) {
      const dd = parseDMS(trimmed);
      if (dd !== null) {
        lat = dd;
        lng = 0;
      }
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        if (Math.abs(num) <= 90) {
          lat = num;
          lng = 0;
        } else {
          lng = num;
          lat = 0;
        }
      }
    }
  }
  if (
    lat !== undefined &&
    lng !== undefined &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    const icon = createMarkerIcon(currentMarkerStyle, markers.length + 1);
    const marker = L.marker([lat, lng], { icon: icon });

    if (isClusteringEnabled && markerClusterGroup) {
      markerClusterGroup.addLayer(marker);
    } else {
      marker.addTo(map);
    }
    marker.markerData = {
      lat: lat,
      lng: lng,
      rowData: { Input: input },
      rowIndex: markers.length + 1,
    };

    markers.push(marker);

    // New: Link to premium popup
    const popupHTML = createPremiumPopupHTML(
      lat,
      lng,
      { Input: input },
      markers.length,
    );
    marker.bindPopup(popupHTML, { maxWidth: 350 });

    marker.on("popupopen", () => highlightMarker(marker));
    marker.on("popupclose", () => unhighlightMarkers());
  }
}

function addDetailedMarker(lat, lng, rowData, rowIndex) {
  const icon = createMarkerIcon(currentMarkerStyle, rowIndex);
  const marker = L.marker([lat, lng], { icon: icon });

  if (isClusteringEnabled && markerClusterGroup) {
    markerClusterGroup.addLayer(marker);
  } else {
    marker.addTo(map);
  }

  marker.markerData = {
    lat: lat,
    lng: lng,
    rowData: rowData,
    rowIndex: rowIndex,
  };

  // Bind premium popup
  const popupHTML = createPremiumPopupHTML(lat, lng, rowData, rowIndex);
  marker.bindPopup(popupHTML, { maxWidth: 350, className: 'premium-popup' });

  marker.on("popupopen", () => highlightMarker(marker));
  marker.on("popupclose", () => unhighlightMarkers());

  markers.push(marker);
  updateMapStats();
}

function createPremiumPopupHTML(lat, lng, rowData, rowIndex) {
  let html = `
        <div class="popup-premium-header">
            <h4>📍 #${rowIndex} Location Details</h4>
        </div>
        <div class="popup-premium-content">
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.7em; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 5px; letter-spacing: 0.5px;">GPS COORDINATES</div>
                <div style="background: rgba(102, 126, 234, 0.05); padding: 10px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.1); font-family: monospace;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span style="font-weight: 700; color: var(--primary);">LAT:</span> 
                        <span style="color: #1e293b;">${parseFloat(lat).toFixed(6)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 700; color: var(--primary);">LNG:</span> 
                        <span style="color: #1e293b;">${parseFloat(lng).toFixed(6)}</span>
                    </div>
                </div>
            </div>
            
            <div style="font-size: 0.7em; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 5px; letter-spacing: 0.5px;">DATA ATTRIBUTES</div>
            <div class="popup-scroll-container">
                <table class="popup-table">
                    <tbody>
    `;

  let hasData = false;
  for (const [key, value] of Object.entries(rowData)) {
    const lowerKey = key.toLowerCase();
    // Skip internal/redundant keys
    if (["latitude", "longitude", "lat", "lng", "rowIndex", "rowData"].includes(lowerKey)) continue;

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      html += `<tr><td>${key}</td><td>${value}</td></tr>`;
      hasData = true;
    }
  }

  if (!hasData) {
    html += `<tr><td colspan="2" style="text-align: center; color: #94a3b8; font-style: italic; padding: 15px;">No additional data available</td></tr>`;
  }

  html += `
                    </tbody>
                </table>
            </div>
            
            <div class="popup-actions">
                <button onclick="navigator.clipboard.writeText('${lat}, ${lng}').then(() => showToast('Coordinates Copied!', 'success'))" 
                    class="popup-btn popup-btn-copy">
                    <span>📋</span> Copy
                </button>
                <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" 
                   class="popup-btn popup-btn-maps">
                    <span>🗺️</span> Maps
                </a>
            </div>
        </div>
    `;
  return html;
}

function highlightMarker(marker) {
  unhighlightMarkers();
  if (marker._icon) marker._icon.classList.add("marker-active");
}

function unhighlightMarkers() {
  markers.forEach((m) => {
    if (m._icon) m._icon.classList.remove("marker-active");
  });
}




function searchLocation() {
  const query = document.getElementById("mapSearch").value.trim();
  if (!query) return;
  const coordPattern = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
  const match = query.match(coordPattern);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (
      !isNaN(lat) &&
      !isNaN(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      if (!map) initMap();
      const icon = createMarkerIcon(currentMarkerStyle, markers.length + 1);
      const marker = L.marker([lat, lng], { icon: icon });

      if (isClusteringEnabled && markerClusterGroup) {
        markerClusterGroup.addLayer(marker);
      } else {
        marker.addTo(map);
      }
      marker.markerData = {
        lat: lat,
        lng: lng,
        rowData: { Search: query },
        rowIndex: markers.length + 1,
      };

      const popupHTML = createPremiumPopupHTML(
        lat,
        lng,
        { Search: query },
        markers.length + 1,
      );
      marker.bindPopup(popupHTML, { maxWidth: 350 });

      marker.on("popupopen", () => highlightMarker(marker));
      marker.on("popupclose", () => unhighlightMarkers());

      markers.push(marker);

      // Show details immediately on search
      marker.openPopup();

      map.setView([lat, lng], 13);
      return;
    }
  }
  addMarkerFromInput(query);
}

function exportToKML() {
  const exportMarkers = selectedMarkers.length > 0 ? selectedMarkers : markers;
  if (exportMarkers.length === 0) {
    alert("No markers to export");
    return;
  }
  let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  kml += "<Document>\n";
  kml += "<name>Exported Coordinates</name>\n";
  kml +=
    "<description>Coordinates exported from Advanced Coordinate Converter</description>\n";
  kml += '<Style id="default">\n';
  kml += "<IconStyle>\n";
  kml += "<Icon>\n";
  kml += "<href>http://maps.google.com/mapfiles/ms/icons/red-dot.png</href>\n";
  kml += "</Icon>\n";
  kml += "</IconStyle>\n";
  kml += "</Style>\n";
  exportMarkers.forEach((marker, index) => {
    const latlng = marker.getLatLng();
    const markerData = marker.markerData || {};
    const rowData = markerData.rowData || {};
    kml += "<Placemark>\n";
    kml += `<name>Point ${index + 1}</name>\n`;
    let description = "<![CDATA[\n";
    description += `<h3>Point ${index + 1}</h3>\n`;
    description += `<p><strong>Coordinates:</strong><br/>Latitude: ${parseFloat(latlng.lat).toFixed(6)}<br/>Longitude: ${parseFloat(latlng.lng).toFixed(6)}</p>\n`;
    if (Object.keys(rowData).length > 0) {
      description += "<p><strong>Additional Data:</strong></p>\n";
      description +=
        '<table border="1" style="border-collapse: collapse; width: 100%;">\n';
      for (const [key, value] of Object.entries(rowData)) {
        if (value !== null && value !== undefined && value !== "") {
          description += `<tr><td style="padding: 5px;"><strong>${key}</strong></td><td style="padding: 5px;">${value}</td></tr>\n`;
        }
      }
      description += "</table>\n";
    }
    description += "]]>\n";
    kml += `<description>${description}</description>\n`;
    kml += "<Point>\n";
    kml += `<coordinates>${parseFloat(latlng.lng).toFixed(6)},${parseFloat(latlng.lat).toFixed(6)},0</coordinates>\n`;
    kml += "</Point>\n";
    kml += "</Placemark>\n";
  });
  kml += "</Document>\n";
  kml += "</kml>";
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export_kml.kml";
  a.click();
  window.URL.revokeObjectURL(url);
}

// ==== ADVANCED GIS CAPABILITIES ====

function toggleClustering() {
  isClusteringEnabled = !isClusteringEnabled;
  const btn = document.getElementById("btnToggleCluster");

  if (isClusteringEnabled) {
    btn.textContent = "Disable Clustering";
    btn.classList.replace("btn-secondary", "btn-success");
    btn.classList.add("active");

    // Remove individual markers
    markers.forEach((marker) => map.removeLayer(marker));

    // Add to cluster group
    if (!markerClusterGroup) {
      markerClusterGroup = L.markerClusterGroup({ chunkedLoading: true });
    }
    markerClusterGroup.clearLayers();
    markerClusterGroup.addLayers(markers);
    map.addLayer(markerClusterGroup);
  } else {
    btn.textContent = "Enable Clustering";
    btn.classList.replace("btn-success", "btn-secondary");
    btn.classList.remove("active");

    // Remove cluster group
    if (markerClusterGroup) {
      map.removeLayer(markerClusterGroup);
    }

    // Add individual markers back
    markers.forEach((marker) => marker.addTo(map));
  }
}

function toggleHeatmap() {
  isHeatmapEnabled = !isHeatmapEnabled;
  const btn = document.getElementById("btnToggleHeatmap");

  if (isHeatmapEnabled) {
    btn.textContent = "Hide Heatmap";
    btn.classList.replace("btn-secondary", "btn-success");

    if (markers.length === 0) {
      alert("Need points to generate heatmap.");
      isHeatmapEnabled = false;
      btn.textContent = "Show Heatmap";
      btn.classList.replace("btn-success", "btn-secondary");
      return;
    }

    const heatData = markers.map((m) => [
      m.getLatLng().lat,
      m.getLatLng().lng,
      1,
    ]); // default intensity 1

    // Hide standard markers if clustering is off
    if (!isClusteringEnabled) {
      markers.forEach((marker) => map.removeLayer(marker));
    } else if (markerClusterGroup) {
      map.removeLayer(markerClusterGroup);
    }

    heatLayer = L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
    }).addTo(map);
  } else {
    btn.textContent = "Show Heatmap";
    btn.classList.replace("btn-success", "btn-secondary");

    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    // Restore standard markers
    if (isClusteringEnabled && markerClusterGroup) {
      map.addLayer(markerClusterGroup);
    } else {
      markers.forEach((marker) => marker.addTo(map));
    }
  }
}

function connectPoints() {
  if (markers.length < 2) {
    alert("Need at least 2 points to draw a route.");
    return;
  }

  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
    document.getElementById("btnConnectPoints").textContent =
      "Connect Points (Route)";
    return;
  }

  const latlngs = markers.map((m) => m.getLatLng());

  routePolyline = L.polyline(latlngs, {
    color: "#ff3300",
    weight: 4,
    opacity: 0.8,
    dashArray: "10, 10",
  }).addTo(map);

  document.getElementById("btnConnectPoints").textContent = "Remove Route View";

  if (window.turf) {
    const line = turf.lineString(latlngs.map((ll) => [ll.lng, ll.lat]));
    const length = turf.length(line, { units: "meters" });
    const km = (length / 1000).toFixed(2);
    alert(`Total Route Distance: ${km} km (${length.toFixed(0)} meters)`);
  }
}

function exportToGeoJSON() {
  const exportMarkers = selectedMarkers.length > 0 ? selectedMarkers : markers;
  if (exportMarkers.length === 0) {
    alert("No markers to export.");
    return;
  }

  let features = exportMarkers.map((m) => {
    let props = {};
    if (m.markerData && m.markerData.rowData) props = m.markerData.rowData;

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [m.getLatLng().lng, m.getLatLng().lat],
      },
      properties: props,
    };
  });

  let geojson = {
    type: "FeatureCollection",
    features: features,
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: "application/geo+json",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export_geojson.geojson";
  a.click();
  window.URL.revokeObjectURL(url);
}

function exportToJSON() {
  const exportMarkers = selectedMarkers.length > 0 ? selectedMarkers : markers;
  if (exportMarkers.length === 0) {
    alert("No markers to export.");
    return;
  }

  // Collect all unique field names from all markers
  let fieldSet = new Set();
  exportMarkers.forEach((m) => {
    if (m.markerData && m.markerData.rowData) {
      Object.keys(m.markerData.rowData).forEach((k) => fieldSet.add(k));
    }
  });

  // Define ArcMap compatible fields
  let fields = [
    { name: "OBJECTID", type: "esriFieldTypeOID", alias: "OBJECTID" },
    { name: "LATITUDE", type: "esriFieldTypeDouble", alias: "LATITUDE" },
    { name: "LONGITUDE", type: "esriFieldTypeDouble", alias: "LONGITUDE" },
  ];

  fieldSet.forEach((f) => {
    // Skip lat/lng as we added them explicitly
    const upperF = f.toUpperCase();
    if (
      upperF === "LATITUDE" ||
      upperF === "LONGITUDE" ||
      upperF === "LAT" ||
      upperF === "LNG"
    )
      return;

    fields.push({
      name: f.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 31), // Esri field name limits
      type: "esriFieldTypeString",
      alias: f,
    });
  });

  let features = exportMarkers.map((m, index) => {
    let lat = m.getLatLng().lat;
    let lng = m.getLatLng().lng;

    let attributes = {
      OBJECTID: index + 1,
      LATITUDE: lat,
      LONGITUDE: lng,
    };

    if (m.markerData && m.markerData.rowData) {
      for (let [key, value] of Object.entries(m.markerData.rowData)) {
        const upperKey = key.toUpperCase();
        if (
          upperKey === "LATITUDE" ||
          upperKey === "LONGITUDE" ||
          upperKey === "LAT" ||
          upperKey === "LNG"
        )
          continue;

        let cleanKey = key.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 31);
        attributes[cleanKey] = value;
      }
    }

    return {
      attributes: attributes,
      geometry: {
        x: lng,
        y: lat,
      },
    };
  });

  // Final Esri JSON structure
  let esriJson = {
    displayFieldName: "",
    fieldAliases: fields.reduce((acc, f) => {
      acc[f.name] = f.alias;
      return acc;
    }, {}),
    geometryType: "esriGeometryPoint",
    spatialReference: { wkid: 4326, latestWkid: 4326 },
    fields: fields,
    features: features,
  };

  const blob = new Blob([JSON.stringify(esriJson, null, 2)], {
    type: "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export_json.json";
  a.click();
  window.URL.revokeObjectURL(url);
}

async function exportMapToPDF() {
  if (!map) return;
  try {
    const btn = document.querySelector('button[onclick="exportMapToPDF()"]');
    const originalText = btn.textContent;
    btn.textContent = "🚀 Generating Report...";
    btn.disabled = true;

    let resolutionScale = 3;
    const resSettings = document.getElementById("pdfResolution");
    if (resSettings) {
      resolutionScale = parseInt(resSettings.value) || 3;
    }

    const mapContainer = document.getElementById("mapContainer");
    const canvas = await html2canvas(mapContainer, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#f8fafc",
      scale: resolutionScale,
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // --- 1. Professional Header ---
    // Header Background
    pdf.setFillColor(102, 126, 234); // Primary Blue
    pdf.rect(0, 0, pageWidth, 35, "F");

    // Header Accent Line
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.5);
    pdf.line(margin, 28, pageWidth - margin, 28);

    // Logo/Title Text
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("Advanced Coordinate Converter", margin, 18);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Professional GIS Mapping Report", margin, 25);

    // --- 2. Metadata Section ---
    pdf.setTextColor(45, 55, 72); // Dark slate
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");

    const metaY = 45;
    pdf.text("REPORT METADATA", margin, metaY - 5);

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.1);
    pdf.line(margin, metaY - 3, pageWidth - margin, metaY - 3);

    const col1 = margin;
    const col2 = margin + contentWidth / 2;

    pdf.setFont("helvetica", "normal");
    // Row 1
    pdf.setFont("helvetica", "bold");
    pdf.text("Date Exported:", col1, metaY + 5);
    pdf.setFont("helvetica", "normal");
    pdf.text(new Date().toLocaleString(), col1 + 25, metaY + 5);

    pdf.setFont("helvetica", "bold");
    pdf.text("Total Points Mapped:", col2, metaY + 5);
    pdf.setFont("helvetica", "normal");
    pdf.text(markers.length.toString(), col2 + 35, metaY + 5);

    // --- 3. The Map Imagery ---
    const imgProps = pdf.getImageProperties(imgData);
    const mapDisplayWidth = contentWidth;
    const mapDisplayHeight =
      (imgProps.height * mapDisplayWidth) / imgProps.width;

    // Ensure map doesn't overflow page
    const availableHeight = pageHeight - metaY - 30; // space for footer
    let finalMapHeight = mapDisplayHeight;
    let finalMapWidth = mapDisplayWidth;

    if (finalMapHeight > availableHeight) {
      finalMapHeight = availableHeight;
      finalMapWidth = (imgProps.width * finalMapHeight) / imgProps.height;
    }

    // Center map horizontal
    const mapX = margin + (contentWidth - finalMapWidth) / 2;
    const mapY = metaY + 12;

    // Border for map
    pdf.setDrawColor(160, 174, 192);
    pdf.setLineWidth(0.3);
    pdf.rect(mapX - 0.5, mapY - 0.5, finalMapWidth + 1, finalMapHeight + 1);

    pdf.addImage(imgData, "PNG", mapX, mapY, finalMapWidth, finalMapHeight);

    // --- 4. Branded Footer ---
    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, pageHeight - 15, pageWidth, 15, "F");

    pdf.setDrawColor(226, 232, 240);
    pdf.line(0, pageHeight - 15, pageWidth, pageHeight - 15);

    pdf.setTextColor(113, 128, 150);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    const footerText = "Advanced Coordinate Conversion Tool © 2026";
    const textWidth =
      (pdf.getStringUnitWidth(footerText) * pdf.getFontSize()) /
      pdf.internal.scaleFactor;
    pdf.text(footerText, (pageWidth - textWidth) / 2, pageHeight - 7);

    pdf.save(`GIS-Report-${new Date().getTime()}.pdf`);

    btn.textContent = originalText;
    btn.disabled = false;
  } catch (e) {
    console.error("PDF Export Error:", e);
    alert("Error generating PDF: " + e.message);
    const btn = document.querySelector('button[onclick="exportMapToPDF()"]');
    if (btn) {
      btn.textContent = "Export Map as PDF";
      btn.disabled = false;
    }
  }
}
// ===================================

function createMarkerIcon(style, index) {
  const size = currentMarkerSize || 35;
  const fontSize = Math.max(10, Math.floor(size * 0.4));
  const border = Math.max(1, Math.floor(size * 0.08));
  let iconHtml = "";

  switch (style) {
    case "numbered":
      iconHtml = `<div style="
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: ${fontSize}px;
      border: ${border}px solid white;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
      cursor: pointer;
      transition: transform 0.2s;
      ">${index}</div>`;
      break;
    case "pin":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">📍</div>`;
      break;
    case "location":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">📌</div>`;
      break;
    case "star":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">⭐</div>`;
      break;
    case "flag":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">🚩</div>`;
      break;
    case "target":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">🎯</div>`;
      break;
    case "home":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">🏠</div>`;
      break;
    case "building":
      iconHtml = `<div style="
                        font-size: ${size}px;
                        text-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                        line-height: ${size}px;
                    ">🏢</div>`;
      break;
    default:
      iconHtml = `<div style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        width: ${size}px;
                        height: ${size}px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: ${fontSize}px;
                        border: ${border}px solid white;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: transform 0.2s;
                    ">${index}</div>`;
  }
  return L.divIcon({
    className: "custom-marker",
    html: iconHtml,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function changeMarkerSize(size) {
  currentMarkerSize = parseInt(size);

  // Sync numerical input if necessary (e.g. from preset)
  const sizeInput = document.getElementById("markerSize");
  if (sizeInput && sizeInput.value != size) sizeInput.value = size;

  if (markers.length > 0) {
    markers.forEach((marker) => {
      if (marker.markerData) {
        const newIcon = createMarkerIcon(
          currentMarkerStyle,
          marker.markerData.rowIndex,
        );
        marker.setIcon(newIcon);
      }
    });
  }
}

function changeMarkerStyle(style) {
  currentMarkerStyle = style;
  document.querySelectorAll(".marker-style-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-style="${style}"]`).classList.add("active");
  if (markers.length > 0) {
    markers.forEach((marker) => {
      if (marker.markerData) {
        const newIcon = createMarkerIcon(style, marker.markerData.rowIndex);
        marker.setIcon(newIcon);
      }
    });
  }
}

// Comprehensive diagnostics function
function diagnosisMapInit() {
  console.clear();
  console.log("=== MAP INITIALIZATION DIAGNOSIS ===\n");

  console.log("📋 DOM Elements:");
  console.log("   mapContainer:", document.getElementById("mapContainer") ? "✅ Found" : "❌ NOT FOUND");

  console.log("\n📚 Libraries:");
  console.log("   Leaflet (L):", typeof L !== "undefined" ? "✅ Loaded" : "❌ NOT LOADED");
  console.log("   Leaflet.Draw:", typeof L !== "undefined" && L.Draw ? "✅ Loaded" : "❌ NOT LOADED");
  console.log("   Turf.js:", typeof turf !== "undefined" ? "✅ Loaded" : "❌ NOT LOADED");

  console.log("\n🗺️ Map Objects:");
  console.log("   map:", map ? "✅ Initialized" : "❌ NULL/UNDEFINED");
  if (map) {
    console.log("     - Center:", map.getCenter());
    console.log("     - Zoom:", map.getZoom());
    console.log("     - Bounds:", map.getBounds());
  }

  console.log("\n📍 Layer Groups:");
  console.log("   drawnItems:", drawnItems ? `✅ Created (${drawnItems.getLayers().length} shapes)` : "❌ NULL");
  console.log("   measurementLayers:", measurementLayers ? `✅ Created` : "❌ NULL");
  console.log("   bufferLayer:", bufferLayer ? `✅ Created` : "❌ NULL");
  console.log("   convexHullLayer:", convexHullLayer ? `✅ Created` : "❌ NULL");
  console.log("   markerClusterGroup:", markerClusterGroup ? `✅ Created` : "❌ NULL");

  console.log("\n🎨 Draw Control:");
  console.log("   drawControl:", drawControl ? "✅ Created" : "❌ NULL");

  console.log("\n📊 Data State:");
  console.log("   markers:", `${markers.length} markers loaded`);
  console.log("   drawnShapesInfo:", `${drawnShapesInfo.length} shapes tracked`);
  console.log("   currentShapeColorIndex:", currentShapeColorIndex);

  console.log("\n🔧 Tool States:");
  console.log("   isClusteringEnabled:", isClusteringEnabled);
  console.log("   isHeatmapEnabled:", isHeatmapEnabled);
  console.log("   activeMeasurementMode:", activeMeasurementMode);
  console.log("   isConvexHullActive:", isConvexHullActive);
  console.log("   isLabelsActive:", isLabelsActive);

  console.log("\n=== END DIAGNOSIS ===\n");
  console.log("If you see ❌ errors, the map may not initialize properly.");
  console.log("Click the map tab to initialize, then try your operation again.");
}

// Expose core map functions
window.initMap = initMap;
window.diagnosisMapInit = diagnosisMapInit;
window.loadMapLayer = loadMapLayer;
window.changeMapLayer = changeMapLayer;
window.addMarker = addMarker;
window.addMarkerFromInput = addMarkerFromInput;
window.clearMapMarkers = clearMapMarkers;
window.searchLocation = searchLocation;
window.exportToKML = exportToKML;
window.changeMarkerStyle = changeMarkerStyle;
window.createMarkerIcon = createMarkerIcon;
window.addDetailedMarker = addDetailedMarker;

// Expose advanced GIS functions
window.toggleClustering = toggleClustering;
window.toggleHeatmap = toggleHeatmap;
window.connectPoints = connectPoints;
window.exportToGeoJSON = exportToGeoJSON;
window.exportToJSON = exportToJSON;
window.exportMapToPDF = exportMapToPDF;
window.clearDrawings = clearDrawings;
window.finishDrawing = finishDrawing;
window.toggleMeasurement = toggleMeasurement;
window.applyBuffer = applyBuffer;
window.toggleConvexHull = toggleConvexHull;
window.toggleLabels = toggleLabels;
window.changeMarkerSize = changeMarkerSize;
window.unhighlightMarkers = unhighlightMarkers;
window.copySelectedCoordinates = copySelectedCoordinates;
window.exportSelectedAsCSV = exportSelectedAsCSV;
window.closeSelectedPanel = closeSelectedPanel;
window.zoomToMarker = zoomToMarker;
window.displaySelectedMarkersPanel = displaySelectedMarkersPanel;
window.resetMarkerSelection = resetMarkerSelection;
window.showToast = showToast;
window.updateDrawControlColors = updateDrawControlColors;
window.showDrawnShapesInfo = showDrawnShapesInfo;
window.toggleMinimizeSelection = toggleMinimizeSelection;

// Add styles for marker labels
const style = document.createElement("style");
style.innerHTML = `
    .marker-label {
        background: white;
        border: 1px solid #764ba2;
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: 600;
        font-size: 12px;
        color: #333;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        pointer-events: none;
        white-space: nowrap;
    }
    .popup-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin-top: 10px;
        font-size: 13px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #e2e8f0;
    }
    .popup-table th {
        background: #f7fafc;
        color: #4a5568;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 8px 12px;
        text-align: left;
        border-bottom: 2px solid #edf2f7;
    }
    .popup-table td {
        padding: 8px 12px;
        border-bottom: 1px solid #edf2f7;
        color: #2d3748;
    }
    .popup-table tr:last-child td {
        border-bottom: none;
    }
    .popup-table tr:hover {
        background-color: #f1f5f9;
    }
    /* Premium Leaflet Popup Overrides */
    .leaflet-popup-content-wrapper {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .leaflet-popup-content {
        margin: 0;
        width: 320px !important;
    }
    .leaflet-popup-tip {
        background: rgba(255, 255, 255, 0.95);
    }
    .popup-premium-header {
        padding: 12px 15px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .popup-premium-header h4 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
    }
    .popup-premium-content {
        padding: 15px;
        max-height: 250px;
        overflow-y: auto;
    }
    .popup-premium-content::-webkit-scrollbar {
        width: 6px;
    }
    .popup-premium-content::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 10px;
    }
    .popup-premium-content::-webkit-scrollbar-thumb {
        background: #cbd5e0;
        border-radius: 10px;
    }
    .popup-premium-content::-webkit-scrollbar-thumb:hover {
        background: #a0aec0;
    }


    /* Active Marker Highlight - Fixed to avoid transform conflict */
    @keyframes markerBounce {
        0%   { transform: translateY(0)   scale(1); }
        20%  { transform: translateY(-18px) scale(1.15); }
        40%  { transform: translateY(0)   scale(1); }
        55%  { transform: translateY(-10px) scale(1.08); }
        70%  { transform: translateY(0)   scale(1); }
        85%  { transform: translateY(-5px) scale(1.03); }
        100% { transform: translateY(0)   scale(1); }
    }
    .marker-bounce {
        animation: markerBounce 0.8s ease-out;
        z-index: 2000 !important;
        filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.6)) !important;
    }
    @keyframes markerPulse {
        0% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); outline: 2px solid rgba(102, 126, 234, 0.5); outline-offset: 0px; }
        70% { box-shadow: 0 0 0 15px rgba(102, 126, 234, 0); outline: 2px solid rgba(102, 126, 234, 0); outline-offset: 8px; }
        100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0); outline: 2px solid rgba(102, 126, 234, 0); outline-offset: 0px; }
    }
    .marker-active {
        animation: markerPulse 1.5s infinite;
        z-index: 1000 !important;
        border-radius: 50% !important;
        filter: brightness(1.2) !important;
        visibility: visible !important;
        display: flex !important;
        opacity: 1 !important;
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(500px);
            opacity: 0;
        }
    }
    
    @keyframes slideInLeft {
        from {
            transform: translateX(-500px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutLeft {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(-500px);
            opacity: 0;
        }
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(350px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
  `;
document.head.appendChild(style);
