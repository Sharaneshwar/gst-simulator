let cached = null;
let loading = null;
export async function networkHeaders() {
  if (import.meta.env.VITE_NETWORK_ACCESS !== "1") return {};
  if (!cached || cached.until <= Date.now()) {
    if (!loading)
      loading = (async () => {
        const response = await fetch("/api/network?action=session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json();
        if (!response.ok || !data.allowed || !data.grant)
          throw Error(
            data.message ||
              "Network access is required. Reload to request browser approval.",
          );
        cached = { grant: data.grant, until: Date.now() + 45000 };
      })().finally(() => {
        loading = null;
      });
    await loading;
  }
  return { "x-gst-network-grant": cached.grant };
}
