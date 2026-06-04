# Equal Backend

> Dating dApp for Pi Network | "Your affection has no price"

## Architecture

| Layer | Stack |
|-------|-------|
| Framework | NestJS 10 |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Auth | Pi Network SDK + JWT |
| Payments | Pi Platform API (A2U) |
| Real-time | Socket.IO WebSocket Gateway |
| API Docs | Swagger/OpenAPI |

## Pi Network Compliance

- Pi-Only Authentication via `Pi.authenticate()`
- Pi Payments with full server-side approve/complete flow
- No email/password login
- No external redirects
- CSP allows only `sdk.minepi.com` and `api.minepi.com`

## API Endpoints

```
POST   /v1/auth/pi                    - Pi login (verify token with Platform API)
GET    /v1/users/me                   - Current user profile
PATCH  /v1/users/me                   - Update user
GET    /v1/users/:id/public           - Public profile
DELETE /v1/users/me                   - Deactivate account
GET    /v1/profiles/me                - Get profile
PUT    /v1/profiles/me                - Update profile
POST   /v1/profiles/me/photos         - Add photo
GET    /v1/discover?gender=&city=     - Discovery feed
GET    /v1/matches                    - User matches
GET    /v1/matches/:id                - Match details
POST   /v1/payments                   - Create payment
POST   /v1/payments/:id/approve       - Approve payment
POST   /v1/payments/:id/complete      - Complete payment
GET    /v1/payments/history           - Payment history
GET    /v1/health                     - Health check
WS     /v1/gateway                    - Chat WebSocket
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/equal
JWT_SECRET=your-secret-key
PI_API_KEY=your-pi-platform-api-key
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://app.minepi.com
```

## Deployment (Render)

```bash
# Automatic via render.yaml
git push origin main  # Render auto-deploys
```

## Local Development

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```
