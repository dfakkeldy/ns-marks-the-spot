import tempfile
import unittest
from pathlib import Path

from prepare_review import ordered_queues


class ReviewQueueTests(unittest.TestCase):
    def test_two_digit_batches_follow_numeric_series_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for number in [11, 2, 10, 1, 9]:
                batch = root / f'batch{number}'
                batch.mkdir()
                (batch / 'queue.json').write_text('{"sheets": []}')
            self.assertEqual(
                [path.parent.name for path in ordered_queues(root)],
                ['batch1', 'batch2', 'batch9', 'batch10', 'batch11'],
            )


if __name__ == '__main__':
    unittest.main()
