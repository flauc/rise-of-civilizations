// Re-export legal link helpers from the in-app viewer module.
export {
  legalLinksHtml,
  legalLinkHtml,
  legalPath,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  DELETE_ACCOUNT_URL,
  type LegalPage,
} from "./legal-viewer";
export { SUPPORT_URL } from "./support-page";

/** @deprecated Use PRIVACY_POLICY_URL — kept for auth-form imports. */
export const PRIVACY_URL = "https://game.rise-of-civilizations.com/privacy";

/** @deprecated Use TERMS_OF_SERVICE_URL — kept for auth-form imports. */
export const TERMS_URL = "https://game.rise-of-civilizations.com/terms";
