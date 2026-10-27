declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TAXII_API_ROOT?: string;
    TAXII_TOKEN?: string;
    TAXII_USERNAME?: string;
    TAXII_PASSWORD?: string;
    SOCRADAR_PREMIUM_FEEDS_API_KEY?: string;
    SOCRADAR_COMPANY_ID?: string;
    SOCRADAR_API_ROOT?: string;
    ABUSECH_AUTH_KEY?: string;
    MISP_API_ROOT?: string;
    MISP_API_KEY?: string;
    INITIAL_ADMIN_TOKEN?: string;
  }
}
