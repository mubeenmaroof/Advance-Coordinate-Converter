function showTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(tabName).classList.add("active");
  // event may be undefined if called programmatically
  if (event && event.target) event.target.classList.add("active");
  if (tabName === "map") {
    // Initialize map immediately and synchronously
    if (!map) {
      console.log("📍 Initializing map for first time");
      initMap();
    } else {
      console.log("📍 Map already initialized, refreshing size");
    }
    
    // Always invalidate size after a delay to ensure proper rendering
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        console.log("✅ Map size validated");
      }
    }, 50);
  }
}

function updatePrecision(value) {
  currentPrecision = parseInt(value);
  document.getElementById("precisionValue").textContent = value;
}

window.showTab = showTab;
window.updatePrecision = updatePrecision;
