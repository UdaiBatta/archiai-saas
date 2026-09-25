"""Vastu opt-in detection.

Vastu rules only apply when the user explicitly asks for them. Scoring lives
in ``app.services.quality.vastu``; this module only detects the request.
"""

VASTU_TRIGGER_KEYWORDS: tuple[str, ...] = (
    "vastu", "vaastu", "vastu shastra", "vastu compliant", "vastu friendly",
    "vastu approved", "as per vastu", "according to vastu",
    "vastu based", "vastu layout",
)


def is_vastu_requested(prompt: str) -> bool:
    text = prompt.lower()
    return any(kw in text for kw in VASTU_TRIGGER_KEYWORDS)
