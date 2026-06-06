// functions/_lib/http.js
// Tiny response helpers shared by the API handlers (KB module-02).

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const error = (message, status = 400, extra = {}) =>
  json({ error: message, ...extra }, status);
