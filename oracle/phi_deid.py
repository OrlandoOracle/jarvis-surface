#!/usr/bin/env python3
"""phi_deid — the de-id gate for the JARVIS PHI value-engine (jarvis-phi-oracle Unit 2).

This is the SECOND of the two enforcement layers the project decided on (the first is
structural: raw values live only in a subprocess whose stdout is redirected to an
Oracle-local file, never returned into a Claude tool result). This layer sits on any
path that DOES carry text back toward Claude's context and proves it clean.

The detector patterns are lifted deliberately from `~/Deborah/00-System/bin/phi-guard`
— the same classes that gate the git boundary gate the LLM boundary, so a value that
phi-guard would refuse to commit is a value this gate refuses to emit. Kept as its own
module (stdlib only) so the engine and its tests import one source of truth.

Two entry points:
  * is_clean(text)  -> True only when NO identifier shape is present. Used fail-closed:
                       a line the gate cannot prove clean is never emitted.
  * redact(text)    -> the same text with every identifier shape masked. Used where a
                       shape IS expected (a de-id'd sample) and masking is the point.

The asymmetry is intentional. `is_clean` is the gate (drop on any doubt); `redact` is
the cosmetic pass for output that is allowed to mention that a value existed without
naming it.
"""
import re

# Hard identifier shapes — a hit is PHI, full stop. Ported from phi-guard HARD, same
# intent. AFHC/Oracle own-domain emails are NOT PHI (they are the business's own
# addresses), matching phi-guard's negative lookahead.
HARD = [
    ("us-phone",   re.compile(r"(?:\+1[-. ]?)?\(?\b[2-9]\d{2}\)?[-. ]\d{3}[-. ]\d{4}\b")),
    ("e164",       re.compile(r"\+1\d{10}\b")),
    ("ssn",        re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("email",      re.compile(
        r"\b[\w.+-]+@(?!americafirsthealthcare\.com|orlandooracle\.com)"
        r"(?!\d{1,3}(?:\.\d{1,3}){3}\b)[\w-]+\.[\w.]{2,}\b")),
    ("dob",        re.compile(r"\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b")),
    ("member-id",  re.compile(r"\b(?:member|policy|subscriber)\s*(?:id|#|number)\s*[:=]?\s*\S{6,}", re.I)),
]

# A GHL contact id is a 20-char token. On its own it is a SOFT hit for phi-guard (a
# bare opaque id is not itself a name), but a de-id'd SAMPLE that leaks contact ids is
# a re-identification handle, so this gate treats it as dirty too — fail-closed is the
# whole posture here.
CONTACT_ID = re.compile(r"\b[A-Za-z0-9]{20}\b")

ALL = HARD + [("ghl-contact-id", CONTACT_ID)]


def hits(text):
    """Every (class, matched-substring) in `text`. Empty list == provably clean."""
    if not text:
        return []
    found = []
    for name, rx in ALL:
        for m in rx.finditer(text):
            found.append((name, m.group(0)))
    return found


def is_clean(text):
    """True only when no identifier shape is present. The gate: a line that is not
    provably clean is dropped, never emitted."""
    return not hits(text)


def redact(text):
    """Mask every identifier shape. For output that is ALLOWED to say a value existed
    without naming it. Longest matches first so an email is not half-masked by the
    phone rule landing inside it."""
    if not text:
        return text
    spans = []
    for name, rx in ALL:
        for m in rx.finditer(text):
            spans.append((m.start(), m.end(), name))
    # Apply right-to-left so earlier offsets stay valid; drop spans nested in a longer one.
    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    out, last_end = text, None
    merged = []
    for s, e, name in spans:
        if merged and s < merged[-1][1]:
            continue  # overlapped by an already-kept (longer/earlier) span
        merged.append((s, e, name))
    for s, e, name in sorted(merged, key=lambda x: x[0], reverse=True):
        out = out[:s] + f"〈{name}〉" + out[e:]
    return out
