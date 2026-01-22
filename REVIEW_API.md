# Review API

## Add Review
**Endpoint:** `POST /api/v1/review/add`
**Headers:** `Authorization: Bearer <token>`
**Body:**
```json
{
  "entityId": "65ab1234...", // Event ID or Course ID
  "entityModel": "Event", // or "Course"
  "review": "This was a great event!"
}
```

## Update Review
**Endpoint:** `PUT /api/v1/review/update/:reviewId`
**Headers:** `Authorization: Bearer <token>`
**Body:**
```json
{
  "review": "Updated review text"
}
```

## Delete Review
**Endpoint:** `DELETE /api/v1/review/delete/:reviewId`
**Headers:** `Authorization: Bearer <token>`
**Note:** Users can delete their own reviews. Super Admins can delete any review.

## Get Reviews
**Endpoint:** `GET /api/v1/review/list`
**Headers:** `Authorization: Bearer <token>`
**Query Params:**
- `entityId`: (required) ID of Event or Course
- `entityModel`: (required) "Event" or "Course"
- `page`: (optional) default 1
- `limit`: (optional) default 10

**Example:**
`/api/v1/review/list?entityId=65ab1234...&entityModel=Event`
