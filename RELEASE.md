# How to release to VSCE

When you have a clean `main` branch that you'd like to release, do the following steps:
- `npm version <major|minor|patch> -m 'release: bump version'`
- make a PR
- get the PR merged
- push the tag
- use the release-flow on github to release the new tagged version
- verify that the new version is on vsce, and that it works
- success!
