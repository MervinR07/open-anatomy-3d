// Publish demo/dist to the gh-pages branch (GitHub Pages) without touching
// the working tree: stage the folder into a throwaway index, write a tree,
// wrap it in a parentless commit and force-push it. Uses this repo's own
// remote and credentials. Run via: npm run demo:deploy
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const dist = path.resolve('demo/dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('demo/dist is missing — run npm run demo:build')
fs.writeFileSync(path.join(dist, '.nojekyll'), '')

const index = path.join(os.tmpdir(), `oa3d-pages-${process.pid}.index`)
const env = { ...process.env, GIT_INDEX_FILE: index }
const git = cmd => execSync(`git ${cmd}`, { env, encoding: 'utf8' }).trim()
try {
  git(`--work-tree="${dist}" add -A -f .`)
  const tree = git('write-tree')
  const head = git('rev-parse --short HEAD')
  const commit = git(`commit-tree ${tree} -m "Deploy demo from ${head}"`)
  execSync(`git push -f origin ${commit}:refs/heads/gh-pages`, { stdio: 'inherit' })
  console.log(`Deployed ${commit.slice(0, 7)} to gh-pages`)
} finally {
  fs.rmSync(index, { force: true })
}
