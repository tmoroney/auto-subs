//! Subtitle history, read from the Tauri app's transcript store so documents
//! created there can be reopened here. Read-only: nothing is written or deleted.

use std::cell::Cell;
use std::path::PathBuf;
use std::rc::Rc;

use chrono::{DateTime, Local};
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_base::input::{Input, InputEvent, InputState};
use gpui_base::{Align, POPUP_PRIORITY, Placement, Positioner};
use gpui_kit_assets::IconName;
use serde_json::Value;

use crate::i18n::t;
use crate::transcription::SubtitleRow;
use crate::ui::{colors, history_icon, icon};

const INDEX_FILENAME: &str = "transcript-index.json";
const KEY_CONTEXT: &str = "TranscriptHistory";

actions!(transcript_history, [HistoryCancel]);

pub fn init(cx: &mut App) {
    cx.bind_keys([KeyBinding::new(
        "escape",
        HistoryCancel,
        Some("TranscriptHistory > Input"),
    )]);
}

/// Same folder as `getSubtitleDocumentsDir` (Tauri's app-local-data dir).
pub fn transcripts_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.autosubs")
        .join("Transcripts")
}

#[derive(Clone, PartialEq)]
pub struct TranscriptEntry {
    pub filename: String,
    pub display_name: SharedString,
    date: SharedString,
    /// Lowercased name, filename and date, built once so filtering is cheap.
    search_key: String,
    created: Option<DateTime<Local>>,
}

/// Newest first, from the index the Tauri app maintains
/// (`listSubtitleDocumentIndex`).
pub fn list_transcripts() -> Vec<TranscriptEntry> {
    let Ok(json) = std::fs::read_to_string(transcripts_dir().join(INDEX_FILENAME)) else {
        return Vec::new();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&json) else {
        return Vec::new();
    };
    let mut entries: Vec<TranscriptEntry> = items
        .iter()
        .filter_map(|item| {
            let filename = item["filename"].as_str()?.to_string();
            let metadata = &item["metadata"];
            let created = [&metadata["createdAt"], &item["createdAt"]]
                .into_iter()
                .filter_map(Value::as_str)
                .find_map(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.with_timezone(&Local));
            let display_name = metadata["displayName"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .unwrap_or_else(|| filename.trim_end_matches(".json").to_string());
            let date = format_date(created);
            let search_key = format!("{display_name} {filename} {date}").to_lowercase();
            Some(TranscriptEntry {
                display_name: display_name.into(),
                date: date.into(),
                search_key,
                filename,
                created,
            })
        })
        .collect();
    entries.sort_by(|a, b| b.created.cmp(&a.created));
    entries
}

/// Segments of a stored document.
pub fn load_transcript(filename: &str) -> eyre::Result<Vec<SubtitleRow>> {
    let json = std::fs::read_to_string(transcripts_dir().join(filename))?;
    let doc: Value = serde_json::from_str(&json)?;
    let rows = doc["segments"]
        .as_array()
        .map(|segments| {
            segments
                .iter()
                .map(|seg| SubtitleRow {
                    start: seg["start"].as_f64().unwrap_or(0.),
                    text: seg["text"].as_str().unwrap_or_default().trim().to_string(),
                    speaker: match &seg["speaker_id"] {
                        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
                        Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    },
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(rows)
}

pub enum TranscriptHistoryEvent {
    Opened { rows: Vec<SubtitleRow> },
}

pub struct TranscriptHistory {
    open: bool,
    /// Kept between opens so the list appears immediately; refreshed in the
    /// background each time the popup opens.
    entries: Option<Rc<Vec<TranscriptEntry>>>,
    /// Indices into `entries` matching `filter_query`.
    visible: Rc<Vec<usize>>,
    filter_query: String,
    list_scroll: UniformListScrollHandle,
    current: Option<String>,
    search: Entity<InputState>,
    placeholder_locale: &'static str,
    trigger_bounds: Rc<Cell<Bounds<Pixels>>>,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<TranscriptHistoryEvent> for TranscriptHistory {}

impl TranscriptHistory {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| {
            InputState::new(window, cx).placeholder(t(cx, "titlebar.subtitleHistory.searchPlaceholder"))
        });
        let subscription = cx.subscribe(&search, |this, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                this.refilter(cx);
                cx.notify();
            }
        });
        let mut this = Self {
            open: false,
            entries: None,
            visible: Rc::default(),
            filter_query: String::new(),
            list_scroll: UniformListScrollHandle::new(),
            current: None,
            search,
            placeholder_locale: crate::i18n::locale(cx),
            trigger_bounds: Rc::default(),
            _subscriptions: vec![subscription],
        };
        // Load at startup so the first open doesn't wait either.
        this.reload(cx);
        this
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        let task = cx.background_spawn(async { list_transcripts() });
        cx.spawn(async move |this, cx| {
            let entries = task.await;
            let _ = this.update(cx, |this, cx| {
                if this.entries.as_deref() != Some(&entries) {
                    this.entries = Some(Rc::new(entries));
                    // Old indices don't apply to the new entries.
                    this.visible = Rc::default();
                    this.refilter(cx);
                    cx.notify();
                }
            });
        })
        .detach();
    }

    /// Recomputes the matching rows, only when the query actually changed
    /// (or the entries were replaced, which clears `filter_query`).
    fn refilter(&mut self, cx: &App) {
        let query = self.search.read(cx).value().trim().to_lowercase();
        if self.entries.is_some() && query == self.filter_query && !self.visible.is_empty() {
            return;
        }
        let Some(entries) = &self.entries else { return };
        self.visible = Rc::new(
            entries
                .iter()
                .enumerate()
                .filter(|(_, e)| query.is_empty() || e.search_key.contains(&query))
                .map(|(ix, _)| ix)
                .collect(),
        );
        self.filter_query = query;
        self.list_scroll.scroll_to_item(0, ScrollStrategy::Top);
    }

    pub fn toggle(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open = !self.open;
        if self.open {
            self.search.update(cx, |search, cx| {
                search.set_value("", window, cx);
                search.focus(window, cx);
            });
            self.refilter(cx);
            // Show the cached list now; pick up documents the Tauri app saved since.
            self.reload(cx);
        }
        cx.notify();
    }

    /// Loads a document off the UI thread and emits it.
    pub fn open_document(&mut self, filename: String, cx: &mut Context<Self>) {
        self.open = false;
        cx.notify();
        let task = cx.background_spawn({
            let filename = filename.clone();
            async move { load_transcript(&filename) }
        });
        cx.spawn(async move |this, cx| match task.await {
            Ok(rows) => {
                let _ = this.update(cx, |this, cx| {
                    this.current = Some(filename);
                    cx.emit(TranscriptHistoryEvent::Opened { rows });
                });
            }
            Err(err) => tracing::warn!("failed to open transcript {filename}: {err:#}"),
        })
        .detach();
    }

    #[cfg(feature = "screenshot")]
    pub fn trigger_center(&self) -> Point<Pixels> {
        self.trigger_bounds.get().center()
    }

    fn render_popup(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let trigger = self.trigger_bounds.get();
        let message = |key: &str, cx: &App| {
            div()
                .py_6()
                .flex()
                .justify_center()
                .text_sm()
                .text_color(colors::muted())
                .child(t(cx, key))
        };

        const ROW_HEIGHT: f32 = 36.;
        let body = match &self.entries {
            None => message("titlebar.subtitleHistory.loading", cx).into_any_element(),
            Some(entries) if entries.is_empty() => {
                message("titlebar.subtitleHistory.empty", cx).into_any_element()
            }
            Some(_) if self.visible.is_empty() => {
                message("titlebar.subtitleHistory.no_results", cx).into_any_element()
            }
            Some(entries) => {
                let entries = entries.clone();
                let visible = self.visible.clone();
                let current = self.current.clone();
                let view = cx.entity().downgrade();
                // Virtualized: only the rows in view are built each frame.
                uniform_list("history-list", visible.len(), move |range, _, _| {
                    range
                        .map(|pos| {
                            let entry = &entries[visible[pos]];
                            let active = current.as_deref() == Some(entry.filename.as_str());
                            let filename = entry.filename.clone();
                            let view = view.clone();
                            div()
                                .id(pos)
                                .w_full()
                                .h(px(ROW_HEIGHT))
                                .px_2()
                                .flex()
                                .items_center()
                                .gap_2()
                                .rounded(px(6.))
                                .cursor_pointer()
                                .map(|el| {
                                    if active {
                                        el.bg(colors::accent_soft()).text_color(colors::accent_text())
                                    } else {
                                        el.text_color(colors::text()).hover(|s| s.bg(colors::control()))
                                    }
                                })
                                .child(
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .truncate()
                                        .text_sm()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(entry.display_name.clone()),
                                )
                                .child(
                                    div()
                                        .flex_none()
                                        .text_size(px(11.))
                                        .text_color(colors::muted())
                                        .child(entry.date.clone()),
                                )
                                .on_click(move |_, _, cx| {
                                    let _ = view.update(cx, |this, cx| {
                                        this.open_document(filename.clone(), cx)
                                    });
                                })
                        })
                        .collect()
                })
                .track_scroll(&self.list_scroll)
                .h(px((visible_len_height(self.visible.len(), ROW_HEIGHT)).min(260.)))
                .p_1()
                .into_any_element()
            }
        };

        let panel = div()
            .id("history-popup")
            .key_context(KEY_CONTEXT)
            .w(px(320.))
            .flex()
            .flex_col()
            .overflow_hidden()
            .rounded(px(12.))
            .border_1()
            .border_color(colors::border())
            .bg(colors::card())
            .shadow_xl()
            .on_action(cx.listener(|this, _: &HistoryCancel, _, cx| {
                this.open = false;
                cx.notify();
            }))
            .on_mouse_down_out(cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                if !trigger.contains(&event.position) {
                    this.open = false;
                    cx.notify();
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
            .child(body);

        deferred(
            Positioner::side(trigger)
                .placement(Placement::Bottom)
                .align(Align::End)
                .offset(px(6.))
                .margin(px(8.))
                .occlude()
                .child(panel),
        )
        .with_priority(POPUP_PRIORITY)
    }
}

fn visible_len_height(rows: usize, row_height: f32) -> f32 {
    rows as f32 * row_height + 8.
}

/// "Aug 2, 8:18 PM", like the Tauri popover's `toLocaleDateString` options.
/// Month names are English for now.
fn format_date(created: Option<DateTime<Local>>) -> String {
    created
        .map(|d| d.format("%b %-d, %-I:%M %p").to_string())
        .unwrap_or_default()
}

impl Render for TranscriptHistory {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let locale = crate::i18n::locale(cx);
        if self.placeholder_locale != locale {
            self.placeholder_locale = locale;
            let placeholder = t(cx, "titlebar.subtitleHistory.searchPlaceholder");
            self.search.update(cx, |search, cx| search.set_placeholder(placeholder, window, cx));
        }
        let bounds = self.trigger_bounds.clone();
        div()
            .child(
                div()
                    .id("history-trigger")
                    .relative()
                    .size(px(28.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(8.))
                    .cursor_pointer()
                    .when(self.open, |el| el.bg(colors::control()))
                    .hover(|s| s.bg(colors::control()))
                    .child(history_icon().text_color(colors::text()))
                    .child(canvas(move |b, _, _| bounds.set(b), |_, _, _, _| {}).absolute().size_full())
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.toggle(window, cx))),
            )
            .when(self.open, |el| el.child(self.render_popup(cx)))
    }
}
