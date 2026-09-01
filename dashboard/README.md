# Landslide AI

JavaScript/Next.js version of the NER landslide early-warning dashboard.

## Run

From the repository root, run:

```powershell
cd dashboard
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000.

The app also provides these API routes:

- `/api/alerts` — risk list for monitored NER cities
- `/api/predict?lat=26.14&lon=91.73&month=7` — risk prediction

Use `npm.cmd` instead of `npm`: the local PowerShell execution policy blocks `npm.ps1`.
