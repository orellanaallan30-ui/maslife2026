# Instagram Authentication Guide

## Prerequisites

- Facebook Business App at developers.facebook.com
- Instagram Business or Creator account linked to a Facebook Page
- App products enabled: Instagram Graph API
- Page Publishing Authorization (PPA) completed if required by the connected Page

**Important:** If the connected Facebook Page requires PPA, publishing will be blocked until PPA is completed. Advise users to complete PPA preemptively since there's no API to check if it's required.

## Required Environment Variables

```
INSTAGRAM_ACCESS_TOKEN=<long-lived-token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<ig-account-id>
```

Store in `.env` at project root. Never commit or expose.

## Two Auth Paths

### Instagram API with Instagram Login (Business Login)
- Host: `graph.instagram.com`
- Permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`

### Instagram API with Facebook Login
- Host: `graph.facebook.com`
- Permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `instagram_manage_insights`
- If user has a Business Manager role on the Page, also needs: `ads_management`, `ads_read`

## Getting Credentials

### 1. Create Facebook App
- Go to developers.facebook.com > My Apps > Create App
- Choose "Business" type
- Add product: "Instagram Graph API"

### 2. Generate Access Token
**Quick (testing):** Use Graph API Explorer at developers.facebook.com/tools/explorer
- Select your app
- Request the permissions for your auth path (see above)
- Generate token (short-lived, 1 hour)

**Production:** Exchange for long-lived token (~60 days):
```
GET https://graph.instagram.com/v25.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=<APP_ID>
  &client_secret=<APP_SECRET>
  &fb_exchange_token=<SHORT_LIVED_TOKEN>
```

### 3. Get Instagram Business Account ID
```
GET https://graph.instagram.com/v25.0/me/accounts
  ?fields=id,name,instagram_business_account
  &access_token=<TOKEN>
```
Extract `instagram_business_account.id` from the response.

## Permissions Reference

| Permission | Auth Path | Enables |
|-----------|-----------|---------|
| `instagram_business_basic` | Instagram Login | Profile, media, follower count |
| `instagram_business_content_publish` | Instagram Login | Upload/publish content |
| `instagram_business_manage_insights` | Instagram Login | Analytics access |
| `instagram_basic` | Facebook Login | Profile, media, follower count |
| `instagram_content_publish` | Facebook Login | Upload/publish content |
| `instagram_manage_insights` | Facebook Login | Analytics access |
| `pages_read_engagement` | Facebook Login | Page engagement data |
| `instagram_manage_messages` | Either (Advanced) | Read/send DMs |

**Advanced Access** requires Meta review (3-7 business days). Needed only for DM features.

## Token Expiration

- Short-lived: 1 hour
- Long-lived: ~60 days
- Validate with: `python3 scripts/ig_api.py validate_token`
- Refresh before expiration by exchanging again
