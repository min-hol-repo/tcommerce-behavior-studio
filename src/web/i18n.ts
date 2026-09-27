import type { DemoEvent, Scenario } from "../shared/contracts.ts";

export type Language = "ko" | "en";

export const translations = {
  ko: {
    locale: "ko-KR",
    pageTitle: "T-Commerce 고객 행동 분석 데모",
    navLabel: "주요 화면",
    tabs: { simulator: "방송 시뮬레이터", dashboard: "실시간 분석", events: "이벤트 탐색기" },
    connection: { checking: "Atlas 연결 확인 중", connected: "{database} 연결됨", unavailable: "Atlas 연결 불가" },
    scenario: { balanced: "균형 시청", explore: "상품 탐색 증가", early_exit: "조기 이탈 증가" },
    controls: {
      noRun: "실행 없음", runSummary: "{scenario} · 목표 {rate}건/초", createAfterConnect: "Atlas 연결 후 새 실행을 만드세요",
      scenarioLabel: "가상 시청자 시나리오", rateLabel: "가상 이벤트 속도", rate: "{rate}건/초",
      newRun: "새 실행", startGenerator: "가상 시청자 시작", stopGenerator: "생성 중지",
    },
    notice: { badge: "합성 데이터 기반 데모", queue: "전송 대기 {count}건" },
    feedback: {
      ready: "새 실행을 만들어 시연을 시작하세요.", outboxUnavailable: "이 브라우저에서 전송 대기열을 사용할 수 없습니다.",
      retrying: "{count}건의 저장 결과를 다시 확인합니다.", quarantined: "{count}건의 이벤트가 격리되었습니다.",
      transmissionPending: "전송 대기 중입니다.", enterFirst: "먼저 채널에 진입하세요.", createFirst: "시연 실행을 먼저 만드세요.",
      entered: "채널에 진입했습니다. 리모컨 조작이 Atlas로 전송됩니다.", exited: "채널 이탈 이벤트를 기록했습니다.",
      runCreated: "새 시연 실행을 만들었습니다. 채널에 진입하세요.", latestRunSelected: "최근 데모 실행을 선택했습니다. 채널에 진입하거나 분석 화면을 확인하세요.", runCreateFailed: "새 실행을 만들지 못했습니다.",
      runUpdateFailed: "실행 상태를 변경하지 못했습니다.", runningRequired: "실행 중인 데모에서만 가상 시청자를 시작할 수 있습니다.",
      generatorStopped: "가상 시청자 생성을 중지했습니다.", generatorInOtherTab: "다른 탭에서 가상 시청자 생성기가 실행 중입니다.",
      generatorStarted: "{scenario} 시나리오를 {rate}건/초 목표로 시작했습니다.", sessionLoadFailed: "세션을 불러오지 못했습니다.",
      queryFailed: "데이터 조회에 실패했습니다.", requestFailed: "요청을 처리하지 못했습니다.",
    },
    broadcast: {
      channel: "채널 36 · T-COMMERCE", selectChannel: "채널을 선택하세요", progress: "방송 진행 00:18:24",
      showTitle: "오늘의 라이브 쇼핑", enterInstruction: "리모컨 확인 버튼으로 채널에 진입하세요.", enter: "채널 진입",
      heroTitle: "집밥의 온도를\n오래 지켜주는 팬", heroCopy: "오늘 단 하루, 3종 구성을 특별가로 소개합니다.",
      todayProduct: "오늘의 상품", chooseProduct: "상품 선택", todayProducts: "오늘 방송 상품", detail: "상세 보기",
      productName: "스테인리스 프라이팬 3종 세트", productPrice: "89,000원",
      productDescription: "고른 열 전달과 세척 편의성을 갖춘 데일리 조리 세트입니다.",
      products: ["스테인리스 프라이팬 3종 세트", "내열 유리 밀폐용기", "대나무 조리도구 세트"],
      backToList: "목록으로", continueWatching: "방송 계속 보기",
    },
    remote: {
      title: "TV 리모컨", help: "클릭 또는 키보드 방향키", back: "뒤로", ok: "확인", leave: "채널 변경 / 이탈",
      collectionStatus: "수집 상태", ready: "Atlas 전송 가능", pending: "전송 대기",
    },
    filters: { allData: "전체 데이터", allSources: "전체 출처", manual: "수동 조작", synthetic: "가상 시청자" },
    dashboard: {
      emptyTitle: "분석할 실행이 없습니다", emptyText: "새 실행을 만들면 실시간 지표를 조회합니다.",
      title: "방송 반응을 한눈에", updated: "마지막 갱신 {time}",
      entries: "채널 진입", uniqueSessions: "고유 세션", active: "현재 시청 추정", recentActivity: "최근 45초 활동",
      exits: "명시적 이탈", channelChange: "채널 변경 기준", productReach: "상품 상세 도달", interestedSessions: "{count} 관심 세션",
      flow: "최근 행동 흐름", actions: "{count} 조작", entryLegend: "진입", exitLegend: "이탈", remoteLegend: "리모컨",
      seconds: "{value}초", eventCount: "{count}건", remoteMix: "리모컨 조작 분포", noRemote: "아직 리모컨 조작이 없습니다.",
    },
    events: {
      title: "원본 이벤트와 시청 여정", emptyTitle: "조회할 실행이 없습니다", emptyText: "새 실행에서 생성한 이벤트를 원본 그대로 확인할 수 있습니다.",
      time: "시각", type: "유형", source: "출처", session: "세션", noEvents: "표시할 이벤트가 없습니다.",
      selectedSession: "세션 {id}", selectEvent: "이벤트를 선택하세요", journeyHelp: "왼쪽 이벤트를 선택하면 세션별 행동 순서를 보여줍니다.",
    },
    eventLabels: {
      channel_enter: "채널 진입", channel_exit: "채널 이탈", remote_key: "리모컨 {value}", screen_view: "화면 {value}",
      product_view: "상품 상세 조회", purchase_intent: "구매 안내 열기", heartbeat: "시청 신호",
    },
  },
  en: {
    locale: "en-US",
    pageTitle: "T-Commerce Viewer Behavior Demo",
    navLabel: "Primary navigation",
    tabs: { simulator: "Broadcast Simulator", dashboard: "Live Analytics", events: "Event Explorer" },
    connection: { checking: "Checking Atlas connection", connected: "Connected to {database}", unavailable: "Atlas unavailable" },
    scenario: { balanced: "Balanced viewing", explore: "Product exploration", early_exit: "Early exits" },
    controls: {
      noRun: "No run", runSummary: "{scenario} · target {rate} events/s", createAfterConnect: "Connect to Atlas, then create a run",
      scenarioLabel: "Synthetic viewer scenario", rateLabel: "Synthetic event rate", rate: "{rate} events/s",
      newRun: "New run", startGenerator: "Start synthetic viewers", stopGenerator: "Stop generator",
    },
    notice: { badge: "Synthetic-data demo", queue: "Outbox {count}" },
    feedback: {
      ready: "Create a run to start the demo.", outboxUnavailable: "The event outbox is unavailable in this browser.",
      retrying: "Rechecking {count} unconfirmed event(s).", quarantined: "Quarantined {count} rejected event(s).",
      transmissionPending: "Events are waiting to be transmitted.", enterFirst: "Enter the channel first.", createFirst: "Create a demo run first.",
      entered: "Channel entered. Remote actions are being sent to Atlas.", exited: "Recorded an explicit channel exit.",
      runCreated: "Created a new demo run. Enter the channel to continue.", latestRunSelected: "Selected the latest demo run. Enter the channel or open live analytics.", runCreateFailed: "Could not create a new run.",
      runUpdateFailed: "Could not update the run.", runningRequired: "Synthetic viewers require a running demo.",
      generatorStopped: "Stopped the synthetic viewer generator.", generatorInOtherTab: "The synthetic viewer generator is already running in another tab.",
      generatorStarted: "Started {scenario} at a target of {rate} events/s.", sessionLoadFailed: "Could not load the session.",
      queryFailed: "Could not refresh analytics data.", requestFailed: "The request could not be completed.",
    },
    broadcast: {
      channel: "CHANNEL 36 · T-COMMERCE", selectChannel: "Select the channel", progress: "On air · 00:18:24",
      showTitle: "Today's Live Shopping", enterInstruction: "Press OK on the remote to enter the channel.", enter: "Enter channel",
      heroTitle: "A pan that keeps\nyour meal warm", heroCopy: "A three-piece everyday cookware set, available today.",
      todayProduct: "Featured product", chooseProduct: "Choose a product", todayProducts: "Products on air", detail: "View details",
      productName: "Stainless Frying Pan Set", productPrice: "KRW 89,000",
      productDescription: "An everyday cookware set designed for even heat distribution and easy cleanup.",
      products: ["Stainless Frying Pan Set", "Heat-resistant Glass Containers", "Bamboo Utensil Set"],
      backToList: "Back to list", continueWatching: "Continue watching",
    },
    remote: {
      title: "TV Remote", help: "Click or use the keyboard arrows", back: "Back", ok: "OK", leave: "Change channel / Exit",
      collectionStatus: "Collection status", ready: "Atlas ready", pending: "Waiting to send",
    },
    filters: { allData: "All data", allSources: "All sources", manual: "Manual", synthetic: "Synthetic" },
    dashboard: {
      emptyTitle: "No run selected", emptyText: "Create a run to view live analytics.",
      title: "Viewer response at a glance", updated: "Updated {time}",
      entries: "Channel entries", uniqueSessions: "Unique sessions", active: "Estimated active", recentActivity: "Activity within 45s",
      exits: "Explicit exits", channelChange: "Channel changes", productReach: "Product detail reach", interestedSessions: "{count} interested sessions",
      flow: "Recent event flow", actions: "{count} actions", entryLegend: "Entries", exitLegend: "Exits", remoteLegend: "Remote keys",
      seconds: "{value}s", eventCount: "{count} events", remoteMix: "Remote key distribution", noRemote: "No remote actions yet.",
    },
    events: {
      title: "Raw events and viewer journey", emptyTitle: "No run selected", emptyText: "Create a run to inspect its raw events.",
      time: "Time", type: "Type", source: "Source", session: "Session", noEvents: "No events to display.",
      selectedSession: "Session {id}", selectEvent: "Select an event", journeyHelp: "Select an event on the left to inspect its session journey.",
    },
    eventLabels: {
      channel_enter: "Channel enter", channel_exit: "Channel exit", remote_key: "Remote {value}", screen_view: "Screen {value}",
      product_view: "Product detail view", purchase_intent: "Purchase guide opened", heartbeat: "Viewer heartbeat",
    },
  },
} as const;

export type Translation = (typeof translations)[Language];

export function interpolate(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function initialLanguage(): Language {
  const query = new URLSearchParams(window.location.search).get("lang");
  if (query === "ko" || query === "en") return query;
  const stored = window.localStorage.getItem("tcommerce-language");
  if (stored === "ko" || stored === "en") return stored;
  return "en";
}

export function scenarioLabel(language: Language, scenario: Scenario): string {
  return translations[language].scenario[scenario];
}

export function eventLabel(language: Language, event: Pick<DemoEvent, "eventType" | "remoteKey" | "screenId">): string {
  const value = event.eventType === "remote_key" ? event.remoteKey ?? "" : event.eventType === "screen_view" ? event.screenId ?? "" : "";
  return interpolate(translations[language].eventLabels[event.eventType], { value });
}
