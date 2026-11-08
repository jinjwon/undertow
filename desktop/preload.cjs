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
  files: (root, query) => ipcRenderer.invoke('fs:files', root, query),
  search: (root, query) => ipcRenderer.invoke('fs:search', root, query),
  write: (file, text) => ipcRenderer.invoke('fs:write', file, text),
  branch: root => ipcRenderer.invoke('git:branch', root),
  status: root => ipcRenderer.invoke('git:status', root),
  head: (root, file) => ipcRenderer.invoke('git:head', root, file),
  usage: () => ipcRenderer.invoke('usage:get'),
  sessions: root => ipcRenderer.invoke('sessions:list', root),
  skills: () => ipcRenderer.invoke('skills:list'),
  equip: root => ipcRenderer.invoke('equip:list', root),
  pty: {
    spawn: (id, cwd, cols, rows, kind, resume) => ipcRenderer.invoke('pty:spawn', id, cwd, cols, rows, kind, resume),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: id => ipcRenderer.send('pty:kill', id),
    onData: (id, fn) => listen(`pty:data:${id}`, fn),
    onExit: (id, fn) => listen(`pty:exit:${id}`, fn),
  },
})
