# ldomenichelli.github.io
My personal website at https://ldomenichelli.github.io/

## Why GitHub can show one page version while the site shows another
For a `username.github.io` repo, GitHub Pages serves the **default branch root** (usually `main`) unless you configured a different source in Settings.

In this repository there are two copies of many pages:
- root copy (for example `about/index.html`, `projects/index.html`)
- `public/` copy (for example `public/about/index.html`, `public/projects/index.html`)

If one copy is updated and the other is not, you may see "different" About/Projects versions depending on what source Pages is using.

## How to publish the exact files you want
### 1) Decide your Pages source
Open: **GitHub → Settings → Pages** and check **Build and deployment → Source**.
- If source is `Deploy from a branch` + branch root: update root files.
- If source is `/public` (or a workflow deploys `public/`): update `public/` files.

### 2) If your desired page is on another branch, bring it into the current branch
Example (replace branch name):

```bash
git fetch origin
# inspect file on branch
# git show origin/<branch>:projects/intrinsic-dimensionality/index.html

# copy specific files from that branch
# git checkout origin/<branch> -- about/index.html projects/index.html projects/intrinsic-dimensionality/index.html
```

Then sync to `public/` if needed:

```bash
mkdir -p public/projects/intrinsic-dimensionality
cp about/index.html public/about/index.html
cp projects/index.html public/projects/index.html
cp projects/intrinsic-dimensionality/index.html public/projects/intrinsic-dimensionality/index.html
```

### 3) Commit and push
```bash
git add about/index.html projects/index.html projects/intrinsic-dimensionality/index.html public/about/index.html public/projects/index.html public/projects/intrinsic-dimensionality/index.html
git commit -m "Sync About and Projects pages from selected branch"
git push
```

### 4) Verify quickly
```bash
python3 -m http.server 4173
# open http://127.0.0.1:4173/projects/
# open http://127.0.0.1:4173/public/projects/
```

If you want, I can also add a small script to automate this sync so branch mistakes are less likely.
