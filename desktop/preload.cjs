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
  image: file => ipcRenderer.invoke('fs:image', file),
  files: (root, query) => ipcRenderer.invoke('fs:files', root, query),
  search: (root, query) => ipcRenderer.invoke('fs:search', root, query),
  write: (file, text) => ipcRenderer.invoke('fs:write', file, text),
  branch: root => ipcRenderer.invoke('git:branch', root),
  status: root => ipcRenderer.invoke('git:status', root),
  head: (root, file) => ipcRenderer.invoke('git:head', root, file),
  usage: root => ipcRenderer.invoke('usage:get', root),
  setTheme: theme => ipcRenderer.send('theme:set', theme),
  sessions: root => ipcRenderer.invoke('sessions:list', root),
  skills: () => ipcRenderer.invoke('skills:list'),
  equip: root => ipcRenderer.invoke('equip:list', root),
  previewUrl: file => ipcRenderer.invoke('preview:url', file),
  previewOpen: url => ipcRenderer.send('preview:open', url),
  sshHosts: () => ipcRenderer.invoke('ssh:hosts'),
  ide: {
    onCall: fn => listen('ide:call', fn),
    reply: (id, result, error) => ipcRenderer.send('ide:reply', id, result, error),
    notify: (method, params) => ipcRenderer.send('ide:notify', method, params),
    connected: () => ipcRenderer.invoke('ide:connected'),
  },
  chat: {
    send: (id, cwd, text, session) => ipcRenderer.invoke('chat:send', id, cwd, text, session),
    answer: (id, requestId, allow, input) => ipcRenderer.send('chat:answer', id, requestId, allow, input),
    stop: id => ipcRenderer.send('chat:stop', id),
    on: (id, fn) => listen(`chat:event:${id}`, fn),
  },
  pty: {
    spawn: (id, cwd, cols, rows, kind, resume) => ipcRenderer.invoke('pty:spawn', id, cwd, cols, rows, kind, resume),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: id => ipcRenderer.send('pty:kill', id),
    onData: (id, fn) => listen(`pty:data:${id}`, fn),
    onExit: (id, fn) => listen(`pty:exit:${id}`, fn),
  },
})
