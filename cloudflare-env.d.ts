declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CONNECTORS?: import("./lib/connector-contract.mjs").ConnectorBinding;
    CREDIT_ENCRYPTION_KEY?: string;
    PORTAL_RUNTIME?: string;
    PORTAL_TRUST_SITES_DISPATCH?: string;
  }
}
