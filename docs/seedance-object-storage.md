# Seedance Stable Public Assets

Seedance image-to-video needs public HTTPS URLs for every reference image. Local URLs such as `/library/images/a.png` or `http://localhost:3001/library/images/a.png` are not reachable by the remote model provider.

This project now supports uploading local library assets to public object storage before submitting a Seedance job. Supabase Storage is the recommended low-friction option if you do not want to enable Cloudflare R2 billing.

## Recommended Supabase Storage Setup

1. Create or open a Supabase project.
2. Go to Storage and create a bucket, for example `twitcanva-assets`.
3. Make the bucket public, because Seedance must be able to read the files by URL.
4. Go to Project Settings -> API.
5. Copy the Project URL into `SUPABASE_URL`.
6. Copy the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.
7. Fill these values in `.env`.
8. Restart the backend server.

```env
ASSET_STORAGE_DRIVER=supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_STORAGE_BUCKET=twitcanva-assets
SUPABASE_STORAGE_PUBLIC_BASE_URL=
SUPABASE_UPLOAD_PREFIX=twitcanva/library
```

If `SUPABASE_STORAGE_PUBLIC_BASE_URL` is empty, the backend builds public URLs as:

```text
https://<your-project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
```

Keep `SUPABASE_SERVICE_ROLE_KEY` in the backend `.env` only. Do not put it into frontend code or any `VITE_*` variable.

## Recommended Cloudflare R2 Setup

Use this only if you decide to enable R2 billing later.

1. Create a Cloudflare R2 bucket.
2. Enable a public URL for the bucket, either a custom domain or an `r2.dev` public bucket URL.
3. Create an R2 API token with object read/write permission for that bucket.
4. Fill these values in `.env`.
5. Restart the backend server.

```env
ASSET_STORAGE_DRIVER=s3
ASSET_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
ASSET_S3_REGION=auto
ASSET_S3_BUCKET=<your-r2-bucket>
ASSET_S3_ACCESS_KEY_ID=<your-r2-access-key-id>
ASSET_S3_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
ASSET_S3_PUBLIC_BASE_URL=https://<your-public-r2-domain>
ASSET_UPLOAD_PREFIX=twitcanva/library
ASSET_S3_FORCE_PATH_STYLE=true
```

## How It Works

- Frontend still stores and displays local assets as `/library/images/...`.
- When Seedance receives local references, the backend uploads them to object storage.
- Seedance receives URLs like `https://<your-project-ref>.supabase.co/storage/v1/object/public/twitcanva-assets/twitcanva/library/images/ref.png`.
- Existing public HTTPS references are passed through unchanged.
- If object storage is not configured, the backend falls back to `SEEDANCE_PUBLIC_ASSET_BASE_URL`, which is usually a tunnel URL.

## Why This Fixes Tunnel Failures

Temporary tunnels can close when the process exits, the machine sleeps, the network changes, or the tunnel URL rotates. Object storage keeps the reference files available while the remote Seedance async task is still running.

## Supported Env Aliases

The backend accepts either the generic `ASSET_S3_*` variables above or these aliases:

```env
R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=
R2_UPLOAD_PREFIX=
```
