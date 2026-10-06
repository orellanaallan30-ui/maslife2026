# Instagram Graph API Reference (from official Meta docs)

API Version: `v25.0`
Base URL: `https://graph.instagram.com/v25.0`
Facebook Graph URL: `https://graph.facebook.com/v25.0` (DMs only)

## Contents
- Endpoints: Create Container, Publish, Check Status, Rate Limit, Carousel, Profile, Pages, Media, Insights, DMs
- Rate Limits
- Limitations
- Permissions (Instagram Login + Facebook Login)
- Container Status Codes

## Endpoints

### Create Media Container
```
POST /{IG_ID}/media
```
Parameters:
- `image_url` — Public URL to JPEG image (**JPEG only**, no PNG/MPO/JPS)
- `video_url` — Public URL to video
- `media_type` — `VIDEO`, `REELS`, or `STORIES` (omit for images)
- `caption` — Post caption
- `alt_text` — Alt text for images (added March 2025, not for reels/stories)
- `is_carousel_item` — Set to `true` for carousel children
- `upload_type` — Set to `resumable` for large video uploads
- `location_id` — Optional location tag
- `share_to_feed` — For reels, show in feed (default true)
- `thumb_offset` — Thumbnail frame in ms (reels)
- `trial_params` — `{"graduation_strategy": "MANUAL"|"SS_PERFORMANCE"}` for trial reels

### Publish Media
```
POST /{IG_ID}/media_publish
```
Parameters:
- `creation_id` — Container ID (single post or carousel parent)

### Check Container Status
```
GET /{IG_CONTAINER_ID}?fields=status_code
```
Statuses: `IN_PROGRESS`, `FINISHED`, `ERROR`, `EXPIRED`, `PUBLISHED`
Poll once per minute, max 5 minutes.

### Check Publishing Rate Limit
```
GET /{IG_ID}/content_publishing_limit
```

### Create Carousel Container
```
POST /{IG_ID}/media
```
Parameters:
- `media_type` — `CAROUSEL`
- `children` — Comma-separated list of child container IDs (2-10)
- `caption` — Carousel caption

### Profile
```
GET /{IG_ID}?fields=id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count
```

### Connected Pages
```
GET /me/accounts?fields=id,name,instagram_business_account
```

### Media (Read)
```
GET /{IG_ID}/media?fields=id,media_type,media_product_type,media_url,permalink,caption,timestamp,like_count,comments_count&limit={1-100}
```
- `media_type`: IMAGE, VIDEO, CAROUSEL_ALBUM
- `media_product_type`: FEED, REELS, STORY (use this to distinguish reels/stories)

### Media Insights
```
GET /{MEDIA_ID}/insights?metric=engagement,impressions,reach
```

### Account Insights
```
GET /{IG_ID}/insights?metric=impressions,reach,profile_views&period=day
```
**Deprecated (Jan 8 2025):** `video_views`, `email_contacts`, `website_clicks`

### DM Conversations (Advanced Access)
```
GET /{PAGE_ID}/conversations?platform=instagram&limit={1-100}
```
Uses Facebook Graph API base URL.

### DM Messages
```
GET /{CONVERSATION_ID}?fields=messages.limit({n}){id,from,to,message,created_time,attachments}
```

### Send DM
```
POST /me/messages
  {"recipient": {"id": "<id>"}, "message": {"text": "<text>"}}
```
Max 1000 characters. 24-hour reply window only.

## Rate Limits (official)

| Operation | Limit |
|-----------|-------|
| API-published posts | **100 per 24-hour moving period** |
| API calls (read) | 200 per hour per user |
| Carousel | Counts as 1 post |

## Limitations (official)

- **JPEG only** for images (no PNG, MPO, JPS)
- Shopping tags not supported
- Branded content tags not supported
- Filters not supported
- Containers expire after 24 hours if not published
- Insights not available for accounts with fewer than 100 followers
- User metrics data stored for up to 90 days
- Ads-driven data not included in aggregated insight fields

## Permissions

### Instagram API with Instagram Login
- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_insights` (for insights)

### Instagram API with Facebook Login
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `instagram_manage_insights` (for insights)

## Container Status Codes

| Status | Meaning |
|--------|---------|
| `IN_PROGRESS` | Still processing |
| `FINISHED` | Ready to publish |
| `ERROR` | Failed processing |
| `EXPIRED` | Not published within 24 hours |
| `PUBLISHED` | Already published |
