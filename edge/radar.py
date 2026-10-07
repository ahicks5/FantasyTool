"""The radar: people asking for start/sit, waiver and trade help, from Reddit and Bluesky, in one list.

Internal only (the admin page). It finds the threads; a person answers them. Nothing here posts,
and nothing posts automatically -- a bot reply gets the handle banned for good (docs/MARKETING.md §5.1).

Sources need no keys: Reddit's public RSS feeds and Bluesky's open search. The posts are fetched
live and held in memory for a few minutes; the only thing stored is which ids we handled
(`radar_marks` in the store), so we never keep a stranger's words on disk.
"""
from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Callable

UA = "ownerssuite-radar/0.1 (internal; by u/OwnersSuite)"
OUR_HANDLES = {"ownerssuite", "owners_suite", "ownerssuite.bsky.social"}

# Where the questions are. Reddit's multi-subreddit feeds (a+b+c) keep it to three requests,
# read one after another: keyless reads are throttled and six at once drew a 429.
REDDIT_FEEDS = [
    ("Reddit posts", "fantasyfootball+fantasyfootballadvice+Fantasy_Football+Sleeperapp+DynastyFF+FFCommish", "new"),
    ("Reddit comments: r/fantasyfootball", "fantasyfootball", "comments"),
    ("Reddit comments: advice subs", "fantasyfootballadvice+Fantasy_Football", "comments"),
]
BLUESKY_QUERIES = ['"who do I start"', '"start or sit"', "wdis", '"should I start" fantasy', "fantasy waiver pickup", "fantasy trade accept"]

MAX_AGE_H = 36  # an answer a day and a half late helps nobody
CACHE_S = 300

Fetch = Callable[[str], str]


@dataclass
class Item:
    id: str          # "reddit:t1_abc" / "bluesky:at://..." -- stable, so a mark sticks
    source: str      # reddit | bluesky
    where: str       # r/fantasyfootball, Bluesky
    author: str
    thread: str      # the post a comment sits under ("" for a post)
    text: str
    url: str
    created: float
    intent: str = "other"  # start_sit | waiver | trade | other


# ---- what counts as someone asking --------------------------------------------------------

_INTENTS = [
    ("start_sit", re.compile(
        r"\bwdis\b|\bwho (?:do|should|would) (?:i|you) (?:start|play|flex|sit)\b|\bstart (?:or|/) ?sit\b|\bsit (?:or|/) ?start\b"
        r"|\bshould i (?:start|sit|play|bench|flex)\b|\bwho to (?:start|flex|play|sit)\b|\b(?:start|flex|play) (?:one|1|two|2)\b"
        r"|\bwho(?:'s| is) the better (?:start|flex|play)\b|\bwhich (?:one|rb|wr|te|qb|flex) (?:do i|should i|to)\b")),
    ("trade", re.compile(
        r"\b(?:accept|decline|reject|veto)\b[^.?!]{0,30}\btrade\b|\b(?:trade|traded|offered)\b[\s\S]{0,200}\?"
        r"|\bwould you (?:do|take|accept) (?:this|it)\b"
        r"|\bwho wins (?:this|the) trade\b|\bsell (?:high|low) on\b|\bbuy (?:high|low) on\b")),
    ("waiver", re.compile(
        r"\bfaab\b|\bwaivers?\b[^.]{0,80}\?|\bwho (?:should|do|would) (?:i|you) (?:pick ?up|add|grab|claim|drop)\b"
        r"|\b(?:pick ?up|grab|add|claim|stash)\b[^.]{0,60}\?|\bhow much (?:should i|to) bid\b|\bdrop\b[^.]{0,40}\bfor\b[^.]{0,40}\?")),
]
_ASKS = re.compile(r"\?|\b(?:help|thoughts|advice|wdis)\b", re.I)
_FIRST_PERSON = re.compile(r"\b(?:i|i'm|im|i've|my|me|mine)\b", re.I)
_A_OR_B = re.compile(r"\b[\w.'-]+ (?:or|vs\.?) [\w.'-]+[^?]{0,30}\?", re.I)
# A thread whose title already says "this is where you ask" (WDIS megathreads, advice subs).
_ADVICE_THREAD = re.compile(r"\bwdis\b|who do i start|start/sit|start sit|waiver|trade|\badvice\b|\bindex\b|official:", re.I)
# Off Reddit, "should I start" is as often a video game as a lineup: ask for a football word too.
_FANTASY = re.compile(
    r"fantasy|\bff\b|\bppr\b|\bflex\b|waiver|faab|\bwdis\b|\bnfl\b|\b(?:rb|wr|te|qb)\d?\b|\bd/?st\b|lineup|touchdown"
    r"|\b(?:bills|dolphins|patriots|jets|ravens|bengals|browns|steelers|texans|colts|jaguars|jags|titans|broncos|chiefs"
    r"|raiders|chargers|cowboys|giants|eagles|commanders|bears|lions|packers|vikings|falcons|panthers|saints|buccaneers"
    r"|bucs|cardinals|rams|49ers|niners|seahawks)\b", re.I)


def classify(text: str, thread: str = "", advice_place: bool = False) -> str | None:
    """The intent if this reads like a person asking for a call, else None.

    A question (or "help/thoughts/advice") is required. Then either a known intent phrase, or an
    "A or B?" in a place where that can only mean a lineup call (a WDIS thread, an advice sub).
    First person is required off Reddit too, because Bluesky's search is mostly media posts
    phrased as questions ("Which Bears should managers start?").
    """
    t = " ".join(text.split())
    if not t or not _ASKS.search(t):
        return None
    low = t.lower()
    title = (thread or "").lower()
    # Inside a megathread the title is the strongest signal: "[Trade]" means a trade question
    # even when the comment mentions FAAB.
    if title.startswith("official:"):
        for name, words in (("start_sit", ("wdis", "who do i start", "start/sit")), ("trade", ("trade",)),
                            ("waiver", ("waiver",))):
            if any(w in title for w in words):
                return name
    for name, rx in _INTENTS:
        if rx.search(low):
            return name
    in_advice = advice_place or bool(_ADVICE_THREAD.search(title))
    if in_advice and _A_OR_B.search(t):
        if "trade" in title:
            return "trade"
        if "waiver" in title:
            return "waiver"
        return "start_sit"
    return None


def keep(item: Item, now: float) -> bool:
    """Our own posts, stale posts and media spam out; real askers in, tagged with their intent."""
    if item.author.lower() in OUR_HANDLES:
        return False
    if now - item.created > MAX_AGE_H * 3600:
        return False
    if item.source == "bluesky":
        if not _FANTASY.search(item.text) or not _FIRST_PERSON.search(item.text):
            return False
        if item.text.count("#") >= 3 or "http" in item.text:  # hashtag farms and article links
            return False
    intent = classify(item.text, item.thread, advice_place=item.where.lower() == "r/fantasyfootballadvice")
    if intent is None:
        return False
    item.intent = intent
    return True


# ---- sources ------------------------------------------------------------------------------

_ATOM = {"a": "http://www.w3.org/2005/Atom"}


def _md_text(content_html: str) -> str:
    """The body of a Reddit RSS entry as plain text, without the 'submitted by [link]' footer."""
    body = content_html
    m = re.search(r"<!-- SC_OFF -->(.*?)<!-- SC_ON -->", body, re.S)
    body = m.group(1) if m else re.split(r"&#32;\s*submitted by|submitted by", body)[0]
    body = re.sub(r"<br\s*/?>|</p>|</li>", "\n", body)
    body = re.sub(r"<[^>]+>", "", body)
    return html.unescape(html.unescape(body)).strip()


def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def parse_reddit(xml_text: str) -> list[Item]:
    """A Reddit Atom feed (posts or comments) into Items."""
    root = ET.fromstring(xml_text)
    out = []
    for e in root.findall("a:entry", _ATOM):
        rid = (e.findtext("a:id", "", _ATOM) or "").strip()
        title = e.findtext("a:title", "", _ATOM) or ""
        cat = e.find("a:category", _ATOM)
        where = cat.get("label", "") if cat is not None else ""
        author = (e.findtext("a:author/a:name", "", _ATOM) or "").replace("/u/", "")
        link = e.find("a:link", _ATOM)
        when = e.findtext("a:published", "", _ATOM) or e.findtext("a:updated", "", _ATOM)
        body = _md_text(e.findtext("a:content", "", _ATOM) or "")
        is_comment = rid.startswith("t1_")
        if is_comment:
            thread = title.split(" on ", 1)[1] if " on " in title else ""
            text = body
        else:
            thread, text = "", f"{title}\n{body}".strip()
        out.append(Item(id=f"reddit:{rid}", source="reddit", where=where, author=author, thread=thread,
                        text=text, url=link.get("href", "") if link is not None else "",
                        created=_ts(when) if when else 0.0))
    return out


def parse_bluesky(json_text: str) -> list[Item]:
    """A searchPosts response into Items, linked to the post on bsky.app."""
    out = []
    for p in json.loads(json_text).get("posts", []):
        handle = p.get("author", {}).get("handle", "")
        rkey = p.get("uri", "").rsplit("/", 1)[-1]
        rec = p.get("record", {})
        when = rec.get("createdAt") or p.get("indexedAt") or ""
        try:
            created = _ts(when)
        except ValueError:
            created = 0.0
        out.append(Item(id=f"bluesky:{p.get('uri', '')}", source="bluesky", where="Bluesky", author=handle,
                        thread="", text=rec.get("text", ""), url=f"https://bsky.app/profile/{handle}/post/{rkey}",
                        created=created))
    return out


def _http_get(url: str) -> str:
    """GET with our name on it. One retry after a 429, because Reddit throttles keyless reads."""
    for attempt in (0, 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=12) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt:
                raise
            time.sleep(3)
    raise AssertionError("unreachable")


def feeds() -> list[tuple[str, str, Callable[[str], list[Item]]]]:
    """Every (label, url, parser) the radar reads."""
    out = [(label, f"https://www.reddit.com/r/{subs}/{kind}/.rss?limit=100", parse_reddit)
           for label, subs, kind in REDDIT_FEEDS]
    for q in BLUESKY_QUERIES:
        qs = urllib.parse.urlencode({"q": q, "sort": "latest", "limit": 50})
        out.append((f"Bluesky {q}", f"https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?{qs}", parse_bluesky))
    return out


def _dupe_key(item: Item) -> str:
    """The same question cross-posted to two subs is one row."""
    return item.author.lower() + "|" + re.sub(r"\W+", "", item.text.lower())[:120]


def scan(fetch: Fetch = _http_get, now: float | None = None) -> dict:
    """Read every feed in parallel. A feed that fails is reported, never fatal."""
    now = now or time.time()
    sources, seen, items = [], set(), []

    def one(feed):
        label, url, parser = feed
        try:
            return label, parser(fetch(url)), None
        except Exception as e:  # noqa: BLE001 -- one dead feed must not blank the page
            return label, [], f"{type(e).__name__}: {e}"[:160]

    reddit = [f for f in feeds() if "reddit.com" in f[1]]
    others = [f for f in feeds() if "reddit.com" not in f[1]]
    with ThreadPoolExecutor(max_workers=6) as pool:
        pending = pool.map(one, others)
        results = [one(f) for f in reddit] + list(pending)
    for label, got, err in results:
        kept = 0
        for it in got:
            key = _dupe_key(it)
            if it.id in seen or key in seen or not keep(it, now):
                continue
            seen.update((it.id, key))
            items.append(it)
            kept += 1
        sources.append({"name": label, "ok": err is None, "count": kept, "error": err})
    items.sort(key=lambda i: i.created, reverse=True)
    return {"fetched_at": now, "items": [asdict(i) for i in items], "sources": sources}


_CACHE: dict = {}


def cached_scan(fresh: bool = False, fetch: Fetch = _http_get) -> dict:
    """`scan`, held for CACHE_S. `fresh` skips the cache but never more than once a minute."""
    now = time.time()
    age = now - _CACHE.get("fetched_at", 0)
    if _CACHE and (age < CACHE_S and not (fresh and age > 60)):
        return _CACHE
    _CACHE.clear()
    _CACHE.update(scan(fetch, now))
    return _CACHE
