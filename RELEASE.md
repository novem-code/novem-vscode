# How to release to VSCE

When you have a clean `main` branch that you'd like to release:

1. Go to GitHub → Releases → "Draft a new release"
2. Choose/create a tag like `v1.2.3` (semantic versioning)
3. Add release title and notes
4. Click "Publish release"
5. The workflow will automatically:
   - Extract version from tag
   - Bump `package.json` version
   - Commit and push changes to main
   - Publish to VS Code Marketplace
   - Send Discord notification
6. Verify the new version on VSCE
7. Success! 🚀