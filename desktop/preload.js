// desktop/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  verArchivoReceta: (rutaRelativa) =>
    ipcRenderer.invoke("abrir-archivo-receta", rutaRelativa),
});
