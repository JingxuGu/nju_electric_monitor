"use strict";

function calculateRecharge({balance, average, price, days}) {
  if (![balance, average, price, days].every(Number.isFinite) ||
      average <= 0 || price < 0.01 || price > 100 ||
      !Number.isInteger(days) || days < 1 || days > 365) return null;
  const required = Math.max(0, average * days - balance) * price;
  // Avoid adding another 10 yuan for floating-point noise at a round amount.
  const amount = Math.max(0, Math.ceil((required - 1e-9) / 10) * 10);
  return {amount, days: Math.max(0, balance + amount / price) / average};
}

if (typeof module !== "undefined" && module.exports) module.exports = {calculateRecharge};

(() => {
  if (typeof document === "undefined") return;
  const data = JSON.parse(document.getElementById("dashboard-data").textContent);
  const readings = data.records.map((row) => ({...row, timestamp: Date.parse(row.time)}));
  const chart = document.getElementById("trend-chart");
  const container = document.getElementById("chart-container");
  const tooltip = document.getElementById("chart-tooltip");
  const empty = document.getElementById("chart-empty");
  const rangeButtons = [...document.querySelectorAll("[data-days]")];
  const namespace = "http://www.w3.org/2000/svg";
  const day = 86400000;
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
  });
  let activeRange = "30";
  let chartState = null;

  function svgElement(tag, attributes, text) {
    const element = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function hideTooltip() {
    tooltip.hidden = true;
    chart.querySelector("[data-cursor]")?.remove();
  }

  function showReading(index) {
    if (!chartState) return;
    const {points, width, height, plot, x, y} = chartState;
    const point = points[index];
    if (!point) return;
    hideTooltip();
    const group = svgElement("g", {"data-cursor": "", "aria-hidden": "true"});
    group.append(
      svgElement("line", {x1: x(point), x2: x(point), y1: plot.top, y2: height - plot.bottom, class: "chart-cursor"}),
      svgElement("circle", {cx: x(point), cy: y(point.balance), r: 4.5, class: "chart-point"}),
    );
    chart.append(group);
    const value = document.createElement("strong");
    value.textContent = point.balance.toFixed(2) + " kWh";
    tooltip.replaceChildren(document.createTextNode(point.display_time), value);
    tooltip.hidden = false;
    const left = Math.min(Math.max(x(point) + 12, 4), width - tooltip.offsetWidth - 4);
    const top = Math.min(Math.max(y(point.balance) - tooltip.offsetHeight - 14, 2), height - tooltip.offsetHeight - 4);
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    chartState.selected = index;
  }

  function drawChart() {
    hideTooltip();
    chart.replaceChildren();
    chartState = null;
    if (!readings.length) {
      empty.hidden = false;
      document.getElementById("chart-period").textContent = "等待首次采集";
      return;
    }
    const latest = readings[readings.length - 1].timestamp;
    const points = activeRange === "all" ? readings : readings.filter((row) => row.timestamp >= latest - Number(activeRange) * day);
    empty.hidden = true;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    const plot = {left: width < 500 ? 38 : 44, right: 10, top: 15, bottom: 33};
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const start = points[0].timestamp;
    const end = points[points.length - 1].timestamp;
    const minBalance = points.reduce((value, row) => Math.min(value, row.balance), Infinity);
    const maxBalance = points.reduce((value, row) => Math.max(value, row.balance), -Infinity);
    const padding = Math.max((maxBalance - minBalance) * 0.17, 1);
    const minY = minBalance >= 0 ? Math.max(0, minBalance - padding) : minBalance - padding;
    const maxY = Math.max(maxBalance + padding, minY + 1);
    const x = (point) => end === start ? plot.left + plotWidth / 2 : plot.left + ((point.timestamp - start) / (end - start)) * plotWidth;
    const y = (value) => plot.top + (maxY - value) / (maxY - minY) * plotHeight;
    chart.setAttribute("viewBox", "0 0 " + width + " " + height);
    chart.setAttribute("aria-label", "剩余电量变化曲线，" + points.length + " 条记录；最新 " + points[points.length - 1].balance.toFixed(2) + " 千瓦时。用左右方向键查看读数。");
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = minY + (maxY - minY) * tick / 4;
      const position = y(value);
      chart.append(
        svgElement("line", {x1: plot.left, x2: width - plot.right, y1: position, y2: position, class: "chart-grid"}),
        svgElement("text", {x: plot.left - 11, y: position + 3, "text-anchor": "end", class: "chart-axis"}, value.toFixed(maxY - minY < 8 ? 1 : 0)),
      );
    }
    const tickCount = end === start ? 1 : width < 500 ? 3 : 6;
    for (let tick = 0; tick < tickCount; tick += 1) {
      const fraction = tickCount === 1 ? 0.5 : tick / (tickCount - 1);
      const timestamp = start + (end - start) * fraction;
      chart.append(svgElement("text", {
        x: plot.left + plotWidth * fraction, y: height - 8,
        "text-anchor": tickCount === 1 ? "middle" : tick === 0 ? "start" : tick === tickCount - 1 ? "end" : "middle",
        class: "chart-axis",
      }, dateFormatter.format(new Date(timestamp)).replace("/", ".")));
    }
    const path = points.map((point, index) => (index ? "L" : "M") + x(point).toFixed(2) + " " + y(point.balance).toFixed(2)).join(" ");
    const bottom = height - plot.bottom;
    chart.append(
      svgElement("path", {d: path + " L" + x(points[points.length - 1]).toFixed(2) + " " + bottom + " L" + x(points[0]).toFixed(2) + " " + bottom + " Z", class: "chart-area"}),
      svgElement("path", {d: path, class: "chart-line"}),
      svgElement("circle", {cx: x(points[points.length - 1]), cy: y(points[points.length - 1].balance), r: 3.5, class: "chart-point"}),
    );
    document.getElementById("chart-period").textContent = dateFormatter.format(new Date(start)).replace("/", ".") + " — " + dateFormatter.format(new Date(end)).replace("/", ".");
    chartState = {points, width, height, plot, x, y, selected: points.length - 1};
  }

  for (const button of rangeButtons) {
    button.addEventListener("click", () => {
      activeRange = button.dataset.days;
      for (const item of rangeButtons) item.setAttribute("aria-pressed", String(item === button));
      drawChart();
    });
  }
  chart.addEventListener("pointermove", (event) => {
    if (!chartState) return;
    const position = event.clientX - chart.getBoundingClientRect().left;
    let closest = 0;
    for (let index = 1; index < chartState.points.length; index += 1) {
      if (Math.abs(chartState.x(chartState.points[index]) - position) < Math.abs(chartState.x(chartState.points[closest]) - position)) closest = index;
    }
    showReading(closest);
  });
  chart.addEventListener("pointerleave", hideTooltip);
  chart.addEventListener("blur", hideTooltip);
  chart.addEventListener("keydown", (event) => {
    if (!chartState || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    showReading(Math.max(0, Math.min(chartState.points.length - 1, chartState.selected + (event.key === "ArrowRight" ? 1 : -1))));
  });
  new ResizeObserver(drawChart).observe(container);

  const daysInput = document.getElementById("target-days");
  const priceInput = document.getElementById("electricity-price");
  const rechargeAmount = document.getElementById("recharge-amount");
  const rechargeDays = document.getElementById("recharge-days");
  const rechargeStatus = document.getElementById("recharge-status");

  function updateRecharge() {
    const days = daysInput.valueAsNumber;
    const price = priceInput.valueAsNumber;
    const validDays = daysInput.validity.valid && Number.isFinite(days);
    const validPrice = priceInput.validity.valid && Number.isFinite(price);
    daysInput.setAttribute("aria-invalid", String(!validDays));
    priceInput.setAttribute("aria-invalid", String(!validPrice));
    const plan = validDays && validPrice ? calculateRecharge({balance: data.balance, average: data.daily_usage, price, days}) : null;
    rechargeAmount.textContent = plan ? String(plan.amount) : "—";
    rechargeDays.textContent = plan ? plan.days.toFixed(1) : "—";
    if (!validDays) {
      rechargeStatus.textContent = "请输入 1–365 之间的整数天数。";
    } else if (!validPrice) {
      rechargeStatus.textContent = "请输入 0.01–100 之间的有效电价。";
    } else if (data.balance === null || data.daily_usage === null) {
      rechargeStatus.textContent = "有效记录不足，暂时无法估算充值金额；至少需要一天的用电记录。";
    } else if (data.daily_usage <= 0) {
      rechargeStatus.textContent = "近期没有记录到电量减少，暂时无法估算使用天数。";
    } else if (plan) {
      rechargeStatus.textContent = plan.amount === 0 ? "现有电量预计已覆盖目标天数，暂时无需充值。" : "按 " + price.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + " 元/度，补足未来 " + days + " 天；实际使用时长随用电量变化。";
    }
  }
  daysInput.addEventListener("input", updateRecharge);
  priceInput.addEventListener("input", updateRecharge);
  updateRecharge();

  if (data.latest_iso) {
    const stale = Date.now() - Date.parse(data.latest_iso) > day;
    document.getElementById("freshness-text").textContent = stale ? "等待新数据" : "最近 24 小时内已更新";
    document.getElementById("freshness-dot").classList.toggle("is-stale", stale);
  }
})();
