The project scroll regression uses only a fresh local SQLite fixture. It creates 60 eligible synthetic projects and rejects an existing output database. It never connects to a hosted database or calls an AI provider.

Run the seed once:

```sh
PORTAL_QA_DB=/tmp/ddd-project-scroll-qa/fixture.sqlite node --import tsx tests/browser/seed-project-scroll.mts
```

Start the local backend and frontend in separate terminals, using a clean environment with these synthetic values:

```sh
NODE_ENV=development PORTAL_LOCAL_TEST=1 PORTAL_LOCAL_DB=/tmp/ddd-project-scroll-qa/fixture.sqlite PORTAL_LOCAL_API_PORT=8890 APP_ORIGIN=http://localhost:3030 node --import tsx neon/local-server.ts
```

```sh
NODE_ENV=development PORTAL_LOCAL_TEST=1 NEON_API_ORIGIN=http://127.0.0.1:8890 PORTAL_PROXY_SECRET=LOCAL_REHEARSAL_PROXY_ONLY_32_CHARACTERS APP_ORIGIN=http://localhost:3030 node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3030
```

Then run:

```sh
node tests/browser/project-scroll.mjs
```

The browser runner accepts only loopback origins. Its screenshots and JSON report stay under `/tmp/ddd-project-scroll-qa/screenshots`, or the directory in `PORTAL_QA_OUTPUT`. It checks desktop/mobile append order, duplicate request prevention, failed-page retry, exhausted feeds, immediate upvotes and persistence, failed-vote recovery, stale search cancellation, fresh search reset, keyboard fallback, unchanged leaderboard pagination, People pagination, a 320px project detail, and disabled Viewer voting. A small number of synthetic upvotes are committed in the local fixture.

The release changes only frontend interaction and shared client pagination. It uses the existing 24-project page API and public vote projection. No backend endpoint, schema, scoring rule or submission-attempt rule changes.
