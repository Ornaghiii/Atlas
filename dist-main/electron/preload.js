"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('atlasAPI', {
    platform: process.platform,
    version: process.env.npm_package_version ?? 'unknown',
});
