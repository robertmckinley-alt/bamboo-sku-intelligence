/* eslint-disable */
const { useState, useEffect, useRef } = React;
const { Tag } = window.BambooUI;

const SECTIONS = [
  {id: 'what', label: 'What this is'},
  {id: 'views', label: 'The 4 main views'},
  {id: 'weights', label: 'Scoring weights explained'},
  {id: 'tags', label: 'Tag legend'},
  {id: 'shortcuts', label: 'Keyboard shortcuts'},
  {id: 'callsheet', label: 'Generating a call sheet'},
  {id: 'sku-detail', label: 'Reading the SKU detail panel'},
  {id: 'matrix', label: 'Reading the Distribution Matrix'},
  {id: 'data', label: 'Data freshness & period'},
  {id: 'faq', label: 'FAQ'},
];

function HowTo({a}) {
  const [active, setActive] = useState('what');
  const refs = useRef({});

  // Update active section on scroll
  const onScroll = (e) => {
    const top = e.target.scrollTop;
    let best = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const el = refs.current[s.id];
      if (el && el.offsetTop - 80 <= top) best = s.id;
    }
    setActive(best);
  };

  const scrollTo = (id) => {
    const el = refs.current[id];
    if (el) el.parentElement.parentElement.scrollTop = el.offsetTop - 16;
  };

  return (
    <div className="h-full bg-white flex">
      {/* Left rail */}
      <nav className="w-56 border-r border-stone-200 bg-stone-50 px-3 py-4 flex-shrink-0 hidden md:block">
        <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2 px-2">Contents</div>
        <ul className="space-y-px text-[12px]">
          {SECTIONS.map((s,i) => (
            <li key={s.id}>
              <button onClick={() => scrollTo(s.id)}
                      className={`w-full text-left px-2 py-1.5 rounded transition-colors ${active===s.id ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200'}`}>
                <span className="text-stone-400 font-mono mr-1.5">{String(i+1).padStart(2,'0')}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-4 border-t border-stone-200 px-2">
          <div className="text-[10px] text-stone-500 font-mono leading-relaxed">
            v2.0 · {a.meta.startDate}<br/>
            <span className="text-stone-400">{a.meta.totalClients} retailers · {a.skus.length} SKUs</span>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-auto" onScroll={onScroll}>
        <article className="max-w-3xl mx-auto px-8 py-10 prose-bamboo">
          <header className="mb-10 pb-6 border-b border-stone-200">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">Documentation</div>
            <h1 className="text-3xl font-semibold text-stone-900 mt-1 tracking-tight">How to use Bamboo SKU Intelligence</h1>
            <p className="text-stone-600 mt-3 text-sm leading-relaxed max-w-2xl">
              A short manual for the team. Read once, then keep it open in a tab.
              If something feels broken or wrong, tell ops — totals reconcile to the cent against the source pivot, so any mismatch is a bug, not a rounding artifact.
            </p>
          </header>

          <Section refs={refs} id="what" title="What this is">
            <p>
              Bamboo SKU Intelligence is a SKU-first wholesale operating system, not a report.
              It exists so a sales rep can answer the four questions that matter — <em>what should I push, who should I call, what's missing on their shelf, and how much is it worth</em> — without leaving the table.
            </p>
            <p>
              Tables come first. Charts come second. Every number on screen is traceable to a row in the underlying SKU × retailer matrix. There are no rolled-up insights without a cell you can click into.
            </p>
            <p>
              The whole app is one HTML file. State persists in the URL, so a link captures your filters and weights — drop it in Slack and your colleague lands exactly where you were.
            </p>
          </Section>

          <Section refs={refs} id="views" title="The 4 main views">
            <p>The app has four primary surfaces. Switch between them with the tab bar (or hit <Kbd>1</Kbd>–<Kbd>4</Kbd>).</p>

            <Subsection name="SKU Engine">
              <p>The master table. Every active SKU, every metric, sortable by every column, filterable by category and tag. Click any row to open the detail panel.</p>
              <Example use="I want to find SKUs to push" do='Open SKU Engine → sort by Opportunity ($) descending → filter Tag = PUSH → those rows are SKUs that perform well at the stores carrying them but have meaningful distribution gaps. Open one, copy the "retailers not carrying" list into your call queue.' />
            </Subsection>

            <Subsection name="Retailers">
              <p>The store side of the same coin. Every retailer with their revenue, order count, SKU coverage, and a Store Opportunity score with one of five tags. Click a row to open the retailer detail panel with their missing top SKUs and a suggested order bundle.</p>
              <Example use="I want a list of stores to call this week" do='Open Retailers → filter Tag = HIGH VALUE — CALL NOW → sort by Opportunity Score → the top 10 are your shortlist. Click each, scan the missing SKUs and suggested bundle, then export a combined call sheet from Bulk Call Sheet.' />
            </Subsection>

            <Subsection name="Distribution Matrix">
              <p>SKUs as rows, retailers as columns. A check mark plus a heatmap cell means that store carries that SKU; the warmer the color the higher the revenue. Empty cells are placement opportunities. Sticky headers let you scroll a long way without losing context.</p>
              <Example use="I want to see who carries my whole top 10" do='Sort SKU rows by score → scan the top 10 across the column axis → any store with white cells in the top 10 is a Cross-Sell candidate. Click a white cell to jump straight into a SKU × retailer view.' />
            </Subsection>

            <Subsection name="Performance Buckets">
              <p>Curated lists for the things you'd otherwise have to filter for: Top Revenue Drivers, Highest Velocity, Most Distributed, Hidden Winners (high velocity but low distribution — the most profitable SKUs to push next), and Weak SKUs. Each card links back to the master table or detail panel.</p>
              <Example use="I want to find SKUs that are quietly winning" do='Open Performance Buckets → look at Hidden Winners. These are SKUs that move at the stores carrying them but only sit on a fraction of doors. Pitching them is the single highest-leverage thing a rep can do.' />
            </Subsection>
          </Section>

          <Section refs={refs} id="weights" title="Scoring weights explained">
            <p>
              Every SKU gets a Score from 0 to 100. The score is a weighted blend of six factors, normalized 0–1 across the SKU universe.
              The right rail exposes all six weights as live sliders. Move a slider and the table, the rankings, and the tags recompute immediately.
              The default weights are tuned for the typical "what should we sell more of" question, but the right blend depends on what you're trying to do today.
            </p>

            <table className="w-full text-[12px] my-4 border border-stone-200 rounded overflow-hidden">
              <thead className="bg-stone-50">
                <tr><th className="text-left px-3 py-2 font-semibold">Weight</th><th className="text-left px-3 py-2 font-semibold">What it rewards</th><th className="text-left px-3 py-2 font-semibold">Crank when…</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr><td className="px-3 py-2 font-mono text-stone-700">Revenue 25%</td><td className="px-3 py-2">Total dollars contributed across all stores</td><td className="px-3 py-2 text-stone-600">You care about absolute size — protecting the top of the catalog.</td></tr>
                <tr><td className="px-3 py-2 font-mono text-stone-700">Units 15%</td><td className="px-3 py-2">Total quantities moved</td><td className="px-3 py-2 text-stone-600">You're optimizing throughput / shelf turn instead of margin.</td></tr>
                <tr><td className="px-3 py-2 font-mono text-stone-700">Velocity 20%</td><td className="px-3 py-2">Units per carrying store per month</td><td className="px-3 py-2 text-stone-600">You want the fastest movers per door — the SKUs that <em>actually sell through</em>.</td></tr>
                <tr><td className="px-3 py-2 font-mono text-stone-700">Distribution 15%</td><td className="px-3 py-2">% of stores already carrying it</td><td className="px-3 py-2 text-stone-600">You're prioritizing proven products with broad acceptance.</td></tr>
                <tr><td className="px-3 py-2 font-mono text-stone-700">Reorder 10%</td><td className="px-3 py-2">Estimated reorder frequency</td><td className="px-3 py-2 text-stone-600">You care about stickiness — SKUs that come back, not one-and-dones.</td></tr>
                <tr><td className="px-3 py-2 font-mono text-stone-700">Opportunity 15%</td><td className="px-3 py-2">Estimated $ left at non-carrying stores</td><td className="px-3 py-2 text-stone-600">You're hunting growth — SKUs with the most untapped distribution.</td></tr>
              </tbody>
            </table>

            <p>
              The Store Opportunity score has its own four sliders: <em>Missing Top SKUs</em>, <em>Category Gap</em>, <em>Spend Potential</em> (current spend vs peer-store benchmark), and <em>Order Frequency</em>.
              The tag a store gets — HIGH VALUE, CROSS-SELL, etc. — derives from this score and the underlying mix.
            </p>
            <p>
              <strong>Reset</strong> snaps every slider back to defaults. Use it when you want to compare a custom view to the canonical one, or before sharing a screenshot.
            </p>
          </Section>

          <Section refs={refs} id="tags" title="Tag legend">
            <h3 className="text-stone-700 font-semibold text-[13px] mt-4 mb-2 uppercase tracking-wider">SKU tags</h3>
            <div className="space-y-2 my-3">
              <TagRow tag="SCALE"   def="High score, high velocity, strong reorder. The catalog's front line." action="Defend distribution, lock contracts, build secondary placements." />
              <TagRow tag="PUSH"    def="Strong performance at the stores carrying it but distribution is thin." action="Pitch to non-carrying stores. The single most profitable rep activity." />
              <TagRow tag="MONITOR" def="Mid-pack across most metrics. Holding its own but not pulling weight." action="Watch for movement before deciding to invest or cut." />
              <TagRow tag="FIX"     def="Weak velocity or inconsistent reorder despite reasonable distribution." action="Diagnose: pricing, packaging, in-store visibility. Remove obstacles." />
              <TagRow tag="CUT"     def="Low score across every metric. Tying up SKU slots that better products need." action="Discontinue or sunset. Free the slot." />
            </div>

            <h3 className="text-stone-700 font-semibold text-[13px] mt-6 mb-2 uppercase tracking-wider">Store tags</h3>
            <div className="space-y-2 my-3">
              <TagRow tag="HIGH VALUE — CALL NOW" def="High opportunity score AND high spend potential. Underweight a top customer." action="Call this week. They're the highest-leverage call on the board." />
              <TagRow tag="CROSS-SELL"            def="Healthy account but missing several top-ranked SKUs they should logically carry." action="Pitch the missing top SKUs as add-ons during their next reorder." />
              <TagRow tag="CATEGORY EXPANSION"    def="Buying from one or two categories only — clear category whitespace." action="Introduce them to the gap category with a small starter bundle." />
              <TagRow tag="LOW PRIORITY"          def="Already well covered or too small to move the needle this period." action="Quarterly check-in only. Don't waste reps' time chasing it." />
              <TagRow tag="AT RISK"               def="Order cadence has slipped vs their own baseline; they used to buy more." action="Service call before they churn. Find out what changed." />
            </div>
          </Section>

          <Section refs={refs} id="shortcuts" title="Keyboard shortcuts">
            <table className="w-full text-[12px] my-4 border border-stone-200 rounded overflow-hidden">
              <tbody className="divide-y divide-stone-100">
                <tr><td className="px-3 py-2 font-mono w-24"><Kbd>/</Kbd></td><td className="px-3 py-2">Focus the search box on the active table</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd></td><td className="px-3 py-2">Jump to SKU Engine / Retailers / Matrix / Buckets</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>Esc</Kbd></td><td className="px-3 py-2">Close the open detail panel or modal</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>Tab</Kbd></td><td className="px-3 py-2">Walk forward through interactive elements (focus rings show where you are)</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>↑</Kbd> <Kbd>↓</Kbd></td><td className="px-3 py-2">In a focused slider, nudge the weight by 1%</td></tr>
              </tbody>
            </table>
          </Section>

          <Section refs={refs} id="callsheet" title="Generating a call sheet">
            <p>
              The call-sheet export is the point of the app. Everything else is staging for this moment.
            </p>
            <ol className="list-decimal pl-5 space-y-2 my-3">
              <li><strong>Pick a target.</strong> Either click a single retailer to open their detail panel, or click the <em>Bulk Call Sheet</em> button in the top bar to bundle multiple stores in one document.</li>
              <li><strong>Choose a scope.</strong> Bulk export gives you three modes: <em>By Rep</em> (every store assigned to a sales rep), <em>By Store Tag</em> (every HIGH VALUE store, every AT RISK store, etc.), or <em>Manual Pick</em> (cherry-pick from a sortable list).</li>
              <li><strong>Pick the format.</strong> <em>CSV</em> for spreadsheets and CRM import. <em>Print / PDF</em> for a clean one-page-per-store document with the rep's name, the store's current stats, the missing top SKUs, suggested order quantities, estimated revenue opportunity, and short data-driven talking points.</li>
              <li><strong>Use it on the call.</strong> The talking points are written to be read aloud — concrete numbers, no hedging. The suggested order bundle gives the rep something specific to ask for; even if the customer counters down, the anchor is doing work.</li>
            </ol>
            <p className="text-stone-600 text-[12px]">
              Tip: hit print preview before printing. The print stylesheet hides the navigation, sliders, and right rail, leaving only the call sheet itself.
            </p>
          </Section>

          <Section refs={refs} id="sku-detail" title="Reading the SKU detail panel">
            <p>Click any SKU row in the master table or matrix and the detail panel slides in. Top to bottom:</p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Header strip</strong> — name, category, score with rank and percentile, suggested action, and the SKU's tag.</li>
              <li><strong>Metric grid</strong> — the eighteen master-table columns laid out as cards so they're easier to skim than the row.</li>
              <li><strong>Trend line</strong> — share of total revenue this SKU contributed across the period. The current build samples four time slices (the file is a period rollup, not week-resolved); read it as "shape," not "exact velocity by week."</li>
              <li><strong>Retailers carrying</strong> — sortable table of every store that bought this SKU, with their revenue and unit contribution. Click a store to jump to its detail panel.</li>
              <li><strong>Retailers <em>not</em> carrying</strong> — the placement opportunity, sorted by store opportunity score so the highest-leverage targets float to the top.</li>
              <li><strong>Suggested action</strong> — Expand / Push / Fix / Cut, with a single sentence of rationale tied to the actual numbers.</li>
            </ul>
          </Section>

          <Section refs={refs} id="matrix" title="Reading the Distribution Matrix">
            <p>
              The Distribution Matrix is the densest view in the app. It is a literal SKU × retailer grid: every SKU is a row, every retailer is a column.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Cell color</strong> — heatmap by per-cell revenue. Darker = higher dollar contribution. Empty cells are placement gaps.</li>
              <li><strong>Sticky headers</strong> — the SKU name column and the retailer name row stay visible as you scroll. You never lose the axis.</li>
              <li><strong>Click a filled cell</strong> — opens that SKU's detail panel scrolled to that store.</li>
              <li><strong>Click an empty cell</strong> — also opens the SKU's detail panel, with the missing-store row highlighted in the "not carrying" list — a one-click pivot to the call.</li>
              <li><strong>Row totals</strong> — the rightmost column shows the SKU's total revenue. Column totals at the bottom show each store's total spend.</li>
              <li><strong>Filters</strong> — restrict by category or by SKU tag to make the grid scannable. The matrix is fastest when you've narrowed it to a story.</li>
            </ul>
          </Section>

          <Section refs={refs} id="data" title="Data freshness & period">
            <div className="bg-stone-50 border border-stone-200 rounded p-4 my-3 text-[12px]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono">
                <span className="text-stone-500">Period</span><span className="text-stone-800">{a.meta.startDate} → {a.meta.endDate}</span>
                <span className="text-stone-500">Days covered</span><span className="text-stone-800">{a.meta.periodDays}</span>
                <span className="text-stone-500">Total Revenue</span><span className="text-stone-800">${a.meta.totalRevenue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                <span className="text-stone-500">Total Units</span><span className="text-stone-800">{a.meta.totalUnits.toLocaleString()}</span>
                <span className="text-stone-500">Active SKUs</span><span className="text-stone-800">{a.skus.length}</span>
                <span className="text-stone-500">Retailers</span><span className="text-stone-800">{a.meta.totalClients}</span>
                <span className="text-stone-500">Source</span><span className="text-stone-800">Bamboo Dashboard pivot</span>
              </div>
            </div>
            <p>
              All revenue and units in the app reconcile to the cent against the Total rows in the Bamboo Dashboard pivot file. The Performance file is used only to fill rep assignments and store metadata — it never overrides the pivot's totals. If a number you see here doesn't match a number a colleague is quoting from another tool, the discrepancy is between that tool and the pivot, not between this app and the pivot.
            </p>
          </Section>

          <Section refs={refs} id="faq" title="FAQ">
            <Faq q="Why are some SKUs CUT?">
              <p>The CUT tag fires when a SKU sits at the bottom of the score distribution across <em>every</em> factor — low revenue, low units, low velocity, thin distribution, weak reorder, no meaningful opportunity. It doesn't mean the SKU is bad in isolation. It means the slot it occupies is more valuable than the SKU is. Sunset and replace.</p>
            </Faq>
            <Faq q="What's the difference between Velocity and Reorder?">
              <p>Velocity is units sold per carrying store per month — how fast it moves <em>at the door</em>. Reorder is how often a store comes back for it — how <em>sticky</em> it is. A high-velocity / low-reorder SKU is a one-time impulse buy; a high-reorder / moderate-velocity SKU is a staple. The two together are what defines a SCALE product.</p>
            </Faq>
            <Faq q="How is Opportunity $ calculated?">
              <p>For each SKU, take the average revenue per carrying store. Multiply by the number of stores <em>not</em> currently carrying it, weighted by each non-carrying store's overall spend potential. The result is a deliberately conservative estimate of dollars left on the table — it assumes a non-carrying store would buy at the average rate of an existing carrier, not the best one.</p>
            </Faq>
            <Faq q="Why do some stores have 0 missing SKUs?">
              <p>"Missing" means missing from the rep's current pitch list — the global top SKUs by score. A store with 0 missing SKUs is already carrying the top of the catalog. They're either tagged LOW PRIORITY (you've maximized them) or, more interestingly, you should re-look at them with the weights tilted toward Velocity or Opportunity to find second-tier SKUs to expand into.</p>
            </Faq>
            <Faq q="Why does my call-sheet show fewer SKUs than I expected?">
              <p>The call sheet only lists SKUs ranked highly enough to be worth pitching <em>and</em> not already carried by the store. If a store is already at full coverage of the top 20, the sheet will be short by design — that's a feature, not a bug. Tilt the SKU score weights toward Opportunity and re-export to surface deeper cuts.</p>
            </Faq>
            <Faq q="Can I trust the score if I move the sliders?">
              <p>Yes — the score is recomputed deterministically every time you move a slider, with no caching or staleness. The sliders are <em>your</em> editorial control over what "best SKU" means today. The defaults are a sensible starting point, not a sacred ratio.</p>
            </Faq>
          </Section>

          <footer className="mt-12 pt-6 border-t border-stone-200 text-[11px] text-stone-500 font-mono">
            Bamboo SKU Intelligence v2 · {a.meta.startDate} → {a.meta.endDate} · {a.meta.totalClients} retailers · {a.skus.length} SKUs · {a.meta.totalUnits.toLocaleString()} units
          </footer>
        </article>
      </div>
    </div>
  );
}

function Section({refs, id, title, children}) {
  return (
    <section className="mb-10 scroll-mt-4" ref={el => refs.current[id] = el}>
      <h2 className="text-xl font-semibold text-stone-900 mb-3 tracking-tight">{title}</h2>
      <div className="space-y-3 text-[13px] leading-relaxed text-stone-700">
        {children}
      </div>
    </section>
  );
}

function Subsection({name, children}) {
  return (
    <div className="mt-4 pl-3 border-l-2 border-stone-200">
      <h3 className="text-[14px] font-semibold text-stone-800 mb-1.5">{name}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Example({use, do: doStr}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-[12px] my-2">
      <div className="text-amber-900 font-semibold mb-1">Example · {use}</div>
      <div className="text-stone-700 leading-relaxed">{doStr}</div>
    </div>
  );
}

function TagRow({tag, def, action}) {
  return (
    <div className="flex gap-3 items-start py-2 border-b border-stone-100 last:border-0">
      <div className="w-44 flex-shrink-0 pt-0.5"><Tag tag={tag} /></div>
      <div className="text-[12px] flex-1">
        <div className="text-stone-800">{def}</div>
        <div className="text-stone-500 mt-0.5"><span className="text-stone-400">→</span> {action}</div>
      </div>
    </div>
  );
}

function Faq({q, children}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-stone-200 py-3">
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-baseline text-left">
        <span className="text-stone-800 font-semibold text-[13px]">{q}</span>
        <span className="text-stone-400 font-mono text-[11px] ml-3">{open?'−':'+'}</span>
      </button>
      {open && <div className="mt-2 text-stone-600 text-[12px] leading-relaxed">{children}</div>}
    </div>
  );
}

function Kbd({children}) {
  return <kbd className="inline-block px-1.5 py-px bg-stone-100 border border-stone-300 rounded text-[10px] font-mono text-stone-700 shadow-sm">{children}</kbd>;
}

window.BambooHowTo = { HowTo };
