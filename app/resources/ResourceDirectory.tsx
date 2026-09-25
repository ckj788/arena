"use client";

import { useRef, useState } from "react";
import Link from "@/app/components/NavigationLink";
import useSurfaceMotion from "@/app/components/useSurfaceMotion";
import { LAUNCH_RESOURCES, LAUNCH_SCENARIOS, type LaunchResource } from "@/lib/launchResources";

export default function ResourceDirectory() {
  const [query, setQuery] = useState("");
  const [cost, setCost] = useState("All");
  const [scenario, setScenario] = useState("All launches");
  const ref = useRef<HTMLDivElement>(null);
  useSurfaceMotion(true, ref);
  const resetFilters = () => { setQuery(""); setCost("All"); setScenario("All launches"); };
  const hasFilters = Boolean(query || cost !== "All" || scenario !== "All launches");
  const filtered = LAUNCH_RESOURCES.filter(item =>
    (cost === "All" || item.cost === cost) &&
    (!LAUNCH_SCENARIOS[scenario] || LAUNCH_SCENARIOS[scenario]!.includes(item.name)) &&
    `${item.name} ${item.kind} ${item.fit}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div ref={ref}>
      <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Quick platform selection">
        {[
          { title: "Start with no budget", detail: "Compare free tiers and their conditions", cost: "Free", scenario: "All launches" },
          { title: "Find builder feedback", detail: "Choose a community for a working demo", cost: "All", scenario: "Builder feedback" },
          { title: "List released software", detail: "Explore software and SaaS discovery", cost: "All", scenario: "SaaS & software" },
        ].map(choice => <button key={choice.title} type="button" onClick={() => { setQuery(""); setCost(choice.cost); setScenario(choice.scenario); }} className="group rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">
          <span className="flex items-center justify-between gap-2 text-sm font-semibold">{choice.title}<span aria-hidden="true" className="text-amber-700">↘</span></span>
          <span className="mt-1 block text-xs leading-5 text-zinc-600">{choice.detail}</span>
        </button>)}
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_200px]">
        <label className="text-xs font-medium text-zinc-600">Find a platform
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or audience" className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-950 focus:outline-amber-500" />
        </label>
        <label className="text-xs font-medium text-zinc-600">Submission cost
          <select value={cost} onChange={e => setCost(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-950 focus:outline-amber-500">
            {["All", "Free", "Paid", "Check plans"].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Launch scenario">
        {Object.keys(LAUNCH_SCENARIOS).map(value => <button key={value} type="button" aria-pressed={scenario === value} onClick={() => setScenario(value)} className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${scenario === value ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-100"}`}>{value}</button>)}
      </div>
      <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4">
        <p role="status" className="text-xs leading-6 text-zinc-500">{filtered.length} of {LAUNCH_RESOURCES.length} platforms · Alphabetical · Free tiers may have conditions</p>
        {hasFilters && <button type="button" onClick={resetFilters} className="min-h-11 text-sm font-medium underline underline-offset-4">Clear filters</button>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div aria-hidden="true" className="hidden grid-cols-[190px_1fr_1fr_24px] gap-5 border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-xs font-medium text-zinc-500 md:grid"><span>Platform / cost</span><span>Best fit</span><span>Timing & access</span><span /></div>
        {filtered.map(item => <ResourceCard key={item.name} item={item} />)}
      </div>
      {!filtered.length && <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
        <p className="text-zinc-600">No platforms match these filters.</p>
      </div>}
    </div>
  );
}

function ResourceCard({ item }: { item: LaunchResource }) {
  const buttonClass = "inline-flex min-h-11 items-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700";
  return <article className="border-b border-zinc-200 last:border-b-0">
    <details className="group">
    <summary className="relative grid cursor-pointer list-none items-start gap-3 p-5 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500 md:grid-cols-[190px_1fr_1fr_24px] md:gap-5 md:px-6 [&::-webkit-details-marker]:hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 md:block">
      <div><h3 className="pr-6 text-lg font-semibold tracking-tight">{item.name}</h3><p className="mt-1 text-xs text-zinc-500">{item.kind}</p></div>
      <span className={`mr-5 inline-block rounded-full px-2.5 py-1 text-xs font-medium md:mt-2 md:mr-0 ${item.cost === "Free" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{item.cost === "Free" ? "Free option" : item.cost}</span>
    </div>
    <p className="text-sm leading-6 text-zinc-600"><span className="sr-only">Best fit: </span>{item.fit}</p>
    <p className="text-sm leading-6 text-zinc-600"><span className="mr-1 font-medium text-zinc-800 md:sr-only">Timing:</span>{item.timing}</p>
    <span aria-hidden="true" className="absolute top-5 right-5 text-xl text-zinc-400 transition-transform group-open:rotate-45 motion-reduce:transition-none md:static">+</span>
    <span className="sr-only">Requirements, caveats and official sources</span>
    </summary>
    <div className="border-t border-zinc-100 bg-zinc-50/60 px-5 pt-2 pb-6 md:px-6">
    <dl className="my-3 grid gap-4 text-sm md:grid-cols-2">
      {[["What you get", item.listing], ["Website link", item.links]].map(([label, value]) => <div key={label}><dt className="font-medium text-zinc-900">{label}</dt><dd className="mt-1 leading-6 text-zinc-600">{value}</dd></div>)}
    </dl>
    <p className="mb-6 text-sm leading-6 text-zinc-600">{item.note}</p>
    <div className="mt-auto">
      {item.url.startsWith("/") ? <Link href={item.url} className={buttonClass}>Submit on Indie Clash →</Link> : <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass}>Visit {item.name} ↗</a>}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">{item.sources.map(source => <a key={source.url} href={source.url} target={source.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950">{source.label}</a>)}</div>
    </div>
    </div>
    </details>
  </article>;
}
