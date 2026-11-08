// The only doors from the window to the machine.
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel, fn) => {
  const handler = (_, ...args) => fn(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('evoke', {
  platform: process.platform,
  projectsRaw: () => ipcRenderer.invoke('projects:raw'),
  exists: paths => ipcRenderer.invoke('projects:exists', paths),
  pickProject: () => ipcRenderer.invoke('project:pick'),
  openProject: root => ipcRenderer.invoke('project:open', root),
  list: dir => ipcRenderer.invoke('fs:list', dir),
  read: file => ipcRenderer.invoke('fs:read', file),
  write: (file, text) => ipcRenderer.invoke('fs:write', file, text),
  branch: root => ipcRenderer.invoke('git:branch', root),
  usage: () => ipcRenderer.invoke('usage:get'),
  pty: {
    spawn: (id, cwd, cols, rows) => ipcRenderer.invoke('pty:spawn', id, cwd, cols, rows),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: id => ipcRenderer.send('pty:kill', id),
    onData: (id, fn) => listen(`pty:data:${id}`, fn),
    onExit: (id, fn) => listen(`pty:exit:${id}`, fn),
  },
})
