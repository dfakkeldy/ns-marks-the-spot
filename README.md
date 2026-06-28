# NS Marks The Spot

Open-source iOS map app for overlaying georeferenced historical Nova Scotia maps on modern maps.

## Release Engineering - Promotion Ladder

This repository uses a one-way promotion ladder:

`feature/* -> nightly -> weekly -> main`

- `main` remains the GitHub default branch and represents stable releases.
- Feature work branches from `nightly`; feature PRs target `nightly`.
- `nightly` is the integration branch and feeds daily TestFlight builds.
- `weekly` is promoted from `nightly` and feeds Monday beta TestFlight builds.
- `main` is promoted only from `weekly`; tagging `vX.Y.Z` cuts the App Store release.
- Hotfix exception: branch from `main`, PR to `main`, then merge `main` back down into `weekly` and `nightly`.

| Branch | Required Approvals | Required Check | Strict | Intended Source |
| --- | --- | --- | --- | --- |
| `main` | 0 | `Build gate + tests` | Yes | `weekly`, or `hotfix/*` |
| `weekly` | 0 | `Build gate + tests` | Yes | `nightly`, or `main` for hotfix back-merge |
| `nightly` | 0 | `Build gate + tests` | No | `feature/*` and integration branches |

All protected branches require PRs to pass `Build gate + tests`; none require review approval because this is a single-maintainer project.

Release train uploads require these GitHub Actions secrets:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`
