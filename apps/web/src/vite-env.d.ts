/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OIDC_ISSUER?: string;
  readonly OIDC_CLIENT_ID?: string;
  readonly OIDC_COGNITO_DOMAIN?: string;
  readonly OIDC_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
