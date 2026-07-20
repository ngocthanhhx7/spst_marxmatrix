import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../../shared/ui/BrandMark.js';
import { useSessionStore } from '../auth/session.js';
import './AboutPage.css';

const history = [
  [
    '01',
    'The question',
    'How can a learning workflow make its source trail easier to inspect before a conclusion is shared?'
  ],
  [
    '02',
    'The prototype',
    'The team connected document scanning, source-grounded conversation and a structured debate space into one study environment.'
  ],
  [
    '03',
    'The current build',
    'MarxMatrix is presented as an evolving student project. Its limits and directions remain visible rather than being treated as completed capability.'
  ]
] as const;

const workflow = [
  ['01', 'Collect', 'Bring a document or source into the workspace.'],
  ['02', 'Extract', 'Identify text, entities and passages that need review.'],
  ['03', 'Locate', 'Keep claims connected to the material that supports or challenges them.'],
  ['04', 'Question', 'Use Copilot and peer discussion to test an interpretation.'],
  ['05', 'Decide', 'Record a conclusion with its evidence, caveats and open questions.']
] as const;

const team = [
  'Vương Giang Trường HE186135',
  'Vũ Kim Kỳ HE182094',
  'Dương Tuấn Anh HE180437',
  'Nguyễn Xuân Dương HE190405',
  'Trần Đức Minh HE190690',
  'Phạm Hải Trung HE190486',
  'Nguyễn Khắc Tráng HE186034'
] as const;

export function AboutPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useSessionStore((state) => state.user);

  const handleAnchorNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    const targetId = event.currentTarget.hash.slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    window.history.replaceState(null, '', `#${targetId}`);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  return (
    <main className="about" id="main-content" data-screen="about-01">
      <p className="about__utility-line">MARXMATRIX / PROJECT DOSSIER / PUBLIC RECORD</p>
      <header className="about__header" role="banner">
        <BrandMark />
        <button
          className="about__menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="about-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <nav
          id="about-navigation"
          className="about__nav"
          data-open={menuOpen}
          aria-label="Public navigation"
        >
          <Link to="/">Home</Link>
          <a href="#protocol" onClick={handleAnchorNavigation}>
            Protocol
          </a>
          <a href="#tools" onClick={handleAnchorNavigation}>
            Tools
          </a>
          <Link to="/about" aria-current="page">
            About
          </Link>
        </nav>
        <div className="about__account-links">
          {user ? (
            <>
              <Link to="/settings">{user.displayName}</Link>
              <Link className="about__button about__button--amber" to="/dashboard">
                Workspace
              </Link>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link className="about__button about__button--amber" to="/scanner/new">
                Start analysis
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="about__hero about__frame" aria-labelledby="about-title">
        <div>
          <p className="about__eyebrow">01 / THESIS</p>
          <h1 id="about-title">Evidence before conclusions.</h1>
          <p className="about__lede">
            MarxMatrix is a student-built learning workspace for reading documents, tracing claims
            and testing an argument in public view of its sources. It does not replace judgement; it
            makes the route to judgement easier to examine.
          </p>
          <div className="about__actions">
            <Link className="about__button about__button--amber" to="/scanner/new">
              Start evidence review
            </Link>
            <a
              className="about__button about__button--outline"
              href="#protocol"
              onClick={handleAnchorNavigation}
            >
              Read the protocol
            </a>
          </div>
        </div>
        <aside className="about__specimen" aria-label="Evidence dossier summary">
          <p>CASE FILE / MM-ABOUT</p>
          <dl>
            <div>
              <dt>Subject</dt>
              <dd>Learning with evidence</dd>
            </div>
            <div>
              <dt>Standard</dt>
              <dd>Source visible</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>Student project</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="about__origin about__frame" aria-labelledby="origin-title">
        <div>
          <p className="about__eyebrow about__eyebrow--amber">02 / ORIGIN DOSSIER</p>
          <h2 id="origin-title">A record of intent, not a marketing claim.</h2>
        </div>
        <div className="about__origin-copy">
          <p>
            MarxMatrix was made by a student team listed in this dossier. The project starts from a
            simple working premise: when a claim is important, the reader should be able to find the
            source, inspect the reasoning and name what remains uncertain.
          </p>
          <p>
            This page documents the team’s present intent and workflow. It does not claim production
            scale, institutional endorsement or outcomes that have not been independently measured.
          </p>
        </div>
      </section>

      <section className="about__history about__frame" aria-labelledby="history-title">
        <div className="about__section-heading">
          <p className="about__eyebrow">03 / THREE PART HISTORY</p>
          <h2 id="history-title">From a question to a working learning environment.</h2>
        </div>
        <ol>
          {history.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="about__workflow about__frame" aria-labelledby="workflow-title">
        <div className="about__section-heading">
          <p className="about__eyebrow about__eyebrow--amber">04 / METHOD IN PRACTICE</p>
          <h2 id="workflow-title">Move from a document to a defensible next step.</h2>
        </div>
        <div className="about__before-after">
          <article>
            <p>Before</p>
            <h3>Source, claim and conclusion are separated.</h3>
            <span>Harder to review, explain or revisit.</span>
          </article>
          <article>
            <p>After</p>
            <h3>Each conclusion carries a trail back to material and questions.</h3>
            <span>Designed for review, discussion and revision.</span>
          </article>
        </div>
        <ol className="about__steps">
          {workflow.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="about__manifesto" aria-labelledby="manifesto-title">
        <div className="about__frame">
          <p className="about__eyebrow">05 / MANIFESTO</p>
          <h2 id="manifesto-title">Make the evidence legible. Keep the disagreement useful.</h2>
          <p>
            We prefer a source link over an unsupported assertion, a stated limit over false
            certainty, and a revisable argument over a polished answer that cannot be checked.
          </p>
        </div>
      </section>

      <section
        className="about__tools about__frame"
        id="tools"
        tabIndex={-1}
        aria-labelledby="tools-title"
      >
        <div className="about__section-heading">
          <p className="about__eyebrow about__eyebrow--amber">06 / WORKSPACES</p>
          <h2 id="tools-title">Three connected places to do the work.</h2>
        </div>
        <div className="about__tool-grid">
          <article>
            <p>Scanner</p>
            <h3>Turn documents into material you can inspect.</h3>
            <span>
              Start a document analysis and retain the path back to the original material.
            </span>
            <Link to="/scanner/new">Open Scanner</Link>
          </article>
          <article>
            <p>Copilot</p>
            <h3>Ask questions with sources in view.</h3>
            <span>Use a source-grounded workspace to develop and check an interpretation.</span>
            <Link to="/copilot">Open Copilot</Link>
          </article>
          <article>
            <p>Capital Arena</p>
            <h3>Stress-test a position through structured debate.</h3>
            <span>Bring an argument into a dedicated environment for challenge and revision.</span>
            <Link to="/arena">Enter Capital Arena</Link>
          </article>
        </div>
      </section>

      <section className="about__outcomes about__frame" aria-labelledby="outcomes-title">
        <div>
          <p className="about__eyebrow">07 / WHAT WE LOOK FOR</p>
          <h2 id="outcomes-title">Qualitative outcomes worth noticing.</h2>
        </div>
        <ul>
          <li>Students can point to the material behind a claim.</li>
          <li>Questions and uncertainty stay attached to a developing conclusion.</li>
          <li>Collaboration leaves a readable record of how an argument changed.</li>
        </ul>
      </section>

      <section className="about__team about__frame" aria-labelledby="team-title">
        <div className="about__section-heading">
          <p className="about__eyebrow about__eyebrow--amber">08 / PEOPLE</p>
          <h2 id="team-title">The project team.</h2>
        </div>
        <div className="about__team-grid">
          <article>
            <p>Team leader</p>
            <h3>Nguyễn Ngọc Thành HE186491</h3>
          </article>
          <ul aria-label="Team members">
            {team.map((member) => (
              <li key={member}>{member}</li>
            ))}
            <li>other collaborators</li>
          </ul>
        </div>
      </section>

      <section
        className="about__protocol about__frame"
        id="protocol"
        tabIndex={-1}
        aria-labelledby="protocol-title"
      >
        <div>
          <p className="about__eyebrow">09 / EVIDENCE PROTOCOL</p>
          <h2 id="protocol-title">A claim is only as useful as its trail.</h2>
        </div>
        <ol>
          <li>Keep source context available when a claim is reviewed.</li>
          <li>Separate what the material says from what the reader infers.</li>
          <li>Mark unresolved questions and revise the record when evidence changes.</li>
        </ol>
      </section>

      <section className="about__future about__frame" aria-labelledby="future-title">
        <p className="about__eyebrow about__eyebrow--amber">
          10 / DIRECTION, NOT CURRENT CAPABILITY
        </p>
        <h2 id="future-title">Future direction</h2>
        <p>
          The team intends to keep improving review flows, collaborative evidence work and the
          clarity of source provenance. These are directions for future development, not promises of
          functionality available today.
        </p>
      </section>

      <section className="about__cta about__frame" aria-labelledby="cta-title">
        <h2 id="cta-title">Start with the evidence already in front of you.</h2>
        <Link className="about__button about__button--amber" to="/scanner/new">
          Begin with a document
        </Link>
      </section>

      <footer className="about__footer about__frame">
        <div>
          <BrandMark />
          <p>MarxMatrix / student project / evidence-aware learning.</p>
        </div>
        <nav aria-label="About footer navigation">
          <Link to="/">Home</Link>
          <a href="#protocol" onClick={handleAnchorNavigation}>
            Protocol
          </a>
          <Link to="/about" aria-current="page">
            About
          </Link>
        </nav>
      </footer>
    </main>
  );
}
