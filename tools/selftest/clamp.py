"""Keep a map opacity slider value in range."""


def clamp_opacity(value):
    """value limited to 0.0..1.0; None means fully opaque."""
    if value is None:
        return 1.0
    return min(1.0, max(0.0, float(value)))
