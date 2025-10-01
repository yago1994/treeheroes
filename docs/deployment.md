# Deployment

This project uses GitHub Actions to build and publish the Vite app to GitHub Pages. The workflow lives at `.github/workflows/deploy.yml` and runs on pushes to the `main` branch or when triggered manually.

## How it works

1. Checks out the repository and configures GitHub Pages.
2. Installs dependencies with `npm ci` and builds the project. Vite is configured with `base: "/treeheroes/"` for production so assets resolve correctly when served under `https://<user>.github.io/treeheroes/`.
3. If you use Google services (Street View/Geocoding), add repo secrets and write a `.env` during the workflow:

   - Secrets (Settings → Secrets and variables → Actions):
     - `VITE_GOOGLE_MAPS_API_KEY`
     - (optional) `VITE_GOOGLE_MAPS_MAP_ID`

   - Example step to write `.env` before the build:

     ```yaml
     - name: Write .env from secrets
       run: |
         echo "VITE_GOOGLE_MAPS_API_KEY=${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}" >> .env
         if [ -n "${{ secrets.VITE_GOOGLE_MAPS_MAP_ID }}" ]; then echo "VITE_GOOGLE_MAPS_MAP_ID=${{ secrets.VITE_GOOGLE_MAPS_MAP_ID }}" >> .env; fi
     ```

4. Uploads the contents of `dist/` as a Pages artifact and deploys it to the `github-pages` environment.

## First-time setup

1. Visit the repository's **Settings → Pages** screen.
2. Choose **GitHub Actions** as the deployment source. The next successful workflow run will publish the site.
