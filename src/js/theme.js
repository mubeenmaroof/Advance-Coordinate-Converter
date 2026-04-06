function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const btn = document.querySelector(".theme-toggle");
  if (document.body.classList.contains("dark-mode")) {
    btn.textContent = "☀️ Light Mode";
    localStorage.setItem("theme", "dark");
  } else {
    btn.textContent = "🌙 Dark Mode";
    localStorage.setItem("theme", "light");
  }
}

// load saved theme on startup
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode");
  const btn = document.querySelector(".theme-toggle");
  if (btn) btn.textContent = "☀️ Light Mode";
}

window.toggleTheme = toggleTheme;
