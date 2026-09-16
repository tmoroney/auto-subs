//! Searchable model picker, mirroring `components/settings/model-picker.tsx`.
//!
//! Model metadata comes from `models.json` and display strings from the shared
//! i18n bundle, so both front-ends read the same source of truth.

use std::cell::Cell;
use std::collections::HashSet;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_base::input::{Input, InputEvent, InputState};
use gpui_base::{Align, POPUP_PRIORITY, Placement, Positioner};
use gpui_kit_assets::IconName;
use serde_json::Value;

use crate::i18n::{t, t_args, t_count};
use crate::ui::{colors, icon};

const MANIFEST: &str = include_str!("../../../../models.json");

const KEY_CONTEXT: &str = "ModelPicker";
const POPUP_WIDTH: f32 = 384.;
const LIST_MAX_HEIGHT: f32 = 270.;
const TRIGGER_HEIGHT: f32 = 36.;
const POP_IN: Option<Duration> = None; // Some(Duration::from_millis(110));

actions!(model_picker, [PickerUp, PickerDown, PickerConfirm, PickerCancel]);

/// Keys typed into the search field drive the list. Bound more specifically
/// than the input's own bindings so they win while the picker is open.
pub fn init(cx: &mut App) {
    let context = Some("ModelPicker > Input");
    cx.bind_keys([
        KeyBinding::new("up", PickerUp, context),
        KeyBinding::new("down", PickerDown, context),
        KeyBinding::new("enter", PickerConfirm, context),
        KeyBinding::new("escape", PickerCancel, context),
    ]);
}

#[derive(Clone)]
enum LanguageSupport {
    Multilingual,
    Single(String),
    Restricted(Vec<String>),
}

#[derive(Clone)]
pub struct ModelInfo {
    pub id: String,
    engine: String,
    /// i18n key base, e.g. `models.tiny_en`.
    text_key: String,
    image: PathBuf,
    size: String,
    ram_mb: u32,
    accuracy: f32,
    speed: f32,
    best_for: Vec<String>,
    support: LanguageSupport,
}

impl ModelInfo {
    fn text(&self, field: &str, cx: &App) -> SharedString {
        t(cx, &format!("{}.{field}", self.text_key))
    }

    /// Mirrors `modelSupportsLanguage` / `modelSupportsAutoDetect` in `lib/models.ts`.
    fn supports(&self, language: &str) -> bool {
        match (&self.support, language) {
            (LanguageSupport::Multilingual, _) => true,
            (LanguageSupport::Single(_), "auto") => false,
            (LanguageSupport::Restricted(_), "auto") => self.engine == "parakeet",
            (LanguageSupport::Single(lang), language) => lang == language,
            (LanguageSupport::Restricted(langs), language) => langs.iter().any(|l| l == language),
        }
    }
}

fn load_models() -> Vec<ModelInfo> {
    let manifest: Value = serde_json::from_str(MANIFEST).expect("models.json");
    let public = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../public");
    let strs = |v: &Value| -> Vec<String> {
        v.as_array()
            .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
            .unwrap_or_default()
    };

    manifest["models"]
        .as_array()
        .expect("models array")
        .iter()
        .map(|m| {
            let id = m["id"].as_str().unwrap_or_default().to_string();
            let ui = &m["ui"];
            let support = &ui["languageSupport"];
            let support = match support["kind"].as_str() {
                Some("single_language") => {
                    LanguageSupport::Single(support["language"].as_str().unwrap_or_default().into())
                }
                Some("restricted") => LanguageSupport::Restricted(strs(&support["languages"])),
                _ => LanguageSupport::Multilingual,
            };
            // Same default as `defaultBestFor`: specialists are proven on what they accept.
            let best_for = match (&support, ui.get("bestFor")) {
                (_, Some(list)) => strs(list),
                (LanguageSupport::Single(lang), None) => vec![lang.clone()],
                (LanguageSupport::Restricted(langs), None) => langs.clone(),
                (LanguageSupport::Multilingual, None) => Vec::new(),
            };
            ModelInfo {
                text_key: format!("models.{}", id.replace(['.', '-'], "_")),
                engine: m["engine"].as_str().unwrap_or_default().into(),
                image: public.join(ui["image"].as_str().unwrap_or_default()),
                size: ui["size"].as_str().unwrap_or_default().into(),
                ram_mb: ui["ramMb"].as_u64().unwrap_or(0) as u32,
                accuracy: ui["accuracy"].as_f64().unwrap_or(1.) as f32,
                speed: ui["speed"].as_f64().unwrap_or(1.) as f32,
                best_for,
                support,
                id,
            }
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq)]
enum Sort {
    Recommended,
    Accuracy,
    Speed,
}

impl Sort {
    /// Each sort with its i18n key.
    const ALL: [(Sort, &'static str); 3] = [
        (Sort::Recommended, "models.filters.recommended"),
        (Sort::Accuracy, "models.filters.accuracy"),
        (Sort::Speed, "models.filters.speed"),
    ];
}

/// Mirrors `compareModels`: the chosen axis first, then proven-for-language,
/// the other axis, and the smaller footprint.
fn ordered(models: &[ModelInfo], language: &str, sort: Sort) -> Vec<usize> {
    let mut ixs: Vec<usize> = (0..models.len()).filter(|&i| models[i].supports(language)).collect();
    let proven = |m: &ModelInfo| language != "auto" && m.best_for.iter().any(|l| l == language);
    ixs.sort_by(|&a, &b| {
        let (a, b) = (&models[a], &models[b]);
        let key = |m: &ModelInfo| {
            let proven = if proven(m) { 1. } else { 0. };
            match sort {
                Sort::Speed => [-m.speed, -proven, -m.accuracy, m.ram_mb as f32],
                _ => [-m.accuracy, -proven, -m.speed, m.ram_mb as f32],
            }
        };
        key(a)
            .partial_cmp(&key(b))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.id.cmp(&b.id))
    });
    ixs
}

fn format_ram(ram_mb: u32) -> String {
    if ram_mb >= 1024 {
        let gb = (ram_mb as f32 / 1024. * 10.).round() / 10.;
        format!("{gb}GB")
    } else {
        format!("{ram_mb}MB")
    }
}

pub enum ModelPickerEvent {
    Selected,
}

pub struct ModelPicker {
    models: Vec<ModelInfo>,
    cached: HashSet<String>,
    selected: usize,
    language: String,
    disabled: bool,
    open: bool,
    /// Bumped on every open so the pop-in animation replays.
    open_epoch: u64,
    sort: Sort,
    /// Position of the keyboard/hover highlight within the visible list.
    highlighted: usize,
    search: Entity<InputState>,
    /// Locale the search placeholder was last set for.
    placeholder_locale: &'static str,
    /// Query the highlight was last reset for.
    last_query: SharedString,
    scroll: ScrollHandle,
    trigger_bounds: Rc<Cell<Bounds<Pixels>>>,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<ModelPickerEvent> for ModelPicker {}

impl ModelPicker {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let models = load_models();
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(t(cx, "models.searchPlaceholder")));
        let subscription = cx.subscribe(&search, |_, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                cx.notify();
            }
        });
        let mut picker = Self {
            selected: 0,
            cached: HashSet::new(),
            language: "auto".into(),
            disabled: false,
            open: false,
            open_epoch: 0,
            sort: Sort::Recommended,
            highlighted: 0,
            search,
            last_query: SharedString::default(),
            placeholder_locale: crate::i18n::locale(cx),
            scroll: ScrollHandle::new(),
            trigger_bounds: Rc::default(),
            _subscriptions: vec![subscription],
            models,
        };
        picker.selected = ordered(&picker.models, "auto", Sort::Recommended)
            .first()
            .copied()
            .unwrap_or(0);
        picker
    }

    #[cfg(feature = "screenshot")]
    pub fn trigger_center(&self) -> Point<Pixels> {
        self.trigger_bounds.get().center()
    }

    #[cfg(feature = "screenshot")]
    pub fn set_query(&mut self, query: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.search.update(cx, |search, cx| search.set_value(query.to_string(), window, cx));
    }

    /// Lets scripted runs use a small model regardless of what the picker
    /// test above selected.
    #[cfg(feature = "screenshot")]
    pub fn select_id(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(ix) = self.models.iter().position(|m| m.id == id) {
            self.selected = ix;
            cx.notify();
        }
    }

    pub fn selected(&self) -> &ModelInfo {
        &self.models[self.selected]
    }

    pub fn set_cached(&mut self, cached: HashSet<String>, cx: &mut Context<Self>) {
        self.cached = cached;
        cx.notify();
    }

    pub fn set_disabled(&mut self, disabled: bool, cx: &mut Context<Self>) {
        if self.disabled != disabled {
            self.disabled = disabled;
            self.open &= !disabled;
            cx.notify();
        }
    }

    /// Keeps the selection valid for the language, falling back to the top
    /// recommendation like `getFirstRecommendedModelForLanguage`.
    pub fn set_language(&mut self, language: &str, cx: &mut Context<Self>) {
        self.language = language.to_string();
        if !self.models[self.selected].supports(language) {
            if let Some(&first) = ordered(&self.models, language, Sort::Recommended).first() {
                self.selected = first;
                cx.emit(ModelPickerEvent::Selected);
            }
        }
        cx.notify();
    }

    fn visible(&self, cx: &App) -> Vec<usize> {
        let query = self.search.read(cx).value().trim().to_lowercase();
        ordered(&self.models, &self.language, self.sort)
            .into_iter()
            .filter(|&i| {
                let m = &self.models[i];
                query.is_empty()
                    || ["label", "description", "badge"]
                        .iter()
                        .any(|field| m.text(field, cx).to_lowercase().contains(&query))
            })
            .collect()
    }

    pub fn toggle(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.open {
            self.close(cx);
            return;
        }
        if self.disabled {
            return;
        }
        self.open = true;
        self.open_epoch += 1;
        self.search.update(cx, |search, cx| {
            search.set_value("", window, cx);
            search.focus(window, cx);
        });
        self.last_query = SharedString::default();
        self.highlighted = self.visible(cx).iter().position(|&i| i == self.selected).unwrap_or(0);
        self.scroll.scroll_to_item(self.highlighted);
        cx.notify();
    }

    fn close(&mut self, cx: &mut Context<Self>) {
        self.open = false;
        cx.notify();
    }

    fn choose(&mut self, model_ix: usize, cx: &mut Context<Self>) {
        self.selected = model_ix;
        self.open = false;
        cx.emit(ModelPickerEvent::Selected);
        cx.notify();
    }

    fn move_highlight(&mut self, delta: isize, cx: &mut Context<Self>) {
        let len = self.visible(cx).len();
        if len == 0 {
            return;
        }
        self.highlighted = (self.highlighted as isize + delta).rem_euclid(len as isize) as usize;
        self.scroll.scroll_to_item(self.highlighted);
        cx.notify();
    }

    fn render_trigger(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let model = self.selected();
        let bounds = self.trigger_bounds.clone();
        div()
            .id("model-trigger")
            .w(px(208.))
            .h(px(TRIGGER_HEIGHT))
            .rounded(px(10.))
            .bg(colors::control())
            .text_sm()
            .text_color(if self.disabled { colors::faint() } else { colors::text() })
            .when(!self.disabled, |el| {
                el.cursor_pointer()
                    .hover(|s| s.bg(colors::control_hover()))
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.toggle(window, cx)))
            })
            .child(
                div()
                    .size_full()
                    .px_3()
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .child(img(model.image.clone()).size(px(22.)).flex_none())
                    .child(div().flex_1().truncate().child(model.text("label", cx)))
                    .child(icon(IconName::ChevronsUpDown).size(px(14.)).text_color(colors::muted()))
                    .child(canvas(move |b, _, _| bounds.set(b), |_, _, _, _| {}).absolute().size_full()),
            )
    }

    fn render_row(&self, position: usize, model_ix: usize, cx: &mut Context<Self>) -> impl IntoElement {
        let model = &self.models[model_ix];
        let highlighted = position == self.highlighted;
        let cached = self.cached.contains(&model.id);
        let best_pick = position == 0
            && self.sort == Sort::Recommended
            && self.search.read(cx).value().trim().is_empty();
        let tag = |label: SharedString| {
            div()
                .h(px(15.))
                .px_1()
                .flex()
                .items_center()
                .rounded(px(4.))
                .text_size(px(10.))
                .line_height(px(10.))
                .child(label)
        };
        let ram = format_ram(model.ram_mb);
        let mut facts = t_args(cx, "modelStatus.ramShort", &[("size", &ram)]).to_string();
        if !cached {
            let download = t_args(cx, "modelStatus.downloadShort", &[("size", &model.size)]);
            facts.push_str(&format!(" · {download}"));
        }

        div()
            .id(model_ix)
            .px_2()
            .py_1p5()
            .flex()
            .items_center()
            .justify_between()
            .gap_2()
            .rounded(px(7.))
            .cursor_pointer()
            .when(highlighted, |el| el.bg(colors::accent_soft()))
            .on_mouse_move(cx.listener(move |this, _: &MouseMoveEvent, _, cx| {
                if this.highlighted != position {
                    this.highlighted = position;
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| this.choose(model_ix, cx)))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(img(model.image.clone()).size_8().flex_none())
                    .child(
                        div()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(3.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_1p5()
                                    .child(
                                        div()
                                            .text_xs()
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(if highlighted {
                                                colors::accent_text()
                                            } else {
                                                colors::text()
                                            })
                                            .child(model.text("label", cx)),
                                    )
                                    .when(best_pick, |el| {
                                        el.child(
                                            tag(t(cx, "models.bestPick"))
                                                .bg(colors::accent())
                                                .text_color(colors::card())
                                                .font_weight(FontWeight::MEDIUM),
                                        )
                                    })
                                    .when(matches!(model.support, LanguageSupport::Single(_)), |el| {
                                        el.child(
                                            tag(model.text("badge", cx))
                                                .border_1()
                                                .border_color(colors::border())
                                                .text_color(colors::muted()),
                                        )
                                    })
                                    .when(cached, |el| {
                                        el.child(
                                            icon(IconName::CircleCheck)
                                                .size(px(13.))
                                                .text_color(rgb(0x16a34a)),
                                        )
                                    }),
                            )
                            .child(
                                div()
                                    .text_size(px(11.))
                                    .line_height(px(12.))
                                    .text_color(colors::muted())
                                    .truncate()
                                    .child(facts),
                            ),
                    ),
            )
            .child(
                div()
                    .flex_none()
                    .mx_1()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(rating_meter(t(cx, "modelStatus.accuracy"), model.accuracy))
                    .child(rating_meter(t(cx, "modelStatus.speed"), model.speed)),
            )
    }

    fn render_popup(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let visible = self.visible(cx);
        let trigger = self.trigger_bounds.get();
        let count = visible.len();

        let sort_tabs = div()
            .flex()
            .gap_1()
            .px_2()
            .py_1p5()
            .border_b_1()
            .border_color(colors::border())
            .children(Sort::ALL.into_iter().map(|(sort, label)| {
                let active = self.sort == sort;
                div()
                    .id(label)
                    .h_6()
                    .px_2p5()
                    .flex()
                    .items_center()
                    .rounded(px(6.))
                    .text_size(px(11.))
                    .cursor_pointer()
                    .map(|el| {
                        if active {
                            el.bg(colors::accent_soft()).text_color(colors::accent_text())
                        } else {
                            el.text_color(colors::text()).hover(|s| s.bg(colors::control()))
                        }
                    })
                    .child(t(cx, label))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                        this.sort = sort;
                        this.highlighted = 0;
                        this.scroll.scroll_to_item(0);
                        cx.notify();
                    }))
            }));

        // Scrollbar thumb, drawn from the scroll handle's offsets.
        let max_off = f32::from(self.scroll.max_offset().y);
        let off = -f32::from(self.scroll.offset().y);
        let view_h = LIST_MAX_HEIGHT;
        let thumb = (max_off > 1.).then(|| {
            let frac = view_h / (view_h + max_off);
            let top = (view_h - view_h * frac) * (off / max_off).clamp(0., 1.);
            div()
                .absolute()
                .right(px(3.))
                .top(px(top + 2.))
                .w(px(5.))
                .h(px(view_h * frac - 4.))
                .rounded_full()
                .bg(hsla(217. / 360., 0.91, 0.6, 0.35))
        });

        let list = div()
            .relative()
            .child(
                div()
                    .id("model-list")
                    .max_h(px(LIST_MAX_HEIGHT))
                    .overflow_y_scroll()
                    .track_scroll(&self.scroll)
                    .p_1()
                    .pr_3()
                    .flex()
                    .flex_col()
                    .children(
                        visible
                            .iter()
                            .enumerate()
                            .map(|(pos, &ix)| self.render_row(pos, ix, cx).into_any_element()),
                    )
                    .when(count == 0, |el| {
                        el.child(
                            div()
                                .py_6()
                                .flex()
                                .justify_center()
                                .text_sm()
                                .text_color(colors::muted())
                                .child(t(cx, "models.noResults")),
                        )
                    }),
            )
            .children(thumb);

        let panel = div()
            .id("model-popup")
            .key_context(KEY_CONTEXT)
            .w(px(POPUP_WIDTH))
            .flex()
            .flex_col()
            .overflow_hidden()
            .rounded(px(11.))
            .border_1()
            .border_color(colors::border())
            .bg(colors::card())
            .shadow_lg()
            .on_action(cx.listener(|this, _: &PickerUp, _, cx| this.move_highlight(-1, cx)))
            .on_action(cx.listener(|this, _: &PickerDown, _, cx| this.move_highlight(1, cx)))
            .on_action(cx.listener(|this, _: &PickerCancel, _, cx| this.close(cx)))
            .on_action(cx.listener(|this, _: &PickerConfirm, _, cx| {
                if let Some(&ix) = this.visible(cx).get(this.highlighted) {
                    this.choose(ix, cx);
                }
            }))
            .on_mouse_down_out(cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                // The trigger toggles on its own click.
                if !trigger.contains(&event.position) {
                    this.close(cx);
                }
            }))
            .child(
                div()
                    .h(px(44.))
                    .px_3()
                    .flex()
                    .items_center()
                    .gap_2()
                    .border_b_1()
                    .border_color(colors::border())
                    .text_sm()
                    .text_color(colors::text())
                    .child(icon(IconName::Search).text_color(colors::muted()))
                    .child(div().flex_1().child(Input::new(&self.search))),
            )
            .child(sort_tabs)
            .child(list)
            .child(
                div()
                    .px_3()
                    .py_1()
                    .border_t_1()
                    .border_color(colors::border())
                    .bg(hsla(240. / 360., 0.02, 0.9, 0.3))
                    .text_xs()
                    .text_color(colors::muted())
                    .child(t_count(cx, "models.availableCount", count, &[])),
            );

        // Pop in: a short fade and rise. It starts part-visible so the popup
        // registers on the very first frame instead of reading as a delay.
        // Set POP_IN to None to open instantly.
        let animated = match POP_IN {
            Some(duration) => div()
                .child(panel)
                .with_animation(
                    ElementId::NamedInteger("model-popup-pop".into(), self.open_epoch),
                    Animation::new(duration).with_easing(ease_out_quint()),
                    |el, t| el.relative().top(px(4. * (1. - t))).opacity(0.35 + 0.65 * t),
                )
                .into_any_element(),
            None => panel.into_any_element(),
        };

        deferred(
            Positioner::side(trigger)
                .placement(Placement::Top)
                .align(Align::Center)
                .offset(px(6.))
                .margin(px(8.))
                .occlude()
                .child(animated),
        )
        .with_priority(POPUP_PRIORITY)
    }
}

/// One 1-5 rating drawn as five segments; half steps fill a segment partly.
fn rating_meter(label: SharedString, value: f32) -> Div {
    div()
        .h(px(12.))
        .flex()
        .items_center()
        .gap_1p5()
        .child(
            div()
                .w(px(50.))
                .text_size(px(11.))
                .line_height(px(11.))
                .text_color(colors::text())
                .child(label),
        )
        .child(div().flex().gap(px(2.)).children((0..5).map(move |segment| {
            let fill = (value - segment as f32).clamp(0., 1.);
            div()
                .w(px(9.))
                .h(px(5.))
                .rounded(px(1.))
                .overflow_hidden()
                .bg(hsla(210. / 360., 0.1, 0.5, 0.25))
                .when(fill > 0., |el| {
                    el.child(div().h_full().w(relative(fill)).bg(colors::accent()))
                })
        })))
}

impl Render for ModelPicker {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Follow UI language switches.
        let locale = crate::i18n::locale(cx);
        if self.placeholder_locale != locale {
            self.placeholder_locale = locale;
            let placeholder = t(cx, "models.searchPlaceholder");
            self.search.update(cx, |search, cx| search.set_placeholder(placeholder, window, cx));
        }
        // A new query re-ranks the list, so the highlight returns to the top.
        let query = self.search.read(cx).value();
        if query != self.last_query {
            self.last_query = query;
            self.highlighted = 0;
            self.scroll.scroll_to_item(0);
        }
        div()
            .child(self.render_trigger(cx))
            .when(self.open, |el| el.child(self.render_popup(cx)))
    }
}
