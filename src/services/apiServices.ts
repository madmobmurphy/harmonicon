// This service abstracts the communication with the Electron Main process.
// It uses IPC (Inter-Process Communication) when running in Electron,
// and falls back to standard fetch in development/web mode.

const isElectron = !!(window as any).electron;

export const apiService = {
  async getConfig() {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('get-config');
    }
    const res = await fetch('/api/config');
    return await res.json();
  },

  async setConfig(newPath: string) {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('set-config', newPath);
    }
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath }),
    });
    return await res.json();
  },

  async selectDirectory() {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('select-directory');
    }
    return null;
  },

  async scanLibrary() {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('scan-library');
    }
    return { success: false, error: 'Not in Electron' };
  },

  async deletePhysicalItem(relativePath: string, isFolder: boolean) {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('delete-physical-item', { relativePath, isFolder });
    }
    return { success: false, error: 'Not in Electron' };
  },

  async uploadFile(file: File, relativeFolder: string = '') {
    if (isElectron) {
      // Convert file to ArrayBuffer for IPC transfer
      const buffer = await file.arrayBuffer();
      return await (window as any).electron.ipcRenderer.invoke('upload-file', {
        name: file.name,
        data: buffer,
        relativeFolder
      });
    }

    const formData = new FormData();
    formData.append('audio', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  },

  async exportSettings(localStorageData: Record<string, string>, dbData: { folders: any[], files: any[] }) {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('export-settings', { localStorageData, dbData });
    }
    return { error: 'Export requires the native desktop app.' };
  },

  async importSettings() {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke('import-settings');
    }
    return { error: 'Import requires the native desktop app.' };
  }
};
