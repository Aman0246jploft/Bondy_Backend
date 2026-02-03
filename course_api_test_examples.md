# Course API Test Payloads

Use these JSON payloads and URL examples to test the refactored Course APIs.

## 1. Create Course
**Method:** `POST`
**URL:** `{{base_url}}/course/create`
**Headers:**
- `Authorization`: `Bearer {{organizer_token}}`
- `Content-Type`: `application/json`

**Body (JSON):**
> **Note:** Replace `YOUR_CATEGORY_ID_HERE` with a valid MongoDB ObjectId from your `categories` collection.

```json
{
  "courseTitle": "Mastering Pottery: Weekend Workshop",
  "courseCategory": "YOUR_CATEGORY_ID_HERE",
  "shortdesc": "Join us for an intensive 2-day workshop to learn the basics of clay throwing and glazing.",
  "totalSeats": 15,
  "price": 250,
  "enrollmentType": "fixedStart",
  "venueAddress": {
    "latitude": 34.0522,
    "longitude": -118.2437,
    "city": "Los Angeles",
    "country": "USA",
    "address": "456 Creative Ave, Arts District",
    "state": "California",
    "zipcode": "90013"
  },
  "posterImage": [
    "https://placehold.co/600x400/png",
    "https://placehold.co/600x400/png"
  ],
  "schedules": [
    {
      "startDate": "2024-06-01T09:00:00.000Z",
      "endDate": "2024-06-02T17:00:00.000Z",
      "startTime": "09:00",
      "endTime": "17:00"
    }
  ]
}
```

---

## 2. Get Courses Public List
**Method:** `GET`
**URL:** `{{base_url}}/course/list`

### Examples:

**A. Get All (Default):**
```
{{base_url}}/course/list?filter=all&page=1&limit=10
```

**B. Get Near Specific Location:**
> Requires `latitude` and `longitude`. `radius` is optional (default 50km).
```
{{base_url}}/course/list?filter=nearYou&latitude=34.0522&longitude=-118.2437&radius=25
```

**C. Get Upcoming Courses:**
```
{{base_url}}/course/list?filter=upcoming
```

---

## 3. Admin Get Courses
**Method:** `GET`
**URL:** `{{base_url}}/course/admin/list`
**Headers:**
- `Authorization`: `Bearer {{super_admin_token}}`

### Example:
```
{{base_url}}/course/admin/list?page=1&limit=20&search=Pottery
```
