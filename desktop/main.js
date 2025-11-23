const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      // Por ahora manera sencilla, luego lo mejoramos si hace falta
      contextIsolation: false,
      nodeIntegration: false
    },
    title: "Hospital ADS - Escritorio"
  });

  // Cargar el HTML de la interfaz
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Opcional: ocultar barra de menú
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // En macOS se vuelve a crear ventana si no hay ninguna
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // En Windows/Linux se cierra la app cuando cierras todas las ventanas
  if (process.platform !== "darwin") {
    app.quit();
  }
});
