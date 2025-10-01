# Deployment

This project uses GitHub Actions to build and publish the Vite app to GitHub Pages. The workflow lives at `.github/workflows/deploy.yml` and runs on pushes to the `main` branch or when triggered manually.

## How it works

1. Checks out the repository and configures GitHub Pages.
2. Installs dependencies with `npm ci` and builds the project. The workflow automatically derives the correct `--base` path for Vite depending on the repository name.
3. Uploads the contents of `dist/` as a Pages artifact and deploys it to the `github-pages` environment.

## First-time setup

1. Visit the repository's **Settings → Pages** screen.
2. Choose **GitHub Actions** as the deployment source. The next successful workflow run will publish the site.
