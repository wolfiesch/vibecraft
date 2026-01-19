/**
 * Project Detector
 *
 * Detects project name from various sources:
 * 1. package.json (Node.js projects)
 * 2. pyproject.toml (Python projects)
 * 3. Git remote URL (any git repo)
 * 4. Directory basename (fallback)
 */

import { readFileSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import { basename, join } from 'path'

/** Source of the detected project name */
export type ProjectNameSource = 'package.json' | 'pyproject.toml' | 'git-remote' | 'directory'

/** Result of project detection */
export interface ProjectInfo {
  /** Detected project name */
  name: string
  /** Source of the detected name */
  source: ProjectNameSource
}

/**
 * Detect project name from a directory
 * @param cwd - Directory to analyze
 * @returns Project info with name and source
 */
export async function detectProjectName(cwd: string): Promise<ProjectInfo> {
  // Try package.json first (Node.js projects)
  const packageJsonPath = join(cwd, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const content = readFileSync(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      if (pkg.name && typeof pkg.name === 'string') {
        // Clean up scoped package names (@scope/name -> name)
        const name = pkg.name.startsWith('@')
          ? pkg.name.split('/').pop() || pkg.name
          : pkg.name
        return { name, source: 'package.json' }
      }
    } catch {
      // Ignore parse errors, try next source
    }
  }

  // Try pyproject.toml (Python projects)
  // Note: Using simple regex parsing. For complex TOML with nested tables,
  // consider using a proper TOML parser like @iarna/toml.
  const pyprojectPath = join(cwd, 'pyproject.toml')
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8')

      // First, isolate the [project] section (up to the next section header)
      // Pattern: [project] followed by lines that don't start a new section
      const projectSectionMatch = content.match(/^\[project\](?:\r?\n(?!\[).*)*$/m)
      if (projectSectionMatch) {
        const projectSection = projectSectionMatch[0]
        const projectNameMatch = projectSection.match(/^\s*name\s*=\s*["']([^"']+)["']/m)
        if (projectNameMatch) {
          return { name: projectNameMatch[1], source: 'pyproject.toml' }
        }
      }

      // Next, isolate the [tool.poetry] section and search for name within it
      const poetrySectionMatch = content.match(/^\[tool\.poetry\](?:\r?\n(?!\[).*)*$/m)
      if (poetrySectionMatch) {
        const poetrySection = poetrySectionMatch[0]
        const poetryNameMatch = poetrySection.match(/^\s*name\s*=\s*["']([^"']+)["']/m)
        if (poetryNameMatch) {
          return { name: poetryNameMatch[1], source: 'pyproject.toml' }
        }
      }
    } catch {
      // Ignore parse errors, try next source
    }
  }

  // Try git remote URL
  const gitName = await getGitRemoteName(cwd)
  if (gitName) {
    return { name: gitName, source: 'git-remote' }
  }

  // Fallback to directory basename
  return { name: basename(cwd), source: 'directory' }
}

/**
 * Extract repository name from git remote URL
 * @param cwd - Directory to check
 * @returns Repository name or null
 */
function getGitRemoteName(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd }, (error, stdout) => {
      if (error || !stdout) {
        resolve(null)
        return
      }

      const url = stdout.trim()
      let name: string | null = null

      // Parse different URL formats:
      // - https://github.com/user/repo.git
      // - git@github.com:user/repo.git
      // - https://github.com/user/repo
      // - ssh://git@github.com/user/repo.git

      // Try HTTPS/SSH URL format
      const httpsMatch = url.match(/\/([^/]+?)(\.git)?$/)
      if (httpsMatch) {
        name = httpsMatch[1]
      }

      // Try git@host:user/repo.git format
      if (!name) {
        const sshMatch = url.match(/:([^/]+\/)?([^/]+?)(\.git)?$/)
        if (sshMatch) {
          name = sshMatch[2]
        }
      }

      resolve(name)
    })
  })
}
