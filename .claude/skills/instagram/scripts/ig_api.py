#!/usr/bin/env python3
"""Instagram Graph API client — built from official Meta docs.

Usage:
    python3 ig_api.py <command> [options]

Commands:
    validate_token          Validate access token and show permissions
    get_profile             Get business profile info
    get_pages               List connected Facebook pages
    get_media               Get recent media posts
    get_media_insights      Get insights for a specific post
    get_account_insights    Get account-level analytics
    create_container        Create media container (image/video/reel/story)
    publish_media           Publish a container
    check_status            Check container publishing status
    publishing_limit        Check current publishing rate limit usage
    create_carousel_item    Create a carousel child container
    publish_carousel        Full carousel workflow: children + parent + publish
    publish_reel            Create and publish a Reel
    publish_story           Create and publish a Story
    get_conversations       Get DM conversations (Advanced Access)
    get_messages            Get messages from a conversation
    send_dm                 Send a direct message

Environment variables required:
    INSTAGRAM_ACCESS_TOKEN
    INSTAGRAM_BUSINESS_ACCOUNT_ID

Reference: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error


GRAPH_API_VERSION = "v25.0"
GRAPH_API_BASE = f"https://graph.instagram.com/{GRAPH_API_VERSION}"
FB_GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def get_env(key):
    val = os.environ.get(key)
    if not val:
        print(f"Error: {key} environment variable not set", file=sys.stderr)
        sys.exit(1)
    return val


def api_request(url, method="GET", data=None):
    """Make an API request. GET uses query param auth, POST uses Bearer header."""
    token = get_env("INSTAGRAM_ACCESS_TOKEN")

    if data and method == "POST":
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {token}")
    else:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}access_token={urllib.parse.quote(token)}"
        req = urllib.request.Request(url, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            err = json.loads(body)
            print(json.dumps({"error": err, "status": e.code}, indent=2))
        except json.JSONDecodeError:
            print(json.dumps({"error": body, "status": e.code}, indent=2))
        sys.exit(1)


# ── Profile & Account ──────────────────────────────────────────────

def validate_token():
    url = f"{GRAPH_API_BASE}/me"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def get_profile(account_id=None):
    aid = account_id or get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    fields = "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count"
    url = f"{GRAPH_API_BASE}/{aid}?fields={fields}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def get_pages():
    fields = "id,name,instagram_business_account"
    url = f"{GRAPH_API_BASE}/me/accounts?fields={fields}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


# ── Media Read ──────────────────────────────────────────────────────

def get_media(limit=25, after=None):
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    fields = "id,media_type,media_product_type,media_url,permalink,caption,timestamp,like_count,comments_count"
    url = f"{GRAPH_API_BASE}/{aid}/media?fields={fields}&limit={limit}"
    if after:
        url += f"&after={urllib.parse.quote(after)}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


# ── Insights (official metrics: engagement, impressions, reach) ────

def get_media_insights(media_id, metrics=None):
    if not metrics:
        metrics = "engagement,impressions,reach"
    url = f"{GRAPH_API_BASE}/{media_id}/insights?metric={metrics}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def get_account_insights(period="day", metrics=None):
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    if not metrics:
        metrics = "impressions,reach,profile_views"
    url = f"{GRAPH_API_BASE}/{aid}/insights?metric={metrics}&period={period}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


# ── Publishing Status & Rate Limits ────────────────────────────────

def check_status(container_id):
    """Check container publishing eligibility. Official statuses:
    EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED"""
    url = f"{GRAPH_API_BASE}/{container_id}?fields=status_code"
    result = api_request(url)
    print(json.dumps(result, indent=2))
    return result.get("status_code")


def publishing_limit():
    """Check current publishing rate limit (100 posts/24hr)."""
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    url = f"{GRAPH_API_BASE}/{aid}/content_publishing_limit"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def wait_for_container(container_id, max_wait=300):
    """Poll container status once per minute, max 5 min (per official docs)."""
    for _ in range(max_wait // 60):
        url = f"{GRAPH_API_BASE}/{container_id}?fields=status_code"
        result = api_request(url)
        status = result.get("status_code")
        if status == "FINISHED":
            return True
        if status == "ERROR":
            print(f"Error: Container {container_id} failed processing", file=sys.stderr)
            sys.exit(1)
        if status == "EXPIRED":
            print(f"Error: Container {container_id} expired (24hr limit)", file=sys.stderr)
            sys.exit(1)
        print(f"  Container {container_id}: {status}, waiting 60s...")
        time.sleep(60)
    print(f"Error: Container {container_id} timed out after {max_wait}s", file=sys.stderr)
    sys.exit(1)


# ── Single Post Publishing ─────────────────────────────────────────

def create_container(image_url=None, video_url=None, caption="",
                     media_type=None, alt_text=None, location_id=None):
    """Create media container. Per official docs:
    - image_url for images (JPEG only)
    - video_url for video/reels/stories
    - media_type: VIDEO, REELS, or STORIES (omit for images)
    """
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    url = f"{GRAPH_API_BASE}/{aid}/media"

    data = {}
    if caption:
        data["caption"] = caption
    if image_url:
        data["image_url"] = image_url
        if alt_text:
            data["alt_text"] = alt_text
    elif video_url:
        data["video_url"] = video_url
        if media_type:
            data["media_type"] = media_type
        else:
            data["media_type"] = "VIDEO"
    else:
        print("Error: image_url or video_url required", file=sys.stderr)
        sys.exit(1)

    if location_id:
        data["location_id"] = location_id

    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))


def publish_media(container_id):
    """Publish a container (single post or carousel)."""
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    url = f"{GRAPH_API_BASE}/{aid}/media_publish"
    data = {"creation_id": container_id}
    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))


# ── Reels ──────────────────────────────────────────────────────────

def publish_reel(video_url, caption="", share_to_feed=True,
                 thumb_offset=None, trial_strategy=None):
    """Create and publish a Reel (media_type=REELS).
    Optional trial_strategy: MANUAL or SS_PERFORMANCE for trial reels."""
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")

    # Step 1: Create reel container
    data = {
        "media_type": "REELS",
        "video_url": video_url,
    }
    if caption:
        data["caption"] = caption
    if share_to_feed:
        data["share_to_feed"] = True
    if thumb_offset is not None:
        data["thumb_offset"] = str(thumb_offset)
    if trial_strategy:
        data["trial_params"] = {"graduation_strategy": trial_strategy}

    url = f"{GRAPH_API_BASE}/{aid}/media"
    result = api_request(url, method="POST", data=data)
    container_id = result.get("id")
    print(f"Created reel container: {container_id}")

    # Step 2: Wait for processing
    print("Waiting for reel to process (polling once/min, max 5 min)...")
    wait_for_container(container_id)

    # Step 3: Publish
    url = f"{GRAPH_API_BASE}/{aid}/media_publish"
    data = {"creation_id": container_id}
    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))


# ── Stories ────────────────────────────────────────────────────────

def publish_story(image_url=None, video_url=None):
    """Create and publish a Story (media_type=STORIES)."""
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")

    data = {"media_type": "STORIES"}
    if image_url:
        data["image_url"] = image_url
    elif video_url:
        data["video_url"] = video_url
    else:
        print("Error: image_url or video_url required", file=sys.stderr)
        sys.exit(1)

    # Step 1: Create story container
    url = f"{GRAPH_API_BASE}/{aid}/media"
    result = api_request(url, method="POST", data=data)
    container_id = result.get("id")
    print(f"Created story container: {container_id}")

    # Step 2: Wait for processing
    print("Waiting for story to process...")
    wait_for_container(container_id)

    # Step 3: Publish
    url = f"{GRAPH_API_BASE}/{aid}/media_publish"
    data = {"creation_id": container_id}
    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))


# ── Carousel Publishing ───────────────────────────────────────────

def create_carousel_item(image_url=None, video_url=None):
    """Create a single carousel child container (is_carousel_item=true)."""
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    url = f"{GRAPH_API_BASE}/{aid}/media"

    data = {"is_carousel_item": True}
    if image_url:
        data["image_url"] = image_url
    elif video_url:
        data["video_url"] = video_url
        data["media_type"] = "VIDEO"
    else:
        print("Error: image_url or video_url required", file=sys.stderr)
        sys.exit(1)

    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))
    return result.get("id")


def publish_carousel(media_urls, caption="", location_id=None):
    """Full carousel workflow per official docs.

    media_urls: comma-separated public URLs (JPEG for images).
    Prefix videos with 'video:' (e.g. video:https://example.com/clip.mp4)

    Limits: 2-10 items. Counts as 1 post toward 100/24hr limit.
    Images cropped based on first image (default 1:1 aspect ratio).
    """
    aid = get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    urls = [u.strip() for u in media_urls.split(",")]

    if len(urls) < 2:
        print("Error: Carousel requires at least 2 media items", file=sys.stderr)
        sys.exit(1)
    if len(urls) > 10:
        print("Error: Carousel allows max 10 media items", file=sys.stderr)
        sys.exit(1)

    # Step 1: Create child containers
    child_ids = []
    for i, u in enumerate(urls):
        data = {"is_carousel_item": True}
        if u.startswith("video:"):
            data["video_url"] = u[6:]
            data["media_type"] = "VIDEO"
        else:
            data["image_url"] = u
        result = api_request(f"{GRAPH_API_BASE}/{aid}/media", method="POST", data=data)
        cid = result.get("id")
        print(f"Created child container {i+1}/{len(urls)}: {cid}")
        child_ids.append(cid)

    # Step 2: Wait for all children (poll once/min per official docs)
    print("Waiting for containers to process...")
    for cid in child_ids:
        wait_for_container(cid)
    print("All children ready.")

    # Step 3: Create parent carousel container
    data = {
        "media_type": "CAROUSEL",
        "children": ",".join(child_ids),
    }
    if caption:
        data["caption"] = caption
    if location_id:
        data["location_id"] = location_id

    result = api_request(f"{GRAPH_API_BASE}/{aid}/media", method="POST", data=data)
    parent_id = result.get("id")
    print(f"Created carousel container: {parent_id}")

    # Step 4: Wait for parent
    wait_for_container(parent_id)

    # Step 5: Publish
    data = {"creation_id": parent_id}
    result = api_request(f"{GRAPH_API_BASE}/{aid}/media_publish", method="POST", data=data)
    print(json.dumps(result, indent=2))


# ── Direct Messages (Advanced Access) ─────────────────────────────

def get_conversations(page_id=None, limit=25):
    pid = page_id or get_env("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    url = f"{FB_GRAPH_BASE}/{pid}/conversations?platform=instagram&limit={limit}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def get_messages(conversation_id, limit=25):
    fields = "id,from,to,message,created_time,attachments"
    url = f"{FB_GRAPH_BASE}/{conversation_id}?fields=messages.limit({limit}){{{fields}}}"
    result = api_request(url)
    print(json.dumps(result, indent=2))


def send_dm(recipient_id, message):
    if len(message) > 1000:
        print("Error: Message exceeds 1000 character limit", file=sys.stderr)
        sys.exit(1)
    url = f"{FB_GRAPH_BASE}/me/messages"
    data = {
        "recipient": {"id": recipient_id},
        "message": {"text": message},
    }
    result = api_request(url, method="POST", data=data)
    print(json.dumps(result, indent=2))


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Instagram Graph API CLI (from official Meta docs)")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("validate_token")

    p = sub.add_parser("get_profile")
    p.add_argument("--account-id", default=None)

    sub.add_parser("get_pages")

    p = sub.add_parser("get_media")
    p.add_argument("--limit", type=int, default=25)
    p.add_argument("--after", default=None)

    p = sub.add_parser("get_media_insights")
    p.add_argument("--media-id", required=True)
    p.add_argument("--metrics", default=None, help="Default: engagement,impressions,reach")

    p = sub.add_parser("get_account_insights")
    p.add_argument("--period", default="day", choices=["day", "week", "days_28", "lifetime"])
    p.add_argument("--metrics", default=None, help="Default: impressions,reach,profile_views")

    p = sub.add_parser("create_container")
    p.add_argument("--image-url", default=None, help="JPEG only")
    p.add_argument("--video-url", default=None)
    p.add_argument("--caption", default="")
    p.add_argument("--media-type", default=None, choices=["VIDEO", "REELS", "STORIES"])
    p.add_argument("--alt-text", default=None, help="Alt text for images (March 2025)")
    p.add_argument("--location-id", default=None)

    p = sub.add_parser("publish_media")
    p.add_argument("--container-id", required=True)

    p = sub.add_parser("check_status")
    p.add_argument("--container-id", required=True)

    sub.add_parser("publishing_limit")

    p = sub.add_parser("create_carousel_item")
    p.add_argument("--image-url", default=None, help="JPEG only")
    p.add_argument("--video-url", default=None)

    p = sub.add_parser("publish_carousel")
    p.add_argument("--media-urls", required=True, help="Comma-separated public URLs. Prefix videos with video:")
    p.add_argument("--caption", default="")
    p.add_argument("--location-id", default=None)

    p = sub.add_parser("publish_reel")
    p.add_argument("--video-url", required=True)
    p.add_argument("--caption", default="")
    p.add_argument("--no-feed", action="store_true", help="Don't share to feed")
    p.add_argument("--thumb-offset", type=int, default=None, help="Thumbnail frame in ms")
    p.add_argument("--trial", default=None, choices=["MANUAL", "SS_PERFORMANCE"],
                   help="Publish as trial reel")

    p = sub.add_parser("publish_story")
    p.add_argument("--image-url", default=None, help="JPEG only")
    p.add_argument("--video-url", default=None)

    p = sub.add_parser("get_conversations")
    p.add_argument("--page-id", default=None)
    p.add_argument("--limit", type=int, default=25)

    p = sub.add_parser("get_messages")
    p.add_argument("--conversation-id", required=True)
    p.add_argument("--limit", type=int, default=25)

    p = sub.add_parser("send_dm")
    p.add_argument("--recipient-id", required=True)
    p.add_argument("--message", required=True)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "validate_token": lambda: validate_token(),
        "get_profile": lambda: get_profile(args.account_id),
        "get_pages": lambda: get_pages(),
        "get_media": lambda: get_media(args.limit, args.after),
        "get_media_insights": lambda: get_media_insights(args.media_id, args.metrics),
        "get_account_insights": lambda: get_account_insights(args.period, args.metrics),
        "create_container": lambda: create_container(
            args.image_url, args.video_url, args.caption,
            args.media_type, args.alt_text, args.location_id),
        "publish_media": lambda: publish_media(args.container_id),
        "check_status": lambda: check_status(args.container_id),
        "publishing_limit": lambda: publishing_limit(),
        "create_carousel_item": lambda: create_carousel_item(args.image_url, args.video_url),
        "publish_carousel": lambda: publish_carousel(args.media_urls, args.caption, args.location_id),
        "publish_reel": lambda: publish_reel(
            args.video_url, args.caption, not args.no_feed,
            args.thumb_offset, args.trial),
        "publish_story": lambda: publish_story(args.image_url, args.video_url),
        "get_conversations": lambda: get_conversations(args.page_id, args.limit),
        "get_messages": lambda: get_messages(args.conversation_id, args.limit),
        "send_dm": lambda: send_dm(args.recipient_id, args.message),
    }

    cmd = commands.get(args.command)
    if cmd:
        cmd()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
