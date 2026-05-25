/* eslint-disable */
const { useState, useEffect, useRef } = React;
const { Tag } = window.BambooUI;

const SECTIONS = [
  {id: 'what', label: 'What this is'},
  {id: 'whats-new', label: "What's new"},
  {id: 'views', label: 'The 8 main views'},
  {id: 'goals', label: 'Penetration goals'},
  {id: 'closures', label: 'Void closures'},
  {id: 'exports', label: 'Exporting data'},
  {id: 'tags', label: 'Store tag legend'},
  {id: 'shortcuts', label: 'Keyboard shortcuts'},
  {id: 'callsheet', label: 'Generating a call sheet'},
  {id: 'sku-detail', label: 'The SKU detail panel'},
  {id: 'matrix', label: 'The Distribution Matrix'},
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
            v2.2 · {a.meta.startDate}<br/>
            <span className="text-stone-400">{a.meta.totalClients} retailers · {a.skus.length} SKU groups</span>
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
              If something looks wrong, tell ops — the app reads the live Bamboo Intelligence API, so a mismatch is a bug, not a rounding artifact.
            </p>
          </header>

          <Section refs={refs} id="what" title="What this is">
            <p>
              Bamboo SKU Intelligence is a SKU-first wholesale operating system, not a report.
              It exists so a sales rep can answer the questions that matter — <em>what should I push, who should I call, what's missing on their shelf, what did we just win, and how much is it worth</em> — without leaving the table.
            </p>
            <p>
              Tables come first. Charts come second. Every number on screen is traceable to a row in the underlying SKU&nbsp;×&nbsp;retailer matrix. There are no rolled-up insights without a cell you can click into.
            </p>
            <p>
              The whole app is one page that pulls live from the Bamboo Intelligence API. State persists in the URL, so a link captures your tab and filters — drop it in Slack and a colleague lands exactly where you were.
            </p>
          </Section>

          <Section refs={refs} id="whats-new" title="What's new in this build">
            <p>This build adds several things since the last manual update:</p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Closures tab</strong> — tracks <em>void closures</em>: every time a store starts carrying a SKU group it didn't carry before. It's the running scoreboard of new placements, attributed to both the sales rep and the VMI rep. See the dedicated section below.</li>
              <li><strong>Penetration goals</strong> — the SKU Engine and the Reps page now carry a <em>Goal</em> column (the target share of stores that should stock a SKU group) and a <em>To Goal</em> column (how many more stores it takes to get there).</li>
              <li><strong>Missing-product finder</strong> — on the Reps tab, click any SKU group in a rep's list to open a drawer that lists the products a chosen store isn't carrying yet, with rep / SKU-group / store dropdowns to pivot around.</li>
              <li><strong>Top SKUs tab</strong> — individual products ranked by category, with rep filters and a "missing only" toggle for fast pitch lists.</li>
              <li><strong>CSV exports everywhere</strong> — one-click <code>↓ CSV</code> buttons on the SKU Engine, the Reps store list, and the Closures log, plus the existing call-sheet CSV. Every export honors whatever filters and sort you have applied.</li>
              <li><strong>Trade-sample-only stores are hidden</strong> — a store that has only ever taken trade samples no longer clutters the reports; it reappears the moment it places a real revenue order.</li>
              <li><strong>Category cleanup</strong> — SKU groups are sorted into the right high-level category: Micro Bar → Vapes, Sungaze → Beverage, Mega Rolls / Huxton / all Bangers → Prerolls, Macro Bar &amp; Panda Battery → Accessories, and more.</li>
            </ul>
          </Section>

          <Section refs={refs} id="views" title="The 8 main views">
            <p>The app has eight working surfaces plus this manual. Switch between them with the tab bar, or hit <Kbd>1</Kbd>–<Kbd>8</Kbd>.</p>

            <Subsection name="1 · SKU Engine">
              <p>The master table. Every active SKU group, every metric, sortable by every column, filterable by category and by search. The <code>Revenue · Velocity · Distribution · Opportunity</code> toggle highlights whichever column you're hunting on. The <code>↓ CSV</code> button exports exactly what's on screen. Click any row to open the SKU detail panel.</p>
              <Example use="I want to find SKUs to push" do="Open SKU Engine, switch the toggle to Opportunity, sort the Opp $ column descending. Those rows perform well where they're carried but have real distribution gaps. Open one and copy the not-carrying list into your call queue." />
            </Subsection>

            <Subsection name="2 · Retailers">
              <p>The store side of the same coin. Every retailer with revenue, order count, SKU coverage, an Opportunity Score and one of five store tags. Filter by sales rep or VMI rep. Click a row to open the retailer detail panel with their missing top SKUs and a suggested order bundle.</p>
              <Example use="I want a list of stores to call this week" do="Open Retailers, filter Tag = CALL NOW, sort by Opportunity Score. The top of that list is your shortlist — click each, scan the missing SKUs, then export a combined call sheet." />
            </Subsection>

            <Subsection name="3 · Distribution Matrix">
              <p>SKU groups as rows, retailers as columns. A heatmap cell means that store carries that SKU group — warmer colors are higher revenue. Empty cells are placement opportunities. See the dedicated section below.</p>
            </Subsection>

            <Subsection name="4 · Categories">
              <p>SKU groups organized under their high-level category (Flower, Vapes, Prerolls, Edibles, Concentrates, Beverage, Accessories…), with per-category penetration and leaderboards.</p>
            </Subsection>

            <Subsection name="5 · Top SKUs">
              <p>Individual products — not roll-up groups — ranked within each high-level category, top 50 per category. Filter by sales or VMI rep, search by product or brand, and flip on "missing only" to see just the products a rep's stores aren't carrying. Click a row to open its non-carriers list.</p>
              <Example use="I want a brand's fastest movers in Vapes" do="Open Top SKUs, pick the Vapes category, sort by Vel/mo, and search the brand name. You get real product names, not roll-ups." />
            </Subsection>

            <Subsection name="6 · Reps">
              <p>Per-rep view, switchable between Sales Rep and VMI Rep. Cards across the top show each rep's revenue, store count, missed-rev opportunity and store-tag mix. Click a card and two panels open below: <em>all their SKU groups</em> (with rep-scoped penetration vs. the goal) and their <em>high-priority store list</em> (sortable, filterable by tag, with a <code>↓ CSV</code> button). Click any SKU group to open the missing-product finder. Each card also has a 📄 button that prints a combined call sheet for the rep's whole book.</p>
              <Example use="I want to know which stores under Ashlea still need Bangers" do="Open Reps, click her card, click the Bangers row. The finder drawer opens — pick a store marked ○ (doesn't carry it) and you get the full pitch list of products in that group." />
            </Subsection>

            <Subsection name="7 · Closures">
              <p>The new-placement scoreboard. Every (store × SKU group) pair that went from zero to a real order shows up here, dated, with both rep attributions. Filter by date range and rep, search, and export. See the dedicated section below.</p>
            </Subsection>

            <Subsection name="8 · Buckets">
              <p>Curated shortlists so you don't have to filter for them: <strong>Top revenue drivers</strong>, <strong>Highest velocity</strong>, <strong>Most distributed</strong>, <strong>Hidden winners</strong> (fast movers that only sit on a fraction of doors — the highest-leverage things to pitch next) and <strong>Weak SKUs</strong>. Each row links into the detail panel.</p>
            </Subsection>
          </Section>

          <Section refs={refs} id="goals" title="Penetration goals">
            <p>
              A penetration goal is the share of stores a SKU group <em>should</em> be on. The SKU Engine and the Reps page both show it:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Penet.</strong> — the share of stores currently carrying the group.</li>
              <li><strong>Goal</strong> — the target share. Colored green when penetration is at or above goal, amber when it's within ten points, rose when it's further off.</li>
              <li><strong>To Goal</strong> — how many more stores need to pick it up to hit the goal. A <span className="font-mono">✓</span> means the goal is met; <span className="font-mono">+12</span> means twelve placements to go.</li>
            </ul>
            <p>
              On the Reps page the goal math is scoped to that rep's own book — "To Goal" there is the number of <em>their</em> stores still needed, so it's a direct to-do list.
            </p>
          </Section>

          <Section refs={refs} id="closures" title="Void closures">
            <p>
              A <strong>void</strong> is an empty (store&nbsp;×&nbsp;SKU group) cell — a store that doesn't carry something. <strong>Closing the void</strong> means that store places its first real order for it. The Closures tab is the running log of those wins.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>How it's detected</strong> — a daily job pulls the live API and compares it to the previous snapshot. Any (store, SKU group) pair that was at zero revenue and is now positive is logged as a closure, dated, with both the sales rep and the VMI rep.</li>
              <li><strong>Filters</strong> — pick a date range (7d / 30d / 90d / MTD / QTD / YTD / All / Custom), switch between Sales and VMI attribution, filter to one rep, or search store / SKU / category.</li>
              <li><strong>KPI strip</strong> — closures, revenue captured, units, unique stores and unique SKU groups for whatever's currently in view.</li>
              <li><strong>Per-rep summary</strong> — the right rail ranks reps by revenue captured; click a rep to filter the log to them.</li>
              <li><strong>Export</strong> — <code>↓ Export CSV</code> downloads the filtered log for reporting up the chain.</li>
            </ul>
            <p className="text-stone-600 text-[12px]">
              The report only counts placements after the early-May baseline — that's the first reliable snapshot, so anything before it isn't a true "new" placement. Test/demo store accounts are excluded, and a store that simply gains a "- VMI" / "- 1WT" suffix is treated as the same store, not a wave of new closures.
            </p>
          </Section>

          <Section refs={refs} id="exports" title="Exporting data">
            <p>Everything you can see, you can take with you. There are CSV buttons on three tables plus the call-sheet exports:</p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>SKU Engine → ↓ CSV</strong> — the full SKU table with every metric column, in whatever order and filter you've set.</li>
              <li><strong>Reps → store list → ↓ CSV</strong> — the selected rep's stores, with the active tag filter and sort applied.</li>
              <li><strong>Closures → ↓ Export CSV</strong> — the filtered closure log.</li>
              <li><strong>Call sheets</strong> — printable PDF or CSV, per store or in bulk (see the next section).</li>
            </ul>
            <p className="text-stone-600 text-[12px]">
              CSV files open cleanly in Excel and Google Sheets and are named with the rep or date range so they file themselves.
            </p>
          </Section>

          <Section refs={refs} id="tags" title="Store tag legend">
            <p>Every retailer carries one of five tags, derived from its opportunity score and buying mix.</p>
            <div className="space-y-2 my-3">
              <TagRow tag="CALL NOW" def="High opportunity score and high spend potential — you're underweight on a top customer." action="Call this week. It's the highest-leverage call on the board." />
              <TagRow tag="CROSS-SELL" def="Healthy account missing several top-ranked SKU groups it should logically carry." action="Pitch the missing top SKUs as add-ons on the next reorder." />
              <TagRow tag="HIGH UPSIDE" def="Buying from only one or two categories — clear category whitespace." action="Introduce the gap category with a small starter bundle." />
              <TagRow tag="LOW PRIORITY" def="Already well covered, or too small to move the needle this period." action="Quarterly check-in only." />
              <TagRow tag="AT RISK" def="Order cadence has slipped versus the store's own baseline — they used to buy more." action="Service call before they churn. Find out what changed." />
            </div>
          </Section>

          <Section refs={refs} id="shortcuts" title="Keyboard shortcuts">
            <table className="w-full text-[12px] my-4 border border-stone-200 rounded overflow-hidden">
              <tbody className="divide-y divide-stone-100">
                <tr><td className="px-3 py-2 font-mono w-24"><Kbd>/</Kbd></td><td className="px-3 py-2">Focus the search box on the active table</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>1</Kbd>–<Kbd>8</Kbd></td><td className="px-3 py-2">Jump between tabs: 1 SKU Engine · 2 Retailers · 3 Matrix · 4 Categories · 5 Top SKUs · 6 Reps · 7 Closures · 8 Buckets</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>Esc</Kbd></td><td className="px-3 py-2">Close the open detail panel or modal</td></tr>
                <tr><td className="px-3 py-2 font-mono"><Kbd>Tab</Kbd></td><td className="px-3 py-2">Walk forward through interactive elements (focus rings show where you are)</td></tr>
              </tbody>
            </table>
          </Section>

          <Section refs={refs} id="callsheet" title="Generating a call sheet">
            <p>The call-sheet export is the point of the app. Everything else is staging for this moment.</p>
            <ol className="list-decimal pl-5 space-y-2 my-3">
              <li><strong>Pick a target.</strong> Click a single retailer to open their detail panel, or click <em>↓ Bulk Call Sheet</em> in the top bar to bundle many stores into one document.</li>
              <li><strong>Choose a scope.</strong> Bulk export gives three modes: <em>By Rep</em> (every store under a sales or VMI rep), <em>By Store Tag</em> (every CALL NOW store, every AT RISK store, etc.), or <em>Manual Pick</em> from a sortable list.</li>
              <li><strong>Pick the format.</strong> <em>CSV</em> for spreadsheets and CRM import. <em>Print / PDF</em> for a clean one-page-per-store document with the rep's name, current stats, missing top SKUs, suggested quantities, estimated revenue opportunity, the top individual products under each SKU group, and short data-driven talking points.</li>
              <li><strong>Use it on the call.</strong> The talking points are written to be read aloud — concrete numbers, no hedging. The suggested bundle gives the rep something specific to ask for.</li>
            </ol>
            <p className="text-stone-600 text-[12px]">
              Tip: hit print preview first. The print stylesheet drops the navigation and right rail, leaving only the call sheet.
            </p>
          </Section>

          <Section refs={refs} id="sku-detail" title="The SKU detail panel">
            <p>Click any SKU row in the master table or matrix and the detail panel slides in. Top to bottom:</p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Header</strong> — name, category and a one-line suggested action.</li>
              <li><strong>Metric grid</strong> — the master-table columns laid out as cards, easier to skim than the row.</li>
              <li><strong>Retailers carrying</strong> — a sortable table of every store buying this SKU group, with revenue and units. Click a store to jump to its detail panel.</li>
              <li><strong>Retailers <em>not</em> carrying</strong> — the placement opportunity, sorted by store opportunity score so the best targets float up.</li>
              <li><strong>Individual products</strong> — every real product SKU rolling up into the group, ranked by revenue with share-of-group bars — the answer to "this group does $X, which actual SKUs are doing the work?"</li>
            </ul>
          </Section>

          <Section refs={refs} id="matrix" title="The Distribution Matrix">
            <p>The densest view in the app: a literal SKU&nbsp;×&nbsp;retailer grid, every SKU group a row, every retailer a column.</p>
            <ul className="list-disc pl-5 space-y-1.5 my-3">
              <li><strong>Cell color</strong> — heatmap by per-cell revenue. Darker is higher. Empty cells are placement gaps.</li>
              <li><strong>Sticky headers</strong> — the SKU name column and the retailer row stay put as you scroll, so you never lose the axis.</li>
              <li><strong>Click a filled cell</strong> — opens that SKU's detail panel focused on that store.</li>
              <li><strong>Click an empty cell</strong> — opens the SKU detail panel with the missing store highlighted in the not-carrying list — a one-click pivot to the call.</li>
              <li><strong>Filter by category</strong> — narrow the grid until it tells one story; the matrix is fastest when it's small.</li>
            </ul>
          </Section>

          <Section refs={refs} id="data" title="Data freshness & period">
            <div className="bg-stone-50 border border-stone-200 rounded p-4 my-3 text-[12px]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono">
                <span className="text-stone-500">Period</span><span className="text-stone-800">{a.meta.startDate} → {a.meta.endDate}</span>
                <span className="text-stone-500">Days covered</span><span className="text-stone-800">{a.meta.periodDays}</span>
                <span className="text-stone-500">Total Revenue</span><span className="text-stone-800">${a.meta.totalRevenue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                <span className="text-stone-500">Total Units</span><span className="text-stone-800">{a.meta.totalUnits.toLocaleString()}</span>
                <span className="text-stone-500">SKU groups</span><span className="text-stone-800">{a.skus.length}</span>
                <span className="text-stone-500">Retailers</span><span className="text-stone-800">{a.meta.totalClients}</span>
                <span className="text-stone-500">Source</span><span className="text-stone-800">Bamboo Intelligence API (live)</span>
              </div>
            </div>
            <p>
              The app reads the live Bamboo Intelligence API on load, so the numbers are current every time you open it. Trade-sample-only stores are filtered out so the reports count revenue-bearing business. The Closures tab is the one exception to "live" — it's a running history built by a daily job, because a closure only exists relative to the day before.
            </p>
          </Section>

          <Section refs={refs} id="faq" title="FAQ">
            <Faq q="What exactly counts as a closure?">
              <p>A (store × SKU group) pair that had zero revenue in the previous daily snapshot and a real order in the latest one. It's a brand-new placement — a void that closed. Re-orders of something a store already carries are not closures.</p>
            </Faq>
            <Faq q="Why did a store I know I sold to not show up in Closures?">
              <p>Three common reasons: the order was for a SKU group the store already carried (a re-order, not a new placement); it landed on or before the early-May baseline; or it's a trade-sample-only line. If none of those fit, flag it to ops.</p>
            </Faq>
            <Faq q="What's the difference between Penet., Goal and To Goal?">
              <p>Penet. is where a SKU group is today (share of stores carrying it). Goal is where it should be. To Goal is the gap expressed as a store count — how many more placements it takes. On the Reps page, To Goal is scoped to that rep's own stores.</p>
            </Faq>
            <Faq q="The missing-product finder shows nothing for a store — why?">
              <p>If the store already carries that SKU group, there's nothing to pitch — the finder is for stores that carry none of it. Pick a store marked ○ in the dropdown; ✓ means they already have it.</p>
            </Faq>
            <Faq q="Does the CSV export include everything or just what I see?">
              <p>Just what you see. Every CSV button exports the current rows with your filters, search and sort applied — so set the view up the way you want the file, then export.</p>
            </Faq>
            <Faq q="Why is a store missing from the reports entirely?">
              <p>Most likely it has only ever taken trade samples, which are filtered out so the reports reflect real revenue. It returns automatically the first time it places a paid order.</p>
            </Faq>
            <Faq q="How is Opportunity $ calculated?">
              <p>For each SKU group, take the average revenue per carrying store, multiply by the number of stores not carrying it, and weight by each non-carrier's overall spend potential. It's a deliberately conservative estimate of dollars left on the table.</p>
            </Faq>
          </Section>

          <footer className="mt-12 pt-6 border-t border-stone-200 text-[11px] text-stone-500 font-mono">
            Bamboo SKU Intelligence v2.2 · {a.meta.startDate} → {a.meta.endDate} · {a.meta.totalClients} retailers · {a.skus.length} SKU groups · {(a.products||[]).length} individual products · {a.meta.totalUnits.toLocaleString()} units
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
