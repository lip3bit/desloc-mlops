/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base do backend (sem barra final). Vazio = caminhos relativos. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
