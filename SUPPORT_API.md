# Support Ticket API

## User - Create Ticket
**Endpoint:** `POST /api/v1/support/create`
**Headers:** `Authorization: Bearer <token>`
**Body:**
```json
{
  "category": "Technical",
  "subject": "App crashing on login",
  "description": "When I try to login...",
  "images": ["url1", "url2"] // optional
}
```

## User - Get My Tickets
**Endpoint:** `GET /api/v1/support/my-tickets`
**Headers:** `Authorization: Bearer <token>`
**Query Params:** `status`, `page`, `limit`

## Admin - List Tickets
**Endpoint:** `GET /api/v1/support/admin/list`
**Headers:** `Authorization: Bearer <token>` (Super Admin only)
**Query Params:**
- `status`: Pending, Open, Resolved, Cancelled, Reopen
- `category`
- `ticketId`
- `search`: Searches subject/desc/ticketId
- `userId`
- `startDate`, `endDate`
- `page`, `limit`

## Admin - Update Status
**Endpoint:** `PUT /api/v1/support/admin/update/:ticketId`
**Headers:** `Authorization: Bearer <token>` (Super Admin only)
**Body:**
```json
{
  "status": "Resolved",
  "adminComment": "Fixed the issue."
}
```

## Get Ticket Details
**Endpoint:** `GET /api/v1/support/:ticketId`
**Headers:** `Authorization: Bearer <token>`
*(Access limited to Ticket Owner or Super Admin)*
