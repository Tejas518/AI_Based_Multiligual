"""
One-time script: Create and dispatch a targeted campaign for Riyanshi Verma.
Channels: Email, SMS, Telegram. Language: English. Single dispatch.
"""
import requests
import json
import sys
import time

BASE = "http://127.0.0.1:8000"

# Step 1: Admin login (OAuth2 form data)
print("Logging in as admin...")
r = requests.post(f"{BASE}/api/auth/login", data={
    "username": "admin@example.com",
    "password": "AdminPassword123!"
})
if r.status_code != 200:
    print(f"Login failed: {r.status_code} {r.text}")
    sys.exit(1)

token = r.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}
print(f"Login successful.")

# Step 2: Get the segment ID for "Riyanshi Verma (Target)"
print("\nFetching segments...")
r = requests.get(f"{BASE}/api/segments", headers=headers)
if r.status_code != 200:
    print(f"Segments fetch failed: {r.status_code} {r.text}")
    sys.exit(1)

segments = r.json()
seg_id = None
for seg in segments:
    if seg["name"] == "Riyanshi Verma (Target)":
        seg_id = seg["id"]
        break

if not seg_id:
    print("Segment 'Riyanshi Verma (Target)' not found!")
    sys.exit(1)
print(f"Target segment found: {seg_id}")

# Step 3: Create campaign as draft
print("\nCreating campaign...")
campaign_data = {
    "title": "Official Safety Advisory - Riyanshi Verma",
    "description": "Direct safety advisory targeted at Riyanshi Verma only",
    "objective": "Direct Safety Advisory and Updates",
    "campaign_type": "awareness_drive",
    "segment_id": seg_id,
    "channel_preferences": ["email", "sms", "telegram"],
    "override_channel_preferences": True,
    "custom_subject": "Important Safety Advisory for {{first_name}}",
    "custom_body": "Dear {{first_name}} {{last_name}}, this is an official community safety announcement from CommAI for residents of {{city}}. Stay safe! Access portal: https://comm-ai-nine.vercel.app/",
}

r = requests.post(f"{BASE}/api/campaigns", json=campaign_data, headers=headers)
if r.status_code not in (200, 201):
    print(f"Campaign creation failed: {r.status_code} {r.text}")
    sys.exit(1)

campaign = r.json()
camp_id = campaign["id"]
print(f"Campaign created: {camp_id}")
print(f"   Title: {campaign.get('title')}")
print(f"   Status: {campaign.get('status')}")
print(f"   Target: {campaign.get('target_audience_count')} audience, Reach: {campaign.get('estimated_reach')}")

# Step 4: Activate and dispatch (draft -> active)
print("\nActivating and dispatching campaign...")
r = requests.put(f"{BASE}/api/campaigns/{camp_id}", json={
    "status": "active"
}, headers=headers)

if r.status_code == 200:
    result = r.json()
    print(f"Campaign dispatched!")
    print(f"   Status: {result.get('status')}")
else:
    print(f"Dispatch failed: {r.status_code} {r.text}")
    sys.exit(1)

# Step 5: Wait and check delivery logs
print("\nWaiting 8 seconds for delivery to complete...")
time.sleep(8)

r = requests.get(f"{BASE}/api/campaigns/{camp_id}/delivery", headers=headers)
if r.status_code == 200:
    data = r.json()
    print(f"\n--- Delivery Report ---")
    print(f"   Total Sent: {data.get('sent_count', 0)}")
    print(f"   Total Failed: {data.get('failed_count', 0)}")
    logs = data.get("logs", [])
    for log in logs:
        status_icon = "[OK]" if log.get("status") == "delivered" else "[FAIL]"
        print(f"   {status_icon} [{log.get('channel', '?').upper()}] -> {log.get('recipient_email') or log.get('recipient_name', '?')} -- {log.get('status', '?')}")
else:
    print(f"Could not fetch delivery logs: {r.status_code} {r.text}")

print("\nDone!")
