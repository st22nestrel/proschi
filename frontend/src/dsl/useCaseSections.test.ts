import { describe, expect, it } from 'vitest';
import { analyze } from '../sim/analyze';
import { format } from './format';
import { toMermaidSequence } from './mermaid';
import { parse } from './parser';
import { buildSequence, sectionHeadings, sectionedItems, sequenceMessages } from './sequence';
import type { DiagramStep } from './types';

/**
 * `section "Name" { … }` inside a use case (docs/USE-CASES.md, "Sections"):
 * it labels a run of steps, nests, and never changes the steps themselves.
 */

const arch = `runner [Actor]
idp [Auth Service]
api [REST API]
db [PostgreSQL]
runner -> idp
runner -> api
api -> db
`;

const withSections = `${arch}
traffic {
  "Send" 10 rps
}
usecase "Send" {
  section "PRE-REQUEST" {
    section "root.yml before-request" {
      runner -> runner : Mutation guard
      runner -> idp : POST /token
      idp --> runner : 200
    }
    section "folder.yml before-request" {
      runner -> runner : Set runId
    }
  }
  section "REQUEST" {
    runner -> api : POST /orders
    par {
      api -> db : INSERT order
      api -> db : INSERT audit
    }
    alt "Created" {
      section "Response" {
        api --> runner : 201
      }
    } alt "Rejected" {
      api --> runner : 400
    }
  }
  runner -> runner : Report
}
`;

/** The same document without its section lines (each `section … {` and its `}`). */
function withoutSections(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  const stack: boolean[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^section\b.*\{$/.test(t)) {
      stack.push(true);
      continue;
    }
    if (t.startsWith('}')) {
      const wasSection = stack.pop();
      if (t.endsWith('{')) stack.push(false);
      if (wasSection) continue;
    } else if (t.endsWith('{')) stack.push(false);
    out.push(line);
  }
  return out.join('\n');
}

const names = (step: DiagramStep) => (step.sections ?? []).map((s) => s.name);
/** Steps as the simulation sees them: everything but where they are written. */
const WHERE = new Set(['loc', 'responseLoc', 'sections', 'responseSections']);
const meaning = (steps: DiagramStep[]) => steps.map((step) => Object.fromEntries(Object.entries(step).filter(([key]) => !WHERE.has(key))));

describe('use case sections', () => {
  it('labels each step with the sections around it, outermost first', () => {
    const { diagram, diagnostics } = parse(withSections);
    expect(diagnostics).toEqual([]);
    const [created, rejected] = diagram.useCases[0].scenarios;
    expect(created.steps.map((s) => [s.stepOrder + 1, s.stepName, names(s)])).toEqual([
      [1, 'Mutation guard', ['PRE-REQUEST', 'root.yml before-request']],
      [2, 'POST /token', ['PRE-REQUEST', 'root.yml before-request']],
      [3, 'Set runId', ['PRE-REQUEST', 'folder.yml before-request']],
      [4, 'POST /orders', ['REQUEST']],
      [5, 'INSERT order', ['REQUEST']],
      [6, 'INSERT audit', ['REQUEST']],
      [7, 'Report', []],
    ]);
    expect(created.steps[6].sections).toBeUndefined();
    // The 201 is written in a section of its own; the 400 in the request's section.
    expect(created.steps[3].responseSections?.map((s) => s.name)).toEqual(['REQUEST', 'Response']);
    expect(rejected.steps[3].statusCode).toBe(400);
    expect(rejected.steps[3].responseSections).toBeUndefined();
  });

  it('changes neither the steps, their numbers, the scenarios nor the simulation', () => {
    const plain = parse(withoutSections(withSections));
    const sectioned = parse(withSections);
    expect(plain.diagnostics).toEqual([]);
    expect(withoutSections(withSections)).not.toContain('section');
    const scenarios = (d: typeof plain) => d.diagram.useCases[0].scenarios.map((s) => ({ ...s, loc: undefined, steps: meaning(s.steps) }));
    expect(scenarios(sectioned)).toEqual(scenarios(plain));
    const strip = (a: ReturnType<typeof analyze>) => JSON.parse(JSON.stringify(a, (k, v) => (WHERE.has(k) ? undefined : v)));
    expect(strip(analyze(sectioned.diagram))).toEqual(strip(analyze(plain.diagram)));
  });

  it('keeps alt sets in different sections apart', () => {
    const source = `${arch}
usecase "U" {
  section "A" {
    alt "a1" {
      runner -> api : GET /a
    } alt "a2" {
      runner -> api : GET /b
    }
  }
  section "B" {
    alt "b1" {
      runner -> api : GET /c
    }
  }
}
`;
    const { diagram, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    // Two sets, so 2 × 1 scenarios, not one set of three alternatives.
    expect(diagram.useCases[0].scenarios.map((s) => s.name)).toEqual(['a1 › b1', 'a2 › b1']);
  });

  it('may hold alt and par blocks and sit inside an alt', () => {
    const source = `${arch}
usecase "U" {
  alt "Happy" {
    section "Outer" {
      section "Inner" {
        par {
          runner -> api : GET /a
          runner -> idp : GET /b
        }
      }
    }
  }
}
`;
    const { diagram, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    expect(diagram.useCases[0].steps.map(names)).toEqual([
      ['Outer', 'Inner'],
      ['Outer', 'Inner'],
    ]);
    expect(diagram.useCases[0].steps.every((s) => s.isParallel)).toBe(true);
  });

  it('reports misplaced and malformed sections', () => {
    const errors = (source: string) => parse(source).diagnostics.map((d) => `${d.line}: ${d.severity}: ${d.message}`);
    expect(errors(`${arch}section "Top" {\n  runner -> api\n}\n`)).toEqual(['8: error: section is only allowed inside a usecase']);
    expect(errors(`${arch}usecase "U" {\n  par {\n    section "S" {\n      runner -> api : GET /x\n    }\n  }\n}\n`)).toEqual([
      '10: error: section blocks cannot be inside a par block; put the par block inside the section',
    ]);
    expect(errors(`${arch}usecase "U" {\n  section "" {\n    runner -> api : GET /x\n  }\n}\n`)).toEqual(['9: error: A section needs a name, e.g. section "Auth" {']);
    expect(errors(`${arch}usecase "U" {\n  section "S" "more" {\n    runner -> api : GET /x\n  }\n}\n`)).toEqual([
      `9: error: Unexpected string "more"; write section "Name" {`,
    ]);
    expect(errors(`${arch}usecase "U" {\n  section "Empty" {\n  }\n  runner -> api : GET /x\n}\n`)).toEqual(["9: warning: Section 'Empty' has no steps"]);
    expect(errors(`${arch}usecase "U" {\n  section "Open" {\n    runner -> api : GET /x\n`)).toEqual(["8: error: Missing } to close usecase 'U'", "9: error: Missing } to close section 'Open'"]);
  });

  it('still lets a node be called section', () => {
    const { diagram, diagnostics } = parse('section [Service]\napi [REST API]\nsection -> api\nusecase "U" {\n  section -> api : GET /x\n}\n');
    expect(diagnostics).toEqual([]);
    expect(diagram.useCases[0].steps[0].fromServiceId).toBe('section');
  });

  it('survives proschi fmt', () => {
    const messy = withSections.replace(/^ +/gm, '').replace('section "REQUEST" {', 'section   "REQUEST"   {');
    const formatted = format(messy);
    expect(formatted).toBe(format(withSections));
    expect(format(formatted)).toBe(formatted);
    expect(formatted).toContain('  section "PRE-REQUEST" {\n    section "root.yml before-request" {\n      runner -> runner : Mutation guard');
    expect(meaning(parse(formatted).diagram.useCases[0].steps)).toEqual(meaning(parse(withSections).diagram.useCases[0].steps));
  });
});

describe('sections in sequences', () => {
  const { diagram } = parse(withSections);
  const useCase = diagram.useCases[0];
  const sequence = buildSequence(useCase, useCase.scenarios[0], diagram.nodes);

  it('opens and closes frames around runs of messages, nested as written', () => {
    const events = sectionedItems(sequence.items).map((e) =>
      e.kind === 'item' ? (e.item.kind === 'par' ? `${e.depth}:par` : `${e.depth}:${e.item.message.number}${e.item.message.kind === 'response' ? 'r' : ''}`) : `${e.kind} ${e.section.name}`,
    );
    expect(events).toEqual([
      'open PRE-REQUEST',
      'open root.yml before-request',
      '2:1',
      '2:2',
      '2:2r',
      'close root.yml before-request',
      'open folder.yml before-request',
      '2:3',
      'close folder.yml before-request',
      'close PRE-REQUEST',
      'open REQUEST',
      '1:4',
      '1:par',
      'open Response',
      '2:4r',
      'close Response',
      'close REQUEST',
      '0:7',
    ]);
  });

  it('heads message lists with the section path where it changes', () => {
    const messages = sequenceMessages(sequence.items);
    expect(sectionHeadings(messages)).toEqual([
      'PRE-REQUEST › root.yml before-request',
      undefined,
      undefined,
      'PRE-REQUEST › folder.yml before-request',
      'REQUEST',
      undefined,
      undefined,
      'REQUEST › Response',
      undefined,
    ]);
  });

  it('exports sections to Mermaid as rect blocks with a note', () => {
    expect(toMermaidSequence(diagram, useCase.id, useCase.scenarios[0].id)).toContain(
      [
        '  rect rgba(127, 127, 127, 0.1)',
        '    Note over runner,idp: PRE-REQUEST',
        '    rect rgba(127, 127, 127, 0.1)',
        '      Note over runner,idp: root.yml before-request',
        '      runner->>runner: Mutation guard',
        '      runner->>idp: POST /token',
        '      idp-->>runner: 200',
        '    end',
        '    rect rgba(127, 127, 127, 0.1)',
        '      Note over runner: folder.yml before-request',
        '      runner->>runner: Set runId',
        '    end',
        '  end',
        '  rect rgba(127, 127, 127, 0.1)',
        '    Note over runner,db: REQUEST',
        '    runner->>api: POST /orders',
        '    par',
        '      api->>db: INSERT order',
        '    and',
        '      api->>db: INSERT audit',
        '    end',
        '    rect rgba(127, 127, 127, 0.1)',
        '      Note over runner,api: Response',
        '      api-->>runner: 201',
        '    end',
        '  end',
        '  runner->>runner: Report',
      ].join('\n'),
    );
  });
});
