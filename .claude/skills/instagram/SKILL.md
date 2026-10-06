---
name: instagram
description: "Manage Instagram Business accounts via Meta's Graph API. Use when the user wants to: (1) View Instagram profile info or follower stats, (2) List or browse recent posts, (3) Publish images, videos, reels, stories, or carousels to Instagram, (4) Get engagement analytics or insights, (5) Read or send Instagram DMs, (6) Check API token status or publishing rate limits. Triggers on mentions of Instagram, IG, posting to Instagram, Instagram analytics, Instagram DMs, reels, stories, or Instagram publishing."
---

# Instagram

Manage Instagram professional accounts through Meta's Graph API v25.0.

## Setup

Requires environment variables in `.env`:

```
INSTAGRAM_ACCESS_TOKEN=<long-lived-token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<ig-account-id>
```

For setup instructions, see [references/authentication.md](references/authentication.md).

## Running Commands

Load `.env` then run. Use the absolute path to the skill's scripts directory:

```bash
set -a && source .env && set +a && python3 scripts/ig_api.py <command> [options]
```

The script path is relative to this skill's directory. If running from elsewhere, use the full path to `scripts/ig_api.py`.

## Commands

### Profile & Account

```bash
python3 scripts/ig_api.py get_profile
python3 scripts/ig_api.py get_pages
python3 scripts/ig_api.py validate_token
```

### Media & Posts

```bash
python3 scripts/ig_api.py get_media --limit 10
python3 scripts/ig_api.py get_media --after <cursor>
# Official metrics: engagement, impressions, reach
python3 scripts/ig_api.py get_media_insights --media-id <id>
```

### Publish Image or Video

Always confirm with user before publishing.

```bash
# Image (JPEG only)
python3 scripts/ig_api.py create_container --image-url <public-jpeg-url> --caption "Caption" --alt-text "Description"

# Video
python3 scripts/ig_api.py create_container --video-url <public-url> --caption "Caption"

# Check status — poll until FINISHED
python3 scripts/ig_api.py check_status --container-id <id>

# Publish
python3 scripts/ig_api.py publish_media --container-id <id>
```

### Publish Reel

```bash
# All-in-one (creates container, waits, publishes)
python3 scripts/ig_api.py publish_reel --video-url <url> --caption "Caption"

# With options
python3 scripts/ig_api.py publish_reel --video-url <url> --caption "Caption" --thumb-offset 2000 --no-feed

# Trial reel (shared to non-followers only)
python3 scripts/ig_api.py publish_reel --video-url <url> --trial MANUAL
```

### Publish Story

```bash
python3 scripts/ig_api.py publish_story --image-url <jpeg-url>
python3 scripts/ig_api.py publish_story --video-url <video-url>
```

### Publish Carousel (2-10 items)

```bash
# All-in-one (creates children, waits, creates parent, publishes)
python3 scripts/ig_api.py publish_carousel \
  --media-urls "https://example.com/img1.jpg,https://example.com/img2.jpg" \
  --caption "Carousel post"

# Mixed media — prefix videos with video:
python3 scripts/ig_api.py publish_carousel \
  --media-urls "https://example.com/img1.jpg,video:https://example.com/clip.mp4" \
  --caption "Mixed carousel"
```

### Rate Limits & Status

```bash
python3 scripts/ig_api.py publishing_limit
python3 scripts/ig_api.py check_status --container-id <id>
```

### Analytics

```bash
# Official metrics: impressions, reach, profile_views
python3 scripts/ig_api.py get_account_insights --period day
python3 scripts/ig_api.py get_account_insights --period days_28 --metrics impressions,reach
```

**Deprecated (Jan 2025):** `video_views`, `email_contacts`, `website_clicks` — do not use.

### Direct Messages (Advanced Access)

```bash
python3 scripts/ig_api.py get_conversations --limit 10
python3 scripts/ig_api.py get_messages --conversation-id <id>
python3 scripts/ig_api.py send_dm --recipient-id <id> --message "Hello!"
```

## Rules

- Always load `.env` before running: `set -a && source .env && set +a`
- Never expose access tokens or credentials in output
- Always confirm with user before publishing
- See [references/api_reference.md](references/api_reference.md) for rate limits, image format restrictions, and all API limitations

## Resources

- **API reference**: [references/api_reference.md](references/api_reference.md) — all endpoints, params, rate limits, error codes
- **Auth setup**: [references/authentication.md](references/authentication.md) — token generation and permissions
