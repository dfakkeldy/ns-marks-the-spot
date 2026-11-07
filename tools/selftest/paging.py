"""Paging for the parcel list: how many pages, and which records go on a page."""


def page_count(total_items, page_size):
    """Number of pages needed to show total_items records, page_size per page."""
    if page_size <= 0:
        raise ValueError("page_size must be positive")
    return -(-total_items // page_size)


def page(records, number, page_size):
    """The records on page `number` (1-based)."""
    start = (number - 1) * page_size
    return records[start:start + page_size]
