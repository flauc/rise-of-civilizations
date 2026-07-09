// Split login / register panel — both sides visible, divided by a center border.

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export interface AuthSplitBindOptions {
  idPrefix: string;
  /** Initial username shown in both forms (optional). */
  defaultHandle?: string;
  /** Initial password for login form only (optional). */
  defaultLoginPassword?: string;
  showAdvanced?: boolean;
  advancedUrl?: string;
  onLogin: (handle: string, password: string) => Promise<string | void>;
  onRegister: (args: {
    handle: string;
    password: string;
    newsletter: boolean;
    email?: string;
  }) => Promise<string | void>;
  onAdvancedUrlChange?: (url: string) => void;
}

export function authSplitPanelHtml(opts: {
  idPrefix: string;
  defaultHandle?: string;
  defaultLoginPassword?: string;
  showAdvanced?: boolean;
  advancedUrl?: string;
}): string {
  const p = opts.idPrefix;
  const handle = esc(opts.defaultHandle ?? "");
  const pw = esc(opts.defaultLoginPassword ?? "");
  const advanced = opts.showAdvanced
    ? `<details class="mp-advanced auth-advanced">
         <summary>Advanced — server address</summary>
         <div class="mp-field" style="margin-top:10px">
           <input id="${p}-url" class="menu-in" value="${esc(opts.advancedUrl ?? "")}" placeholder="ws://host:port/ws" />
         </div>
       </details>`
    : "";

  return `
    <div class="auth-split-card mp-panel">
      <div class="auth-split">
        <section class="auth-pane" aria-labelledby="${p}-login-title">
          <h2 class="auth-pane-title" id="${p}-login-title">Log in</h2>
          <p class="auth-pane-hint">Welcome back, commander.</p>
          <div class="mp-field"><label for="${p}-login-handle">Username</label><input id="${p}-login-handle" class="menu-in" value="${handle}" placeholder="Your name" autocomplete="username" /></div>
          <div class="mp-field"><label for="${p}-login-pw">Password</label><input id="${p}-login-pw" class="menu-in" type="password" value="${pw}" placeholder="Password" autocomplete="current-password" /></div>
          <div class="auth-pane-actions"><button class="menu-btn primary" id="${p}-login-btn" type="button">Log in</button></div>
        </section>
        <div class="auth-split-divider" aria-hidden="true"></div>
        <section class="auth-pane" aria-labelledby="${p}-register-title">
          <h2 class="auth-pane-title" id="${p}-register-title">Register</h2>
          <p class="auth-pane-hint">Create an account to save progress and play online.</p>
          <div class="mp-field"><label for="${p}-reg-handle">Username</label><input id="${p}-reg-handle" class="menu-in" placeholder="Pick a name" autocomplete="username" /></div>
          <div class="mp-field"><label for="${p}-reg-pw">Password</label><input id="${p}-reg-pw" class="menu-in" type="password" placeholder="Password" autocomplete="new-password" /></div>
          <div class="mp-field"><label for="${p}-reg-pw2">Repeat password</label><input id="${p}-reg-pw2" class="menu-in" type="password" placeholder="Repeat password" autocomplete="new-password" /></div>
          <label class="auth-check"><input type="checkbox" id="${p}-newsletter" /><span>Send me newsletter and notifications</span></label>
          <div class="auth-email-wrap hidden" id="${p}-email-wrap">
            <div class="mp-field"><label for="${p}-email">Email</label><input id="${p}-email" class="menu-in" type="email" placeholder="you@example.com" autocomplete="email" /></div>
          </div>
          <div class="auth-pane-actions"><button class="menu-btn primary" id="${p}-register-btn" type="button">Sign up</button></div>
        </section>
      </div>
      ${advanced}
      <div id="${p}-status" class="menu-status auth-split-status"></div>
    </div>`;
}

export function bindAuthSplitPanel(root: ParentNode, opts: AuthSplitBindOptions): void {
  const p = opts.idPrefix;
  const statusEl = root.querySelector<HTMLElement>(`#${p}-status`);
  const setStatus = (t: string): void => {
    if (statusEl) statusEl.textContent = t;
  };

  const newsletterEl = root.querySelector<HTMLInputElement>(`#${p}-newsletter`);
  const emailWrap = root.querySelector<HTMLDivElement>(`#${p}-email-wrap`);
  newsletterEl?.addEventListener("change", () => {
    emailWrap?.classList.toggle("hidden", !newsletterEl.checked);
  });

  const urlEl = root.querySelector<HTMLInputElement>(`#${p}-url`);

  const doLogin = async (): Promise<void> => {
    const handle = root.querySelector<HTMLInputElement>(`#${p}-login-handle`)!.value.trim();
    const password = root.querySelector<HTMLInputElement>(`#${p}-login-pw`)!.value;
    if (!handle || !password) return setStatus("Enter a username and password to log in.");
    setStatus("Signing in…");
    const err = await opts.onLogin(handle, password);
    if (err) setStatus(err);
  };

  const doRegister = async (): Promise<void> => {
    const handle = root.querySelector<HTMLInputElement>(`#${p}-reg-handle`)!.value.trim();
    const password = root.querySelector<HTMLInputElement>(`#${p}-reg-pw`)!.value;
    const pw2 = root.querySelector<HTMLInputElement>(`#${p}-reg-pw2`)!.value;
    if (!handle || !password) return setStatus("Enter a username and password to register.");
    if (password !== pw2) return setStatus("Passwords don't match.");
    const newsletter = newsletterEl?.checked ?? false;
    const email = root.querySelector<HTMLInputElement>(`#${p}-email`)?.value.trim();
    if (newsletter && !email) return setStatus("Enter an email address for newsletter and notifications.");
    setStatus("Creating account…");
    const err = await opts.onRegister({ handle, password, newsletter, email });
    if (err) setStatus(err);
  };

  root.querySelector<HTMLButtonElement>(`#${p}-login-btn`)?.addEventListener("click", () => void doLogin());
  root.querySelector<HTMLButtonElement>(`#${p}-register-btn`)?.addEventListener("click", () => void doRegister());
  root.querySelector<HTMLInputElement>(`#${p}-login-pw`)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void doLogin();
  });
  root.querySelector<HTMLInputElement>(`#${p}-reg-pw2`)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void doRegister();
  });

  if (urlEl && opts.onAdvancedUrlChange) {
    urlEl.addEventListener("change", () => opts.onAdvancedUrlChange!(urlEl.value));
  }
}
