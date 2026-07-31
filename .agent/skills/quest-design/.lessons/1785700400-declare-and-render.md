---
title: Declaring a library field is not rendering it — the coverage guard passes either way
date: 2026-07-31
---

`QUEST_FIELDS` fails the build on an authored field no page knows about, which
reads as "declare it and you're covered". It isn't. The guard only checks the
KEY is listed; the string beside it is a promise nobody verifies. Adding
`campaign`, `merchant` and `conversation` to the map turned the build green
while the errand pages went on saying nothing about any of them — the precise
silent omission the guard was written to prevent, now wearing its badge.

Caught in review rather than by any check, so treat the declaration as the
START of the work: add the key, then render it, then read the generated page
back as TEXT and find the sentence. Doing that surfaced three more defects the
markup hid — a campaign prerequisite described as "on this same map and to this
same person" (it is the opposite: a campaign chain crosses maps), a
trader-stocked piece described as "what is lying there is the whole supply"
(nothing is lying there; it is bought), and a `reachLevel` row rendering as
`CLIMB — 1`, which says nothing at all.

    python3 -c "import re,html;t=open('pwa/dist/library/errands/<slug>/index.html').read();\
    b=re.sub(r'<(script|style).*?</\1>','',t.split('<main',1)[1],flags=re.S);\
    print(re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',b))))"
