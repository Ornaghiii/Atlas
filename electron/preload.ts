import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('atlasAPI', {
  platform: process.platform,
  version: process.env.npm_package_version ?? 'unknown',
})
