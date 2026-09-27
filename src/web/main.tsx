import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Summary } from "../shared/analytics.ts";
import type { DemoEvent, DemoRun, RemoteKey, Scenario, StoredEvent } from "../shared/contracts.ts";
import { api } from "./api.ts";
import { eventLabel, initialLanguage, interpolate, scenarioLabel, translations, type Language } from "./i18n.ts";
import { outbox } from "./outbox.ts";
import "./styles.css";

type Screen = "off" | "watch" | "catalog" | "product";
type Tab = "simulator" | "dashboard" | "events";
type ViewerSession = { sessionId: string; viewerId: string; sequence: number };
type FeedbackKey = keyof typeof translations.ko.feedback;
type Feedback = { key: FeedbackKey; values?: Record<string, string | number> };
type Connection = { status: "checking" | "connected" | "unavailable"; database?: string };

const broadcast = {
  channelId: "T-COMMERCE",
  broadcastId: "tcommerce-live-001",
  productId: "pan-set-01",
};

function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "dashboard" || value === "events" ? value : "simulator";
}

function formatTime(language: Language, value: string | Date): string {
  return new Intl.DateTimeFormat(translations[language].locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function metricValue(language: Language, value: number | null, suffix = ""): string {
  return value === null ? "-" : `${value.toLocaleString(translations[language].locale)}${suffix}`;
}

function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [connection, setConnection] = useState<Connection>({ status: "checking" });
  const [runs, setRuns] = useState<DemoRun[]>([]);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [screen, setScreen] = useState<Screen>("off");
  const [focus, setFocus] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [eventSource, setEventSource] = useState<"manual" | "synthetic" | "">("");
  const [sessionEvents, setSessionEvents] = useState<StoredEvent[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [isGeneratorRunning, setGeneratorRunning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ key: "ready" });
  const sessionRef = useRef<ViewerSession | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const flushingRef = useRef(false);
  const enqueueRef = useRef<(event: DemoEvent) => Promise<void>>(async () => undefined);
  const generatorIdRef = useRef(crypto.randomUUID());
  const copy = translations[language];
  const feedbackValues = feedback.key === "generatorStarted" && feedback.values?.scenario
    ? { ...feedback.values, scenario: scenarioLabel(language, feedback.values.scenario as Scenario) }
    : feedback.values;
  const feedbackText = interpolate(copy.feedback[feedback.key], feedbackValues);
  const connectionText = connection.status === "checking"
    ? copy.connection.checking
    : connection.status === "connected"
      ? interpolate(copy.connection.connected, { database: connection.database ?? "Atlas" })
      : copy.connection.unavailable;

  function changeLanguage(next: Language): void {
    setLanguage(next);
    window.localStorage.setItem("tcommerce-language", next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", url);
  }

  function changeTab(next: Tab): void {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }

  async function refreshOutboxCount(): Promise<void> {
    try {
      setQueueCount(await outbox.count());
    } catch {
      setFeedback({ key: "outboxUnavailable" });
    }
  }

  async function flushOutbox(): Promise<void> {
    if (flushingRef.current || connection.status !== "connected") return;
    flushingRef.current = true;
    try {
      const queued = await outbox.list();
      if (queued.length === 0) return;
      const { results } = await api.sendBatch(queued.slice(0, 100));
      await outbox.settle(results);
      const unresolved = results.filter((result) => result.status === "retryable");
      const rejected = results.filter((result) => result.status === "invalid" || result.status === "conflict");
      if (unresolved.length > 0) setFeedback({ key: "retrying", values: { count: unresolved.length } });
      if (rejected.length > 0) setFeedback({ key: "quarantined", values: { count: rejected.length } });
    } catch {
      setFeedback({ key: "transmissionPending" });
    } finally {
      flushingRef.current = false;
      await refreshOutboxCount();
    }
  }

  async function enqueue(event: DemoEvent): Promise<void> {
    await outbox.put(event);
    await refreshOutboxCount();
    await flushOutbox();
  }
  enqueueRef.current = enqueue;

  function buildManualEvent(eventType: DemoEvent["eventType"], extra: Partial<DemoEvent> = {}): DemoEvent | null {
    if (!run || !sessionRef.current) {
      setFeedback({ key: "enterFirst" });
      return null;
    }
    const session = sessionRef.current;
    session.sequence += 1;
    return {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      demoRunId: run._id,
      anonymousViewerId: session.viewerId,
      sessionId: session.sessionId,
      sequence: session.sequence,
      channelId: broadcast.channelId,
      broadcastId: broadcast.broadcastId,
      eventType,
      occurredAt: new Date().toISOString(),
      playbackPositionMs: Date.now() % 1_800_000,
      source: "manual",
      ...extra,
    };
  }

  async function emitManual(eventType: DemoEvent["eventType"], extra: Partial<DemoEvent> = {}): Promise<void> {
    const event = buildManualEvent(eventType, extra);
    if (event) await enqueue(event);
  }

  async function enterChannel(): Promise<void> {
    if (!run) {
      setFeedback({ key: "createFirst" });
      return;
    }
    if (screen !== "off") return;
    sessionRef.current = { sessionId: crypto.randomUUID(), viewerId: "manual-demo-viewer", sequence: 0 };
    setScreen("watch");
    setFocus(0);
    await emitManual("channel_enter");
    await emitManual("screen_view", { screenId: "watch" });
    setFeedback({ key: "entered" });
  }

  async function changeScreen(next: Exclude<Screen, "off">): Promise<void> {
    setScreen(next);
    await emitManual("screen_view", { screenId: next });
  }

  async function leaveChannel(): Promise<void> {
    if (screen === "off") return;
    await emitManual("channel_exit", { exitReason: "channel_change" });
    sessionRef.current = null;
    setScreen("off");
    setFeedback({ key: "exited" });
  }

  async function pressRemote(key: RemoteKey): Promise<void> {
    if (screen === "off") {
      if (key === "OK") await enterChannel();
      return;
    }
    await emitManual("remote_key", { remoteKey: key, screenId: screen });
    if (key === "UP" || key === "DOWN") {
      setFocus((current) => (current + (key === "UP" ? 2 : 1)) % 3);
      return;
    }
    if (key === "BACK") {
      if (screen === "product") await changeScreen("catalog");
      else if (screen === "catalog") await changeScreen("watch");
      return;
    }
    if (key === "OK") {
      if (screen === "watch") await changeScreen("catalog");
      else if (screen === "catalog") {
        await changeScreen("product");
        await emitManual("product_view", { productId: broadcast.productId });
      } else if (screen === "product") {
        await changeScreen("watch");
      }
    }
  }

  async function createRun(): Promise<void> {
    try {
      const newRun = await api.createRun({ scenario: "balanced", targetRate: 15 });
      setRun(newRun);
      setRuns((current) => [newRun, ...current]);
      setSummary(null);
      setEvents([]);
      setScreen("off");
      sessionRef.current = null;
      setFeedback({ key: "runCreated" });
    } catch {
      setFeedback({ key: "runCreateFailed" });
    }
  }

  async function updateRun(input: Partial<Pick<DemoRun, "status" | "scenario" | "targetRate">>): Promise<void> {
    if (!run) return;
    try {
      const next = await api.updateRun(run._id, input);
      setRun(next);
      setRuns((current) => current.map((candidate) => candidate._id === next._id ? next : candidate));
    } catch {
      setFeedback({ key: "runUpdateFailed" });
    }
  }

  function toggleGenerator(): void {
    if (!run || run.status !== "running") {
      setFeedback({ key: "runningRequired" });
      return;
    }
    if (isGeneratorRunning) {
      workerRef.current?.postMessage({ type: "stop" });
      setGeneratorRunning(false);
      localStorage.removeItem("tcommerce-generator-lock");
      setFeedback({ key: "generatorStopped" });
      return;
    }
    const savedLock = localStorage.getItem("tcommerce-generator-lock");
    if (savedLock) {
      try {
        const lock = JSON.parse(savedLock) as { id: string; expiresAt: number };
        if (lock.id !== generatorIdRef.current && lock.expiresAt > Date.now()) {
          setFeedback({ key: "generatorInOtherTab" });
          return;
        }
      } catch {
        localStorage.removeItem("tcommerce-generator-lock");
      }
    }
    localStorage.setItem("tcommerce-generator-lock", JSON.stringify({ id: generatorIdRef.current, expiresAt: Date.now() + 10_000 }));
    setGeneratorRunning(true);
    setFeedback({ key: "generatorStarted", values: { scenario: run.scenario, rate: run.targetRate } });
  }

  async function openSession(sessionId: string): Promise<void> {
    if (!run) return;
    try {
      const response = await api.sessionEvents(run._id, sessionId);
      setSelectedSession(sessionId);
      setSessionEvents(response.events);
    } catch {
      setFeedback({ key: "sessionLoadFailed" });
    }
  }

  useEffect(() => {
    let mounted = true;
    async function checkConnection(): Promise<void> {
      try {
        const health = await api.health();
        if (mounted) setConnection({ status: "connected", database: health.database });
      } catch {
        if (mounted) setConnection({ status: "unavailable" });
      }
    }
    void checkConnection();
    void api.listRuns().then((items) => {
      if (!mounted) return;
      setRuns(items);
      if (new URLSearchParams(window.location.search).get("run") === "latest" && items[0]) {
        setRun(items[0]);
        setFeedback({ key: "latestRunSelected" });
      }
    }).catch(() => undefined);
    void refreshOutboxCount();
    const interval = window.setInterval(checkConnection, 5_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = copy.pageTitle;
  }, [language, copy.pageTitle]);

  useEffect(() => {
    const worker = new Worker(new URL("./synthetic-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<{ type: string; event?: DemoEvent }>) => {
      if (data.type === "event" && data.event) void enqueueRef.current(data.event);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!isGeneratorRunning || !run) return;
    workerRef.current?.postMessage({
      type: "start",
      demoRunId: run._id,
      scenario: run.scenario,
      targetRate: run.targetRate,
      channelId: broadcast.channelId,
      broadcastId: broadcast.broadcastId,
      productId: broadcast.productId,
    });
  }, [isGeneratorRunning, run?._id, run?.scenario, run?.targetRate]);

  useEffect(() => {
    if (!run) return;
    const demoRunId = run._id;
    let mounted = true;
    async function refresh(): Promise<void> {
      try {
        const [nextSummary, nextEvents] = await Promise.all([api.summary(demoRunId), api.events(demoRunId, eventSource || undefined)]);
        if (!mounted) return;
        setSummary(nextSummary);
        setEvents(nextEvents.events);
      } catch {
        if (mounted) setFeedback({ key: "queryFailed" });
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 1_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [run?._id, eventSource]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isGeneratorRunning) localStorage.setItem("tcommerce-generator-lock", JSON.stringify({ id: generatorIdRef.current, expiresAt: Date.now() + 10_000 }));
      void flushOutbox();
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [connection.status, isGeneratorRunning]);

  useEffect(() => () => {
    if (localStorage.getItem("tcommerce-generator-lock")?.includes(generatorIdRef.current)) localStorage.removeItem("tcommerce-generator-lock");
  }, []);

  const timelineMax = Math.max(1, ...(summary?.timeline.map((item) => item.entries + item.exits + item.remoteKeys) ?? []));

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T+</span>
          <div><strong>Behavior Studio</strong><small>T-commerce live signal console</small></div>
        </div>
        <nav aria-label={copy.navLabel}>
          {(["simulator", "dashboard", "events"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => changeTab(item)}>{copy.tabs[item]}</button>)}
        </nav>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label="Language / 언어">
            <button className={language === "ko" ? "active" : ""} onClick={() => changeLanguage("ko")} aria-pressed={language === "ko"}>KO</button>
            <button className={language === "en" ? "active" : ""} onClick={() => changeLanguage("en")} aria-pressed={language === "en"}>EN</button>
          </div>
          <div className={`connection ${connection.status}`}><span />{connectionText}</div>
        </div>
      </header>

      <section className="control-strip">
        <div><span className="eyebrow">DEMO RUN</span><strong>{run ? run._id.slice(0, 8).toUpperCase() : copy.controls.noRun}</strong><small>{run ? interpolate(copy.controls.runSummary, { scenario: scenarioLabel(language, run.scenario), rate: run.targetRate }) : copy.controls.createAfterConnect}</small></div>
        <div className="control-actions">
          <select value={run?.scenario ?? "balanced"} disabled={!run} onChange={(event) => void updateRun({ scenario: event.target.value as Scenario })} aria-label={copy.controls.scenarioLabel}>
            {(["balanced", "explore", "early_exit"] as Scenario[]).map((scenario) => <option key={scenario} value={scenario}>{scenarioLabel(language, scenario)}</option>)}
          </select>
          <select value={run?.targetRate ?? 15} disabled={!run} onChange={(event) => void updateRun({ targetRate: Number(event.target.value) })} aria-label={copy.controls.rateLabel}>
            {[5, 15, 50].map((rate) => <option key={rate} value={rate}>{interpolate(copy.controls.rate, { rate })}</option>)}
          </select>
          <button className="outline" onClick={() => void createRun()} disabled={connection.status !== "connected"}>{copy.controls.newRun}</button>
          <button className={isGeneratorRunning ? "danger" : "primary"} onClick={toggleGenerator} disabled={!run}>{isGeneratorRunning ? copy.controls.stopGenerator : copy.controls.startGenerator}</button>
        </div>
      </section>

      <p className="notice"><strong>{copy.notice.badge}</strong><span>{feedbackText}</span><span className="queue">{interpolate(copy.notice.queue, { count: queueCount })}</span></p>

      {tab === "simulator" && <section className="simulator-layout">
        <div className="broadcast-stage">
          <div className="broadcast-header"><span className={screen === "off" ? "live idle" : "live"}>{screen === "off" ? "OFF AIR" : "LIVE"}</span><span>{copy.broadcast.channel}</span><span>{screen === "off" ? copy.broadcast.selectChannel : copy.broadcast.progress}</span></div>
          <div className="broadcast-body">
            {screen === "off" && <div className="off-air"><span>36</span><h1>{copy.broadcast.showTitle}</h1><p>{copy.broadcast.enterInstruction}</p><button className="primary" onClick={() => void enterChannel()}>{copy.broadcast.enter}</button></div>}
            {screen === "watch" && <><div className="host-copy"><span>LIVE PRICE</span><h1>{copy.broadcast.heroTitle.split("\n").map((line, index) => <span className="hero-line" key={line}>{line}{index === 0 && <br />}</span>)}</h1><p>{copy.broadcast.heroCopy}</p></div><div className="pan-art"><i /><i /><i /></div><div className="product-chip"><small>{copy.broadcast.todayProduct}</small><strong>{copy.broadcast.productName}</strong><b>{copy.broadcast.productPrice}</b></div></>}
            {screen === "catalog" && <div className="catalog"><span className="eyebrow">{copy.broadcast.chooseProduct}</span><h1>{copy.broadcast.todayProducts}</h1>{copy.broadcast.products.map((product, index) => <button key={product} className={focus === index ? "selected" : ""} onClick={() => { setFocus(index); void pressRemote("OK"); }}><span>0{index + 1}</span>{product}<em>{copy.broadcast.detail}</em></button>)}</div>}
            {screen === "product" && <div className="product-detail"><span className="eyebrow">PRODUCT DETAIL</span><h1>{copy.broadcast.productName}</h1><p>{copy.broadcast.productDescription}</p><b>{copy.broadcast.productPrice}</b><div><button className="primary" onClick={() => void pressRemote("BACK")}>{copy.broadcast.backToList}</button><button className="outline" onClick={() => void pressRemote("OK")}>{copy.broadcast.continueWatching}</button></div></div>}
          </div>
          <div className="progress"><span /><small>00:18:24</small><small>00:42:00</small></div>
        </div>
        <aside className="remote-panel">
          <div className="remote-heading"><span className="eyebrow">VIEWER CONTROL</span><strong>{copy.remote.title}</strong><small>{copy.remote.help}</small></div>
          <div className="remote" tabIndex={0} onKeyDown={(event) => {
            const keys: Record<string, RemoteKey> = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT", Enter: "OK", Escape: "BACK" };
            const key = keys[event.key]; if (key) { event.preventDefault(); void pressRemote(key); }
          }}>
            <button className="remote-back" onClick={() => void pressRemote("BACK")}>{copy.remote.back}</button>
            <button className="remote-key up" onClick={() => void pressRemote("UP")}>▲</button>
            <button className="remote-key left" onClick={() => void pressRemote("LEFT")}>◀</button>
            <button className="remote-ok" onClick={() => void pressRemote("OK")}>{copy.remote.ok}</button>
            <button className="remote-key right" onClick={() => void pressRemote("RIGHT")}>▶</button>
            <button className="remote-key down" onClick={() => void pressRemote("DOWN")}>▼</button>
            <button className="channel-change" onClick={() => void leaveChannel()}>{copy.remote.leave}</button>
          </div>
          <div className="signal-status"><span>{copy.remote.collectionStatus}</span><strong>{connection.status === "connected" ? copy.remote.ready : copy.remote.pending}</strong></div>
        </aside>
      </section>}

      {tab === "dashboard" && <section className="dashboard">
        {!run ? <EmptyState title={copy.dashboard.emptyTitle} text={copy.dashboard.emptyText} /> : <>
          <div className="section-heading"><div><span className="eyebrow">LIVE ANALYTICS</span><h1>{copy.dashboard.title}</h1></div><div className="heading-controls"><select value={eventSource} onChange={(event) => setEventSource(event.target.value as "" | "manual" | "synthetic")}><option value="">{copy.filters.allData}</option><option value="manual">{copy.filters.manual}</option><option value="synthetic">{copy.filters.synthetic}</option></select><small>{interpolate(copy.dashboard.updated, { time: summary ? formatTime(language, summary.asOf) : "-" })}</small></div></div>
          <div className="metrics-grid">
            <Metric label={copy.dashboard.entries} value={metricValue(language, summary?.metrics.entries ?? null)} note={copy.dashboard.uniqueSessions} tone="cyan" />
            <Metric label={copy.dashboard.active} value={metricValue(language, summary?.metrics.activeSessions ?? null)} note={copy.dashboard.recentActivity} tone="lime" />
            <Metric label={copy.dashboard.exits} value={metricValue(language, summary?.metrics.explicitExits ?? null)} note={copy.dashboard.channelChange} tone="coral" />
            <Metric label={copy.dashboard.productReach} value={formatPercent(summary?.metrics.productReachRate ?? null)} note={interpolate(copy.dashboard.interestedSessions, { count: metricValue(language, summary?.metrics.interestedSessions ?? null) })} tone="yellow" />
          </div>
          <div className="chart-grid">
            <article className="card timeline-card"><div className="card-title"><div><span className="eyebrow">EVENT FLOW</span><h2>{copy.dashboard.flow}</h2></div><strong>{interpolate(copy.dashboard.actions, { count: metricValue(language, summary?.metrics.remoteKeys ?? null) })}</strong></div><div className="timeline-chart">{summary?.timeline.slice(-16).map((item) => <div className="bar-group" key={item.second}><i style={{ height: `${((item.entries + item.exits + item.remoteKeys) / timelineMax) * 100}%` }} title={interpolate(copy.dashboard.eventCount, { count: item.entries + item.exits + item.remoteKeys })} /><small>{interpolate(copy.dashboard.seconds, { value: item.second.slice(-2) })}</small></div>)}</div><div className="legend"><span><i className="dot cyan" />{copy.dashboard.entryLegend}</span><span><i className="dot coral" />{copy.dashboard.exitLegend}</span><span><i className="dot lime" />{copy.dashboard.remoteLegend}</span></div></article>
            <article className="card"><div className="card-title"><div><span className="eyebrow">REMOTE MIX</span><h2>{copy.dashboard.remoteMix}</h2></div></div><div className="key-list">{summary?.remoteKeys.length ? summary.remoteKeys.map((item) => <div key={item.key}><span>{item.key}</span><b>{item.count}</b><i style={{ width: `${Math.min(100, item.count * 12)}%` }} /></div>) : <p className="empty-copy">{copy.dashboard.noRemote}</p>}</div></article>
          </div>
        </>}
      </section>}

      {tab === "events" && <section className="events-view">
        <div className="section-heading"><div><span className="eyebrow">EVENT EXPLORER</span><h1>{copy.events.title}</h1></div><select value={eventSource} onChange={(event) => setEventSource(event.target.value as "" | "manual" | "synthetic")}><option value="">{copy.filters.allSources}</option><option value="manual">{copy.filters.manual}</option><option value="synthetic">{copy.filters.synthetic}</option></select></div>
        {!run ? <EmptyState title={copy.events.emptyTitle} text={copy.events.emptyText} /> : <div className="event-grid"><article className="card event-table"><div className="table-head"><span>{copy.events.time}</span><span>{copy.events.type}</span><span>{copy.events.source}</span><span>{copy.events.session}</span></div>{events.length ? events.map((event) => <button className="event-row" key={event._id} onClick={() => void openSession(event.sessionId)}><span>{formatTime(language, event.occurredAt)}</span><strong>{eventLabel(language, event)}</strong><span className={`source ${event.source}`}>{event.source === "manual" ? copy.filters.manual : copy.filters.synthetic}</span><code>{event.sessionId.slice(0, 8)}</code></button>) : <p className="empty-copy">{copy.events.noEvents}</p>}</article><article className="card journey"><div className="card-title"><div><span className="eyebrow">SESSION JOURNEY</span><h2>{selectedSession ? interpolate(copy.events.selectedSession, { id: selectedSession.slice(0, 8) }) : copy.events.selectEvent}</h2></div></div>{sessionEvents.length ? <ol>{sessionEvents.map((event) => <li key={event._id}><time>{formatTime(language, event.occurredAt)}</time><span>{eventLabel(language, event)}</span><small>#{event.sequence}</small></li>)}</ol> : <p className="empty-copy">{copy.events.journeyHelp}</p>}</article></div>}
      </section>}
    </main>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
