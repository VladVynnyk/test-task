import { WORLDS, PRODUCTS, QUIZZES, GUIDE_CATALOG, GUIDE_POLICY, SESSION_KEY } from './config.js';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const ids = Object.keys(PRODUCTS);
const modes = Object.keys(WORLDS);
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (amount) => `${new Intl.NumberFormat('uk-UA').format(amount)} грн`;
const photo = (product, className = '') => `<span class="product-thumb ${className}">${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.imageAlt)}" loading="lazy">` : ''}<span class="thumb-rune" ${product.image ? 'hidden' : ''} aria-hidden="true">${WORLDS[product.world].rune}</span></span>`;
const variants = (id) => Object.keys(PRODUCTS[id].variants).map(Number).sort((a, b) => a - b);
const initialQuiz = () => ({ index: 0, answers: [], completed: false });
const announced = (message) => { $('theme-status').textContent = message; };

function sanitize(raw) {
  const quizzes = {};
  for (const mode of modes) {
    const source = raw?.quizByWorld?.[mode] || (raw?.quizMode === mode ? raw.quiz : null);
    const questions = QUIZZES[mode].questions;
    const answers = questions.map((q, i) => Number.isInteger(source?.answers?.[i]) && source.answers[i] >= 0 && source.answers[i] < q.options.length ? source.answers[i] : null);
    quizzes[mode] = { index: Math.max(0, Math.min(questions.length - 1, Number(source?.index) || 0)), answers, completed: Boolean(source?.completed) && answers.every((v) => v !== null) };
  }
  const seen = new Set();
  const items = Array.isArray(raw?.items) ? raw.items.filter((x) => ids.includes(x?.productId) && !seen.has(x.productId) && seen.add(x.productId)).map((x) => ({
    productId: x.productId,
    variant: variants(x.productId).includes(Number(x.variant)) ? Number(x.variant) : 60,
    quantity: Math.max(1, Math.min(9, Number.parseInt(x.quantity, 10) || 1))
  })) : [];
  return {
    mode: modes.includes(raw?.mode) ? raw.mode : 'default',
    quizByWorld: quizzes,
    chestOpened: Boolean(raw?.chestOpened),
    activeProduct: ids.includes(raw?.activeProduct) ? raw.activeProduct : null,
    draftVariants: Object.fromEntries(ids.map((id) => [id, variants(id).includes(Number(raw?.draftVariants?.[id])) ? Number(raw.draftVariants[id]) : 60])),
    items,
    selectedGuideIds: Array.isArray(raw?.selectedGuideIds) ? [...new Set(raw.selectedGuideIds.filter((id) => GUIDE_CATALOG.some((g) => g.id === id)))] : []
  };
}
let saved = null;
try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('molfar-journey-v3') || 'null'); } catch { /* Storage can be unavailable. */ }
const state = sanitize(saved);
if (params.has('mode')) state.mode = modes.includes(params.get('mode')) ? params.get('mode') : 'default';
if (WORLDS[state.mode].productId) state.activeProduct = WORLDS[state.mode].productId;
const quiz = () => state.quizByWorld[state.mode];
const itemFor = (id) => state.items.find((x) => x.productId === id);
const activeProduct = () => PRODUCTS[state.activeProduct] || null;
const analytics = (event, extra = {}) => {
  const detail = { event, world: state.mode, source: params.get('utm_source') || 'direct', campaign: params.get('utm_campaign') || null, basket_value: basket().total, ...extra };
  dispatchEvent(new CustomEvent('molfar:analytics', { detail }));
  if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
};
function persist() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* Storage can be unavailable. */ }
}
function trackUrl(raw) {
  const url = new URL(raw);
  for (const [key, value] of params) if (/^utm_[a-z0-9_]+$/i.test(key) || ['gclid', 'fbclid', 'ttclid'].includes(key)) url.searchParams.set(key, value);
  return url.href;
}
function setImage(img, fallback, product) {
  img.alt = product?.imageAlt || '';
  img.onerror = () => { img.hidden = true; if (fallback) fallback.hidden = false; };
  img.onload = () => { img.hidden = !img.naturalWidth; if (fallback) fallback.hidden = Boolean(img.naturalWidth); };
  const nextSource = product?.image || '';
  if (!nextSource) {
    img.removeAttribute('src');
    img.hidden = true;
    if (fallback) fallback.hidden = false;
    return;
  }
  if (img.getAttribute('src') === nextSource && img.complete && img.naturalWidth > 0) {
    img.hidden = false;
    if (fallback) fallback.hidden = true;
    return;
  }
  img.hidden = true;
  if (fallback) fallback.hidden = false;
  if (img.getAttribute('src') !== nextSource) img.src = nextSource;
}
function basket() {
  const lines = state.items.map((item) => ({ item, product: PRODUCTS[item.productId], offer: PRODUCTS[item.productId].variants[item.variant] }));
  const total = lines.reduce((sum, line) => sum + line.offer.price * line.item.quantity, 0);
  const allowance = Math.min(GUIDE_POLICY.maxGuides, Math.max(0, ...lines.map((line) => line.offer.guides)));
  return { lines, total, allowance, units: lines.reduce((sum, line) => sum + line.item.quantity, 0), mixed: lines.length > 1 };
}
function reconcileGuides() {
  const allowance = basket().allowance;
  if (state.selectedGuideIds.length <= allowance) return;
  const removed = state.selectedGuideIds.splice(allowance).map((id) => GUIDE_CATALOG.find((g) => g.id === id)?.title).filter(Boolean);
  announced(`Доступна кількість гайдів змінилася. Знято з вибору: ${removed.join(', ')}.`);
}
function renderHero() {
  const world = WORLDS[state.mode];
  const product = world.productId ? PRODUCTS[world.productId] : null;
  root.dataset.theme = state.mode;
  document.querySelector('meta[name="theme-color"]').content = world.color;
  $('world-select').value = state.mode;
  $('hero-kicker').textContent = world.kicker;
  $('hero-title').innerHTML = world.headline;
  $('hero-description').textContent = world.description;
  $('hero-glyph').textContent = world.rune;
  $('hero-world-label').textContent = world.name;
  $('hero-product-rune').textContent = world.rune;
  $('hero-product-label').textContent = product?.name || 'ТРИ СВІТИ';
  $('product-emblem').textContent = world.rune;
  $('placeholder-caption').innerHTML = product ? `${esc(product.name.toUpperCase())}<br>${esc(world.name.toUpperCase())}` : 'ОБЕРИ СВІЙ СВІТ<br>І ВІДКРИЙ ПРОДУКТ';
  $('hero-primary').innerHTML = state.mode === 'default' ? 'Обрати свій світ <span aria-hidden="true">→</span>' : 'Перейти до майстерні <span aria-hidden="true">→</span>';
  $('hero-primary').href = state.mode === 'default' ? '#worlds' : '#lab';
  document.querySelectorAll('.rune-card').forEach((card) => {
    const selected = card.dataset.mode === state.mode;
    card.classList.toggle('active', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  announced(`Ти у світі: ${world.name}`);
  setImage($('product-photo'), document.querySelector('.product-placeholder'), product);
  $('education-title').textContent = product ? `${product.name} — коротко` : 'Три продукти, три світи';
  $('education-intro').textContent = product ? `Ознайомся з доступною інформацією про ${product.name}. Перевір актуальне маркування на сторінці продавця.` : 'Обери світ, щоб дізнатися про відповідний продукт. Це не медична рекомендація.';
  const facts = product?.facts || ids.map((id) => `${PRODUCTS[id].name}: ${PRODUCTS[id].description}`);
  $('facts-grid').innerHTML = facts.map((fact, i) => `<article class="fact"><span class="fact-index">${['I', 'II', 'III'][i]}</span><h3>${esc(product ? ['Склад і маркування', 'Що варто знати', 'Перед покупкою'][i] : PRODUCTS[ids[i]].name)}</h3><p>${esc(fact)}</p></article>`).join('');
  $('trust-intro').textContent = product ? `${product.precautions} Актуальні дані та версію пакування перевір на сторінці продавця.` : 'Перевір актуальне маркування, склад і умови на сторінках офіційного продавця.';
  $('footer-product-link').href = trackUrl(product?.url || 'https://lavka-molfara.com.ua/');
  $('footer-product-link').textContent = product ? `Сторінка ${product.name} ↗` : 'Офіційний магазин ↗';
}
function changeWorld(mode, source = 'rune') {
  if (!modes.includes(mode)) mode = 'default';
  const previous = state.mode;
  state.mode = mode;
  if (WORLDS[mode].productId) state.activeProduct = WORLDS[mode].productId;
  params.set('mode', mode);
  history.replaceState(history.state, '', `${location.pathname}?${params.toString()}${location.hash}`);
  renderAll();
  persist();
  if (previous !== mode) {
    document.body.classList.remove('theme-changing');
    requestAnimationFrame(() => { document.body.classList.add('theme-changing'); setTimeout(() => document.body.classList.remove('theme-changing'), 500); });
    analytics('world_selected', { previous_world: previous, location: source });
  }
}
function renderQuiz(focus = false) {
  const definition = QUIZZES[state.mode];
  const progress = quiz();
  $('quiz-title').textContent = definition.title;
  $('quiz-intro').textContent = definition.intro;
  $('quiz-form').hidden = progress.completed;
  $('quiz-result').hidden = !progress.completed;
  if (progress.completed) {
    const selected = state.mode === 'default' ? ['magnesium', 'antistress', 'activator', 'magnesium'][progress.answers[2] ?? progress.answers[0] ?? 0] : WORLDS[state.mode].productId;
    const product = PRODUCTS[selected];
    const interestIndex = state.mode === 'default' ? 0 : 3;
    const interest = definition.questions[interestIndex].options[progress.answers[interestIndex]] || '';
    const formatIndex = progress.answers[definition.formatQuestion];
    $('result-heading').textContent = state.mode === 'default' ? `Твій наступний світ — ${WORLDS[product.world].name}` : `Твій шлях у світі «${WORLDS[state.mode].name}»`;
    $('result-text').textContent = `${definition.resultLead} Тебе зацікавило: ${interest.toLowerCase()}.`;
    $('result-fact-title').textContent = product.name;
    $('result-fact').textContent = `${product.description} ${product.facts[0]} ${product.precautions}`;
    $('result-format').textContent = formatIndex < 3 ? `Ти обрав(ла) для розгляду ${[60, 120, 180][formatIndex]} капсул. Це вподобання формату, а не рекомендація щодо застосування.` : 'Порівняй усі три формати за кількістю капсул і ціною.';
    $('result-rune').textContent = WORLDS[product.world].rune;
    setImage($('result-photo'), $('result-rune'), product);
    $('result-lab').dataset.product = selected;
    if (focus) $('quiz-result').focus();
    return;
  }
  const question = definition.questions[progress.index];
  $('q-count').textContent = `Крок ${progress.index + 1} із ${definition.questions.length}`;
  const bar = document.querySelector('.progress-track');
  bar.setAttribute('aria-valuemax', String(definition.questions.length));
  bar.setAttribute('aria-valuenow', String(progress.index + 1));
  $('q-progress').style.width = `${(progress.index + 1) / definition.questions.length * 100}%`;
  $('q-title').textContent = question.q;
  $('q-options').innerHTML = question.options.map((option, i) => `<button class="option ${progress.answers[progress.index] === i ? 'selected' : ''}" type="button" data-answer="${i}" aria-pressed="${progress.answers[progress.index] === i}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(option)}</button>`).join('');
  $('q-feedback').textContent = definition.note;
  $('q-back').disabled = progress.index === 0;
  if (focus) $('q-title').focus();
}
function answerQuiz(index) {
  const progress = quiz();
  if (progress.answers.every((value) => value === null)) analytics('quiz_started');
  progress.answers[progress.index] = index;
  analytics('quiz_answered', { step: progress.index + 1 });
  if (progress.index === QUIZZES[state.mode].questions.length - 1) {
    progress.completed = true;
    analytics('quiz_completed');
  } else progress.index += 1;
  renderQuiz(true);
  persist();
}
function renderChest() {
  const open = state.chestOpened;
  $('chest-visual').classList.toggle('open', open);
  $('open-chest').setAttribute('aria-expanded', String(open));
  $('open-chest').textContent = open ? 'Відкрити скриню ще раз' : 'Відкрити скриню';
  $('chest-reward').hidden = !open;
}
function renderLab() {
  const product = activeProduct();
  $('product-choices').innerHTML = ids.map((id) => {
    const p = PRODUCTS[id]; const world = WORLDS[p.world];
    return `<button type="button" class="product-choice ${product?.id === id ? 'selected' : ''}" data-product="${id}" aria-pressed="${product?.id === id}">${photo(p)}<strong>${esc(p.name)}</strong><small>${esc(world.name)}</small></button>`;
  }).join('');
  $('step-state-1').textContent = product?.name || 'Обери продукт';
  $('step-state-2').textContent = product ? 'Обери формат' : 'Після продукту';
  $('main-product-detail').innerHTML = product ? `${photo(product)}<div><strong>${esc(product.name)}</strong><p>${esc(product.description)}</p><small>${esc(product.precautions)} ${product.image ? 'Фото показує товар; кількість капсул вибраного формату вказана окремо.' : 'Оригінальне фото товару не надано.'}</small></div>` : '<p>Обери продукт, щоб переглянути його склад і формати.</p>';
  if (!product) {
    $('variant-options').innerHTML = '<p>Обери світ або продукт, щоб побачити перевірені формати.</p>';
    $('upgrade-note').hidden = true;
  } else {
    const selected = state.draftVariants[product.id];
    $('variant-options').innerHTML = variants(product.id).map((variant) => {
      const offer = product.variants[variant];
      return `<button type="button" class="variant-choice ${selected === variant ? 'selected' : ''}" data-variant="${variant}" aria-pressed="${selected === variant}"><strong>${variant} капсул</strong><span>${money(offer.price)}</span>${offer.original ? `<del>${money(offer.original)}</del>` : ''}<small>${offer.guides ? `${offer.guides} цифрових гайдів за умовами продавця` : 'Без цифрових гайдів'}</small></button>`;
    }).join('');
    const offer = product.variants[selected];
    const next = product.variants[variants(product.id).find((v) => v > selected)];
    $('upgrade-note').hidden = false;
    $('upgrade-note').innerHTML = `<strong>${selected} капсул · ${money(offer.price)}</strong><p>${offer.guides ? `${offer.guides} цифрових гайдів за умовами продавця.` : 'Цифрові гайди для цього формату не вказані.'} ${next ? `Наступний формат: +${next.qty - offer.qty} капсул за +${money(next.price - offer.price)}; ${next.guides - offer.guides} додаткових гайдів.` : 'Це найбільший доступний формат.'} Більший формат не означає більшої медичної ефективності.</p><button type="button" class="btn" id="add-main">${itemFor(product.id) ? 'Оновити формат у кошику' : 'Додати до кошика'}</button>`;
  }
  $('cross-sells').innerHTML = ids.filter((id) => id !== product?.id).map((id) => {
    const p = PRODUCTS[id]; const chosen = state.draftVariants[id]; const offer = p.variants[chosen]; const present = Boolean(itemFor(id));
    return `<article class="cross-sell">${photo(p)}<h4>${esc(p.name)} · ${esc(WORLDS[p.world].name)}</h4><p>${esc(p.description)}</p><label>Формат <select data-cross-variant="${id}">${variants(id).map((v) => `<option value="${v}" ${v === chosen ? 'selected' : ''}>${v} капсул · ${money(p.variants[v].price)}</option>`).join('')}</select></label><p>${money(offer.price)} · ${offer.guides} цифрових гайдів</p><button class="btn small" type="button" data-cross-add="${id}">${present ? 'Оновити у кошику' : 'Додати до набору'}</button></article>`;
  }).join('');
  renderBasket();
}
function renderBasket() {
  const summary = basket();
  $('basket-count').textContent = String(summary.units);
  $('basket-total').textContent = summary.lines.length ? money(summary.total) : '—';
  $('sticky-count').textContent = String(summary.units);
  $('sticky-price').textContent = summary.lines.length ? money(summary.total) : '—';
  $('sticky-product-name').textContent = summary.lines.length ? `${summary.units} од. у кошику` : 'Кошик порожній';
  $('basket-items').innerHTML = summary.lines.length ? summary.lines.map(({ item, product, offer }) => `
    <article class="basket-line" data-line="${product.id}">
      <div class="basket-line-top">${photo(product)}<div><strong>${esc(product.name)}</strong><small>${esc(WORLDS[product.world].name)}</small></div><button type="button" class="textbutton" data-remove="${product.id}" aria-label="Видалити ${esc(product.name)}">Видалити</button></div>
      <label>Формат <select data-line-variant="${product.id}">${variants(product.id).map((v) => `<option value="${v}" ${v === item.variant ? 'selected' : ''}>${v} капсул · ${money(product.variants[v].price)}</option>`).join('')}</select></label>
      <div class="basket-line-bottom"><div class="quantity"><button type="button" data-qty="${product.id}" data-delta="-1" aria-label="Зменшити кількість ${esc(product.name)}" ${item.quantity === 1 ? 'disabled' : ''}>−</button><span aria-label="Кількість: ${item.quantity}">${item.quantity}</span><button type="button" data-qty="${product.id}" data-delta="1" aria-label="Збільшити кількість ${esc(product.name)}" ${item.quantity === 9 ? 'disabled' : ''}>+</button></div><strong>${money(offer.price * item.quantity)}</strong></div>
      <small>${item.variant} капсул × ${item.quantity} · ${money(offer.price)} за упаковку</small>
    </article>`).join('') : '<p class="empty-basket">Поки що порожньо. Обери продукт і формат у майстерні.</p>';
  document.querySelectorAll('[data-world-rune]').forEach((rune) => {
    const selected = summary.lines.some((line) => line.product.world === rune.dataset.worldRune);
    rune.classList.toggle('is-lit', selected);
    rune.setAttribute('role', 'img');
    rune.setAttribute('aria-label', `${WORLDS[rune.dataset.worldRune].name}: ${selected ? 'у кошику' : 'не в кошику'}`);
  });
  $('composition-stage').dataset.count = String(summary.lines.length);
  $('lab-window-world').textContent = WORLDS[state.mode].name;
  $('composition-title').textContent = summary.lines.length ? `${summary.lines.length} ${summary.lines.length === 1 ? 'продукт' : 'продукти'} у формулі` : 'Твоя формула з’явиться тут';
  $('composition-message').textContent = summary.lines.length ? summary.lines.map((line) => `${line.product.name}: ${line.item.variant} капсул × ${line.item.quantity}`).join(' · ') : 'Додай продукт, щоб запалити його руну.';
  const worldProductId = WORLDS[state.mode].productId;
  const visual = worldProductId ? PRODUCTS[worldProductId] : null;
  const inBasket = Boolean(visual && itemFor(visual.id));
  $('lab-product-emblem').textContent = WORLDS[state.mode].rune;
  $('lab-product-name').textContent = visual?.name || WORLDS[state.mode].name;
  $('composition-preview').textContent = visual
    ? inBasket ? `Фото світу: ${visual.name} — є в кошику.` : `Фото світу: ${visual.name} — попередній перегляд, ще не в кошику.`
    : 'Святилище: обери світ, щоб побачити продукт.';
  setImage($('lab-product-photo'), $('lab-product-fallback'), visual);
  const selectedNames = state.selectedGuideIds.map((id) => GUIDE_CATALOG.find((g) => g.id === id)?.title).filter(Boolean);
  $('guide-status').textContent = summary.lines.length ? `Доступно: ${summary.allowance} цифрових гайдів за найбільшим форматом у кошику. Обрано: ${state.selectedGuideIds.length}; залишилося: ${summary.allowance - state.selectedGuideIds.length}.${selectedNames.length ? ` Теми для обговорення з продавцем: ${selectedNames.join(', ')}.` : ''}${summary.mixed ? ' Поєднання гайдів між різними продуктами продавець не підтвердив.' : ''}` : 'Додай продукт, щоб побачити умови цифрових гайдів.';
  $('guide-choices').innerHTML = summary.allowance ? GUIDE_CATALOG.map((g) => `<label class="guide-choice"><input type="checkbox" value="${g.id}" data-guide ${state.selectedGuideIds.includes(g.id) ? 'checked' : ''} ${!state.selectedGuideIds.includes(g.id) && state.selectedGuideIds.length >= summary.allowance ? 'disabled' : ''}><span><strong>${esc(g.title)}</strong><small>${esc(g.description)}</small></span></label>`).join('') : '<p>Для цього формату цифрові гайди не вказані.</p>';
  $('store-links').innerHTML = summary.lines.map(({ product }) => `<a class="btn buy-button" href="${esc(trackUrl(product.url))}" target="_blank" rel="noopener noreferrer" data-store="${product.id}">Сторінка ${esc(product.name)} ↗</a>`).join('');
}
function renderAll() { renderHero(); renderQuiz(); renderChest(); renderLab(); }
function addProduct(id) {
  if (!PRODUCTS[id]) return;
  const oldAllowance = basket().allowance;
  const chosen = state.draftVariants[id];
  const existing = itemFor(id);
  if (existing) existing.variant = chosen;
  else state.items.push({ productId: id, variant: chosen, quantity: 1 });
  reconcileGuides(); renderLab(); persist();
  announced(`${PRODUCTS[id].name}, ${chosen} капсул: ${existing ? 'формат оновлено' : 'додано до кошика'}.`);
  analytics(existing ? 'basket_item_updated' : id === state.activeProduct ? 'lab_product_selected' : 'cross_sell_added', { product_id: id, variant: chosen });
  if (basket().allowance > oldAllowance) analytics('guide_unlocked', { allowance: basket().allowance });
}
function updateItem(id, patch) {
  const item = itemFor(id);
  if (!item) return;
  const previousAllowance = basket().allowance;
  Object.assign(item, patch);
  if (patch.variant) state.draftVariants[id] = patch.variant;
  reconcileGuides(); renderLab(); persist();
  analytics('basket_item_updated', { product_id: id, variant: item.variant, quantity: item.quantity });
  if (basket().allowance > previousAllowance) analytics('guide_unlocked', { allowance: basket().allowance });
}
function removeItem(id) {
  state.items = state.items.filter((item) => item.productId !== id);
  reconcileGuides(); renderLab(); persist();
  announced(`${PRODUCTS[id].name} видалено з кошика.`);
  analytics('basket_item_removed', { product_id: id });
  if (id !== state.activeProduct) analytics('cross_sell_removed', { product_id: id });
}
$('world-select').addEventListener('change', (event) => changeWorld(event.target.value, 'switcher'));
document.querySelectorAll('.rune-card').forEach((card) => card.addEventListener('click', () => changeWorld(card.dataset.mode)));
$('q-options').addEventListener('click', (event) => { const button = event.target.closest('[data-answer]'); if (button) answerQuiz(Number(button.dataset.answer)); });
$('q-back').addEventListener('click', () => { const progress = quiz(); progress.index = Math.max(0, progress.index - 1); renderQuiz(true); persist(); });
$('edit-answers').addEventListener('click', () => { const progress = quiz(); progress.completed = false; progress.index = 0; renderQuiz(true); persist(); });
$('restart').addEventListener('click', () => { state.quizByWorld[state.mode] = initialQuiz(); renderQuiz(true); persist(); analytics('quiz_restarted'); });
$('result-lab').addEventListener('click', (event) => { const id = event.currentTarget.dataset.product; if (id && state.mode !== PRODUCTS[id].world) changeWorld(PRODUCTS[id].world, 'quiz_result'); if (id) state.activeProduct = id; renderLab(); persist(); });
$('open-chest').addEventListener('click', () => { state.chestOpened = true; renderChest(); $('chest-visual').classList.remove('open'); requestAnimationFrame(() => requestAnimationFrame(() => $('chest-visual').classList.add('open'))); persist(); analytics('chest_opened'); });
$('product-choices').addEventListener('click', (event) => { const button = event.target.closest('[data-product]'); if (!button) return; const id = button.dataset.product; state.activeProduct = id; if (state.mode !== PRODUCTS[id].world) changeWorld(PRODUCTS[id].world, 'laboratory'); else { renderLab(); persist(); } analytics('product_viewed', { product_id: id }); });
$('variant-options').addEventListener('click', (event) => {
  const variant = event.target.closest('[data-variant]');
  if (variant && activeProduct()) { state.draftVariants[state.activeProduct] = Number(variant.dataset.variant); renderLab(); persist(); analytics('lab_variant_changed', { product_id: state.activeProduct, variant: Number(variant.dataset.variant) }); }
});
$('upgrade-note').addEventListener('click', (event) => {
  if (event.target.closest('#add-main') && activeProduct()) addProduct(state.activeProduct);
});
$('cross-sells').addEventListener('change', (event) => { const id = event.target.dataset.crossVariant; if (!id) return; state.draftVariants[id] = Number(event.target.value); renderLab(); persist(); });
$('cross-sells').addEventListener('click', (event) => { const id = event.target.closest('[data-cross-add]')?.dataset.crossAdd; if (id) addProduct(id); });
$('basket-items').addEventListener('change', (event) => { const id = event.target.dataset.lineVariant; if (id) updateItem(id, { variant: Number(event.target.value) }); });
$('basket-items').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]'); if (remove) return removeItem(remove.dataset.remove);
  const qty = event.target.closest('[data-qty]'); if (qty) { const item = itemFor(qty.dataset.qty); if (item) updateItem(item.productId, { quantity: Math.max(1, Math.min(9, item.quantity + Number(qty.dataset.delta))) }); }
});
$('guide-choices').addEventListener('change', (event) => {
  if (!event.target.matches('[data-guide]')) return;
  const id = event.target.value;
  if (event.target.checked && state.selectedGuideIds.length < basket().allowance) state.selectedGuideIds.push(id);
  else state.selectedGuideIds = state.selectedGuideIds.filter((x) => x !== id);
  renderBasket(); persist(); analytics('guide_selected', { guide_id: id });
});
$('store-links').addEventListener('click', (event) => { const link = event.target.closest('[data-store]'); if (link) analytics('checkout_handoff_clicked', { product_id: link.dataset.store }); });
$('lab-sticky').addEventListener('click', (event) => { if (event.target.closest('a')) analytics('basket_reviewed'); });
document.addEventListener('error', (event) => { if (event.target.matches?.('.product-thumb img')) { event.target.hidden = true; event.target.nextElementSibling.hidden = false; } }, true);
document.addEventListener('load', (event) => { if (event.target.matches?.('.product-thumb img')) event.target.nextElementSibling.hidden = true; }, true);
window.addEventListener('popstate', () => { const mode = new URLSearchParams(location.search).get('mode'); state.mode = modes.includes(mode) ? mode : 'default'; if (WORLDS[state.mode].productId) state.activeProduct = WORLDS[state.mode].productId; renderAll(); persist(); });
reconcileGuides();
renderAll();
persist();
root.classList.remove('booting');
