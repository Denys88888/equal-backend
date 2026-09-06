/** Browser origins allowed to reach the API — shared by the HTTP CORS config
 *  and the WebSocket gateway, which previously accepted '*'. */
export const allowedOrigins = [
  'https://equal-app.onrender.com',
  'https://denys88888.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function isOriginAllowed(origin: string | undefined): boolean {
  return !origin || allowedOrigins.includes(origin);
}
