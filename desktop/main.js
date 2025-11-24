const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: "Hospital ADS - Escritorio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"), // <-- importantísimo
    },
  });

  // Carga la UI principal
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Opcional: ocultar barra de menú
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * IPC para abrir un archivo de receta en el visor por defecto del SO.
 * El frontend le manda la ruta relativa que viene de la BD
 * (por ejemplo: "uploads/recetas/receta_paciente_juan_2025-11-23.pdf")
 */
ipcMain.handle("abrir-archivo-receta", async (_event, rutaRelativa) => {
  try {
    if (!rutaRelativa) {
      console.error("[abrir-archivo-receta] rutaRelativa viene vacía o undefined");
      return;
    }

    // Asumiendo estructura:
    // Hospital-ADS/
    //   backend/
    //     uploads/recetas/...
    //   desktop/
    //     main.js
    const rutaAbsoluta = path.join(__dirname, "..", "backend", rutaRelativa);
    console.log("[abrir-archivo-receta] Abriendo:", rutaAbsoluta);

    const result = await shell.openPath(rutaAbsoluta);
    if (result) {
      // shell.openPath devuelve string con error si falla
      console.error("[abrir-archivo-receta] Error de shell.openPath:", result);
    }
  } catch (err) {
    console.error("[abrir-archivo-receta] Excepción al abrir archivo:", err);
  }
});
