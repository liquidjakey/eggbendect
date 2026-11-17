/// <reference types="vite/client" />

/** Backend API base path, injected by vite.config.ts (resolves the devenv
 *  proxy prefix for the backend's port at build/dev time). */
declare const __API_BASE_URL__: string
