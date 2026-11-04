"""Trigger the private Site. This script can never create an approval.

SOME_SITE_URL and SOME_SITE_SERVICE_TOKEN must come from GitHub Secrets.
No SMTP or local seen.json state is needed: D1 owns queue state.
"""
import argparse
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force-collection', action='store_true')
    args = parser.parse_args()
    origin = os.environ['SOME_SITE_URL'].rstrip('/')
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.chatgpt.site') or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise SystemExit('SOME_SITE_URL must be the HTTPS origin of your private Site.')
    request = urllib.request.Request(origin + '/api/automation',
        data=json.dumps({'forceCollection': args.force_collection}).encode(),
        headers={'Content-Type': 'application/json', 'OAI-Sites-Authorization': 'Bearer ' + os.environ['SOME_SITE_SERVICE_TOKEN']}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            print(response.read().decode())
    except urllib.error.HTTPError as error:
        # Do not print headers, tokens or signed URLs.
        raise SystemExit(f'Site sync failed: HTTP {error.code}') from None


if __name__ == '__main__':
    main()
