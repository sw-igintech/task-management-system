# Setup Required from User

## Current State

The app works RIGHT NOW without any configuration. Open it with:

```bash
npm run dev
```

All 63 engineering tasks are loaded from localStorage (Mock Mode). You will see a "Mock Mode (localStorage)" badge in the header.

---

## To Enable Supabase (Optional — for team-shared persistence)

### Step 1: Create a Supabase Project

1. Go to https://supabase.com and create a free account
2. Create a new project (note your project URL and anon key)

### Step 2: Run the Schema

In the Supabase SQL Editor, paste and run the contents of:
```
supabase/schema.sql
```

### Step 3: Seed the Database

In the Supabase SQL Editor, paste and run the contents of:
```
supabase/seed.sql
```

This will import all 63 tasks and 5 people.

Alternatively, use the import script:
```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
npx tsx scripts/import_pdf_tasks.ts --import
```

### Step 4: Configure Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key...
```

### Step 5: Restart the Dev Server

```bash
npm run dev
```

The "Mock Mode" badge will disappear and data will be persisted to Supabase.

---

## Finding Your Supabase Credentials

1. Go to your project dashboard at https://app.supabase.com
2. Click "Project Settings" (gear icon in left sidebar)
3. Click "API"
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` folder. Deploy to any static hosting (Vercel, Netlify, GitHub Pages, etc.).

For Vercel/Netlify, set the environment variables in the project settings instead of `.env`.

---

## Import Script

To preview what will be imported:
```bash
npx tsx scripts/import_pdf_tasks.ts --dry-run
```

Output: `scripts/parsed_tasks.json` — the complete parsed task list.
