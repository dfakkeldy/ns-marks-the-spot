# Nova Scotia mailing-address lookup

Adapted from Statistics Canada, National Address Register, June 2026.
This does not constitute an endorsement by Statistics Canada of this product.

These generated data files are governed by the **Statistics Canada Open Licence**,
not the repository's MIT software licence:
https://www.statcan.gc.ca/en/terms-conditions/open-licence

Source and user guide:
https://www150.statcan.gc.ca/n1/pub/46-26-0002/462600022022001-eng.htm
https://www150.statcan.gc.ca/n1/pub/46-26-0002/462600022026001-eng.htm

`source.json` records the release, input member SHA-256 checksums, output checksums,
coverage counts and matching policy. The files describe addresses, not residents,
business identities, ownership or delivery guarantees. Do not link these records
for the purpose of identifying people, businesses or organizations.

Reproduce from the web directory:

```sh
python3 scripts/generateMailingAddresses.py
```

The generator downloads only the Nova Scotia address and location members using
HTTP byte ranges, checks ZIP integrity and pinned CSV hashes, and emits deterministic
gzip JSON. Alternatively pass `--addresses` and `--locations` with those CSVs.
There is no Canada Post API, account, key, or fee.

537,686 source addresses yielded 475,729 included records across 13,917 normalized
road keys. 3,112 records lacked a usable building coordinate and 58,845 more lacked
complete mailing fields. The coarser blockface coordinates are never substituted.
An omitted or unmatched address is not evidence that mail cannot be delivered.

The index lists roads and their mailing communities. Street-key shards load on
request; the complete lookup is approximately 17 MB compressed. Source address IDs
are retained. The client requires matching normalized road, civic number, suffix
and unit, and building-to-civic-point distance at most 50 metres. Multiple NAR IDs
remain ambiguous. Postal search additionally requires a unique live civic point;
NAR coordinates never become a selected point, destination or parcel identifier.
