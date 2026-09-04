function dayKey(value, timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function gatewayStatistics(runs = [], accounts = [], now = new Date(), timeZone = 'Asia/Shanghai') {
  const events = runs.filter(run => run.action === 'gateway');
  const accountNames = new Map(accounts.map(account => [account.id, account.name]));
  const requests = new Map();
  for (const event of events) {
    const key = event.requestId || event.id;
    if (!requests.has(key)) requests.set(key, []);
    requests.get(key).push(event);
  }
  const today = dayKey(now, timeZone);
  const summarize = groups => {
    const list = [...groups.values()];
    const successful = list.filter(items => items.some(item => item.status === 'ok')).length;
    return { requests: list.length, successful, failed: list.length - successful, successRate: list.length ? Math.round(successful * 1000 / list.length) / 10 : 0 };
  };
  const todayGroups = new Map([...requests].filter(([, items]) => dayKey(items[0].startedAt, timeZone) === today));
  const siteMap = new Map(); const modelMap = new Map();
  for (const event of events) {
    const site = accountNames.get(event.accountId) || '已删除站点';
    for (const [map, key] of [[siteMap, site], [modelMap, event.modelName || '未知模型']]) {
      if (!map.has(key)) map.set(key, { name: key, attempts: 0, successful: 0, failed: 0, latencyTotal: 0, latencyCount: 0 });
      const row = map.get(key); row.attempts += 1; event.status === 'ok' ? row.successful += 1 : row.failed += 1;
      if (Number.isFinite(event.latencyMs)) { row.latencyTotal += event.latencyMs; row.latencyCount += 1; }
    }
  }
  const finishRows = map => [...map.values()].map(row => ({ ...row, averageLatencyMs: row.latencyCount ? Math.round(row.latencyTotal / row.latencyCount) : null })).sort((a, b) => b.successful - a.successful || b.attempts - a.attempts);
  const all = summarize(requests); const todaySummary = summarize(todayGroups);
  const switched = [...requests.values()].filter(items => items.length > 1).length;
  const successLatencies = events.filter(item => item.status === 'ok' && Number.isFinite(item.latencyMs)).map(item => item.latencyMs);
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now); date.setDate(date.getDate() - offset); const key = dayKey(date, timeZone);
    const groups = new Map([...requests].filter(([, items]) => dayKey(items[0].startedAt, timeZone) === key));
    days.push({ date: key, ...summarize(groups) });
  }
  return { today: todaySummary, all: { ...all, switched, averageLatencyMs: successLatencies.length ? Math.round(successLatencies.reduce((a, b) => a + b, 0) / successLatencies.length) : null }, days, sites: finishRows(siteMap), models: finishRows(modelMap) };
}
