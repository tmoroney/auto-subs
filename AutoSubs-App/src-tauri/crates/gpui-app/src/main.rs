mod history;
mod i18n;
mod model_picker;
#[cfg(feature = "screenshot")]
mod screenshot;
mod transcription;
mod ui;

use futures::StreamExt;
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_kit_assets::IconName;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use transcription::{EngineEvent, SpikeOptions, SubtitleRow};
use gpui_base::input::{Input, InputEvent, InputState};
use gpui_base::{
    ResizableState, ResizeHandleContext, SelectableText, TextSelection, TextSelectionLayer,
    h_resizable, resizable_panel,
};
use history::{TranscriptHistory, TranscriptHistoryEvent};
use model_picker::{ModelPicker, ModelPickerEvent};
use std::rc::Rc;
use i18n::{t, t_args};
use ui::{SegmentedControl, SelectMenu, ToggleChip, colors, icon};

actions!(autosubs, [Quit, CopySelection]);

const LANGS: &[(&str, &str)] = &[
    ("Auto", "auto"),
    ("English", "en"),
    ("Spanish", "es"),
    ("French", "fr"),
    ("German", "de"),
    ("Japanese", "ja"),
    ("Korean", "ko"),
    ("Russian", "ru"),
    ("Chinese", "zh"),
];

/// Transcription languages. Names stay in English, as in the Tauri app; only
/// "Auto" is translated.
/// Mirrors `SUPPORTED_MEDIA_EXTENSIONS` in the Tauri front-end.
const MEDIA_EXTENSIONS: &[&str] = &[
    "wav", "mp3", "m4a", "flac", "ogg", "aac", "mp4", "mov", "mkv", "webm", "avi", "wmv", "mpeg",
    "mpg", "m4v", "3gp", "aiff", "opus", "alac",
];
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "mkv", "webm", "avi", "wmv", "mpeg", "mpg", "m4v", "3gp",
];

fn extension(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase())
}

fn is_supported_media(path: &Path) -> bool {
    extension(path).is_some_and(|ext| MEDIA_EXTENSIONS.contains(&ext.as_str()))
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    transcription_engine::install_logging_hooks();

    gpui_platform::application()
        .with_assets(ui::AppAssets)
        .run(|cx: &mut App| {
        i18n::init(cx);
        gpui_base::init(cx);
        model_picker::init(cx);
        history::init(cx);
        cx.set_menus(vec![Menu {
            name: "AutoSubs".into(),
            items: vec![MenuItem::action("Quit AutoSubs", Quit)],
            disabled: false,
        }]);
        // Copy for selected subtitle text; the list takes focus on mouse down
        // so cmd-c reaches it instead of a previously focused text input.
        cx.bind_keys([
            KeyBinding::new("cmd-q", Quit, None),
            KeyBinding::new("cmd-c", CopySelection, Some("SubtitleList")),
        ]);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();

        let _window = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds {
                    origin: point(px(120.), px(120.)),
                    size: size(px(760.), px(706.)),
                })),
                titlebar: Some(TitlebarOptions {
                    title: None,
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(18.), px(19.))),
                }),
                window_min_size: Some(size(px(700.), px(600.))),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| SpikeView::new(window, cx)),
        )
        .unwrap();
        #[cfg(feature = "screenshot")]
        if let Some(dir) = std::env::var_os("AUTOSUBS_SCREENSHOT_DIR") {
            screenshot::run(_window, dir.into(), cx);
        }
        cx.activate(true);
    });
}

#[derive(Clone, Copy, PartialEq)]
enum Source {
    Timeline,
    File,
}

#[derive(Clone, Copy, PartialEq)]
enum OpenSelect {
    Language,
}

struct SpikeView {
    source: Source,
    prev_source: Source,
    source_epoch: u32,
    file: Option<PathBuf>,
    /// Shown under the drop zone when a dropped file was rejected.
    drop_error: Option<String>,
    open_select: Option<OpenSelect>,
    lang: usize,
    model_picker: Entity<ModelPicker>,
    history: Entity<TranscriptHistory>,
    /// Widths of the two columns; the subtitles sidebar keeps its width and the
    /// left column absorbs the rest.
    split: Entity<ResizableState>,
    vad: bool,
    diarize: bool,
    align: bool,
    busy: bool,
    cancel: Option<Arc<AtomicBool>>,
    status: String,
    progress: i32,
    segments: Vec<SubtitleRow>,
    /// Segment indices matching the search, or `None` when not searching.
    /// The list's rows index into this when present.
    filtered: Option<Vec<usize>>,
    subtitle_search: Entity<InputState>,
    subtitle_list_focus: FocusHandle,
    /// Query `filtered` was computed for.
    search_query: SharedString,
    search_placeholder_locale: &'static str,
    list_state: ListState,
}

impl SpikeView {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let model_picker = cx.new(|cx| ModelPicker::new(window, cx));
        cx.subscribe(&model_picker, |_, _, _: &ModelPickerEvent, cx| cx.notify())
            .detach();
        Self::refresh_cached_models(&model_picker, cx);
        let history = cx.new(|cx| TranscriptHistory::new(window, cx));
        cx.subscribe(&history, |this, _, event: &TranscriptHistoryEvent, cx| {
            let TranscriptHistoryEvent::Opened { rows, .. } = event;
            if this.busy {
                return;
            }
            this.segments = rows.clone();
            this.status.clear();
            this.progress = 0;
            this.apply_search(cx);
            this.list_state.scroll_to(ListOffset { item_ix: 0, offset_in_item: px(0.) });
            cx.notify();
        })
        .detach();
        let subtitle_search = cx.new(|cx| {
            InputState::new(window, cx).placeholder(t(cx, "subtitles.searchPlaceholder"))
        });
        cx.subscribe(&subtitle_search, |_, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                cx.notify();
            }
        })
        .detach();

        Self {
            source: Source::File,
            prev_source: Source::File,
            source_epoch: 0,
            file: None,
            drop_error: None,
            open_select: None,
            lang: 0,
            model_picker,
            history,
            split: cx.new(|_| ResizableState::default()),
            vad: true,
            diarize: false,
            align: false,
            busy: false,
            cancel: None,
            status: String::new(),
            progress: 0,
            segments: Vec::new(),
            filtered: None,
            subtitle_search,
            subtitle_list_focus: cx.focus_handle(),
            search_query: SharedString::default(),
            search_placeholder_locale: i18n::locale(cx),
            list_state: ListState::new(0, ListAlignment::Top, px(200.)).measure_all(),
        }
    }

    /// Recomputes which segments match the search and resizes the list to fit.
    fn apply_search(&mut self, cx: &App) {
        self.search_query = self.subtitle_search.read(cx).value();
        let query = self.search_query.trim().to_lowercase();
        self.filtered = (!query.is_empty()).then(|| {
            self.segments
                .iter()
                .enumerate()
                .filter(|(_, row)| row.text.to_lowercase().contains(&query))
                .map(|(ix, _)| ix)
                .collect()
        });
        let rows = self.filtered.as_ref().map_or(self.segments.len(), Vec::len);
        self.list_state.reset(rows);
    }

    fn refresh_cached_models(picker: &Entity<ModelPicker>, cx: &mut Context<Self>) {
        let picker = picker.downgrade();
        let task = cx.background_spawn(async { transcription::cached_model_ids() });
        cx.spawn(async move |_, cx| {
            let cached = task.await;
            let _ = picker.update(cx, |picker, cx| picker.set_cached(cached, cx));
        })
        .detach();
    }

    fn pick_file(&mut self, cx: &mut Context<Self>) {
        let rx = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some(t(cx, "actionBar.fileDialog.mediaFiles")),
        });
        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(paths))) = rx.await {
                let _ = this.update(cx, |this, cx| this.accept_paths(&paths, cx));
            }
        })
        .detach();
    }

    /// Takes the first supported media file from a drop or the file picker.
    fn accept_paths(&mut self, paths: &[PathBuf], cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        match paths.iter().find(|p| is_supported_media(p)) {
            Some(path) => {
                self.file = Some(path.clone());
                self.drop_error = None;
                self.status.clear();
                self.set_source(Source::File);
            }
            None => {
                let name = paths
                    .first()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                self.drop_error = Some(format!("{name} isn't a supported audio or video file"));
            }
        }
        cx.notify();
    }

    fn set_source(&mut self, source: Source) {
        if self.source != source {
            self.prev_source = self.source;
            self.source = source;
            self.source_epoch += 1;
        }
    }

    fn start(&mut self, cx: &mut Context<Self>) {
        let Some(path) = self.file.clone() else {
            return;
        };
        if self.busy {
            return;
        }
        self.busy = true;
        self.model_picker.update(cx, |picker, cx| picker.set_disabled(true, cx));
        self.progress = 0;
        // Keep the list's row count in sync with `segments`; a stale count from
        // the previous run makes the list index past the end.
        self.segments.clear();
        self.list_state.reset(0);
        self.status = "Starting…".into();

        let cancel = Arc::new(AtomicBool::new(false));
        self.cancel = Some(cancel.clone());

        let (tx, mut rx) = futures::channel::mpsc::unbounded::<EngineEvent>();
        transcription::spawn_pipeline(
            path,
            SpikeOptions {
                model: self.model_picker.read(cx).selected().id.clone(),
                lang: LANGS[self.lang].1.to_string(),
                vad: self.vad,
                diarize: self.diarize,
                align: self.align,
            },
            tx,
            cancel,
        );

        cx.spawn(async move |this, cx| {
            while let Some(event) = rx.next().await {
                let is_final =
                    matches!(event, EngineEvent::Done { .. } | EngineEvent::Failed(_));
                if this
                    .update(cx, |view, cx| {
                        view.handle_event(event, cx);
                        cx.notify();
                    })
                    .is_err()
                {
                    break;
                }
                if is_final {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    fn cancel_run(&mut self, cx: &mut Context<Self>) {
        if let Some(cancel) = &self.cancel {
            cancel.store(true, Ordering::Relaxed);
            self.status = "Cancelling…".into();
            cx.notify();
        }
    }

    fn handle_event(&mut self, event: EngineEvent, cx: &mut Context<Self>) {
        if matches!(event, EngineEvent::Done { .. } | EngineEvent::Failed(_)) {
            self.model_picker.update(cx, |picker, cx| picker.set_disabled(false, cx));
            // A run may have downloaded the model.
            Self::refresh_cached_models(&self.model_picker, cx);
        }
        match event {
            EngineEvent::Progress { percent, label } => {
                self.progress = percent;
                self.status = format!("{label} — {percent}%");
            }
            EngineEvent::LiveSegment { index, row } => {
                if index < self.segments.len() {
                    self.segments[index] = row;
                    if self.filtered.is_none() {
                        self.list_state.splice(index..index + 1, 1);
                    }
                } else {
                    let ix = self.segments.len();
                    self.segments.push(row);
                    if self.filtered.is_none() {
                        self.list_state.splice(ix..ix, 1);
                    }
                }
                if self.filtered.is_some() {
                    self.apply_search(cx);
                }
            }
            EngineEvent::Done {
                language,
                elapsed,
                segments,
            } => {
                self.busy = false;
                self.cancel = None;
                self.progress = 100;
                self.segments = segments;
                self.apply_search(cx);
                self.status = format!(
                    "Done in {elapsed:.0}s — {} segments, language: {language}",
                    self.segments.len()
                );
            }
            EngineEvent::Failed(err) => {
                self.busy = false;
                self.cancel = None;
                self.status = format!("Failed: {err}");
            }
        }
    }
}

/// Test runs record copies instead of overwriting the real clipboard.
fn copy_to_clipboard(text: String, cx: &mut App) {
    #[cfg(feature = "screenshot")]
    if std::env::var_os("AUTOSUBS_SCREENSHOT_DIR").is_some() {
        screenshot::LAST_COPY.with(|c| *c.borrow_mut() = Some(text));
        return;
    }
    cx.write_to_clipboard(ClipboardItem::new_string(text));
}

fn fmt_time(secs: f64) -> String {
    let total = secs.max(0.) as u64;
    format!("{:02}:{:02}:{:02}", total / 3600, (total % 3600) / 60, total % 60)
}

/// "Speaker N" for a diarization id. Ids may be 0- or 1-based, so the base is
/// detected per transcript, matching the Tauri subtitle list.
fn speaker_label(id: &str, zero_based: bool, cx: &App) -> SharedString {
    let number = match id.trim().parse::<usize>() {
        Ok(n) => (if zero_based { n + 1 } else { n.max(1) }).to_string(),
        Err(_) => id.to_string(),
    };
    t_args(cx, "subtitles.speakerLabel", &[("number", &number)])
}

/// Numbered step badge, e.g. the blue "1" circle in the real app.
fn step_badge(n: usize) -> Div {
    div()
        .size(px(22.))
        .flex_none()
        .rounded_full()
        .bg(colors::accent_soft())
        .flex()
        .items_center()
        .justify_center()
        .text_xs()
        .font_weight(FontWeight::MEDIUM)
        .text_color(colors::accent_text())
        .child(n.to_string())
}

/// Row header: number badge + step title.
fn step_header(n: usize, title: SharedString) -> Div {
    div()
        .flex()
        .items_center()
        .gap_2()
        .child(step_badge(n))
        .child(
            div()
                .text_base()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(colors::text())
                .child(title),
        )
}

/// A settings row: step badge + label on the left, control on the right.
fn setting_row(n: usize, label: SharedString, control: impl IntoElement) -> Div {
    div()
        .h(px(60.))
        .flex()
        .items_center()
        .justify_between()
        .gap_2()
        .px_3()
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .flex_none()
                .child(step_badge(n))
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(colors::text())
                        .child(label),
                ),
        )
        .child(control)
}

/// Square icon button used in the header rows.
fn icon_button(id: &'static str, glyph: Svg, enabled: bool) -> Stateful<Div> {
    let base = div()
        .id(id)
        .size(px(28.))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(8.))
        .child(glyph.text_color(colors::text()));
    if enabled {
        base.cursor_pointer().hover(|s| s.bg(colors::control()))
    } else {
        base.opacity(0.4)
    }
}

/// Top strip of a pane. Doubles as the window's drag region since the native
/// titlebar is transparent.
fn pane_header(id: &'static str) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(50.))
        .flex_none()
        .flex()
        .items_center()
        .justify_between()
        .window_control_area(WindowControlArea::Drag)
        .on_mouse_down(MouseButton::Left, |event, window, _cx| {
            if event.click_count == 2 {
                window.titlebar_double_click();
            }
        })
}

impl SpikeView {
    fn render_titlebar(&self, cx: &mut Context<Self>) -> Stateful<Div> {
        pane_header("titlebar")
            // Leave room for the traffic lights.
            .pl(px(84.))
            .pr_3()
            .border_b_1()
            .border_color(colors::border())
            .child(
                div()
                    .id("integration")
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .px_1p5()
                    .py_1()
                    .rounded(px(8.))
                    .cursor_pointer()
                    .hover(|s| s.bg(colors::control()))
                    .child(
                        img(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                            .join("../../../public/davinci-resolve-logo.png"))
                        .size(px(18.)),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(colors::muted())
                            .child(t(cx, "titlebar.status.disconnected")),
                    )
                    .child(icon(IconName::ChevronDown).size(px(14.)).text_color(colors::muted())),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_0p5()
                    .child(icon_button("hdr-settings", icon(IconName::Settings), true)),
            )
    }

    fn render_source(&self, cx: &mut Context<Self>) -> Div {
        let view = cx.entity().downgrade();
        let index = |source| if source == Source::Timeline { 0 } else { 1 };

        div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap_3()
            .child(step_header(1, t(cx, "actionBar.source")))
            .child(
                SegmentedControl::new(
                    "source-mode",
                    index(self.source),
                    index(self.prev_source),
                    self.source_epoch,
                )
                .item(IconName::Monitor, t(cx, "actionBar.mode.timeline"))
                .item(IconName::Upload, t(cx, "actionBar.mode.fileInput"))
                .on_change(move |ix, _, cx| {
                    let _ = view.update(cx, |this, cx| {
                        this.set_source(if ix == 0 { Source::Timeline } else { Source::File });
                        cx.notify();
                    });
                }),
            )
            .child(self.render_drop_zone(cx))
            .when_some(self.drop_error.clone(), |el, err| {
                el.child(div().text_xs().text_color(colors::danger()).child(err))
            })
    }

    fn render_drop_zone(&self, cx: &mut Context<Self>) -> Stateful<Div> {
        // Any file dragged into the window lights the zone up; the drop itself
        // is handled window-wide in `render`.
        let dragging = cx.has_active_drag();
        let zone = div()
            .id("drop-zone")
            .flex_1()
            .min_h(px(150.))
            .p_4()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .rounded(px(14.))
            .border_1()
            .border_dashed()
            .border_color(colors::dashed())
            .bg(hsla(0., 0., 0., 0.01))
            .when(dragging, |el| {
                el.border_color(colors::accent()).bg(colors::accent_soft())
            });

        if self.source == Source::Timeline {
            return zone.child(
                div()
                    .text_sm()
                    .text_color(colors::muted())
                    .child(t(cx, "actionBar.tracks.createTrack")),
            );
        }

        let zone = zone.when(!self.busy, |el| {
            el.cursor_pointer()
                .hover(|s| s.border_color(colors::dashed_hover()).bg(hsla(0., 0., 0., 0.02)))
                .on_click(cx.listener(|this, _: &ClickEvent, _w, cx| this.pick_file(cx)))
        });

        match &self.file {
            Some(path) if !dragging => zone.child(file_summary(path)),
            _ => zone.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_3()
                    .child(
                        div()
                            .size(px(48.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_full()
                            .bg(hsla(0., 0., 0., 0.05))
                            .child(icon(IconName::Upload).size(px(22.)).text_color(if dragging {
                                colors::accent()
                            } else {
                                colors::text()
                            })),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .items_center()
                            .gap_1()
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(colors::text())
                                    .child(t(cx, "actionBar.fileDrop.prompt")),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(colors::muted())
                                    .child(t(cx, "actionBar.fileDrop.supports")),
                            ),
                    ),
            ),
        }
    }

    fn render_controls(&self, cx: &mut Context<Self>) -> Div {
        let hairline = || div().h(px(1.)).bg(colors::border());
        let view = cx.entity().downgrade();
        let disabled = self.busy;

        let select = |which: OpenSelect, options: Vec<SharedString>, selected: usize| {
            let (id, label) = match which {
                OpenSelect::Language => ("language", t(cx, "actionBar.language.title")),
            };
            SelectMenu::new(id, label)
                .options(options)
                .selected(selected)
                .open(self.open_select == Some(which))
                .disabled(disabled)
                .width(px(208.))
                .on_open_change({
                    let view = view.clone();
                    move |open, _, cx| {
                        let _ = view.update(cx, |this, cx| {
                            this.open_select = open.then_some(which);
                            cx.notify();
                        });
                    }
                })
                .on_select({
                    let view = view.clone();
                    move |ix, _, cx| {
                        let _ = view.update(cx, |this, cx| {
                            match which {
                                OpenSelect::Language => {
                                    this.lang = ix;
                                    this.model_picker.update(cx, |picker, cx| {
                                        picker.set_language(LANGS[ix].1, cx)
                                    });
                                }
                            }
                            cx.notify();
                        });
                    }
                })
        };

        let chip = |id: &'static str, icon: IconName, label: SharedString, pressed: bool, set: fn(&mut Self, bool)| {
            let view = view.clone();
            ToggleChip::new(id, icon, label)
                .pressed(pressed)
                .disabled(disabled)
                .on_change(move |next, _, cx| {
                    let _ = view.update(cx, |this, cx| {
                        set(this, next);
                        cx.notify();
                    });
                })
        };

        div()
            .flex_none()
            .rounded(px(14.))
            .border_1()
            .border_color(colors::border())
            .bg(colors::card())
            .flex()
            .flex_col()
            .child(setting_row(
                2,
                t(cx, "actionBar.language.title"),
                select(
                    OpenSelect::Language,
                    LANGS
                        .iter()
                        .map(|&(name, code)| match code {
                            "auto" => t(cx, "actionBar.common.auto"),
                            _ => name.into(),
                        })
                        .collect(),
                    self.lang,
                ),
            ))
            .child(hairline())
            .child(setting_row(3, t(cx, "actionBar.model"), self.model_picker.clone()))
            .child(hairline())
            .child(setting_row(
                4,
                t(cx, "actionBar.options"),
                div()
                    .flex()
                    .gap_1()
                    .child(chip("opt-vad", IconName::AudioLines, "VAD".into(), self.vad, |t, v| t.vad = v))
                    .child(chip("opt-diarize", IconName::Users, t(cx, "subtitles.speakers"), self.diarize, |t, v| {
                        t.diarize = v
                    }))
                    .child(chip("opt-align", IconName::WholeWord, "Align".into(), self.align, |t, v| {
                        t.align = v
                    })),
            ))

    }

    fn render_generate(&self, cx: &mut Context<Self>) -> Div {
        let can_generate =
            !self.busy && self.source == Source::File && self.file.is_some();

        let button = div()
            .id("generate")
            .h(px(40.))
            .rounded(px(12.))
            .flex()
            .items_center()
            .justify_center()
            .gap_2()
            .text_sm()
            .font_weight(FontWeight::MEDIUM)
            .text_color(colors::card());

        let button = if self.busy {
            button
                .bg(colors::danger())
                .cursor_pointer()
                .child(icon(IconName::X).text_color(colors::card()))
                .child(t(cx, "common.cancel"))
                .on_click(cx.listener(|this, _: &ClickEvent, _w, cx| this.cancel_run(cx)))
        } else {
            button
                .bg(colors::accent())
                .child(icon(IconName::CirclePlay).text_color(colors::card()))
                .child(t(cx, "common.generateSubtitles"))
                .map(|el| {
                    if can_generate {
                        el.cursor_pointer()
                            .hover(|s| s.opacity(0.9))
                            .on_click(cx.listener(|this, _: &ClickEvent, _w, cx| this.start(cx)))
                    } else {
                        el.opacity(0.5)
                    }
                })
        };

        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(button)
            .when(self.busy || !self.status.is_empty(), |el| {
                el.child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .when(self.busy, |el| {
                            el.child(
                                div()
                                    .w(px(64.))
                                    .flex_none()
                                    .h(px(4.))
                                    .rounded_full()
                                    .bg(colors::track())
                                    .child(
                                        div()
                                            .h_full()
                                            .rounded_full()
                                            .bg(colors::accent())
                                            .w(relative(self.progress.clamp(0, 100) as f32 / 100.)),
                                    ),
                            )
                        })
                        .child(
                            div()
                                .min_w_0()
                                .text_xs()
                                .text_color(colors::muted())
                                .truncate()
                                .child(self.status.clone()),
                        ),
                )
            })
    }

    fn render_left(&self, cx: &mut Context<Self>) -> Div {
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(colors::window())
            .child(self.render_titlebar(cx))
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .p(px(14.))
                    .child(self.render_source(cx))
                    .child(self.render_controls(cx))
                    .child(self.render_generate(cx)),
            )
    }

    fn render_subtitle_row(ix: usize, row: &SubtitleRow, zero_based: bool, cx: &App) -> Div {
        div()
            .w_full()
            .flex()
            .flex_col()
            .gap_2()
            .px_4()
            .py(px(14.))
            .border_b_1()
            .border_color(colors::border())
            .child(
                div()
                    .h(px(24.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_xs()
                            .font_family("Menlo")
                            .text_color(colors::text())
                            .child(fmt_time(row.start)),
                    )
                    .when_some(row.speaker.as_deref(), |el, id| {
                        el.child(
                            div()
                                .px_2()
                                .py_0p5()
                                .rounded_full()
                                .border_1()
                                .border_color(colors::border())
                                .bg(colors::card())
                                .text_xs()
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(colors::text())
                                .child(speaker_label(id, zero_based, cx)),
                        )
                    }),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(colors::text())
                    .cursor_text()
                    .child(
                        // Reading order lets a drag across rows select the rows in between.
                        SelectableText::new(("subtitle-text", ix), row.text.clone())
                            .document_order(ix as u64),
                    ),
            )
    }

    fn render_right(&self, window: &Window, cx: &mut Context<Self>) -> Div {
        let has_segments = !self.segments.is_empty();

        // Visual scrollbar metrics. max_offset = content_height - viewport_height.
        let max_off: f32 = self.list_state.max_offset_for_scrollbar().y.into();
        let scroll_off: f32 = -f32::from(self.list_state.scroll_px_offset_for_scrollbar().y);
        // The list sits between ~140px of chrome above (header, search, count
        // row) and the ~64px export footer.
        let list_h: f32 = (window.viewport_size().height - px(204.)).max(px(1.)).into();
        let overflows = has_segments && max_off > 1.;
        let thumb_frac = list_h / (list_h + max_off);
        let thumb_top = (list_h - list_h * thumb_frac) * (scroll_off / max_off).clamp(0., 1.);

        div()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .bg(colors::right_pane())
            .child(
                pane_header("subtitles-header")
                    .pl_4()
                    .pr_3()
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(colors::text())
                            .child(t(cx, "subtitles.title")),
                    )
                    .child(
                        div()
                            .flex()
                            .gap_1()
                            .child(icon_button("import", icon(IconName::FileUp), !self.busy))
                            .child(self.history.clone())
                            .child(
                                icon_button("clear", icon(IconName::X), has_segments && !self.busy).on_click(
                                    cx.listener(|this, _: &ClickEvent, _w, cx| {
                                        this.segments.clear();
                                        this.apply_search(cx);
                                        this.status.clear();
                                        this.progress = 0;
                                        cx.notify();
                                    }),
                                ),
                            ),
                    ),
            )
            .child(
                // Search bar; the replace icon is still a visual stand-in.
                div()
                    .id("subtitle-search")
                    .cursor_text()
                    .on_click({
                        let search = self.subtitle_search.clone();
                        move |_, window, cx| search.update(cx, |s, cx| s.focus(window, cx))
                    })
                    .mx_3()
                    .h(px(36.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap_2()
                    .px_3()
                    .rounded(px(10.))
                    .bg(colors::card())
                    .border_1()
                    .border_color(colors::border())
                    .child(icon(IconName::Search).text_color(colors::text()))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .text_sm()
                            .text_color(colors::text())
                            .child(Input::new(&self.subtitle_search)),
                    )
                    .child(icon(IconName::Repeat).size(px(15.)).text_color(colors::text())),
            )
            .child(
                // Subtitle count and reformat action.
                div()
                    .mt_2()
                    .h(px(40.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap_2()
                    .pl(px(18.))
                    .pr_2()
                    .border_b_1()
                    .border_color(colors::border())
                    .text_xs()
                    .child(
                        div()
                            .text_color(colors::text())
                            .child(match &self.filtered {
                                Some(matches) => {
                                    i18n::t_count(cx, "subtitles.status.matches", matches.len(), &[])
                                }
                                None => i18n::t_count(
                                    cx,
                                    "subtitles.status.count",
                                    self.segments.len(),
                                    &[],
                                ),
                            }),
                    )
                    .child(
                        div()
                            .id("reformat")
                            .h_7()
                            .px_2()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .rounded(px(8.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(if has_segments { colors::text() } else { colors::faint() })
                            .child(icon(IconName::TextWrap).size(px(14.)).text_color(if has_segments {
                                colors::text()
                            } else {
                                colors::faint()
                            }))
                            .child(t(cx, "subtitles.reformat"))
                            .when(has_segments, |el| {
                                el.cursor_pointer().hover(|s| s.bg(colors::control()))
                            }),
                    ),
            )
            .child(
                div()
                    .id("subtitle-list")
                    .key_context("SubtitleList")
                    .track_focus(&self.subtitle_list_focus)
                    .on_mouse_down(MouseButton::Left, {
                        let focus = self.subtitle_list_focus.clone();
                        move |_, window, cx| focus.focus(window, cx)
                    })
                    .on_action(|_: &CopySelection, window, cx| {
                        let text = TextSelection::selected_text(window, cx);
                        if !text.is_empty() {
                            copy_to_clipboard(text, cx);
                        }
                    })
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .relative()
                    .when(!has_segments, |el| {
                        el.items_center().justify_center().child(
                            div()
                                .text_sm()
                                .text_color(colors::muted())
                                .px_6()
                                .text_center()
                                .child(t(cx, "subtitles.empty.noSubtitlesAvailable")),
                        )
                    })
                    .when(has_segments, |el| {
                        let view = cx.entity();
                        el.child(
                            list(
                                self.list_state.clone(),
                                move |ix, _window, app| {
                                    let view = view.read(app);
                                    let zero_based =
                                        view.segments.iter().any(|r| r.speaker.as_deref() == Some("0"));
                                    let seg_ix = view.filtered.as_ref().map_or(Some(ix), |f| f.get(ix).copied());
                                    match seg_ix.and_then(|i| view.segments.get(i).map(|row| (i, row))) {
                                        Some((seg_ix, row)) => Self::render_subtitle_row(seg_ix, row, zero_based, app)
                                            .into_any_element(),
                                        None => div().into_any_element(),
                                    }
                                },
                            )
                            .flex_1()
                            .min_h_0(),
                        )
                    })
                    .when(overflows, |el| {
                        el.child(
                            // Visual-only scrollbar indicator; dragging the thumb
                            // needs scrollbar_drag_started/set_offset_from_scrollbar.
                            div()
                                .absolute()
                                .top(px(thumb_top + 4.))
                                .right(px(3.))
                                .w(px(5.))
                                .h(relative(thumb_frac * 0.97))
                                .rounded_full()
                                .bg(hsla(217. / 360., 0.91, 0.6, 0.35)),
                        )
                    }),
            )
            .child(
                div()
                    .flex_none()
                    .p_3()
                    .border_t_1()
                    .border_color(colors::border())
                    .child(
                        div()
                            .id("export")
                            .h(px(40.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap_2()
                            .rounded(px(12.))
                            .bg(colors::text())
                            .text_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(colors::card())
                            .child(icon(IconName::Download).text_color(colors::card()))
                            .child(t(cx, "importExport.exportTab"))
                            .map(|el| {
                                if has_segments && !self.busy {
                                    el.cursor_pointer().hover(|s| s.opacity(0.9))
                                } else {
                                    el.opacity(0.5)
                                }
                            }),
                    ),
            )
    }
}

/// Selected-file row: file glyph with an extension badge, name and full path.
fn file_summary(path: &Path) -> Div {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = extension(path).unwrap_or_default();
    let badge = if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        rgb(0x7c3aed)
    } else {
        rgb(0xdb2777)
    };

    div()
        .w_full()
        .flex()
        .items_center()
        .gap_3()
        .child(
            div()
                .relative()
                .size(px(40.))
                .flex_none()
                .child(icon(IconName::File).size(px(40.)).text_color(colors::faint()))
                .child(
                    div()
                        .absolute()
                        .left(px(-4.))
                        .bottom(px(5.))
                        .px(px(3.))
                        .rounded(px(3.))
                        .bg(badge)
                        .text_color(colors::card())
                        .text_size(px(9.))
                        .font_weight(FontWeight::BOLD)
                        .child(ext.to_uppercase()),
                ),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    div()
                        .truncate()
                        .text_sm()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(colors::text())
                        .child(name),
                )
                .child(
                    div()
                        .truncate()
                        .text_xs()
                        .text_color(colors::muted())
                        .child(path.to_string_lossy().into_owned()),
                ),
        )
}

impl SpikeView {
    fn render_split(&self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // After a drag, gpui-base pins every panel to a size and rescales them
        // together when the window resizes. Un-pinning the left column keeps
        // it flexible, so it alone grows and shrinks around the sidebar.
        self.split.update(cx, |split, cx| {
            if split.sizes().len() == 2 {
                split.reset_panel(0, cx);
            }
        });

        h_resizable("main-split")
            .with_state(&self.split)
            .with_handle_appearance(Rc::new(|handle: &ResizeHandleContext, _, _| {
                Some(
                    div()
                        .h_full()
                        .w(px(1.))
                        .bg(if handle.is_active() { colors::accent() } else { colors::border() })
                        .into_any_element(),
                )
            }))
            .child(
                // Zero basis: the left column only takes the space the sidebar
                // leaves, so a narrowing window shrinks the sidebar once the
                // left column is at its minimum, instead of clipping it.
                resizable_panel()
                    .size_range(px(390.)..Pixels::MAX)
                    .flex_basis(px(0.))
                    .child(self.render_left(cx)),
            )
            .child(
                resizable_panel()
                    .size(px(372.))
                    .size_range(px(300.)..px(620.))
                    .flex_grow_0()
                    .flex_shrink_1()
                    .child(self.render_right(window, cx)),
            )
    }
}

impl Render for SpikeView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.subtitle_search.read(cx).value() != self.search_query {
            self.apply_search(cx);
        }
        // Follow UI language switches for the search placeholder.
        let locale = i18n::locale(cx);
        if self.search_placeholder_locale != locale {
            self.search_placeholder_locale = locale;
            let placeholder = t(cx, "subtitles.searchPlaceholder");
            self.subtitle_search
                .update(cx, |search, cx| search.set_placeholder(placeholder, window, cx));
        }
        div()
            .flex()
            .size_full()
            .bg(colors::window())
            .text_color(colors::text())
            .child(TextSelectionLayer)
            // Selection state lives outside this view, so repaint while a drag
            // may be extending it; otherwise the cached frame shows a stale highlight.
            .on_mouse_move(cx.listener(|_, event: &MouseMoveEvent, _, cx| {
                if event.dragging() {
                    cx.notify();
                }
            }))
            .on_mouse_up(MouseButton::Left, cx.listener(|_, _: &MouseUpEvent, _, cx| cx.notify()))
            // Files can be dropped anywhere in the window, like the Tauri app.
            .on_drop(cx.listener(|this, paths: &ExternalPaths, _w, cx| {
                this.accept_paths(paths.paths(), cx)
            }))
            .child(self.render_split(window, cx))
    }
}
