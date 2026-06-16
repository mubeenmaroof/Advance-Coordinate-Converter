function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  
  // Sync the dashboard theme toggle button
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.innerHTML = isDark ? "☀️" : "🌙";
  }
  
  // Legacy fallback for .theme-toggle elements
  const legacyBtns = document.querySelectorAll(".theme-toggle");
  legacyBtns.forEach(legacyBtn => {
    legacyBtn.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  });
}

// Load saved theme on startup
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode");
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = "☀️";
  // Legacy fallback
  const legacyBtn = document.querySelector(".theme-toggle");
  if (legacyBtn) legacyBtn.textContent = "☀️ Light Mode";
}

window.toggleTheme = toggleTheme;