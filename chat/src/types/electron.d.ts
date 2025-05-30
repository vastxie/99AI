// Electron类型声明
interface IpcRenderer {
  on(channel: string, listener: (event: any, ...args: any[]) => void): this
  send(channel: string, ...args: any[]): void
  removeAllListeners(channel: string): this
}

interface ElectronAPI {
  ipcRenderer: IpcRenderer
}

declare global {
  interface Window {
    electron: ElectronAPI
    process: {
      type: string
    }
  }
}
