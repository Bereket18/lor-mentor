import axios from "axios";

// Create one axios instance used everywhere in the app
// Instead of writing the full URL every time we just write:
// api.post('/auth/login', data)
const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1`,

  // This is critical — tells axios to send cookies
  // with every request (our JWT tokens live in cookies)
  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
  },
});

// -- Response interceptor -----------------------------------
// Queued refresh: concurrent 401s share ONE /auth/refresh call.
// Without this, N parallel 401s fire N refresh requests — the first
// rotates the jti and the rest fail (replayed jti is denied).
let isRefreshing = false;
type QueuedRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};
let failedQueue: QueuedRequest[] = [];

function processQueue(error: unknown) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(null);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status as number | undefined;
    const originalRequest = error?.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;

    const isRefreshRequest =
      typeof originalRequest?.url === "string" &&
      originalRequest.url.includes("/auth/refresh");

    // Only handle 401s for non-refresh requests that haven't been retried yet
    if (status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      // If a refresh is already in flight, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api.request(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const isAuthPage =
        typeof window !== "undefined" &&
        (window.location.pathname.startsWith("/login") ||
          window.location.pathname.startsWith("/register") ||
          window.location.pathname.startsWith("/admin-login") ||
          window.location.pathname.startsWith("/pricing"));

      if (isAuthPage) {
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        await api.post("/auth/refresh");
        processQueue(null);
        return api.request(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== "undefined") window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
