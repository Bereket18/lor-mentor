import axios from "axios";

// Create one axios instance used everywhere in the app
// Instead of writing the full URL every time we just write:
// api.post('/auth/login', data)
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + "/api/v1",

  // This is critical — tells axios to send cookies
  // with every request (our JWT tokens live in cookies)
  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ───────────────────────────────────
// This runs on every response before it reaches our code
// If the server returns 401 (not logged in) we redirect to login
api.interceptors.response.use(
  // Success — just return the response as normal
  (response) => response,

  // Error — handle specific status codes
  async (error) => {
    const status = error?.response?.status;

    // 401 means the access token expired
    // Try to refresh it silently
    if (status === 401) {
      // Only try to refresh if we are not already
      // on an auth page — prevents infinite loop
      const isAuthPage =
        window.location.pathname.startsWith("/login") ||
        window.location.pathname.startsWith("/register") ||
        window.location.pathname.startsWith("/admin-login") ||
        window.location.pathname.startsWith("/pricing");

      if (!isAuthPage) {
        try {
          // Try to get a new access token using the refresh token
          await api.post("/auth/refresh");

          // Retry the original failed request
          return api.request(error.config);
        } catch {
          // Refresh also failed — redirect to login
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;
