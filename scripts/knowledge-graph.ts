#!/usr/bin/env npx tsx
/**
 * Knowledge Graph — treats .knowledge/ as a graph database.
 *
 * Nodes: every .md file in .knowledge/ and every folder CLAUDE.md
 * Edges: typed relationships (REFERENCES, ENFORCED_BY, SCOPES, etc.)
 *
 * Supports queries like:
 *   npx tsx scripts/knowledge-graph.ts orphans        # nodes with no incoming edges
 *   npx tsx scripts/knowledge-graph.ts unreferenced   # policies no CLAUDE.md points to
 *   npx tsx scripts/knowledge-graph.ts unenforced     # policies with no structural test
 *   npx tsx scripts/knowledge-graph.ts impact <file>  # what's affected if this file changes
 *   npx tsx scripts/knowledge-graph.ts deps <file>    # what this file depends on
 *   npx tsx scripts/knowledge-graph.ts stats          # graph statistics
 *   npx tsx scripts/knowledge-graph.ts visualize      # output DOT format for graphviz
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';

const ROOT = resolve(__dirname, '..');
const KNOWLEDGE_DIR = resolve(ROOT, '.knowledge');

// ── Node types (labels in graph DB terms) ──

type NodeType = 'policy' | 'model' | 'template' | 'pattern' | 'rubric' | 'folder-claude' | 'test' | 'operational';

interface Node {
  id: string;           // relative path from .knowledge/ or project root
  type: NodeType;
  name: string;         // human-readable name
  scope?: string[];     // directories this governs (for policies)
  enforcement?: string; // test file (for policies)
}

// ── Edge types ──

type EdgeType =
  | 'REFERENCES'     // knowledge file mentions another knowledge file
  | 'REFERENCED_BY'  // folder CLAUDE.md points to a knowledge file (See:)
  | 'ENFORCED_BY'    // policy is enforced by a structural test
  | 'SCOPES'         // policy governs a directory
  | 'MATCHES'        // template matches a rubric
  | 'FOLLOWS'        // pattern references a policy
  | 'EVALUATED_BY';  // template evaluated by rubric

interface Edge {
  from: string;  // node id
  to: string;    // node id
  type: EdgeType;
}

// ── Build the graph ──

function buildGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!existsSync(KNOWLEDGE_DIR)) {
    return { nodes, edges };
  }

  // Collect knowledge files as nodes
  function walkKnowledge(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walkKnowledge(full);
      } else if (entry.endsWith('.md') && !['README.md', 'index.md', 'ENGINE-TYPES.md', 'architecture-diagram.md'].includes(entry)) {
        const relPath = relative(KNOWLEDGE_DIR, full);
        const type = inferNodeType(relPath);
        const content = readFileSync(full, 'utf-8');

        const node: Node = {
          id: relPath,
          type,
          name: entry.replace('.md', ''),
        };

        // Extract scope from policies
        const scopeMatch = content.match(/## Scope\n([^#]*)/);
        if (scopeMatch) {
          node.scope = scopeMatch[1].trim().split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        }

        // Extract enforcement from policies
        const enfMatch = content.match(/## Enforcement\n([^#]*)/);
        if (enfMatch) {
          const testFile = enfMatch[1].match(/`([^`]+\.test\.ts)`/);
          if (testFile) node.enforcement = testFile[1];
        }

        nodes.push(node);

        // Extract cross-references (edges)
        const refs = content.matchAll(/\.knowledge\/([a-zA-Z0-9/_.-]+\.md)/g);
        for (const ref of refs) {
          if (ref[1] !== relPath) {
            edges.push({ from: relPath, to: ref[1], type: 'REFERENCES' });
          }
        }

        // Extract rubric matches from templates
        const rubricMatch = content.match(/Matching rubric.*`\.knowledge\/([^`]+)`/);
        if (rubricMatch) {
          edges.push({ from: relPath, to: rubricMatch[1], type: 'MATCHES' });
        }
      }
    }
  }
  walkKnowledge(KNOWLEDGE_DIR);

  // Collect folder CLAUDE.md references as edges
  // Walk common source directories — customize for your project
  function walkSource(dir: string) {
    const claudeMd = join(dir, 'CLAUDE.md');
    if (existsSync(claudeMd)) {
      const content = readFileSync(claudeMd, 'utf-8');
      const folderPath = relative(ROOT, dir);
      const folderId = `folder:${folderPath}`;

      nodes.push({
        id: folderId,
        type: 'folder-claude',
        name: folderPath,
      });

      const seeRefs = content.matchAll(/See:\s*\.knowledge\/([^\s]+)/g);
      for (const ref of seeRefs) {
        edges.push({ from: folderId, to: ref[1], type: 'REFERENCED_BY' });
      }
    }

    for (const entry of readdirSync(dir)) {
      if (['node_modules', '.git', '__screenshots__', 'build', 'dist', 'vendor'].includes(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkSource(full);
    }
  }

  // Walk directories that might contain folder CLAUDE.md files
  // Customize this list for your project structure
  for (const d of ['src', 'lib', 'app', 'e2e', '__tests__', 'test', 'tests']) {
    const dir = resolve(ROOT, d);
    if (existsSync(dir)) walkSource(dir);
  }

  // Add enforcement edges for policies
  for (const node of nodes) {
    if (node.enforcement) {
      edges.push({ from: node.id, to: `test:${node.enforcement}`, type: 'ENFORCED_BY' });
    }
    if (node.scope) {
      for (const s of node.scope) {
        edges.push({ from: node.id, to: `scope:${s}`, type: 'SCOPES' });
      }
    }
  }

  return { nodes, edges };
}

function inferNodeType(path: string): NodeType {
  if (path.startsWith('policies/')) return 'policy';
  if (path.startsWith('models/')) return 'model';
  if (path.startsWith('templates/')) return 'template';
  if (path.startsWith('patterns/')) return 'pattern';
  if (path.startsWith('rubrics/')) return 'rubric';
  if (path === 'gaps.md') return 'operational';
  return 'model';
}

// ── Queries ──

function queryOrphans(nodes: Node[], edges: Edge[]): Node[] {
  const hasIncoming = new Set(edges.map(e => e.to));
  return nodes.filter(n =>
    n.type !== 'folder-claude' &&
    n.type !== 'operational' &&
    n.type !== 'template' &&
    n.type !== 'pattern' &&
    n.type !== 'rubric' &&
    !hasIncoming.has(n.id)
  );
}

function queryUnreferenced(nodes: Node[], edges: Edge[]): Node[] {
  const referencedByFolder = new Set(
    edges.filter(e => e.type === 'REFERENCED_BY').map(e => e.to)
  );
  return nodes.filter(n =>
    (n.type === 'policy' || n.type === 'model') &&
    !referencedByFolder.has(n.id)
  );
}

function queryUnenforced(nodes: Node[]): Node[] {
  return nodes.filter(n => n.type === 'policy' && !n.enforcement);
}

function queryImpact(nodeId: string, nodes: Node[], edges: Edge[]): string[] {
  const affected = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of edges) {
      if (edge.to === current && !affected.has(edge.from)) {
        affected.add(edge.from);
        queue.push(edge.from);
      }
    }
  }

  return [...affected];
}

function queryDeps(nodeId: string, edges: Edge[]): string[] {
  return edges.filter(e => e.from === nodeId).map(e => `──[${e.type}]──→ ${e.to}`);
}

function queryStats(nodes: Node[], edges: Edge[]) {
  const byType = new Map<string, number>();
  for (const n of nodes) byType.set(n.type, (byType.get(n.type) || 0) + 1);

  const byEdgeType = new Map<string, number>();
  for (const e of edges) byEdgeType.set(e.type, (byEdgeType.get(e.type) || 0) + 1);

  return { byType, byEdgeType, totalNodes: nodes.length, totalEdges: edges.length };
}

function visualize(nodes: Node[], edges: Edge[]): string {
  const lines: string[] = ['digraph KnowledgeGraph {', '  rankdir=LR;', '  node [shape=box, style=rounded];', ''];

  const colors: Record<string, string> = {
    policy: '#FF6B6B',
    model: '#4ECDC4',
    template: '#95E1D3',
    pattern: '#F38181',
    rubric: '#FCE38A',
    'folder-claude': '#EAEAEA',
    operational: '#FFEAA7',
  };

  for (const node of nodes) {
    if (node.type === 'folder-claude') continue;
    const color = colors[node.type] || '#FFFFFF';
    const label = node.name.length > 25 ? node.name.slice(0, 22) + '...' : node.name;
    lines.push(`  "${node.id}" [label="${label}", fillcolor="${color}", style="filled,rounded"];`);
  }

  lines.push('');

  for (const edge of edges) {
    if (edge.from.startsWith('folder:') || edge.to.startsWith('scope:') || edge.to.startsWith('test:')) continue;
    const style = edge.type === 'ENFORCED_BY' ? 'dashed' : 'solid';
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.type}", style=${style}];`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Main ──

const { nodes, edges } = buildGraph();
const command = process.argv[2] || 'stats';
const arg = process.argv[3];

switch (command) {
  case 'orphans': {
    const orphans = queryOrphans(nodes, edges);
    if (orphans.length === 0) console.log('No orphaned nodes.');
    else orphans.forEach(o => console.log(`  ${o.type}: ${o.id}`));
    break;
  }
  case 'unreferenced': {
    const unref = queryUnreferenced(nodes, edges);
    if (unref.length === 0) console.log('All policies/models referenced by folder CLAUDE.md.');
    else unref.forEach(u => console.log(`  ${u.type}: ${u.id}`));
    break;
  }
  case 'unenforced': {
    const unenf = queryUnenforced(nodes);
    if (unenf.length === 0) console.log('All policies have enforcement tests.');
    else unenf.forEach(u => console.log(`  ${u.id} — no ## Enforcement section with test reference`));
    break;
  }
  case 'impact': {
    if (!arg) { console.log('Usage: knowledge-graph.ts impact <file.md>'); break; }
    const affected = queryImpact(arg, nodes, edges);
    if (affected.length === 0) console.log('No nodes reference this file.');
    else {
      console.log(`Changing ${arg} affects:`);
      affected.forEach(a => console.log(`  ${a}`));
    }
    break;
  }
  case 'deps': {
    if (!arg) { console.log('Usage: knowledge-graph.ts deps <file.md>'); break; }
    const deps = queryDeps(arg, edges);
    if (deps.length === 0) console.log('No outgoing edges.');
    else deps.forEach(d => console.log(`  ${d}`));
    break;
  }
  case 'stats': {
    const stats = queryStats(nodes, edges);
    console.log(`Knowledge Graph Statistics:`);
    console.log(`  Nodes: ${stats.totalNodes}`);
    console.log(`  Edges: ${stats.totalEdges}`);
    console.log('');
    console.log('  By node type:');
    for (const [type, count] of stats.byType) console.log(`    ${type}: ${count}`);
    console.log('');
    console.log('  By edge type:');
    for (const [type, count] of stats.byEdgeType) console.log(`    ${type}: ${count}`);
    break;
  }
  case 'visualize': {
    console.log(visualize(nodes, edges));
    break;
  }
  default:
    console.log('Commands: stats, orphans, unreferenced, unenforced, impact <file>, deps <file>, visualize');
}
