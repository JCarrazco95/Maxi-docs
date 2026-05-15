# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills — Lee estos archivos antes de cada tarea
@.claude/skills/stack-especifico.md
@.claude/skills/dnd-kit-editor.md

## Project Overview

**MaxiDocs** is a document management and e-signature system built as a native Monday.com app for MAXIRent. Users generate contracts/proposals from HTML templates, send them for electronic signature, and track their lifecycle — comparable to PandaDoc, embedded inside Monday.com.

## Commands

### Backend (`maxi-docs-backend/`)
```bash
npm run dev       # Node --watch (hot reload)
npm start         # Production
npm run migrate   # Applies schema.sql to the database
```

### Frontend (`panda-monday/`)
```bash
npm run dev       # Vite dev server (port 8301)
npm run build     # Production build
npm run lint      # ESLint
```

The frontend proxies `/api/*` to the backend via Vite config — run both simultaneously during development.

### Database
```bash
cd maxi-docs-backend && npm run migrate
```
Schema is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Safe to re-run.

## Architecture

### Two separate apps

```
maxi-docs-backend/   Express 5 API — ES modules, port 3001
panda-monday/        React 19 + Vite frontend — port 8301
```

### Monday.com context flow

Every API request passes through `extractMondayContext` ([mondayAuth.js](maxi-docs-backend/src/middleware/mondayAuth.js)), which reads `x-monday-account-id`, `x-monday-user-id`, and `x-monday-is-admin` headers. The frontend injects these automatically via an Axios interceptor ([client.js](panda-monday/src/api/client.js)), populated from `monday.get('context')`. All DB queries are scoped by `monday_account_id` for multi-tenancy. Roles are `admin`, `editor`, `viewer` — enforced by `requireAdmin` / `requireEditor` middlewares.

### Document lifecycle

```
Template (HTML with {{variables}})
  → DocumentGeneratorModal fills variables → POST /api/documents/generate
  → pdfService.fillTemplate() replaces {{vars}}, processes <pricing-table> custom nodes
  → pdfService.generatePdf() renders via Puppeteer → Buffer
  → storageService.uploadPdf() → local /uploads (dev) or Cloudflare R2 (prod)
  → POST /api/signatures/send → creates signature rows, emails signers via emailService
  → Signer opens /sign/:signatureId (PortalPage) → draws/types/uploads signature
  → POST /api/signatures/:id/sign → selfSignService.embedSignaturesInPdf() using pdf-lib
  → Signed PDF gets certificate page appended, document.status = 'signed'
  → Notification email sent to document owner
```

### Pricing table custom element

`<pricing-table>` is a custom TipTap node ([PricingTableExtension.js](panda-monday/src/pages/components/PricingTableExtension.js)). Items are serialized as base64 JSON in `data-items-b64` to survive HTML encoding. During PDF generation, `pdfService.processPricingTableNodes()` decodes and expands them via `catalogService.buildPricingTableHtml()`.

### Signature field positioning

Fields (signature, initials, date, text) are stored as `fieldConfig` JSON — array of `{ type, x, y, w, h, page }` in **percentage coordinates** relative to page size. `selfSignService.embedSignaturesInPdf()` converts to pdf-lib points: `x = (field.x / 100) * pageWidth`. The y-axis is inverted because pdf-lib uses bottom-left origin.

### PDF storage

`storageService.js` auto-detects environment: without `R2_ACCOUNT_ID`, PDFs are saved to `maxi-docs-backend/uploads/documents/` and served by Express. In production, Cloudflare R2 (S3-compatible API).

### Workspace isolation

`WorkspaceProvider` ([WorkspaceContext.jsx](panda-monday/src/context/WorkspaceContext.jsx)) loads workspaces on mount and sets `x-monday-workspace-id` as a default Axios header. Active workspace persists to `sessionStorage`.

### Email

`emailService.js` detects provider at runtime: Resend (REST) or SMTP (Nodemailer). If neither is configured, emails are silently skipped — no crash. Export `sendSignatureRequest`, `sendSignedNotification`, `sendViewedNotification`.

### Public routes

`/sign/:signatureId` (PortalPage) and `/room/:token` (PublicRoomPage) bypass Monday auth entirely and use JWT or opaque access tokens.

## Critical: Incomplete Database Schema

`schema.sql` defines only **4 of ~16 required tables**. These routes will throw 500 errors until the schema is completed:

| Missing table | Broken route |
|---|---|
| `account_settings` | `/api/settings` |
| `approvals` | `/api/approvals` |
| `content_blocks` | `/api/content-library` |
| `cpq_rules` | `/api/cpq` |
| `deal_rooms`, `room_documents`, `room_messages` | `/api/rooms` |
| `webhook_configs` | `/api/settings` (webhooks) |
| `workspaces` | `/api/workspaces` |
| `api_keys` | `/api/integrations` |
| `embed_tokens` | `/api/embed` |

Missing columns on existing tables: `documents.approval_status`, `documents.workspace_id`, `templates.workspace_id`, `signatures.time_spent_seconds`.

## Environment Variables

Copy `maxi-docs-backend/.env.example` to `.env`. Minimum to run:

```
DATABASE_URL=postgresql://...
PORT=3001
MONDAY_SIGNING_SECRET=...
JWT_SECRET=change-in-production
FRONTEND_URL=http://localhost:8301
```

Optional features activate when their keys are present: email (Resend or SMTP), storage (R2 keys), payments (Stripe).

## Key Conventions

- **ES modules throughout** — `"type": "module"` in both packages. Always `import/export`, never `require()`.
- **No TypeScript, no Prisma** — plain JavaScript, raw SQL via `query()` from `src/db/connection.js`.
- All DB access uses the `query(sql, params)` pool helper. Never build raw string interpolation — always use `$1, $2` parameters.
- `logEvent()` from `auditService.js` never throws — failures are caught internally.
- The `opensign_document_id` column in `signatures` is repurposed to store `fieldConfig` JSON (legacy name, not OpenSign).
