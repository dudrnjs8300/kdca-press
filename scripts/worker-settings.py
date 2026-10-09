#!/usr/bin/env python3
"""Validate deployment settings or send JSON secrets directly into Wrangler stdin."""
import json
import os
import sys
from urllib.parse import urlparse

required = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "PUBLIC_BASE_URL")
missing = [key for key in required if not os.environ.get(key)]
if missing:
    sys.exit("Missing settings: " + ", ".join(missing))
base = urlparse(os.environ["PUBLIC_BASE_URL"])
if (base.scheme != "https" or not base.hostname or
        not base.hostname.startswith("kdca-press.") or not base.hostname.endswith(".workers.dev") or
        base.path or base.params or base.query or base.fragment or base.username or base.password or base.port):
    sys.exit("Expected https://kdca-press.YOUR-SUBDOMAIN.workers.dev without a trailing slash")
if sys.argv[1:] == ["check"]:
    print("Deployment settings present; secrets not displayed.")
elif sys.argv[1:] == ["secrets"]:
    # This command MUST be piped directly into `wrangler secret bulk`, never logs.
    print(json.dumps({key: os.environ[key] for key in ("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "PUBLIC_BASE_URL")}))
else:
    sys.exit("Use check, or secrets piped into wrangler secret bulk")
