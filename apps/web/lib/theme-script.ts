// The product has no theme toggle: the theme follows the system. design/system/tokens.css keys dark
// mode on a `dark` class on <html>, so this script sets it from prefers-color-scheme and follows
// changes. It runs inline in <head>, before first paint, so a dark system never sees a light flash.
// It is the first inline script: a Content-Security-Policy needs a nonce or hash for it.
export const themeScript = `(() => {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
})();`;
