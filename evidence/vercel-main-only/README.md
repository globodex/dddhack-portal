# Authorized main-only Vercel Git deployment filter

Main commit `e386cc72244c5613588ec60b02998637a9aadcb7`, parent `696b125f9711a4fd6e02c3ece3adadb18b83cba7`. The user explicitly authorized this one config-only normal push to main. The exact remote SHA and vercel.json were fetched and verified after pushing. Only vercel.json changed; no redesign or form-safety commit was merged. No competing vercel.ts/vercel.toml or prior settings existed.

The config uses **:false and main:true. Official [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration) supports minimatch and enables a branch when any matching rule is true. Eight real minimatch10.2.6 cases passed, including main,feat/foo,fix/client-form-hydration-safety,feat/portal-experience-rework and deeper slash paths. The test dependency was installed only under/tmp; project dependencies/lockfile were not changed. See pattern-tests.json.

The exact config blob was cherry-picked and verified on all nine active work branches before subsequent pushes. branch-updates.json records each SHA and identity check. Other inactive branches and detached before/QA worktrees remain untouched. The isolated local chore/vercel-main-only branch itself already contains the original config commit; it was not pushed as another feature branch.

Both author and committer are Parampreet Singh <rubercuber.30@gmail.com>. No Vercel account operation or existing-deployment deletion occurred. This authorized main push may trigger one production build. Automatic Git deployment filtering does not remove existing deployments. Redesign and security merge approvals remain pending.
