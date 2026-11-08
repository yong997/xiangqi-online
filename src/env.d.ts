/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOESAY_APPKEY?: string
  readonly VITE_GOESAY_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
