def score_pct(passed: int, total: int) -> int:
    if total <= 0:
        return 0
    return round(passed * 100 / total)


def passed_bar(score: int, bar: int = 100) -> bool:
    """Checkpoint unlock bar defaults to 100%. Fail keeps 30% but no unlock."""
    return score >= bar
