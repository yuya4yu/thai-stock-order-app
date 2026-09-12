#!/usr/bin/env bash
# 使い方: notify.sh "<タイトル>" "<本文>"
# 環境変数で使う通知先を切り替える（複数設定してあれば全部に送る）
#
#   LINE_MESSAGING_TOKEN / LINE_MESSAGING_TO … LINE公式アカウントのMessaging API
#                            （LINE Notifyは2025年3月末で終了済みのため、LINEに送る場合は
#                             Messaging APIへの移行が必須。個人宛の場合はユーザーIDが必要）
#   DISCORD_WEBHOOK_URL   … Discord Webhook URL（使う場合のみ設定）
#   BARK_URL              … Bark のプッシュURL（使う場合のみ設定）
#
# 事前に export しておくか、~/.claude/settings.json の "env" に書いておく。

set -euo pipefail

TITLE="${1:-Claude Code}"
BODY="${2:-通知}"

if [ -n "${LINE_MESSAGING_TOKEN:-}" ] && [ -n "${LINE_MESSAGING_TO:-}" ]; then
  curl -s -X POST https://api.line.me/v2/bot/message/push \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${LINE_MESSAGING_TOKEN}" \
    -d "{\"to\": \"${LINE_MESSAGING_TO}\", \"messages\": [{\"type\": \"text\", \"text\": \"[${TITLE}] ${BODY}\"}]}" >/dev/null || true
fi

if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
  curl -s -X POST "$DISCORD_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"**${TITLE}**\n${BODY}\"}" >/dev/null || true
fi

if [ -n "${BARK_URL:-}" ]; then
  curl -s "${BARK_URL}/$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$TITLE")/$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$BODY")" >/dev/null || true
fi
