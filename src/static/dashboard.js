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

function selectDateRange(readings, startDate, endDate) {
  const validDate = (value) => {
    if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return null;
  // Include both calendar dates in Beijing time, regardless of the browser's timezone.
  const start = Date.parse(startDate + "T00:00:00+08:00");
  const endExclusive = Date.parse(endDate + "T00:00:00+08:00") + 86400000;
  return readings.filter((row) => row.timestamp >= start && row.timestamp < endExclusive);
}

function bindChartPointerInteractions(chart, showAtPointer, hideTooltip) {
  let activePointer = null;
  chart.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    if (event.pointerType !== "mouse") chart.setPointerCapture(event.pointerId);
    showAtPointer(event);
  });
  chart.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.pointerId === activePointer) showAtPointer(event);
  });
  chart.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointer) return;
    showAtPointer(event);
    activePointer = null;
  });
  chart.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    hideTooltip();
  });
  chart.addEventListener("lostpointercapture", () => { activePointer = null; });
  // Touch screens emit pointerleave after a tap. Keep the selected reading visible.
  chart.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hideTooltip();
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = {calculateRecharge, selectDateRange, bindChartPointerInteractions};

(() => {
  if (typeof document === "undefined") return;
  const data = JSON.parse(document.getElementById("dashboard-data").textContent);
  const readings = data.records.map((row) => ({...row, timestamp: Date.parse(row.time)}));
  const chart = document.getElementById("trend-chart");
  const container = document.getElementById("chart-container");
  const tooltip = document.getElementById("chart-tooltip");
  const empty = document.getElementById("chart-empty");
  const period = document.getElementById("chart-period");
  const rangeButtons = [...document.querySelectorAll("[data-days]")];
  const customButton = document.getElementById("custom-range");
  const rangeSelector = document.getElementById("range-selector");
  const rangePopover = document.getElementById("date-range-popover");
  const rangeForm = document.getElementById("date-range-form");
  const startInput = document.getElementById("range-start");
  const endInput = document.getElementById("range-end");
  const rangeError = document.getElementById("range-error");
  const namespace = "http://www.w3.org/2000/svg";
  const day = 86400000;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
  });
  let activeRange = "30";
  let customRange = null;
  let chartState = null;
  let curveAnimation = null;

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

  function drawChart({animate = false} = {}) {
    curveAnimation?.cancel();
    curveAnimation = null;
    hideTooltip();
    chart.replaceChildren();
    chartState = null;
    const customLabel = customRange ? customRange.startDate.replaceAll("-", ".") + " — " + customRange.endDate.replaceAll("-", ".") : "";
    period.textContent = activeRange === "custom" ? customLabel : "等待首次采集";
    if (!readings.length) {
      empty.hidden = false;
      empty.textContent = "还没有电量记录，下一次采集后会显示在这里。";
      chart.setAttribute("aria-label", "暂无电量记录");
      return;
    }
    const latest = readings[readings.length - 1].timestamp;
    const points = activeRange === "custom" ? selectDateRange(readings, customRange.startDate, customRange.endDate) :
      activeRange === "all" ? readings : readings.filter((row) => row.timestamp >= latest - Number(activeRange) * day);
    if (!points.length) {
      empty.hidden = false;
      empty.textContent = "这个时间区间没有电量记录，试试其他日期。";
      chart.setAttribute("aria-label", customLabel + "，没有电量记录");
      return;
    }
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
    const series = svgElement("g", {class: "chart-series", "aria-hidden": "true"});
    series.append(
      svgElement("path", {d: path + " L" + x(points[points.length - 1]).toFixed(2) + " " + bottom + " L" + x(points[0]).toFixed(2) + " " + bottom + " Z", class: "chart-area"}),
      svgElement("path", {d: path, class: "chart-line"}),
      svgElement("circle", {cx: x(points[points.length - 1]), cy: y(points[points.length - 1].balance), r: 3.5, class: "chart-point"}),
    );
    chart.append(series);
    if (animate && !reducedMotion.matches && typeof series.animate === "function") {
      series.style.transformOrigin = "0 " + bottom + "px";
      curveAnimation = series.animate(
        [{transform: "scaleY(0)"}, {transform: "scaleY(1)"}],
        {duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)"},
      );
    }
    period.textContent = activeRange === "custom" ? customLabel : dateFormatter.format(new Date(start)).replace("/", ".") + " — " + dateFormatter.format(new Date(end)).replace("/", ".");
    chartState = {points, width, height, plot, x, y, selected: points.length - 1};
  }

  for (const button of rangeButtons) {
    button.addEventListener("click", () => {
      closeRange();
      if (activeRange === button.dataset.days) return;
      activeRange = button.dataset.days;
      for (const item of rangeButtons) item.setAttribute("aria-pressed", String(item === button));
      customButton.setAttribute("aria-pressed", "false");
      drawChart({animate: true});
    });
  }

  const inputDate = (timestamp) => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
  function clearRangeError() {
    rangeError.textContent = "";
    rangeError.hidden = true;
    startInput.setAttribute("aria-invalid", "false");
    endInput.setAttribute("aria-invalid", "false");
  }
  function closeRange({restoreFocus = false} = {}) {
    rangePopover.hidden = true;
    customButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) customButton.focus({preventScroll: true});
  }
  customButton.addEventListener("click", () => {
    if (!rangePopover.hidden) {
      closeRange({restoreFocus: true});
      return;
    }
    const points = chartState?.points;
    const latest = readings.length ? readings[readings.length - 1].timestamp : Date.now();
    startInput.value = customRange?.startDate || inputDate(points?.[0].timestamp ?? latest - 30 * day);
    endInput.value = customRange?.endDate || inputDate(points?.[points.length - 1].timestamp ?? latest);
    clearRangeError();
    rangePopover.hidden = false;
    customButton.setAttribute("aria-expanded", "true");
    startInput.focus({preventScroll: true});
    rangePopover.scrollIntoView({block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth"});
  });
  for (const button of rangePopover.querySelectorAll("[data-close-range]")) {
    button.addEventListener("click", () => closeRange({restoreFocus: true}));
  }
  document.addEventListener("pointerdown", (event) => {
    if (!rangePopover.hidden && !rangeSelector.contains(event.target)) closeRange();
    if (!container.contains(event.target)) hideTooltip();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !rangePopover.hidden) {
      event.preventDefault();
      closeRange({restoreFocus: true});
    }
  });
  document.addEventListener("focusin", (event) => {
    if (!rangePopover.hidden && !rangeSelector.contains(event.target)) closeRange();
    if (!container.contains(event.target)) hideTooltip();
  });
  startInput.addEventListener("input", clearRangeError);
  endInput.addEventListener("input", clearRangeError);
  rangeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearRangeError();
    if (!startInput.validity.valid || !endInput.validity.valid) {
      const invalidInput = !startInput.validity.valid ? startInput : endInput;
      invalidInput.setAttribute("aria-invalid", "true");
      rangeError.textContent = "请选择完整、有效的开始和结束日期。";
      rangeError.hidden = false;
      invalidInput.focus();
      return;
    }
    if (selectDateRange(readings, startInput.value, endInput.value) === null) {
      rangeError.textContent = "开始日期不能晚于结束日期。";
      rangeError.hidden = false;
      startInput.setAttribute("aria-invalid", "true");
      endInput.setAttribute("aria-invalid", "true");
      startInput.focus();
      return;
    }
    customRange = {startDate: startInput.value, endDate: endInput.value};
    activeRange = "custom";
    for (const button of rangeButtons) button.setAttribute("aria-pressed", "false");
    customButton.setAttribute("aria-pressed", "true");
    closeRange({restoreFocus: true});
    drawChart({animate: true});
  });
  bindChartPointerInteractions(chart, (event) => {
    if (!chartState) return;
    curveAnimation?.finish();
    const bounds = chart.getBoundingClientRect();
    if (!bounds.width) return;
    const position = (event.clientX - bounds.left) * chartState.width / bounds.width;
    let closest = 0;
    for (let index = 1; index < chartState.points.length; index += 1) {
      if (Math.abs(chartState.x(chartState.points[index]) - position) < Math.abs(chartState.x(chartState.points[closest]) - position)) closest = index;
    }
    showReading(closest);
  }, hideTooltip);
  chart.addEventListener("blur", hideTooltip);
  chart.addEventListener("keydown", (event) => {
    if (!chartState || curveAnimation?.playState === "running" || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    showReading(Math.max(0, Math.min(chartState.points.length - 1, chartState.selected + (event.key === "ArrowRight" ? 1 : -1))));
  });
  new ResizeObserver(() => drawChart()).observe(container);
  reducedMotion.addEventListener("change", () => drawChart());

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
