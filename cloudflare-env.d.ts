declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    META_PAGE_ID?: string;
    META_INSTAGRAM_ID?: string;
    META_PAGE_ACCESS_TOKEN?: string;
    META_API_VERSION?: string;
    META_APP_ID?: string;
    META_CREDENTIAL_ENCRYPTION_KEY?: string;
    APP_OWNER_EMAIL?: string;
    APP_OWNER_NAME?: string;
  }
}
