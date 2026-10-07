const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;

    // When accessing via localhost or 127.0.0.1, connect to local backend on port 8000
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//127.0.0.1:8000/api`;
    }

    // When accessing via local network IP (e.g. mobile testing on 192.168.x.x, 172.x.x.x, 10.x.x.x),
    // automatically route to port 8000 on the same machine
    if (/^(192\.168\.|172\.(1[6-9]|2\d|3[01])\.|10\.)/.test(hostname)) {
      return `${protocol}//${hostname}:8000/api`;
    }
  }

  // Fallback to configured VITE_API_URL or current origin
  return (
    import.meta.env.VITE_API_URL ??
    (typeof window !== "undefined" ? `${window.location.origin}/api` : "/api")
  );
};

const BASE_URL = getBaseUrl();

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("clubapp_token") : null;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("clubapp_token");
      // Redirect to login if token is invalid
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const contentType = response.headers.get("content-type");
  let data;
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let errorMsg = response.statusText || "Something went wrong";
    if (data && typeof data === "object") {
      const errors = "errors" in data ? (data as { errors?: Record<string, string[]> }).errors : undefined;
      const firstFieldErrors = errors ? Object.values(errors)[0] : undefined;
      if (Array.isArray(firstFieldErrors) && typeof firstFieldErrors[0] === "string" && firstFieldErrors[0]) {
        errorMsg = firstFieldErrors[0];
      } else if ("message" in data && typeof (data as { message?: unknown }).message === "string") {
        errorMsg = (data as { message: string }).message;
      }
    }
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: "GET", ...options }),
  post: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "POST",
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      ...options,
    }),
  put: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "PUT",
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      ...options,
    }),
  patch: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      ...options,
    }),
  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: "DELETE", ...options }),
};
